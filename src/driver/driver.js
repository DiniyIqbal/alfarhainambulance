// =====================================================================
// AL-FARHAIN AMC AMBULANCE - DRIVER MISSION STATE MACHINE & ENGINE
// Matching UI/UX Screens 02 through 08
// =====================================================================

import {
  getCurrentAuthUser,
  resolveUserRole,
  signOutUser,
  getSupabaseClient,
  updateBookingStatusInSupabase,
  fetchActiveMissionForDriver,
  subscribeToUnifiedSync
} from '../services/supabaseClient.js';
import { playSuccessChime, playClickSound, playEmergencyAlertSiren as playAlertSound } from '../utils/soundFx.js';
import { createGoogleAmcMap } from '../services/googleMapsService.js';
import {
  getPartnerState,
  updatePartnerTripProgress
} from '../services/partnerAmbulanceService.js';

// Coordinates
const COORDS = {
  KOK_LANAS_HQ: [5.8234, 102.2471],
  KOTA_BHARU_PICKUP: [6.1254, 102.2381],
  HRPZ_II: [6.1265, 102.2464]
};

// Application State
const state = {
  currentStep: 2, // 2: Tugasan Baharu, 3: Pra-perjalanan, 4: Ke Pengambilan, 5: Di Lokasi, 6: Ke Hospital, 7: Serahan, 8: Rekod
  activeTab: 'utama', // 'utama' | 'tugasan' | 'rekod' | 'profil'
  isPartnerDriver: false,
  partnerCompanyId: 'pcomp_medicare_kb',
  partnerCompanyName: 'MediCare Ambulance Services Sdn. Bhd.',
  partnerOfferId: 'ptrip_demo_01',
  partnerCashAuthorized: true,
  activeMission: {
    code: 'AMC-1043',
    patientName: 'Pesakit 01',
    mobility: 'Kerusi roda',
    pickupLocation: 'Kota Bharu, Kelantan',
    destLocation: 'Hospital Raja Perempuan Zainab II (HRPZ II)',
    ambulancePlate: 'VPQ 7606',
    branch: 'Kok Lanas HQ',
    driverName: 'Pemandu 01 (Abe Di)',
    crewName: 'Krew 02',
    odometerStart: 124580,
    odometerEnd: 124607,
    recordedDistance: 27,
    status: 'Menunggu penerimaan'
  },
  checklist: {
    vehicle: true,
    stretcher: true,
    equipment: true,
    crew: true
  },
  readinessChecklist: {
    cleaning: true,
    equipment: true,
    crew: true
  },
  mapInstances: {
    map04: null,
    map06: null
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await enforceDriverRole();
  initNavigationTabs();
  initStepActions();
  initChecklists();
  initOdometerTracker();
  initModals();
  renderActiveView();
  await initDriverRealtimeSync();
});

