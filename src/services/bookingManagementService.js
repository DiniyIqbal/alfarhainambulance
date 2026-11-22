// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// BOOKING MANAGEMENT SERVICE (Single Source of Truth)
// Handles multi-stage lifecycle, resource conflict checking, concurrency,
// customer-facing status mapping, idempotency, and in-app notifications.
// =========================================================================

import {
  getSupabaseClient,
  saveLocalBookingCache,
  broadcastSyncEvent,
  ensureGuestBookingToken,
  toBookingRow
} from './supabaseClient.js';

import {
  SERVICE_PACKAGES,
  getServicePackageById
} from '../data/pricingData.js';

import { calculateTransportFare } from './pricingService.js';

/**
 * Valid Customer-facing Status Mapping
 * Logically separates approval, resource assignment, and trip progress.
 */
export const CUSTOMER_STATUS = {
  MENUNGGU_KELULUSAN: {
    code: 'menunggu_kelulusan',
    label: 'Menunggu kelulusan',
    badgeClass: 'badge-amber',
    badgeBg: '#FEF3C7',
    badgeColor: '#92400E',
    icon: '⏳',
    stepIndex: 1,
    description: 'Permohonan tempahan anda telah dihantar dan sedang disemak oleh pegawai operasi HQ.'
  },
  DILULUSKAN_MENUNGGU_AGIHAN: {
    code: 'menunggu_agihan',
    label: 'Diluluskan / Menunggu agihan',
    badgeClass: 'badge-blue',
    badgeBg: '#DBEAFE',
    badgeColor: '#1E40AF',
    icon: '✓',
    stepIndex: 2,
    description: 'Tempahan disahkan. HQ sedang mengagihkan ambulans dan krew perubatan.'
  },
  DIJADUALKAN: {
    code: 'dijadualkan',
    label: 'Dijadualkan',
    badgeClass: 'badge-purple',
    badgeBg: '#EDE9FE',
    badgeColor: '#5B21B6',
    icon: '📅',
    stepIndex: 2,
    description: 'Tempahan dijadualkan mengikut tarikh dan masa yang telah dipersetujui.'
  },
  MENUJU_PENGAMBILAN: {
    code: 'menuju_pengambilan',
    label: 'Menuju pengambilan',
    badgeClass: 'badge-teal',
    badgeBg: '#CCFBF1',
    badgeColor: '#115E59',
    icon: '🚑',
    stepIndex: 3,
    description: 'Ambulans sedang dalam perjalanan ke lokasi pengambilan pesakit.'
  },
  TIBA_DI_PENGAMBILAN: {
    code: 'tiba_pengambilan',
    label: 'Tiba di pengambilan',
    badgeClass: 'badge-cyan',
    badgeBg: '#E0F2FE',
    badgeColor: '#075985',
    icon: '📍',
    stepIndex: 3,
    description: 'Ambulans telah tiba di lokasi. Krew sedang menstabilkan pesakit.'
  },
  MENUJU_DESTINASI: {
    code: 'menuju_destinasi',
    label: 'Menuju destinasi',
    badgeClass: 'badge-indigo',
    badgeBg: '#E0E7FF',
    badgeColor: '#3730A3',
    icon: '🏥',
    stepIndex: 4,
    description: 'Ambulans sedang membawa pesakit menuju ke fasiliti perubatan.'
  },
  SELESAI: {
    code: 'selesai',
    label: 'Selesai',
    badgeClass: 'badge-emerald',
    badgeBg: '#D1FAE5',
    badgeColor: '#065F46',
    icon: '🏁',
    stepIndex: 5,
    description: 'Perjalanan telah selesai dan pesakit diserahkan dengan selamat.'
  },
  DITOLAK: {
    code: 'ditolak',
    label: 'Ditolak',
    badgeClass: 'badge-rose',
    badgeBg: '#FFE4E6',
    badgeColor: '#9F1239',
    icon: '✕',
    stepIndex: 0,
    description: 'Permohonan tidak dapat dipenuhi atas sebab operasi atau liputan.'
  },
  DIBATALKAN: {
    code: 'dibatalkan',
    label: 'Dibatalkan',
    badgeClass: 'badge-slate',
    badgeBg: '#F1F5F9',
    badgeColor: '#475569',
    icon: '🚫',
    stepIndex: 0,
    description: 'Tempahan ini telah dibatalkan.'
  }
};

/**
 * Derives the single unified customer-facing status object from internal state fields.
 * @param {Object} booking
 * @returns {Object} CUSTOMER_STATUS entry
 */
export function deriveCustomerStatus(booking) {
  if (!booking) return CUSTOMER_STATUS.MENUNGGU_KELULUSAN;

  const bStatus = (booking.booking_status || booking.bookingStatus || '').toLowerCase().trim();
  const aStatus = (booking.assignment_status || booking.assignmentStatus || '').toLowerCase().trim();
  const tStatus = (booking.trip_status || booking.tripStatus || booking.status || '').toLowerCase().trim();
  const isSched = Boolean(booking.is_scheduled || booking.isScheduled);

  // 1. Rejected or Cancelled Terminal States
  if (bStatus === 'rejected' || tStatus === 'rejected' || tStatus === 'ditolak') {
    return CUSTOMER_STATUS.DITOLAK;
  }
  if (bStatus === 'cancelled' || tStatus === 'cancelled' || tStatus === 'dibatalkan') {
    return CUSTOMER_STATUS.DIBATALKAN;
  }

  // 2. Pending Admin Review
  if (bStatus === 'pending_approval' || bStatus === 'menunggu kelulusan' || (!bStatus && tStatus === 'pending')) {
    return CUSTOMER_STATUS.MENUNGGU_KELULUSAN;
  }

  // 3. Approved States
  if (bStatus === 'approved' || bStatus === 'diluluskan' || !bStatus) {
    // 3a. Trip actively en route or completed
    if (tStatus === 'completed' || tStatus === 'selesai' || tStatus === 'arrived') {
      return CUSTOMER_STATUS.SELESAI;
    }
    if (tStatus === 'en_route_destination' || tStatus === 'in transit' || tStatus === 'menuju destinasi' || tStatus === 'menuju hospital') {
      return CUSTOMER_STATUS.MENUJU_DESTINASI;
    }
    if (tStatus === 'arrived_pickup' || tStatus === 'on scene' || tStatus === 'tiba di pengambilan' || tStatus === 'di lokasi') {
      return CUSTOMER_STATUS.TIBA_DI_PENGAMBILAN;
    }
    if (tStatus === 'en_route_pickup' || tStatus === 'dispatched' || tStatus === 'menuju pengambilan' || tStatus === 'menuju lokasi') {
      return CUSTOMER_STATUS.MENUJU_PENGAMBILAN;
    }

    // 3b. Before trip starts: Assigned vs Awaiting Assignment vs Scheduled
    if (aStatus === 'unassigned' || !booking.plate_number) {
      return CUSTOMER_STATUS.DILULUSKAN_MENUNGGU_AGIHAN;
    }

    if (isSched) {
      return CUSTOMER_STATUS.DIJADUALKAN;
    }

    return CUSTOMER_STATUS.DILULUSKAN_MENUNGGU_AGIHAN;
  }

  return CUSTOMER_STATUS.MENUNGGU_KELULUSAN;
}

