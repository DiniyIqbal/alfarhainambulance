// AL-FARHAIN MEDICAL CENTER (AMC) - AMBULANCE MEDICAL SYSTEM
// Main Application Controller & Dynamic Interaction Engine
// Faithfully redesigned based on Mockups 01, 02, 03

import {
  HUBS,
  OTHER_BRANCHES,
  PRESET_PICKUP_LOCATIONS,
  PRESET_DESTINATIONS,
  TRIP_TYPES,
  ASSISTANCE_PACKAGES,
  ADDITIONAL_EQUIPMENTS,
  BASE_SETTINGS,
  FAQ_DATABASE
} from './data/pricingData.js';

import {
  playClickSound,
  playCalculateChime,
  playEmergencyAlertSiren,
  playSuccessChime
} from './utils/soundFx.js';

import {
  getStoredSupabaseConfig,
  isSupabaseConfigured,
  saveSupabaseConfig,
  testSupabaseConnection,
  insertBookingToSupabase,
  fetchBookingsFromSupabase,
  updateBookingStatusInSupabase,
  subscribeToRealtimeBookings,
  signUpUser,
  signInUser,
  signOutUser,
  getCurrentAuthUser,
  getStoredUserProfile,
  saveStoredUserProfile
} from './services/supabaseClient.js';

import {
  haversineKm,
  estimateDurationMin,
  fetchRoadRoute,
  searchAddressGeocode
} from './services/routingService.js';

/* =========================================================================
   APPLICATION STATE (MATCHES MOCKUP DEFAULTS)
   ========================================================================= */
const state = {
  currentHub: HUBS.KOK_LANAS,
  originCoords: HUBS.KOK_LANAS.coords,

  // Stop 2: Customer Pickup Point (Home / Residence)
  pickupPresetId: 'kediaman_kb',
  pickupName: 'Bandar Kota Bharu',
  pickupAddress: 'Bandar Kota Bharu, 15000 Kota Bharu, Kelantan',
  pickupCoords: [6.1248, 102.2544],

  // Stop 3: Destination Point (Hospital / Drop-off)
  selectedDestId: 'hrpz',
  destinationName: 'Hospital Raja Perempuan Zainab II',
  destinationAddress: 'Hospital Raja Perempuan Zainab II (HRPZ II), Kota Bharu',
  destinationCoords: [6.1256, 102.2482],

  // Stop 4: Optional Multi-Stop / Return Point (Home or 2nd Medical Center)
  hasStop4: false,
  stop4Type: 'return', // 'return' | 'second_dest'
  returnName: 'Kediaman Pesakit (Pulang)',
  returnAddress: 'Bandar Kota Bharu, 15000 Kota Bharu, Kelantan',
  returnCoords: null,

  // Multi-Leg Distances & Durations
  // Leg 1: Hub -> Pickup, Leg 2: Pickup -> Dest 1, Leg 3: Dest 1 -> Return/Dest 2
  leg1Km: 25.2,
  leg1DurationMin: 24,
  leg2Km: 1.1,
  leg2DurationMin: 3,
  leg3Km: 0,
  leg3DurationMin: 0,
  distanceKm: 26.3,
  totalDurationMin: 27,
  isRealRoad: false,
  isCalculatingRoute: false,
  routeGeometry: null,
  leg1Geometry: null,
  leg2Geometry: null,
  leg3Geometry: null,

  calcStep: 1, // 1: Lokasi, 2: Kategori, 3: Staf, 4: Alatan, 5: Invois
  step1Mode: 'lokasi', // 'lokasi' | 'peta'

  selectedTripType: TRIP_TYPES[0], // Kecemasan standard (RM250)
  selectedAssistance: ASSISTANCE_PACKAGES[2], // Penolong Pegawai Perubatan (PPP / M.A) (+RM200) - matching mockup!
  equipmentQuantities: {
    'oxygen_supply': 1, // Tangki oksigen 1x (RM50) - matching mockup!
    'med_kit': 0,
    'transport_incubator': 0,
    'infusion_pump_ventilator': 0,
    'suction_unit': 0,
    'aed_unit': 0,
    'spine_board': 0,
    'iv_drip_set': 0,
    'maternity_kit': 0
  },

  driverStage: 2, // 1: Diterima, 2: Menuju lokasi, 3: Tiba di lokasi, 4: Dalam transit, 5: Selesai
  activeTab: 'calculator-view',
  activeCatalogFilter: 'all',
  activeReportMonth: 'Oktober 2026',
  isPhoneFrame: true
};

// Map References & Request Tokens
let miniMap = null;
let miniRouteLeg1 = null;
let miniRouteLeg2 = null;
let miniRouteLeg3 = null;
let miniMarkers = [];
let fullMap = null;
let fullRouteLeg1 = null;
let fullRouteLeg2 = null;
let fullRouteLeg3 = null;
let fullMarkers = [];
let routeRequestId = 0;

/* =========================================================================
   INITIALIZATION ON DOM LOAD
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initBranchDropdown();
  initFontDropdown();
  initNavigationTabs();
  initModeSegmentedSwitch();
  initDispatchStepper();
  initLocationModal();
  initServicesList();
  initStaffList();
  initEquipmentList();
  initStickyBar();
  initFleetSection();
  initReportsSection();
  initCatalogSection();
  initActionModals();
  initSupabaseIntegration();
  initMobileAuth();

  // Initial calculation and map render
  calculateAll();
  initMiniLeafletMap();
  calculateMultiLegRoute(true);
});

/* =========================================================================
   3. THEME TOGGLE (LIGHT MEDICAL DEFAULT VS DARK)
   ========================================================================= */
function initTheme() {
  const themeBtn = document.getElementById('themeToggleBtn');
  const icon = document.getElementById('themeToggleIcon');

  const savedTheme = localStorage.getItem('amc_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (icon) icon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      playClickSound();
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('amc_theme', next);
      if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
    });
  }
}

/* =========================================================================
   4. BRANCH DROPDOWN (HQ KOK LANAS, CAWANGAN RAUB, JELI, MACHANG, ETC.)
   ========================================================================= */
function initBranchDropdown() {
  const btn = document.getElementById('branchSelectBtn');
  const menu = document.getElementById('branchDropdownMenu');
  const items = document.querySelectorAll('.branch-item');

  if (btn && menu) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playClickSound();
      menu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      menu.classList.remove('show');
    });

    items.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        playClickSound();
        const hubKey = item.dataset.hub;
        items.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        menu.classList.remove('show');

        switchBranch(hubKey);
      });
    });
  }
}

function initFontDropdown() {
  const btn = document.getElementById('fontSizeToggleBtn');
  const menu = document.getElementById('headerFontMenu');
  const profileCard = document.querySelector('.header-profile-card');
  const signOutBtn = document.getElementById('mobileHeaderSignOutBtn');

  if (btn && menu) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playClickSound();
      menu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      menu.classList.remove('show');
    });

    if (profileCard) {
      profileCard.addEventListener('click', () => {
        menu.classList.remove('show');
      });
    }

    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => {
        menu.classList.remove('show');
      });
    }
  }
}

function switchBranch(hubKey) {
  if (hubKey === 'raub') {
    state.currentHub = HUBS.RAUB;
    state.originCoords = HUBS.RAUB.coords;
    if (!state.pickupPresetId || state.pickupPresetId.startsWith('kediaman_kb') || state.pickupPresetId.startsWith('kediaman_koklanas')) {
      state.pickupPresetId = 'kediaman_raub';
      state.pickupName = 'Bandar Raub';
      state.pickupAddress = 'Bandar Raub, 27600 Raub, Pahang Darul Makmur';
      state.pickupCoords = [3.7899, 101.8570];
      state.selectedDestId = 'h_raub';
      state.destinationName = 'Hospital Raub';
      state.destinationCoords = [3.7915, 101.8590];
    }
  } else if (hubKey === 'kok_lanas') {
    state.currentHub = HUBS.KOK_LANAS;
    state.originCoords = HUBS.KOK_LANAS.coords;
    if (!state.pickupPresetId || state.pickupPresetId.startsWith('kediaman_raub')) {
      state.pickupPresetId = 'kediaman_kb';
      state.pickupName = 'Bandar Kota Bharu';
      state.pickupAddress = 'Bandar Kota Bharu, 15000 Kota Bharu, Kelantan';
      state.pickupCoords = [6.1248, 102.2544];
      state.selectedDestId = 'hrpz';
      state.destinationName = 'Hospital Raja Perempuan Zainab II';
      state.destinationCoords = [6.1256, 102.2482];
    }
  } else {
    const customBranch = OTHER_BRANCHES.find(b => b.id === hubKey);
    if (customBranch) {
      state.currentHub = {
        id: customBranch.id,
        name: customBranch.name,
        shortName: customBranch.name.replace('Al-Farhain Medical Center (Cawangan ', '').replace(')', ''),
        state: customBranch.state,
        coords: customBranch.coords,
        ambulancePlate: 'AMC 7606',
        primaryDriver: 'Kru Bertugas Al-Farhain',
        contactNumber: '013-914 7606',
        address: `${customBranch.name}, ${customBranch.state}`
      };
      state.originCoords = customBranch.coords;
    }
  }

  // Update labels across all views
  const branchLabel = document.getElementById('activeBranchLabel');
  if (branchLabel) branchLabel.textContent = state.currentHub.shortName;

  const pangkalanName = document.getElementById('displayPangkalanName');
  if (pangkalanName) pangkalanName.textContent = state.currentHub.shortName;

  const pickupName = document.getElementById('displayPickupName');
  if (pickupName) pickupName.textContent = state.pickupName;

  const destName = document.getElementById('displayDestName');
  if (destName) destName.textContent = state.destinationName;

  // Fleet View updates
  const fleetSubtitle = document.getElementById('fleetSubtitleLocation');
  if (fleetSubtitle) fleetSubtitle.textContent = `📍 ${state.currentHub.shortName}`;

  const fleetPlate = document.getElementById('fleetAmbulancePlate');
  if (fleetPlate) fleetPlate.textContent = state.currentHub.ambulancePlate;

  const fleetBranch = document.getElementById('fleetAmbulanceBranch');
  if (fleetBranch) fleetBranch.textContent = `📍 ${state.currentHub.shortName}`;

  // Recalculate Multi-Leg Route dynamically from new starting hub
  calculateMultiLegRoute(true);
}

/* =========================================================================
   ROUTING & MULTI-LEG DISTANCE ENGINE
   Leg 1: Starting Hub (Kok Lanas / Raub) ➔ Lokasi Pengambilan (Pesakit)
   Leg 2: Lokasi Pengambilan (Pesakit) ➔ Hospital Tujuan
   ========================================================================= */
async function calculateMultiLegRoute(forceRecalc = false) {
  const currentReq = ++routeRequestId;
  state.isCalculatingRoute = true;
  updateRouteCalculationStatus(true);

  const dest2Coords = (state.hasStop4 && state.returnCoords && state.returnCoords.length >= 2)
    ? state.returnCoords
    : null;

  // 1. Instant preliminary calculation using calibrated Haversine road formula
  const fastLeg1 = haversineKm(state.originCoords, state.pickupCoords, 1.28);
  const fastLeg2 = haversineKm(state.pickupCoords, state.destinationCoords, 1.28);
  const fastLeg3 = dest2Coords ? haversineKm(state.destinationCoords, dest2Coords, 1.28) : 0;
  const fastTotal = Math.round((fastLeg1 + fastLeg2 + fastLeg3) * 10) / 10;

  // If we don't have real road geometry yet, set fast values immediately
  if (!state.isRealRoad || forceRecalc) {
    state.leg1Km = fastLeg1;
    state.leg1DurationMin = estimateDurationMin(fastLeg1);
    state.leg2Km = fastLeg2;
    state.leg2DurationMin = estimateDurationMin(fastLeg2);
    state.leg3Km = fastLeg3;
    state.leg3DurationMin = dest2Coords ? estimateDurationMin(fastLeg3) : 0;
    state.distanceKm = fastTotal;
    state.totalDurationMin = estimateDurationMin(fastTotal);
    calculateAll();
  }

  // 2. Fetch high-precision road route via OSRM
  try {
    const route = await fetchRoadRoute(state.originCoords, state.pickupCoords, state.destinationCoords, dest2Coords);

    // Guard against race conditions if user clicked again while fetching
    if (currentReq !== routeRequestId) return;

    state.leg1Km = route.leg1Km;
    state.leg1DurationMin = route.leg1DurationMin;
    state.leg2Km = route.leg2Km;
    state.leg2DurationMin = route.leg2DurationMin;
    state.leg3Km = route.hasLeg3 ? route.leg3Km : 0;
    state.leg3DurationMin = route.hasLeg3 ? route.leg3DurationMin : 0;
    state.distanceKm = route.totalKm;
    state.totalDurationMin = route.totalDurationMin;
    state.isRealRoad = route.isRealRoad;
    state.routeGeometry = route.fullGeometry;
    state.leg1Geometry = route.leg1Geometry;
    state.leg2Geometry = route.leg2Geometry;
    state.leg3Geometry = route.hasLeg3 ? route.leg3Geometry : null;
  } catch (err) {
    console.warn('[Routing] Failed to fetch live road route:', err);
  } finally {
    if (currentReq === routeRequestId) {
      state.isCalculatingRoute = false;
      updateRouteCalculationStatus(false);
      calculateAll();
      updateMapMarkers();
    }
  }
}

function updateRouteCalculationStatus(isCalculating) {
  const badge = document.getElementById('mapRoutingStatusBadge');
  const text = document.getElementById('mapRoutingStatusText');
  if (badge) {
    badge.classList.toggle('calculating', isCalculating);
  }
  if (text) {
    text.textContent = isCalculating
      ? 'Mengira laluan jalan raya...'
      : (state.isRealRoad ? 'Laluan Jalan Raya Sebenar' : 'Anggaran Rangkaian Jalan');
  }
}