// =====================================================================
// 1. AUTH & ROLE GATEKEEPER (INTERNAL & PARTNER DRIVER)
// =====================================================================
function applyDriverModeUI(isPartner) {
  state.isPartnerDriver = Boolean(isPartner);

  const driverEmailEl = document.getElementById('driverEmailBadge');
  const driverNameEl = document.getElementById('driverProfileName');
  const roleLabelEl = document.getElementById('driverRoleLabel');
  const plateEl = document.getElementById('driverAssignedPlateText');
  const vehicleTypeEl = document.getElementById('driverAssignedVehicleType');
  const hubTextEl = document.getElementById('driverAssignedHubText');
  const companyTagEl = document.getElementById('driverAssignedCompanyTag');
  const partnerBanner = document.getElementById('partnerDriverCompanyBanner');
  const cashCard = document.getElementById('partnerCashCollectionCard');
  const cashInput = document.getElementById('partnerCashCollectedInput');
  const btnToggleMode = document.getElementById('btnTogglePartnerDriverMode');

  if (state.isPartnerDriver) {
    const pState = getPartnerState();
    const assignedOffer = (pState.trip_offers || []).find(o => o.partner_company_id === 'pcomp_medicare_kb') || pState.trip_offers?.[0];
    state.partnerOfferId = assignedOffer?.id || 'ptrip_demo_01';
    state.partnerCashAuthorized = assignedOffer ? (assignedOffer.collection_channel === 'cash_collected_partner' || true) : true;

    state.activeMission = {
      ...state.activeMission,
      code: assignedOffer?.invoice_number || 'AMC-RKN-5001',
      patientName: assignedOffer?.patient_name || 'Pn. Siti Aminah binti Mahmood',
      mobility: 'Katil + Oksigen',
      pickupLocation: assignedOffer?.pickup_full_address || 'Wakaf Che Yeh, Kota Bharu',
      destLocation: assignedOffer?.dropoff_full_address || 'HUSM Kubang Kerian',
      ambulancePlate: assignedOffer?.assigned_plate || 'DDU 8892',
      branch: 'MediCare Ambulance (Kota Bharu)',
      driverName: 'Mohd Hafizuddin bin Razak',
      crewName: 'Krew Rakan MediCare'
    };

    if (driverEmailEl) driverEmailEl.textContent = 'pemandu.medicare@gmail.com';
    if (driverNameEl) driverNameEl.textContent = 'Mohd Hafizuddin bin Razak';
    if (roleLabelEl) roleLabelEl.textContent = 'Pemandu Rakan Ambulans Diluluskan HQ';
    if (plateEl) plateEl.textContent = state.activeMission.ambulancePlate;
    if (vehicleTypeEl) vehicleTypeEl.textContent = 'Ambulans Kelas B (ALS)';
    if (hubTextEl) hubTextEl.textContent = 'MediCare Ambulance Services Sdn. Bhd.';
    if (companyTagEl) companyTagEl.textContent = 'Rakan Ambulans Rasmi AFAMS';
    if (partnerBanner) partnerBanner.style.display = 'block';
    if (cashCard) cashCard.style.display = state.partnerCashAuthorized ? 'block' : 'none';
    if (cashInput && assignedOffer?.agreed_price_cents) {
      cashInput.value = (assignedOffer.agreed_price_cents / 100).toFixed(2);
    } else if (cashInput) {
      cashInput.value = '500.00';
    }
    if (btnToggleMode) btnToggleMode.textContent = 'Tukar ke Pemandu Dalaman ›';
  } else {
    state.activeMission = {
      ...state.activeMission,
      code: 'AMC-1043',
      patientName: 'Pesakit 01',
      mobility: 'Kerusi roda',
      pickupLocation: 'Kota Bharu, Kelantan',
      destLocation: 'Hospital Raja Perempuan Zainab II (HRPZ II)',
      ambulancePlate: 'VPQ 7606',
      branch: 'Kok Lanas HQ',
      driverName: 'Pemandu 01 (Abe Di)'
    };

    if (driverEmailEl) driverEmailEl.textContent = 'diniy-driver@gmail.com';
    if (driverNameEl) driverNameEl.textContent = 'Abe Di (Pemandu EMT)';
    if (roleLabelEl) roleLabelEl.textContent = 'Pemandu EMT Bertugas (Armada Dalaman)';
    if (plateEl) plateEl.textContent = 'VPQ 7606';
    if (vehicleTypeEl) vehicleTypeEl.textContent = 'Toyota Hiace High-Roof';
    if (hubTextEl) hubTextEl.textContent = 'Kok Lanas HQ';
    if (companyTagEl) companyTagEl.textContent = 'Poliklinik Al-Farhain';
    if (partnerBanner) partnerBanner.style.display = 'none';
    if (cashCard) cashCard.style.display = 'none';
    if (btnToggleMode) btnToggleMode.textContent = 'Tukar ke Pemandu Rakan ›';
  }

  updateMissionUI();
}

async function enforceDriverRole() {
  const user = await getCurrentAuthUser();
  if (user) {
    const role = resolveUserRole(user.email, user.user_metadata);
    const email = (user.email || '').toLowerCase();
    const isPartner = role === 'partner_driver' || email.includes('medicare');
    applyDriverModeUI(isPartner);
  } else {
    applyDriverModeUI(false);
  }
}

// =====================================================================
// 2. BOTTOM NAVIGATION TABS
// =====================================================================
function initNavigationTabs() {
  const dockItems = document.querySelectorAll('.driver-dock-item');
  dockItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      playClickSound();
      const tab = btn.dataset.tab;
      dockItems.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeTab = tab;
      renderActiveView();
    });
  });

  // Back button in top header
  const backBtn = document.getElementById('driverHeaderBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      playClickSound();
      if (state.activeTab === 'tugasan' && state.currentStep > 2) {
        state.currentStep--;
        renderActiveView();
      } else {
        switchTab('utama');
      }
    });
  }
}