/**
 * Generates or checks an Idempotency Key for booking submission to prevent duplicates.
 */
export function generateIdempotencyKey({ email, hubId, pickupCoords, scheduledTime }) {
  const coordKey = Array.isArray(pickupCoords)
    ? `${pickupCoords[0].toFixed(4)}_${pickupCoords[1].toFixed(4)}`
    : 'coords';
  const timeKey = scheduledTime ? new Date(scheduledTime).toISOString().slice(0, 16) : 'asap';
  const cleanEmail = (email || 'demo').toLowerCase().trim();
  return `idemp_${cleanEmail}_${hubId}_${coordKey}_${timeKey}`;
}

/**
 * Checks for resource assignment conflicts.
 * Evaluates active mission state & scheduled intervals with a 30-minute turnaround buffer.
 */
export function checkResourceConflicts({
  vehiclePlate,
  driverId,
  driverName,
  scheduledTime = null,
  durationMin = 60,
  excludeBookingId = null,
  allBookings = []
}) {
  const bufferMs = 30 * 60 * 1000; // 30-minute operational buffer
  const targetStartTime = scheduledTime ? new Date(scheduledTime).getTime() : Date.now();
  const targetEndTime = targetStartTime + (durationMin * 60 * 1000) + bufferMs;

  for (const b of allBookings) {
    const bId = b.id || b.invoice_number || b.invoiceNumber;
    if (excludeBookingId && bId === excludeBookingId) continue;

    const bCustStatus = deriveCustomerStatus(b);
    if (bCustStatus.code === 'selesai' || bCustStatus.code === 'ditolak' || bCustStatus.code === 'dibatalkan') {
      continue;
    }

    const bPlate = b.plate_number || b.plateNumber;
    const bDriver = b.driver_name || b.driverName;
    const bDriverId = b.assigned_driver_id || b.assignedDriverId;

    const vehicleMatches = vehiclePlate && bPlate && vehiclePlate.toUpperCase().trim() === bPlate.toUpperCase().trim();
    const driverMatches = (driverId && bDriverId && driverId === bDriverId) ||
      (driverName && bDriver && driverName.toLowerCase().trim() === bDriver.toLowerCase().trim());

    if (!vehicleMatches && !driverMatches) continue;

    // If booking is currently active on the road, it's an immediate conflict
    const isActiveTrip = ['menuju_pengambilan', 'tiba_pengambilan', 'menuju_destinasi'].includes(bCustStatus.code);
    if (isActiveTrip) {
      if (vehicleMatches) {
        return {
          hasConflict: true,
          conflictingBooking: b,
          reason: `Ambulans ${vehiclePlate} sedang dalam perjalanan bagi tugasan aktif (${b.invoice_number || b.invoiceNumber}).`
        };
      }
      if (driverMatches) {
        return {
          hasConflict: true,
          conflictingBooking: b,
          reason: `Pemandu ${driverName || bDriver} sedang mengendalikan tugasan aktif (${b.invoice_number || b.invoiceNumber}).`
        };
      }
    }

    // Check scheduled overlapping time window
    const bTime = b.scheduled_time || b.scheduledTime || b.created_at;
    const bStart = bTime ? new Date(bTime).getTime() : Date.now();
    const bDuration = Number(b.duration_min || b.durationMin || 60);
    const bEnd = bStart + (bDuration * 60 * 1000) + bufferMs;

    // Overlap condition: (targetStartTime < bEnd) && (targetEndTime > (bStart - bufferMs))
    if (targetStartTime < bEnd && targetEndTime > (bStart - bufferMs)) {
      const entity = vehicleMatches ? `Ambulans ${vehiclePlate}` : `Pemandu ${driverName || bDriver}`;
      return {
        hasConflict: true,
        conflictingBooking: b,
        reason: `${entity} mempunyai pertindihan jadual dengan tugasan ${b.invoice_number || b.invoiceNumber} (${new Date(bStart).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}). Sila benarkan penimbal 30 minit.`
      };
    }
  }

  return { hasConflict: false, reason: null };
}

/**
 * Validates and Prepares a New Booking Payload.
 * Idempotently creates or returns existing booking, saving immutable snapshots.
 */