/* =========================================================================
   5. NAVIGATION TABS (DISPATCH, FLEET, REPORTS, KATALOG)
   ========================================================================= */
function initNavigationTabs() {
  const dockButtons = document.querySelectorAll('.dock-tab-item');
  const sections = document.querySelectorAll('.view-section');
  const stepperContainer = document.getElementById('dispatchStepperContainer');
  const stickyBar = document.getElementById('stickyStepActionBar');

  dockButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      const targetId = btn.dataset.tab;

      dockButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      sections.forEach(s => {
        s.classList.toggle('active', s.id === targetId);
      });

      state.activeTab = targetId;

      // Show stepper & sticky bar ONLY in Dispatch view
      const isDispatch = targetId === 'calculator-view';
      if (stepperContainer) stepperContainer.style.display = isDispatch ? 'block' : 'none';

      if (stickyBar) {
        const showSticky = isDispatch && state.calcStep >= 2 && state.calcStep <= 4;
        stickyBar.style.display = showSticky ? 'flex' : 'none';
      }

      // Refresh maps if switching to dispatch
      if (isDispatch) {
        setTimeout(() => {
          if (state.step1Mode === 'lokasi' && miniMap) miniMap.invalidateSize();
          if (state.step1Mode === 'peta' && fullMap) fullMap.invalidateSize();
        }, 150);
      }
    });
  });
}

/* =========================================================================
   6. SEGMENTED SWITCH: [ 📍 Lokasi ] [ 🗺️ Peta ] (STEP 1)
   ========================================================================= */
function initModeSegmentedSwitch() {
  const btnLokasi = document.getElementById('btnModeLokasi');
  const btnPeta = document.getElementById('btnModePeta');
  const contentLokasi = document.getElementById('step1LokasiModeContent');
  const contentPeta = document.getElementById('step1PetaModeContent');
  const miniMapBox = document.getElementById('miniMapContainer');
  const btnUseRoute = document.getElementById('btnUseThisRoute');

  function setMode(mode) {
    state.step1Mode = mode;
    if (btnLokasi) btnLokasi.classList.toggle('active', mode === 'lokasi');
    if (btnPeta) btnPeta.classList.toggle('active', mode === 'peta');

    if (contentLokasi) contentLokasi.style.display = mode === 'lokasi' ? 'block' : 'none';
    if (contentPeta) contentPeta.style.display = mode === 'peta' ? 'block' : 'none';

    if (mode === 'peta') {
      initFullLeafletMap();
      setTimeout(() => {
        if (fullMap) fullMap.invalidateSize();
      }, 150);
    } else {
      setTimeout(() => {
        if (miniMap) miniMap.invalidateSize();
      }, 150);
    }
  }

  if (btnLokasi) btnLokasi.addEventListener('click', () => { playClickSound(); setMode('lokasi'); });
  if (btnPeta) btnPeta.addEventListener('click', () => { playClickSound(); setMode('peta'); });
  if (miniMapBox) miniMapBox.addEventListener('click', () => { playClickSound(); setMode('peta'); });

  if (btnUseRoute) {
    btnUseRoute.addEventListener('click', () => {
      playSuccessChime();
      setMode('lokasi');
      switchCalcStep(2);
    });
  }
}

/* =========================================================================
   7. DISPATCH 5-STEP TRACKER CONTROLLER
   ========================================================================= */
function initDispatchStepper() {
  const nodeButtons = document.querySelectorAll('.stepper-node-item');
  const btnContinue1 = document.getElementById('btnContinueToCategory');

  nodeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseInt(btn.dataset.step, 10);
      switchCalcStep(step);
    });
  });

  if (btnContinue1) {
    btnContinue1.addEventListener('click', () => {
      playClickSound();
      switchCalcStep(2);
    });
  }
}

function switchCalcStep(stepNum) {
  stepNum = Math.max(1, Math.min(5, stepNum));
  state.calcStep = stepNum;

  // 1. Toggle Step Pages
  const pages = document.querySelectorAll('.calc-step-page');
  pages.forEach(p => {
    const s = parseInt(p.dataset.step, 10);
    p.classList.toggle('active', s === stepNum);
  });

  // 2. Update Stepper Header
  const nodeButtons = document.querySelectorAll('.stepper-node-item');
  nodeButtons.forEach(btn => {
    const s = parseInt(btn.dataset.step, 10);
    const circle = btn.querySelector('.node-circle');
    btn.classList.remove('active', 'completed');

    if (s === stepNum) {
      btn.classList.add('active');
      circle.textContent = s;
    } else if (s < stepNum) {
      btn.classList.add('completed');
      circle.textContent = '✓';
    } else {
      circle.textContent = s;
    }
  });

  // 3. Update Progress Bar Fill Width
  const progressFill = document.getElementById('stepperProgressFill');
  if (progressFill) {
    const widths = { 1: '10%', 2: '32%', 3: '54%', 4: '76%', 5: '100%' };
    progressFill.style.width = widths[stepNum] || '10%';
  }

  // 4. Update Sticky Action Bar (visible on Steps 2, 3, 4)
  const stickyBar = document.getElementById('stickyStepActionBar');
  if (stickyBar) {
    const isDispatch = state.activeTab === 'calculator-view';
    stickyBar.style.display = (isDispatch && stepNum >= 2 && stepNum <= 4) ? 'flex' : 'none';
  }

  // 5. Scroll container to top
  const phoneContent = document.getElementById('phoneContent');
  if (phoneContent) {
    phoneContent.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Map resizing if returning to step 1
  if (stepNum === 1) {
    setTimeout(() => {
      if (state.step1Mode === 'lokasi' && miniMap) miniMap.invalidateSize();
      if (state.step1Mode === 'peta' && fullMap) fullMap.invalidateSize();
    }, 150);
  }
}

/* =========================================================================
   8. STICKY ACTION BAR NAVIGATION (STEPS 2, 3, 4)
   ========================================================================= */
function initStickyBar() {
  const btnPrev = document.getElementById('btnStickyPrev');
  const btnNext = document.getElementById('btnStickyNext');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      playClickSound();
      switchCalcStep(state.calcStep - 1);
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      playClickSound();
      switchCalcStep(state.calcStep + 1);
    });
  }
}

/* =========================================================================
   9. CALCULATION ENGINE
   ========================================================================= */
function calculateAll() {
  const baseKm = BASE_SETTINGS.standardBaseKm; // 25.0 km
  const totalKm = state.distanceKm;
  const extraKm = Math.max(0, totalKm - baseKm);
  const extraKmRate = BASE_SETTINGS.extraKmRateNormal; // RM3.00

  // 1. Base trip fee
  const baseFare = state.selectedTripType ? state.selectedTripType.baseFare : 250.00;
  const extraDistanceFee = extraKm * extraKmRate;
  const step1BaseTotal = baseFare + extraDistanceFee;

  // 2. Staff package fee
  const staffFee = state.selectedAssistance ? state.selectedAssistance.price : 0.00;

  // 3. Equipment fee
  let equipTotal = 0;
  let equipCount = 0;
  ADDITIONAL_EQUIPMENTS.forEach(eq => {
    const qty = state.equipmentQuantities[eq.id] || 0;
    if (qty > 0) {
      equipTotal += qty * eq.price;
      equipCount += qty;
    }
  });

  // 4. Grand total
  const grandTotal = step1BaseTotal + staffFee + equipTotal;

  // UPDATE DOM ELEMENTS:

  // Step 1: Distance and Base Fare Display
  const distSplit = document.getElementById('displayDistanceSplit');
  if (distSplit) {
    if (state.hasStop4) {
      distSplit.textContent = `${state.leg1Km.toFixed(1)} km + ${state.leg2Km.toFixed(1)} km + ${state.leg3Km.toFixed(1)} km`;
    } else {
      distSplit.textContent = `${state.leg1Km.toFixed(1)} km + ${state.leg2Km.toFixed(1)} km`;
    }
  }

  const totalKmEl = document.getElementById('displayTotalKm');
  if (totalKmEl) totalKmEl.textContent = `${totalKm.toFixed(1)} km`;

  const formulaEl = document.getElementById('displayEstimateFormula');
  if (formulaEl) {
    formulaEl.textContent = `RM${baseFare.toFixed(0)} + (${extraKm.toFixed(1)} km × RM${extraKmRate.toFixed(0)}) Kadar asas + jarak tambahan`;
  }

  const step1PriceEl = document.getElementById('displayStep1Price');
  if (step1PriceEl) step1PriceEl.textContent = `RM${step1BaseTotal.toFixed(2)}`;

  // Step 1 Peta view labels with dynamic route endpoints and driving durations
  const leg1Label = document.getElementById('mapLeg1Label');
  if (leg1Label) leg1Label.textContent = `${state.currentHub.shortName} ➔ ${state.pickupName}`;

  const leg1KmEl = document.getElementById('mapLeg1Km');
  if (leg1KmEl) leg1KmEl.textContent = `${state.leg1Km.toFixed(1)} km (~${state.leg1DurationMin} min)`;

  const leg2Label = document.getElementById('mapLeg2Label');
  if (leg2Label) leg2Label.textContent = `${state.pickupName} ➔ ${state.destinationName}`;

  const leg2KmEl = document.getElementById('mapLeg2Km');
  if (leg2KmEl) leg2KmEl.textContent = `${state.leg2Km.toFixed(1)} km (~${state.leg2DurationMin} min)`;

  // Step 1 Peta Leg 3
  const mapLeg3Row = document.getElementById('mapLeg3Row');
  const leg3Label = document.getElementById('mapLeg3Label');
  const leg3KmEl = document.getElementById('mapLeg3Km');
  if (mapLeg3Row) {
    mapLeg3Row.style.display = state.hasStop4 ? 'flex' : 'none';
  }
  if (leg3Label && state.hasStop4) {
    const returnPrefix = state.stop4Type === 'return' ? 'Pulang (' + state.returnName + ')' : state.returnName;
    leg3Label.textContent = `${state.destinationName} ➔ ${returnPrefix}`;
  }
  if (leg3KmEl && state.hasStop4) {
    leg3KmEl.textContent = `${state.leg3Km.toFixed(1)} km (~${state.leg3DurationMin} min)`;
  }

  const mapTotalEl = document.getElementById('mapTotalDistanceKm');
  if (mapTotalEl) mapTotalEl.textContent = `${totalKm.toFixed(1)} km (~${state.totalDurationMin} min)`;

  // Sticky Bar estimate updates based on step:
  const stickyAmount = document.getElementById('stickyFareAmount');
  if (stickyAmount) {
    if (state.calcStep === 2) {
      stickyAmount.textContent = `RM${step1BaseTotal.toFixed(2)}`;
    } else if (state.calcStep === 3) {
      stickyAmount.textContent = `RM${(step1BaseTotal + staffFee).toFixed(2)}`;
    } else {
      stickyAmount.textContent = `RM${grandTotal.toFixed(2)}`;
    }
  }

  // Step 5 Invois summary updates
  const invTotalKm = document.getElementById('invSummaryTotalKm');
  if (invTotalKm) invTotalKm.textContent = `${totalKm.toFixed(1)} km`;

  const invStop1Title = document.getElementById('invSummaryStop1Title');
  if (invStop1Title) invStop1Title.textContent = state.currentHub.shortName;

  const invStop2Title = document.getElementById('invSummaryStop2Title');
  if (invStop2Title) invStop2Title.textContent = state.pickupName;

  const invStop3Title = document.getElementById('invSummaryStop3Title');
  if (invStop3Title) invStop3Title.textContent = state.destinationName;

  // Step 5 Stop 4 update
  const invStop4Row = document.getElementById('invSummaryStop4Row');
  const invStop4Title = document.getElementById('invSummaryStop4Title');
  const invStop4Sub = document.getElementById('invSummaryStop4Sub');
  if (invStop4Row) {
    invStop4Row.style.display = state.hasStop4 ? 'flex' : 'none';
  }
  if (invStop4Title && state.hasStop4) {
    invStop4Title.textContent = state.returnName;
  }
  if (invStop4Sub && state.hasStop4) {
    invStop4Sub.textContent = state.returnAddress || (state.stop4Type === 'return' ? 'Hantar pulang ke kediaman' : 'Fasiliti Perubatan Seterusnya');
  }

  const invGrandTotalEl = document.getElementById('invSummaryGrandTotal');
  if (invGrandTotalEl) invGrandTotalEl.textContent = `RM${grandTotal.toFixed(2)}`;

  // Populate Butiran Kos list in Step 5
  populateCostItems(baseFare, extraKm, extraKmRate, extraDistanceFee, staffFee, equipTotal);

  // Populate Printable Official Invoice Modal
  populatePrintableInvoice(baseFare, extraKm, extraKmRate, extraDistanceFee, staffFee, grandTotal);
}

