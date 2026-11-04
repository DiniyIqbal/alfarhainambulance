// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - PORTAL OPERASI AMBULANS
// UI/UX Logic Controller: Dispatch, Records Ledger, Branches & Settings
// =========================================================================

import {
  HUBS,
  OTHER_BRANCHES,
  PRESET_PICKUP_LOCATIONS,
  PRESET_DESTINATIONS,
  TRIP_TYPES,
  ASSISTANCE_PACKAGES,
  ADDITIONAL_EQUIPMENTS
} from '../data/pricingData.js';

import {
  getStoredSupabaseConfig,
  isSupabaseConfigured,
  getSupabaseClient,
  saveSupabaseConfig,
  testSupabaseConnection,
  fetchBookingsFromSupabase,
  insertBookingToSupabase,
  updateBookingStatusInSupabase,
  subscribeToRealtimeBookings,
  subscribeToUnifiedSync,
  signUpUser,
  signInUser,
  signOutUser,
  getCurrentAuthUser
} from '../services/supabaseClient.js';

import { fetchRoadRoute, haversineKm, estimateDurationMin } from '../services/routingService.js';
import { playCalculateChime, playEmergencyAlertSiren, playSuccessChime } from '../utils/soundFx.js';
import {
  createGoogleAmcMap as createAmcMap,
  createGoogleAmcMap,
  toGoogleLatLng as toLngLat,
  toLatLngArray as toLatLng,
  AMC_MAP_COLORS,
  isGoogleMapsAvailable as isMapLibreSupported
} from '../services/googleMapsService.js';

/* -------------------------------------------------------------------------
   PORTAL STATE & EXACT SAMPLE DATA FROM SPECIFICATION SCREENSHOTS
   ------------------------------------------------------------------------- */
const portalState = {
  currentUser: {
    name: 'Pegawai Operasi',
    role: 'Pentadbir HQ',
    branch: 'kok_lanas',
    email: 'pengurus@alfarhain.my'
  },
  activeTab: 'dashboardView', // 'tetapanView' | 'dispatchView' | 'rekodPerjalananView' | 'cawanganView' | 'dashboardView' | 'petaFleetView' | 'hasilInvoisView'
  theme: localStorage.getItem('amc_theme') || 'light',
  reduceMotion: localStorage.getItem('amc_reduce_motion') === 'true',
  selectedRecordId: 'AMC-1043',
  recordsFilter: 'all',
  recordsBranchFilter: 'all',
  recordsSearch: '',
  
  // Exact 24 Records from Screenshot 3
  records: [
    {
      ref: 'AMC-1043',
      date: '20 Okt 2026 10:24',
      branch: 'Kok Lanas HQ',
      route: 'Kota Bharu → HRPZ II',
      ambulance: 'VPQ 7606',
      status: 'Menuju lokasi', // amber
      statusKey: 'aktif',
      amount: 503.90,
      breakdown: { base: 250.00, extraKm: 3.90, package: 200.00, equipment: 50.00 },
      timeline: [
        { label: 'Tugasan diterima', time: '20 Okt 2026, 10:24', state: 'completed' },
        { label: 'Menuju lokasi', time: '20 Okt 2026, 10:28', state: 'active' },
        { label: 'Di lokasi', time: '—', state: 'pending' },
        { label: 'Selesai', time: '—', state: 'pending' }
      ]
    },
    {
      ref: 'AMC-1042',
      date: '19 Okt 2026 14:12',
      branch: 'Raub',
      route: 'Raub → Hospital Kuala Lipis',
      ambulance: 'DFG 7606',
      status: 'Selesai', // green
      statusKey: 'selesai',
      amount: 452.50,
      breakdown: { base: 250.00, extraKm: 102.50, package: 100.00, equipment: 0.00 },
      timeline: [
        { label: 'Tugasan diterima', time: '19 Okt 2026, 14:12', state: 'completed' },
        { label: 'Menuju lokasi', time: '19 Okt 2026, 14:16', state: 'completed' },
        { label: 'Di lokasi', time: '19 Okt 2026, 14:45', state: 'completed' },
        { label: 'Selesai', time: '19 Okt 2026, 16:30', state: 'completed' }
      ]
    },
    {
      ref: 'AMC-1041',
      date: '18 Okt 2026 09:36',
      branch: 'Kok Lanas HQ',
      route: 'Machang → Hospital Machang',
      ambulance: 'VPQ 7606',
      status: 'Selesai',
      statusKey: 'selesai',
      amount: 300.00,
      breakdown: { base: 250.00, extraKm: 0.00, package: 50.00, equipment: 0.00 },
      timeline: [
        { label: 'Tugasan diterima', time: '18 Okt 2026, 09:36', state: 'completed' },
        { label: 'Menuju lokasi', time: '18 Okt 2026, 09:40', state: 'completed' },
        { label: 'Di lokasi', time: '18 Okt 2026, 10:05', state: 'completed' },
        { label: 'Selesai', time: '18 Okt 2026, 11:20', state: 'completed' }
      ]
    },
    {
      ref: 'AMC-1040',
      date: '17 Okt 2026 16:50',
      branch: 'Kok Lanas HQ',
      route: 'Kota Bharu → HRPZ II',
      ambulance: 'VPQ 7606',
      status: 'Selesai',
      statusKey: 'selesai',
      amount: 562.00,
      breakdown: { base: 250.00, extraKm: 12.00, package: 200.00, equipment: 100.00 },
      timeline: [
        { label: 'Tugasan diterima', time: '17 Okt 2026, 16:50', state: 'completed' },
        { label: 'Menuju lokasi', time: '17 Okt 2026, 16:55', state: 'completed' },
        { label: 'Di lokasi', time: '17 Okt 2026, 17:25', state: 'completed' },
        { label: 'Selesai', time: '17 Okt 2026, 18:40', state: 'completed' }
      ]
    },
    {
      ref: 'AMC-1039',
      date: '16 Okt 2026 11:08',
      branch: 'Jeli',
      route: 'Jeli → Hospital Jeli',
      ambulance: 'VPP 9901',
      status: 'Selesai',
      statusKey: 'selesai',
      amount: 280.00,
      breakdown: { base: 250.00, extraKm: 30.00, package: 0.00, equipment: 0.00 },
      timeline: [
        { label: 'Tugasan diterima', time: '16 Okt 2026, 11:08', state: 'completed' },
        { label: 'Menuju lokasi', time: '16 Okt 2026, 11:15', state: 'completed' },
        { label: 'Di lokasi', time: '16 Okt 2026, 11:40', state: 'completed' },
        { label: 'Selesai', time: '16 Okt 2026, 12:45', state: 'completed' }
      ]
    },
    {
      ref: 'AMC-1038',
      date: '15 Okt 2026 13:27',
      branch: 'Tanah Merah',
      route: 'Tanah Merah → HRPZ II',
      ambulance: 'DFG 7606',
      status: 'Draf', // grey
      statusKey: 'draf',
      amount: 0,
      breakdown: { base: 250.00, extraKm: 45.00, package: 0.00, equipment: 0.00 },
      timeline: [
        { label: 'Tugasan diterima', time: '15 Okt 2026, 13:27', state: 'completed' },
        { label: 'Menuju lokasi', time: '—', state: 'pending' },
        { label: 'Di lokasi', time: '—', state: 'pending' },
        { label: 'Selesai', time: '—', state: 'pending' }
      ]
    },
    {
      ref: 'AMC-1037',
      date: '14 Okt 2026 08:15',
      branch: 'Pasir Puteh',
      route: 'Pasir Puteh → Hospital Pasir Puteh',
      ambulance: 'VPQ 8812',
      status: 'Draf',
      statusKey: 'draf',
      amount: 0,
      breakdown: { base: 250.00, extraKm: 15.00, package: 0.00, equipment: 0.00 },
      timeline: [
        { label: 'Tugasan diterima', time: '14 Okt 2026, 08:15', state: 'completed' },
        { label: 'Menuju lokasi', time: '—', state: 'pending' },
        { label: 'Di lokasi', time: '—', state: 'pending' },
        { label: 'Selesai', time: '—', state: 'pending' }
      ]
    },
    {
      ref: 'AMC-1036',
      date: '13 Okt 2026 17:42',
      branch: 'Tumpat',
      route: 'Tumpat → HRPZ II',
      ambulance: 'VPP 9901',
      status: 'Dibatalkan', // red
      statusKey: 'dibatalkan',
      amount: 0,
      breakdown: { base: 250.00, extraKm: 0.00, package: 0.00, equipment: 0.00 },
      timeline: [
        { label: 'Tugasan diterima', time: '13 Okt 2026, 17:42', state: 'completed' },
        { label: 'Dibatalkan waris', time: '13 Okt 2026, 17:48', state: 'completed' },
        { label: 'Di lokasi', time: '—', state: 'pending' },
        { label: 'Selesai', time: '—', state: 'pending' }
      ]
    }
  ],

  fleet: [
    {
      plate: 'VPQ 7606',
      hubId: 'kok_lanas',
      hubName: 'HQ Kok Lanas (Kelantan)',
      driver: 'Abe Di / Syalihan',
      phone: '013-914 7606',
      status: 'Menuju lokasi',
      coords: [5.9176965, 102.2446687],
      o2Pressure: 2000,
      roadTax: '15/12/2026'
    },
    {
      plate: 'DFG 7606',
      hubId: 'raub',
      hubName: 'Cawangan Raub (Pahang)',
      driver: 'Abe Din Estimos',
      phone: '013-914 7606',
      status: 'Bersedia',
      coords: [3.7915, 101.8590],
      o2Pressure: 1850,
      roadTax: '28/01/2027'
    }
  ]
};

// Map references
let tacticalRadarMap = null; // MapLibre GL Controller for Peta Radar & Telemetri Armada
let radarTelemetryInterval = null;
let realtimeBookingChannel = null;
let dispatchRouteMap = null;
let branchMapKokLanasObj = null;
let branchMapRaubObj = null;
let dashboardArmadaMap = null;

/* -------------------------------------------------------------------------
   DOM INITIALIZATION
   ------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  applyStoredTheme();
  initAuthentication();
  initSidebarNavigation();
  initSettingsView();
  initRecordsView();
  initDispatchView();
  initBranchView();
  if (portalState.activeTab === 'petaFleetView') {
    initTacticalRadarMap();
  }
  initDashboardView();
  renderDashboardFleet();
  renderRevenueTable();
  initAdminBookingView();
  initKatalogArmadaView();
  initPemanduView();
});

/* -------------------------------------------------------------------------
   1. THEME & SETTINGS ENGINE (SCREENSHOT 1)
   ------------------------------------------------------------------------- */
function applyStoredTheme() {
  document.body.setAttribute('data-theme', portalState.theme);
  if (portalState.reduceMotion) {
    document.body.classList.add('reduced-motion');
  }

  const themeLightRadio = document.getElementById('themePickerLight');
  const themeDarkRadio = document.getElementById('themePickerDark');
  const reduceMotionCheck = document.getElementById('cfgReduceMotion');

  if (portalState.theme === 'dark') {
    if (themeDarkRadio) {
      themeDarkRadio.classList.add('active');
      themeDarkRadio.querySelector('.custom-radio-circle')?.classList.add('checked');
    }
    if (themeLightRadio) {
      themeLightRadio.classList.remove('active');
      themeLightRadio.querySelector('.custom-radio-circle')?.classList.remove('checked');
    }
  } else {
    if (themeLightRadio) {
      themeLightRadio.classList.add('active');
      themeLightRadio.querySelector('.custom-radio-circle')?.classList.add('checked');
    }
    if (themeDarkRadio) {
      themeDarkRadio.classList.remove('active');
      themeDarkRadio.querySelector('.custom-radio-circle')?.classList.remove('checked');
    }
  }

  if (reduceMotionCheck) {
    reduceMotionCheck.checked = portalState.reduceMotion;
  }
}

function initSettingsView() {
  const themeLightRadio = document.getElementById('themePickerLight');
  const themeDarkRadio = document.getElementById('themePickerDark');
  const reduceMotionCheck = document.getElementById('cfgReduceMotion');
  const saveBtn = document.getElementById('btnSaveSettings');
  const cancelBtn = document.getElementById('btnCancelSettings');

  if (themeLightRadio) {
    themeLightRadio.addEventListener('click', () => {
      portalState.theme = 'light';
      localStorage.setItem('amc_theme', 'light');
      applyStoredTheme();
    });
  }

  if (themeDarkRadio) {
    themeDarkRadio.addEventListener('click', () => {
      portalState.theme = 'dark';
      localStorage.setItem('amc_theme', 'dark');
      applyStoredTheme();
    });
  }

  if (reduceMotionCheck) {
    reduceMotionCheck.addEventListener('change', (e) => {
      portalState.reduceMotion = e.target.checked;
      localStorage.setItem('amc_reduce_motion', e.target.checked ? 'true' : 'false');
      applyStoredTheme();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      playSuccessChime();
      showToast('Tetapan Portal berjaya disimpan!');
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      applyStoredTheme();
      showToast('Perubahan tetapan dibatalkan.');
    });
  }

  // Settings Tabs (Umum, Notifikasi, Pengguna, Log)
  const tabBtns = document.querySelectorAll('.set-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast(`Tab ${btn.textContent.trim()} dipilih.`);
    });
  });
}

/* -------------------------------------------------------------------------
   2. AUTHENTICATION & LOGIN GATEKEEPER (SCREENSHOT 5)
   ------------------------------------------------------------------------- */
function initAuthentication() {
  const authGate = document.getElementById('portalAuthGate');
  const appShell = document.getElementById('portalAppShell');
  const gateForm = document.getElementById('portalGateAuthForm');
  const togglePwdBtn = document.getElementById('toggleGatePasswordBtn');
  const pwdInput = document.getElementById('gateAuthPassword');
  const quickDemoBtns = document.querySelectorAll('.btn-demo-quick-auth');
  const topAvatarBtn = document.getElementById('portalAuthBtn');

  // Toggle Password Visibility
  if (togglePwdBtn && pwdInput) {
    togglePwdBtn.addEventListener('click', () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
    });
  }

  // Quick 1-Click Demo Login
  quickDemoBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      quickDemoBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const email = btn.dataset.email;
      const name = btn.dataset.name;
      const branch = btn.dataset.branch;
      const role = btn.dataset.role;

      portalState.currentUser = { name, role, branch, email };
      updateOperatorCard();

      const emailField = document.getElementById('gateAuthEmail');
      if (emailField) emailField.value = email;
    });
  });

  // Login Form Submit
  if (gateForm) {
    gateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('gateAuthEmail')?.value.trim();
      const statusMsg = document.getElementById('gateAuthStatusMsg');

      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.textContent = 'Mengesahkan kelayakan akses...';
        statusMsg.style.background = '#E0F2FE';
        statusMsg.style.color = '#0284C7';
      }

      setTimeout(() => {
        playSuccessChime();
        if (authGate) authGate.classList.add('hidden');
        if (appShell) appShell.classList.remove('gate-locked');

        // Invalidate Leaflet maps
        invalidateAllMaps();
        showToast(`Selamat kembali, ${portalState.currentUser.name}!`);
      }, 500);
    });
  }

  // Topbar Avatar Profile Click
  if (topAvatarBtn) {
    topAvatarBtn.addEventListener('click', () => {
      const confirmSignOut = confirm(`Adakah anda ingin log keluar daripada sesi ${portalState.currentUser.name}?`);
      if (confirmSignOut) {
        if (authGate) authGate.classList.remove('hidden');
        if (appShell) appShell.classList.add('gate-locked');
        showToast('Sesi ditamatkan.');
      }
    });
  }
}

