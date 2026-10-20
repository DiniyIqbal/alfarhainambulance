// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - BRANCH MANAGER WEB PORTAL
// Controller: Tactical Radar, Rapid Dispatch, Revenue Analytics & Fleet Deck
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
   PORTAL STATE
   ------------------------------------------------------------------------- */
const portalState = {
  currentUser: null,
  activeBranch: 'kok_lanas', // 'kok_lanas' | 'raub' | 'all' | 'jeli' | 'machang'
  activeTab: 'radar', // 'radar' | 'dispatch' | 'revenue' | 'management'
  bookings: [],
  fleet: [
    {
      plate: 'VPQ 7606',
      hubId: 'kok_lanas',
      hubName: 'HQ Kok Lanas (Kelantan)',
      driver: 'Abe Di / Syalihan',
      phone: '013-914 7606',
      model: 'Toyota Hiace Medical Ambulance',
      status: 'Standby', // 'Standby' | 'En Route' | 'On Scene' | 'In Transit' | 'Maintenance'
      coords: [5.9176965, 102.2446687],
      roadTaxExpiry: '15/12/2026',
      puspakomDue: '20/11/2026',
      o2PressurePsi: 2000, // full
      activeMissionInv: null
    },
    {
      plate: 'DFG 7606',
      hubId: 'raub',
      hubName: 'Cawangan Raub (Pahang)',
      driver: 'Abe Din Estimos Sukrosa',
      phone: '013-914 7606',
      model: 'Toyota Hiace Emergency Ambulance',
      status: 'In Transit',
      coords: [3.7915, 101.8590],
      roadTaxExpiry: '28/01/2027',
      puspakomDue: '10/02/2027',
      o2PressurePsi: 1850,
      activeMissionInv: 'INV-AMC-1048'
    }
  ],
  staff: [
    { name: 'Abe Di / Syalihan', role: 'Pemandu Kanan EMT (GDL D/E)', hubId: 'kok_lanas', phone: '013-914 7606', onDuty: true },
    { name: 'Abe Din Estimos Sukrosa', role: 'Pemandu Kanan EMT (GDL D/E)', hubId: 'raub', phone: '013-914 7606', onDuty: true },
    { name: 'Dr. Afiqah (Medical Escort)', role: 'Pegawai Perubatan (Doctor)', hubId: 'kok_lanas', phone: '013-914 7606', onDuty: true },
    { name: 'En. Firdaus (PPP / M.A)', role: 'Penolong Pegawai Perubatan', hubId: 'kok_lanas', phone: '013-914 7606', onDuty: true },
    { name: 'Pn. Siti (C.A Escort)', role: 'Pembantu Klinikal', hubId: 'raub', phone: '013-914 7606', onDuty: false }
  ]
};

// Map References
let radarMap = null;
let radarMarkers = [];
let radarRoutes = [];

/* -------------------------------------------------------------------------
   INIT ON DOM READY
   ------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  initClock();
  initPortalAuth();
  initNavigationTabs();
  initBranchSelector();
  initRadarMap();
  initDispatchModal();
  initRealtimeData();
  renderAllViews();
});

/* -------------------------------------------------------------------------
   1. LIVE CLOCK (MYT - MALAYSIA TIME)
   ------------------------------------------------------------------------- */
function initClock() {
  const clockEl = document.getElementById('liveClockText');
  function update() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }) + ' MYT';
    }
  }
  update();
  setInterval(update, 1000);
}

/* -------------------------------------------------------------------------
   1B. USER AUTHENTICATION & SECURITY GATEKEEPER (PORTAL FIRST PAGE)
   ------------------------------------------------------------------------- */
function setPortalGateLocked(isLocked) {
  const gateEl = document.getElementById('portalAuthGate');
  const shellEl = document.getElementById('portalAppShell');
  if (gateEl) {
    if (isLocked) gateEl.classList.remove('hidden');
    else gateEl.classList.add('hidden');
  }
  if (shellEl) {
    if (isLocked) shellEl.classList.add('gate-locked');
    else {
      shellEl.classList.remove('gate-locked');
      // Invalidate Leaflet map size on unlock so tiles render cleanly
      setTimeout(() => {
        if (radarMap) radarMap.invalidateSize();
      }, 250);
    }
  }
}

