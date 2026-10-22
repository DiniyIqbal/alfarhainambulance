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
  signUpUser,
  signInUser,
  signOutUser,
  getCurrentAuthUser
} from '../services/supabaseClient.js';

import { haversineKm, estimateDurationMin } from '../services/routingService.js';
import { playCalculateChime, playEmergencyAlertSiren, playSuccessChime } from '../utils/soundFx.js';

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
let tacticalRadarMap = null;
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
  initTacticalRadarMap();
  initDashboardView();
  renderDashboardFleet();
  renderRevenueTable();
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
    hasilInvoisView: 'Hasil & Invois'
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
   7. TACTICAL RADAR MAP (PETA & FLEET)
   ------------------------------------------------------------------------- */
function initTacticalRadarMap() {
  const mapEl = document.getElementById('portalRadarMap');
  if (!mapEl || typeof L === 'undefined') return;

  try {
    tacticalRadarMap = L.map('portalRadarMap', {
      zoomControl: true,
      attributionControl: false
    }).setView([5.0, 102.0], 7);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(tacticalRadarMap);

    // Fleet Ambulance Markers
    portalState.fleet.forEach(van => {
      const marker = L.circleMarker(van.coords, {
        radius: 9,
        fillColor: van.status === 'Bersedia' ? '#10B981' : '#F59E0B',
        color: '#FFFFFF',
        weight: 2.5,
        fillOpacity: 1
      }).addTo(tacticalRadarMap);

      marker.bindPopup(`
        <div style="font-family: var(--font-sans); padding: 4px;">
          <strong style="color: #007D77;">${van.plate}</strong><br>
          <span style="font-size: 0.75rem; color: #526966;">Pemandu: ${van.driver}</span><br>
          <span style="font-size: 0.75rem;">Status: <b>${van.status}</b></span>
        </div>
      `);
    });

    // Floating map focus controls
    document.getElementById('btnMapFocusBranch')?.addEventListener('click', () => {
      tacticalRadarMap.setView([5.9176965, 102.2446687], 12);
    });
    document.getElementById('btnMapFocusRaub')?.addEventListener('click', () => {
      tacticalRadarMap.setView([3.7915, 101.8590], 12);
    });
    document.getElementById('btnMapFocusAll')?.addEventListener('click', () => {
      tacticalRadarMap.setView([4.5, 102.0], 7);
    });
  } catch (err) {
    console.warn('Tactical radar map error:', err);
  }
}

function invalidateAllMaps() {
  setTimeout(() => {
    if (dashboardArmadaMap) dashboardArmadaMap.invalidateSize();
    if (tacticalRadarMap) tacticalRadarMap.invalidateSize();
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