export function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.driver-dock-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  renderActiveView();
}

// =====================================================================
// 3. STEP ACTIONS & MISSION LIFECYCLE
// =====================================================================
function initStepActions() {
  // Screen 02: Terima Tugasan -> Move to Screen 03
  const btnAcceptMission = document.getElementById('btnAcceptMission');
  if (btnAcceptMission) {
    btnAcceptMission.addEventListener('click', async () => {
      playSuccessChime();
      state.activeMission.status = 'Diterima';
      state.currentStep = 3;
      renderActiveView();
      await updateBookingStatusInSupabase(state.activeMission.code, 'Diterima');
    });
  }

  // Screen 02: Tolak Tugasan -> Open Modal
  const btnDeclineMission = document.getElementById('btnDeclineMission');
  if (btnDeclineMission) {
    btnDeclineMission.addEventListener('click', () => {
      playClickSound();
      openModal('modalDeclineReason');
    });
  }

  // Screen 03: Sahkan & Mula Perjalanan -> Move to Screen 04
  const btnStartPickupTrip = document.getElementById('btnStartPickupTrip');
  if (btnStartPickupTrip) {
    btnStartPickupTrip.addEventListener('click', async () => {
      playSuccessChime();
      state.activeMission.status = 'Menuju Lokasi';
      state.currentStep = 4;
      renderActiveView();
      await updateBookingStatusInSupabase(state.activeMission.code, 'Menuju Lokasi');
    });
  }

  // Screen 04: Saya Sudah Tiba -> Move to Screen 05
  const btnArrivedPickup = document.getElementById('btnArrivedPickup');
  if (btnArrivedPickup) {
    btnArrivedPickup.addEventListener('click', async () => {
      playSuccessChime();
      state.activeMission.status = 'Di Lokasi Pengambilan';
      state.currentStep = 5;
      renderActiveView();
      await updateBookingStatusInSupabase(state.activeMission.code, 'Di Lokasi Pengambilan');
    });
  }

  // Screen 05: Mulakan Perjalanan ke Hospital -> Move to Screen 06
  const btnStartHospitalTrip = document.getElementById('btnStartHospitalTrip');
  if (btnStartHospitalTrip) {
    btnStartHospitalTrip.addEventListener('click', async () => {
      playSuccessChime();
      state.activeMission.status = 'Menuju Hospital';
      state.currentStep = 6;
      renderActiveView();
      await updateBookingStatusInSupabase(state.activeMission.code, 'Menuju Hospital');
    });
  }

  // Screen 06: Tiba di Hospital -> Move to Screen 07
  const btnArrivedHospital = document.getElementById('btnArrivedHospital');
  if (btnArrivedHospital) {
    btnArrivedHospital.addEventListener('click', async () => {
      playSuccessChime();
      state.activeMission.status = 'Tiba di Hospital';
      state.currentStep = 7;
      renderActiveView();
      await updateBookingStatusInSupabase(state.activeMission.code, 'Tiba di Hospital');
    });
  }

  // Screen 07: Sahkan Tamat Tugasan -> Move to Screen 08 (with Partner Completion Evidence if Partner Driver)
  const btnConfirmHandover = document.getElementById('btnConfirmHandover');
  if (btnConfirmHandover) {
    btnConfirmHandover.addEventListener('click', async () => {
      playSuccessChime();
      state.activeMission.status = 'Selesai';
      state.currentStep = 8;

      if (state.isPartnerDriver && state.partnerOfferId) {
        const receiverName = document.getElementById('handoverReceiverInput')?.value?.trim() || 'Unit Kecemasan Hospital';
        const notes = document.getElementById('handoverNotesInput')?.value?.trim() || 'Diserahkan dengan selamat';
        const odoEnd = Number(document.getElementById('odometerEndInput')?.value || state.activeMission.odometerEnd || 124607);
        const cashVal = state.partnerCashAuthorized
          ? Number(document.getElementById('partnerCashCollectedInput')?.value || 0)
          : 0;

        try {
          updatePartnerTripProgress(
            {
              role: 'partner_driver',
              email: 'pemandu.medicare@gmail.com',
              name: 'Mohd Hafizuddin bin Razak',
              partnerCompanyId: state.partnerCompanyId
            },
            {
              offerId: state.partnerOfferId,
              tripProgress: 'Selesai',
              handoverReceiverName: receiverName,
              completionNotes: notes,
              odometerStartKm: state.activeMission.odometerStart,
              odometerEndKm: odoEnd,
              cashCollectedRm: cashVal
            }
          );
          showDriverToast('✓ Bukti penyiapan tugasan Rakan Ambulans dihantar ke HQ untuk pengesahan.');
        } catch (err) {
          console.warn('Partner trip progress notice:', err);
        }
      }

      switchTab('rekod');
      await updateBookingStatusInSupabase(state.activeMission.code, 'Selesai');
    });
  }

  // Toggle Partner Driver vs Internal Driver Demo Mode
  const btnTogglePartnerDriverMode = document.getElementById('btnTogglePartnerDriverMode');
  if (btnTogglePartnerDriverMode) {
    btnTogglePartnerDriverMode.addEventListener('click', () => {
      playClickSound();
      applyDriverModeUI(!state.isPartnerDriver);
      showDriverToast(
        state.isPartnerDriver
          ? '🤝 Ditukar ke Mod Pemandu Rakan (MediCare Ambulance - DDU 8892)'
          : '🏥 Ditukar ke Mod Pemandu Dalaman Al-Farhain (VPQ 7606)'
      );
    });
  }

  // Screen 08: Tandakan Bersedia
  const btnMarkReady = document.getElementById('btnMarkReady');
  if (btnMarkReady) {
    btnMarkReady.addEventListener('click', () => {
      playSuccessChime();
      const statusPill = document.getElementById('vehicleReadinessPill');
      if (statusPill) {
        statusPill.textContent = '✓ Kenderaan Bersedia';
        statusPill.className = 'driver-pill driver-pill-green';
      }
      btnMarkReady.textContent = '✓ Ambulans Siap Sedia';
      btnMarkReady.style.backgroundColor = '#10B981';
      btnMarkReady.disabled = true;
    });
  }

  // Navigation App Launchers (Screens 04 & 06)
  document.querySelectorAll('.btn-launch-nav').forEach((btn) => {
    btn.addEventListener('click', () => {
      playClickSound();
      const target = btn.dataset.destination || 'Kota Bharu';
      launchExternalNav(target);
    });
  });

  // Call Caller / HQ Buttons
  document.querySelectorAll('.btn-call-hq').forEach((btn) => {
    btn.addEventListener('click', () => {
      playClickSound();
      window.location.href = 'tel:0199000000';
    });
  });

  document.querySelectorAll('.btn-call-caller').forEach((btn) => {
    btn.addEventListener('click', () => {
      playClickSound();
      window.location.href = 'tel:0111234567';
    });
  });

  // Report Issue / Delay Buttons
  document.querySelectorAll('.btn-report-issue').forEach((btn) => {
    btn.addEventListener('click', () => {
      playClickSound();
      openModal('modalReportIssue');
    });
  });

  // Profile actions: Switch to Patient App
  const btnSwitchPatient = document.getElementById('btnSwitchToPatientApp');
  if (btnSwitchPatient) {
    btnSwitchPatient.addEventListener('click', () => {
      playClickSound();
      window.location.href = '/index.html';
    });
  }

  // Profile Sign Out
  const btnSignOut = document.getElementById('btnDriverSignOut');
  if (btnSignOut) {
    btnSignOut.addEventListener('click', async () => {
      playClickSound();
      await signOutUser();
      window.location.href = '/index.html';
    });
  }

  // Dashboard (Screen 01) Quick Access & Action Bindings
  const btnViewMissionDetail = document.getElementById('btnViewMissionDetail');
  if (btnViewMissionDetail) {
    btnViewMissionDetail.addEventListener('click', () => {
      playClickSound();
      switchTab('tugasan');
    });
  }

  const btnVehicleDetails = document.getElementById('btnVehicleDetails');
  if (btnVehicleDetails) {
    btnVehicleDetails.addEventListener('click', () => {
      playClickSound();
      switchTab('profil');
    });
  }

  const btnSummaryToday = document.getElementById('btnSummaryToday');
  if (btnSummaryToday) {
    btnSummaryToday.addEventListener('click', () => {
      playClickSound();
      switchTab('rekod');
    });
  }

  const btnQARekod = document.getElementById('btnQARekod');
  if (btnQARekod) {
    btnQARekod.addEventListener('click', () => {
      playClickSound();
      switchTab('rekod');
    });
  }

  const btnQASayakan = document.getElementById('btnQASayakan');
  if (btnQASayakan) {
    btnQASayakan.addEventListener('click', () => {
      playClickSound();
      switchTab('tugasan');
    });
  }

  const btnQAJadual = document.getElementById('btnQAJadual');
  if (btnQAJadual) {
    btnQAJadual.addEventListener('click', () => {
      playClickSound();
      switchTab('rekod');
    });
  }
}