export async function createPatientBooking(bookingInput, allBookings = []) {
  const errors = [];

  // Fallback to locally cached bookings if caller did not supply full list
  if (!allBookings || allBookings.length === 0) {
    try {
      if (typeof localStorage !== 'undefined') {
        const cached = JSON.parse(localStorage.getItem('amc_local_bookings') || '[]');
        if (Array.isArray(cached) && cached.length > 0) {
          allBookings = cached;
        }
      }
    } catch (_) {}
  }

  if (!bookingInput.originName && !bookingInput.pickupName && !bookingInput.pickupAddress) {
    errors.push('Lokasi pengambilan pesakit adalah wajib.');
  }
  if (!bookingInput.destinationName) {
    errors.push('Pusat perubatan tujuan (destinasi) adalah wajib.');
  }
  if (!bookingInput.pickupCoords) {
    errors.push('Sila sahkan titik koordinat lokasi pengambilan pada peta.');
  }
  if (!bookingInput.patientName || !bookingInput.patientPhone) {
    errors.push('Nama dan nombor telefon pesakit / waris adalah wajib.');
  }

  const isScheduledBooking = Boolean(bookingInput.isScheduled || bookingInput.is_scheduled);
  const scheduledTimeValue = bookingInput.scheduledTime || bookingInput.scheduled_time;

  if (isScheduledBooking && scheduledTimeValue) {
    const schedDate = new Date(scheduledTimeValue);
    if (isNaN(schedDate.getTime())) {
      errors.push('Format tarikh dan masa jadual tidak sah.');
    } else if (schedDate.getTime() < Date.now() - (5 * 60 * 1000)) {
      errors.push('Masa jadual perjalanan tidak boleh pada waktu lampau.');
    }
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join(' ') };
  }

  // Idempotency Check
  const key = bookingInput.idempotencyKey || generateIdempotencyKey({
    email: bookingInput.patientEmail,
    hubId: bookingInput.hubId,
    pickupCoords: bookingInput.pickupCoords,
    scheduledTime: scheduledTimeValue
  });

  const existing = (allBookings || []).find(b => b.idempotency_key === key || b.idempotencyKey === key);
  if (existing) {
    return {
      success: true,
      isDuplicate: true,
      data: existing,
      message: 'Tempahan sedia ada ditemui (perlindungan idempotensi).'
    };
  }

  // Build immutable snapshots
  const pkg = bookingInput.packageSnapshot || getServicePackageById(bookingInput.packageId) || SERVICE_PACKAGES[0];
  const packageSnapshot = {
    id: pkg.id,
    code: pkg.code || pkg.id,
    version: pkg.version || 1,
    name: pkg.name,
    baseFare: Number(pkg.baseFare || pkg.base_price || 250.00),
    exampleCases: pkg.exampleCases || pkg.example_cases || '',
    includedEquipment: [...(pkg.includedEquipment || [])],
    includedStaff: [...(pkg.includedStaff || [])]
  };

  const isEventStandby = Boolean(bookingInput.isEventStandby || bookingInput.is_event_standby);
  const standbyHours = Number(bookingInput.standbyHours || bookingInput.standby_hours || 4);
  const standbyEventName = bookingInput.standbyEventName || bookingInput.standby_event_name || '';

  const baseFareValue = bookingInput.baseFare !== undefined
    ? Number(bookingInput.baseFare)
    : Number(packageSnapshot.baseFare);

  const totalFareValue = bookingInput.totalFare !== undefined
    ? Number(bookingInput.totalFare)
    : baseFareValue;

  const pricingSnapshot = {
    distanceKm: Number(bookingInput.distanceKm || (isEventStandby ? 0 : 25.0)),
    baseFare: baseFareValue,
    extraKmCost: Number(bookingInput.extraKmCost || 0.00),
    assistanceCost: Number(bookingInput.assistanceCost || 0.00),
    equipmentCost: Number(bookingInput.equipmentCost || 0.00),
    miscFee: 0.00,
    totalFare: totalFareValue,
    calculatedAt: new Date().toISOString()
  };

  const routeSnapshot = {
    originName: bookingInput.originName || bookingInput.pickupName,
    pickupAddress: bookingInput.pickupAddress || bookingInput.originName,
    pickupCategory: bookingInput.pickupCategory || 'Rumah / Kediaman',
    pickupCoords: bookingInput.pickupCoords,
    pickupConfirmedCoords: bookingInput.pickupConfirmedCoords || bookingInput.pickupCoords,
    pickupInstructions: bookingInput.pickupInstructions || '',
    destinationName: bookingInput.destinationName,
    destinationAddress: bookingInput.destinationAddress || bookingInput.destinationName,
    destinationCoords: bookingInput.destinationCoords || null,
    stop4Type: bookingInput.stop4Type || null,
    stop4Name: bookingInput.stop4Name || null,
    stop4Address: bookingInput.stop4Address || null,
    stop4Coords: bookingInput.stop4Coords || null,
    totalDistanceKm: Number(pricingSnapshot.distanceKm)
  };

  const invoiceNumber = bookingInput.invoiceNumber || `AMC-${Date.now().toString().slice(-4)}`;

  const tripTypeDerived = bookingInput.tripType || (isEventStandby
    ? `Ambulance Standby (Event - ${standbyHours} Jam)`
    : packageSnapshot.name);

  const newBooking = {
    id: bookingInput.id || undefined,
    invoice_number: invoiceNumber,
    // Secret that lets this browser track the booking without an account.
    guest_access_token: bookingInput.guestAccessToken || ensureGuestBookingToken(invoiceNumber) || undefined,
    invoiceNumber: invoiceNumber,
    hub_id: bookingInput.hubId || 'kok_lanas',
    hub_name: bookingInput.hubName || 'HQ Pusat Rawatan Al-Farhain',
    origin_name: routeSnapshot.originName,
    originName: routeSnapshot.originName,
    destination_name: routeSnapshot.destinationName,
    destinationName: routeSnapshot.destinationName,
    distance_km: pricingSnapshot.distanceKm,
    distanceKm: pricingSnapshot.distanceKm,
    trip_type: tripTypeDerived,
    tripType: tripTypeDerived,
    base_fare: pricingSnapshot.baseFare,
    baseFare: pricingSnapshot.baseFare,
    extra_km_cost: pricingSnapshot.extraKmCost,
    extraKmCost: pricingSnapshot.extraKmCost,
    assistance_package: packageSnapshot.includedStaff.join(', ') || 'Pemandu Sahaja',
    assistance_cost: pricingSnapshot.assistanceCost,
    equipment_items: packageSnapshot.includedEquipment.join(', ') || 'Tiada Tambahan',
    equipment_cost: pricingSnapshot.equipmentCost,
    misc_fee: pricingSnapshot.miscFee,
    total_fare: pricingSnapshot.totalFare,
    totalFare: pricingSnapshot.totalFare,
    is_diesel_surge: false,

    // Event standby metadata
    is_event_standby: isEventStandby,
    isEventStandby: isEventStandby,
    standby_hours: standbyHours,
    standbyHours: standbyHours,
    standby_event_name: standbyEventName,
    standbyEventName: standbyEventName,

    // Initial Decoupled State: unassigned & pending approval
    booking_status: 'pending_approval',
    assignment_status: 'unassigned',
    trip_status: 'not_started',
    status: 'Menunggu kelulusan', // backward compatibility

    // Resources intentionally left blank until admin assignment
    plate_number: '',
    driver_name: '',
    assigned_provider_id: null,
    assigned_provider_name: 'Al-Farhain AMC',
    assigned_vehicle_id: null,
    assigned_driver_id: null,
    assigned_crew: [],

    is_scheduled: isScheduledBooking,
    isScheduled: isScheduledBooking,
    scheduled_time: scheduledTimeValue ? new Date(scheduledTimeValue).toISOString() : null,
    scheduledTime: scheduledTimeValue ? new Date(scheduledTimeValue).toISOString() : null,

    patient_name: bookingInput.patientName,
    patientName: bookingInput.patientName,
    patient_phone: bookingInput.patientPhone,
    patientPhone: bookingInput.patientPhone,
    patient_email: bookingInput.patientEmail || '',
    patientEmail: bookingInput.patientEmail || '',
    patient_notes: bookingInput.patientNotes || '',

    pickup_category: routeSnapshot.pickupCategory,
    pickup_instructions: routeSnapshot.pickupInstructions,
    pickup_coordinates: routeSnapshot.pickupCoords,
    pickup_confirmed_coords: routeSnapshot.pickupConfirmedCoords,
    destination_coordinates: routeSnapshot.destinationCoords,

    stop4_type: routeSnapshot.stop4Type,
    stop4_name: routeSnapshot.stop4Name,
    stop4_address: routeSnapshot.stop4Address,
    stop4_coordinates: routeSnapshot.stop4Coords,

    package_id: packageSnapshot.id,
    package_code: packageSnapshot.code,
    package_name: packageSnapshot.name,
    package_snapshot: packageSnapshot,
    pricing_snapshot: pricingSnapshot,
    route_snapshot: routeSnapshot,

    payment_status: bookingInput.paymentStatus || 'unpaid',
    payment_method: bookingInput.paymentMethod || 'cash',
    idempotency_key: key,

    version: 1,
    audit_trail: [
      {
        action: 'SUBMITTED',
        actor: bookingInput.patientName || 'Pelanggan',
        actorEmail: bookingInput.patientEmail || '',
        timestamp: new Date().toISOString(),
        notes: 'Permohonan tempahan baharu dihantar melalui aplikasi mudah alih.'
      }
    ],

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Save to local cache & broadcast
  saveLocalBookingCache(newBooking);
  broadcastSyncEvent('INSERT_BOOKING', newBooking);

  // In-App Notifications: To Admin and Customer
  createInAppNotification({
    bookingId: newBooking.id,
    bookingRef: newBooking.invoice_number,
    recipientEmail: 'admin@alfarhain.my',
    recipientRole: 'admin',
    title: 'Tempahan Baharu Diterima',
    message: `Tempahan ${newBooking.invoice_number} oleh ${newBooking.patient_name} (${newBooking.package_name}) sedia untuk semakan kelulusan.`,
    notificationType: 'BOOKING_SUBMITTED'
  });

  if (newBooking.patient_email) {
    createInAppNotification({
      bookingId: newBooking.id,
      bookingRef: newBooking.invoice_number,
      recipientEmail: newBooking.patient_email,
      recipientRole: 'customer',
      title: 'Permohonan Tempahan Dihantar',
      message: `Permohonan tempahan ${newBooking.invoice_number} sedang disemak oleh HQ. Kami akan memaklumkan status kelulusan anda sebentar lagi.`,
      notificationType: 'BOOKING_SUBMITTED'
    });
  }

  // Push to Supabase if available
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      // Only real snake_case columns are sent (the camelCase aliases above are
      // for the UI). No .select(): guests have no read access under RLS; the
      // database trigger assigns ownership and the initial statuses.
      const { error } = await supabase
        .from('ambulance_bookings')
        .insert([toBookingRow(newBooking)]);

      if (!error) {
        return { success: true, data: newBooking };
      }
      console.error('Supabase booking insert failed (kept locally):', error.message);
    } catch (e) {
      console.warn('Supabase booking creation notice (persisted locally):', e.message);
    }
  }

  return { success: true, offline: true, data: newBooking };
}