async function initPortalAuth() {
  const authBtn = document.getElementById('portalAuthBtn');
  const modal = document.getElementById('portalAuthModal');
  const closeBtn = document.getElementById('closePortalAuthModalBtn');
  const form = document.getElementById('portalAuthForm');
  const btnTabLogin = document.getElementById('btnTabLogin');
  const btnTabRegister = document.getElementById('btnTabRegister');
  const registerFields = document.getElementById('registerOnlyFields');
  const btnSubmit = document.getElementById('btnSubmitAuth');
  const statusMsg = document.getElementById('authStatusMessage');
  const formView = document.getElementById('authFormViewContainer');
  const profileView = document.getElementById('authProfileViewContainer');
  const btnSignOut = document.getElementById('btnSignOutPortal');
  const topSignOutBtn = document.getElementById('portalTopSignOutBtn');

  // Gatekeeper First Page Elements
  const gateTabLogin = document.getElementById('gateBtnTabLogin');
  const gateTabRegister = document.getElementById('gateBtnTabRegister');
  const gateRegFields = document.getElementById('gateRegisterFields');
  const gateForm = document.getElementById('portalGateAuthForm');
  const gateSubmitLabel = document.getElementById('gateSubmitLabel');
  const gateStatusMsg = document.getElementById('gateAuthStatusMsg');

  let authMode = 'login'; // 'login' | 'register'
  let gateMode = 'login'; // 'login' | 'register'

  // 1. Check existing session on first page load
  const currentUser = await getCurrentAuthUser();
  portalState.currentUser = currentUser;
  updateAuthUI(currentUser);

  if (currentUser) {
    setPortalGateLocked(false);
  } else {
    setPortalGateLocked(true);
  }

  // 2. Gatekeeper Landing Tabs
  if (gateTabLogin && gateTabRegister) {
    gateTabLogin.addEventListener('click', () => {
      gateMode = 'login';
      gateTabLogin.classList.add('active');
      gateTabRegister.classList.remove('active');
      if (gateRegFields) gateRegFields.style.display = 'none';
      if (gateSubmitLabel) gateSubmitLabel.textContent = 'Log Masuk ke Bilik Gerakan';
      if (gateStatusMsg) gateStatusMsg.style.display = 'none';
    });

    gateTabRegister.addEventListener('click', () => {
      gateMode = 'register';
      gateTabRegister.classList.add('active');
      gateTabLogin.classList.remove('active');
      if (gateRegFields) gateRegFields.style.display = 'flex';
      if (gateSubmitLabel) gateSubmitLabel.textContent = 'Daftar Akaun Pegawai';
      if (gateStatusMsg) gateStatusMsg.style.display = 'none';
    });
  }

  // 3. Gatekeeper Landing Form Submit
  if (gateForm) {
    gateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('gateAuthEmail').value.trim();
      const password = document.getElementById('gateAuthPassword').value;
      const name = document.getElementById('gateAuthName')?.value.trim() || email.split('@')[0];
      const branch = document.getElementById('gateAuthBranch')?.value || 'kok_lanas';
      const role = document.getElementById('gateAuthRole')?.value || 'branch_manager';

      if (gateStatusMsg) {
        gateStatusMsg.style.display = 'block';
        gateStatusMsg.textContent = gateMode === 'login' ? 'Mengesahkan kelayakan akses...' : 'Mendaftar akaun pegawai...';
        gateStatusMsg.style.background = 'rgba(14, 165, 233, 0.15)';
        gateStatusMsg.style.color = '#38BDF8';
        gateStatusMsg.style.border = '1px solid #0EA5E9';
      }

      let res = null;
      if (gateMode === 'login') {
        res = await signInUser(email, password);
      } else {
        res = await signUpUser(email, password, {
          name,
          full_name: name,
          branch,
          role,
          role_label: role === 'branch_manager' ? 'Pengurus Cawangan' : (role === 'medical_officer' ? 'Pegawai Perubatan' : 'Pegawai Dispatch')
        });
      }

      if (res.success) {
        playSuccessChime();
        const user = res.user || res.data?.user;
        portalState.currentUser = user;
        updateAuthUI(user);

        if (gateStatusMsg) {
          gateStatusMsg.textContent = gateMode === 'login' ? 'Akses disahkan! Membuka bilik gerakan...' : 'Akaun berjaya dicipta! Membuka bilik gerakan...';
          gateStatusMsg.style.background = 'rgba(16, 185, 129, 0.15)';
          gateStatusMsg.style.color = '#34D399';
          gateStatusMsg.style.border = '1px solid #10B981';
        }

        setTimeout(() => {
          setPortalGateLocked(false);
          showNotificationToast(`Selamat bertugas, ${user.user_metadata?.name || user.email}!`);
        }, 600);
      } else {
        if (gateStatusMsg) {
          gateStatusMsg.textContent = res.error || 'Ralat pengesahan akaun pegawai.';
          gateStatusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
          gateStatusMsg.style.color = '#F87171';
          gateStatusMsg.style.border = '1px solid #EF4444';
        }
      }
    });
  }

  // 4. Modal Open/Close & Tabs
  if (authBtn && modal) {
    authBtn.addEventListener('click', () => {
      playCalculateChime();
      modal.classList.add('show');
      if (portalState.currentUser) {
        if (formView) formView.style.display = 'none';
        if (profileView) profileView.style.display = 'block';
      } else {
        if (formView) formView.style.display = 'block';
        if (profileView) profileView.style.display = 'none';
      }
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('show'));
  }

  if (btnTabLogin && btnTabRegister) {
    btnTabLogin.addEventListener('click', () => {
      authMode = 'login';
      btnTabLogin.classList.add('active');
      btnTabRegister.classList.remove('active');
      if (registerFields) registerFields.style.display = 'none';
      if (btnSubmit) btnSubmit.textContent = 'Log Masuk';
      if (statusMsg) statusMsg.style.display = 'none';
    });

    btnTabRegister.addEventListener('click', () => {
      authMode = 'register';
      btnTabRegister.classList.add('active');
      btnTabLogin.classList.remove('active');
      if (registerFields) registerFields.style.display = 'flex';
      if (btnSubmit) btnSubmit.textContent = 'Daftar Akaun';
      if (statusMsg) statusMsg.style.display = 'none';
    });
  }

  // 5. Modal Form Submit Handler
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('authEmailInput').value.trim();
      const password = document.getElementById('authPasswordInput').value;
      const name = document.getElementById('authNameInput')?.value.trim() || email.split('@')[0];
      const branch = document.getElementById('authBranchInput')?.value || 'kok_lanas';
      const role = document.getElementById('authRoleInput')?.value || 'branch_manager';

      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.textContent = authMode === 'login' ? 'Mengesahkan log masuk...' : 'Mendaftar akaun baharu...';
        statusMsg.style.background = 'rgba(14, 165, 233, 0.15)';
        statusMsg.style.color = '#38BDF8';
        statusMsg.style.border = '1px solid #0EA5E9';
      }

      let res = null;
      if (authMode === 'login') {
        res = await signInUser(email, password);
      } else {
        res = await signUpUser(email, password, {
          name,
          full_name: name,
          branch,
          role,
          role_label: role === 'branch_manager' ? 'Pengurus Cawangan' : (role === 'driver' ? 'Pemandu EMT' : 'Pegawai Dispatch')
        });
      }

      if (res.success) {
        playSuccessChime();
        const user = res.user || res.data?.user;
        portalState.currentUser = user;
        updateAuthUI(user);
        setPortalGateLocked(false);

        if (statusMsg) {
          statusMsg.textContent = authMode === 'login' ? 'Log masuk berjaya!' : 'Akaun berjaya didaftarkan!';
          statusMsg.style.background = 'rgba(16, 185, 129, 0.15)';
          statusMsg.style.color = '#34D399';
          statusMsg.style.border = '1px solid #10B981';
        }

        setTimeout(() => {
          modal.classList.remove('show');
          showNotificationToast(`Selamat bertugas, ${user.user_metadata?.name || user.email}!`);
        }, 600);
      } else {
        if (statusMsg) {
          statusMsg.textContent = res.error || 'Ralat pengesahan akaun.';
          statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
          statusMsg.style.color = '#F87171';
          statusMsg.style.border = '1px solid #EF4444';
        }
      }
    });
  }

  // 6. Quick Demo Auth Logins (Gatekeeper & Modal)
  document.querySelectorAll('.btn-demo-quick-auth').forEach(btn => {
    btn.addEventListener('click', async () => {
      playCalculateChime();
      const email = btn.dataset.email;
      const name = btn.dataset.name;
      const branch = btn.dataset.branch;
      const role = btn.dataset.role;

      const mockUser = {
        id: 'demo_' + Date.now(),
        email: email,
        user_metadata: {
          name: name,
          full_name: name,
          branch: branch,
          branch_name: branch === 'raub' ? 'Cawangan Raub (Pahang)' : (branch === 'kok_lanas' ? 'HQ Kok Lanas (Kelantan)' : 'Seluruh Malaysia'),
          role: role,
          role_label: role
        }
      };

      portalState.currentUser = mockUser;
      localStorage.setItem('amc_auth_user', JSON.stringify(mockUser));
      updateAuthUI(mockUser);
      setPortalGateLocked(false);

      // Auto switch branch selector to match user branch
      if (branch && branch !== 'all') {
        const select = document.getElementById('portalBranchSelect');
        if (select) {
          select.value = branch;
          select.dispatchEvent(new Event('change'));
        }
      }

      if (modal) modal.classList.remove('show');
      playSuccessChime();
      showNotificationToast(`Log Masuk Pantas: ${name}`);
    });
  });

  // 7. Sign Out Handlers (Topbar Button & Modal Button)
  const handleSignOut = async () => {
    playCalculateChime();
    await signOutUser();
    portalState.currentUser = null;
    updateAuthUI(null);
    setPortalGateLocked(true);
    if (modal) modal.classList.remove('show');
    showNotificationToast('Anda telah log keluar daripada sistem.');
  };

  if (btnSignOut) {
    btnSignOut.addEventListener('click', handleSignOut);
  }
  if (topSignOutBtn) {
    topSignOutBtn.addEventListener('click', handleSignOut);
  }
}