function populateCostItems(baseFare, extraKm, extraKmRate, extraDistanceFee, staffFee, equipTotal) {
  const container = document.getElementById('costItemsContainer');
  if (!container) return;

  let html = `
    <div class="cost-item-row">
      <span>Kadar asas (${BASE_SETTINGS.standardBaseKm.toFixed(0)} km)</span>
      <span class="cost-item-price">RM${baseFare.toFixed(2)}</span>
    </div>
  `;

  if (extraKm > 0) {
    html += `
      <div class="cost-item-row">
        <span>Lebihan jarak (${extraKm.toFixed(1)} km × RM${extraKmRate.toFixed(0)})</span>
        <span class="cost-item-price">RM${extraDistanceFee.toFixed(2)}</span>
      </div>
    `;
  }

  if (state.selectedAssistance && state.selectedAssistance.price > 0) {
    html += `
      <div class="cost-item-row">
        <span>Pakej ${state.selectedAssistance.roleTitle}</span>
        <span class="cost-item-price">RM${staffFee.toFixed(2)}</span>
      </div>
    `;
  }

  // Equipment lines
  ADDITIONAL_EQUIPMENTS.forEach(eq => {
    const qty = state.equipmentQuantities[eq.id] || 0;
    if (qty > 0) {
      html += `
        <div class="cost-item-row">
          <span>${eq.name.split('(')[0]} × ${qty}</span>
          <span class="cost-item-price">RM${(qty * eq.price).toFixed(2)}</span>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

function populatePrintableInvoice(baseFare, extraKm, extraKmRate, extraDistanceFee, staffFee, grandTotal) {
  const invOrigin = document.getElementById('invOrigin');
  if (invOrigin) invOrigin.textContent = state.currentHub.shortName;

  const invPickup = document.getElementById('invPickup');
  if (invPickup) invPickup.textContent = state.pickupName;

  const invDest = document.getElementById('invDestination');
  if (invDest) invDest.textContent = state.destinationName;

  const invReturnRow = document.getElementById('invReturnInfoRow');
  const invReturnInfo = document.getElementById('invReturnInfo');
  if (invReturnRow) {
    invReturnRow.style.display = state.hasStop4 ? 'inline' : 'none';
  }
  if (invReturnInfo && state.hasStop4) {
    invReturnInfo.textContent = `${state.returnName} (${state.leg3Km.toFixed(1)} KM)`;
  }

  const invDist = document.getElementById('invDistanceKm');
  if (invDist) invDist.textContent = `${state.distanceKm.toFixed(1)} KM`;

  const invPlate = document.getElementById('invPlateNumber');
  if (invPlate) invPlate.textContent = state.currentHub.ambulancePlate;

  const invBranch = document.getElementById('invBranchName');
  if (invBranch) invBranch.textContent = state.currentHub.name;

  const tbody = document.getElementById('invTableBody');
  if (tbody) {
    const routeBreakdownText = state.hasStop4
      ? `Laluan 3-Leg: ${state.leg1Km.toFixed(1)} km (${state.currentHub.shortName} ➔ ${state.pickupName}) + ${state.leg2Km.toFixed(1)} km (${state.pickupName} ➔ ${state.destinationName}) + ${state.leg3Km.toFixed(1)} km (${state.destinationName} ➔ ${state.returnName})`
      : `Laluan: ${state.leg1Km.toFixed(1)} km (${state.currentHub.shortName} ➔ ${state.pickupName}) + ${state.leg2Km.toFixed(1)} km (${state.pickupName} ➔ ${state.destinationName})`;

    // 1. ORIGINAL BUTIRAN: Tambang Asas & Caj Jarak
    let rows = `
      <tr class="invoice-section-hdr">
        <td colspan="3">1. MAKLUMAT TAMBANG ASAS &amp; PERJALANAN MULTI-LEG</td>
      </tr>
      <tr>
        <td><strong>Kadar Asas (${state.selectedTripType.name})</strong></td>
        <td>
          Kadar tetap sehingga ${BASE_SETTINGS.standardBaseKm.toFixed(0)} KM<br>
          <small style="color:#64748B;">${routeBreakdownText}</small>
        </td>
        <td style="text-align: right; font-weight: 700;">RM ${baseFare.toFixed(2)}</td>
      </tr>
    `;

    if (extraKm > 0) {
      rows += `
        <tr>
          <td><strong>Caj Tambahan Jarak</strong></td>
          <td>${extraKm.toFixed(1)} KM &times; RM ${extraKmRate.toFixed(2)} / KM</td>
          <td style="text-align: right; font-weight: 700;">RM ${extraDistanceFee.toFixed(2)}</td>
        </tr>
      `;
    }

    // 2. PILIHAN PAKEJ STAF PENGIRING: Senarai semua staf, remark pilihan dan paparkan kadar
    rows += `
      <tr class="invoice-section-hdr">
        <td colspan="3">2. PILIHAN PAKEJ STAF PENGIRING KLINIKAL (STAFFING CAPABILITIES)</td>
      </tr>
    `;

    ASSISTANCE_PACKAGES.forEach(pkg => {
      const isChosen = state.selectedAssistance && state.selectedAssistance.id === pkg.id;
      if (isChosen) {
        rows += `
          <tr class="inv-row-chosen">
            <td>
              <strong style="color: var(--amc-teal-dark);">${pkg.roleTitle}</strong>
              <div class="inv-desc-sub">${pkg.name}</div>
            </td>
            <td>
              <span class="inv-tag inv-tag-chosen">✓ DIPILIH</span>
              <span class="inv-desc-sub">${pkg.price > 0 ? 'Kru pengiring perubatan khusus' : 'Kru asas termasuk dalam ambulan'}</span>
            </td>
            <td style="text-align: right; font-weight: 800; color: var(--amc-teal-dark);">RM ${pkg.price.toFixed(2)}</td>
          </tr>
        `;
      } else {
        rows += `
          <tr class="inv-row-opt">
            <td>
              <span class="inv-item-optional">${pkg.roleTitle}</span>
              <div class="inv-desc-sub">${pkg.name}</div>
            </td>
            <td>
              <span class="inv-tag inv-tag-opt">Pilihan Sedia Ada</span>
              <span class="inv-desc-sub">Kadar rujukan: RM ${pkg.price.toFixed(2)}</span>
            </td>
            <td style="text-align: right;" class="inv-amount-opt">RM 0.00</td>
          </tr>
        `;
      }
    });

    // 3. SENARAI PERALATAN PERUBATAN: Senarai semua inventori, remark pilihan dan paparkan kadar
    rows += `
      <tr class="invoice-section-hdr">
        <td colspan="3">3. SENARAI PERALATAN PERUBATAN &amp; SOKONGAN PESAKIT (EQUIPMENT CAPABILITIES)</td>
      </tr>
    `;

    ADDITIONAL_EQUIPMENTS.forEach(eq => {
      const qty = state.equipmentQuantities[eq.id] || 0;
      if (qty > 0) {
        const itemTotal = qty * eq.price;
        rows += `
          <tr class="inv-row-chosen">
            <td>
              <strong style="color: var(--amc-teal-dark);">${eq.name}</strong>
              <div class="inv-desc-sub">${eq.category}</div>
            </td>
            <td>
              <span class="inv-tag inv-tag-chosen">✓ DIPILIH (${qty} ${eq.unit})</span>
              <span class="inv-desc-sub">Kuantiti: ${qty} &times; RM ${eq.price.toFixed(2)}</span>
            </td>
            <td style="text-align: right; font-weight: 800; color: var(--amc-teal-dark);">RM ${itemTotal.toFixed(2)}</td>
          </tr>
        `;
      } else {
        rows += `
          <tr class="inv-row-opt">
            <td>
              <span class="inv-item-optional">${eq.name}</span>
              <div class="inv-desc-sub">${eq.category}</div>
            </td>
            <td>
              <span class="inv-tag inv-tag-opt">0 ${eq.unit} (Sedia Ada)</span>
              <span class="inv-desc-sub">Kadar rujukan: RM ${eq.price.toFixed(2)} / ${eq.unit}</span>
            </td>
            <td style="text-align: right;" class="inv-amount-opt">RM 0.00</td>
          </tr>
        `;
      }
    });

    tbody.innerHTML = rows;
  }

  const grandTotalEl = document.getElementById('invGrandTotal');
  if (grandTotalEl) grandTotalEl.textContent = `RM ${grandTotal.toFixed(2)}`;
}

/* =========================================================================
   10. STEP 2: SERVICES SELECTION (SCREEN 02)
   ========================================================================= */
function initServicesList() {
  const container = document.getElementById('serviceCardsContainer');
  if (!container) return;

  container.innerHTML = '';

  const serviceIcons = {
    'emergency': '🚑',
    'non_emergency': '🚐',
    'emergency_inhouse': '🏥',
    'aed_critical': '⚡'
  };

  TRIP_TYPES.forEach((trip, idx) => {
    const isSelected = state.selectedTripType.id === trip.id;
    const isAlert = trip.id === 'aed_critical';

    const card = document.createElement('div');
    card.className = `service-card ${isSelected ? 'selected' : ''} ${isAlert ? 'alert-card' : ''}`;
    card.dataset.id = trip.id;

    card.innerHTML = `
      <div class="service-card-left">
        <div class="service-icon-box">
          <span>${serviceIcons[trip.id] || '🚑'}</span>
        </div>
        <div class="service-texts">
          <div class="service-name-row">
            <span class="service-name">${trip.name.split('(')[0]}</span>
            <span class="service-price-pill">RM${trip.baseFare.toFixed(0)}</span>
            <span class="service-price-sub">Kadar asas</span>
          </div>
          <div class="service-desc">${trip.description}</div>
        </div>
      </div>
      <div class="custom-radio-circle"></div>
    `;

    card.addEventListener('click', () => {
      playClickSound();
      container.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedTripType = trip;
      calculateAll();
    });

    container.appendChild(card);
  });
}

/* =========================================================================
   11. STEP 3: STAFF SELECTION (SCREEN 03)
   ========================================================================= */
function initStaffList() {
  const container = document.getElementById('staffCardsContainer');
  if (!container) return;

  container.innerHTML = '';

  const staffIcons = {
    'none': '👨‍✈️',
    'ca': '👩‍⚕️',
    'ma': '👨‍⚕️',
    'dr': '🩺'
  };

  ASSISTANCE_PACKAGES.forEach(pkg => {
    const isSelected = state.selectedAssistance.id === pkg.id;

    const card = document.createElement('div');
    card.className = `staff-card ${isSelected ? 'selected' : ''}`;
    card.dataset.id = pkg.id;

    let priceTagHtml = pkg.price === 0
      ? '<span class="staff-price-tag included">Termasuk</span>'
      : `<span class="staff-price-tag">+RM${pkg.price.toFixed(0)}</span>`;

    let badgesHtml = '';
    if (pkg.id === 'ma') {
      badgesHtml = `
        <div class="staff-badges-row">
          <span class="staff-pill-badge">✨ Pemantauan</span>
          <span class="staff-pill-badge">👥 Sokongan transit</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="staff-card-left">
        <div class="staff-avatar-box">
          <span>${staffIcons[pkg.id] || '👨‍⚕️'}</span>
        </div>
        <div class="staff-texts">
          <div class="staff-title-row">
            <span class="staff-name">${pkg.roleTitle}</span>
            ${priceTagHtml}
          </div>
          <div class="staff-desc">${pkg.description}</div>
          ${badgesHtml}
        </div>
      </div>
      <div class="custom-radio-circle"></div>
    `;

    card.addEventListener('click', () => {
      playClickSound();
      container.querySelectorAll('.staff-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedAssistance = pkg;
      calculateAll();
    });

    container.appendChild(card);
  });
}

/* =========================================================================
   12. STEP 4: EQUIPMENT LIST & STEPPERS (SCREEN 04)
   ========================================================================= */
function initEquipmentList() {
  const container = document.getElementById('equipmentListContainer');
  const searchInput = document.getElementById('equipmentSearchInput');
  const btnShowAll = document.getElementById('btnShowAllEquipment');

  let showAll = false;

  function renderList(filterQuery = '') {
    if (!container) return;
    container.innerHTML = '';

    const q = filterQuery.toLowerCase();
    const visibleList = ADDITIONAL_EQUIPMENTS.filter((eq, idx) => {
      const match = eq.name.toLowerCase().includes(q) || eq.category.toLowerCase().includes(q);
      if (filterQuery.trim()) return match;
      return showAll ? true : idx < 5; // Top 5 items matching mockup
    });

    visibleList.forEach(eq => {
      const qty = state.equipmentQuantities[eq.id] || 0;

      const card = document.createElement('div');
      card.className = 'equipment-row-card';

      card.innerHTML = `
        <div class="equip-left-col">
          <div class="equip-icon-box">${eq.icon}</div>
          <div class="equip-text-col">
            <span class="equip-item-name">${eq.name.split('(')[0]}</span>
            <span class="equip-item-rate">RM${eq.price.toFixed(0)} / ${eq.unit.split('/')[0].toLowerCase().trim()}</span>
          </div>
        </div>
        <div class="stepper-counter-box">
          <button class="stepper-btn btn-minus" data-id="${eq.id}">-</button>
          <span class="stepper-qty-display" id="qty-val-${eq.id}">${qty}</span>
          <button class="stepper-btn btn-add" data-id="${eq.id}">+</button>
        </div>
      `;

      const minusBtn = card.querySelector('.btn-minus');
      const addBtn = card.querySelector('.btn-add');
      const qtyDisplay = card.querySelector(`#qty-val-${eq.id}`);

      minusBtn.addEventListener('click', () => {
        playClickSound();
        if (state.equipmentQuantities[eq.id] > 0) {
          state.equipmentQuantities[eq.id]--;
          qtyDisplay.textContent = state.equipmentQuantities[eq.id];
          calculateAll();
        }
      });

      addBtn.addEventListener('click', () => {
        playClickSound();
        state.equipmentQuantities[eq.id] = (state.equipmentQuantities[eq.id] || 0) + 1;
        qtyDisplay.textContent = state.equipmentQuantities[eq.id];
        calculateAll();
      });

      container.appendChild(card);
    });
  }

  renderList();

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderList(e.target.value);
    });
  }

  if (btnShowAll) {
    btnShowAll.addEventListener('click', () => {
      playClickSound();
      showAll = !showAll;
      btnShowAll.textContent = showAll ? '▲ Kurangkan peralatan' : '📑 Lihat semua peralatan';
      renderList();
    });
  }
}

/* =========================================================================
   13. LEAFLET MAPS: MINI PREVIEW & FULL INTERACTIVE MAP
   ======================================================================== */