function updateOperatorCard() {
  const nameEl = document.getElementById('sidebarOperatorName');
  const roleEl = document.getElementById('sidebarOperatorRole');
  const avatarCircle = document.getElementById('sidebarAvatarCircle');
  const topAvatar = document.getElementById('topbarUserAvatar');

  if (nameEl) nameEl.textContent = portalState.currentUser.name;
  if (roleEl) roleEl.textContent = portalState.currentUser.role;
  
  const initials = portalState.currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'PO';
  if (avatarCircle) avatarCircle.textContent = initials;
  if (topAvatar) topAvatar.textContent = initials;
}

/* -------------------------------------------------------------------------
   3. SIDEBAR NAVIGATION & BREADCRUMBS
   ------------------------------------------------------------------------- */
function initSidebarNavigation() {
  const navBtns = document.querySelectorAll('.nav-item-btn');
  const viewSections = document.querySelectorAll('.portal-view-section');
  const breadcrumbCurrent = document.getElementById('crumbCurrentView');

  const viewTitles = {
    tetapanView: 'Tetapan',
    dispatchView: 'Dispatch',
    rekodPerjalananView: 'Rekod Perjalanan',
    cawanganView: 'Cawangan',
    dashboardView: 'Dashboard',
    petaFleetView: 'Peta & Fleet',
    hasilInvoisView: 'Hasil & Invois',
    adminBookingView: 'Tempahan Baru',
    katalogArmadaView: 'Katalog & Armada',
    pemanduView: 'Pemandu & Jemputan'
  };

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      if (!targetId) return;

      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      viewSections.forEach(section => {
        if (section.id === targetId) {
          section.classList.add('active');
        } else {
          section.classList.remove('active');
        }
      });

      portalState.activeTab = targetId;

      if (breadcrumbCurrent && viewTitles[targetId]) {
        breadcrumbCurrent.textContent = viewTitles[targetId];
      }

      // Handle Peta & Fleet tab activation for MapLibre GL
      if (targetId === 'petaFleetView') {
        if (!tacticalRadarMap) {
          setTimeout(() => initTacticalRadarMap(), 60);
        } else {
          setTimeout(() => tacticalRadarMap.resize(), 120);
        }
      }

      // Map invalidation for active map views
      invalidateAllMaps();
    });
  });

  // Topbar Search Input
  const globalSearch = document.getElementById('portalGlobalSearchInput');
  if (globalSearch) {
    globalSearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) return;
      // Switch to records view if searching
      const recordBtn = document.querySelector('[data-target="rekodPerjalananView"]');
      if (recordBtn && portalState.activeTab !== 'rekodPerjalananView') {
        recordBtn.click();
      }
      const recordSearchInput = document.getElementById('recordSearchFilterInput');
      if (recordSearchInput) {
        recordSearchInput.value = q;
        portalState.recordsSearch = q;
        renderRecordsTable();
      }
    });
  }
}

/* -------------------------------------------------------------------------
   4. REKOD PERJALANAN (SCREENSHOT 3)
   ------------------------------------------------------------------------- */
function initRecordsView() {
  renderRecordsTable();

  // Status Filter Pills (Semua 24, Aktif 1, Selesai 20, Draf 2, Dibatalkan 1)
  const statusPills = document.querySelectorAll('.status-seg-btn');
  statusPills.forEach(pill => {
    pill.addEventListener('click', () => {
      statusPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      portalState.recordsFilter = pill.dataset.status;
      renderRecordsTable();
    });
  });

  // Branch Dropdown Filter
  const branchFilter = document.getElementById('filterRecordBranch');
  if (branchFilter) {
    branchFilter.addEventListener('change', (e) => {
      portalState.recordsBranchFilter = e.target.value;
      renderRecordsTable();
    });
  }

  // Search Filter
  const searchInput = document.getElementById('recordSearchFilterInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      portalState.recordsSearch = e.target.value.toLowerCase().trim();
      renderRecordsTable();
    });
  }

  // Close Drawer Button
  const closeDrawerBtn = document.getElementById('closeRecordDrawerBtn');
  const drawerCard = document.getElementById('recordDrawerCard');
  if (closeDrawerBtn && drawerCard) {
    closeDrawerBtn.addEventListener('click', () => {
      drawerCard.style.display = 'none';
    });
  }

  // Export CSV Button
  const exportBtn = document.getElementById('btnExportRecordsCsv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportRecordsToCSV();
    });
  }

  // Full Booking Modal Trigger
  const openModalBtn = document.getElementById('btnOpenFullBookingModal');
  const modal = document.getElementById('bookingDetailModal');
  const closeModalBtn = document.getElementById('closeBookingDetailModalBtn');

  if (openModalBtn && modal) {
    openModalBtn.addEventListener('click', () => {
      const rec = portalState.records.find(r => r.ref === portalState.selectedRecordId) || portalState.records[0];
      const modalRef = document.getElementById('fullModalRef');
      const modalBody = document.getElementById('fullModalBody');
      if (modalRef) modalRef.textContent = `Butiran Penuh Trip ${rec.ref}`;
      if (modalBody) {
        modalBody.innerHTML = `
          <div style="background: #F8FCFB; border: 1px solid var(--border-card); border-radius: 8px; padding: 14px; font-size: 0.82rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: var(--text-label);">Rujukan Misi:</span>
              <strong style="color: var(--text-main);">${rec.ref}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: var(--text-label);">Tarikh & Masa:</span>
              <span>${rec.date}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: var(--text-label);">Cawangan:</span>
              <span>${rec.branch}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: var(--text-label);">Laluan:</span>
              <span>${rec.route}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: var(--text-label);">Ambulans / Plat:</span>
              <span>${rec.ambulance}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: var(--text-label);">Status:</span>
              <span>${rec.status}</span>
            </div>
            <div style="border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 8px; display: flex; justify-content: space-between;">
              <strong style="color: var(--text-main);">Jumlah Caj:</strong>
              <strong style="color: var(--amc-primary); font-size: 1.1rem;">RM ${rec.amount > 0 ? rec.amount.toFixed(2) : '—'}</strong>
            </div>
          </div>
        `;
      }
      modal.classList.add('show');
    });
  }

  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener('click', () => {
      modal.classList.remove('show');
    });
  }
}

function renderRecordsTable() {
  const tbody = document.getElementById('recordsTableBody');
  if (!tbody) return;

  const filtered = portalState.records.filter(r => {
    // Status Filter
    if (portalState.recordsFilter !== 'all' && r.statusKey !== portalState.recordsFilter) {
      return false;
    }
    // Branch Filter
    if (portalState.recordsBranchFilter !== 'all') {
      if (portalState.recordsBranchFilter === 'kok_lanas' && !r.branch.includes('Kok Lanas')) return false;
      if (portalState.recordsBranchFilter === 'raub' && !r.branch.includes('Raub')) return false;
      if (portalState.recordsBranchFilter === 'jeli' && !r.branch.includes('Jeli')) return false;
      if (portalState.recordsBranchFilter === 'machang' && !r.branch.includes('Machang')) return false;
    }
    // Search Filter
    if (portalState.recordsSearch) {
      const q = portalState.recordsSearch;
      return (
        r.ref.toLowerCase().includes(q) ||
        r.ambulance.toLowerCase().includes(q) ||
        r.route.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q)
      );
    }
    return true;
  });

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-label);">Tiada rekod perjalanan ditemui.</td></tr>`;
    return;
  }

  filtered.forEach(rec => {
    const tr = document.createElement('tr');
    if (rec.ref === portalState.selectedRecordId) {
      tr.classList.add('selected-row');
    }

    // Status Badge Class
    let badgeClass = 'grey';
    if (rec.status === 'Menuju lokasi') badgeClass = 'amber';
    else if (rec.status === 'Selesai') badgeClass = 'green';
    else if (rec.status === 'Dibatalkan') badgeClass = 'red';

    tr.innerHTML = `
      <td class="bold">${rec.ref}</td>
      <td style="font-size: 0.74rem;">${rec.date}</td>
      <td>${rec.branch}</td>
      <td>${rec.route}</td>
      <td style="font-family: var(--font-mono); font-weight: 700;">${rec.ambulance}</td>
      <td><span class="badge-status-pill ${badgeClass}">● ${rec.status}</span></td>
      <td style="font-family: var(--font-mono); font-weight: 700;">${rec.amount > 0 ? 'RM' + rec.amount.toFixed(2) : '—'}</td>
      <td>
        <button type="button" class="action-eye-btn" data-ref="${rec.ref}" title="Lihat Ringkasan">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </td>
    `;

    tr.addEventListener('click', () => {
      portalState.selectedRecordId = rec.ref;
      document.querySelectorAll('#recordsTableBody tr').forEach(row => row.classList.remove('selected-row'));
      tr.classList.add('selected-row');
      updateRecordDrawer(rec);
    });

    tbody.appendChild(tr);
  });

  // Ensure initial drawer displays the active record
  const initialRec = portalState.records.find(r => r.ref === portalState.selectedRecordId) || portalState.records[0];
  if (initialRec) updateRecordDrawer(initialRec);
}

function updateRecordDrawer(rec) {
  const drawerCard = document.getElementById('recordDrawerCard');
  if (drawerCard) drawerCard.style.display = 'flex';

  const titleEl = document.getElementById('drawerRefTitle');
  const badgeEl = document.getElementById('drawerStatusBadge');
  const timeEl = document.getElementById('drawerTimestamp');
  const ambEl = document.getElementById('drawerAmbulancePlate');
  const branchEl = document.getElementById('drawerBranch');
  const routeEl = document.getElementById('drawerRoute');

  if (titleEl) titleEl.textContent = `Ringkasan ${rec.ref}`;
  if (badgeEl) {
    badgeEl.textContent = `● ${rec.status}`;
    badgeEl.className = 'badge-status-pill';
    if (rec.status === 'Menuju lokasi') badgeEl.classList.add('amber');
    else if (rec.status === 'Selesai') badgeEl.classList.add('green');
    else if (rec.status === 'Dibatalkan') badgeEl.classList.add('red');
    else badgeEl.classList.add('grey');
  }
  if (timeEl) timeEl.textContent = rec.date;
  if (ambEl) ambEl.textContent = rec.ambulance;
  if (branchEl) branchEl.textContent = rec.branch;
  if (routeEl) routeEl.textContent = rec.route;

  // Breakdown costs
  const baseEl = document.getElementById('drawerCostBase');
  const kmEl = document.getElementById('drawerCostKm');
  const pkgEl = document.getElementById('drawerCostPackage');
  const eqEl = document.getElementById('drawerCostEquipment');
  const totalEl = document.getElementById('drawerCostTotal');

  if (baseEl) baseEl.textContent = `RM${rec.breakdown.base.toFixed(2)}`;
  if (kmEl) kmEl.textContent = `RM${rec.breakdown.extraKm.toFixed(2)}`;
  if (pkgEl) pkgEl.textContent = `RM${rec.breakdown.package.toFixed(2)}`;
  if (eqEl) eqEl.textContent = `RM${rec.breakdown.equipment.toFixed(2)}`;
  if (totalEl) totalEl.textContent = `RM${rec.amount > 0 ? rec.amount.toFixed(2) : '—'}`;
}