/**
 * Admin: Approve Booking Request
 * Accepts the booking request (does NOT mean payment received or driver travelling).
 * Uses optimistic concurrency check.
 */
export async function approveBookingRequest({
  booking,
  adminUser = { name: 'Pegawai Operasi HQ', email: 'pengurus@alfarhain.my' },
  expectedVersion = null
}) {
  if (!booking) return { success: false, error: 'Tempahan tidak ditemui.' };

  const currentVersion = Number(booking.version || 1);
  if (expectedVersion !== null && currentVersion !== Number(expectedVersion)) {
    return {
      success: false,
      error: 'Konflik kemas kini: Rekod ini telah diubah suai oleh pentadbir lain. Sila muat semula halaman.'
    };
  }

  const updatedBooking = {
    ...booking,
    booking_status: 'approved',
    assignment_status: booking.plate_number ? 'assigned' : 'unassigned',
    status: 'Diluluskan / Menunggu agihan',
    approved_by: adminUser.name || 'Pegawai Operasi HQ',
    approved_at: new Date().toISOString(),
    version: currentVersion + 1,
    audit_trail: [
      ...(booking.audit_trail || []),
      {
        action: 'APPROVED',
        actor: adminUser.name,
        actorEmail: adminUser.email,
        timestamp: new Date().toISOString(),
        notes: 'Permohonan tempahan diluluskan oleh HQ. Sedia untuk agihan sumber.'
      }
    ],
    updated_at: new Date().toISOString()
  };

  saveLocalBookingCache(updatedBooking);
  broadcastSyncEvent('UPDATE_BOOKING', updatedBooking);

  createInAppNotification({
    bookingId: updatedBooking.id,
    bookingRef: updatedBooking.invoice_number,
    recipientEmail: updatedBooking.patient_email,
    recipientRole: 'customer',
    title: 'Tempahan Diluluskan',
    message: `Tempahan ${updatedBooking.invoice_number} telah disahkan oleh HQ. Skuad ambulans sedang diagihkan. Anda boleh membayar dalam talian di Profil > Rekod Perkhidmatan, atau bayar tunai semasa ambulans tiba.`,
    notificationType: 'BOOKING_APPROVED'
  });

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from('ambulance_bookings')
        .update({
          booking_status: updatedBooking.booking_status,
          assignment_status: updatedBooking.assignment_status,
          status: updatedBooking.status,
          approved_by: updatedBooking.approved_by,
          approved_at: updatedBooking.approved_at,
          version: updatedBooking.version,
          audit_trail: updatedBooking.audit_trail,
          updated_at: updatedBooking.updated_at
        })
        .eq('invoice_number', updatedBooking.invoice_number);
    } catch (e) {
      console.warn('Notice syncing approval to Supabase:', e.message);
    }
  }

  return { success: true, data: updatedBooking };
}

