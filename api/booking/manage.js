// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - BOOKING MANAGEMENT API
// Endpoint: POST /api/booking/manage
// Enforces server-side validation, RBAC, conflict checks, and concurrency.
// =========================================================================

import {
  createPatientBooking,
  approveBookingRequest,
  rejectBookingRequest,
  assignBookingResources,
  updateTripProgress,
  customerCancelOrRequestBooking,
  customerRequestReschedule,
  calculateAdminDashboardKpis,
  filterBookingsList,
  getInAppNotifications
} from '../../src/services/bookingManagementService.js';
import { applyCors, requireAuth, canAccessBranch, STAFF_ROLES } from '../_lib/security.js';

// Which roles may call each action. Identity always comes from the JWT,
// never from payload.adminUser / payload.actor / payload.customerEmail.
const ACTION_ROLES = {
  SUBMIT_BOOKING: null, // any signed-in user
  APPROVE_BOOKING: STAFF_ROLES,
  REJECT_BOOKING: STAFF_ROLES,
  ASSIGN_RESOURCES: STAFF_ROLES,
  UPDATE_TRIP_PROGRESS: [...STAFF_ROLES, 'driver'],
  CUSTOMER_CANCEL: null,
  CUSTOMER_RESCHEDULE: null,
  GET_KPIS: STAFF_ROLES,
  FILTER_BOOKINGS: STAFF_ROLES,
  GET_NOTIFICATIONS: null
};

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Kaedah HTTP tidak dibenarkan. Sila gunakan POST.'
    });
  }

  const { action, payload = {} } = req.body || {};

  if (!action || !Object.prototype.hasOwnProperty.call(ACTION_ROLES, action)) {
    return res.status(400).json({ success: false, error: 'Tindakan (action) tidak sah.' });
  }

  const ctx = await requireAuth(req, res, { roles: ACTION_ROLES[action] });
  if (!ctx) return;

  const { actor, user } = ctx;
  const isStaff = STAFF_ROLES.includes(actor.role);
  const adminUser = { name: actor.name, email: actor.email, role: actor.role, branchId: actor.branchId };

  // Branch managers / dispatchers may only act on their own branch.
  const targetBranch = payload.booking?.hub_id || payload.booking?.hubId;
  if (isStaff && payload.booking && !canAccessBranch(actor, targetBranch)) {
    return res.status(403).json({ success: false, error: 'Tempahan ini bukan di bawah cawangan anda.', code: 'CROSS_BRANCH_FORBIDDEN' });
  }

  // Drivers may only progress trips on their own ambulance.
  if (action === 'UPDATE_TRIP_PROGRESS' && actor.role === 'driver') {
    const plate = payload.booking?.plate_number || payload.booking?.plateNumber;
    if (ctx.access.accountStatus !== 'Aktif' || !plate || plate !== ctx.access.plate) {
      return res.status(403).json({ success: false, error: 'Tugasan ini bukan untuk ambulans anda.', code: 'NOT_ASSIGNED_DRIVER' });
    }
  }

  // Customers may only act on their own bookings.
  if (['CUSTOMER_CANCEL', 'CUSTOMER_RESCHEDULE'].includes(action) && !isStaff) {
    const ownerId = payload.booking?.patient_user_id;
    if (!ownerId || ownerId !== user.id) {
      return res.status(403).json({ success: false, error: 'Anda hanya boleh mengubah tempahan anda sendiri.', code: 'NOT_BOOKING_OWNER' });
    }
  }

  try {
    switch (action) {
      case 'SUBMIT_BOOKING': {
        const bookingInput = { ...(payload.bookingInput || {}), patientUserId: user.id };
        const result = await createPatientBooking(bookingInput, []);
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'APPROVE_BOOKING': {
        const result = await approveBookingRequest({
          booking: payload.booking,
          adminUser,
          expectedVersion: payload.expectedVersion
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'REJECT_BOOKING': {
        const result = await rejectBookingRequest({
          booking: payload.booking,
          reason: payload.reason,
          adminUser,
          expectedVersion: payload.expectedVersion
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'ASSIGN_RESOURCES': {
        const result = await assignBookingResources({
          booking: payload.booking,
          provider: payload.provider,
          vehicle: payload.vehicle,
          driver: payload.driver,
          crew: payload.crew,
          reassignmentReason: payload.reassignmentReason,
          adminUser,
          allBookings: payload.allBookings || []
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'UPDATE_TRIP_PROGRESS': {
        const result = await updateTripProgress({
          booking: payload.booking,
          nextTripStatus: payload.nextTripStatus,
          actor: adminUser,
          notes: payload.notes,
          hasReturnTrip: payload.hasReturnTrip,
          returnCompleted: payload.returnCompleted
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'CUSTOMER_CANCEL': {
        const result = await customerCancelOrRequestBooking({
          booking: payload.booking,
          reason: payload.reason,
          customerEmail: user.email
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'CUSTOMER_RESCHEDULE': {
        const result = await customerRequestReschedule({
          booking: payload.booking,
          newTime: payload.newTime,
          reason: payload.reason,
          customerEmail: user.email
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case 'GET_KPIS': {
        const kpis = calculateAdminDashboardKpis(payload.bookings || [], payload.branchFilter || 'all');
        return res.status(200).json({ success: true, kpis });
      }

      case 'FILTER_BOOKINGS': {
        const list = filterBookingsList(payload.bookings || [], payload.options || {});
        return res.status(200).json({ success: true, bookings: list });
      }

      case 'GET_NOTIFICATIONS': {
        const notifs = getInAppNotifications({ email: user.email || '', role: isStaff ? 'admin' : 'customer' });
        return res.status(200).json({ success: true, notifications: notifs });
      }

      default:
        return res.status(400).json({ success: false, error: `Tindakan tidak dikenali: ${action}` });
    }
  } catch (err) {
    console.error(`[API /api/booking/manage] Error executing ${action}:`, err);
    return res.status(500).json({
      success: false,
      error: 'Ralat dalaman pelayan pemprosesan tempahan.'
    });
  }
}