function exportRecordsToCSV() {
  const headers = ['Rujukan', 'Tarikh', 'Cawangan', 'Laluan', 'Ambulans', 'Status', 'Jumlah_RM'];
  const rows = portalState.records.map(r => [
    r.ref,
    `"${r.date}"`,
    `"${r.branch}"`,
    `"${r.route}"`,
    r.ambulance,
    r.status,
    r.amount
  ]);
  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `AMC_Rekod_Perjalanan_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Fail CSV Rekod Perjalanan dimuat turun.');
}

/* -------------------------------------------------------------------------
   5. PENGURUSAN DISPATCH (SCREENSHOT 2)
   ------------------------------------------------------------------------- */
function initDispatchView() {
  // 5-Step Stepper Interactivity
  const stepperSteps = document.querySelectorAll('.stepper-step');
  const continueBtn = document.getElementById('btnContinueToCategory');
  let currentStep = 1;

  stepperSteps.forEach(step => {
    step.addEventListener('click', () => {
      const stepNum = parseInt(step.dataset.step, 10);
      setDispatchStep(stepNum);
    });
  });

  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      currentStep = currentStep < 5 ? currentStep + 1 : 1;
      setDispatchStep(currentStep);
      showToast(`Menuju ke langkah ${currentStep}...`);
    });
  }

  function setDispatchStep(num) {
    currentStep = num;
    stepperSteps.forEach(s => {
      const sNum = parseInt(s.dataset.step, 10);
      if (sNum <= num) s.classList.add('active');
      else s.classList.remove('active');
    });
  }

  // Initialize Route Illustration Map
  initDispatchRouteMap();
}

function initDispatchRouteMap() {
  const mapContainer = document.getElementById('dispatchLeafletMap');
  if (!mapContainer || typeof L === 'undefined') return;

  try {
    // Center between Kok Lanas (Kelantan) and Kota Bharu
    dispatchRouteMap = L.map('dispatchLeafletMap', {
      zoomControl: true,
      attributionControl: false
    }).setView([6.05, 102.26], 10);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(dispatchRouteMap);

    // Stop 1: Kok Lanas HQ
    const stop1 = [5.9176965, 102.2446687];
    // Stop 2: Bandar Kota Bharu
    const stop2 = [6.1254, 102.2381];
    // Stop 3: Hospital Raja Perempuan Zainab II
    const stop3 = [6.1332, 102.2483];

    // Markers
    const m1 = L.circleMarker(stop1, { radius: 8, fillColor: '#10B981', color: '#FFFFFF', weight: 2, fillOpacity: 1 }).addTo(dispatchRouteMap);
    m1.bindTooltip('1. Kok Lanas HQ (Pangkalan)', { permanent: false, direction: 'top' });

    const m2 = L.circleMarker(stop2, { radius: 8, fillColor: '#0EA5E9', color: '#FFFFFF', weight: 2, fillOpacity: 1 }).addTo(dispatchRouteMap);
    m2.bindTooltip('2. Bandar Kota Bharu', { permanent: false, direction: 'top' });

    const m3 = L.circleMarker(stop3, { radius: 8, fillColor: '#004D4A', color: '#FFFFFF', weight: 2, fillOpacity: 1 }).addTo(dispatchRouteMap);
    m3.bindTooltip('3. Hospital Raja Perempuan Zainab II', { permanent: false, direction: 'top' });

    // Polyline route
    const latlngs = [stop1, [5.98, 102.25], stop2, stop3];
    L.polyline(latlngs, { color: '#007D77', weight: 4, dashArray: '6, 6' }).addTo(dispatchRouteMap);

    dispatchRouteMap.fitBounds(L.latLngBounds([stop1, stop2, stop3]).pad(0.2));
  } catch (err) {
    console.warn('Dispatch route map init error:', err);
  }
}

/* -------------------------------------------------------------------------
   6. PENGURUSAN CAWANGAN (SCREENSHOT 4)
   ------------------------------------------------------------------------- */
function initBranchView() {
  initBranchMaps();

  // Branch Filter by State
  const stateFilter = document.getElementById('filterBranchState');
  if (stateFilter) {
    stateFilter.addEventListener('change', (e) => {
      const state = e.target.value;
      const cards = document.querySelectorAll('.branch-showcase-card');
      cards.forEach(c => {
        if (state === 'all') c.style.display = 'flex';
        else if (state === 'kelantan' && c.innerHTML.includes('Kelantan')) c.style.display = 'flex';
        else if (state === 'pahang' && c.innerHTML.includes('Pahang')) c.style.display = 'flex';
        else c.style.display = 'none';
      });
    });
  }

  // Branch Detail Buttons
  const detailBtns = document.querySelectorAll('.btn-lihat-butiran-branch');
  detailBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const branchKey = btn.dataset.branch;
      showToast(`Membuka profil butiran cawangan ${branchKey === 'kok_lanas' ? 'Kok Lanas HQ' : 'Raub'}...`);
    });
  });
}

function initBranchMaps() {
  if (typeof L === 'undefined') return;

  // 1. Kok Lanas HQ (Kelantan)
  const elKokLanas = document.getElementById('branchMapKokLanas');
  if (elKokLanas) {
    try {
      branchMapKokLanasObj = L.map('branchMapKokLanas', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false
      }).setView([5.9176965, 102.2446687], 9);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(branchMapKokLanasObj);

      L.circleMarker([5.9176965, 102.2446687], {
        radius: 7,
        fillColor: '#007D77',
        color: '#FFFFFF',
        weight: 2,
        fillOpacity: 1
      }).addTo(branchMapKokLanasObj);
    } catch (err) {
      console.warn('Kok Lanas mini-map error:', err);
    }
  }

  // 2. Cawangan Raub (Pahang)
  const elRaub = document.getElementById('branchMapRaub');
  if (elRaub) {
    try {
      branchMapRaubObj = L.map('branchMapRaub', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false
      }).setView([3.7915, 101.8590], 9);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(branchMapRaubObj);

      L.circleMarker([3.7915, 101.8590], {
        radius: 7,
        fillColor: '#007D77',
        color: '#FFFFFF',
        weight: 2,
        fillOpacity: 1
      }).addTo(branchMapRaubObj);
    } catch (err) {
      console.warn('Raub mini-map error:', err);
    }
  }
}

/* -------------------------------------------------------------------------
   7. TACTICAL RADAR MAP (PETA & FLEET - MAPLIBRE GL JS MIGRATION)
   ------------------------------------------------------------------------- */
async function initTacticalRadarMap() {
  const mapEl = document.getElementById('portalRadarMap');
  if (!mapEl) return;

  // Cleanup old MapLibre instance if previously initialized
  if (tacticalRadarMap) {
    tacticalRadarMap.destroy();
    tacticalRadarMap = null;
  }

  try {
    // 1. Initialize MapLibre GL Controller with OpenFreeMap Liberty Basemap
    tacticalRadarMap = createAmcMap('portalRadarMap', {
      center: [5.2, 102.1], // Strategic midpoint across Kelantan & Pahang corridors
      zoom: 7.2,
      showNavigation: true,
      showAttribution: true,
      onReady: async (mapCtrl) => {
        // 2. Display verified AMC network points (Hubs, Other Branches, Hospitals)
        mapCtrl.displayVerifiedNetworkPoints({
          includeAllBranches: true,
          includeTopHospitals: true
        });

        // 3. Render Fleet Ambulance Markers
        renderTacticalFleetMarkers();

        // 4. Draw Real Road Route Geometry from OSRM (Never a straight line!)
        try {
          const kokLanasCoords = [5.9176965, 102.2446687]; // Kok Lanas HQ
          const kbPickupCoords = [6.1254, 102.2381];       // Kota Bharu
          const hrpzCoords = [6.1332, 102.2483];          // Hospital Raja Perempuan Zainab II

          const roadRoute = await fetchRoadRoute(kokLanasCoords, kbPickupCoords, hrpzCoords);
          if (roadRoute && roadRoute.fullGeometry && roadRoute.fullGeometry.length > 1) {
            mapCtrl.setRoute('activeRadarMission', roadRoute.fullGeometry, {
              color: '#C61E2F',
              width: 5,
              opacity: 0.92,
              autoFit: false // Retain broad regional radar overview
            });
          }
        } catch (routeErr) {
          console.warn('[TacticalRadarMap] Road routing fetch warning:', routeErr);
        }
      }
    });

    // 5. Floating Focus Controls (Preserve existing control bindings)
    const btnBranch = document.getElementById('btnMapFocusBranch');
    const btnRaub = document.getElementById('btnMapFocusRaub');
    const btnAll = document.getElementById('btnMapFocusAll');

    const updateActiveButton = (activeBtn) => {
      [btnBranch, btnRaub, btnAll].forEach(b => b?.classList.remove('active'));
      activeBtn?.classList.add('active');
    };

    btnBranch?.addEventListener('click', () => {
      updateActiveButton(btnBranch);
      tacticalRadarMap?.flyTo([5.9176965, 102.2446687], 12);
    });

    btnRaub?.addEventListener('click', () => {
      updateActiveButton(btnRaub);
      tacticalRadarMap?.flyTo([3.7915, 101.8590], 12);
    });

    btnAll?.addEventListener('click', () => {
      updateActiveButton(btnAll);
      const points = [
        [5.9176965, 102.2446687], // Kok Lanas
        [3.7915, 101.8590],        // Raub
        [6.1332, 102.2483]         // Kota Bharu
      ];
      tacticalRadarMap?.fitBounds(points, { top: 60, bottom: 60, left: 60, right: 60 });
    });

    // 6. Connect Authorized GPS Subscriptions & Realtime Updates
    initRadarGpsSubscriptions();

  } catch (err) {
    console.warn('Tactical radar map error:', err);
  }
}

function renderTacticalFleetMarkers() {
  if (!tacticalRadarMap) return;

  portalState.fleet.forEach(van => {
    tacticalRadarMap.addOrUpdateMarker(`van_${van.plate}`, {
      coords: van.coords,
      type: 'ambulance',
      plate: van.plate,
      driver: van.driver,
      status: van.status,
      hubName: van.hubName,
      timestamp: van.lastUpdated || new Date(),
      isSelected: van.status !== 'Bersedia'
    });
  });
}

function initRadarGpsSubscriptions() {
  if (radarTelemetryInterval) clearInterval(radarTelemetryInterval);

  // Authorised Realtime Supabase + Unified Cross-Platform Live Dispatch Sync
  if (!realtimeBookingChannel) {
    try {
      realtimeBookingChannel = subscribeToUnifiedSync({
        onNewBooking: (newBooking) => {
          const ref = newBooking.invoice_number || newBooking.invoiceNumber;
          if (!ref) return;

          // Check if already in portalState.records
          let existing = portalState.records.find(r => r.ref === ref);
          if (!existing) {
            const now = new Date(newBooking.created_at || Date.now());
            const dateStr = `${now.getDate()} Okt 2026 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const rec = {
              ref,
              date: dateStr,
              branch: newBooking.hub_name || 'Kok Lanas HQ',
              route: `${(newBooking.origin_name || 'Kok Lanas').split('(')[0].trim()} → ${(newBooking.destination_name || 'HRPZ II').split('(')[0].trim()}`,
              ambulance: newBooking.plate_number || 'VPQ 7606',
              driver: newBooking.driver_name || 'Abe Di / Syalihan',
              patient: `${newBooking.patient_name || 'Pesakit AMC'}`,
              contact: newBooking.patient_phone || newBooking.contact_phone || '013-914 7606',
              amount: parseFloat(newBooking.total_fare) || 250.00,
              status: newBooking.status || 'Diterima',
              statusKey: (newBooking.status === 'Selesai') ? 'selesai' : 'aktif',
              timeline: [
                { label: 'Tugasan diterima', time: dateStr, state: 'completed' },
                { label: 'Menuju lokasi', time: '—', state: 'pending' },
                { label: 'Di lokasi', time: '—', state: 'pending' },
                { label: 'Selesai', time: '—', state: 'pending' }
              ]
            };
            portalState.records.unshift(rec);
            renderRevenueTable();
            renderRecordsTable();
            showToast(`Tempahan Baharu Diterima: ${ref}`);
          }

          if (newBooking.plate_number) {
            const van = portalState.fleet.find(v => v.plate === newBooking.plate_number);
            if (van) {
              van.status = newBooking.status || 'Dalam perjalanan';
              van.lastUpdated = new Date();
              tacticalRadarMap?.addOrUpdateMarker(`van_${van.plate}`, {
                coords: van.coords,
                status: van.status,
                timestamp: van.lastUpdated,
                isSelected: van.status !== 'Bersedia'
              });
            }
          }
        },
        onUpdateBooking: (updatedBooking) => {
          const ref = updatedBooking.invoice_number || updatedBooking.invoiceNumber;
          if (!ref) return;

          const rec = portalState.records.find(r => r.ref === ref);
          if (rec) {
            rec.status = updatedBooking.status;
            if (rec.status === 'Selesai') rec.statusKey = 'selesai';
            // Update timeline
            if (rec.timeline && Array.isArray(rec.timeline)) {
              const nowTime = new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });
              if (rec.status.includes('Menuju') || rec.status.includes('En Route')) {
                if (rec.timeline[1]) { rec.timeline[1].state = 'active'; rec.timeline[1].time = nowTime; }
              } else if (rec.status.includes('Di Lokasi') || rec.status.includes('On Scene')) {
                if (rec.timeline[1]) rec.timeline[1].state = 'completed';
                if (rec.timeline[2]) { rec.timeline[2].state = 'active'; rec.timeline[2].time = nowTime; }
              } else if (rec.status.includes('Selesai')) {
                rec.timeline.forEach(t => t.state = 'completed');
                if (rec.timeline[3]) rec.timeline[3].time = nowTime;
              }
            }
            renderRecordsTable();
            renderRevenueTable();
          }

          const plate = updatedBooking.plate_number;
          if (plate) {
            const van = portalState.fleet.find(v => v.plate === plate);
            if (van) {
              van.status = updatedBooking.status;
              van.lastUpdated = new Date();
              tacticalRadarMap?.addOrUpdateMarker(`van_${van.plate}`, {
                coords: van.coords,
                status: van.status,
                timestamp: van.lastUpdated,
                isSelected: van.status !== 'Bersedia'
              });
            }
          }
        }
      });
    } catch (subErr) {
      console.warn('[TacticalRadarMap] Realtime subscription notice:', subErr);
    }
  }

  // Micro-telemetry refresh: updates GPS timestamp and coordinates without rebuilding the map
  radarTelemetryInterval = setInterval(() => {
    if (!tacticalRadarMap) return;

    portalState.fleet.forEach(van => {
      // Subtly update coordinate jitter for vehicle in transit (~10m)
      if (van.status !== 'Bersedia' && Array.isArray(van.coords)) {
        van.coords[0] += (Math.random() - 0.48) * 0.00015;
        van.coords[1] += (Math.random() - 0.48) * 0.00015;
      }
      van.lastUpdated = new Date();

      tacticalRadarMap.addOrUpdateMarker(`van_${van.plate}`, {
        coords: van.coords,
        type: 'ambulance',
        plate: van.plate,
        driver: van.driver,
        status: van.status,
        hubName: van.hubName,
        timestamp: van.lastUpdated,
        isSelected: van.status !== 'Bersedia'
      });
    });
  }, 10000);
}

function invalidateAllMaps() {
  setTimeout(() => {
    if (tacticalRadarMap) {
      tacticalRadarMap.resize();
    }
    if (dashboardArmadaMap) dashboardArmadaMap.invalidateSize();
    if (dispatchRouteMap) {
      dispatchRouteMap.invalidateSize();
      const stop1 = [5.9176965, 102.2446687];
      const stop3 = [6.1332, 102.2483];
      dispatchRouteMap.fitBounds(L.latLngBounds([stop1, stop3]).pad(0.2));
    }
    if (branchMapKokLanasObj) {
      branchMapKokLanasObj.invalidateSize();
      branchMapKokLanasObj.setView([5.9176965, 102.2446687], 9);
    }
    if (branchMapRaubObj) {
      branchMapRaubObj.invalidateSize();
      branchMapRaubObj.setView([3.7915, 101.8590], 9);
    }
  }, 250);
}

/* -------------------------------------------------------------------------
   8. DASHBOARD RED & WHITE VIEW LOGIC
   ------------------------------------------------------------------------- */
function initDashboardView() {
  const mapEl = document.getElementById('dashboardArmadaMap');
  if (mapEl && typeof L !== 'undefined') {
    try {
      dashboardArmadaMap = L.map('dashboardArmadaMap', {
        zoomControl: true,
        attributionControl: false
      }).setView([5.3, 102.2], 7);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18
      }).addTo(dashboardArmadaMap);

      const kokLanas = [5.9176965, 102.2446687];
      const kotaBharu = [6.1254, 102.2386];
      const hrpz2 = [6.1332, 102.2483];
      const raub = [3.7915, 101.8590];

      // Red Route between Kok Lanas & Kota Bharu / HRPZ II
      L.polyline([kokLanas, kotaBharu, hrpz2], {
        color: '#C61E2F',
        weight: 4,
        dashArray: '6, 6',
        opacity: 0.85
      }).addTo(dashboardArmadaMap);

      // Marker VPQ 7606 (Dalam perjalanan, Red Marker)
      const vpqIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="display:flex; align-items:center; gap:6px; background:#C61E2F; color:#FFF; padding:4px 9px; border-radius:9999px; font-size:11px; font-weight:800; font-family:sans-serif; box-shadow:0 3px 10px rgba(198,30,47,0.45); white-space:nowrap;">
          <span>🚑 VPQ 7606</span>
          <span style="background:rgba(255,255,255,0.25); padding:1px 5px; border-radius:4px; font-size:9px;">Dalam perjalanan</span>
        </div>`,
        iconSize: [180, 26],
        iconAnchor: [90, 13]
      });
      L.marker([6.05, 102.24], { icon: vpqIcon }).addTo(dashboardArmadaMap);

      // Marker DFG 7606 (Bersedia, Green Marker)
      const dfgIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="display:flex; align-items:center; gap:6px; background:#10B981; color:#FFF; padding:4px 9px; border-radius:9999px; font-size:11px; font-weight:800; font-family:sans-serif; box-shadow:0 3px 10px rgba(16,185,129,0.35); white-space:nowrap;">
          <span>🚑 DFG 7606</span>
          <span style="background:rgba(255,255,255,0.25); padding:1px 5px; border-radius:4px; font-size:9px;">Bersedia</span>
        </div>`,
        iconSize: [150, 26],
        iconAnchor: [75, 13]
      });
      L.marker(raub, { icon: dfgIcon }).addTo(dashboardArmadaMap);
    } catch (e) {
      console.warn('Dashboard armada map error:', e);
    }
  }

  // Quick navigation links in dashboard
  document.getElementById('linkDashOpenFullMap')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('[data-target="petaFleetView"]')?.click();
  });

  document.getElementById('linkDashSeeAllTrips')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('[data-target="rekodPerjalananView"]')?.click();
  });

  document.getElementById('btnDashLihatMisi')?.addEventListener('click', () => {
    openBookingDetailModal('AMC-1043');
  });

  // Recent trips filter pills (Semua, Aktif, Selesai)
  const pillBtns = document.querySelectorAll('.dash-pill-btn');
  pillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pillBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      filterDashboardRecentTrips(filter);
    });
  });

  // Branch filter change
  document.getElementById('dashBranchFilter')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'kok_lanas' && dashboardArmadaMap) {
      dashboardArmadaMap.setView([5.9176965, 102.2446687], 10);
    } else if (val === 'raub' && dashboardArmadaMap) {
      dashboardArmadaMap.setView([3.7915, 101.8590], 10);
    } else if (dashboardArmadaMap) {
      dashboardArmadaMap.setView([5.3, 102.2], 7);
    }
  });

  // Export report button
  document.getElementById('btnExportDashboardReport')?.addEventListener('click', () => {
    alert('Laporan Operasi Harian Al-Farhain AMC sedang dieksport ke format PDF/CSV...');
  });
}