/**
 * Admin: Reject Booking Request
 * Requires rejection reason, confirms action, records admin actor and timestamp.
 */
export async function rejectBookingRequest({
  booking,
  reason,
  adminUser = { name: 'Pegawai Operasi HQ', email: 'pengurus@alfarhain.my' },
  expectedVersion = null
}) {
  if (!booking) return { success: false, error: 'Tempahan tidak ditemui.' };
  if (!reason || !reason.trim()) {
    return { success: false, error: 'Sebab penolakan tempahan adalah wajib diisi.' };
  }

  const currentVersion = Number(booking.version || 1);
  if (expectedVersion !== null && currentVersion !== Number(expectedVersion)) {
    return {
      success: false,
      error: 'Konflik kemas kini: Rekod ini telah diubah suai oleh pentadbir lain. Sila muat semula halaman.'
    };
  }

  const updatedBooking = {
    ...booking,
    booking_status: 'rejected',
    trip_status: 'not_started',
    status: 'Ditolak',
    rejection_reason: reason.trim(),
    rejected_by: adminUser.name || 'Pegawai Operasi HQ',
    rejected_at: new Date().toISOString(),
    version: currentVersion + 1,
    audit_trail: [
      ...(booking.audit_trail || []),
      {
        action: 'REJECTED',
        actor: adminUser.name,
        actorEmail: adminUser.email,
        timestamp: new Date().toISOString(),
        reason: reason.trim()
      }
    ],
    updated_at: new Date().toISOString()
  };

  saveLocalBookingCache(updatedBooking);
  broadcastSyncEvent('UPDATE_BOOKING', updatedBooking);

  createInAppNotification({
    bookingId: updatedBooking.id,
    bookingRef: updatedBooking.invoice_number,
    recipientEmail: updatedBooking.patient_email,
    recipientRole: 'customer',
    title: 'Permohonan Tempahan Tidak Dapat Dipenuhi',
    message: `Permohonan tempahan ${updatedBooking.invoice_number} tidak dapat dipenuhi: ${reason.trim()}`,
    notificationType: 'BOOKING_REJECTED'
  });

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from('ambulance_bookings')
        .update({
          booking_status: updatedBooking.booking_status,
          status: updatedBooking.status,
          rejection_reason: updatedBooking.rejection_reason,
          rejected_by: updatedBooking.rejected_by,
          rejected_at: updatedBooking.rejected_at,
          version: updatedBooking.version,
          audit_trail: updatedBooking.audit_trail,
          updated_at: updatedBooking.updated_at
        })
        .eq('invoice_number', updatedBooking.invoice_number);
    } catch (e) {
      console.warn('Notice syncing rejection to Supabase:', e.message);
    }
  }

  return { success: true, data: updatedBooking };
}

/**
 * Admin: Assign or Reassign Resources (Ambulance, Driver, Crew, Provider)
 * Performs conflict checking, atomic assignment, and updates driver task list.
 */
export async function assignBookingResources({
  booking,
  provider = { id: null, name: 'Al-Farhain AMC' },
  vehicle,
  driver,
  crew = [],
  reassignmentReason = '',
  adminUser = { name: 'Pegawai Operasi HQ', email: 'pengurus@alfarhain.my' },
  allBookings = []
}) {
  if (!booking) return { success: false, error: 'Tempahan tidak ditemui.' };
  if (!vehicle || !vehicle.plateNumber) {
    return { success: false, error: 'Sila pilih ambulans yang sah dan aktif.' };
  }
  if (!driver || !driver.name) {
    return { success: false, error: 'Sila pilih pemandu bertugas.' };
  }

  // Conflict Check
  const conflict = checkResourceConflicts({
    vehiclePlate: vehicle.plateNumber,
    driverId: driver.id || null,
    driverName: driver.name,
    scheduledTime: booking.scheduled_time || booking.scheduledTime,
    durationMin: 60,
    excludeBookingId: booking.id || booking.invoice_number,
    allBookings
  });

  if (conflict.hasConflict) {
    return { success: false, error: conflict.reason };
  }

  const isReassignment = Boolean(booking.plate_number && booking.plate_number !== vehicle.plateNumber);
  const oldResources = isReassignment ? {
    plate: booking.plate_number,
    driver: booking.driver_name,
    provider: booking.assigned_provider_name
  } : null;

  const currentVersion = Number(booking.version || 1);

  const updatedBooking = {
    ...booking,
    booking_status: 'approved',
    assignment_status: 'assigned',
    assigned_provider_id: provider.id || null,
    assigned_provider_name: provider.name || 'Al-Farhain AMC',
    assigned_vehicle_id: vehicle.id || null,
    plate_number: vehicle.plateNumber,
    assigned_driver_id: driver.id || null,
    driver_name: driver.name,
    contact_phone: driver.phone || booking.contact_phone || '013-914 7606',
    assigned_crew: Array.isArray(crew) ? crew : [],
    status: 'Dispatched',
    assigned_by: adminUser.name,
    assigned_at: new Date().toISOString(),
    version: currentVersion + 1,
    audit_trail: [
      ...(booking.audit_trail || []),
      {
        action: isReassignment ? 'REASSIGNED' : 'ASSIGNED',
        actor: adminUser.name,
        actorEmail: adminUser.email,
        timestamp: new Date().toISOString(),
        oldResources,
        newResources: { plate: vehicle.plateNumber, driver: driver.name, provider: provider.name },
        reason: reassignmentReason || 'Agihan sumber oleh pusat operasi HQ.'
      }
    ],
    updated_at: new Date().toISOString()
  };

  saveLocalBookingCache(updatedBooking);
  broadcastSyncEvent('UPDATE_BOOKING', updatedBooking);

  // Notify assigned driver
  createInAppNotification({
    bookingId: updatedBooking.id,
    bookingRef: updatedBooking.invoice_number,
    recipientEmail: driver.email || driver.phone || 'driver@alfarhain.my',
    recipientRole: 'driver',
    title: 'Tugasan Baharu Diagihkan',
    message: `Anda ditugaskan bagi tempahan ${updatedBooking.invoice_number} (${updatedBooking.origin_name} → ${updatedBooking.destination_name}). Kenderaan: ${vehicle.plateNumber}.`,
    notificationType: 'TASK_ASSIGNED'
  });

  // Notify customer
  createInAppNotification({
    bookingId: updatedBooking.id,
    bookingRef: updatedBooking.invoice_number,
    recipientEmail: updatedBooking.patient_email,
    recipientRole: 'customer',
    title: 'Ambulans & Krew Diagihkan',
    message: `Ambulans ${vehicle.plateNumber} bersama ${driver.name} telah diagihkan untuk tempahan anda.`,
    notificationType: 'RESOURCES_ASSIGNED'
  });

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from('ambulance_bookings')
        .update({
          assignment_status: updatedBooking.assignment_status,
          assigned_provider_id: updatedBooking.assigned_provider_id,
          assigned_provider_name: updatedBooking.assigned_provider_name,
          assigned_vehicle_id: updatedBooking.assigned_vehicle_id,
          plate_number: updatedBooking.plate_number,
          assigned_driver_id: updatedBooking.assigned_driver_id,
          driver_name: updatedBooking.driver_name,
          contact_phone: updatedBooking.contact_phone,
          assigned_crew: updatedBooking.assigned_crew,
          status: updatedBooking.status,
          assigned_by: updatedBooking.assigned_by,
          assigned_at: updatedBooking.assigned_at,
          version: updatedBooking.version,
          audit_trail: updatedBooking.audit_trail,
          updated_at: updatedBooking.updated_at
        })
        .eq('invoice_number', updatedBooking.invoice_number);
    } catch (e) {
      console.warn('Notice syncing assignment to Supabase:', e.message);
    }
  }

  return { success: true, data: updatedBooking };
}

