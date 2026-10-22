// =====================================================================
// AL-FARHAIN AMC AMBULANCE - DRIVER MISSION STATE MACHINE & ENGINE
// Matching UI/UX Screens 02 through 08
// =====================================================================

import {
  getCurrentAuthUser,
  resolveUserRole,
  signOutUser,
  getSupabaseClient
} from '../services/supabaseClient.js';
import { playSuccessChime, playClickSound, playEmergencyAlertSiren as playAlertSound } from '../utils/soundFx.js';

// Coordinates
const COORDS = {
  KOK_LANAS_HQ: [5.8234, 102.2471],
  KOTA_BHARU_PICKUP: [6.1254, 102.2381],
  HRPZ_II: [6.1265, 102.2464]
};

// Application State
const state = {
  currentStep: 2, // 2: Tugasan Baharu, 3: Pra-perjalanan, 4: Ke Pengambilan, 5: Di Lokasi, 6: Ke Hospital, 7: Serahan, 8: Rekod
  activeTab: 'tugasan', // 'utama' | 'tugasan' | 'rekod' | 'profil'
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
});

// =====================================================================
// 1. AUTH & ROLE GATEKEEPER
// =====================================================================
async function enforceDriverRole() {
  const user = await getCurrentAuthUser();
  const driverEmailEl = document.getElementById('driverEmailBadge');
  const driverNameEl = document.getElementById('driverProfileName');

  if (user) {
    const role = resolveUserRole(user.email, user.user_metadata);
    const email = user.email || 'diniy-driver@gmail.com';
    const name = user.user_metadata?.full_name || 'Abe Di';

    if (driverEmailEl) driverEmailEl.textContent = email;
    if (driverNameEl) driverNameEl.textContent = name;

    // If a patient visits driver page, allow testing or offer return
    if (role === 'patient') {
      const banner = document.getElementById('driverRoleNoticeBanner');
      if (banner) banner.style.display = 'flex';
    }
  } else {
    // Demo auto-assign driver identity
    if (driverEmailEl) driverEmailEl.textContent = 'diniy-driver@gmail.com';
    if (driverNameEl) driverNameEl.textContent = 'Abe Di (Pemandu EMT)';
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
      if (state.activeTab !== 'tugasan') {
        switchTab('tugasan');
      } else if (state.currentStep > 2) {
        state.currentStep--;
        renderActiveView();
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
    btnAcceptMission.addEventListener('click', () => {
      playSuccessChime();
      state.activeMission.status = 'Diterima';
      state.currentStep = 3;
      renderActiveView();
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
    btnStartPickupTrip.addEventListener('click', () => {
      playSuccessChime();
      state.activeMission.status = 'Menuju Lokasi';
      state.currentStep = 4;
      renderActiveView();
    });
  }

  // Screen 04: Saya Sudah Tiba -> Move to Screen 05
  const btnArrivedPickup = document.getElementById('btnArrivedPickup');
  if (btnArrivedPickup) {
    btnArrivedPickup.addEventListener('click', () => {
      playSuccessChime();
      state.activeMission.status = 'Di Lokasi Pengambilan';
      state.currentStep = 5;
      renderActiveView();
    });
  }

  // Screen 05: Mulakan Perjalanan ke Hospital -> Move to Screen 06
  const btnStartHospitalTrip = document.getElementById('btnStartHospitalTrip');
  if (btnStartHospitalTrip) {
    btnStartHospitalTrip.addEventListener('click', () => {
      playSuccessChime();
      state.activeMission.status = 'Menuju Hospital';
      state.currentStep = 6;
      renderActiveView();
    });
  }

  // Screen 06: Tiba di Hospital -> Move to Screen 07
  const btnArrivedHospital = document.getElementById('btnArrivedHospital');
  if (btnArrivedHospital) {
    btnArrivedHospital.addEventListener('click', () => {
      playSuccessChime();
      state.activeMission.status = 'Tiba di Hospital';
      state.currentStep = 7;
      renderActiveView();
    });
  }

  // Screen 07: Sahkan Tamat Tugasan -> Move to Screen 08
  const btnConfirmHandover = document.getElementById('btnConfirmHandover');
  if (btnConfirmHandover) {
    btnConfirmHandover.addEventListener('click', () => {
      playSuccessChime();
      state.activeMission.status = 'Selesai';
      state.currentStep = 8;
      // Switch tab to Rekod to display completion
      switchTab('rekod');
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
  if (!container || !window.L) return;

  // Cleanup old map if initialized
  if (state.mapInstances[mapId]) {
    state.mapInstances[mapId].remove();
    state.mapInstances[mapId] = null;
  }

  const map = window.L.map(mapId, {
    zoomControl: false,
    attributionControl: false
  }).setView(startCoords, 13);

  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  // Red Polyline Route
  const routePoints = [
    startCoords,
    [(startCoords[0] + endCoords[0]) / 2 + 0.005, (startCoords[1] + endCoords[1]) / 2 - 0.008],
    endCoords
  ];

  window.L.polyline(routePoints, {
    color: '#C61E2F',
    weight: 4,
    opacity: 0.9,
    dashArray: '1, 6'
  }).addTo(map);

  // Start Marker (Ambulance)
  const ambulanceIcon = window.L.divIcon({
    className: 'custom-driver-amb-icon',
    html: `<div style="background:#C61E2F;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(198,30,47,0.4);border:2px solid #fff;font-size:16px;">🚑</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  window.L.marker(startCoords, { icon: ambulanceIcon }).addTo(map);

  // End Marker (Target Pin)
  const targetIcon = window.L.divIcon({
    className: 'custom-driver-target-icon',
    html: `<div style="background:#1E293B;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.3);border:2px solid #fff;font-size:14px;">📍</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  window.L.marker(endCoords, { icon: targetIcon }).addTo(map);

  map.fitBounds(window.L.latLngBounds(routePoints), { padding: [30, 30] });
  state.mapInstances[mapId] = map;
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

  if (state.activeTab === 'utama') {
    // Show active step in mission
    const targetScreen = document.getElementById(`screen0${state.currentStep}`);
    if (targetScreen) targetScreen.classList.add('active');
    updateHeaderTitle(state.currentStep);
  } else if (state.activeTab === 'tugasan') {
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
    const screen08 = document.getElementById('screen08');
    if (screen08) screen08.classList.add('active');
    if (headerTitleEl) headerTitleEl.textContent = 'Rekod tugasan';
  } else if (state.activeTab === 'profil') {
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