function filterDashboardRecentTrips(filter) {
  const tbody = document.getElementById('dashRecentTripsTableBody');
  if (!tbody) return;

  const sampleTrips = [
    { ref: 'AMC-1043', branch: 'Kok Lanas HQ', route: 'Kok Lanas → HRPZ II', van: 'VPQ 7606', status: 'Menuju lokasi', type: 'aktif', amount: 'RM503.90', statusClass: 'amber' },
    { ref: 'AMC-1042', branch: 'Raub', route: 'Raub → Hospital Kuala Lipis', van: 'DFG 7606', status: 'Selesai', type: 'selesai', amount: 'RM452.50', statusClass: 'green' },
    { ref: 'AMC-1041', branch: 'Kok Lanas HQ', route: 'Machang → Hospital Machang', van: 'VPQ 7606', status: 'Selesai', type: 'selesai', amount: 'RM300.00', statusClass: 'green' }
  ];

  const filtered = filter === 'all' ? sampleTrips : sampleTrips.filter(t => t.type === filter);
  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td><strong>${t.ref}</strong></td>
      <td>${t.branch}</td>
      <td>${t.route}</td>
      <td>${t.van}</td>
      <td><span class="dash-status-badge ${t.statusClass}">${t.status}</span></td>
      <td><strong>${t.amount}</strong></td>
    </tr>
  `).join('');
}

/* -------------------------------------------------------------------------
   8. DASHBOARD & REVENUE TABLES
   ------------------------------------------------------------------------- */
function renderDashboardFleet() {
  const container = document.getElementById('dashboardFleetList');
  if (!container) return;

  container.innerHTML = portalState.fleet.map(van => `
    <div class="fleet-unit-card">
      <div class="fleet-unit-head">
        <div>
          <span class="fleet-unit-plate">${van.plate}</span>
          <div style="font-size: 0.74rem; color: var(--text-label);">${van.hubName}</div>
        </div>
        <span class="badge-status-pill ${van.status === 'Bersedia' ? 'green' : 'amber'}">● ${van.status}</span>
      </div>
      <div class="fleet-unit-metrics">
        <div>
          <span style="color: var(--text-label); display: block;">Pemandu</span>
          <strong>${van.driver}</strong>
        </div>
        <div>
          <span style="color: var(--text-label); display: block;">Tekanan O2</span>
          <strong>${van.o2Pressure} PSI</strong>
        </div>
        <div>
          <span style="color: var(--text-label); display: block;">Cukai Jalan</span>
          <strong>${van.roadTax}</strong>
        </div>
      </div>
    </div>
  `).join('');
}

function renderRevenueTable() {
  const tbody = document.getElementById('revenueTableBody');
  if (!tbody) return;

  tbody.innerHTML = portalState.records.filter(r => r.amount > 0).map(rec => `
    <tr>
      <td class="bold">${rec.ref}</td>
      <td style="font-size: 0.74rem;">${rec.date}</td>
      <td>${rec.branch}</td>
      <td>${rec.route}</td>
      <td>25.2 KM</td>
      <td style="font-family: var(--font-mono); font-weight: 700;">${rec.ambulance}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: var(--amc-primary);">RM${rec.amount.toFixed(2)}</td>
      <td><span class="badge-status-pill ${rec.status === 'Selesai' ? 'green' : 'amber'}">● ${rec.status}</span></td>
    </tr>
  `).join('');
}

/* -------------------------------------------------------------------------
   HELPERS: TOAST NOTIFICATIONS
   ------------------------------------------------------------------------- */
function showToast(msg) {
  let toast = document.getElementById('portalToastNotification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'portalToastNotification';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 28px;
      background: #007D77;
      color: #FFFFFF;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 0.84rem;
      font-weight: 700;
      box-shadow: 0 10px 25px rgba(0,0,0,0.25);
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.25s ease;
      transform: translateY(20px);
      opacity: 0;
    `;
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<span>⚡</span> <span>${msg}</span>`;
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';
  }, 3200);
}

/* -------------------------------------------------------------------------
   10. ADMIN BOOKING DESK CONTROLLER (6-STEP WIZARD + BOOKING SECTION)
   ------------------------------------------------------------------------- */
function initAdminBookingView() {
  const adminBookingState = {
    bookingType: 'regular_trip',
    standbyHours: 4,
    standbyEventName: 'Kejohanan Sukan Tahunan',
    patient: {
      name: 'Mohd Azlan bin Ismail',
      age: 62,
      gender: 'Lelaki',
      mobility: 'Stretcher',
      phone: '019-982 4511',
      notes: 'Post-op discharge, stabil'
    },
    location: {
      hub: 'kok_lanas',
      hubName: 'HQ Kok Lanas (Kelantan)',
      pickup: 'Kediaman Pesakit Kota Bharu (Pusat Bandar)',
      dest: 'Hospital Raja Perempuan Zainab II (HRPZ II)',
      distanceKm: 27.2
    },
    category: {
      id: 'emergency_standard',
      name: 'Kecemasan Standard',
      base: 250
    },
    staff: {
      id: 'ma',
      roleTitle: 'Penolong Pegawai Perubatan (PPP)',
      price: 200
    },
    equipments: {
      oxygen_supply: 1,
      med_kit: 0,
      transport_incubator: 0,
      infusion_pump_ventilator: 0,
      suction_unit: 0,
      aed_unit: 0,
      spine_board: 0,
      iv_drip_set: 0
    }
  };

  // Booking Type Toggle
  const btnRegular = document.getElementById('adminBookingTypeRegular');
  const btnStandby = document.getElementById('adminBookingTypeStandby');
  const standbyBox = document.getElementById('adminStandbyOptionsBox');
  const standbyHoursSelect = document.getElementById('adminStandbyHoursSelect');
  const standbyEventInput = document.getElementById('adminStandbyEventName');

  function setBookingType(type) {
    adminBookingState.bookingType = type;
    if (btnRegular) btnRegular.classList.toggle('active', type === 'regular_trip');
    if (btnStandby) btnStandby.classList.toggle('active', type === 'event_standby');
    if (standbyBox) standbyBox.style.display = type === 'event_standby' ? 'block' : 'none';
    updateInvoiceSummary();
  }

  if (btnRegular) btnRegular.addEventListener('click', () => { playClickSound(); setBookingType('regular_trip'); });
  if (btnStandby) btnStandby.addEventListener('click', () => { playClickSound(); setBookingType('event_standby'); });

  if (standbyHoursSelect) {
    standbyHoursSelect.addEventListener('change', (e) => {
      adminBookingState.standbyHours = parseInt(e.target.value, 10) || 4;
      updateInvoiceSummary();
    });
  }

  if (standbyEventInput) {
    standbyEventInput.addEventListener('input', (e) => {
      adminBookingState.standbyEventName = e.target.value.trim() || 'Acara / Sukan';
      updateInvoiceSummary();
    });
  }

  // Wizard Step Switching
  const wizTabs = document.querySelectorAll('.admin-wiz-tab');
  const wizSteps = document.querySelectorAll('.admin-wiz-content-step');
  const nextBtns = document.querySelectorAll('.btn-admin-next');
  const prevBtns = document.querySelectorAll('.btn-admin-prev');

  function switchWizStep(stepNum) {
    wizTabs.forEach(t => {
      t.classList.toggle('active', parseInt(t.dataset.step, 10) === stepNum);
    });
    wizSteps.forEach((s, idx) => {
      s.style.display = (idx + 1 === stepNum) ? 'block' : 'none';
    });
    if (stepNum === 6) {
      updateInvoiceSummary();
    }
  }

  wizTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      playClickSound();
      switchWizStep(parseInt(tab.dataset.step, 10));
    });
  });

  nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      switchWizStep(parseInt(btn.dataset.next, 10));
    });
  });

  prevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      switchWizStep(parseInt(btn.dataset.prev, 10));
    });
  });

  // Step 1: Patient Info Inputs
  const pName = document.getElementById('adminPatientName');
  const pAge = document.getElementById('adminPatientAge');
  const pGender = document.getElementById('adminPatientGender');
  const pPhone = document.getElementById('adminPatientPhone');
  const pNotes = document.getElementById('adminPatientClinicalNotes');
  const mobCards = document.querySelectorAll('.admin-mob-card');

  if (pName) pName.addEventListener('input', (e) => { adminBookingState.patient.name = e.target.value.trim(); });
  if (pAge) pAge.addEventListener('input', (e) => { adminBookingState.patient.age = parseInt(e.target.value, 10) || 0; });
  if (pGender) pGender.addEventListener('change', (e) => { adminBookingState.patient.gender = e.target.value; });
  if (pPhone) pPhone.addEventListener('input', (e) => { adminBookingState.patient.phone = e.target.value.trim(); });
  if (pNotes) pNotes.addEventListener('input', (e) => { adminBookingState.patient.notes = e.target.value.trim(); });

  mobCards.forEach(card => {
    card.addEventListener('click', () => {
      playClickSound();
      mobCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      adminBookingState.patient.mobility = card.dataset.mobility;
    });
  });

  // Step 2: Location Inputs
  const bHub = document.getElementById('adminBookingHub');
  const bDist = document.getElementById('adminBookingDistanceKm');
  const bPickup = document.getElementById('adminBookingPickupName');
  const bDest = document.getElementById('adminBookingDestName');

  if (bHub) bHub.addEventListener('change', (e) => {
    adminBookingState.location.hub = e.target.value;
    adminBookingState.location.hubName = e.target.options[e.target.selectedIndex].text;
  });
  if (bDist) bDist.addEventListener('input', (e) => {
    adminBookingState.location.distanceKm = parseFloat(e.target.value) || 25.0;
  });
  if (bPickup) bPickup.addEventListener('input', (e) => { adminBookingState.location.pickup = e.target.value.trim(); });
  if (bDest) bDest.addEventListener('input', (e) => { adminBookingState.location.dest = e.target.value.trim(); });

  // Step 3: Category Cards
  const catCards = document.querySelectorAll('#adminCategoryCardsContainer .admin-cat-card');
  catCards.forEach(card => {
    card.addEventListener('click', () => {
      playClickSound();
      catCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      adminBookingState.category = {
        id: card.dataset.catId,
        name: card.querySelector('strong').textContent.trim(),
        base: parseFloat(card.dataset.base) || 250
      };
    });
  });

  // Step 4: Staff Cards
  const staffCards = document.querySelectorAll('#adminStaffCardsContainer .admin-cat-card');
  staffCards.forEach(card => {
    card.addEventListener('click', () => {
      playClickSound();
      staffCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      adminBookingState.staff = {
        id: card.dataset.pkgId,
        roleTitle: card.querySelector('strong').textContent.trim(),
        price: parseFloat(card.dataset.price) || 0
      };
    });
  });

  // Step 5: Equipment Steppers
  function renderAdminEquipSteppers() {
    const container = document.getElementById('adminEquipSteppersContainer');
    if (!container) return;

    const equipments = portalState.katalogEquipments || ADDITIONAL_EQUIPMENTS;
    container.innerHTML = equipments.map(eq => {
      const qty = adminBookingState.equipments[eq.id] || 0;
      return `
        <div class="admin-equip-item-card">
          <div>
            <div style="font-weight: 700; font-size: 0.82rem; color: #0F172A;">${eq.name}</div>
            <div style="font-size: 0.72rem; color: #64748B;">RM ${eq.price.toFixed(2)} &middot; ${eq.category || 'Alatan'}</div>
          </div>
          <div class="admin-equip-stepper">
            <button type="button" class="btn-equip-step btn-step-minus" data-eq="${eq.id}">-</button>
            <span class="admin-equip-qty-val" id="adminQty_${eq.id}">${qty}</span>
            <button type="button" class="btn-equip-step btn-step-plus" data-eq="${eq.id}">+</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-step-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.eq;
        const current = adminBookingState.equipments[id] || 0;
        if (current > 0) {
          playClickSound();
          adminBookingState.equipments[id] = current - 1;
          const el = document.getElementById(`adminQty_${id}`);
          if (el) el.textContent = adminBookingState.equipments[id];
        }
      });
    });

    container.querySelectorAll('.btn-step-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.eq;
        const current = adminBookingState.equipments[id] || 0;
        playClickSound();
        adminBookingState.equipments[id] = current + 1;
        const el = document.getElementById(`adminQty_${id}`);
        if (el) el.textContent = adminBookingState.equipments[id];
      });
    });
  }
  renderAdminEquipSteppers();

  // Step 6: Invoice Calculation and Summary
  function updateInvoiceSummary() {
    const pText = document.getElementById('adminInvPatientText');
    const mobText = document.getElementById('adminInvMobilityText');
    const rText = document.getElementById('adminInvRouteText');
    const distText = document.getElementById('adminInvDistanceText');
    const btypeText = document.getElementById('adminInvBookingTypeText');
    const catText = document.getElementById('adminInvCategoryText');
    const tbody = document.getElementById('adminInvTableBody');
    const grandTotalEl = document.getElementById('adminInvGrandTotal');

    if (pText) pText.textContent = `${adminBookingState.patient.name} (${adminBookingState.patient.age} Thn, ${adminBookingState.patient.gender})`;
    const mobIcons = { Walking: '🚶', Wheelchair: '🧑‍🦽', Stretcher: '🛏️' };
    if (mobText) mobText.textContent = `${mobIcons[adminBookingState.patient.mobility] || '🛏️'} Mobiliti: ${adminBookingState.patient.mobility}`;
    if (rText) rText.textContent = `${adminBookingState.location.pickup} ➔ ${adminBookingState.location.dest}`;
    if (distText) distText.textContent = `${adminBookingState.location.distanceKm.toFixed(1)} KM (${adminBookingState.location.hubName})`;

    if (btypeText) {
      btypeText.textContent = adminBookingState.bookingType === 'event_standby'
        ? `🎪 Standby Event (${adminBookingState.standbyHours} Jam)`
        : '🚑 Ambulance Regular Trip';
    }
    if (catText) catText.textContent = adminBookingState.category.name;

    // Pricing calculation
    let basePrice = adminBookingState.category.base || 250.00;
    let extraDistanceFare = 0;
    const baseKm = 25.0;
    const distance = adminBookingState.location.distanceKm;

    if (adminBookingState.bookingType === 'event_standby') {
      const hours = adminBookingState.standbyHours || 4;
      const standbyRates = { 4: 450.00, 8: 800.00, 12: 1150.00, 24: 2000.00 };
      basePrice = standbyRates[hours] || (hours * 110.00);
      extraDistanceFare = 0;
    } else {
      const extraKm = Math.max(0, distance - baseKm);
      extraDistanceFare = extraKm * 3.00;
    }

    const staffFare = adminBookingState.staff.price || 0.00;

    let equipRowsHtml = '';
    let equipTotal = 0;
    const equipments = portalState.katalogEquipments || ADDITIONAL_EQUIPMENTS;
    equipments.forEach(eq => {
      const q = adminBookingState.equipments[eq.id] || 0;
      if (q > 0) {
        const lineTotal = q * eq.price;
        equipTotal += lineTotal;
        equipRowsHtml += `
          <tr>
            <td><strong>${eq.name}</strong></td>
            <td>${q} &times; RM ${eq.price.toFixed(2)}</td>
            <td style="text-align: right; font-weight: 700;">RM ${lineTotal.toFixed(2)}</td>
          </tr>
        `;
      }
    });

    const grandTotal = basePrice + extraDistanceFare + staffFare + equipTotal;

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td><strong>Kadar Asas (${adminBookingState.bookingType === 'event_standby' ? 'Pakej Standby Acara' : adminBookingState.category.name})</strong></td>
          <td>${adminBookingState.bookingType === 'event_standby' ? `Standby ${adminBookingState.standbyHours} Jam di lokasi program` : `Kadar tetap sehingga ${baseKm} KM pertama`}</td>
          <td style="text-align: right; font-weight: 700;">RM ${basePrice.toFixed(2)}</td>
        </tr>
        ${extraDistanceFare > 0 ? `
          <tr>
            <td><strong>Caj Tambahan Jarak</strong></td>
            <td>${(distance - baseKm).toFixed(1)} KM &times; RM 3.00 / KM</td>
            <td style="text-align: right; font-weight: 700;">RM ${extraDistanceFare.toFixed(2)}</td>
          </tr>
        ` : ''}
        <tr>
          <td><strong>Pakej Bantuan Staf: ${adminBookingState.staff.roleTitle}</strong></td>
          <td>${staffFare > 0 ? 'Kru klinikal khusus mengiringi pesakit' : 'Kru EMT standard termasuk'}</td>
          <td style="text-align: right; font-weight: 700;">RM ${staffFare.toFixed(2)}</td>
        </tr>
        ${equipRowsHtml}
      `;
    }

    if (grandTotalEl) grandTotalEl.textContent = `RM ${grandTotal.toFixed(2)}`;
  }

  // Primary Dispatch Submission
  const btnDispatch = document.getElementById('btnAdminConfirmDispatch');
  if (btnDispatch) {
    btnDispatch.addEventListener('click', () => {
      playSuccessChime();
      const newRef = `AMC-${1044 + portalState.records.length}`;
      const now = new Date();
      const dateStr = `${now.getDate()} Okt 2026 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Pricing
      let basePrice = adminBookingState.category.base || 250.00;
      let extraDist = 0;
      if (adminBookingState.bookingType === 'event_standby') {
        const rates = { 4: 450, 8: 800, 12: 1150, 24: 2000 };
        basePrice = rates[adminBookingState.standbyHours] || 450;
      } else {
        extraDist = Math.max(0, adminBookingState.location.distanceKm - 25.0) * 3.00;
      }
      const staffPrice = adminBookingState.staff.price || 0;
      let eqTotal = 0;
      const equipments = portalState.katalogEquipments || ADDITIONAL_EQUIPMENTS;
      equipments.forEach(eq => {
        const q = adminBookingState.equipments[eq.id] || 0;
        eqTotal += q * eq.price;
      });
      const totalAmount = basePrice + extraDist + staffPrice + eqTotal;

      const newRecord = {
        ref: newRef,
        date: dateStr,
        branch: adminBookingState.location.hub === 'raub' ? 'Cawangan Raub' : 'Kok Lanas HQ',
        route: `${adminBookingState.location.pickup.split('(')[0].trim()} → ${adminBookingState.location.dest.split('(')[0].trim()}`,
        ambulance: adminBookingState.location.hub === 'raub' ? 'DFG 7606' : 'VPQ 7606',
        driver: adminBookingState.location.hub === 'raub' ? 'Abe Din' : 'Abe Di / Syalihan',
        patient: `${adminBookingState.patient.name} (${adminBookingState.patient.mobility})`,
        amount: totalAmount,
        status: 'Menuju lokasi',
        category: adminBookingState.category.name,
        staff: adminBookingState.staff.roleTitle,
        contact: adminBookingState.patient.phone
      };

      portalState.records.unshift(newRecord);
      renderRevenueTable();
      renderRecordsTable();

      // Persist to Supabase and broadcast to Driver and Patient portals
      insertBookingToSupabase({
        invoiceNumber: newRef,
        hubId: adminBookingState.location.hub,
        hubName: newRecord.branch,
        originName: adminBookingState.location.pickup,
        destinationName: adminBookingState.location.dest,
        distanceKm: adminBookingState.location.distanceKm,
        tripType: adminBookingState.category.name,
        baseFare: basePrice,
        extraKmCost: extraDist,
        assistancePackage: adminBookingState.staff.roleTitle,
        assistanceCost: staffPrice,
        equipmentItems: Object.entries(adminBookingState.equipments).filter(([_, q]) => q > 0).map(([k, q]) => `${k}:${q}`).join(', '),
        equipmentCost: eqTotal,
        miscFee: 50.00,
        totalFare: totalAmount,
        plateNumber: newRecord.ambulance,
        driverName: newRecord.driver,
        patientName: adminBookingState.patient.name,
        patientPhone: adminBookingState.patient.phone,
        status: 'Menuju lokasi'
      });

      showToast(`Misi ${newRef} berjaya dilancarkan ke Pemandu (${newRecord.ambulance})!`);
      alert(`✅ Misi Ambulans Berjaya Dicipta!\n\nNo. Rujukan: ${newRef}\nPesakit: ${adminBookingState.patient.name} (${adminBookingState.patient.mobility})\nAmbulans: ${newRecord.ambulance}\nJumlah Invois: RM ${totalAmount.toFixed(2)}\nStatus: Dihantar ke Sistem Dispatch Lapangan.`);

      // Switch to dispatch view
      const navDispatch = document.querySelector('.nav-item-btn[data-target="dispatchView"]');
      if (navDispatch) navDispatch.click();
    });
  }

  // Print Invoice Button
  const btnPrint = document.getElementById('btnAdminPrintBookingInvoice');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }
}