/**
 * Driver / Admin: Update Trip Progress
 * Enforces valid transition pipeline:
 * not_started -> en_route_pickup -> arrived_pickup -> en_route_destination -> completed.
 * Respects return-trip workflow before completing.
 */
export async function updateTripProgress({
  booking,
  nextTripStatus,
  actor = { name: 'Pemandu Bertugas', role: 'driver' },
  notes = '',
  hasReturnTrip = false,
  returnCompleted = false
}) {
  if (!booking) return { success: false, error: 'Tempahan tidak ditemui.' };

  const validSequence = {
    not_started: ['en_route_pickup'],
    en_route_pickup: ['arrived_pickup'],
    arrived_pickup: ['en_route_destination'],
    en_route_destination: ['completed']
  };

  const currentStatus = (booking.trip_status || 'not_started').toLowerCase();
  const allowed = validSequence[currentStatus] || [];

  if (!allowed.includes(nextTripStatus) && nextTripStatus !== currentStatus) {
    return {
      success: false,
      error: `Peralihan status tidak sah: Tidak boleh beralih dari '${currentStatus}' terus ke '${nextTripStatus}'.`
    };
  }

  // Multi-destination check: Cannot mark completed at first destination if return trip pending
  if (nextTripStatus === 'completed' && hasReturnTrip && !returnCompleted) {
    return {
      success: false,
      error: 'Tugasan ini mempunyai pusingan hantar pulang (dua hala). Sila lengkapkan perjalanan pulang sebelum menandakan selesai.'
    };
  }

  const legacyStatusMap = {
    en_route_pickup: 'Menuju lokasi',
    arrived_pickup: 'Di lokasi',
    en_route_destination: 'Menuju hospital',
    completed: 'Selesai'
  };

  const currentVersion = Number(booking.version || 1);
  const updatedBooking = {
    ...booking,
    trip_status: nextTripStatus,
    status: legacyStatusMap[nextTripStatus] || nextTripStatus,
    completed_at: nextTripStatus === 'completed' ? new Date().toISOString() : booking.completed_at,
    version: currentVersion + 1,
    audit_trail: [
      ...(booking.audit_trail || []),
      {
        action: `TRIP_${nextTripStatus.toUpperCase()}`,
        actor: actor.name,
        actorRole: actor.role,
        timestamp: new Date().toISOString(),
        notes: notes || `Status perjalanan dikemas kini kepada ${nextTripStatus}.`
      }
    ],
    updated_at: new Date().toISOString()
  };

  saveLocalBookingCache(updatedBooking);
  broadcastSyncEvent('UPDATE_BOOKING', updatedBooking);

  if (nextTripStatus === 'en_route_pickup') {
    createInAppNotification({
      bookingId: updatedBooking.id,
      bookingRef: updatedBooking.invoice_number,
      recipientEmail: updatedBooking.patient_email,
      recipientRole: 'customer',
      title: 'Ambulans Sedang Menuju Ke Lokasi',
      message: `Ambulans ${updatedBooking.plate_number} telah bertolak dan sedang menuju ke lokasi pengambilan anda.`,
      notificationType: 'AMBULANCE_EN_ROUTE'
    });
  } else if (nextTripStatus === 'completed') {
    createInAppNotification({
      bookingId: updatedBooking.id,
      bookingRef: updatedBooking.invoice_number,
      recipientEmail: updatedBooking.patient_email,
      recipientRole: 'customer',
      title: 'Perjalanan Selesai',
      message: `Tugasan ambulans bagi rujukan ${updatedBooking.invoice_number} telah selesai dengan selamat. Terima kasih kerana menggunakan Al-Farhain AMC.`,
      notificationType: 'TRIP_COMPLETED'
    });
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from('ambulance_bookings')
        .update({
          trip_status: updatedBooking.trip_status,
          status: updatedBooking.status,
          completed_at: updatedBooking.completed_at,
          version: updatedBooking.version,
          audit_trail: updatedBooking.audit_trail,
          updated_at: updatedBooking.updated_at
        })
        .eq('invoice_number', updatedBooking.invoice_number);
    } catch (e) {
      console.warn('Notice syncing trip progress to Supabase:', e.message);
    }
  }

  return { success: true, data: updatedBooking };
}

/**
 * Customer Cancellation
 * - Pending booking: direct cancellation.
 * - Approved booking: creates cancellation request for admin review.
 */