// =====================================================================
// REALTIME DATA SYNC & MISSION ENGINE
// =====================================================================
function syncStepWithStatus(status) {
  const norm = (status || '').toLowerCase();
  if (norm.includes('selesai') || norm.includes('arrived') || norm.includes('completed')) {
    state.currentStep = 8;
  } else if (norm.includes('hospital') || norm.includes('serahan')) {
    state.currentStep = 7;
  } else if (norm.includes('transit') || norm.includes('ke hospital')) {
    state.currentStep = 6;
  } else if (norm.includes('lokasi') || norm.includes('scene')) {
    state.currentStep = 5;
  } else if (norm.includes('menuju') || norm.includes('en route')) {
    state.currentStep = 4;
  } else if (norm.includes('diterima') || norm.includes('accepted')) {
    state.currentStep = 3;
  } else {
    state.currentStep = 2; // Tugasan Baharu (Incoming)
  }
}

function updateMissionUI() {
  const m = state.activeMission;
  if (!m) return;

  // Update Mission Code on all matching elements
  document.querySelectorAll('.driver-mission-code, .driver-card-title, .driver-hero-task-tag span:last-child').forEach(el => {
    if (el.textContent.includes('AMC-') || el.classList.contains('driver-mission-code')) {
      el.textContent = m.code;
    }
  });

  // Update Route Cities & Labels
  document.querySelectorAll('.driver-preview-route-city').forEach((el, idx) => {
    if (idx === 0) el.textContent = m.pickupLocation.split(',')[0].trim();
    if (idx === 1) el.textContent = m.destLocation.split(',')[0].trim();
  });

  // Update Patient Details
  document.querySelectorAll('.driver-card, .driver-subcard').forEach(card => {
    const nameEl = card.querySelector('.driver-card-title, div[style*="font-weight:800"]');
    if (nameEl && nameEl.textContent.includes('Pesakit')) {
      nameEl.textContent = m.patientName || 'Pesakit AMC';
    }
  });
}