function initMiniLeafletMap() {
  const container = document.getElementById('miniLeafletMap');
  if (!container || miniMap) return;

  miniMap = L.map('miniLeafletMap', {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(miniMap);

  updateMiniMap();
}

function updateMiniMap() {
  if (!miniMap) return;

  if (miniRouteLeg1) miniMap.removeLayer(miniRouteLeg1);
  if (miniRouteLeg2) miniMap.removeLayer(miniRouteLeg2);
  if (miniRouteLeg3) miniMap.removeLayer(miniRouteLeg3);
  miniMarkers.forEach(m => miniMap.removeLayer(m));
  miniMarkers = [];

  const leg1Points = state.leg1Geometry && state.leg1Geometry.length > 1
    ? state.leg1Geometry
    : [state.originCoords, state.pickupCoords];

  const leg2Points = state.leg2Geometry && state.leg2Geometry.length > 1
    ? state.leg2Geometry
    : [state.pickupCoords, state.destinationCoords];

  miniRouteLeg1 = L.polyline(leg1Points, {
    color: '#C61E2F',
    weight: 4.5,
    opacity: 0.9,
    smoothFactor: 1
  }).addTo(miniMap);

  miniRouteLeg2 = L.polyline(leg2Points, {
    color: '#C61E2F',
    weight: 4.5,
    opacity: 0.9,
    dashArray: '6, 6',
    smoothFactor: 1
  }).addTo(miniMap);

  const m1 = L.circleMarker(state.originCoords, { radius: 5, color: '#C61E2F', fillColor: '#FFFFFF', fillOpacity: 1, weight: 2.5 }).addTo(miniMap);
  const m2 = L.circleMarker(state.pickupCoords, { radius: 6, color: '#C61E2F', fillColor: '#FFF0F2', fillOpacity: 1, weight: 2.5 }).addTo(miniMap);
  const m3 = L.circleMarker(state.destinationCoords, { radius: 5, color: '#C61E2F', fillColor: '#FFFFFF', fillOpacity: 1, weight: 2.5 }).addTo(miniMap);

  miniMarkers = [m1, m2, m3];
  const activeRoutes = [miniRouteLeg1, miniRouteLeg2];

  if (state.hasStop4 && state.returnCoords && state.returnCoords.length >= 2) {
    const leg3Points = state.leg3Geometry && state.leg3Geometry.length > 1
      ? state.leg3Geometry
      : [state.destinationCoords, state.returnCoords];

    miniRouteLeg3 = L.polyline(leg3Points, {
      color: '#7C3AED',
      weight: 4.5,
      opacity: 0.9,
      smoothFactor: 1
    }).addTo(miniMap);

    const m4 = L.circleMarker(state.returnCoords, { radius: 5, color: '#7C3AED', fillColor: '#EDE9FE', fillOpacity: 1, weight: 2.5 }).addTo(miniMap);
    miniMarkers.push(m4);
    activeRoutes.push(miniRouteLeg3);
  }

  const allBounds = L.featureGroup(activeRoutes).getBounds();
  if (allBounds.isValid()) {
    miniMap.fitBounds(allBounds, { padding: [15, 15] });
  }
}

function initFullLeafletMap() {
  const container = document.getElementById('leafletMapFull');
  if (!container) return;

  if (fullMap) {
    updateFullMap();
    return;
  }

  fullMap = L.map('leafletMapFull', {
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap • Al-Farhain AMC Ambulans'
  }).addTo(fullMap);

  // Enable click on full map to set patient location directly!
  fullMap.on('click', (e) => {
    const lat = Math.round(e.latlng.lat * 100000) / 100000;
    const lng = Math.round(e.latlng.lng * 100000) / 100000;
    playClickSound();
    setPatientPickupLocation(
      'Lokasi Dipilih Pada Peta',
      `Koordinat: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      [lat, lng],
      'custom_map_click'
    );
  });

  updateFullMap();
}

function updateFullMap() {
  if (!fullMap) return;

  if (fullRouteLeg1) fullMap.removeLayer(fullRouteLeg1);
  if (fullRouteLeg2) fullMap.removeLayer(fullRouteLeg2);
  if (fullRouteLeg3) fullMap.removeLayer(fullRouteLeg3);
  fullMarkers.forEach(m => fullMap.removeLayer(m));
  fullMarkers = [];

  const leg1Points = state.leg1Geometry && state.leg1Geometry.length > 1
    ? state.leg1Geometry
    : [state.originCoords, state.pickupCoords];

  const leg2Points = state.leg2Geometry && state.leg2Geometry.length > 1
    ? state.leg2Geometry
    : [state.pickupCoords, state.destinationCoords];

  // Draw Leg 1 (Pangkalan ➔ Pesakit)
  fullRouteLeg1 = L.polyline(leg1Points, {
    color: '#C61E2F',
    weight: 5.5,
    opacity: 0.9,
    smoothFactor: 1
  }).addTo(fullMap);

  // Draw Leg 2 (Pesakit ➔ Hospital)
  fullRouteLeg2 = L.polyline(leg2Points, {
    color: '#C61E2F',
    weight: 5.5,
    opacity: 0.9,
    dashArray: '8, 8',
    smoothFactor: 1
  }).addTo(fullMap);

  // Custom DivIcons
  const hubIcon = L.divIcon({
    className: 'custom-leaflet-marker marker-hub',
    html: '<div class="marker-emoji-box">🏛️</div><div class="marker-tag-label">1. Pangkalan</div>',
    iconSize: [40, 52],
    iconAnchor: [20, 26]
  });

  const pickupIcon = L.divIcon({
    className: 'custom-leaflet-marker marker-pickup',
    html: '<div class="marker-emoji-box">📍</div><div class="marker-tag-label">2. Pesakit</div>',
    iconSize: [40, 52],
    iconAnchor: [20, 26]
  });

  const destIcon = L.divIcon({
    className: 'custom-leaflet-marker marker-dest',
    html: '<div class="marker-emoji-box">🏥</div><div class="marker-tag-label">3. Destinasi 1</div>',
    iconSize: [40, 52],
    iconAnchor: [20, 26]
  });

  // Marker 1: Starting Hub
  const m1 = L.marker(state.originCoords, { icon: hubIcon }).bindPopup(`
    <div style="font-family: var(--font-body); font-size: 0.8rem;">
      <strong style="color: #007D77; font-size: 0.88rem;">🏛️ 1. Pangkalan Bertolak</strong>
      <div style="font-weight: 700; margin-top: 3px;">${state.currentHub.name}</div>
      <div style="color: #64748B; font-size: 0.72rem; margin-top: 2px;">${state.currentHub.address}</div>
      <div style="margin-top: 6px; font-size: 0.72rem; background: #F0FDFA; padding: 4px 8px; border-radius: 4px;">
        Ambulan: <b>${state.currentHub.ambulancePlate}</b> (${state.currentHub.primaryDriver || 'Pemandu Bertugas'})
      </div>
    </div>
  `).addTo(fullMap);

  // Marker 2: Patient Pickup (DRAGGABLE!)
  const m2 = L.marker(state.pickupCoords, { icon: pickupIcon, draggable: true }).bindPopup(`
    <div style="font-family: var(--font-body); font-size: 0.8rem;">
      <strong style="color: #0284C7; font-size: 0.88rem;">📍 2. Lokasi Pesakit (Pengambilan)</strong>
      <div style="font-weight: 700; margin-top: 3px;">${state.pickupName}</div>
      <div style="color: #64748B; font-size: 0.72rem; margin-top: 2px;">${state.pickupAddress}</div>
      <div style="margin-top: 6px; font-size: 0.75rem; background: #E0F2FE; color: #0369A1; padding: 4px 8px; border-radius: 4px;">
        🛣️ Jarak dari Pangkalan: <b>${state.leg1Km.toFixed(1)} km</b> (~${state.leg1DurationMin} min)
      </div>
      <div style="font-size: 0.68rem; color: #94A3B8; margin-top: 4px;">
        💡 <i>Tip: Anda boleh seret pin ini untuk melaraskan kedudukan rumah pesakit.</i>
      </div>
    </div>
  `).addTo(fullMap);

  m2.on('dragend', (e) => {
    const pos = e.target.getLatLng();
    const lat = Math.round(pos.lat * 100000) / 100000;
    const lng = Math.round(pos.lng * 100000) / 100000;
    playClickSound();
    setPatientPickupLocation(
      'Lokasi Pin Dilaras',
      `Koordinat: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      [lat, lng],
      'custom_drag'
    );
  });

  // Marker 3: Destination Medical Center
  const m3 = L.marker(state.destinationCoords, { icon: destIcon }).bindPopup(`
    <div style="font-family: var(--font-body); font-size: 0.8rem;">
      <strong style="color: #DC2626; font-size: 0.88rem;">🏥 3. Pusat Perubatan Tujuan (Destinasi 1)</strong>
      <div style="font-weight: 700; margin-top: 3px;">${state.destinationName}</div>
      <div style="color: #64748B; font-size: 0.72rem; margin-top: 2px;">${state.destinationAddress}</div>
      <div style="margin-top: 6px; font-size: 0.75rem; background: #FEE2E2; color: #991B1B; padding: 4px 8px; border-radius: 4px;">
        🚑 Jarak dari Pesakit: <b>${state.leg2Km.toFixed(1)} km</b> (~${state.leg2DurationMin} min)
      </div>
    </div>
  `).addTo(fullMap);

  fullMarkers = [m1, m2, m3];
  const activeFullRoutes = [fullRouteLeg1, fullRouteLeg2];

  // Draw Leg 3 and Marker 4 if Stop 4 is active
  if (state.hasStop4 && state.returnCoords && state.returnCoords.length >= 2) {
    const leg3Points = state.leg3Geometry && state.leg3Geometry.length > 1
      ? state.leg3Geometry
      : [state.destinationCoords, state.returnCoords];

    fullRouteLeg3 = L.polyline(leg3Points, {
      color: '#7C3AED',
      weight: 6,
      opacity: 0.92,
      smoothFactor: 1
    }).addTo(fullMap);

    const returnIcon = L.divIcon({
      className: 'custom-leaflet-marker marker-return',
      html: `
        <div class="marker-emoji-box">${state.stop4Type === 'return' ? '🔄' : '🏥'}</div>
        <div class="marker-tag-label" style="background:#7C3AED;">4. ${state.stop4Type === 'return' ? 'Pulang' : 'Destinasi 2'}</div>
      `,
      iconSize: [40, 52],
      iconAnchor: [20, 26]
    });

    const m4 = L.marker(state.returnCoords, { icon: returnIcon }).bindPopup(`
      <div style="font-family: var(--font-body); font-size: 0.8rem;">
        <strong style="color: #7C3AED; font-size: 0.88rem;">${state.stop4Type === 'return' ? '🔄 4. Hantar Pulang (Kediaman)' : '🏥 4. Fasiliti Perubatan Ke-2'}</strong>
        <div style="font-weight: 700; margin-top: 3px;">${state.returnName}</div>
        <div style="color: #64748B; font-size: 0.72rem; margin-top: 2px;">${state.returnAddress}</div>
        <div style="margin-top: 6px; font-size: 0.75rem; background: #F3E8FF; color: #6D28D9; padding: 4px 8px; border-radius: 4px;">
          🛣️ Jarak dari Destinasi 1: <b>${state.leg3Km.toFixed(1)} km</b> (~${state.leg3DurationMin} min)
        </div>
        <div style="margin-top: 4px; font-size: 0.78rem; font-weight: 800; color: #007D77;">
          🛣️ Jumlah Keseluruhan Perjalanan: ${state.distanceKm.toFixed(1)} km (~${state.totalDurationMin} min)
        </div>
      </div>
    `).addTo(fullMap);

    fullMarkers.push(m4);
    activeFullRoutes.push(fullRouteLeg3);
  }

  const allBounds = L.featureGroup(activeFullRoutes).getBounds();
  if (allBounds.isValid()) {
    fullMap.fitBounds(allBounds, { padding: [35, 35] });
  }
}

function updateMapMarkers() {
  updateMiniMap();
  updateFullMap();
}

/* =========================================================================
   14. FLEET SECTION CONTROLLER (SCREEN 07)
   ========================================================================= */
function initFleetSection() {
  const btnUpdateStatus = document.getElementById('btnUpdateFleetStatus');
  const timelineSteps = document.querySelectorAll('#fleetTimelineBar .timeline-step');
  const missionBadge = document.getElementById('fleetMissionBadge');
  const etaVal = document.getElementById('fleetEtaVal');
  const remKmVal = document.getElementById('fleetRemainingKmVal');
  const checklistHeader = document.getElementById('checklistHeaderToggle');
  const checklistStack = document.getElementById('checklistItemsStack');
  const checklistChevron = document.getElementById('checklistChevron');

  const stageData = [
    { name: 'Diterima', badge: 'Pesanan Diterima', eta: '35 min', baki: '26.3 km' },
    { name: 'Menuju lokasi', badge: 'Dalam perjalanan', eta: '27 min', baki: '26.3 km' },
    { name: 'Tiba di lokasi', badge: 'Tiba di lokasi', eta: '15 min', baki: '12.0 km' },
    { name: 'Dalam transit', badge: 'Dalam transit', eta: '8 min', baki: '4.5 km' },
    { name: 'Selesai', badge: 'Selesai di hospital', eta: '0 min', baki: '0.0 km' }
  ];

  function setStage(stageNum) {
    state.driverStage = stageNum;

    timelineSteps.forEach((step, idx) => {
      const s = idx + 1;
      const dot = step.querySelector('.timeline-dot');
      step.classList.remove('active', 'completed');

      if (s === stageNum) {
        step.classList.add('active');
        dot.textContent = '●';
      } else if (s < stageNum) {
        step.classList.add('completed');
        dot.textContent = '✓';
      } else {
        dot.textContent = '○';
      }
    });

    const curr = stageData[stageNum - 1];
    if (missionBadge) missionBadge.textContent = curr.badge;
    if (etaVal) etaVal.textContent = curr.eta;
    if (remKmVal) remKmVal.textContent = curr.baki;
  }

  if (btnUpdateStatus) {
    btnUpdateStatus.addEventListener('click', () => {
      playSuccessChime();
      let next = state.driverStage + 1;
      if (next > 5) next = 1;
      setStage(next);
    });
  }

  timelineSteps.forEach((step, idx) => {
    step.addEventListener('click', () => {
      playClickSound();
      setStage(idx + 1);
    });
  });

  // Safety Checklist Accordion
  if (checklistHeader && checklistStack) {
    checklistHeader.addEventListener('click', () => {
      playClickSound();
      const isHidden = checklistStack.style.display === 'none';
      checklistStack.style.display = isHidden ? 'flex' : 'none';
      if (checklistChevron) checklistChevron.textContent = isHidden ? '▲' : '▼';
    });
  }
}

/* =========================================================================
   15. REPORTS SECTION CONTROLLER (SCREEN 08)
   ========================================================================= */
function initReportsSection() {
  const monthPill = document.getElementById('monthSelectorPill');
  const monthText = document.getElementById('activeReportMonth');
  const barItems = document.querySelectorAll('.bar-column-item');

  const months = ['Oktober 2026', 'September 2026', 'Ogos 2026'];
  let monthIdx = 0;

  if (monthPill && monthText) {
    monthPill.addEventListener('click', () => {
      playClickSound();
      monthIdx = (monthIdx + 1) % months.length;
      monthText.textContent = months[monthIdx];
    });
  }

  barItems.forEach(bar => {
    bar.addEventListener('click', () => {
      playClickSound();
      const day = bar.dataset.day;
      const val = bar.dataset.val;
      alert(`Prestasi: ${day} mencatatkan sebanyak ${val} trip ambulans Al-Farhain.`);
    });
  });
}

/* =========================================================================
   16. KATALOG SECTION CONTROLLER (SCREEN 09)
   ========================================================================= */
function initCatalogSection() {
  const container = document.getElementById('catalogListContainer');
  const searchInput = document.getElementById('catalogSearchInput');
  const filterPills = document.querySelectorAll('.catalog-filter-pill');

  const catalogItems = [
    { type: 'service', icon: '🚑', name: 'Kecemasan standard', code: 'AMB-EMG', price: 250 },
    { type: 'service', icon: '🚐', name: 'Bukan kecemasan', code: 'AMB-NEMG', price: 250 },
    { type: 'service', icon: '🛣️', name: 'Tambahan jarak', code: 'AMB-KM · setiap km selepas 25 km', price: 3 },
    { type: 'staff', icon: '👩‍⚕️', name: 'Pembantu klinikal', code: 'STF-CA', price: 100 },
    { type: 'staff', icon: '👨‍⚕️', name: 'Penolong pegawai perubatan', code: 'STF-MA', price: 200 },
    { type: 'staff', icon: '🩺', name: 'Pegawai perubatan', code: 'STF-DR', price: 400 },
    { type: 'equipment', icon: '💨', name: 'Tangki oksigen', code: 'EQP-02', price: 50 },
    { type: 'equipment', icon: '🩹', name: 'Kit pertolongan cemas', code: 'EQP-01', price: 20 },
    { type: 'equipment', icon: '👶', name: 'Inkubator bayi', code: 'EQP-03', price: 250 },
    { type: 'equipment', icon: '🫁', name: 'Ventilator mudah alih', code: 'EQP-04', price: 150 },
    { type: 'equipment', icon: '🧪', name: 'Unit sedutan mudah alih', code: 'EQP-05', price: 30 },
    { type: 'equipment', icon: '⚡', name: 'Unit AED Defibrillator', code: 'EQP-06', price: 500 },
    { type: 'equipment', icon: '🩼', name: 'Papan tulang belakang', code: 'EQP-07', price: 40 },
    { type: 'equipment', icon: '💧', name: 'Pek infusi cecair IV', code: 'EQP-08', price: 25 }
  ];

  function renderCatalog(filter = 'all', query = '') {
    if (!container) return;
    container.innerHTML = '';

    const q = query.toLowerCase().trim();
    const filtered = catalogItems.filter(item => {
      const matchType = filter === 'all' || item.type === filter;
      const matchQuery = !q || item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
      return matchType && matchQuery;
    });

    filtered.forEach(it => {
      const row = document.createElement('div');
      row.className = 'catalog-item-row';
      row.innerHTML = `
        <div class="catalog-item-left">
          <div class="catalog-icon-box">${it.icon}</div>
          <div class="catalog-item-info">
            <span class="catalog-item-name">${it.name}</span>
            <span class="catalog-item-code">${it.code}</span>
          </div>
        </div>
        <div class="catalog-item-right">
          <span class="catalog-item-price">RM${it.price}</span>
          <span class="catalog-chevron">›</span>
        </div>
      `;

      row.addEventListener('click', () => {
        playClickSound();
        alert(`Katalog: ${it.name} (${it.code})\nHarga Standard Rasmi: RM${it.price}.00\nSedia digunakan untuk semua tempahan ambulans Al-Farhain.`);
      });

      container.appendChild(row);
    });
  }

  renderCatalog();

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      playClickSound();
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.activeCatalogFilter = pill.dataset.filter;
      renderCatalog(state.activeCatalogFilter, searchInput ? searchInput.value : '');
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderCatalog(state.activeCatalogFilter, e.target.value);
    });
  }
}