function updateAuthUI(user) {
  const nameEl = document.getElementById('portalUserName');
  const roleEl = document.getElementById('portalUserRole');
  const avatarEl = document.getElementById('portalUserAvatar');
  const operatorTitle = document.getElementById('activeOperatorTitle');

  // Big modal views
  const bigName = document.getElementById('profileNameBig');
  const bigRole = document.getElementById('profileRoleBig');
  const bigEmail = document.getElementById('profileEmailBig');
  const bigAvatar = document.getElementById('profileAvatarBig');
  const bigBranch = document.getElementById('profileBranchBig');

  if (user) {
    const displayName = user.user_metadata?.name || user.user_metadata?.full_name || user.email.split('@')[0];
    const displayRole = user.user_metadata?.role_label || user.user_metadata?.role || 'Pengurus Cawangan';
    const initials = displayName.slice(0, 2).toUpperCase();

    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) roleEl.textContent = displayRole;
    if (avatarEl) avatarEl.textContent = initials;
    if (operatorTitle) operatorTitle.textContent = displayName;

    if (bigName) bigName.textContent = displayName;
    if (bigRole) bigRole.textContent = displayRole;
    if (bigEmail) bigEmail.textContent = user.email;
    if (bigAvatar) bigAvatar.textContent = initials;
    if (bigBranch) bigBranch.textContent = user.user_metadata?.branch_name || 'HQ Kok Lanas';
  } else {
    if (nameEl) nameEl.textContent = 'Log Masuk';
    if (roleEl) roleEl.textContent = 'Akses Pengurus';
    if (avatarEl) avatarEl.textContent = '👤';
    if (operatorTitle) operatorTitle.textContent = 'Pengurus Cawangan';
  }
}

/* -------------------------------------------------------------------------
   2. DESKTOP TABS SWITCHING (ENTERPRISE SIDEBAR)
   ------------------------------------------------------------------------- */
function initNavigationTabs() {
  const tabs = document.querySelectorAll('.sidebar-nav-item');
  const panes = document.querySelectorAll('.view-section-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target;
      if (!target) return;

      playCalculateChime();
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(target);
      if (targetPane) targetPane.classList.add('active');

      portalState.activeTab = target.replace('View', '');

      // Invalidate map size if opening radar
      if (portalState.activeTab === 'radar' && radarMap) {
        setTimeout(() => radarMap.invalidateSize(), 150);
      }
    });
  });

  // Global Search Input
  initGlobalSearch();
  // Map Quick Jump Controls
  initMapQuickJumpControls();
  // CSV Export
  initCsvExport();
  // Sound FX Toggle
  initSoundToggle();
}

function initGlobalSearch() {
  const searchInput = document.getElementById('portalGlobalSearchInput');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    filterPortalContent(q);
  });

  // Shortcut key '/' to focus search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  });
}

function filterPortalContent(q) {
  const tableRows = document.querySelectorAll('#revenueTableBody tr');
  tableRows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = (!q || text.includes(q)) ? '' : 'none';
  });

  const cards = document.querySelectorAll('.kanban-mission-card');
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}

function initMapQuickJumpControls() {
  const btnBranch = document.getElementById('btnMapFocusBranch');
  const btnRaub = document.getElementById('btnMapFocusRaub');
  const btnAll = document.getElementById('btnMapFocusAll');

  if (btnBranch) {
    btnBranch.addEventListener('click', () => {
      playCalculateChime();
      setActiveMapPill(btnBranch);
      if (radarMap) radarMap.flyTo(HUBS.KOK_LANAS.coords, 10.5, { duration: 1.2 });
    });
  }

  if (btnRaub) {
    btnRaub.addEventListener('click', () => {
      playCalculateChime();
      setActiveMapPill(btnRaub);
      if (radarMap) radarMap.flyTo(HUBS.RAUB.coords, 10.5, { duration: 1.2 });
    });
  }

  if (btnAll) {
    btnAll.addEventListener('click', () => {
      playCalculateChime();
      setActiveMapPill(btnAll);
      if (radarMap) radarMap.flyTo([4.8, 101.9], 7.5, { duration: 1.5 });
    });
  }
}

function setActiveMapPill(activeBtn) {
  document.querySelectorAll('.map-control-pill').forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');
}

let soundEnabled = true;
function initSoundToggle() {
  const btn = document.getElementById('portalSoundToggleBtn');
  const icon = document.getElementById('soundToggleIcon');
  if (btn) {
    btn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
      showNotificationToast(soundEnabled ? 'Bunyi siren & audio diaktifkan' : 'Mod senyap diaktifkan');
    });
  }
}