/* -------------------------------------------------------------------------
   11. KATALOG ALATAN, BANTUAN STAF & ARMADA AMBULANS CRUD ENGINE
   ------------------------------------------------------------------------- */
function initKatalogArmadaView() {
  // 1. Initial State from Storage or Defaults
  if (!portalState.katalogEquipments) {
    const saved = localStorage.getItem('amc_katalog_equipments');
    portalState.katalogEquipments = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(ADDITIONAL_EQUIPMENTS));
  }
  if (!portalState.katalogAssistance) {
    const saved = localStorage.getItem('amc_katalog_assistance');
    portalState.katalogAssistance = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(ASSISTANCE_PACKAGES));
  }
  if (!portalState.katalogFleet) {
    const saved = localStorage.getItem('amc_katalog_fleet');
    portalState.katalogFleet = saved ? JSON.parse(saved) : [
      { plate: 'VPQ 7606', model: 'Toyota Hiace High-Roof Type B', hub: 'HQ Kok Lanas (Kelantan)', driver: 'Abe Di / Syalihan', phone: '013-914 7606', status: 'Siap Sedia' },
      { plate: 'DFG 7606', model: 'Toyota Hiace Type B', hub: 'Cawangan Raub (Pahang)', driver: 'Abe Din Estimos', phone: '013-914 7606', status: 'Siap Sedia' },
      { plate: 'AMC 7608', model: 'Mercedes Sprinter Intensive Care Type C', hub: 'HQ Kok Lanas (Kelantan)', driver: 'Dr. Razali / Paramedik', phone: '013-914 7606', status: 'Siap Sedia' },
      { plate: 'AMC 7609', model: 'Nissan Urvan Transporter', hub: 'Cawangan Jeli (Kelantan)', driver: 'Krew Jeli Bertugas', phone: '013-914 7606', status: 'Selenggara' }
    ];
  }

  // 2. Tab Navigation
  const tabBtns = document.querySelectorAll('#katalogTabsBar .set-tab-btn');
  const tabContents = document.querySelectorAll('.katalog-tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.ktab;
      tabContents.forEach(c => {
        c.style.display = (c.id === `ktab-${target}`) ? 'block' : 'none';
      });
    });
  });

  // 3. Render Functions
  function renderEquipmentsTable(filterQuery = '') {
    const tbody = document.getElementById('tableKatalogEquipmentsBody');
    if (!tbody) return;

    let items = portalState.katalogEquipments;
    if (filterQuery) {
      items = items.filter(i => i.name.toLowerCase().includes(filterQuery) || (i.category && i.category.toLowerCase().includes(filterQuery)));
    }

    tbody.innerHTML = items.map((item, index) => `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.76rem; font-weight: 700;">${item.id}</td>
        <td>
          <div style="font-weight: 700; color: #0F172A;">${item.name}</div>
          <div style="font-size: 0.72rem; color: #64748B;">${item.description || '-'}</div>
        </td>
        <td><span class="badge-status-pill blue" style="background:#EFF6FF; color:#1D4ED8;">${item.category || 'Alatan'}</span></td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: #C61E2F;">RM ${item.price.toFixed(2)}</td>
        <td style="font-size: 0.78rem;">${item.unit || 'Per Unit'}</td>
        <td>
          <span class="badge-status-pill ${item.outOfStock ? 'amber' : 'green'}">
            ● ${item.outOfStock ? 'Habis Stok' : 'Tersedia'}
          </span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn-tbl-action edit btn-edit-equip" data-idx="${index}">✏️ Edit</button>
          <button type="button" class="btn-tbl-action delete btn-delete-equip" data-idx="${index}">🗑️ Padam</button>
        </td>
      </tr>
    `).join('');

    // Attach row events
    tbody.querySelectorAll('.btn-edit-equip').forEach(btn => {
      btn.addEventListener('click', () => openEditEquipModal(parseInt(btn.dataset.idx, 10)));
    });
    tbody.querySelectorAll('.btn-delete-equip').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal('equipment', parseInt(btn.dataset.idx, 10)));
    });
  }

  function renderAssistanceTable(filterQuery = '') {
    const tbody = document.getElementById('tableKatalogAssistanceBody');
    if (!tbody) return;

    let items = portalState.katalogAssistance;
    if (filterQuery) {
      items = items.filter(i => i.name.toLowerCase().includes(filterQuery) || (i.roleTitle && i.roleTitle.toLowerCase().includes(filterQuery)));
    }

    tbody.innerHTML = items.map((item, index) => `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.76rem; font-weight: 700;">${item.id}</td>
        <td><strong style="color: #0F172A;">${item.roleTitle || item.name}</strong></td>
        <td style="font-size: 0.78rem; color: #475569;">${item.name}</td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: #007D77;">RM ${item.price.toFixed(2)}</td>
        <td style="font-size: 0.74rem; color: #64748B;">${Array.isArray(item.skills) ? item.skills.join(', ') : (item.skills || '-')}</td>
        <td><span class="badge-status-pill green">● Aktif</span></td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn-tbl-action edit btn-edit-assist" data-idx="${index}">✏️ Edit</button>
          <button type="button" class="btn-tbl-action delete btn-delete-assist" data-idx="${index}">🗑️ Padam</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-edit-assist').forEach(btn => {
      btn.addEventListener('click', () => openEditAssistModal(parseInt(btn.dataset.idx, 10)));
    });
    tbody.querySelectorAll('.btn-delete-assist').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal('assistance', parseInt(btn.dataset.idx, 10)));
    });
  }

  function renderFleetTable(filterQuery = '') {
    const tbody = document.getElementById('tableKatalogFleetBody');
    if (!tbody) return;

    let items = portalState.katalogFleet;
    if (filterQuery) {
      items = items.filter(i => i.plate.toLowerCase().includes(filterQuery) || i.model.toLowerCase().includes(filterQuery) || i.hub.toLowerCase().includes(filterQuery));
    }

    tbody.innerHTML = items.map((item, index) => `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.88rem; font-weight: 800; color: #C61E2F;">${item.plate}</td>
        <td><strong style="color: #0F172A;">${item.model}</strong></td>
        <td>${item.hub}</td>
        <td>
          <div style="font-weight: 600;">${item.driver}</div>
          <div style="font-size: 0.72rem; color: #64748B;">${item.phone}</div>
        </td>
        <td>
          <span class="badge-status-pill ${item.status === 'Siap Sedia' ? 'green' : (item.status === 'Dalam Misi' ? 'blue' : 'amber')}">
            ● ${item.status}
          </span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn-tbl-action edit btn-edit-fleet" data-idx="${index}">✏️ Edit</button>
          <button type="button" class="btn-tbl-action delete btn-delete-fleet" data-idx="${index}">🗑️ Padam</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-edit-fleet').forEach(btn => {
      btn.addEventListener('click', () => openEditFleetModal(parseInt(btn.dataset.idx, 10)));
    });
    tbody.querySelectorAll('.btn-delete-fleet').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal('fleet', parseInt(btn.dataset.idx, 10)));
    });
  }

  renderEquipmentsTable();
  renderAssistanceTable();
  renderFleetTable();

  // Search Filters
  const searchEquip = document.getElementById('searchKatalogEquipmentInput');
  if (searchEquip) searchEquip.addEventListener('input', (e) => renderEquipmentsTable(e.target.value.toLowerCase().trim()));

  const searchAssist = document.getElementById('searchKatalogAssistanceInput');
  if (searchAssist) searchAssist.addEventListener('input', (e) => renderAssistanceTable(e.target.value.toLowerCase().trim()));

  const searchFleet = document.getElementById('searchKatalogFleetInput');
  if (searchFleet) searchFleet.addEventListener('input', (e) => renderFleetTable(e.target.value.toLowerCase().trim()));

  // 4. Modal Handlers: Equipment CRUD
  const modalEquip = document.getElementById('modalEquipmentForm');
  const btnAddEquip = document.getElementById('btnAddNewEquipment');
  const btnCloseEquip = document.getElementById('closeEquipModalBtn');
  const btnCancelEquip = document.getElementById('btnCancelEquipModal');
  const formEquip = document.getElementById('formEquipmentCrud');

  if (btnAddEquip) {
    btnAddEquip.addEventListener('click', () => {
      playClickSound();
      document.getElementById('modalEquipTitle').textContent = 'Tambah Alatan Tambahan Baru';
      document.getElementById('crudEquipMode').value = 'create';
      document.getElementById('crudEquipId').value = `EQ-${Date.now().toString().slice(-4)}`;
      document.getElementById('crudEquipName').value = '';
      document.getElementById('crudEquipPrice').value = '';
      document.getElementById('crudEquipDesc').value = '';
      modalEquip.classList.add('show');
    });
  }

  function openEditEquipModal(idx) {
    const item = portalState.katalogEquipments[idx];
    if (!item) return;
    playClickSound();
    document.getElementById('modalEquipTitle').textContent = `Kemaskini Alatan: ${item.name}`;
    document.getElementById('crudEquipMode').value = 'edit';
    document.getElementById('crudEquipId').value = item.id;
    document.getElementById('crudEquipName').value = item.name;
    document.getElementById('crudEquipCategory').value = item.category || 'Sokongan Pernafasan';
    document.getElementById('crudEquipPrice').value = item.price;
    document.getElementById('crudEquipUnit').value = item.unit || 'Per Unit / Trip';
    document.getElementById('crudEquipStatus').value = item.outOfStock ? 'out_of_stock' : 'in_stock';
    document.getElementById('crudEquipDesc').value = item.description || '';
    modalEquip.classList.add('show');
  }

  if (btnCloseEquip) btnCloseEquip.addEventListener('click', () => modalEquip.classList.remove('show'));
  if (btnCancelEquip) btnCancelEquip.addEventListener('click', () => modalEquip.classList.remove('show'));

  if (formEquip) {
    formEquip.addEventListener('submit', (e) => {
      e.preventDefault();
      const mode = document.getElementById('crudEquipMode').value;
      const id = document.getElementById('crudEquipId').value;
      const name = document.getElementById('crudEquipName').value.trim();
      const category = document.getElementById('crudEquipCategory').value;
      const price = parseFloat(document.getElementById('crudEquipPrice').value) || 0;
      const unit = document.getElementById('crudEquipUnit').value.trim();
      const status = document.getElementById('crudEquipStatus').value;
      const desc = document.getElementById('crudEquipDesc').value.trim();

      if (mode === 'create') {
        portalState.katalogEquipments.push({
          id: id || `EQ-${Date.now().toString().slice(-4)}`,
          name, category, price, unit, description: desc, outOfStock: status === 'out_of_stock'
        });
        showToast(`Alatan "${name}" berjaya ditambah!`);
      } else {
        const item = portalState.katalogEquipments.find(i => i.id === id);
        if (item) {
          item.name = name;
          item.category = category;
          item.price = price;
          item.unit = unit;
          item.outOfStock = status === 'out_of_stock';
          item.description = desc;
        }
        showToast(`Alatan "${name}" berjaya dikemaskini!`);
      }

      localStorage.setItem('amc_katalog_equipments', JSON.stringify(portalState.katalogEquipments));
      renderEquipmentsTable();
      modalEquip.classList.remove('show');
      playSuccessChime();
    });
  }

  // 5. Modal Handlers: Staff Assistance CRUD
  const modalAssist = document.getElementById('modalAssistanceForm');
  const btnAddAssist = document.getElementById('btnAddNewAssistance');
  const btnCloseAssist = document.getElementById('closeAssistModalBtn');
  const btnCancelAssist = document.getElementById('btnCancelAssistModal');
  const formAssist = document.getElementById('formAssistanceCrud');

  if (btnAddAssist) {
    btnAddAssist.addEventListener('click', () => {
      playClickSound();
      document.getElementById('modalAssistTitle').textContent = 'Tambah Pakej Bantuan Staf Baru';
      document.getElementById('crudAssistMode').value = 'create';
      document.getElementById('crudAssistId').value = `PKG-${Date.now().toString().slice(-4)}`;
      document.getElementById('crudAssistRoleTitle').value = '';
      document.getElementById('crudAssistName').value = '';
      document.getElementById('crudAssistPrice').value = '';
      document.getElementById('crudAssistSkills').value = '';
      document.getElementById('crudAssistRecommended').value = '';
      modalAssist.classList.add('show');
    });
  }

  function openEditAssistModal(idx) {
    const item = portalState.katalogAssistance[idx];
    if (!item) return;
    playClickSound();
    document.getElementById('modalAssistTitle').textContent = `Kemaskini Pakej: ${item.roleTitle || item.name}`;
    document.getElementById('crudAssistMode').value = 'edit';
    document.getElementById('crudAssistId').value = item.id;
    document.getElementById('crudAssistRoleTitle').value = item.roleTitle || '';
    document.getElementById('crudAssistName').value = item.name || '';
    document.getElementById('crudAssistPrice').value = item.price;
    document.getElementById('crudAssistSkills').value = Array.isArray(item.skills) ? item.skills.join(', ') : (item.skills || '');
    document.getElementById('crudAssistRecommended').value = item.recommendedFor || '';
    modalAssist.classList.add('show');
  }

  if (btnCloseAssist) btnCloseAssist.addEventListener('click', () => modalAssist.classList.remove('show'));
  if (btnCancelAssist) btnCancelAssist.addEventListener('click', () => modalAssist.classList.remove('show'));

  if (formAssist) {
    formAssist.addEventListener('submit', (e) => {
      e.preventDefault();
      const mode = document.getElementById('crudAssistMode').value;
      const id = document.getElementById('crudAssistId').value;
      const roleTitle = document.getElementById('crudAssistRoleTitle').value.trim();
      const name = document.getElementById('crudAssistName').value.trim();
      const price = parseFloat(document.getElementById('crudAssistPrice').value) || 0;
      const skills = document.getElementById('crudAssistSkills').value.split(',').map(s => s.trim()).filter(Boolean);
      const recommended = document.getElementById('crudAssistRecommended').value.trim();

      if (mode === 'create') {
        portalState.katalogAssistance.push({
          id: id || `PKG-${Date.now().toString().slice(-4)}`,
          roleTitle, name, price, skills, recommendedFor: recommended
        });
        showToast(`Pakej "${roleTitle}" berjaya ditambah!`);
      } else {
        const item = portalState.katalogAssistance.find(i => i.id === id);
        if (item) {
          item.roleTitle = roleTitle;
          item.name = name;
          item.price = price;
          item.skills = skills;
          item.recommendedFor = recommended;
        }
        showToast(`Pakej "${roleTitle}" berjaya dikemaskini!`);
      }

      localStorage.setItem('amc_katalog_assistance', JSON.stringify(portalState.katalogAssistance));
      renderAssistanceTable();
      modalAssist.classList.remove('show');
      playSuccessChime();
    });
  }

  // 6. Modal Handlers: Fleet CRUD
  const modalFleet = document.getElementById('modalFleetForm');
  const btnAddFleet = document.getElementById('btnAddNewFleetVehicle');
  const btnCloseFleet = document.getElementById('closeFleetModalBtn');
  const btnCancelFleet = document.getElementById('btnCancelFleetModal');
  const formFleet = document.getElementById('formFleetCrud');

  if (btnAddFleet) {
    btnAddFleet.addEventListener('click', () => {
      playClickSound();
      document.getElementById('modalFleetTitle').textContent = 'Tambah Armada Ambulans Baru';
      document.getElementById('crudFleetMode').value = 'create';
      document.getElementById('crudFleetPlate').value = '';
      document.getElementById('crudFleetPlate').readOnly = false;
      document.getElementById('crudFleetModel').value = '';
      modalFleet.classList.add('show');
    });
  }

  function openEditFleetModal(idx) {
    const item = portalState.katalogFleet[idx];
    if (!item) return;
    playClickSound();
    document.getElementById('modalFleetTitle').textContent = `Kemaskini Ambulans: ${item.plate}`;
    document.getElementById('crudFleetMode').value = 'edit';
    document.getElementById('crudFleetPlate').value = item.plate;
    document.getElementById('crudFleetPlate').readOnly = true;
    document.getElementById('crudFleetModel').value = item.model;
    document.getElementById('crudFleetHub').value = item.hub;
    document.getElementById('crudFleetStatus').value = item.status;
    document.getElementById('crudFleetDriver').value = item.driver;
    document.getElementById('crudFleetPhone').value = item.phone;
    modalFleet.classList.add('show');
  }

  if (btnCloseFleet) btnCloseFleet.addEventListener('click', () => modalFleet.classList.remove('show'));
  if (btnCancelFleet) btnCancelFleet.addEventListener('click', () => modalFleet.classList.remove('show'));

  if (formFleet) {
    formFleet.addEventListener('submit', (e) => {
      e.preventDefault();
      const mode = document.getElementById('crudFleetMode').value;
      const plate = document.getElementById('crudFleetPlate').value.trim().toUpperCase();
      const model = document.getElementById('crudFleetModel').value.trim();
      const hub = document.getElementById('crudFleetHub').value;
      const status = document.getElementById('crudFleetStatus').value;
      const driver = document.getElementById('crudFleetDriver').value.trim();
      const phone = document.getElementById('crudFleetPhone').value.trim();

      if (mode === 'create') {
        portalState.katalogFleet.push({ plate, model, hub, status, driver, phone });
        showToast(`Ambulans "${plate}" berjaya didaftarkan!`);
      } else {
        const item = portalState.katalogFleet.find(i => i.plate === plate);
        if (item) {
          item.model = model;
          item.hub = hub;
          item.status = status;
          item.driver = driver;
          item.phone = phone;
        }
        showToast(`Ambulans "${plate}" berjaya dikemaskini!`);
      }

      localStorage.setItem('amc_katalog_fleet', JSON.stringify(portalState.katalogFleet));
      renderFleetTable();
      modalFleet.classList.remove('show');
      playSuccessChime();
    });
  }

  // 7. Modal Handlers: Universal Delete Confirmation
  const modalDelete = document.getElementById('modalDeleteConfirm');
  const btnConfirmDelete = document.getElementById('btnConfirmDeleteAction');
  const btnCancelDelete = document.getElementById('btnCancelDeleteAction');
  const promptText = document.getElementById('modalDeletePromptText');
  let deleteContext = null;

  function openDeleteModal(type, index) {
    deleteContext = { type, index };
    let itemName = '';
    if (type === 'equipment') itemName = portalState.katalogEquipments[index]?.name || 'Alatan';
    if (type === 'assistance') itemName = portalState.katalogAssistance[index]?.roleTitle || 'Pakej Staf';
    if (type === 'fleet') itemName = portalState.katalogFleet[index]?.plate || 'Ambulans';

    promptText.textContent = `Adakah anda pasti ingin memadam "${itemName}" dari sistem? Tindakan ini tidak boleh diundur.`;
    modalDelete.classList.add('show');
  }

  if (btnCancelDelete) btnCancelDelete.addEventListener('click', () => modalDelete.classList.remove('show'));

  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', () => {
      if (!deleteContext) return;
      const { type, index } = deleteContext;

      if (type === 'equipment') {
        const removed = portalState.katalogEquipments.splice(index, 1)[0];
        localStorage.setItem('amc_katalog_equipments', JSON.stringify(portalState.katalogEquipments));
        renderEquipmentsTable();
        showToast(`Alatan "${removed.name}" telah dipadam.`);
      } else if (type === 'assistance') {
        const removed = portalState.katalogAssistance.splice(index, 1)[0];
        localStorage.setItem('amc_katalog_assistance', JSON.stringify(portalState.katalogAssistance));
        renderAssistanceTable();
        showToast(`Pakej "${removed.roleTitle || removed.name}" telah dipadam.`);
      } else if (type === 'fleet') {
        const removed = portalState.katalogFleet.splice(index, 1)[0];
        localStorage.setItem('amc_katalog_fleet', JSON.stringify(portalState.katalogFleet));
        renderFleetTable();
        showToast(`Ambulans "${removed.plate}" telah dipadam.`);
      }

      modalDelete.classList.remove('show');
      deleteContext = null;
      playClickSound();
    });
  }
}