/* =========================================================================
   17. MODAL CONTROLLERS & ACTIONS
   ========================================================================= */
function initActionModals() {
  // Invoice Modal
  const btnGenModal = document.getElementById('btnGenerateInvoiceModal');
  const invoiceModal = document.getElementById('invoiceModal');
  const closeInvModal = document.getElementById('closeInvoiceModalBtn');
  const btnConfirmClose = document.getElementById('btnConfirmBookingClose');
  const btnPrint = document.getElementById('btnPrintInvoice');

  if (btnGenModal && invoiceModal) {
    btnGenModal.addEventListener('click', () => {
      playCalculateChime();
      invoiceModal.classList.add('show');
    });
  }

  if (closeInvModal && invoiceModal) {
    closeInvModal.addEventListener('click', () => invoiceModal.classList.remove('show'));
  }

  if (btnConfirmClose && invoiceModal) {
    btnConfirmClose.addEventListener('click', () => {
      playSuccessChime();
      invoiceModal.classList.remove('show');
      alert('Tempahan ambulans telah direkodkan. Kru Al-Farhain sedang bersiap sedia.');
    });
  }

  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  // Direct Call & WhatsApp Share buttons in Step 5
  const btnCall = document.getElementById('btnDirectCall');
  const btnShare = document.getElementById('btnShareWhatsApp');

  if (btnCall) {
    btnCall.addEventListener('click', () => {
      window.location.href = `tel:${state.currentHub.contactNumber.replace(/[^0-9]/g, '')}`;
    });
  }

  if (btnShare) {
    btnShare.addEventListener('click', () => {
      let stopBreakdown = `• Pangkalan ➔ Pesakit: ${state.leg1Km.toFixed(1)} KM (~${state.leg1DurationMin} min)\n` +
        `• Pesakit ➔ Destinasi 1: ${state.leg2Km.toFixed(1)} KM (~${state.leg2DurationMin} min)\n`;

      if (state.hasStop4) {
        const dest4Label = state.stop4Type === 'return' ? `Pulang (${state.returnName})` : state.returnName;
        stopBreakdown += `• Destinasi 1 ➔ ${dest4Label}: ${state.leg3Km.toFixed(1)} KM (~${state.leg3DurationMin} min)\n`;
      }

      const returnLine = state.hasStop4
        ? `🔄 *Destinasi Ke-2 / Pulang:* ${state.returnName} (${state.returnAddress || '-'})\n`
        : '';

      const msg = `*AL-FARHAIN AMC AMBULANS - SEBUTHARGA TRIP*\n\n` +
        `🏛️ *Pangkalan Bertolak:* ${state.currentHub.name}\n` +
        `📍 *Lokasi Pengambilan (Pesakit):* ${state.pickupName} (${state.pickupAddress})\n` +
        `🏥 *Pusat Perubatan Tujuan:* ${state.destinationName}\n` +
        returnLine + `\n` +
        `🛣️ *Pecahan Jarak Jalan Raya:*\n` +
        stopBreakdown +
        `• *JUMLAH JARAK KESELURUHAN:* ${state.distanceKm.toFixed(1)} KM (~${state.totalDurationMin} min)\n\n` +
        `🚑 *Kategori:* ${state.selectedTripType.name}\n` +
        `👨‍⚕️ *Bantuan Staf:* ${state.selectedAssistance.roleTitle}\n` +
        `*JUMLAH ANGGARAN: ${document.getElementById('invSummaryGrandTotal').textContent}*\n\n` +
        `Hubungi Talian 24 Jam Al-Farhain: ${state.currentHub.contactNumber}`;

      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    });
  }

  // SOS Modal
  const btnSos = document.getElementById('sosEmergencyBtn');
  const sosModal = document.getElementById('sosModal');
  const closeSos = document.getElementById('closeSosModalBtn');

  if (btnSos && sosModal) {
    btnSos.addEventListener('click', () => {
      playEmergencyAlertSiren();
      sosModal.classList.add('show');
    });
  }
  if (closeSos && sosModal) {
    closeSos.addEventListener('click', () => sosModal.classList.remove('show'));
  }

  // Supabase Modal
  const btnSupabase = document.getElementById('supabaseConnectBtn');
  const supabaseModal = document.getElementById('supabaseModal');
  const closeSupabase = document.getElementById('closeSupabaseModalBtn');
  if (btnSupabase && supabaseModal) {
    btnSupabase.addEventListener('click', () => {
      playClickSound();
      supabaseModal.classList.add('show');
    });
  }
  if (closeSupabase && supabaseModal) {
    closeSupabase.addEventListener('click', () => supabaseModal.classList.remove('show'));
  }

  // Mobile QR Modal
  const btnMobile = document.getElementById('openMobileModalBtn');
  const mobileModal = document.getElementById('mobileModal');
  const closeMobile = document.getElementById('closeMobileModalBtn');
  if (btnMobile && mobileModal) {
    btnMobile.addEventListener('click', () => {
      playClickSound();
      mobileModal.classList.add('show');
    });
  }
  if (closeMobile && mobileModal) {
    closeMobile.addEventListener('click', () => mobileModal.classList.remove('show'));
  }

  // Close modals when clicking on background backdrop
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
      }
    });
  });
}

/* =========================================================================
   18. LOCATION PICKER MODAL (PANGKALAN, PICKUP, DESTINASI)
   ========================================================================= */
function setPatientPickupLocation(name, address, coords, presetId = 'custom') {
  state.pickupPresetId = presetId;
  state.pickupName = name;
  state.pickupAddress = address || name;
  state.pickupCoords = coords;

  const displayEl = document.getElementById('displayPickupName');
  if (displayEl) displayEl.textContent = state.pickupName;

  calculateMultiLegRoute(true);
}

function setDestinationLocation(destId, name, coords, category = '') {
  state.selectedDestId = destId;
  state.destinationName = name;
  state.destinationAddress = name;
  state.destinationCoords = coords;
  state.destinationCategory = category;

  const displayEl = document.getElementById('displayDestName');
  if (displayEl) displayEl.textContent = state.destinationName;

  const iconEl = document.getElementById('stopDestIcon');
  if (iconEl) {
    if (category.includes('Klinik') || category.includes('Poliklinik')) iconEl.textContent = '💊';
    else if (category.includes('Dialisis')) iconEl.textContent = '🩸';
    else if (category.includes('Bersalin')) iconEl.textContent = '👶';
    else if (category.includes('Kesihatan')) iconEl.textContent = '🩺';
    else if (category.includes('Swasta')) iconEl.textContent = '🏨';
    else iconEl.textContent = '🏥';
  }

  const labelEl = document.getElementById('labelDest1');
  if (labelEl) {
    if (category.includes('Klinik') || category.includes('Poliklinik')) {
      labelEl.textContent = 'Klinik / Poliklinik Tujuan';
    } else if (category.includes('Dialisis')) {
      labelEl.textContent = 'Pusat Dialisis Tujuan';
    } else if (category.includes('Bersalin')) {
      labelEl.textContent = 'Pusat Bersalin Tujuan';
    } else {
      labelEl.textContent = 'Pusat Perubatan Tujuan';
    }
  }

  calculateMultiLegRoute(true);
}

function setStop4ReturnLocation(name, address, coords) {
  state.hasStop4 = true;
  state.stop4Type = 'return';
  state.stop4Category = 'Kediaman';
  state.returnName = name;
  state.returnAddress = address || name;
  state.returnCoords = coords;

  syncStop4UI();
  calculateMultiLegRoute(true);
}

function setStop4SecondDestLocation(destId, name, coords, category = '', address = '') {
  state.hasStop4 = true;
  state.stop4Type = 'second_dest';
  state.stop4Category = category;
  state.returnName = name;
  state.returnAddress = address || name;
  state.returnCoords = coords;

  syncStop4UI();
  calculateMultiLegRoute(true);
}