function initCsvExport() {
  const btn = document.getElementById('btnExportCsv');
  if (!btn) return;

  btn.addEventListener('click', () => {
    playSuccessChime();
    const rows = [
      ['No. Invois', 'Tarikh', 'Cawangan', 'Lokasi Pengambilan', 'Destinasi Hospital', 'Jarak (KM)', 'Ambulans', 'Pemandu', 'Jumlah (RM)', 'Status']
    ];

    portalState.bookings.forEach(b => {
      rows.push([
        b.invoice_number,
        new Date(b.created_at).toLocaleDateString('ms-MY'),
        b.hub_name,
        b.origin_name,
        b.destination_name,
        b.distance_km,
        b.plate_number,
        b.driver_name,
        parseFloat(b.total_fare || 0).toFixed(2),
        b.status
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AMC_Ambulans_Laporan_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotificationToast('Laporan CSV berjaya dimuat turun!');
  });
}

/* -------------------------------------------------------------------------
   3. BRANCH SELECTOR CONTROLLER
   ------------------------------------------------------------------------- */
function initBranchSelector() {
  const select = document.getElementById('portalBranchSelect');
  const label = document.getElementById('mapFocusBranchLabel');
  const operatorTitle = document.getElementById('activeOperatorTitle');

  if (select) {
    select.addEventListener('change', (e) => {
      portalState.activeBranch = e.target.value;
      playCalculateChime();

      if (label) {
        label.textContent = portalState.activeBranch === 'raub' ? 'Cawangan Raub' : 'HQ Kok Lanas';
      }
      if (operatorTitle) {
        operatorTitle.textContent = portalState.activeBranch === 'raub'
          ? 'Pengurus Cawangan Raub'
          : (portalState.activeBranch === 'kok_lanas' ? 'Pengurus HQ Kok Lanas' : 'Pengarah Operasi AMC');
      }

      renderAllViews();
      focusRadarMapOnBranch();
    });
  }
}

/* -------------------------------------------------------------------------
   4. TACTICAL RADAR MAP (LEAFLET DESKTOP)
   ------------------------------------------------------------------------- */
function initRadarMap() {
  const mapContainer = document.getElementById('portalRadarMap');
  if (!mapContainer || typeof L === 'undefined') return;

  // Initialize at Kok Lanas / Peninsular Malaysia center
  radarMap = L.map('portalRadarMap', {
    zoomControl: true,
    attributionControl: false
  }).setView([5.9177, 102.2447], 9);

  // Clean, high-definition OpenStreetMap tiles with zero watermark & no API key required
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors • Al-Farhain AMC Ambulans'
  }).addTo(radarMap);

  updateRadarMarkers();
}

function focusRadarMapOnBranch() {
  if (!radarMap) return;
  if (portalState.activeBranch === 'kok_lanas') {
    radarMap.flyTo(HUBS.KOK_LANAS.coords, 10, { duration: 1.2 });
  } else if (portalState.activeBranch === 'raub') {
    radarMap.flyTo(HUBS.RAUB.coords, 10, { duration: 1.2 });
  } else {
    radarMap.flyTo([4.8, 101.9], 7.5, { duration: 1.5 }); // Whole Semenanjung
  }
}

function updateRadarMarkers() {
  if (!radarMap || typeof L === 'undefined') return;

  // Clear existing
  radarMarkers.forEach(m => radarMap.removeLayer(m));
  radarMarkers = [];
  radarRoutes.forEach(r => radarMap.removeLayer(r));
  radarRoutes = [];

  // 1. Add Branch Hub Markers
  const activeHubs = portalState.activeBranch === 'all'
    ? [HUBS.KOK_LANAS, HUBS.RAUB]
    : [HUBS[portalState.activeBranch.toUpperCase()] || HUBS.KOK_LANAS];

  activeHubs.forEach(hub => {
    if (!hub || !hub.coords) return;
    const hubIcon = L.divIcon({
      className: 'custom-hub-marker',
      html: `
        <div style="background:#00A896; color:#FFF; font-weight:800; font-size:11px; padding:4px 8px; border-radius:20px; box-shadow:0 0 16px rgba(0,168,150,0.6); border:2px solid #FFF; display:flex; align-items:center; gap:4px; white-space:nowrap;">
          <span>🏛️</span> <span>${hub.shortName}</span>
        </div>
      `,
      iconSize: [120, 26],
      iconAnchor: [60, 13]
    });

    const m = L.marker(hub.coords, { icon: hubIcon }).addTo(radarMap);
    m.bindPopup(`<b>${hub.name}</b><br>Plat: ${hub.ambulancePlate}<br>Pemandu: ${hub.primaryDriver}`);
    radarMarkers.push(m);
  });

  // 2. Add Fleet Ambulance Markers
  portalState.fleet.forEach(unit => {
    if (portalState.activeBranch !== 'all' && unit.hubId !== portalState.activeBranch) return;

    const isMission = unit.status !== 'Standby';
    const statusColor = isMission ? '#F59E0B' : '#10B981';

    const unitIcon = L.divIcon({
      className: 'radar-unit-marker',
      html: `
        <div style="position:relative; display:flex; align-items:center; justify-content:center;">
          <div style="position:absolute; width:44px; height:44px; border-radius:50%; background:${statusColor}; opacity:0.25; animation:pulse-ring 2s infinite;"></div>
          <div style="background:#0E1825; border:2px solid ${statusColor}; color:#FFF; padding:3px 8px; border-radius:12px; font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:800; display:flex; align-items:center; gap:5px; box-shadow:0 4px 12px rgba(0,0,0,0.5);">
            <span>🚑</span> <span>${unit.plate}</span>
          </div>
        </div>
      `,
      iconSize: [80, 24],
      iconAnchor: [40, 12]
    });

    const marker = L.marker(unit.coords, { icon: unitIcon }).addTo(radarMap);
    marker.bindPopup(`
      <div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:12px; color:#0F172A; min-width:180px;">
        <strong style="color:#00A896;">🚑 ${unit.plate} (${unit.model})</strong><br>
        <b>Pangkalan:</b> ${unit.hubName}<br>
        <b>Pemandu:</b> ${unit.driver} (${unit.phone})<br>
        <b>Status Misi:</b> <span style="font-weight:700; color:${statusColor}">${unit.status}</span><br>
        <b>Tekanan Oksigen:</b> ${unit.o2PressurePsi} PSI (Baik)
      </div>
    `);
    radarMarkers.push(marker);
  });

  // 3. Add Mission Route corridors for active bookings
  const activeMissions = portalState.bookings.filter(b => b.status !== 'Completed' && b.status !== 'Selesai');
  activeMissions.forEach(m => {
    if (portalState.activeBranch !== 'all' && m.hub_id !== portalState.activeBranch) return;
    // Example route line if coordinates are mapped
  });
}

/* -------------------------------------------------------------------------
   5. REALTIME SUPABASE & DEMO SEED
   ------------------------------------------------------------------------- */
async function initRealtimeData() {
  const dot = document.getElementById('portalCloudDot');
  const cloudText = document.getElementById('portalCloudStatusText');

  // Check Supabase connectivity
  if (isSupabaseConfigured()) {
    if (dot) dot.style.backgroundColor = '#10B981';
    if (cloudText) cloudText.textContent = 'Supabase Realtime Terhubung';

    // Fetch initial bookings
    const dbBookings = await fetchBookingsFromSupabase(50);
    if (dbBookings && dbBookings.length > 0) {
      portalState.bookings = dbBookings;
      renderAllViews();
    } else {
      seedInitialMockBookings();
    }

    // Subscribe to live broadcasts
    subscribeToRealtimeBookings(
      (newBooking) => {
        playEmergencyAlertSiren();
        portalState.bookings.unshift(newBooking);
        renderAllViews();
        showNotificationToast(`🚨 Misi Baharu: ${newBooking.invoice_number} (${newBooking.destination_name})`);
      },
      (updatedBooking) => {
        playSuccessChime();
        const idx = portalState.bookings.findIndex(b => b.invoice_number === updatedBooking.invoice_number);
        if (idx !== -1) {
          portalState.bookings[idx] = updatedBooking;
        } else {
          portalState.bookings.unshift(updatedBooking);
        }
        renderAllViews();
      }
    );
  } else {
    if (dot) dot.style.backgroundColor = '#F59E0B';
    if (cloudText) cloudText.textContent = 'Mod Tempatan (Demo Aktif)';
    seedInitialMockBookings();
  }

  // Supabase Configuration Modal in Portal
  initPortalSupabaseModal();
}

function initPortalSupabaseModal() {
  const cloudBtn = document.getElementById('portalCloudBtn');
  const modal = document.getElementById('portalSupabaseModal');
  const closeBtn = document.getElementById('closePortalSupabaseModalBtn');
  const urlInput = document.getElementById('portalSupabaseUrlInput');
  const keyInput = document.getElementById('portalSupabaseKeyInput');
  const testBtn = document.getElementById('portalTestSupabaseBtn');
  const saveBtn = document.getElementById('portalSaveSupabaseBtn');
  const resultDiv = document.getElementById('portalSupabaseTestResult');

  const config = getStoredSupabaseConfig();
  if (config.url && urlInput) urlInput.value = config.url;
  if (config.anonKey && keyInput) keyInput.value = config.anonKey;

  if (cloudBtn && modal) {
    cloudBtn.addEventListener('click', () => {
      playCalculateChime();
      modal.classList.add('show');
    });
  }
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('show'));
  }
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const url = urlInput ? urlInput.value.trim() : '';
      const key = keyInput ? keyInput.value.trim() : '';
      if (!url || !key) {
        if (resultDiv) {
          resultDiv.style.display = 'block';
          resultDiv.textContent = 'Sila masukkan Project URL dan Anon Key.';
          resultDiv.style.color = '#F87171';
        }
        return;
      }
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.textContent = 'Menguji sambungan...';
        resultDiv.style.color = '#38BDF8';
      }
      const res = await testSupabaseConnection(url, key);
      if (resultDiv) {
        resultDiv.textContent = res.message;
        resultDiv.style.background = res.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
        resultDiv.style.color = res.success ? '#34D399' : '#F87171';
        resultDiv.style.border = `1px solid ${res.success ? '#10B981' : '#EF4444'}`;
      }
    });
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const url = urlInput ? urlInput.value.trim() : '';
      const key = keyInput ? keyInput.value.trim() : '';
      if (!url || !key) {
        alert('Sila masukkan Project URL dan Anon Key.');
        return;
      }
      saveSupabaseConfig(url, key);
      if (modal) modal.classList.remove('show');
      showNotificationToast('Tetapan Supabase telah disimpan! Memuat semula...');
      setTimeout(() => window.location.reload(), 1000);
    });
  }
}