/* -------------------------------------------------------------------------
   10. PENGURUSAN PEMANDU & JEMPUTAN (SENARAI, JEMPUTAN, KELULUSAN, AUDIT)
   ------------------------------------------------------------------------- */
let pemanduState = {
  activeTab: 'senarai', // 'senarai' | 'jemputan' | 'kelulusan' | 'log'
  selectedDriver: null,
  drivers: [],
  invitations: [],
  auditLogs: []
};

const BRANCH_LABELS = {
  kok_lanas: 'HQ Kok Lanas',
  raub: 'Raub, Pahang',
  jeli: 'Jeli, Kelantan',
  gua_musang: 'Gua Musang'
};

function initPemanduView() {
  loadPemanduData();
  bindPemanduSubTabs();
  bindPemanduFilters();
  bindPemanduModals();
  renderAllPemanduViews();
}

function loadPemanduData() {
  const storedDrivers = localStorage.getItem('amc_portal_drivers');
  if (storedDrivers) {
    try { pemanduState.drivers = JSON.parse(storedDrivers); } catch (e) {}
  }
  if (!pemanduState.drivers || pemanduState.drivers.length === 0) {
    pemanduState.drivers = [
      {
        id: 'drv-1',
        name: 'Abe Di / Syalihan',
        email: 'abedi@alfarhain.my',
        phone: '013-914 7606',
        hub_id: 'kok_lanas',
        assigned_plate: 'VPQ 7606',
        license_type: 'GDL D / E Bertauliah EMT',
        ic_number: '850312-03-5123',
        account_status: 'Aktif',
        approved_at: '10 Okt 2026, 09:00',
        approved_by_name: 'Pentadbir Sistem'
      },
      {
        id: 'drv-2',
        name: 'Abe Din Estimos Sukrosa',
        email: 'abedin@alfarhain.my',
        phone: '013-914 7606',
        hub_id: 'raub',
        assigned_plate: 'DFG 7606',
        license_type: 'GDL D / E Bertauliah EMT',
        ic_number: '880719-06-5431',
        account_status: 'Aktif',
        approved_at: '12 Okt 2026, 14:15',
        approved_by_name: 'Pentadbir Sistem'
      },
      {
        id: 'drv-3',
        name: 'Mohd Faizul bin Che Man',
        email: 'faizul@alfarhain.my',
        phone: '017-889 4432',
        hub_id: 'jeli',
        assigned_plate: 'VPP 9901',
        license_type: 'GDL D Bertauliah Paramedik',
        ic_number: '920405-03-5911',
        account_status: 'Menunggu Kelulusan',
        submitted_at: '22 Okt 2026, 14:30',
        invitation_id: 'inv-101'
      },
      {
        id: 'drv-4',
        name: 'Wan Kamarudin bin Wan Ismail',
        email: 'kamarudin@alfarhain.my',
        phone: '019-912 3345',
        hub_id: 'gua_musang',
        assigned_plate: '',
        license_type: 'GDL D / E',
        ic_number: '901123-03-6019',
        account_status: 'Perlu Pembetulan',
        correction_notes: 'Sila muat naik semula lesen GDL yang sah dan terkini.',
        submitted_at: '21 Okt 2026, 11:15',
        invitation_id: 'inv-102'
      }
    ];
    saveDriversToStorage();
  }

  const storedInv = localStorage.getItem('amc_portal_invitations');
  if (storedInv) {
    try { pemanduState.invitations = JSON.parse(storedInv); } catch (e) {}
  }
  if (!pemanduState.invitations || pemanduState.invitations.length === 0) {
    pemanduState.invitations = [
      {
        id: 'inv-101',
        masked_code: 'AMC-9X****',
        full_name: 'Mohd Faizul bin Che Man',
        email: 'faizul@alfarhain.my',
        phone: '017-889 4432',
        branch_id: 'jeli',
        assigned_plate: 'VPP 9901',
        status: 'Diterima',
        delivery_status: 'Manual',
        expires_at: '24 Okt 2026, 14:00',
        created_at: '22 Okt 2026, 14:00'
      },
      {
        id: 'inv-102',
        masked_code: 'AMC-4K****',
        full_name: 'Wan Kamarudin bin Wan Ismail',
        email: 'kamarudin@alfarhain.my',
        phone: '019-912 3345',
        branch_id: 'gua_musang',
        assigned_plate: '',
        status: 'Dihantar',
        delivery_status: 'Manual',
        expires_at: '23 Okt 2026, 10:00',
        created_at: '21 Okt 2026, 10:00'
      }
    ];
    saveInvitationsToStorage();
  }

  const storedAudits = localStorage.getItem('amc_portal_driver_audits');
  if (storedAudits) {
    try { pemanduState.auditLogs = JSON.parse(storedAudits); } catch (e) {}
  }
  if (!pemanduState.auditLogs || pemanduState.auditLogs.length === 0) {
    pemanduState.auditLogs = [
      {
        id: 'aud-1',
        created_at: '22 Okt 2026, 14:30',
        actor_name: 'Abe Di (HQ Kok Lanas)',
        actor_role: 'Pentadbir HQ',
        target_email: 'faizul@alfarhain.my',
        action: 'PROFIL_DIHANTAR',
        reason: 'Pemandu menebus jemputan dan menghantar maklumat profil pendaftaran.'
      },
      {
        id: 'aud-2',
        created_at: '21 Okt 2026, 11:15',
        actor_name: 'Abe Di (HQ Kok Lanas)',
        actor_role: 'Pentadbir HQ',
        target_email: 'kamarudin@alfarhain.my',
        action: 'MINTA_PEMBETULAN',
        reason: 'Sila muat naik semula lesen GDL yang sah dan terkini.'
      },
      {
        id: 'aud-3',
        created_at: '20 Okt 2026, 09:00',
        actor_name: 'Abe Di (HQ Kok Lanas)',
        actor_role: 'Pentadbir HQ',
        target_email: 'faizul@alfarhain.my',
        action: 'JEMPUTAN_DICIPTA',
        reason: 'Jemputan onboarding pemandu cawangan Jeli dikeluarkan.'
      }
    ];
    saveAuditsToStorage();
  }
}

function saveDriversToStorage() {
  localStorage.setItem('amc_portal_drivers', JSON.stringify(pemanduState.drivers));
}

function saveInvitationsToStorage() {
  localStorage.setItem('amc_portal_invitations', JSON.stringify(pemanduState.invitations));
}

function saveAuditsToStorage() {
  localStorage.setItem('amc_portal_driver_audits', JSON.stringify(pemanduState.auditLogs));
}

function bindPemanduSubTabs() {
  const tabsBar = document.getElementById('pemanduTabsBar');
  if (!tabsBar) return;

  const tabBtns = tabsBar.querySelectorAll('.set-tab-btn');
  const tabContents = document.querySelectorAll('.pemandu-tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const ptab = btn.dataset.ptab;
      if (!ptab) return;

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
      });

      btn.classList.add('active');
      const targetContent = document.getElementById(`ptab-${ptab}`);
      if (targetContent) {
        targetContent.classList.add('active');
        targetContent.style.display = 'block';
      }

      pemanduState.activeTab = ptab;
      playClickSound();
    });
  });
}