function syncStop4UI() {
  const row = document.getElementById('stopReturnRow');
  const addActions = document.getElementById('addStopActionsRow');
  const label = document.getElementById('stopReturnLabel');
  const nameEl = document.getElementById('displayReturnName');
  const iconEl = document.getElementById('stopReturnIcon');

  if (row) row.style.display = state.hasStop4 ? 'flex' : 'none';
  if (addActions) addActions.style.display = state.hasStop4 ? 'none' : 'flex';

  if (state.hasStop4) {
    if (label) {
      if (state.stop4Type === 'return') {
        label.textContent = 'Hantar Pulang (Kediaman)';
      } else {
        const cat = state.stop4Category || '';
        if (cat.includes('Klinik') || cat.includes('Poliklinik')) {
          label.textContent = 'Destinasi Ke-2 (Klinik / Poliklinik)';
        } else if (cat.includes('Dialisis')) {
          label.textContent = 'Destinasi Ke-2 (Pusat Dialisis)';
        } else if (cat.includes('Bersalin')) {
          label.textContent = 'Destinasi Ke-2 (Pusat Bersalin)';
        } else if (cat.includes('Swasta')) {
          label.textContent = 'Destinasi Ke-2 (Hospital Swasta)';
        } else if (cat.includes('Kerajaan')) {
          label.textContent = 'Destinasi Ke-2 (Hospital Kerajaan)';
        } else {
          label.textContent = 'Pusat Perubatan Ke-2';
        }
      }
    }
    if (nameEl) nameEl.textContent = state.returnName;
    if (iconEl) {
      if (state.stop4Type === 'return') {
        iconEl.textContent = '🔄';
      } else {
        const cat = state.stop4Category || '';
        if (cat.includes('Klinik') || cat.includes('Poliklinik')) iconEl.textContent = '💊';
        else if (cat.includes('Dialisis')) iconEl.textContent = '🩸';
        else if (cat.includes('Bersalin')) iconEl.textContent = '👶';
        else if (cat.includes('Kesihatan')) iconEl.textContent = '🩺';
        else if (cat.includes('Swasta')) iconEl.textContent = '🏨';
        else iconEl.textContent = '🏥';
      }
    }
  }
}

function initLocationModal() {
  const modal = document.getElementById('locationPickerModal');
  const closeBtn = document.getElementById('closeLocationModalBtn');
  const title = document.getElementById('locationModalTitle');
  const content = document.getElementById('locationPickerContent');

  const rowPangkalan = document.getElementById('stopPangkalanRow');
  const rowPickup = document.getElementById('stopPickupRow');
  const rowDest = document.getElementById('stopDestRow');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('show'));
  }

  // STOP 1: PANGKALAN BERTOLAK
  if (rowPangkalan) {
    rowPangkalan.addEventListener('click', () => {
      playClickSound();
      title.textContent = 'Pilih Pangkalan Ambulans Bertolak';
      content.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div class="service-card ${state.currentHub.id === 'kok_lanas' ? 'selected' : ''}" data-hub="kok_lanas">
            <div class="service-card-left">
              <span style="font-size:1.4rem;">🏛️</span>
              <div class="service-texts">
                <span class="service-name">HQ Pusat Rawatan Kok Lanas (Kelantan)</span>
                <span class="service-desc">Plat: VPQ 7606 • Abe Di / Syalihan • 24 Jam Kecemasan</span>
                <span style="font-size:0.68rem; color:var(--text-muted); margin-top:2px; display:block;">${HUBS.KOK_LANAS.address}</span>
              </div>
            </div>
            <div class="service-price-col">
              <span class="dist-badge-live">Kelantan HQ</span>
            </div>
          </div>

          <div class="service-card ${state.currentHub.id === 'raub' ? 'selected' : ''}" data-hub="raub">
            <div class="service-card-left">
              <span style="font-size:1.4rem;">🏛️</span>
              <div class="service-texts">
                <span class="service-name">Al-Farhain Medical Center (Cawangan Raub, Pahang)</span>
                <span class="service-desc">Plat: DFG 7606 • Abe Din Estimos • 24 Jam Kecemasan</span>
                <span style="font-size:0.68rem; color:var(--text-muted); margin-top:2px; display:block;">${HUBS.RAUB.address}</span>
              </div>
            </div>
            <div class="service-price-col">
              <span class="dist-badge-live">Pahang Hub</span>
            </div>
          </div>

          <div class="presets-section-title" style="margin-top:8px;">Cawangan Lain Al-Farhain</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            ${OTHER_BRANCHES.map(b => `
              <div class="service-card ${state.currentHub.id === b.id ? 'selected' : ''}" data-hub="${b.id}" style="padding:10px;">
                <div style="font-size:0.75rem; font-weight:700;">${b.name.replace('Al-Farhain Medical Center (Cawangan ', '').replace(')', '')}</div>
                <div style="font-size:0.65rem; color:var(--text-muted);">${b.state}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      content.querySelectorAll('.service-card').forEach(c => {
        c.addEventListener('click', () => {
          switchBranch(c.dataset.hub);
          modal.classList.remove('show');
        });
      });

      modal.classList.add('show');
    });
  }

  // STOP 2: LOKASI PENGAMBILAN PESAKIT (PATIENT ADDRESS)
  if (rowPickup) {
    rowPickup.addEventListener('click', () => {
      playClickSound();
      title.textContent = 'Tetapkan Lokasi Pengambilan Pesakit';

      const hubPresets = PRESET_PICKUP_LOCATIONS[state.currentHub.id] || PRESET_PICKUP_LOCATIONS.kok_lanas;

      content.innerHTML = `
        <div class="modal-hub-banner">
          <span>🏛️</span>
          <div>
            <span style="font-size:0.7rem; color:var(--text-muted); display:block;">Pangkalan Bertolak (Kiraan jarak bermula dari sini):</span>
            <strong style="color:var(--amc-teal-dark);">${state.currentHub.name}</strong>
          </div>
        </div>

        <div class="patient-search-wrapper">
          <span class="search-icon">🔍</span>
          <input type="text" id="pickupSearchInput" class="patient-search-input" placeholder="Taip alamat rumah pesakit / taman / kampung..." autocomplete="off">
          <button type="button" id="clearPickupSearchBtn" class="search-clear-btn" style="display:none;">&times;</button>
        </div>

        <div id="geocodingResultsContainer" class="geocoding-results-list" style="display:none;"></div>

        <button type="button" class="pick-map-action-btn" id="btnPickOnMapModal">
          <span>🗺️</span>
          <span>Pilih / Tetapkan Pin Rumah Pada Peta Terus</span>
          <span>➔</span>
        </button>

        <div class="presets-section-title">Kawasan Kediaman Utama (${state.currentHub.shortName})</div>
        <div id="presetsListContainer" style="display:flex; flex-direction:column; gap:8px; max-height:280px; overflow-y:auto; padding-right:2px;">
          ${renderPresetPickupCards(hubPresets)}
        </div>
      `;

      const btnPickMap = content.querySelector('#btnPickOnMapModal');
      if (btnPickMap) {
        btnPickMap.addEventListener('click', () => {
          playClickSound();
          modal.classList.remove('show');
          const btnPeta = document.getElementById('btnModePeta');
          if (btnPeta) btnPeta.click();
          alert('Sila klik pada mana-mana lokasi di atas peta atau seret pin biru (📍) untuk menetapkan kedudukan rumah pesakit.');
        });
      }

      const searchInput = content.querySelector('#pickupSearchInput');
      const clearBtn = content.querySelector('#clearPickupSearchBtn');
      const geocodingBox = content.querySelector('#geocodingResultsContainer');
      const presetsBox = content.querySelector('#presetsListContainer');

      if (clearBtn && searchInput) {
        clearBtn.addEventListener('click', () => {
          searchInput.value = '';
          clearBtn.style.display = 'none';
          geocodingBox.style.display = 'none';
          presetsBox.innerHTML = renderPresetPickupCards(hubPresets);
          attachPresetClickListeners();
          searchInput.focus();
        });
      }

      let debounceTimer = null;
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const q = e.target.value.trim();
          if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';

          const filtered = hubPresets.filter(p =>
            p.name.toLowerCase().includes(q.toLowerCase()) ||
            (p.address && p.address.toLowerCase().includes(q.toLowerCase())) ||
            (p.area && p.area.toLowerCase().includes(q.toLowerCase()))
          );
          presetsBox.innerHTML = renderPresetPickupCards(filtered.length ? filtered : hubPresets);
          attachPresetClickListeners();

          clearTimeout(debounceTimer);
          if (q.length >= 3) {
            debounceTimer = setTimeout(async () => {
              geocodingBox.style.display = 'block';
              geocodingBox.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); padding:8px; text-align:center;">🔍 Mencari alamat tepat di peta OSM...</div>';

              const results = await searchAddressGeocode(q, state.currentHub.state);
              if (results.length) {
                geocodingBox.innerHTML = `
                  <div style="font-size:0.68rem; font-weight:800; color:#0284C7; text-transform:uppercase; margin-bottom:4px;">
                    Hasil Carian Alamat OSM (${results.length})
                  </div>
                  ${results.map(r => {
                    const estDist = haversineKm(state.originCoords, r.coords, 1.28);
                    const estMin = estimateDurationMin(estDist);
                    return `
                      <div class="geocoding-result-item" data-geo-name="${escapeHtml(r.name)}" data-geo-address="${escapeHtml(r.address)}" data-lat="${r.coords[0]}" data-lng="${r.coords[1]}">
                        <div style="flex:1; padding-right:8px;">
                          <div style="font-size:0.8rem; font-weight:700; color:var(--text-heading);">${escapeHtml(r.name)}</div>
                          <div style="font-size:0.68rem; color:var(--text-muted); line-height:1.3;">${escapeHtml(r.address)}</div>
                        </div>
                        <div style="text-align:right;">
                          <span class="dist-badge-live">~${estDist} KM</span>
                          <span class="dist-time-sub">~${estMin} min respon</span>
                        </div>
                      </div>
                    `;
                  }).join('')}
                `;

                geocodingBox.querySelectorAll('.geocoding-result-item').forEach(item => {
                  item.addEventListener('click', () => {
                    const lat = parseFloat(item.dataset.lat);
                    const lng = parseFloat(item.dataset.lng);
                    playClickSound();
                    setPatientPickupLocation(
                      item.dataset.geoName,
                      item.dataset.geoAddress,
                      [lat, lng],
                      'geocoded'
                    );
                    modal.classList.remove('show');
                  });
                });
              } else {
                geocodingBox.innerHTML = '<div style="font-size:0.72rem; color:var(--text-muted); padding:6px; text-align:center;">Tiada alamat tepat dijumpai. Anda boleh pilih dari senarai di bawah atau letak pin pada peta.</div>';
              }
            }, 400);
          } else {
            geocodingBox.style.display = 'none';
          }
        });
      }

      function attachPresetClickListeners() {
        presetsBox.querySelectorAll('.service-card').forEach(c => {
          c.addEventListener('click', () => {
            const pId = c.dataset.pickupId;
            const found = hubPresets.find(p => p.id === pId);
            if (found && found.coords) {
              playClickSound();
              setPatientPickupLocation(found.name, found.address, found.coords, found.id);
              modal.classList.remove('show');
            }
          });
        });
      }

      attachPresetClickListeners();
      modal.classList.add('show');
      if (searchInput) setTimeout(() => searchInput.focus(), 200);
    });
  }

  // STOP 3: PUSAT PERUBATAN TUJUAN (DESTINASI 1)
  if (rowDest) {
    rowDest.addEventListener('click', () => {
      openMedicalCenterModal('dest');
    });
  }

  // STOP 4 CONTROLS: Hantar Pulang & Destinasi Ke-2
  initStop4Controls();
}

function initStop4Controls() {
  const btnReturn = document.getElementById('btnAddReturnHome');
  const btnDest2 = document.getElementById('btnAddSecondDest');
  const btnRemove = document.getElementById('btnRemoveStop4');
  const rowStop4 = document.getElementById('stopReturnRow');

  if (btnReturn) {
    btnReturn.addEventListener('click', () => {
      playCalculateChime();
      setStop4ReturnLocation(
        `Kediaman Pesakit (Pulang)`,
        state.pickupAddress,
        [...state.pickupCoords]
      );
    });
  }

  if (btnDest2) {
    btnDest2.addEventListener('click', () => {
      playClickSound();
      openMedicalCenterModal('stop4');
    });
  }

  if (btnRemove) {
    btnRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      playClickSound();
      state.hasStop4 = false;
      state.returnCoords = null;
      state.leg3Km = 0;
      state.leg3DurationMin = 0;
      state.leg3Geometry = null;
      syncStop4UI();
      calculateMultiLegRoute(true);
    });
  }

  if (rowStop4) {
    rowStop4.addEventListener('click', () => {
      playClickSound();
      openMedicalCenterModal('stop4');
    });
  }
}

/* =========================================================================
   COMPREHENSIVE MEDICAL CENTER & CUSTOM ADDRESS MODAL (DESTINASI 1 & STOP 4)
   ========================================================================= */
function openMedicalCenterModal(target = 'dest') {
  const modal = document.getElementById('locationPickerModal');
  const title = document.getElementById('locationModalTitle');
  const content = document.getElementById('locationPickerContent');
  if (!modal || !content) return;

  playClickSound();

  const isStop4 = target === 'stop4';
  title.textContent = isStop4
    ? 'Pilih Destinasi Ke-2 / Hantar Pulang'
    : 'Pilih Pusat Perubatan Tujuan (Destinasi 1)';

  const refName = isStop4 ? state.destinationName : state.pickupName;
  const refTypeLabel = isStop4 ? 'Pusat Perubatan 1' : 'Lokasi Pesakit';
  const refCoords = isStop4 ? state.destinationCoords : state.pickupCoords;

  let currentCategory = 'all';
  let customCoords = null;

  content.innerHTML = `
    <div class="modal-hub-banner" style="${isStop4 ? 'border-color: rgba(124, 58, 237, 0.3); background: #F5F3FF;' : ''}">
      <span>${isStop4 ? '🔄' : '📍'}</span>
      <div style="flex:1;">
        <span style="font-size:0.7rem; color:var(--text-muted); display:block;">Diukur Dari ${refTypeLabel}:</span>
        <strong style="color:${isStop4 ? '#7C3AED' : 'var(--amc-teal-dark)'};">${escapeHtml(refName)}</strong>
      </div>
    </div>

    ${isStop4 ? `
      <!-- Quick Return to Home Option -->
      <button type="button" class="pick-map-action-btn" id="btnQuickReturnHome" style="border-color:#7C3AED; background:#FAF5FF; color:#6D28D9; margin-bottom:12px;">
        <span>🏠</span>
        <span><b>Hantar Pulang ke Kediaman Pesakit</b> (${escapeHtml(state.pickupName)})</span>
        <span>✓</span>
      </button>
    ` : ''}

    <!-- Search Input -->
    <div class="patient-search-wrapper">
      <span class="search-icon">🔍</span>
      <input type="text" id="medicalCenterSearchInput" class="patient-search-input" placeholder="Cari hospital, klinik, pusat dialisis, poliklinik..." autocomplete="off">
    </div>

    <!-- Category Filter Pills -->
    <div class="dest-cat-pills-row" id="destCatPillsContainer">
      <button type="button" class="dest-cat-pill active" data-cat="all">Semua</button>
      <button type="button" class="dest-cat-pill" data-cat="Klinik Swasta / Poliklinik">💊 Poliklinik & Klinik Swasta</button>
      <button type="button" class="dest-cat-pill" data-cat="Hospital Swasta">🏨 Hospital Swasta</button>
      <button type="button" class="dest-cat-pill" data-cat="Pusat Dialisis">🩸 Pusat Dialisis</button>
      <button type="button" class="dest-cat-pill" data-cat="Pusat Bersalin & Pakar">👶 Pusat Bersalin & Pakar</button>
      <button type="button" class="dest-cat-pill" data-cat="Hospital Kerajaan">🏥 Hospital Kerajaan</button>
      <button type="button" class="dest-cat-pill" data-cat="Klinik Kesihatan">🩺 Klinik Kesihatan</button>
      <button type="button" class="dest-cat-pill" data-cat="custom" style="border-color:#007D77; color:#007D77;">✍️ Alamat Tersuai</button>
    </div>

    <!-- Custom Address Box (User Editable) -->
    <div class="custom-dest-box" id="customAddressBox" style="display:none;">
      <div class="custom-dest-box-header">
        <div class="custom-dest-title">
          <span>✍️</span> <span>Tulis Alamat Sendiri / Fasiliti Tersuai</span>
        </div>
        <span style="font-size:0.68rem; color:var(--text-muted);">Di seluruh Malaysia</span>
      </div>

      <div class="custom-field-group">
        <label class="custom-field-label">Nama Fasiliti / Lokasi</label>
        <input type="text" id="customDestNameInput" class="custom-input-field" placeholder="Cth: Klinik Primer Kok Lanas / Pusat Hemodialisis Swasta / Rumah">
      </div>

      <div class="custom-field-group">
        <label class="custom-field-label">Alamat / Kawasan (Untuk Carian Peta OSM)</label>
        <input type="text" id="customDestAddressInput" class="custom-input-field" placeholder="Cth: Ketereh, Kota Bharu, Kelantan">
      </div>

      <div id="customGeocodeResults" class="geocoding-results-list" style="display:none; margin:8px 0;"></div>

      <div class="custom-dest-actions">
        <button type="button" class="btn-geocode-search" id="btnGeocodeCustom">
          <span>🔍</span> <span>Cari Koordinat di Peta OSM</span>
        </button>
        <button type="button" class="btn-confirm-custom-dest" id="btnConfirmCustomLocation">
          <span>✅</span> <span>Guna Lokasi Ini</span>
        </button>
      </div>
    </div>

    <!-- Medical Centers List -->
    <div id="destListContainer" style="display:flex; flex-direction:column; gap:8px; max-height:320px; overflow-y:auto; padding-right:2px;">
      ${renderPresetDestCards(PRESET_DESTINATIONS, target)}
    </div>
  `;

  const searchInput = content.querySelector('#medicalCenterSearchInput');
  const destList = content.querySelector('#destListContainer');
  const catPills = content.querySelectorAll('.dest-cat-pill');
  const customBox = content.querySelector('#customAddressBox');
  const btnQuickHome = content.querySelector('#btnQuickReturnHome');

  // Quick Return Home click
  if (btnQuickHome) {
    btnQuickHome.addEventListener('click', () => {
      playCalculateChime();
      setStop4ReturnLocation(
        `Kediaman Pesakit (Pulang ke ${state.pickupName})`,
        state.pickupAddress,
        [...state.pickupCoords]
      );
      modal.classList.remove('show');
    });
  }

  // Filter function
  function applyFilters() {
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';

    if (currentCategory === 'custom') {
      if (customBox) customBox.style.display = 'block';
      if (destList) destList.style.display = 'none';
      return;
    } else {
      if (customBox) customBox.style.display = 'none';
      if (destList) destList.style.display = 'flex';
    }

    const filtered = PRESET_DESTINATIONS.filter(d => {
      const matchCat = currentCategory === 'all' || d.category === currentCategory;
      const matchQuery = !q ||
        d.name.toLowerCase().includes(q) ||
        (d.shortName && d.shortName.toLowerCase().includes(q)) ||
        d.category.toLowerCase().includes(q) ||
        (d.state && d.state.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });

    if (destList) {
      if (filtered.length) {
        destList.innerHTML = renderPresetDestCards(filtered, target);
        attachDestCardListeners();
      } else {
        destList.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.8rem;">
            <div>🏥 Tiada pusat perubatan dijumpai untuk "${escapeHtml(q)}".</div>
            <button type="button" class="btn-geocode-search" id="btnSwitchToCustomFromEmpty" style="margin:10px auto; width:auto; padding:6px 14px;">
              ✍️ Masukkan sebagai Alamat Tersuai
            </button>
          </div>
        `;
        const btnEmptyCustom = destList.querySelector('#btnSwitchToCustomFromEmpty');
        if (btnEmptyCustom) {
          btnEmptyCustom.addEventListener('click', () => {
            const customPill = content.querySelector('.dest-cat-pill[data-cat="custom"]');
            if (customPill) customPill.click();
            const nameInp = content.querySelector('#customDestNameInput');
            if (nameInp) nameInp.value = q;
          });
        }
      }
    }
  }

  // Attach card click listeners
  function attachDestCardListeners() {
    if (!destList) return;
    destList.querySelectorAll('.service-card').forEach(c => {
      c.addEventListener('click', () => {
        const dId = c.dataset.destId;
        const found = PRESET_DESTINATIONS.find(d => d.id === dId);
        if (found && found.coords) {
          playSuccessChime();
          if (isStop4) {
            setStop4SecondDestLocation(found.id, found.name, found.coords, found.category, found.name);
          } else {
            setDestinationLocation(found.id, found.name, found.coords, found.category);
          }
          modal.classList.remove('show');
        }
      });
    });
  }

  // Category Pills Listeners
  catPills.forEach(pill => {
    pill.addEventListener('click', () => {
      playClickSound();
      catPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentCategory = pill.dataset.cat;
      applyFilters();
    });
  });

  // Search Input Listener
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (currentCategory === 'custom') {
        const customPill = content.querySelector('.dest-cat-pill[data-cat="all"]');
        if (customPill) {
          catPills.forEach(p => p.classList.remove('active'));
          customPill.classList.add('active');
          currentCategory = 'all';
        }
      }
      applyFilters();
    });
  }

  // Custom Address Controls
  const customNameInput = content.querySelector('#customDestNameInput');
  const customAddressInput = content.querySelector('#customDestAddressInput');
  const btnGeocode = content.querySelector('#btnGeocodeCustom');
  const btnConfirmCustom = content.querySelector('#btnConfirmCustomLocation');
  const geocodeResultsBox = content.querySelector('#customGeocodeResults');

  if (btnGeocode) {
    btnGeocode.addEventListener('click', async () => {
      const q = (customAddressInput?.value || customNameInput?.value || '').trim();
      if (!q) {
        alert('Sila taip nama fasiliti atau alamat untuk dicari di peta.');
        return;
      }

      playClickSound();
      geocodeResultsBox.style.display = 'block';
      geocodeResultsBox.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); padding:8px; text-align:center;">🔍 Mencari lokasi tepat di OpenStreetMap...</div>';

      const results = await searchAddressGeocode(q, state.currentHub.state);
      if (results.length) {
        geocodeResultsBox.innerHTML = `
          <div style="font-size:0.68rem; font-weight:800; color:#0284C7; text-transform:uppercase; margin-bottom:4px;">
            Pilih Lokasi Dijumpai (${results.length}):
          </div>
          ${results.map(r => {
            const estDist = haversineKm(refCoords, r.coords, 1.28);
            const estMin = estimateDurationMin(estDist);
            return `
              <div class="geocoding-result-item" data-name="${escapeHtml(r.name)}" data-addr="${escapeHtml(r.address)}" data-lat="${r.coords[0]}" data-lng="${r.coords[1]}">
                <div style="flex:1; padding-right:8px;">
                  <div style="font-size:0.8rem; font-weight:700; color:var(--text-heading);">${escapeHtml(r.name)}</div>
                  <div style="font-size:0.68rem; color:var(--text-muted); line-height:1.3;">${escapeHtml(r.address)}</div>
                </div>
                <div style="text-align:right;">
                  <span class="dist-badge-live">~${estDist} KM</span>
                  <span class="dist-time-sub">~${estMin} min transit</span>
                </div>
              </div>
            `;
          }).join('')}
        `;

        geocodeResultsBox.querySelectorAll('.geocoding-result-item').forEach(item => {
          item.addEventListener('click', () => {
            playClickSound();
            const lat = parseFloat(item.dataset.lat);
            const lng = parseFloat(item.dataset.lng);
            customCoords = [lat, lng];

            if (customNameInput && !customNameInput.value) {
              customNameInput.value = item.dataset.name;
            }
            if (customAddressInput) {
              customAddressInput.value = item.dataset.addr;
            }

            // Highlight chosen
            geocodeResultsBox.querySelectorAll('.geocoding-result-item').forEach(i => i.style.borderColor = 'var(--border-light)');
            item.style.borderColor = '#16A34A';
            item.style.backgroundColor = '#F0FDF4';
          });
        });
      } else {
        geocodeResultsBox.innerHTML = '<div style="font-size:0.72rem; color:var(--text-muted); padding:6px; text-align:center;">Tiada koordinat tepat dijumpai. Anda masih boleh tekan "Guna Lokasi Ini".</div>';
      }
    });
  }

  if (btnConfirmCustom) {
    btnConfirmCustom.addEventListener('click', () => {
      const name = (customNameInput?.value || '').trim() || 'Fasiliti / Alamat Pilihan Pengguna';
      const address = (customAddressInput?.value || '').trim() || name;

      // If coordinates haven't been picked, default to nearby offset of reference coords
      let finalCoords = customCoords;
      if (!finalCoords || !finalCoords.length) {
        finalCoords = [refCoords[0] + 0.015, refCoords[1] + 0.015];
      }

      playSuccessChime();
      if (isStop4) {
        setStop4SecondDestLocation('custom_dest_' + Date.now(), name, finalCoords, 'Alamat Tersuai', address);
      } else {
        setDestinationLocation('custom_dest_' + Date.now(), name, finalCoords, 'Alamat Tersuai');
        state.destinationAddress = address;
      }

      modal.classList.remove('show');
    });
  }

  attachDestCardListeners();
  modal.classList.add('show');
  if (searchInput) setTimeout(() => searchInput.focus(), 200);
}