function seedInitialMockBookings() {
  portalState.bookings = [
    {
      invoice_number: 'INV-AMC-1048',
      hub_id: 'raub',
      hub_name: 'Al-Farhain Cawangan Raub',
      origin_name: 'Bandar Raub',
      destination_name: 'Hospital Bentong',
      distance_km: 54.2,
      trip_type: 'Kecemasan Standard',
      assistance_package: 'Penolong Pegawai Perubatan (PPP / M.A)',
      assistance_cost: 200,
      equipment_items: 'Tangki Oksigen',
      equipment_cost: 50,
      total_fare: 587.60,
      plate_number: 'DFG 7606',
      driver_name: 'Abe Din Estimos Sukrosa',
      patient_name: 'En. Razak (Trauma Kemalangan)',
      status: 'In Transit',
      created_at: new Date(Date.now() - 25 * 60000).toISOString()
    },
    {
      invoice_number: 'INV-AMC-1047',
      hub_id: 'kok_lanas',
      hub_name: 'HQ Kok Lanas',
      origin_name: 'Kubang Kerian',
      destination_name: 'Hospital Raja Perempuan Zainab II',
      distance_km: 18.5,
      trip_type: 'Bukan Kecemasan (Discaj)',
      assistance_package: 'Pembantu Klinikal (C.A)',
      assistance_cost: 100,
      equipment_items: 'Tiada',
      equipment_cost: 0,
      total_fare: 400.00,
      plate_number: 'VPQ 7606',
      driver_name: 'Abe Di / Syalihan',
      patient_name: 'Hj. Ismail (Discaj Rawatan Wad)',
      status: 'On Scene',
      created_at: new Date(Date.now() - 45 * 60000).toISOString()
    },
    {
      invoice_number: 'INV-AMC-1046',
      hub_id: 'kok_lanas',
      hub_name: 'HQ Kok Lanas',
      origin_name: 'Bandar Machang',
      destination_name: 'Hospital Kuala Krai',
      distance_km: 32.0,
      trip_type: 'Kecemasan Inter-Hospital',
      assistance_package: 'Doktor Pengiring (Dr. Escort)',
      assistance_cost: 400,
      equipment_items: 'Tangki Oksigen, Ventilator',
      equipment_cost: 200,
      total_fare: 921.00,
      plate_number: 'VPQ 7606',
      driver_name: 'Abe Di / Syalihan',
      patient_name: 'Pn. Halimah (ICU Transfer)',
      status: 'Selesai',
      created_at: new Date(Date.now() - 3 * 3600000).toISOString()
    }
  ];
  renderAllViews();
}

/* -------------------------------------------------------------------------
   6. RENDER MASTER
   ------------------------------------------------------------------------- */
function renderAllViews() {
  renderTelemetrySidebar();
  renderKanbanPipeline();
  renderRevenueAnalytics();
  renderManagementDeck();
  updateRadarMarkers();
}