function bindPemanduFilters() {
  const searchDrivers = document.getElementById('searchDriversInput');
  const branchFilter = document.getElementById('filterDriverBranch');
  const statusFilter = document.getElementById('filterDriverStatus');

  if (searchDrivers) searchDrivers.addEventListener('input', () => renderDriversTable());
  if (branchFilter) branchFilter.addEventListener('change', () => renderDriversTable());
  if (statusFilter) statusFilter.addEventListener('change', () => renderDriversTable());

  const searchInv = document.getElementById('searchInvitationsInput');
  const branchInv = document.getElementById('filterInviteBranch');
  const statusInv = document.getElementById('filterInviteStatus');

  if (searchInv) searchInv.addEventListener('input', () => renderInvitationsTable());
  if (branchInv) branchInv.addEventListener('change', () => renderInvitationsTable());
  if (statusInv) statusInv.addEventListener('change', () => renderInvitationsTable());

  const searchPending = document.getElementById('searchPendingDriversInput');
  const branchPending = document.getElementById('filterPendingBranch');

  if (searchPending) searchPending.addEventListener('input', () => renderPendingDriversTable());
  if (branchPending) branchPending.addEventListener('change', () => renderPendingDriversTable());

  const searchAudit = document.getElementById('searchAuditLogInput');
  const actionAudit = document.getElementById('filterAuditAction');

  if (searchAudit) searchAudit.addEventListener('input', () => renderAuditLogsTable());
  if (actionAudit) actionAudit.addEventListener('change', () => renderAuditLogsTable());
}

function bindPemanduModals() {
  // Open Invite Modal
  const btnOpenInvite = document.getElementById('btnOpenInviteDriverModal');
  const btnQuickInvite = document.getElementById('btnQuickInvitePemandu');
  const modalInvite = document.getElementById('modalInviteDriver');
  const btnCloseInvite = document.getElementById('btnCloseInviteModal');
  const btnCancelInvite = document.getElementById('btnCancelInviteDriver');

  const openInvite = () => {
    if (modalInvite) {
      modalInvite.style.display = 'flex';
      modalInvite.classList.add('show');
    }
  };

  const closeInvite = () => {
    if (modalInvite) {
      modalInvite.style.display = 'none';
      modalInvite.classList.remove('show');
    }
  };

  if (btnOpenInvite) btnOpenInvite.addEventListener('click', openInvite);
  if (btnQuickInvite) btnQuickInvite.addEventListener('click', openInvite);
  if (btnCloseInvite) btnCloseInvite.addEventListener('click', closeInvite);
  if (btnCancelInvite) btnCancelInvite.addEventListener('click', closeInvite);

  // Invite Form Submit
  const formInvite = document.getElementById('formCreateDriverInvite');
  if (formInvite) {
    formInvite.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleCreateDriverInvite();
    });
  }

  // Success Modal
  const modalSuccess = document.getElementById('modalInviteSuccess');
  const btnCloseSuccess = document.getElementById('btnCloseSuccessModal');
  if (btnCloseSuccess && modalSuccess) {
    btnCloseSuccess.addEventListener('click', () => {
      modalSuccess.style.display = 'none';
      modalSuccess.classList.remove('show');
    });
  }

  const btnCopyCode = document.getElementById('btnCopyInviteCode');
  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', () => {
      const codeEl = document.getElementById('displayPlainInviteCode');
      if (codeEl) {
        navigator.clipboard.writeText(codeEl.textContent.trim());
        btnCopyCode.textContent = '✔️ Disalin!';
        setTimeout(() => { btnCopyCode.textContent = '📋 Salin Kod Jemputan'; }, 2000);
      }
    });
  }

  const btnCopyLink = document.getElementById('btnCopyActivationLink');
  if (btnCopyLink) {
    btnCopyLink.addEventListener('click', () => {
      const linkEl = document.getElementById('displayActivationLink');
      if (linkEl) {
        navigator.clipboard.writeText(linkEl.value.trim());
        btnCopyLink.textContent = '✔️ Disalin!';
        setTimeout(() => { btnCopyLink.textContent = 'Salin Pautan'; }, 2000);
      }
    });
  }

  // Review Modal Handlers
  const modalReview = document.getElementById('modalReviewDriver');
  const btnCloseReview = document.getElementById('btnCloseReviewModal');
  if (btnCloseReview && modalReview) {
    btnCloseReview.addEventListener('click', () => {
      modalReview.style.display = 'none';
      modalReview.classList.remove('show');
    });
  }

  const btnApprove = document.getElementById('btnRevActionApprove');
  const btnCorrect = document.getElementById('btnRevActionCorrect');
  const btnReject = document.getElementById('btnRevActionReject');

  if (btnApprove) btnApprove.addEventListener('click', () => handleReviewDecision('LULUSKAN'));
  if (btnCorrect) btnCorrect.addEventListener('click', () => handleReviewDecision('MINTA_PEMBETULAN'));
  if (btnReject) btnReject.addEventListener('click', () => handleReviewDecision('TOLAK'));
}

async function handleCreateDriverInvite() {
  const name = document.getElementById('inviteDriverName')?.value.trim();
  const email = document.getElementById('inviteDriverEmail')?.value.trim();
  const phone = document.getElementById('inviteDriverPhone')?.value.trim();
  const branchId = document.getElementById('inviteDriverBranch')?.value;
  const validHours = document.getElementById('inviteDriverValidHours')?.value || '48';
  const assignedPlate = document.getElementById('inviteDriverAssignedPlate')?.value || null;
  const notes = document.getElementById('inviteDriverNotes')?.value.trim();

  if (!name || !email || !phone) {
    alert('Sila lengkapkan nama penuh, emel dan nombor telefon pemandu.');
    return;
  }

  // Prevent duplicate active invitation for same email
  const existing = pemanduState.invitations.find(i => i.email.toLowerCase() === email.toLowerCase() && i.status === 'Dihantar');
  if (existing) {
    alert(`Jemputan aktif untuk ${email} sudah wujud dalam sistem. Sila guna 'Jana Semula' sekiranya ingin memperbaharui kod.`);
    return;
  }

  let resultPlainCode = '';
  let resultLink = '';

  try {
    const res = await fetch('/api/driver/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: name,
        email,
        phone,
        branchId,
        validHours,
        assignedPlate,
        internalNotes: notes,
        actor: { name: portalState.operatorName || 'Abe Di (HQ Kok Lanas)', role: 'hq_admin', email: 'abedi@alfarhain.my' }
      })
    });
    if (res.ok) {
      const data = await res.json();
      resultPlainCode = data.plainCode;
      resultLink = data.activationLink;
    }
  } catch (e) {
    console.warn('API invite failed, using local generation:', e);
  }

  // Fallback generation if API unavailable
  if (!resultPlainCode) {
    const charset = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let rand = '';
    for (let i = 0; i < 6; i++) rand += charset[Math.floor(Math.random() * charset.length)];
    resultPlainCode = `AMC-${rand}`;
    resultLink = `${window.location.origin}/?act=${encodeURIComponent(resultPlainCode)}&email=${encodeURIComponent(email)}`;
  }

  const masked = `${resultPlainCode.slice(0, 6)}****`;
  const expiryDate = new Date(Date.now() + parseInt(validHours, 10) * 3600 * 1000).toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const newInv = {
    id: 'inv-' + Date.now(),
    masked_code: masked,
    full_name: name,
    email,
    phone,
    branch_id: branchId,
    assigned_plate: assignedPlate || '',
    status: 'Dihantar',
    delivery_status: 'Manual',
    expires_at: expiryDate,
    created_at: new Date().toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  };

  pemanduState.invitations.unshift(newInv);
  saveInvitationsToStorage();

  // Audit
  pemanduState.auditLogs.unshift({
    id: 'aud-' + Date.now(),
    created_at: new Date().toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    actor_name: portalState.operatorName || 'Abe Di (HQ Kok Lanas)',
    actor_role: 'Pentadbir HQ',
    target_email: email,
    action: 'JEMPUTAN_DICIPTA',
    reason: `Jemputan pemandu baharu dikeluarkan untuk cawangan ${BRANCH_LABELS[branchId] || branchId}.`
  });
  saveAuditsToStorage();

  // Close invite modal, show success modal
  const modalInvite = document.getElementById('modalInviteDriver');
  if (modalInvite) {
    modalInvite.style.display = 'none';
    modalInvite.classList.remove('show');
  }

  const modalSuccess = document.getElementById('modalInviteSuccess');
  const displayCode = document.getElementById('displayPlainInviteCode');
  const displayLink = document.getElementById('displayActivationLink');

  if (displayCode) displayCode.textContent = resultPlainCode;
  if (displayLink) displayLink.value = resultLink;

  if (modalSuccess) {
    modalSuccess.style.display = 'flex';
    modalSuccess.classList.add('show');
  }

  // Reset form
  const form = document.getElementById('formCreateDriverInvite');
  if (form) form.reset();

  renderAllPemanduViews();
  playSuccessChime();
  showToast('Jemputan pemandu berjaya dicipta!');
}

function renderAllPemanduViews() {
  renderPemanduMetrics();
  renderDriversTable();
  renderInvitationsTable();
  renderPendingDriversTable();
  renderAuditLogsTable();
  updatePendingBadges();
}

function renderPemanduMetrics() {
  const total = pemanduState.drivers.length;
  const active = pemanduState.drivers.filter(d => d.account_status === 'Aktif').length;
  const pending = pemanduState.drivers.filter(d => ['Menunggu Kelulusan', 'Perlu Pembetulan'].includes(d.account_status)).length;
  const suspended = pemanduState.drivers.filter(d => ['Digantung', 'Ditolak'].includes(d.account_status)).length;

  const elTotal = document.getElementById('metricTotalDrivers');
  const elActive = document.getElementById('metricActiveDrivers');
  const elPending = document.getElementById('metricPendingDrivers');
  const elSuspended = document.getElementById('metricSuspendedDrivers');

  if (elTotal) elTotal.textContent = total;
  if (elActive) elActive.textContent = active;
  if (elPending) elPending.textContent = pending;
  if (elSuspended) elSuspended.textContent = suspended;
}

function updatePendingBadges() {
  const pendingCount = pemanduState.drivers.filter(d => d.account_status === 'Menunggu Kelulusan').length;

  const sidebarBadge = document.getElementById('badgePendingDrivers');
  if (sidebarBadge) {
    sidebarBadge.textContent = pendingCount;
    sidebarBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
  }

  const tabBadge = document.getElementById('tabBadgePendingCount');
  if (tabBadge) {
    tabBadge.textContent = pendingCount;
    tabBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
  }

  const queueBadge = document.getElementById('badgePendingQueueCount');
  if (queueBadge) {
    queueBadge.textContent = `${pendingCount} PERMOHONAN`;
  }
}