function renderPresetPickupCards(presets) {
  return presets.map(p => {
    const isCurrent = state.pickupPresetId === p.id || state.pickupName === p.name;
    const estDist = p.coords ? haversineKm(state.originCoords, p.coords, 1.28) : 0;
    const estMin = estimateDurationMin(estDist);
    return `
      <div class="service-card ${isCurrent ? 'selected' : ''}" data-pickup-id="${p.id}">
        <div class="service-card-left">
          <span style="font-size:1.3rem;">📍</span>
          <div class="service-texts">
            <span class="service-name">${escapeHtml(p.name)}</span>
            <span class="service-desc">${escapeHtml(p.address || p.area)}</span>
          </div>
        </div>
        <div class="service-price-col">
          <span class="dist-badge-live">🚗 ~${estDist} KM</span>
          <span class="dist-time-sub">~${estMin} min respon</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderPresetDestCards(dests, target = 'dest') {
  const isStop4 = target === 'stop4';
  const refCoords = isStop4 ? state.destinationCoords : state.pickupCoords;

  const categoryIcons = {
    'Hospital Kerajaan': '🏥',
    'Hospital Swasta': '🏨',
    'Klinik Swasta / Poliklinik': '💊',
    'Pusat Dialisis': '🩸',
    'Pusat Bersalin & Pakar': '👶',
    'Klinik Kesihatan': '🩺'
  };

  const categoryColors = {
    'Hospital Kerajaan': '#0284C7',
    'Hospital Swasta': '#7C3AED',
    'Klinik Swasta / Poliklinik': '#059669',
    'Pusat Dialisis': '#DC2626',
    'Pusat Bersalin & Pakar': '#DB2777',
    'Klinik Kesihatan': '#D97706'
  };

  return dests.map(d => {
    const isCurrent = isStop4
      ? (state.hasStop4 && (state.returnName === d.name || state.returnName === d.shortName))
      : (state.selectedDestId === d.id || state.destinationName === d.name);

    const estDist = d.coords ? haversineKm(refCoords, d.coords, 1.28) : 0;
    const estMin = estimateDurationMin(estDist);
    const icon = categoryIcons[d.category] || '🏥';
    const tagColor = categoryColors[d.category] || 'var(--amc-teal-dark)';

    const isAlFarhain = d.name.toLowerCase().includes('al-farhain');

    return `
      <div class="service-card ${isCurrent ? 'selected' : ''}" data-dest-id="${d.id}" style="${isAlFarhain ? 'border-color: rgba(0, 168, 150, 0.4); background: linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%);' : ''}">
        <div class="service-card-left">
          <span style="font-size:1.35rem; display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:10px; background:rgba(0,0,0,0.03); flex-shrink:0;">${icon}</span>
          <div class="service-texts" style="flex:1;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span class="service-name" style="margin-bottom:0;">${escapeHtml(d.name)}</span>
              ${isAlFarhain ? '<span style="font-size:0.62rem; font-weight:800; padding:1px 6px; border-radius:6px; background:#007D77; color:#fff; letter-spacing:0.3px;">AMC CAWANGAN</span>' : ''}
            </div>
            <span class="service-desc" style="display:flex; align-items:center; gap:6px; margin-top:2px;">
              <span style="display:inline-block; font-size:0.68rem; font-weight:700; color:${tagColor};">${escapeHtml(d.category)}</span>
              <span style="color:var(--text-muted); font-size:0.68rem;">•</span>
              <span style="font-size:0.68rem; color:var(--text-muted);">${escapeHtml(d.state)}</span>
            </span>
          </div>
        </div>
        <div class="service-price-col">
          <span class="dist-badge-live">~${estDist} KM</span>
          <span class="dist-time-sub">~${estMin} min transit</span>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* =========================================================================
   19. SUPABASE CLOUD SYNC
   ========================================================================= */
function initSupabaseIntegration() {
  const urlInput = document.getElementById('supabaseUrlInput');
  const keyInput = document.getElementById('supabaseKeyInput');
  const testBtn = document.getElementById('testSupabaseBtn');
  const saveBtn = document.getElementById('saveSupabaseBtn');
  const resultDiv = document.getElementById('supabaseTestResult');
  const dot = document.getElementById('supabaseDot');

  const config = getStoredSupabaseConfig();
  if (config.url && urlInput) urlInput.value = config.url;
  if (config.key && keyInput) keyInput.value = config.key;

  if (dot) {
    dot.style.background = isSupabaseConfigured() ? '#10B981' : '#F59E0B';
  }

  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      const key = keyInput.value.trim();
      resultDiv.style.display = 'block';
      resultDiv.textContent = 'Menguji sambungan...';
      const res = await testSupabaseConnection(url, key);
      resultDiv.textContent = res.message;
      resultDiv.style.background = res.success ? '#ECFDF5' : '#FEE2E2';
      resultDiv.style.color = res.success ? '#065F46' : '#991B1B';
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      const key = keyInput.value.trim();
      saveSupabaseConfig(url, key);
      if (dot) dot.style.background = isSupabaseConfigured() ? '#10B981' : '#F59E0B';
      const modal = document.getElementById('supabaseModal');
      if (modal) modal.classList.remove('show');
      alert('Tetapan Supabase telah disimpan.');
    });
  }
}