export async function customerCancelOrRequestBooking({
  booking,
  reason,
  customerEmail
}) {
  if (!booking) return { success: false, error: 'Tempahan tidak ditemui.' };
  if (!reason || !reason.trim()) {
    return { success: false, error: 'Sila nyatakan sebab pembatalan.' };
  }

  const isPending = (booking.booking_status || '').toLowerCase() === 'pending_approval';
  const currentVersion = Number(booking.version || 1);

  if (isPending) {
    // Direct cancel
    const updated = {
      ...booking,
      booking_status: 'cancelled',
      status: 'Dibatalkan',
      cancellation_reason: reason.trim(),
      version: currentVersion + 1,
      audit_trail: [
        ...(booking.audit_trail || []),
        {
          action: 'CANCELLED_BY_CUSTOMER',
          actor: customerEmail || booking.patient_name || 'Pelanggan',
          timestamp: new Date().toISOString(),
          reason: reason.trim()
        }
      ],
      updated_at: new Date().toISOString()
    };

    saveLocalBookingCache(updated);
    broadcastSyncEvent('UPDATE_BOOKING', updated);

    createInAppNotification({
      bookingId: updated.id,
      bookingRef: updated.invoice_number,
      recipientEmail: 'admin@alfarhain.my',
      recipientRole: 'admin',
      title: 'Tempahan Dibatalkan oleh Pelanggan',
      message: `Tempahan ${updated.invoice_number} telah dibatalkan oleh pemohon: ${reason.trim()}`,
      notificationType: 'BOOKING_CANCELLED'
    });

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('ambulance_bookings')
          .update({
            booking_status: updated.booking_status,
            status: updated.status,
            cancellation_reason: updated.cancellation_reason,
            version: updated.version,
            audit_trail: updated.audit_trail,
            updated_at: updated.updated_at
          })
          .eq('invoice_number', updated.invoice_number);
      } catch (e) {}
    }

    return { success: true, directCancelled: true, data: updated };
  } else {
    // Approved booking: request review from admin desk
    const updated = {
      ...booking,
      cancellation_requested: true,
      cancellation_request_reason: reason.trim(),
      cancellation_request_at: new Date().toISOString(),
      version: currentVersion + 1,
      audit_trail: [
        ...(booking.audit_trail || []),
        {
          action: 'CANCELLATION_REQUESTED',
          actor: customerEmail || booking.patient_name || 'Pelanggan',
          timestamp: new Date().toISOString(),
          reason: reason.trim()
        }
      ],
      updated_at: new Date().toISOString()
    };

    saveLocalBookingCache(updated);
    broadcastSyncEvent('UPDATE_BOOKING', updated);

    createInAppNotification({
      bookingId: updated.id,
      bookingRef: updated.invoice_number,
      recipientEmail: 'admin@alfarhain.my',
      recipientRole: 'admin',
      title: 'Permohonan Pembatalan Perlu Semakan',
      message: `Pelanggan memohon pembatalan tempahan disahkan ${updated.invoice_number}. Sebab: ${reason.trim()}`,
      notificationType: 'CANCELLATION_REQUESTED'
    });

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('ambulance_bookings')
          .update({
            cancellation_requested: true,
            cancellation_request_reason: updated.cancellation_request_reason,
            cancellation_request_at: updated.cancellation_request_at,
            version: updated.version,
            audit_trail: updated.audit_trail,
            updated_at: updated.updated_at
          })
          .eq('invoice_number', updated.invoice_number);
      } catch (e) {}
    }

    return {
      success: true,
      directCancelled: false,
      message: 'Permohonan pembatalan anda telah dihantar ke HQ untuk semakan pengesahan.',
      data: updated
    };
  }
}

/**
 * Customer Rescheduling Request
 */
export async function customerRequestReschedule({
  booking,
  newTime,
  reason,
  customerEmail
}) {
  if (!booking) return { success: false, error: 'Tempahan tidak ditemui.' };
  if (!newTime) return { success: false, error: 'Sila pilih masa baharu.' };

  const currentVersion = Number(booking.version || 1);
  const updated = {
    ...booking,
    reschedule_requested: true,
    reschedule_request_time: new Date(newTime).toISOString(),
    reschedule_request_at: new Date().toISOString(),
    version: currentVersion + 1,
    audit_trail: [
      ...(booking.audit_trail || []),
      {
        action: 'RESCHEDULE_REQUESTED',
        actor: customerEmail || booking.patient_name || 'Pelanggan',
        timestamp: new Date().toISOString(),
        newTime: new Date(newTime).toISOString(),
        reason: reason || 'Permohonan jadual semula oleh pelanggan.'
      }
    ],
    updated_at: new Date().toISOString()
  };

  saveLocalBookingCache(updated);
  broadcastSyncEvent('UPDATE_BOOKING', updated);

  createInAppNotification({
    bookingId: updated.id,
    bookingRef: updated.invoice_number,
    recipientEmail: 'admin@alfarhain.my',
    recipientRole: 'admin',
    title: 'Permohonan Jadual Semula',
    message: `Tempahan ${updated.invoice_number} memohon anjakan masa ke ${new Date(newTime).toLocaleString('ms-MY')}.`,
    notificationType: 'RESCHEDULE_REQUESTED'
  });

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from('ambulance_bookings')
        .update({
          reschedule_requested: true,
          reschedule_request_time: updated.reschedule_request_time,
          reschedule_request_at: updated.reschedule_request_at,
          version: updated.version,
          audit_trail: updated.audit_trail,
          updated_at: updated.updated_at
        })
        .eq('invoice_number', updated.invoice_number);
    } catch (e) {}
  }

  return {
    success: true,
    message: 'Permohonan anjakan masa telah dihantar ke pegawai operasi HQ.',
    data: updated
  };
}

/**
 * Calculates Admin Dashboard KPI Counts strictly within authorized branch/company scope.
 */
export function calculateAdminDashboardKpis(bookings = [], branchFilter = 'all') {
  let list = Array.isArray(bookings) ? bookings : [];

  if (branchFilter && branchFilter !== 'all') {
    list = list.filter(b => (b.hub_id || b.hubId || '').toLowerCase() === branchFilter.toLowerCase());
  }

  let pendingApproval = 0;
  let approved = 0;
  let ongoing = 0;
  let completedToday = 0;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  list.forEach(b => {
    const custStatus = deriveCustomerStatus(b);

    if (custStatus.code === 'menunggu_kelulusan') {
      pendingApproval++;
    } else if (custStatus.code === 'menunggu_agihan' || custStatus.code === 'dijadualkan') {
      approved++;
    } else if (['menuju_pengambilan', 'tiba_pengambilan', 'menuju_destinasi'].includes(custStatus.code)) {
      ongoing++;
    } else if (custStatus.code === 'selesai') {
      const compDateStr = b.completed_at || b.updated_at || b.created_at || '';
      if (compDateStr.startsWith(todayStr)) {
        completedToday++;
      }
    }
  });

  return {
    pendingApproval,
    approved,
    ongoing,
    completedToday,
    totalRecords: list.length
  };
}

