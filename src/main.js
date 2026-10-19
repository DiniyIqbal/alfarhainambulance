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
  subscribeToRealtimeBookings
} from './services/supabaseClient.js';

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

  // Multi-Leg Distances (Leg 1: Hub -> Pickup = 25.2 km, Leg 2: Pickup -> Dest = 1.1 km, Total = 26.3 km)
  leg1Km: 25.2,
  leg2Km: 1.1,
  distanceKm: 26.3,

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

// Map References
let miniMap = null;
let miniRouteLine = null;
let fullMap = null;
let fullRouteLine = null;
let fullMarkers = [];

/* =========================================================================
   INITIALIZATION ON DOM LOAD
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initBranchDropdown();
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

  // Initial calculation and map render
  calculateAll();
  initMiniLeafletMap();
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
   4. BRANCH DROPDOWN (HQ KOK LANAS, CAWANGAN RAUB, JELI, MACHANG)
   ========================================================================= */
function initBranchDropdown() {
  const btn = document.getElementById('branchSelectBtn');
  const menu = document.getElementById('branchDropdownMenu');
  const label = document.getElementById('activeBranchLabel');
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

function switchBranch(hubKey) {
  if (hubKey === 'raub') {
    state.currentHub = HUBS.RAUB;
    state.originCoords = HUBS.RAUB.coords;
    state.pickupName = 'Bandar Raub';
    state.destinationName = 'Hospital Raub';
    state.destinationCoords = [3.7915, 101.8590];
    state.leg1Km = 14.5;
    state.leg2Km = 3.2;
    state.distanceKm = 17.7;
  } else {
    state.currentHub = HUBS.KOK_LANAS;
    state.originCoords = HUBS.KOK_LANAS.coords;
    state.pickupName = 'Bandar Kota Bharu';
    state.destinationName = 'Hospital Raja Perempuan Zainab II';
    state.destinationCoords = [6.1256, 102.2482];
    state.leg1Km = 25.2;
    state.leg2Km = 1.1;
    state.distanceKm = 26.3;
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

  calculateAll();
  updateMapMarkers();
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
  if (distSplit) distSplit.textContent = `${state.leg1Km.toFixed(1)} km + ${state.leg2Km.toFixed(1)} km`;

  const totalKmEl = document.getElementById('displayTotalKm');
  if (totalKmEl) totalKmEl.textContent = `${totalKm.toFixed(1)} km`;

  const formulaEl = document.getElementById('displayEstimateFormula');
  if (formulaEl) {
    formulaEl.textContent = `RM${baseFare.toFixed(0)} + (${extraKm.toFixed(1)} km × RM${extraKmRate.toFixed(0)}) Kadar asas + jarak tambahan`;
  }

  const step1PriceEl = document.getElementById('displayStep1Price');
  if (step1PriceEl) step1PriceEl.textContent = `RM${step1BaseTotal.toFixed(2)}`;

  // Step 1 Peta view labels
  const leg1KmEl = document.getElementById('mapLeg1Km');
  if (leg1KmEl) leg1KmEl.textContent = `${state.leg1Km.toFixed(1)} km`;

  const leg2KmEl = document.getElementById('mapLeg2Km');
  if (leg2KmEl) leg2KmEl.textContent = `${state.leg2Km.toFixed(1)} km`;

  const mapTotalEl = document.getElementById('mapTotalDistanceKm');
  if (mapTotalEl) mapTotalEl.textContent = `${totalKm.toFixed(1)} km`;

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

  const invDest = document.getElementById('invDestination');
  if (invDest) invDest.textContent = state.destinationName;

  const invDist = document.getElementById('invDistanceKm');
  if (invDist) invDist.textContent = `${state.distanceKm.toFixed(1)} KM`;

  const invPlate = document.getElementById('invPlateNumber');
  if (invPlate) invPlate.textContent = state.currentHub.ambulancePlate;

  const invBranch = document.getElementById('invBranchName');
  if (invBranch) invBranch.textContent = state.currentHub.name;

  const tbody = document.getElementById('invTableBody');
  if (tbody) {
    // 1. ORIGINAL BUTIRAN: Tambang Asas & Caj Jarak
    let rows = `
      <tr class="invoice-section-hdr">
        <td colspan="3">1. MAKLUMAT TAMBANG ASAS &amp; PERJALANAN</td>
      </tr>
      <tr>
        <td><strong>Kadar Asas (${state.selectedTripType.name})</strong></td>
        <td>Kadar tetap sehingga ${BASE_SETTINGS.standardBaseKm.toFixed(0)} KM</td>
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

  const latlngs = [
    state.originCoords,
    state.pickupCoords,
    state.destinationCoords
  ];

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

  miniRouteLine = L.polyline(latlngs, {
    color: '#007D77',
    weight: 5,
    opacity: 0.9,
    smoothFactor: 1
  }).addTo(miniMap);

  // Markers
  L.circleMarker(state.originCoords, { radius: 5, color: '#007D77', fillColor: '#FFFFFF', fillOpacity: 1 }).addTo(miniMap);
  L.circleMarker(state.pickupCoords, { radius: 6, color: '#23CCC5', fillColor: '#007D77', fillOpacity: 1 }).addTo(miniMap);
  L.circleMarker(state.destinationCoords, { radius: 5, color: '#C61E2F', fillColor: '#FFFFFF', fillOpacity: 1 }).addTo(miniMap);

  miniMap.fitBounds(miniRouteLine.getBounds(), { padding: [15, 15] });
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
    attribution: '© OpenStreetMap'
  }).addTo(fullMap);

  updateFullMap();
}

function updateFullMap() {
  if (!fullMap) return;

  const latlngs = [
    state.originCoords,
    state.pickupCoords,
    state.destinationCoords
  ];

  if (fullRouteLine) fullMap.removeLayer(fullRouteLine);
  fullMarkers.forEach(m => fullMap.removeLayer(m));
  fullMarkers = [];

  fullRouteLine = L.polyline(latlngs, {
    color: '#007D77',
    weight: 6,
    opacity: 0.9
  }).addTo(fullMap);

  // Custom marker for Origin
  const m1 = L.marker(state.originCoords).bindPopup(`<b>1. ${state.currentHub.shortName}</b><br>Pangkalan Bertolak`).addTo(fullMap);
  const m2 = L.marker(state.pickupCoords).bindPopup(`<b>2. Pengambilan: ${state.pickupName}</b>`).addTo(fullMap);
  const m3 = L.marker(state.destinationCoords).bindPopup(`<b>3. Hospital: ${state.destinationName}</b>`).addTo(fullMap);

  fullMarkers = [m1, m2, m3];
  fullMap.fitBounds(fullRouteLine.getBounds(), { padding: [30, 30] });
}

function updateMapMarkers() {
  const latlngs = [
    state.originCoords,
    state.pickupCoords,
    state.destinationCoords
  ];

  if (miniMap && miniRouteLine) {
    miniRouteLine.setLatLngs(latlngs);
    miniMap.fitBounds(miniRouteLine.getBounds(), { padding: [15, 15] });
  }

  if (fullMap) {
    updateFullMap();
  }
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
      const msg = `*AL-FARHAIN AMC AMBULANS - SEBUTHARGA TRIP*\n\n` +
        `Pangkalan: ${state.currentHub.shortName}\n` +
        `Pengambilan: ${state.pickupName}\n` +
        `Hospital Tujuan: ${state.destinationName}\n` +
        `Jumlah Jarak: ${state.distanceKm.toFixed(1)} KM\n` +
        `Kategori: ${state.selectedTripType.name}\n` +
        `Bantuan Staf: ${state.selectedAssistance.roleTitle}\n` +
        `*JUMLAH ANGGARAN: ${document.getElementById('invSummaryGrandTotal').textContent}*\n\n` +
        `Hubungi Talian 24 Jam Al-Farhain: 013-914 7606`;

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

  if (rowPangkalan) {
    rowPangkalan.addEventListener('click', () => {
      playClickSound();
      title.textContent = 'Pilih Pangkalan Ambulans';
      content.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="service-card ${state.currentHub.id === 'kok_lanas' ? 'selected' : ''}" data-hub="kok_lanas">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:1.4rem;">🏛️</span>
              <div>
                <strong>HQ Pusat Rawatan Kok Lanas (Kelantan)</strong>
                <div style="font-size:0.72rem; color:var(--text-muted);">Plat: VPQ 7606 • Abe Di</div>
              </div>
            </div>
          </div>
          <div class="service-card ${state.currentHub.id === 'raub' ? 'selected' : ''}" data-hub="raub">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:1.4rem;">🏛️</span>
              <div>
                <strong>Cawangan Raub (Pahang)</strong>
                <div style="font-size:0.72rem; color:var(--text-muted);">Plat: DFG 7606 • Abe Din</div>
              </div>
            </div>
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

  if (rowPickup) {
    rowPickup.addEventListener('click', () => {
      playClickSound();
      title.textContent = 'Pilih Lokasi Pengambilan';
      const presets = PRESET_PICKUP_LOCATIONS[state.currentHub.id] || PRESET_PICKUP_LOCATIONS.kok_lanas;

      let html = '<div style="display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto;">';
      presets.forEach(p => {
        html += `
          <div class="service-card" data-pickup-name="${p.name}">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:1.2rem;">📍</span>
              <div>
                <strong>${p.name}</strong>
                <div style="font-size:0.7rem; color:var(--text-muted);">${p.address || p.area}</div>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';

      content.innerHTML = html;

      content.querySelectorAll('.service-card').forEach(c => {
        c.addEventListener('click', () => {
          playClickSound();
          state.pickupName = c.dataset.pickupName;
          const displayEl = document.getElementById('displayPickupName');
          if (displayEl) displayEl.textContent = state.pickupName;
          calculateAll();
          modal.classList.remove('show');
        });
      });

      modal.classList.add('show');
    });
  }

  if (rowDest) {
    rowDest.addEventListener('click', () => {
      playClickSound();
      title.textContent = 'Pilih Hospital Destinasi';

      let html = '<div style="display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto;">';
      PRESET_DESTINATIONS.forEach(d => {
        html += `
          <div class="service-card" data-dest-name="${d.name}" data-km="${d.distanceFromKokLanas}">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:1.2rem;">🏥</span>
              <div>
                <strong>${d.name}</strong>
                <div style="font-size:0.7rem; color:var(--text-muted);">${d.category} • ~${d.distanceFromKokLanas} KM</div>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';

      content.innerHTML = html;

      content.querySelectorAll('.service-card').forEach(c => {
        c.addEventListener('click', () => {
          playClickSound();
          state.destinationName = c.dataset.destName;
          const km = parseFloat(c.dataset.km) || 26.3;
          state.distanceKm = km;
          state.leg1Km = Math.min(km, 25.2);
          state.leg2Km = Math.max(1.1, km - state.leg1Km);

          const displayEl = document.getElementById('displayDestName');
          if (displayEl) displayEl.textContent = state.destinationName;

          calculateAll();
          updateMapMarkers();
          modal.classList.remove('show');
        });
      });

      modal.classList.add('show');
    });
  }
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