function applyBookingToDriverState(booking, autoSwitch = false) {
  const code = booking.invoice_number || booking.invoiceNumber || 'AMC-1043';
  state.activeMission = {
    ...state.activeMission,
    code,
    patientName: booking.patient_name || booking.patientName || 'Pesakit AMC',
    patientPhone: booking.patient_phone || booking.patientPhone || '013-914 7606',
    pickupLocation: booking.origin_name || booking.originName || 'Kota Bharu, Kelantan',
    destLocation: booking.destination_name || booking.destinationName || 'HRPZ II',
    ambulancePlate: booking.plate_number || booking.plateNumber || 'VPQ 7606',
    driverName: booking.driver_name || booking.driverName || 'Abe Di',
    recordedDistance: booking.distance_km || booking.distanceKm || 27,
    status: booking.status || 'Menunggu penerimaan'
  };

  syncStepWithStatus(state.activeMission.status);
  updateMissionUI();

  if (autoSwitch) {
    state.activeTab = 'tugasan';
    document.querySelectorAll('.driver-dock-item').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === 'tugasan');
    });
  }
  renderActiveView();
}

function showDriverToast(msg) {
  let toast = document.getElementById('driverSyncToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'driverSyncToast';
    toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;padding:10px 18px;border-radius:24px;font-size:0.82rem;font-weight:700;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px;border:1px solid #334155;transition:opacity 0.3s ease;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 4500);
}

async function initDriverRealtimeSync() {
  // 1. Initial fetch of active mission
  const initial = await fetchActiveMissionForDriver(state.activeMission.ambulancePlate);
  if (initial) {
    applyBookingToDriverState(initial, false);
  }

  // 2. Subscribe to unified sync
  subscribeToUnifiedSync({
    onNewBooking: (newBooking) => {
      console.info('[Driver Sync] Incoming mission detected:', newBooking);
      playAlertSound();
      applyBookingToDriverState(newBooking, true);
      showDriverToast(`🚨 Tugasan Baharu: ${newBooking.invoice_number || newBooking.invoiceNumber}`);
    },
    onUpdateBooking: (updatedBooking) => {
      const inv = updatedBooking.invoice_number || updatedBooking.invoiceNumber;
      if (inv === state.activeMission.code && updatedBooking.status) {
        state.activeMission.status = updatedBooking.status;
        syncStepWithStatus(updatedBooking.status);
        renderActiveView();
      }
    },
    onStatusChange: (status) => {
      const syncValEl = document.querySelector('.driver-status-card .driver-status-icon-wrap.sync ~ .driver-status-texts .driver-status-value');
      if (syncValEl) {
        syncValEl.textContent = status?.connected ? 'Disegerak' : 'Luar Talian';
        syncValEl.style.color = status?.connected ? '#10B981' : '#F59E0B';
      }
    }
  });
}

// =====================================================================
// 4. CHECKLIST SYSTEMS
// =====================================================================
function initChecklists() {
  const items = document.querySelectorAll('.driver-check-item');
  items.forEach((item) => {
    item.addEventListener('click', () => {
      playClickSound();
      item.classList.toggle('checked');
      updateChecklistProgress();
    });
  });
}

function updateChecklistProgress() {
  const total = document.querySelectorAll('#screen03Checklist .driver-check-item').length;
  const checked = document.querySelectorAll('#screen03Checklist .driver-check-item.checked').length;
  const pct = Math.round((checked / (total || 1)) * 100);

  const textEl = document.getElementById('preTripProgressText');
  const barEl = document.getElementById('preTripProgressBar');
  if (textEl) textEl.textContent = `${checked} daripada ${total} disemak`;
  if (barEl) barEl.style.width = `${pct}%`;
}

// =====================================================================
// 5. ODOMETER CALCULATION
// =====================================================================
function initOdometerTracker() {
  const endInput = document.getElementById('odometerEndInput');
  const distEl = document.getElementById('recordedDistanceVal');

  if (endInput && distEl) {
    endInput.addEventListener('input', () => {
      const endVal = parseInt(endInput.value, 10) || state.activeMission.odometerStart;
      const startVal = state.activeMission.odometerStart;
      const diff = Math.max(0, endVal - startVal);
      distEl.textContent = `${diff} km`;
      state.activeMission.odometerEnd = endVal;
      state.activeMission.recordedDistance = diff;
    });
  }
}

// =====================================================================
// 6. MAP ENGINE (LEAFLET INTEGRATION)
// =====================================================================
function initLeafletMap(mapId, startCoords, endCoords) {
  const container = document.getElementById(mapId);
  if (!container) return;

  // Cleanup old map if initialized
  if (state.mapInstances[mapId]) {
    if (typeof state.mapInstances[mapId].destroy === 'function') {
      state.mapInstances[mapId].destroy();
    } else if (typeof state.mapInstances[mapId].remove === 'function') {
      state.mapInstances[mapId].remove();
    }
    state.mapInstances[mapId] = null;
  }

  const routePoints = [
    startCoords,
    [(startCoords[0] + endCoords[0]) / 2 + 0.005, (startCoords[1] + endCoords[1]) / 2 - 0.008],
    endCoords
  ];

  // Initialize with Google Maps Controller
  const mapCtrl = createGoogleAmcMap(mapId, {
    center: startCoords,
    zoom: 13,
    interactive: true,
    showNavigation: true,
    onReady: (ctrl) => {
      ctrl.setRoute('driverRoute', routePoints, {
        color: '#C61E2F',
        width: 4.5,
        opacity: 0.95
      });

      ctrl.addOrUpdateMarker('driverAmb', {
        coords: startCoords,
        customHtml: `<div style="background:#C61E2F;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(198,30,47,0.4);border:2px solid #fff;font-size:16px;">🚑</div>`
      });

      ctrl.addOrUpdateMarker('driverTarget', {
        coords: endCoords,
        customHtml: `<div style="background:#1E293B;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.3);border:2px solid #fff;font-size:14px;">📍</div>`
      });

      ctrl.fitBounds(routePoints, { top: 30, bottom: 30, left: 30, right: 30 });
    }
  });

  state.mapInstances[mapId] = mapCtrl;
}

function launchExternalNav(destName) {
  const coords = destName.includes('HRPZ') ? COORDS.HRPZ_II : COORDS.KOTA_BHARU_PICKUP;
  const lat = coords[0];
  const lng = coords[1];

  // Try Google Maps intent or universal URL
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(destName)}`;
  window.open(googleMapsUrl, '_blank');
}

// =====================================================================
// 7. VIEW RENDERING ENGINE
// =====================================================================
function renderActiveView() {
  // Hide all screens
  document.querySelectorAll('.driver-screen-view').forEach((el) => {
    el.classList.remove('active');
  });

  const headerTitleEl = document.getElementById('driverHeaderTitle');
  const navBrandEl = document.getElementById('driverNavBrand');
  const navSubEl = document.getElementById('driverNavSub');

  if (state.activeTab === 'utama') {
    const screenUtama = document.getElementById('screenUtama');
    if (screenUtama) screenUtama.classList.add('active');
    if (navBrandEl) navBrandEl.style.display = 'flex';
    if (navSubEl) navSubEl.style.display = 'none';
  } else if (state.activeTab === 'tugasan') {
    if (navBrandEl) navBrandEl.style.display = 'none';
    if (navSubEl) navSubEl.style.display = 'flex';
    const targetScreen = document.getElementById(`screen0${state.currentStep}`);
    if (targetScreen) targetScreen.classList.add('active');
    updateHeaderTitle(state.currentStep);

    // Initialize maps for screens 04 & 06
    if (state.currentStep === 4) {
      setTimeout(() => {
        initLeafletMap('mapCanvas04', COORDS.KOK_LANAS_HQ, COORDS.KOTA_BHARU_PICKUP);
      }, 100);
    } else if (state.currentStep === 6) {
      setTimeout(() => {
        initLeafletMap('mapCanvas06', COORDS.KOTA_BHARU_PICKUP, COORDS.HRPZ_II);
      }, 100);
    }
  } else if (state.activeTab === 'rekod') {
    if (navBrandEl) navBrandEl.style.display = 'none';
    if (navSubEl) navSubEl.style.display = 'flex';
    const screen08 = document.getElementById('screen08');
    if (screen08) screen08.classList.add('active');
    if (headerTitleEl) headerTitleEl.textContent = 'Rekod tugasan';
  } else if (state.activeTab === 'profil') {
    if (navBrandEl) navBrandEl.style.display = 'none';
    if (navSubEl) navSubEl.style.display = 'flex';
    const screenProfil = document.getElementById('screenProfil');
    if (screenProfil) screenProfil.classList.add('active');
    if (headerTitleEl) headerTitleEl.textContent = 'Profil Pemandu';
  }
}

function updateHeaderTitle(step) {
  const titles = {
    2: 'Tugasan baharu',
    3: 'Semakan pra-perjalanan',
    4: 'Menuju pengambilan',
    5: 'Pengambilan pesakit',
    6: 'Menuju hospital',
    7: 'Serahan & tamat',
    8: 'Rekod tugasan'
  };
  const headerTitleEl = document.getElementById('driverHeaderTitle');
  if (headerTitleEl) headerTitleEl.textContent = titles[step] || 'Tugasan Lapangan';
}

// =====================================================================
// 8. MODAL CONTROLS
// =====================================================================
function initModals() {
  document.querySelectorAll('.driver-modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      playClickSound();
      document.querySelectorAll('.driver-modal-overlay').forEach((m) => m.classList.remove('show'));
    });
  });

  const btnConfirmDecline = document.getElementById('btnConfirmDecline');
  if (btnConfirmDecline) {
    btnConfirmDecline.addEventListener('click', () => {
      playAlertSound();
      document.querySelectorAll('.driver-modal-overlay').forEach((m) => m.classList.remove('show'));
      alert('Tugasan ditolak. HQ telah dimaklumkan.');
    });
  }

  const btnSubmitReport = document.getElementById('btnSubmitReport');
  if (btnSubmitReport) {
    btnSubmitReport.addEventListener('click', () => {
      playSuccessChime();
      document.querySelectorAll('.driver-modal-overlay').forEach((m) => m.classList.remove('show'));
      alert('Laporan isu telah dihantar kepada Pusat Operasi.');
    });
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}