/* -------------------------------------------------------------------------
   7. RENDER TELEMETRY SIDEBAR (RADAR VIEW)
   ------------------------------------------------------------------------- */
function renderTelemetrySidebar() {
  const container = document.getElementById('telemetryUnitsList');
  if (!container) return;

  const filteredFleet = portalState.fleet.filter(u =>
    portalState.activeBranch === 'all' || u.hubId === portalState.activeBranch
  );

  container.innerHTML = filteredFleet.map(unit => {
    const isMission = unit.status !== 'Standby';
    const o2Percent = Math.min(100, Math.round((unit.o2PressurePsi / 2000) * 100));

    return `
      <div class="telemetry-card ${isMission ? 'in-mission' : ''}">
        <div class="telemetry-top-row">
          <span class="plate-badge-bold">${unit.plate}</span>
          <span class="status-chip ${unit.status.toLowerCase().replace(/\s+/g, '')}">${unit.status}</span>
        </div>

        <div style="font-size:0.78rem; font-weight:700; color:#FFFFFF; margin-bottom:2px;">${unit.model}</div>
        <div style="font-size:0.72rem; color:var(--text-muted);">${unit.hubName}</div>

        <!-- Oxygen Gauge Bar -->
        <div class="telemetry-gauge-box">
          <div class="gauge-label-row">
            <span>Tekanan Oksigen Tangki</span>
            <span style="font-family:var(--font-mono); font-weight:700; color:${o2Percent > 50 ? '#34D399' : '#FBBF24'}">${unit.o2PressurePsi} PSI (${o2Percent}%)</span>
          </div>
          <div class="gauge-track">
            <div class="gauge-fill" style="width: ${o2Percent}%; background:${o2Percent > 50 ? 'linear-gradient(90deg, #10B981, #00A896)' : 'linear-gradient(90deg, #F59E0B, #EF4444)'}"></div>
          </div>
        </div>

        <div class="telemetry-footer-grid">
          <div><b>Pemandu:</b> ${unit.driver}</div>
          <div><b>Cukai Jalan:</b> ${unit.roadTaxExpiry}</div>
        </div>

        <div class="telemetry-actions-bar">
          <button class="btn-card-action btn-locate-unit" data-plate="${unit.plate}">📍 Fokus Peta</button>
          <a class="btn-card-action" href="tel:${unit.phone.replace(/[^0-9]/g, '')}">📞 Panggil</a>
          <a class="btn-card-action" target="_blank" href="https://wa.me/60${unit.phone.replace(/[^0-9]/g, '').replace(/^0/, '')}?text=Salam%20${encodeURIComponent(unit.driver)},%20update%20status%20ambulans%20${unit.plate}">💬 WhatsApp</a>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-locate-unit').forEach(btn => {
    btn.addEventListener('click', () => {
      const plate = btn.dataset.plate;
      const unit = portalState.fleet.find(u => u.plate === plate);
      if (unit && radarMap) {
        radarMap.flyTo(unit.coords, 14, { duration: 1.2 });
      }
    });
  });
}

/* -------------------------------------------------------------------------
   8. RENDER KANBAN DISPATCH PIPELINE
   ------------------------------------------------------------------------- */
function renderKanbanPipeline() {
  const stages = [
    { key: 'Dispatched', label: 'Digerakkan (En Route)' },
    { key: 'On Scene', label: 'Di Lokasi Pesakit' },
    { key: 'In Transit', label: 'Dalam Transit Hospital' },
    { key: 'Selesai', label: 'Misi Selesai' }
  ];

  let totalActive = 0;

  stages.forEach(st => {
    const colContainer = document.getElementById(`kanbanCol-${st.key.replace(/\s+/g, '')}`);
    const badgeEl = document.getElementById(`badgeCount-${st.key.replace(/\s+/g, '')}`);
    if (!colContainer) return;

    const cards = portalState.bookings.filter(b => {
      const matchBranch = portalState.activeBranch === 'all' || b.hub_id === portalState.activeBranch;
      const matchStatus = b.status === st.key ||
        (st.key === 'Selesai' && (b.status === 'Completed' || b.status === 'Selesai'));
      return matchBranch && matchStatus;
    });

    if (st.key !== 'Selesai') totalActive += cards.length;
    if (badgeEl) badgeEl.textContent = cards.length;

    colContainer.innerHTML = cards.map(b => {
      const isCritical = (b.trip_type || '').toLowerCase().includes('kecemasan');
      const nextStage = st.key === 'Dispatched' ? 'On Scene' : (st.key === 'On Scene' ? 'In Transit' : 'Selesai');
      const nextStageLabel = st.key === 'Dispatched' ? 'Tiba di Lokasi ➔' : (st.key === 'On Scene' ? 'Mula Transit ➔' : 'Selesai Misi ✓');

      return `
        <div class="kanban-mission-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="card-severity-tag ${isCritical ? 'severity-critical' : 'severity-standard'}">
              ${isCritical ? '🚨 KECEMASAN' : '🚐 STANDARD'}
            </span>
            <span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-dim);">
              ${new Date(b.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <strong style="font-family:var(--font-mono); color:#38BDF8; font-size:0.85rem;">${b.invoice_number}</strong>
            <span style="font-family:var(--font-mono); font-weight:800; color:#34D399; font-size:0.85rem;">RM ${parseFloat(b.total_fare || 0).toFixed(2)}</span>
          </div>

          <div class="mission-route-row">
            <div class="route-stop-line">
              <span>📍</span> <span><b>Dari:</b> ${escapeHtml(b.origin_name)}</span>
            </div>
            <div class="route-stop-line">
              <span>🏁</span> <span><b>Ke:</b> ${escapeHtml(b.destination_name)} (${b.distance_km} KM)</span>
            </div>
          </div>

          <div style="font-size:0.72rem; color:var(--text-muted); background:rgba(255,255,255,0.03); padding:6px 8px; border-radius:6px;">
            🚑 <b>${b.plate_number}</b> • ${escapeHtml(b.driver_name)}
          </div>

          <div class="kanban-card-actions">
            <select class="form-select status-quick-change" data-inv="${b.invoice_number}" style="padding:4px 8px; font-size:0.7rem; height:auto; width:auto;">
              <option value="Dispatched" ${b.status === 'Dispatched' ? 'selected' : ''}>Digerakkan</option>
              <option value="On Scene" ${b.status === 'On Scene' ? 'selected' : ''}>On Scene</option>
              <option value="In Transit" ${b.status === 'In Transit' ? 'selected' : ''}>In Transit</option>
              <option value="Selesai" ${b.status === 'Selesai' || b.status === 'Completed' ? 'selected' : ''}>Selesai</option>
            </select>

            ${st.key !== 'Selesai' ? `
              <button class="btn-advance-stage btn-step-forward" data-inv="${b.invoice_number}" data-next="${nextStage}">
                ${nextStageLabel}
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('') || `<div style="font-size:0.74rem; color:var(--text-dim); text-align:center; padding:24px 0;">Tiada Misi</div>`;
  });

  // Update active count badge in sidebar
  const sidebarCountBadge = document.getElementById('badgeActiveMissionsCount');
  if (sidebarCountBadge) sidebarCountBadge.textContent = `${totalActive} Aktif`;

  // Attach quick change listeners
  document.querySelectorAll('.status-quick-change').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      handleStatusUpdate(sel.dataset.inv, e.target.value);
    });
  });

  // Attach step forward buttons
  document.querySelectorAll('.btn-step-forward').forEach(btn => {
    btn.addEventListener('click', async () => {
      handleStatusUpdate(btn.dataset.inv, btn.dataset.next);
    });
  });
}

async function handleStatusUpdate(inv, newStatus) {
  playSuccessChime();
  const target = portalState.bookings.find(b => b.invoice_number === inv);
  if (target) target.status = newStatus;

  if (isSupabaseConfigured()) {
    await updateBookingStatusInSupabase(inv, newStatus);
  }
  renderAllViews();
}

/* -------------------------------------------------------------------------
   9. RENDER REVENUE ANALYTICS
   ------------------------------------------------------------------------- */
function renderRevenueAnalytics() {
  const filtered = portalState.bookings.filter(b =>
    portalState.activeBranch === 'all' || b.hub_id === portalState.activeBranch
  );

  const totalRev = filtered.reduce((sum, b) => sum + parseFloat(b.total_fare || 0), 0);
  const totalTrips = filtered.length;
  const totalKm = filtered.reduce((sum, b) => sum + parseFloat(b.distance_km || 0), 0);

  const totalRevEl = document.getElementById('revMetricTotal');
  const totalTripsEl = document.getElementById('revMetricTrips');
  const totalKmEl = document.getElementById('revMetricKm');
  const avgFareEl = document.getElementById('revMetricAvgFare');

  if (totalRevEl) totalRevEl.textContent = `RM ${totalRev.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (totalTripsEl) totalTripsEl.textContent = totalTrips;
  if (totalKmEl) totalKmEl.textContent = `${totalKm.toFixed(1)} KM`;
  if (avgFareEl) avgFareEl.textContent = totalTrips > 0 ? `RM ${(totalRev / totalTrips).toFixed(2)}` : 'RM 0.00';

  // Branch Specific Contributions
  const kokLanasRev = portalState.bookings
    .filter(b => b.hub_id === 'kok_lanas')
    .reduce((sum, b) => sum + parseFloat(b.total_fare || 0), 0);

  const raubRev = portalState.bookings
    .filter(b => b.hub_id === 'raub')
    .reduce((sum, b) => sum + parseFloat(b.total_fare || 0), 0);

  const kokLanasRevEl = document.getElementById('revBranchKokLanas');
  const raubRevEl = document.getElementById('revBranchRaub');
  if (kokLanasRevEl) kokLanasRevEl.textContent = `RM ${kokLanasRev.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (raubRevEl) raubRevEl.textContent = `RM ${raubRev.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Table of recent records
  const tableBody = document.getElementById('revenueTableBody');
  if (tableBody) {
    tableBody.innerHTML = filtered.map(b => `
      <tr>
        <td><strong style="font-family:var(--font-mono); color:#38BDF8;">${b.invoice_number}</strong></td>
        <td>${new Date(b.created_at).toLocaleDateString('ms-MY')}</td>
        <td><b>${b.hub_name}</b></td>
        <td>${escapeHtml(b.origin_name)} ➔ ${escapeHtml(b.destination_name)}</td>
        <td><span style="font-family:var(--font-mono);">${b.distance_km} KM</span></td>
        <td>${b.plate_number} (${b.driver_name})</td>
        <td><strong style="font-family:var(--font-mono); color:#34D399;">RM ${parseFloat(b.total_fare || 0).toFixed(2)}</strong></td>
        <td>
          <span class="status-chip ${b.status === 'Selesai' || b.status === 'Completed' ? 'standby' : 'enroute'}">
            ${b.status}
          </span>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="8" style="text-align:center; padding:20px;">Tiada rekod tempahan ditemui</td></tr>`;
  }
}

/* -------------------------------------------------------------------------
   10. RENDER FLEET & CREW MANAGEMENT DECK
   ------------------------------------------------------------------------- */
function renderManagementDeck() {
  const fleetList = document.getElementById('mgmtFleetList');
  const staffList = document.getElementById('mgmtStaffList');

  if (fleetList) {
    const filteredFleet = portalState.fleet.filter(u =>
      portalState.activeBranch === 'all' || u.hubId === portalState.activeBranch
    );

    fleetList.innerHTML = filteredFleet.map(u => {
      const o2Percent = Math.min(100, Math.round((u.o2PressurePsi / 2000) * 100));

      return `
        <div class="vehicle-health-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="plate-badge-bold" style="font-size:1.05rem;">${u.plate}</span>
                <span class="status-chip ${u.status === 'Standby' ? 'standby' : 'enroute'}">${u.status}</span>
              </div>
              <div style="font-size:0.88rem; font-weight:700; color:#FFFFFF; margin-top:6px;">${u.model}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${u.hubName}</div>
            </div>
            <div style="text-align:right;">
              <span class="nav-badge-pill" style="font-size:0.72rem;">Road Tax Sah</span>
              <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">Tamat: ${u.roadTaxExpiry}</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-light); padding:12px; border-radius:8px; margin-top:6px;">
            <div>
              <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">Pemandu Utama</div>
              <div style="font-size:0.8rem; font-weight:700; color:#FFFFFF; margin-top:2px;">${u.driver}</div>
            </div>
            <div>
              <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">Puspakom Servis</div>
              <div style="font-size:0.8rem; font-weight:700; color:#38BDF8; margin-top:2px;">${u.puspakomDue}</div>
            </div>
            <div>
              <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">Silinder O2</div>
              <div style="font-size:0.8rem; font-weight:700; color:#34D399; margin-top:2px;">${u.o2PressurePsi} PSI (${o2Percent}%)</div>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px;">
            <button class="btn-card-action" onclick="alert('Rekod Servis Toyota Hiace ${u.plate}: Minyak hitam, brek & tayar dalam keadaan 100% memuaskan.')">Log Servis &amp; Minyak</button>
            <a class="btn-card-action" href="tel:${u.phone.replace(/[^0-9]/g, '')}">Hubungi Kru (013-914 7606)</a>
          </div>
        </div>
      `;
    }).join('');
  }

  if (staffList) {
    const filteredStaff = portalState.staff.filter(s =>
      portalState.activeBranch === 'all' || s.hubId === portalState.activeBranch
    );

    staffList.innerHTML = filteredStaff.map(s => `
      <div class="staff-duty-card">
        <div style="display:flex; align-items:center; gap:14px;">
          <div class="operator-avatar" style="width:40px; height:40px; font-size:0.85rem;">
            ${s.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style="font-size:0.92rem; font-weight:800; color:#FFFFFF;">${s.name}</div>
            <div style="font-size:0.75rem; color:var(--amc-teal); font-weight:600; margin-top:2px;">${s.role}</div>
            <div style="font-size:0.7rem; color:var(--text-dim); margin-top:2px;">Hotline: ${s.phone}</div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px;">
          <span class="status-chip ${s.onDuty ? 'standby' : ''}">${s.onDuty ? '🟢 Siap Siaga Bertugas' : '⚪ Rehat / Cuti'}</span>
          <a class="btn-card-action" target="_blank" href="https://wa.me/60139147606?text=Salam%20${encodeURIComponent(s.name)},%20makluman%20arahan%20syif%20Al-Farhain%20AMC">WhatsApp</a>
        </div>
      </div>
    `).join('');
  }
}

/* -------------------------------------------------------------------------
   11. RAPID DISPATCH LAUNCHER MODAL
   ------------------------------------------------------------------------- */
function initDispatchModal() {
  const openBtn = document.getElementById('openDispatchModalBtn');
  const closeBtn = document.getElementById('closeDispatchModalBtn');
  const modal = document.getElementById('dispatchLauncherModal');
  const form = document.getElementById('quickDispatchForm');
  const branchSelect = document.getElementById('dispatchHubSelect');
  const distanceInput = document.getElementById('dispatchDistanceKm');
  const fareDisplay = document.getElementById('dispatchEstFare');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      playCalculateChime();
      modal.classList.add('show');
      if (branchSelect) branchSelect.value = portalState.activeBranch === 'all' ? 'kok_lanas' : portalState.activeBranch;
      calculateModalFare();
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('show'));
  }

  if (distanceInput) {
    distanceInput.addEventListener('input', calculateModalFare);
  }

  function calculateModalFare() {
    const dist = parseFloat(distanceInput ? distanceInput.value : 25) || 25;
    let base = 250;
    let extra = 0;
    if (dist > 25) {
      extra = (dist - 25) * 3.00;
    }
    const misc = 50;
    const total = base + extra + misc;
    if (fareDisplay) fareDisplay.textContent = `RM ${total.toFixed(2)}`;
    return total;
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      playSuccessChime();

      const hub = branchSelect ? branchSelect.value : 'kok_lanas';
      const hubData = HUBS[hub.toUpperCase()] || HUBS.KOK_LANAS;
      const origin = document.getElementById('dispatchOriginInput').value || 'Pusat Bandar';
      const dest = document.getElementById('dispatchDestInput').value || 'Hospital Terdekat';
      const dist = parseFloat(document.getElementById('dispatchDistanceKm').value) || 25;
      const patient = document.getElementById('dispatchPatientInput').value || 'Pesakit Kecemasan';
      const driver = hub === 'raub' ? 'Abe Din Estimos Sukrosa' : 'Abe Di / Syalihan';
      const plate = hub === 'raub' ? 'DFG 7606' : 'VPQ 7606';
      const total = calculateModalFare();

      const newBooking = {
        invoiceNumber: `INV-AMC-${Math.floor(1000 + Math.random() * 9000)}`,
        hubId: hub,
        hubName: hubData.name,
        originName: origin,
        destinationName: dest,
        distanceKm: dist,
        tripType: 'Kecemasan Standard',
        baseFare: 250,
        extraKmCost: dist > 25 ? (dist - 25) * 3 : 0,
        assistancePackage: 'EMT Krew Bertugas',
        assistanceCost: 0,
        equipmentItems: 'Tangki Oksigen',
        equipmentCost: 50,
        miscFee: 50,
        totalFare: total,
        isDieselSurge: false,
        plateNumber: plate,
        driverName: driver,
        contactPhone: '013-914 7606',
        patientName: patient,
        status: 'Dispatched'
      };

      // Insert to Supabase if configured
      if (isSupabaseConfigured()) {
        await insertBookingToSupabase(newBooking);
      }

      // Convert key names for local state
      portalState.bookings.unshift({
        invoice_number: newBooking.invoiceNumber,
        hub_id: newBooking.hubId,
        hub_name: newBooking.hubName,
        origin_name: newBooking.originName,
        destination_name: newBooking.destinationName,
        distance_km: newBooking.distanceKm,
        total_fare: newBooking.totalFare,
        plate_number: newBooking.plateNumber,
        driver_name: newBooking.driverName,
        patient_name: newBooking.patientName,
        status: 'Dispatched',
        created_at: new Date().toISOString()
      });

      modal.classList.remove('show');
      renderAllViews();
      showNotificationToast(`🚀 Unit ${plate} berjaya digerakkan ke ${dest}!`);

      // WhatsApp Launch Prompt
      const waText = encodeURIComponent(
        `🚨 ARAHAN DISPATCH RASMI AMBULANS AMC\n` +
        `Invois: ${newBooking.invoiceNumber}\n` +
        `Pemandu: ${driver} (${plate})\n` +
        `Lokasi Ambil: ${origin}\n` +
        `Destinasi: ${dest} (${dist} KM)\n` +
        `Pesakit: ${patient}\n` +
        `Anggaran Tambang: RM${total.toFixed(2)}\n` +
        `Sila respon 'DITERIMA' dan gerakkan unit dengan serta-merta.`
      );
      window.open(`https://wa.me/60139147606?text=${waText}`, '_blank');
    });
  }
}

/* -------------------------------------------------------------------------
   HELPERS
   ------------------------------------------------------------------------- */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showNotificationToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #00A896;
    color: #FFFFFF;
    font-weight: 700;
    font-size: 13px;
    padding: 12px 20px;
    border-radius: 10px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.4);
    z-index: 3000;
    transition: opacity 0.3s;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