/**
 * Filter and paginate bookings for Admin / Customer views.
 */
export function filterBookingsList(bookings = [], {
  tab = 'all', // 'aktif' | 'sejarah' | 'all'
  search = '',
  branch = 'all',
  bookingStatus = 'all',
  paymentStatus = 'all',
  provider = 'all',
  startDate = null,
  endDate = null,
  sortBy = 'date_desc' // 'date_desc' | 'date_asc' | 'schedule_asc'
} = {}) {
  let filtered = [...bookings];

  // 1. Tab Filter
  if (tab === 'menunggu_kelulusan') {
    filtered = filtered.filter(b => deriveCustomerStatus(b).code === 'menunggu_kelulusan');
  } else if (tab === 'menunggu_agihan') {
    filtered = filtered.filter(b => deriveCustomerStatus(b).code === 'menunggu_agihan');
  } else if (tab === 'sedang_misi') {
    filtered = filtered.filter(b => {
      const s = deriveCustomerStatus(b).code;
      return ['menuju_pengambilan', 'tiba_pengambilan', 'menuju_destinasi'].includes(s);
    });
  } else if (tab === 'aktif') {
    filtered = filtered.filter(b => {
      const s = deriveCustomerStatus(b).code;
      return ['menunggu_kelulusan', 'menunggu_agihan', 'dijadualkan', 'menuju_pengambilan', 'tiba_pengambilan', 'menuju_destinasi'].includes(s);
    });
  } else if (tab === 'selesai') {
    filtered = filtered.filter(b => deriveCustomerStatus(b).code === 'selesai');
  } else if (tab === 'batal_tolak') {
    filtered = filtered.filter(b => {
      const s = deriveCustomerStatus(b).code;
      return ['ditolak', 'dibatalkan'].includes(s);
    });
  } else if (tab === 'sejarah') {
    filtered = filtered.filter(b => {
      const s = deriveCustomerStatus(b).code;
      return ['selesai', 'ditolak', 'dibatalkan'].includes(s);
    });
  }

  // 2. Search Query (Reference, Patient Name, Phone, Locations)
  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    filtered = filtered.filter(b => {
      const ref = (b.invoice_number || b.invoiceNumber || '').toLowerCase();
      const patient = (b.patient_name || b.patientName || '').toLowerCase();
      const phone = (b.patient_phone || b.patientPhone || '').toLowerCase();
      const origin = (b.origin_name || b.originName || '').toLowerCase();
      const dest = (b.destination_name || b.destinationName || '').toLowerCase();
      const plate = (b.plate_number || b.plateNumber || '').toLowerCase();
      return ref.includes(q) || patient.includes(q) || phone.includes(q) || origin.includes(q) || dest.includes(q) || plate.includes(q);
    });
  }

  // 3. Branch Filter
  if (branch && branch !== 'all') {
    filtered = filtered.filter(b => (b.hub_id || b.hubId || '').toLowerCase() === branch.toLowerCase());
  }

  // 4. Status Filter
  if (bookingStatus && bookingStatus !== 'all') {
    filtered = filtered.filter(b => {
      const s = deriveCustomerStatus(b).code;
      return s === bookingStatus.toLowerCase();
    });
  }

  // 5. Payment Status Filter
  if (paymentStatus && paymentStatus !== 'all') {
    filtered = filtered.filter(b => (b.payment_status || b.paymentStatus || 'unpaid').toLowerCase() === paymentStatus.toLowerCase());
  }

  // 6. Provider Filter
  if (provider && provider !== 'all') {
    filtered = filtered.filter(b => {
      const p = (b.assigned_provider_name || b.assignedProviderName || 'al-farhain').toLowerCase();
      return p.includes(provider.toLowerCase());
    });
  }

  // 7. Date Range Filter
  if (startDate) {
    const startMs = new Date(startDate).getTime();
    filtered = filtered.filter(b => new Date(b.created_at || b.scheduled_time).getTime() >= startMs);
  }
  if (endDate) {
    const endMs = new Date(endDate).getTime();
    filtered = filtered.filter(b => new Date(b.created_at || b.scheduled_time).getTime() <= endMs);
  }

  // 8. Sorting
  filtered.sort((a, b) => {
    if (sortBy === 'schedule_asc') {
      const timeA = new Date(a.scheduled_time || a.created_at).getTime();
      const timeB = new Date(b.scheduled_time || b.created_at).getTime();
      return timeA - timeB;
    }
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    return timeB - timeA;
  });

  return filtered;
}

/**
 * In-App Notifications Service
 */
export function createInAppNotification({
  bookingId = null,
  bookingRef = '',
  recipientEmail,
  recipientRole = 'customer',
  title,
  message,
  notificationType = 'GENERAL'
}) {
  const notif = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    booking_id: bookingId,
    booking_ref: bookingRef,
    recipient_email: (recipientEmail || 'all').toLowerCase().trim(),
    recipient_role: recipientRole,
    title,
    message,
    notification_type: notificationType,
    is_read: false,
    created_at: new Date().toISOString()
  };

  try {
    const raw = localStorage.getItem('amc_notifications');
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(notif);
    localStorage.setItem('amc_notifications', JSON.stringify(list.slice(0, 100)));
  } catch (e) {}

  const supabase = getSupabaseClient();
  if (supabase) {
    supabase.from('booking_notifications').insert([notif]).then(() => {}).catch(() => {});
  }

  return notif;
}

export function getInAppNotifications({ email = '', role = 'customer' } = {}) {
  try {
    const raw = localStorage.getItem('amc_notifications');
    const list = raw ? JSON.parse(raw) : [];
    const cleanEmail = email.toLowerCase().trim();

    return list.filter(n => {
      if (role === 'admin' && n.recipient_role === 'admin') return true;
      if (n.recipient_email === 'all') return true;
      if (cleanEmail && n.recipient_email === cleanEmail) return true;
      return false;
    });
  } catch {
    return [];
  }
}

export function markNotificationAsRead(notifId) {
  try {
    const raw = localStorage.getItem('amc_notifications');
    if (!raw) return;
    const list = JSON.parse(raw);
    const item = list.find(n => n.id === notifId);
    if (item) item.is_read = true;
    localStorage.setItem('amc_notifications', JSON.stringify(list));
  } catch (e) {}
}