function renderDriversTable() {
  const tbody = document.getElementById('tbodyDriversList');
  if (!tbody) return;

  const search = (document.getElementById('searchDriversInput')?.value || '').toLowerCase();
  const branch = document.getElementById('filterDriverBranch')?.value || 'all';
  const status = document.getElementById('filterDriverStatus')?.value || 'all';

  const filtered = pemanduState.drivers.filter(d => {
    const matchSearch = !search ||
      (d.name && d.name.toLowerCase().includes(search)) ||
      (d.email && d.email.toLowerCase().includes(search)) ||
      (d.phone && d.phone.includes(search));
    const matchBranch = branch === 'all' || d.hub_id === branch;
    const matchStatus = status === 'all' || d.account_status === status;
    return matchSearch && matchBranch && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">Tiada rekod pemandu yang sepadan.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const statusPill = getAccountStatusBadge(d.account_status);
    const branchLabel = BRANCH_LABELS[d.hub_id] || d.hub_id;
    const isSuspended = d.account_status === 'Digantung';

    return `
      <tr>
        <td>
          <div style="font-weight:700;color:#0f172a;">${escapeHtml(d.name)}</div>
          <div style="font-size:0.75rem;color:#64748b;">KP: ${escapeHtml(d.ic_number || '—')}</div>
        </td>
        <td>
          <div style="font-size:0.85rem;color:#1e293b;">${escapeHtml(d.email)}</div>
          <div style="font-size:0.75rem;color:#64748b;">📞 ${escapeHtml(d.phone)}</div>
        </td>
        <td>
          <span style="font-size:0.85rem;font-weight:600;color:#005047;">${branchLabel}</span>
        </td>
        <td>
          ${d.assigned_plate ? `<span style="display:inline-block;padding:2px 8px;background:#e0f2fe;color:#0369a1;border-radius:4px;font-weight:700;font-size:0.8rem;">${d.assigned_plate}</span>` : `<span style="color:#94a3b8;font-size:0.8rem;">Tiada</span>`}
        </td>
        <td>
          <div style="font-size:0.8rem;color:#334155;">${escapeHtml(d.license_type || 'GDL D / E Bertauliah EMT')}</div>
        </td>
        <td>${statusPill}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" class="btn-table-action" onclick="window.openPemanduReviewModal('${d.id}')" style="background:#005047;color:#fff;border:none;padding:5px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;cursor:pointer;">
              Semak
            </button>
            ${d.account_status === 'Aktif' ? `
              <button type="button" class="btn-table-action" onclick="window.confirmSuspendDriver('${d.id}')" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:5px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;cursor:pointer;">
                Gantung
              </button>
            ` : isSuspended ? `
              <button type="button" class="btn-table-action" onclick="window.confirmReactivateDriver('${d.id}')" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;padding:5px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;cursor:pointer;">
                Batal Gantung
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderInvitationsTable() {
  const tbody = document.getElementById('tbodyInvitationsList');
  if (!tbody) return;

  const search = (document.getElementById('searchInvitationsInput')?.value || '').toLowerCase();
  const branch = document.getElementById('filterInviteBranch')?.value || 'all';
  const status = document.getElementById('filterInviteStatus')?.value || 'all';

  const filtered = pemanduState.invitations.filter(i => {
    const matchSearch = !search ||
      (i.full_name && i.full_name.toLowerCase().includes(search)) ||
      (i.email && i.email.toLowerCase().includes(search)) ||
      (i.masked_code && i.masked_code.toLowerCase().includes(search));
    const matchBranch = branch === 'all' || i.branch_id === branch;
    const matchStatus = status === 'all' || i.status === status;
    return matchSearch && matchBranch && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">Tiada rekod jemputan yang sepadan.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(i => {
    const invStatusPill = getInvitationStatusBadge(i.status);
    const branchLabel = BRANCH_LABELS[i.branch_id] || i.branch_id;

    return `
      <tr>
        <td>
          <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-weight:700;color:#c61e2f;">${i.masked_code}</code>
        </td>
        <td>
          <div style="font-weight:700;color:#0f172a;">${escapeHtml(i.full_name)}</div>
        </td>
        <td>
          <div style="font-size:0.85rem;color:#1e293b;">${escapeHtml(i.email)}</div>
          <div style="font-size:0.75rem;color:#64748b;">📞 ${escapeHtml(i.phone)}</div>
        </td>
        <td>
          <span style="font-size:0.85rem;font-weight:600;color:#005047;">${branchLabel}</span>
        </td>
        <td>
          <div style="font-size:0.8rem;color:#475569;">${i.expires_at}</div>
        </td>
        <td>${invStatusPill}</td>
        <td>
          <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:700;background:#f8fafc;color:#475569;border:1px solid #cbd5e1;">
            ${i.delivery_status === 'Manual' ? '📋 Pautan Manual' : '✉️ Emel Dihantar'}
          </span>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            ${i.status === 'Dihantar' ? `
              <button type="button" class="btn-table-action" onclick="window.resendDriverInvite('${i.id}')" style="background:#005047;color:#fff;border:none;padding:5px 8px;border-radius:6px;font-size:0.75rem;font-weight:700;cursor:pointer;">
                Jana Semula
              </button>
              <button type="button" class="btn-table-action" onclick="window.revokeDriverInvite('${i.id}')" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:5px 8px;border-radius:6px;font-size:0.75rem;font-weight:700;cursor:pointer;">
                Batalkan
              </button>
            ` : `<span style="font-size:0.75rem;color:#94a3b8;">Tiada tindakan</span>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPendingDriversTable() {
  const tbody = document.getElementById('tbodyPendingDriversList');
  if (!tbody) return;

  const search = (document.getElementById('searchPendingDriversInput')?.value || '').toLowerCase();
  const branch = document.getElementById('filterPendingBranch')?.value || 'all';

  const pendingList = pemanduState.drivers.filter(d => ['Menunggu Kelulusan', 'Perlu Pembetulan'].includes(d.account_status));
  const filtered = pendingList.filter(d => {
    const matchSearch = !search ||
      (d.name && d.name.toLowerCase().includes(search)) ||
      (d.email && d.email.toLowerCase().includes(search));
    const matchBranch = branch === 'all' || d.hub_id === branch;
    return matchSearch && matchBranch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">Tiada permohonan pemandu yang menanti kelulusan buat masa ini.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const statusPill = getAccountStatusBadge(d.account_status);
    const branchLabel = BRANCH_LABELS[d.hub_id] || d.hub_id;

    return `
      <tr>
        <td>
          <div style="font-weight:700;color:#0f172a;">${escapeHtml(d.name)}</div>
          <div style="font-size:0.75rem;color:#64748b;">KP: ${escapeHtml(d.ic_number || '—')}</div>
        </td>
        <td>
          <div style="font-size:0.85rem;color:#1e293b;">${escapeHtml(d.email)}</div>
          <div style="font-size:0.75rem;color:#64748b;">📞 ${escapeHtml(d.phone)}</div>
        </td>
        <td>
          <span style="font-size:0.85rem;font-weight:600;color:#005047;">${branchLabel}</span>
        </td>
        <td>
          <div style="font-size:0.8rem;color:#475569;">${d.submitted_at || 'Hari ini'}</div>
        </td>
        <td>
          <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:700;background:#ecfdf5;color:#047857;">Diterima</span>
        </td>
        <td>${statusPill}</td>
        <td>
          <button type="button" class="btn-table-action" onclick="window.openPemanduReviewModal('${d.id}')" style="background:#c61e2f;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:0.78rem;font-weight:700;cursor:pointer;box-shadow:0 1px 4px rgba(198,30,47,0.3);">
            Semak Permohonan ➔
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderAuditLogsTable() {
  const tbody = document.getElementById('tbodyDriverAuditLogs');
  if (!tbody) return;

  const search = (document.getElementById('searchAuditLogInput')?.value || '').toLowerCase();
  const action = document.getElementById('filterAuditAction')?.value || 'all';

  const filtered = pemanduState.auditLogs.filter(a => {
    const matchSearch = !search ||
      (a.target_email && a.target_email.toLowerCase().includes(search)) ||
      (a.actor_name && a.actor_name.toLowerCase().includes(search)) ||
      (a.reason && a.reason.toLowerCase().includes(search));
    const matchAction = action === 'all' || a.action === action;
    return matchSearch && matchAction;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#64748b;">Tiada rekod log aktiviti yang sepadan.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    return `
      <tr>
        <td style="font-size:0.8rem;color:#475569;white-space:nowrap;">${a.created_at}</td>
        <td style="font-weight:700;color:#0f172a;">${escapeHtml(a.actor_name)}</td>
        <td>
          <span style="font-size:0.75rem;background:#f1f5f9;color:#334155;padding:2px 8px;border-radius:6px;font-weight:600;">${escapeHtml(a.actor_role)}</span>
        </td>
        <td style="font-size:0.85rem;color:#0284c7;font-weight:600;">${escapeHtml(a.target_email)}</td>
        <td>
          <span style="font-weight:700;font-size:0.8rem;color:#005047;">${escapeHtml(a.action)}</span>
        </td>
        <td style="font-size:0.82rem;color:#334155;">${escapeHtml(a.reason || '—')}</td>
      </tr>
    `;
  }).join('');
}

function getAccountStatusBadge(status) {
  switch (status) {
    case 'Aktif':
      return `<span style="display:inline-block;padding:3px 10px;background:#ecfdf5;color:#047857;border-radius:12px;font-size:0.75rem;font-weight:800;">● Aktif</span>`;
    case 'Menunggu Kelulusan':
      return `<span style="display:inline-block;padding:3px 10px;background:#fef2f2;color:#c61e2f;border-radius:12px;font-size:0.75rem;font-weight:800;">⏱️ Menunggu Kelulusan</span>`;
    case 'Perlu Pembetulan':
      return `<span style="display:inline-block;padding:3px 10px;background:#fffbeb;color:#b45309;border-radius:12px;font-size:0.75rem;font-weight:800;">⚠️ Perlu Pembetulan</span>`;
    case 'Digantung':
      return `<span style="display:inline-block;padding:3px 10px;background:#f3f4f6;color:#374151;border-radius:12px;font-size:0.75rem;font-weight:800;">🚫 Digantung</span>`;
    case 'Ditolak':
      return `<span style="display:inline-block;padding:3px 10px;background:#fee2e2;color:#991b1b;border-radius:12px;font-size:0.75rem;font-weight:800;">✖ Ditolak</span>`;
    default:
      return `<span style="display:inline-block;padding:3px 10px;background:#f1f5f9;color:#64748b;border-radius:12px;font-size:0.75rem;font-weight:700;">${escapeHtml(status || 'Belum Lengkap')}</span>`;
  }
}

function getInvitationStatusBadge(status) {
  switch (status) {
    case 'Dihantar':
      return `<span style="display:inline-block;padding:3px 10px;background:#e0f2fe;color:#0369a1;border-radius:12px;font-size:0.75rem;font-weight:800;">Dihantar</span>`;
    case 'Diterima':
      return `<span style="display:inline-block;padding:3px 10px;background:#ecfdf5;color:#047857;border-radius:12px;font-size:0.75rem;font-weight:800;">Diterima</span>`;
    case 'Tamat Tempoh':
      return `<span style="display:inline-block;padding:3px 10px;background:#f1f5f9;color:#64748b;border-radius:12px;font-size:0.75rem;font-weight:800;">Tamat Tempoh</span>`;
    case 'Dibatalkan':
      return `<span style="display:inline-block;padding:3px 10px;background:#fee2e2;color:#991b1b;border-radius:12px;font-size:0.75rem;font-weight:800;">Dibatalkan</span>`;
    default:
      return `<span style="display:inline-block;padding:3px 10px;background:#f1f5f9;color:#64748b;border-radius:12px;font-size:0.75rem;font-weight:700;">${escapeHtml(status)}</span>`;
  }
}

// Global window actions for inline onclick calls
window.openPemanduReviewModal = function(driverId) {
  const driver = pemanduState.drivers.find(d => d.id === driverId);
  if (!driver) return;
  pemanduState.selectedDriver = driver;

  const modal = document.getElementById('modalReviewDriver');
  const avatar = document.getElementById('revDriverAvatar');
  const name = document.getElementById('revDriverFullName');
  const emailPhone = document.getElementById('revDriverEmailPhone');
  const statusBadge = document.getElementById('revDriverStatusBadge');
  const ic = document.getElementById('revDriverIC');
  const license = document.getElementById('revDriverLicense');
  const branchSelect = document.getElementById('revDriverBranchSelect');
  const plateSelect = document.getElementById('revDriverPlateSelect');
  const reasonInput = document.getElementById('revDriverReasonInput');

  if (avatar) avatar.textContent = (driver.name || 'PD').slice(0, 2).toUpperCase();
  if (name) name.textContent = driver.name;
  if (emailPhone) emailPhone.textContent = `${driver.email} · 📞 ${driver.phone}`;
  if (statusBadge) statusBadge.innerHTML = getAccountStatusBadge(driver.account_status);
  if (ic) ic.textContent = driver.ic_number || '890512-03-5541';
  if (license) license.textContent = driver.license_type || 'GDL D / E Bertauliah EMT';
  if (branchSelect) branchSelect.value = driver.hub_id || 'kok_lanas';
  if (plateSelect) plateSelect.value = driver.assigned_plate || '';
  if (reasonInput) reasonInput.value = driver.correction_notes || driver.rejection_reason || driver.suspension_reason || '';

  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('show');
  }
};

window.confirmSuspendDriver = function(driverId) {
  const driver = pemanduState.drivers.find(d => d.id === driverId);
  if (!driver) return;
  const reason = prompt(`Sila nyatakan sebab penggantungan pemandu ${driver.name}:`);
  if (!reason || reason.trim().length < 5) {
    if (reason !== null) alert('Sebab penggantungan wajib diisi (minimum 5 aksara).');
    return;
  }

  driver.account_status = 'Digantung';
  driver.suspension_reason = reason.trim();
  saveDriversToStorage();

  pemanduState.auditLogs.unshift({
    id: 'aud-' + Date.now(),
    created_at: new Date().toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    actor_name: portalState.operatorName || 'Abe Di (HQ Kok Lanas)',
    actor_role: 'Pentadbir HQ',
    target_email: driver.email,
    action: 'GANTUNG',
    reason: `Penggantungan pemandu: ${reason.trim()}`
  });
  saveAuditsToStorage();

  renderAllPemanduViews();
  showToast(`Pemandu ${driver.name} telah digantung.`);
};

window.confirmReactivateDriver = function(driverId) {
  const driver = pemanduState.drivers.find(d => d.id === driverId);
  if (!driver) return;
  if (!confirm(`Adakah anda pasti ingin mengaktifkan semula pemandu ${driver.name}?`)) return;

  driver.account_status = 'Aktif';
  driver.suspension_reason = null;
  saveDriversToStorage();

  pemanduState.auditLogs.unshift({
    id: 'aud-' + Date.now(),
    created_at: new Date().toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    actor_name: portalState.operatorName || 'Abe Di (HQ Kok Lanas)',
    actor_role: 'Pentadbir HQ',
    target_email: driver.email,
    action: 'AKTIFKAN_SEMULA',
    reason: 'Penggantungan dibatalkan oleh pentadbir HQ.'
  });
  saveAuditsToStorage();

  renderAllPemanduViews();
  showToast(`Pemandu ${driver.name} telah diaktifkan semula.`);
};

window.resendDriverInvite = function(invId) {
  const inv = pemanduState.invitations.find(i => i.id === invId);
  if (!inv) return;
  if (!confirm(`Jana semula kod jemputan untuk ${inv.full_name}? Kod lama akan dibatalkan serta-merta.`)) return;

  const charset = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 6; i++) rand += charset[Math.floor(Math.random() * charset.length)];
  const newPlainCode = `AMC-${rand}`;

  inv.masked_code = `${newPlainCode.slice(0, 6)}****`;
  inv.expires_at = new Date(Date.now() + 48 * 3600 * 1000).toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  inv.created_at = new Date().toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  saveInvitationsToStorage();

  pemanduState.auditLogs.unshift({
    id: 'aud-' + Date.now(),
    created_at: new Date().toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    actor_name: portalState.operatorName || 'Abe Di (HQ Kok Lanas)',
    actor_role: 'Pentadbir HQ',
    target_email: inv.email,
    action: 'JEMPUTAN_DIJANA_SEMULA',
    reason: 'Kod jemputan baharu dijana dan kod lama dibatalkan.'
  });
  saveAuditsToStorage();

  // Show modal with new plain code
  const modalSuccess = document.getElementById('modalInviteSuccess');
  const displayCode = document.getElementById('displayPlainInviteCode');
  const displayLink = document.getElementById('displayActivationLink');

  if (displayCode) displayCode.textContent = newPlainCode;
  if (displayLink) displayLink.value = `${window.location.origin}/?act=${encodeURIComponent(newPlainCode)}&email=${encodeURIComponent(inv.email)}`;

  if (modalSuccess) {
    modalSuccess.style.display = 'flex';
    modalSuccess.classList.add('show');
  }

  renderAllPemanduViews();
  showToast('Kod jemputan baharu berjaya dijana!');
};

window.revokeDriverInvite = function(invId) {
  const inv = pemanduState.invitations.find(i => i.id === invId);
  if (!inv) return;
  if (!confirm(`Batalkan jemputan untuk ${inv.full_name}? Pemandu tidak lagi boleh menggunakan jemputan ini.`)) return;

  inv.status = 'Dibatalkan';
  saveInvitationsToStorage();

  pemanduState.auditLogs.unshift({
    id: 'aud-' + Date.now(),
    created_at: new Date().toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    actor_name: portalState.operatorName || 'Abe Di (HQ Kok Lanas)',
    actor_role: 'Pentadbir HQ',
    target_email: inv.email,
    action: 'JEMPUTAN_DIBATALKAN',
    reason: 'Jemputan dibatalkan oleh pegawai pentadbir.'
  });
  saveAuditsToStorage();

  renderAllPemanduViews();
  showToast('Jemputan telah dibatalkan.');
};

async function handleReviewDecision(action) {
  const driver = pemanduState.selectedDriver;
  if (!driver) return;

  const reason = document.getElementById('revDriverReasonInput')?.value.trim();
  const branchSelect = document.getElementById('revDriverBranchSelect')?.value;
  const plateSelect = document.getElementById('revDriverPlateSelect')?.value;

  if (['MINTA_PEMBETULAN', 'TOLAK'].includes(action) && (!reason || reason.length < 5)) {
    alert('Sila nyatakan catatan/sebab (minimum 5 aksara) sebelum menghantar tindakan.');
    return;
  }

  if (action === 'LULUSKAN') {
    if (!confirm(`Sahkan kelulusan akaun pemandu ${driver.name} bagi cawangan ${BRANCH_LABELS[branchSelect] || branchSelect}?`)) return;
    driver.account_status = 'Aktif';
    driver.hub_id = branchSelect;
    driver.assigned_plate = plateSelect;
    driver.approved_at = new Date().toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    driver.approved_by_name = portalState.operatorName || 'Abe Di (HQ Kok Lanas)';
    driver.correction_notes = null;
    driver.rejection_reason = null;
  } else if (action === 'MINTA_PEMBETULAN') {
    driver.account_status = 'Perlu Pembetulan';
    driver.correction_notes = reason;
  } else if (action === 'TOLAK') {
    if (!confirm(`Adakah anda pasti ingin menolak permohonan pemandu ${driver.name}?`)) return;
    driver.account_status = 'Ditolak';
    driver.rejection_reason = reason;
  }

  saveDriversToStorage();

  // Audit
  pemanduState.auditLogs.unshift({
    id: 'aud-' + Date.now(),
    created_at: new Date().toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    actor_name: portalState.operatorName || 'Abe Di (HQ Kok Lanas)',
    actor_role: 'Pentadbir HQ',
    target_email: driver.email,
    action: action,
    reason: reason || (action === 'LULUSKAN' ? `Diluluskan dengan ambulans ${plateSelect || 'Tiada'}` : 'Tindakan pentadbir disahkan.')
  });
  saveAuditsToStorage();

  // Close Review Modal
  const modal = document.getElementById('modalReviewDriver');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }

  pemanduState.selectedDriver = null;
  renderAllPemanduViews();
  playSuccessChime();
  showToast(`Tindakan semakan pemandu telah direkodkan: ${action}.`);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =========================================================================
// RAKAN AMBULANS & PARTNER PORTAL INITIALIZATION
// =========================================================================
import { initPartnerPortalModule } from './partnerPortalModule.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initPartnerPortalModule());
} else {
  initPartnerPortalModule();
}