/* =========================================================================
   20. MOBILE AUTHENTICATION & SECURITY GATEKEEPER (FIRST PAGE / DRIVER ACCESS)
   ========================================================================= */
function setMobileGateLocked(isLocked) {
  const gateEl = document.getElementById('mobileAuthGate');
  const shellEl = document.getElementById('appShell');
  if (gateEl) {
    if (isLocked) gateEl.classList.remove('hidden');
    else gateEl.classList.add('hidden');
  }
  if (shellEl) {
    if (isLocked) shellEl.classList.add('gate-locked');
    else {
      shellEl.classList.remove('gate-locked');
      // Invalidate Leaflet maps once viewport is visible
      setTimeout(() => {
        if (miniMap) miniMap.invalidateSize();
        if (fullMap) fullMap.invalidateSize();
      }, 300);
    }
  }
}

async function initMobileAuth() {
  const authBtn = document.getElementById('mobileAuthBtn');
  const modal = document.getElementById('mobileAuthModal');
  const closeBtn = document.getElementById('closeMobileAuthModalBtn');

  const formView = document.getElementById('mobileAuthFormContainer');
  const profileView = document.getElementById('mobileAuthProfileContainer');
  const form = document.getElementById('mobileAuthForm');
  const btnTabLogin = document.getElementById('btnMobileTabLogin');
  const btnTabRegister = document.getElementById('btnMobileTabRegister');
  const registerFields = document.getElementById('mobileRegisterFields');
  const btnSubmit = document.getElementById('btnMobileSubmitAuth');
  const statusMsg = document.getElementById('mobileAuthStatusMsg');
  const btnSignOut = document.getElementById('btnMobileSignOut');
  const headerSignOutBtn = document.getElementById('mobileHeaderSignOutBtn');

  // Gatekeeper First Page Elements
  const gateTabLogin = document.getElementById('mobileGateBtnTabLogin');
  const gateTabRegister = document.getElementById('mobileGateBtnTabRegister');
  const gateRegFields = document.getElementById('mobileGateRegisterFields');
  const gateForm = document.getElementById('mobileGateAuthForm');
  const gateSubmitLabel = document.getElementById('mobileGateSubmitLabel');
  const gateStatusMsg = document.getElementById('mobileGateStatusMsg');

  let authMode = 'login'; // 'login' | 'register'
  let gateMode = 'login'; // 'login' | 'register'

  // 1. Check existing session on mobile load
  const currentUser = await getCurrentAuthUser();
  updateMobileAuthUI(currentUser);

  if (currentUser) {
    setMobileGateLocked(false);
  } else {
    setMobileGateLocked(true);
  }

  // 2. Gatekeeper Landing Tabs
  if (gateTabLogin && gateTabRegister) {
    gateTabLogin.addEventListener('click', () => {
      playClickSound();
      gateMode = 'login';
      gateTabLogin.style.background = 'var(--amc-teal)';
      gateTabLogin.style.color = '#FFFFFF';
      gateTabRegister.style.background = 'transparent';
      gateTabRegister.style.color = 'var(--text-muted)';
      if (gateRegFields) gateRegFields.style.display = 'none';
      if (gateSubmitLabel) gateSubmitLabel.textContent = 'Log Masuk ke Ambulans OS';
      if (gateStatusMsg) gateStatusMsg.style.display = 'none';
    });

    gateTabRegister.addEventListener('click', () => {
      playClickSound();
      gateMode = 'register';
      gateTabRegister.style.background = 'var(--amc-teal)';
      gateTabRegister.style.color = '#FFFFFF';
      gateTabLogin.style.background = 'transparent';
      gateTabLogin.style.color = 'var(--text-muted)';
      if (gateRegFields) gateRegFields.style.display = 'flex';
      if (gateSubmitLabel) gateSubmitLabel.textContent = 'Daftar Pemandu & Buka Akses';
      if (gateStatusMsg) gateStatusMsg.style.display = 'none';
    });
  }

  // 3. Gatekeeper Landing Form Submit
  if (gateForm) {
    gateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('mobileGateAuthEmail').value.trim();
      const password = document.getElementById('mobileGateAuthPassword').value;
      const name = document.getElementById('mobileGateAuthName')?.value.trim() || email.split('@')[0];
      const branch = document.getElementById('mobileGateAuthBranch')?.value || 'kok_lanas';
      const plate = document.getElementById('mobileGateAuthPlate')?.value || 'VPQ 7606';
      const phone = document.getElementById('mobileGateAuthPhone')?.value.trim() || '';

      if (gateStatusMsg) {
        gateStatusMsg.style.display = 'block';
        gateStatusMsg.textContent = gateMode === 'login' ? 'Mengesahkan pemandu...' : 'Mendaftar krew ambulans...';
        gateStatusMsg.style.background = '#E0F2FE';
        gateStatusMsg.style.color = '#0284C7';
      }

      let res = null;
      if (gateMode === 'login') {
        res = await signInUser(email, password);
      } else {
        res = await signUpUser(email, password, {
          name,
          full_name: name,
          branch,
          assigned_plate: plate,
          phone,
          role: 'driver',
          role_label: 'Pemandu EMT Bertugas'
        });
      }

      if (res.success) {
        playSuccessChime();
        const user = res.user || res.data?.user;
        updateMobileAuthUI(user);
        if (branch) switchBranch(branch);

        if (gateStatusMsg) {
          gateStatusMsg.textContent = gateMode === 'login' ? 'Log masuk berjaya! Membuka operasi...' : 'Pendaftaran berjaya! Membuka operasi...';
          gateStatusMsg.style.background = '#DCFCE7';
          gateStatusMsg.style.color = '#15803D';
        }

        setTimeout(() => {
          setMobileGateLocked(false);
        }, 500);
      } else {
        if (gateStatusMsg) {
          gateStatusMsg.textContent = res.error || 'Ralat pengesahan pemandu.';
          gateStatusMsg.style.background = '#FEE2E2';
          gateStatusMsg.style.color = '#B91C1C';
        }
      }
    });
  }

  // 4. Modal Open & Tabs
  if (authBtn && modal) {
    authBtn.addEventListener('click', () => {
      playClickSound();
      modal.classList.add('show');
      const user = getStoredUserProfile();
      if (user) {
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
      playClickSound();
      authMode = 'login';
      btnTabLogin.classList.add('active');
      btnTabRegister.classList.remove('active');
      if (registerFields) registerFields.style.display = 'none';
      if (btnSubmit) btnSubmit.textContent = 'Log Masuk';
      if (statusMsg) statusMsg.style.display = 'none';
    });

    btnTabRegister.addEventListener('click', () => {
      playClickSound();
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
      const email = document.getElementById('mobileAuthEmailInput').value.trim();
      const password = document.getElementById('mobileAuthPasswordInput').value;
      const name = document.getElementById('mobileAuthNameInput')?.value.trim() || email.split('@')[0];
      const role = document.getElementById('mobileAuthRoleInput')?.value || 'driver';

      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.textContent = authMode === 'login' ? 'Mengesahkan log masuk...' : 'Mendaftar akaun baharu...';
        statusMsg.style.background = '#E0F2FE';
        statusMsg.style.color = '#0284C7';
      }

      let res = null;
      if (authMode === 'login') {
        res = await signInUser(email, password);
      } else {
        res = await signUpUser(email, password, {
          name,
          full_name: name,
          role,
          role_label: role === 'driver' ? 'Pemandu EMT Bertugas' : (role === 'paramedic' ? 'Penolong Pegawai Perubatan' : 'Pengguna Awam')
        });
      }

      if (res.success) {
        playSuccessChime();
        const user = res.user || res.data?.user;
        updateMobileAuthUI(user);
        setMobileGateLocked(false);

        if (statusMsg) {
          statusMsg.textContent = authMode === 'login' ? 'Log masuk berjaya!' : 'Akaun berjaya didaftarkan!';
          statusMsg.style.background = '#DCFCE7';
          statusMsg.style.color = '#15803D';
        }

        setTimeout(() => {
          modal.classList.remove('show');
        }, 500);
      } else {
        if (statusMsg) {
          statusMsg.textContent = res.error || 'Ralat pengesahan akaun.';
          statusMsg.style.background = '#FEE2E2';
          statusMsg.style.color = '#B91C1C';
        }
      }
    });
  }

  // 6. Quick Demo Logins on Mobile (Both Gatekeeper & Modal)
  document.querySelectorAll('.btn-demo-quick-auth-mobile').forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      const email = btn.dataset.email;
      const name = btn.dataset.name;
      const plate = btn.dataset.plate;
      const role = btn.dataset.role;
      const hub = btn.dataset.hub || (email.includes('abedin') ? 'raub' : 'kok_lanas');

      const mockUser = {
        id: 'demo_' + Date.now(),
        email: email,
        user_metadata: {
          name: name,
          full_name: name,
          assigned_plate: plate,
          branch: hub,
          role: role,
          role_label: role
        }
      };

      saveStoredUserProfile(mockUser);
      updateMobileAuthUI(mockUser);
      setMobileGateLocked(false);

      if (hub) switchBranch(hub);

      playSuccessChime();
      if (modal) modal.classList.remove('show');
    });
  });

  // 7. Mobile Sign Out Handlers (Header Button & Modal Button)
  const handleMobileSignOut = async () => {
    playClickSound();
    await signOutUser();
    updateMobileAuthUI(null);
    setMobileGateLocked(true);
    if (modal) modal.classList.remove('show');
  };

  if (btnSignOut) {
    btnSignOut.addEventListener('click', handleMobileSignOut);
  }
  if (headerSignOutBtn) {
    headerSignOutBtn.addEventListener('click', handleMobileSignOut);
  }
}

function updateMobileAuthUI(user) {
  const label = document.getElementById('mobileAuthLabel');
  const icon = document.getElementById('mobileAuthIcon');
  const roleEl = document.getElementById('mobileAuthRole');
  const headerBadge = document.getElementById('headerProfileBadge');
  const menuAvatar = document.getElementById('headerMenuAvatar');

  const bigName = document.getElementById('mobileUserNameBig');
  const bigRole = document.getElementById('mobileUserRoleBig');
  const bigEmail = document.getElementById('mobileUserEmailBig');
  const bigAvatar = document.getElementById('mobileUserAvatarBig');

  if (user) {
    const name = user.user_metadata?.name || user.user_metadata?.full_name || user.email.split('@')[0];
    const role = user.user_metadata?.role_label || 'Pemandu EMT Bertugas';
    const initials = name.slice(0, 2).toUpperCase();
    const firstLetter = name.trim().slice(0, 1).toUpperCase() || 'A';

    if (label) label.textContent = name;
    if (roleEl) roleEl.textContent = role;
    if (icon) icon.textContent = '🟢';
    if (headerBadge) headerBadge.textContent = firstLetter;
    if (menuAvatar) menuAvatar.textContent = initials;

    if (bigName) bigName.textContent = name;
    if (bigRole) bigRole.textContent = role;
    if (bigEmail) bigEmail.textContent = user.email;
    if (bigAvatar) bigAvatar.textContent = initials;
  } else {
    if (label) label.textContent = 'Log Masuk';
    if (roleEl) roleEl.textContent = 'Pemandu / Krew';
    if (icon) icon.textContent = '👤';
    if (headerBadge) headerBadge.textContent = '👤';
    if (menuAvatar) menuAvatar.textContent = '👤';
  }
}
