// AL-FARHAIN MEDICAL CENTER (AMC) - AMBULANCE MEDICAL SYSTEM
// Main Application Controller & Calculation Engine

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

// Application State
const state = {
  currentHub: HUBS.KOK_LANAS,
  originCoords: HUBS.KOK_LANAS.coords,

  // Point 2: Customer Pickup Point (Home / Residence)
  pickupPresetId: 'kediaman_kb',
  pickupAddress: 'Bandar Kota Bharu, 15000 Kota Bharu, Kelantan',
  pickupCoords: [6.1248, 102.2544],

  // Point 3: Destination Point (Hospital / Drop-off)
  selectedDestId: 'hrpz',
  destinationName: 'Hospital Raja Perempuan Zainab II (HRPZ II), Kota Bharu',
  destinationCoords: [6.1256, 102.2482],

  // Multi-Leg Distances (Leg 1: Hub -> Pickup, Leg 2: Pickup -> Dest, Total: Leg 1 + 2)
  leg1Km: 24.5,
  leg2Km: 4.5,
  distanceKm: 29.0, // Operational distance

  calcStep: 1, // Current active step in multi-step calculator (1 to 5)
  selectedTripType: TRIP_TYPES[0],
  selectedAssistance: ASSISTANCE_PACKAGES[0],
  equipmentQuantities: {},
  isDieselSurge: false,
  includeMiscFee: true,
  driverStage: 2, // 1: Dispatched, 2: En Route, 3: On Scene, 4: In Transit, 5: Arrived
  recentOrders: [
    {
      id: 'INV-AMC-1042',
      date: '15/10/2026 11:20 AM',
      route: 'HQ Kok Lanas ➔ Kediaman Kota Bharu ➔ HRPZ II',
      distanceKm: 29.0,
      assistance: 'Pakej M.A (PPP)',
      equipment: 'Tangki Oksigen (1)',
      total: 562.00,
      status: 'Selesai'
    },
    {
      id: 'INV-AMC-1041',
      date: '15/10/2026 09:45 AM',
      route: 'HQ Kok Lanas ➔ Kediaman Machang ➔ Hospital Machang',
      distanceKm: 18.5,
      assistance: 'Krew EMT Standard',
      equipment: 'Tiada',
      total: 300.00,
      status: 'Selesai'
    },
    {
      id: 'INV-AMC-1040',
      date: '14/10/2026 08:15 PM',
      route: 'Cawangan Raub ➔ Bandar Raub ➔ Hospital Kuala Lipis',
      distanceKm: 42.5,
      assistance: 'Pakej C.A',
      equipment: 'Pek IV Drip (2)',
      total: 452.50,
      status: 'Selesai'
    }
  ]
};

// Initialize equipment quantities
ADDITIONAL_EQUIPMENTS.forEach(eq => {
  state.equipmentQuantities[eq.id] = eq.defaultQty;
});

// Map Reference
let map = null;
let originMarker = null;
let pickupMarker = null;
let destMarker = null;
let routePolyline = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initHubSelector();
  initPickupPoint();
  initDestinations();
  initTripTypes();
  initAssistancePackages();
  initEquipments();
  initDistanceControls();
  initLeafletMap();
  initNavigationTabs();
  initSegmentedModeSwitch();
  initMultiStepCalculator();
  initModals();
  initDriverHUD();
  initAdminDashboard();
  initCatalog();
  initFAQAssistant();
  initSupabaseIntegration();

  // Run initial calculation
  calculateAll();
});

/* =========================================================================
   Theme Management (User-Friendly Light vs Eye-Care Dark)
   ========================================================================= */
function initTheme() {
  const themeInitDone = localStorage.getItem('amc_redesign_theme_v3');
  let savedTheme = localStorage.getItem('amc_theme');
  if (!themeInitDone) {
    savedTheme = 'dark';
    localStorage.setItem('amc_theme', 'dark');
    localStorage.setItem('amc_redesign_theme_v3', '1');
  }
  setTheme(savedTheme || 'dark');

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      playClickSound();
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('amc_theme', theme);

  const themeToggleIcon = document.getElementById('themeToggleIcon');
  const themeToggleLabel = document.getElementById('themeToggleLabel');
  if (themeToggleIcon) {
    themeToggleIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
  }
  if (themeToggleLabel) {
    themeToggleLabel.textContent = theme === 'dark' ? 'Malam' : 'Siang';
  }

  // Refresh Leaflet Map if present so tiles adapt properly
  if (map) {
    setTimeout(() => map.invalidateSize(), 120);
  }
}

/* =========================================================================
   1. Hub & Starting Base Selector (Kok Lanas HQ vs Raub Branch)
   ========================================================================= */
function initHubSelector() {
  const hubSelector = document.getElementById('hubSelector');
  const startingHubSelect = document.getElementById('startingHubSelect');
  const activeHubBadge = document.getElementById('activeHubBadge');

  function updateHubUI(hubKey) {
    const hubId = (hubKey || 'kok_lanas').toLowerCase();
    state.currentHub = (hubId === 'raub') ? HUBS.RAUB : HUBS.KOK_LANAS;
    state.originCoords = state.currentHub.coords;

    if (activeHubBadge) {
      activeHubBadge.textContent = state.currentHub.shortName.toUpperCase();
    }
    const originTag = document.getElementById('originTag');
    if (originTag) originTag.textContent = state.currentHub.name;
    const hudDriverName = document.getElementById('hudDriverName');
    if (hudDriverName) hudDriverName.textContent = state.currentHub.primaryDriver;
    const hudPlateNumber = document.getElementById('hudPlateNumber');
    if (hudPlateNumber) {
      hudPlateNumber.innerHTML = `No. Plat: <strong>${state.currentHub.ambulancePlate}</strong> (${state.currentHub.shortName})`;
    }

    // Keep both selects synced
    if (hubSelector && hubSelector.value !== hubId) {
      hubSelector.value = hubId;
    }
    if (startingHubSelect && startingHubSelect.value !== hubId) {
      startingHubSelect.value = hubId;
    }

    // Refresh pickup presets & destination presets for this hub
    populatePickupPresets(hubId);
    populateDestinationPresets(hubId);

    // Re-center map & update route
    if (map) {
      updateMapMarkersAndRoute();
    }
    calculateAll();
  }

  if (hubSelector) {
    hubSelector.addEventListener('change', (e) => {
      playClickSound();
      updateHubUI(e.target.value);
    });
  }

  if (startingHubSelect) {
    startingHubSelect.addEventListener('change', (e) => {
      playClickSound();
      updateHubUI(e.target.value);
    });
  }
}

/* =========================================================================
   2. Customer Pickup Point Setup (Home / Residence / Custom Location)
   ========================================================================= */
function initPickupPoint() {
  const pickupPresetSelect = document.getElementById('pickupPresetSelect');
  const pickupAddressInput = document.getElementById('pickupAddressInput');

  populatePickupPresets(state.currentHub.id);

  if (pickupPresetSelect) {
    pickupPresetSelect.addEventListener('change', (e) => {
      playClickSound();
      const val = e.target.value;
      state.pickupPresetId = val;

      const hubPresets = PRESET_PICKUP_LOCATIONS[state.currentHub.id] || PRESET_PICKUP_LOCATIONS.kok_lanas;
      const found = hubPresets.find(p => p.id === val);

      if (found) {
        if (found.id === 'custom_pickup') {
          if (pickupAddressInput) {
            state.pickupAddress = pickupAddressInput.value || 'Kediaman Pesakit';
            pickupAddressInput.focus();
          }
        } else {
          state.pickupAddress = found.address || found.name;
          if (found.coords) {
            state.pickupCoords = found.coords;
          }
          if (pickupAddressInput) {
            pickupAddressInput.value = state.pickupAddress;
          }
        }
      }

      updateMapMarkersAndRoute();
      calculateAll();
    });
  }

  if (pickupAddressInput) {
    pickupAddressInput.addEventListener('input', (e) => {
      state.pickupAddress = e.target.value || 'Kediaman Pesakit';
      calculateAll();
    });
  }
}

function populatePickupPresets(hubId) {
  const pickupPresetSelect = document.getElementById('pickupPresetSelect');
  const pickupAddressInput = document.getElementById('pickupAddressInput');
  if (!pickupPresetSelect) return;

  const presets = PRESET_PICKUP_LOCATIONS[hubId] || PRESET_PICKUP_LOCATIONS.kok_lanas;
  pickupPresetSelect.innerHTML = '';

  presets.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    pickupPresetSelect.appendChild(opt);
  });

  // Select default preset
  const defaultPreset = presets[0];
  state.pickupPresetId = defaultPreset.id;
  state.pickupAddress = defaultPreset.address || defaultPreset.name;
  if (defaultPreset.coords) {
    state.pickupCoords = defaultPreset.coords;
  }
  if (pickupAddressInput) {
    pickupAddressInput.value = state.pickupAddress;
  }
}

/* =========================================================================
   3. Destination / Drop-off Setup (Hospital / Clinic / Custom)
   ========================================================================= */
function initDestinations() {
  const destSelect = document.getElementById('destinationSelect');
  const destAddressInput = document.getElementById('destAddressInput');

  populateDestinationPresets(state.currentHub.id);

  if (destSelect) {
    destSelect.addEventListener('change', (e) => {
      playClickSound();
      const val = e.target.value;
      state.selectedDestId = val;

      if (val === 'custom_dest') {
        if (destAddressInput) {
          state.destinationName = destAddressInput.value || 'Hospital Destinasi Khas';
          destAddressInput.focus();
        }
      } else {
        const found = PRESET_DESTINATIONS.find(d => d.id === val);
        if (found) {
          state.destinationName = found.name;
          state.destinationCoords = found.coords;
          if (destAddressInput) {
            destAddressInput.value = found.name;
          }
        }
      }
      updateMapMarkersAndRoute();
      calculateAll();
    });
  }

  if (destAddressInput) {
    destAddressInput.addEventListener('input', (e) => {
      state.destinationName = e.target.value || 'Hospital Destinasi';
      calculateAll();
    });
  }
}

function populateDestinationPresets(hubId) {
  const destSelect = document.getElementById('destinationSelect');
  const destAddressInput = document.getElementById('destAddressInput');
  if (!destSelect) return;

  destSelect.innerHTML = '';

  const affinityList = PRESET_DESTINATIONS.filter(d => d.hubAffinity === hubId);
  const otherList = PRESET_DESTINATIONS.filter(d => d.hubAffinity !== hubId);

  const groupPrimary = document.createElement('optgroup');
  groupPrimary.label = hubId === 'raub' ? '🏥 Hospital Sekitar Pahang & Wilayah' : '🏥 Hospital Sekitar Kelantan';
  affinityList.forEach(dest => {
    const opt = document.createElement('option');
    opt.value = dest.id;
    opt.textContent = `${dest.shortName} - ${dest.category}`;
    groupPrimary.appendChild(opt);
  });
  destSelect.appendChild(groupPrimary);

  const groupSecondary = document.createElement('optgroup');
  groupSecondary.label = '🏥 Hospital Wilayah Lain';
  otherList.forEach(dest => {
    const opt = document.createElement('option');
    opt.value = dest.id;
    opt.textContent = `${dest.shortName} (${dest.state}) - ${dest.category}`;
    groupSecondary.appendChild(opt);
  });
  destSelect.appendChild(groupSecondary);

  // Custom Option
  const customOpt = document.createElement('option');
  customOpt.value = 'custom_dest';
  customOpt.textContent = '📍 Destinasi Tersuai / Hospital Lain (Taip Sendiri)';
  destSelect.appendChild(customOpt);

  const defaultDest = affinityList[0] || PRESET_DESTINATIONS[0];
  state.selectedDestId = defaultDest.id;
  state.destinationName = defaultDest.name;
  state.destinationCoords = defaultDest.coords;
  if (destAddressInput) {
    destAddressInput.value = defaultDest.name;
  }
}

/* =========================================================================
   3. Distance Inputs & Fine-Tuning Slider
   ========================================================================= */
function initDistanceControls() {
  const slider = document.getElementById('distanceSlider');
  const manualInput = document.getElementById('manualKmInput');

  slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    manualInput.value = val;
    state.distanceKm = val;
    calculateAll();
  });

  manualInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) || 1;
    slider.value = Math.min(val, 400);
    state.distanceKm = val;
    calculateAll();
  });

  // Open Google Maps Direct Button (Hub -> Pickup -> Destination)
  document.getElementById('openGoogleMapsBtn').addEventListener('click', () => {
    playClickSound();
    const orig = `${state.originCoords[0]},${state.originCoords[1]}`;
    const pickup = `${state.pickupCoords[0]},${state.pickupCoords[1]}`;
    const dest = `${state.destinationCoords[0]},${state.destinationCoords[1]}`;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&waypoints=${pickup}`;
    window.open(url, '_blank');
  });

  // Geolocation Button (Detects patient current GPS location for home pickup)
  document.getElementById('locateMeBtn').addEventListener('click', () => {
    playClickSound();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setExactPickup(lat, lng, true);
        },
        () => {
          alert('Tidak dapat mengesan lokasi GPS. Sila pilih kawasan pengambilan pesakit atau masukkan alamat manual.');
        }
      );
    }
  });
}

function updateDistanceInputs(km) {
  document.getElementById('distanceSlider').value = Math.min(km, 400);
  document.getElementById('manualKmInput').value = km.toFixed(1);
}

/* =========================================================================
   4. Render Trip Types (Emergency / Non-Emergency)
   ========================================================================= */
function initTripTypes() {
  const container = document.getElementById('tripTypesContainer');
  container.innerHTML = '';

  TRIP_TYPES.forEach((trip, idx) => {
    const card = document.createElement('div');
    card.className = `trip-type-card ${idx === 0 ? 'selected' : ''}`;
    card.dataset.id = trip.id;

    // Harmonious matching badge tint
    const badgeBg = trip.id === 'non_emergency'
      ? 'var(--amc-emerald-light)'
      : trip.id === 'emergency_inhouse'
      ? 'var(--amc-amber-light)'
      : 'var(--amc-red-light)';

    const badgeColor = trip.id === 'non_emergency'
      ? 'var(--amc-emerald)'
      : trip.id === 'emergency_inhouse'
      ? 'var(--amc-amber)'
      : 'var(--amc-red)';

    card.innerHTML = `
      <div>
        <div class="card-top">
          <span class="trip-type-name">${trip.name}</span>
          <span class="trip-type-badge" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor};">
            ${trip.badge}
          </span>
        </div>
        <div class="trip-type-desc">${trip.description}</div>
      </div>
      <div class="trip-type-price">RM ${trip.baseFare.toFixed(2)} <span class="rate-sub">kadar asas</span></div>
    `;

    card.addEventListener('click', () => {
      playClickSound();
      container.querySelectorAll('.trip-type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedTripType = trip;
      calculateAll();
    });

    container.appendChild(card);
  });
}

/* =========================================================================
   5. Render Medical Assistance Personnel Cards
   ========================================================================= */
function initAssistancePackages() {
  const container = document.getElementById('assistanceContainer');
  container.innerHTML = '';

  ASSISTANCE_PACKAGES.forEach((pkg, idx) => {
    const card = document.createElement('div');
    card.className = `assistance-card ${idx === 0 ? 'selected' : ''}`;
    card.dataset.id = pkg.id;

    const skillsHtml = pkg.skills.map(s => `<span class="skill-tag">${s}</span>`).join('');

    card.innerHTML = `
      <div>
        <div class="assistance-header">
          <span class="assistance-role">${pkg.name}</span>
          <span class="assistance-cost">${pkg.price === 0 ? 'PERCUMA' : '+RM ' + pkg.price.toFixed(2)}</span>
        </div>
        <div class="assistance-desc">${pkg.description}</div>
        <div style="font-size: 0.72rem; color: var(--amc-cyan); margin-bottom: 0.5rem; font-weight: 600;">
          Sesuai untuk: ${pkg.recommendedFor}
        </div>
      </div>
      <div class="skill-tags">
        ${skillsHtml}
      </div>
    `;

    card.addEventListener('click', () => {
      playClickSound();
      container.querySelectorAll('.assistance-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedAssistance = pkg;
      calculateAll();
    });

    container.appendChild(card);
  });
}

/* =========================================================================
   6. Render Additional Equipments & Medicines
   ========================================================================= */
function initEquipments() {
  const container = document.getElementById('equipmentContainer');
  container.innerHTML = '';

  ADDITIONAL_EQUIPMENTS.forEach(eq => {
    const card = document.createElement('div');
    card.className = 'equipment-item-card';
    card.id = `equip-card-${eq.id}`;

    card.innerHTML = `
      <div class="equip-info">
        <div class="equip-icon">${eq.icon}</div>
        <div class="equip-texts">
          <div class="equip-name" title="${eq.name}">${eq.name}</div>
          <div class="equip-rate">RM ${eq.price.toFixed(2)} <span style="font-size: 0.7rem; color: var(--text-dim); font-weight: normal;">${eq.unit}</span></div>
        </div>
      </div>

      <div class="qty-stepper">
        <button class="qty-btn btn-minus" data-id="${eq.id}">-</button>
        <span class="qty-val" id="qty-${eq.id}">0</span>
        <button class="qty-btn btn-plus" data-id="${eq.id}">+</button>
      </div>
    `;

    const minusBtn = card.querySelector('.btn-minus');
    const plusBtn = card.querySelector('.btn-plus');
    const qtySpan = card.querySelector(`#qty-${eq.id}`);

    minusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playClickSound();
      if (state.equipmentQuantities[eq.id] > 0) {
        state.equipmentQuantities[eq.id]--;
        qtySpan.textContent = state.equipmentQuantities[eq.id];
        card.classList.toggle('has-qty', state.equipmentQuantities[eq.id] > 0);
        calculateAll();
      }
    });

    plusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playClickSound();
      if (state.equipmentQuantities[eq.id] < eq.maxQty) {
        state.equipmentQuantities[eq.id]++;
        qtySpan.textContent = state.equipmentQuantities[eq.id];
        card.classList.toggle('has-qty', state.equipmentQuantities[eq.id] > 0);
        calculateAll();
      }
    });

    container.appendChild(card);
  });
}

/* =========================================================================
   7. CORE CALCULATION ENGINE (Exact Excel Formula)
   ========================================================================= */
/* =========================================================================
   7. CORE CALCULATION ENGINE (Exact Excel Formula + Step 1 Live Estimate)
   ========================================================================= */
function calculateAll() {
  const distance = Math.max(1, state.distanceKm);
  const baseKm = BASE_SETTINGS.standardBaseKm; // 25.0 KM
  const extraKm = Math.max(0, distance - baseKm);

  // Rate per extra KM
  const dieselToggle = document.getElementById('dieselSurgeToggle');
  state.isDieselSurge = dieselToggle ? dieselToggle.checked : false;
  const ratePerKm = state.isDieselSurge ? BASE_SETTINGS.extraKmRateDiesel : BASE_SETTINGS.extraKmRateNormal;

  // Extra KM cost
  const extraKmCost = extraKm * ratePerKm;

  // Step 1 Base Fare Estimate (Distance based only)
  const step1EstimateFare = 250.00 + extraKmCost;

  // Trip category base fare
  const tripBaseFare = state.selectedTripType.baseFare;

  // Assistance personnel fare
  const assistanceFare = state.selectedAssistance.price;

  // Equipment total
  let equipTotal = 0;
  let totalEquipItems = 0;
  ADDITIONAL_EQUIPMENTS.forEach(eq => {
    const qty = state.equipmentQuantities[eq.id] || 0;
    if (qty > 0) {
      equipTotal += eq.price * qty;
      totalEquipItems += qty;
    }
  });

  // Misc charges (Lain-lain caj)
  const miscFeeCheckbox = document.getElementById('includeMiscFee');
  state.includeMiscFee = miscFeeCheckbox ? miscFeeCheckbox.checked : true;
  const miscFee = state.includeMiscFee ? BASE_SETTINGS.defaultLainLainCaj : 0.00;

  // Grand Total for Invoice / Step 5
  const grandTotal = tripBaseFare + extraKmCost + assistanceFare + equipTotal + miscFee;

  // Update Step 1 Multi-Leg Breakdown Badges
  const leg1KmBadge = document.getElementById('leg1KmBadge');
  if (leg1KmBadge) leg1KmBadge.textContent = `${state.leg1Km.toFixed(1)} KM`;
  const leg2KmBadge = document.getElementById('leg2KmBadge');
  if (leg2KmBadge) leg2KmBadge.textContent = `${state.leg2Km.toFixed(1)} KM`;

  const leg1Text = document.getElementById('leg1Text');
  if (leg1Text) {
    const shortPickup = (state.pickupAddress || 'Rumah Pesakit').split(',')[0].trim();
    leg1Text.textContent = `${state.currentHub.shortName} ➔ ${shortPickup}`;
  }

  const leg2Text = document.getElementById('leg2Text');
  if (leg2Text) {
    const shortPickup = (state.pickupAddress || 'Rumah Pesakit').split(',')[0].trim();
    const shortDest = (state.destinationName || 'Hospital').split(',')[0].replace(/\s*\(.*KM\)/i, '').trim();
    leg2Text.textContent = `${shortPickup} ➔ ${shortDest}`;
  }

  // Update Step 1 Route Distance Meta Bar
  const displayDistanceKm = document.getElementById('displayDistanceKm');
  if (displayDistanceKm) displayDistanceKm.textContent = `${distance.toFixed(1)} KM`;
  const displayExtraKm = document.getElementById('displayExtraKm');
  if (displayExtraKm) displayExtraKm.textContent = extraKm > 0 ? `+${extraKm.toFixed(1)} KM` : '0 KM';

  // Update Step 1 Live Estimate Fare Card
  const step1EstimateFareEl = document.getElementById('step1EstimateFare');
  if (step1EstimateFareEl) {
    step1EstimateFareEl.textContent = step1EstimateFare.toFixed(2);
  }

  const estimateRouteCaption = document.getElementById('estimateRouteCaption');
  if (estimateRouteCaption) {
    const shortPickup = (state.pickupAddress || 'Rumah').split(',')[0].trim();
    const shortDest = (state.destinationName || 'Hospital').split(',')[0].replace(/\s*\(.*KM\)/i, '').trim();
    estimateRouteCaption.textContent = `${state.currentHub.shortName} ➔ ${shortPickup} ➔ ${shortDest}`;
  }

  const step1ExtraBreakdownText = document.getElementById('step1ExtraBreakdownText');
  if (step1ExtraBreakdownText) {
    if (extraKm > 0) {
      step1ExtraBreakdownText.innerHTML = `Lebihan ${extraKm.toFixed(1)} KM (&times;RM ${ratePerKm.toFixed(2)}): <strong>+RM ${extraKmCost.toFixed(2)}</strong>`;
    } else {
      step1ExtraBreakdownText.innerHTML = `Dalam Had 25 KM Standard: <strong>+RM 0.00</strong>`;
    }
  }

  // Rate per KM Label
  const ratePerKmLabel = document.getElementById('ratePerKmLabel');
  if (ratePerKmLabel) ratePerKmLabel.textContent = ratePerKm.toFixed(2);

  // Summary (Step 5)
  const summaryTripName = document.getElementById('summaryTripName');
  if (summaryTripName) summaryTripName.textContent = state.selectedTripType.name.split(' (')[0];
  const summaryTripBase = document.getElementById('summaryTripBase');
  if (summaryTripBase) summaryTripBase.textContent = `RM ${tripBaseFare.toFixed(2)}`;
  const summaryBaseKmFare = document.getElementById('summaryBaseKmFare');
  if (summaryBaseKmFare) summaryBaseKmFare.textContent = `RM ${tripBaseFare.toFixed(2)}`;

  const summaryExtraKmCount = document.getElementById('summaryExtraKmCount');
  if (summaryExtraKmCount) summaryExtraKmCount.textContent = extraKm.toFixed(1);
  const summaryKmRate = document.getElementById('summaryKmRate');
  if (summaryKmRate) summaryKmRate.textContent = ratePerKm.toFixed(2);
  const summaryExtraKmFare = document.getElementById('summaryExtraKmFare');
  if (summaryExtraKmFare) summaryExtraKmFare.textContent = `RM ${extraKmCost.toFixed(2)}`;

  const summaryAssistanceRole = document.getElementById('summaryAssistanceRole');
  if (summaryAssistanceRole) summaryAssistanceRole.textContent = state.selectedAssistance.name.split(' (')[0];
  const summaryAssistanceFare = document.getElementById('summaryAssistanceFare');
  if (summaryAssistanceFare) summaryAssistanceFare.textContent = `RM ${assistanceFare.toFixed(2)}`;

  const summaryEquipCount = document.getElementById('summaryEquipCount');
  if (summaryEquipCount) summaryEquipCount.textContent = totalEquipItems;
  const summaryEquipFare = document.getElementById('summaryEquipFare');
  if (summaryEquipFare) summaryEquipFare.textContent = `RM ${equipTotal.toFixed(2)}`;
  const summaryMiscFare = document.getElementById('summaryMiscFare');
  if (summaryMiscFare) summaryMiscFare.textContent = `RM ${miscFee.toFixed(2)}`;

  const grandTotalDisplay = document.getElementById('grandTotalDisplay');
  if (grandTotalDisplay) grandTotalDisplay.textContent = grandTotal.toFixed(2);

  // Sync Persistent Floating Mini Bar
  const miniGrandTotalDisplay = document.getElementById('miniGrandTotalDisplay');
  if (miniGrandTotalDisplay) {
    miniGrandTotalDisplay.textContent = grandTotal.toFixed(2);
  }

  const miniRouteText = document.getElementById('miniRouteText');
  if (miniRouteText) {
    const cleanPickup = (state.pickupAddress || 'Rumah').split(',')[0].trim();
    const cleanDest = (state.destinationName || 'Hospital').split(',')[0].replace(/\s*\(\d+.*KM\)/i, '').trim();
    miniRouteText.textContent = `${state.currentHub.shortName} ➔ ${cleanPickup} ➔ ${cleanDest} (${distance.toFixed(1)} KM)`;
  }

  // Play subtle feedback chime
  playCalculateChime();
}

// Diesel Toggle Listener
const dieselSurgeToggle = document.getElementById('dieselSurgeToggle');
if (dieselSurgeToggle) {
  dieselSurgeToggle.addEventListener('change', () => {
    playClickSound();
    calculateAll();
  });
}

// Misc Fee Checkbox Listener
const includeMiscFeeEl = document.getElementById('includeMiscFee');
if (includeMiscFeeEl) {
  includeMiscFeeEl.addEventListener('change', () => {
    playClickSound();
    calculateAll();
  });
}

/* =========================================================================
   8. Real Interactive Map Engine (3-Point Multi-Leg Road Routing)
   ========================================================================= */
let currentTileLayer = null;
const mapTileLayers = {
  google_streets: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  google_hybrid: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
};

function initLeafletMap() {
  if (typeof L === 'undefined') return;

  const defaultCenter = state.originCoords;
  map = L.map('leafletMap', {
    zoomControl: true,
    attributionControl: false
  }).setView(defaultCenter, 10);

  // Default road tiles
  currentTileLayer = L.tileLayer(mapTileLayers.google_streets, {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
  }).addTo(map);

  // 1. Ambulance Base Icon (🏢 Starting Hub)
  const ambulanceIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div style="background:#0284C7; border:2.5px solid #FFFFFF; border-radius:50%; width:38px; height:38px; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 0 18px rgba(2,132,199,0.85);">🚑</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });

  // 2. Customer Pickup Icon (🏠 Home / Patient)
  const pickupIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div class="marker-pin-pulse">
             <div style="background:#10B981; border:2.5px solid #FFFFFF; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 0 20px rgba(16,185,129,0.9); cursor:grab;">🏠</div>
           </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

  // 3. Destination Pin (🏥 Hospital / Facility)
  const destinationIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div class="marker-pin-pulse">
             <div style="background:#EF4444; border:2.5px solid #FFFFFF; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 0 20px rgba(239,68,68,0.9); cursor:grab;">🏥</div>
           </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

  // Add 3 markers to map
  originMarker = L.marker(state.originCoords, { icon: ambulanceIcon, draggable: false }).addTo(map)
    .bindPopup(`<b>Pangkalan Ambulans:</b><br>${state.currentHub.name}<br>No. Plat: ${state.currentHub.ambulancePlate}`);

  pickupMarker = L.marker(state.pickupCoords, { icon: pickupIcon, draggable: true }).addTo(map)
    .bindPopup(`<b>Lokasi Pengambilan Pesakit:</b><br>${state.pickupAddress}<br><i>Tarik pin hijau ini ke lokasi rumah pesakit</i>`);

  destMarker = L.marker(state.destinationCoords, { icon: destinationIcon, draggable: true }).addTo(map)
    .bindPopup(`<b>Hospital / Destinasi Tujuan:</b><br>${state.destinationName}<br><i>Tarik pin merah ini ke hospital tujuan</i>`);

  // Drag listeners
  pickupMarker.on('dragend', (e) => {
    playClickSound();
    const pos = e.target.getLatLng();
    setExactPickup(pos.lat, pos.lng, true);
  });

  destMarker.on('dragend', (e) => {
    playClickSound();
    const pos = e.target.getLatLng();
    setExactDestination(pos.lat, pos.lng, true);
  });

  // Polyline for real driving road route connecting Hub -> Pickup -> Destination
  routePolyline = L.polyline([state.originCoords, state.pickupCoords, state.destinationCoords], {
    color: '#0EA5E9',
    weight: 5,
    opacity: 0.9,
    lineJoin: 'round'
  }).addTo(map);

  // Click on map to place/move the customer pickup pin by default
  map.on('click', (e) => {
    playClickSound();
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    setExactPickup(lat, lng, true);
  });

  // Initialize Map Controls
  initMapControls();

  // Fetch initial real multi-waypoint road route
  fetchRealDrivingRoute(state.originCoords, state.pickupCoords, state.destinationCoords);
}

// Function to set exact pickup coordinates, reverse-geocode & compute driving distance
async function setExactPickup(lat, lng, reverseGeocode = false) {
  state.pickupCoords = [lat, lng];
  if (pickupMarker) pickupMarker.setLatLng([lat, lng]);

  await fetchRealDrivingRoute(state.originCoords, [lat, lng], state.destinationCoords);

  if (reverseGeocode) {
    try {
      const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const prop = data.features[0].properties;
        const placeName = [prop.name, prop.street, prop.district, prop.city || prop.county, prop.state]
          .filter(Boolean)
          .join(', ');

        if (placeName) {
          state.pickupAddress = placeName;
          const pickupAddressInput = document.getElementById('pickupAddressInput');
          if (pickupAddressInput) pickupAddressInput.value = placeName;
          const pickupPresetSelect = document.getElementById('pickupPresetSelect');
          if (pickupPresetSelect) pickupPresetSelect.value = 'custom_pickup';
          if (pickupMarker) {
            pickupMarker.setPopupContent(`<b>Lokasi Pengambilan Pesakit:</b><br>${placeName}`);
          }
        }
      }
    } catch (err) {
      console.warn('Reverse geocoding error:', err);
    }
  }

  calculateAll();
}

// Function to set exact destination coordinates, reverse-geocode & compute driving distance
async function setExactDestination(lat, lng, reverseGeocode = false) {
  state.destinationCoords = [lat, lng];
  if (destMarker) destMarker.setLatLng([lat, lng]);

  await fetchRealDrivingRoute(state.originCoords, state.pickupCoords, [lat, lng]);

  if (reverseGeocode) {
    try {
      const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const prop = data.features[0].properties;
        const placeName = [prop.name, prop.street, prop.district, prop.city || prop.county, prop.state]
          .filter(Boolean)
          .join(', ');

        if (placeName) {
          state.destinationName = placeName;
          const destAddressInput = document.getElementById('destAddressInput');
          if (destAddressInput) destAddressInput.value = placeName;
          const destinationSelect = document.getElementById('destinationSelect');
          if (destinationSelect) destinationSelect.value = 'custom_dest';
          if (destMarker) {
            destMarker.setPopupContent(`<b>Hospital / Destinasi Tujuan:</b><br>${placeName}`);
          }
        }
      }
    } catch (err) {
      console.warn('Reverse geocoding error:', err);
    }
  }

  calculateAll();
}

// Fetch turn-by-turn REAL multi-waypoint road route from OSRM: Hub -> Pickup -> Destination
async function fetchRealDrivingRoute(orig, pickup, dest) {
  if (!orig || !pickup || !dest) return;

  const sameOrigPickup = Math.abs(orig[0] - pickup[0]) < 0.0001 && Math.abs(orig[1] - pickup[1]) < 0.0001;

  let leg1 = 0;
  let leg2 = 0;
  let totalRoadKm = 0;
  let latlngs = [];
  let durationSec = 0;

  try {
    let url;
    if (sameOrigPickup) {
      url = `https://router.project-osrm.org/route/v1/driving/${pickup[1]},${pickup[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;
    } else {
      url = `https://router.project-osrm.org/route/v1/driving/${orig[1]},${orig[0]};${pickup[1]},${pickup[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (data && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      if (sameOrigPickup) {
        leg1 = 1.0;
        leg2 = Math.round((route.distance / 1000) * 10) / 10;
        totalRoadKm = Math.round((leg1 + leg2) * 10) / 10;
      } else {
        leg1 = route.legs && route.legs[0] ? Math.round((route.legs[0].distance / 1000) * 10) / 10 : 0;
        leg2 = route.legs && route.legs[1] ? Math.round((route.legs[1].distance / 1000) * 10) / 10 : 0;
        totalRoadKm = Math.round((leg1 + leg2) * 10) / 10;
      }

      durationSec = route.duration || 0;
      if (route.geometry && route.geometry.coordinates) {
        latlngs = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      }
    }
  } catch (e) {
    console.warn('OSRM multi-waypoint routing failed, using geodesic fallback:', e);
  }

  // Geodesic fallback if OSRM failed or 0
  if (totalRoadKm <= 0) {
    const d1 = computeHaversineDistance(orig, pickup) * 1.25;
    const d2 = computeHaversineDistance(pickup, dest) * 1.25;
    leg1 = Math.max(1.0, Math.round(d1 * 10) / 10);
    leg2 = Math.max(1.0, Math.round(d2 * 10) / 10);
    totalRoadKm = Math.round((leg1 + leg2) * 10) / 10;
    latlngs = [orig, pickup, dest];
  }

  state.leg1Km = leg1;
  state.leg2Km = leg2;
  state.distanceKm = totalRoadKm;

  updateDistanceInputs(totalRoadKm);

  if (routePolyline && latlngs.length > 0) {
    routePolyline.setLatLngs(latlngs);
    if (map) {
      try {
        map.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });
      } catch (err) {}
    }
  }

  const estMinutes = Math.round(durationSec > 0 ? durationSec / 60 : totalRoadKm * 1.3);
  const hudEta = document.getElementById('hudEtaMinutes');
  const hudKm = document.getElementById('hudRemainingKm');
  if (hudEta) hudEta.textContent = `${estMinutes} Minit`;
  if (hudKm) hudKm.textContent = `${totalRoadKm} KM`;

  const mapCoordsBadge = document.getElementById('mapCoordsBadge');
  if (mapCoordsBadge) {
    mapCoordsBadge.textContent = `${state.currentHub.shortName} ➔ ${(state.pickupAddress || 'Rumah').substring(0, 14)}... ➔ ${(state.destinationName || 'Hospital').substring(0, 14)}... (${totalRoadKm} KM)`;
  }

  calculateAll();
}

function updateMapMarkersAndRoute() {
  if (!map) return;

  if (originMarker) {
    originMarker.setLatLng(state.originCoords);
    originMarker.setPopupContent(`<b>${state.currentHub.name}</b><br>Pusat Operasi AMC (${state.currentHub.ambulancePlate})`);
  }

  if (pickupMarker) {
    pickupMarker.setLatLng(state.pickupCoords);
    pickupMarker.setPopupContent(`<b>Lokasi Pengambilan Pesakit:</b><br>${state.pickupAddress}<br><i>Tarik pin hijau ini ke lokasi rumah pesakit</i>`);
  }

  if (destMarker) {
    destMarker.setLatLng(state.destinationCoords);
    destMarker.setPopupContent(`<b>Hospital / Destinasi Tujuan:</b><br>${state.destinationName}`);
  }

  fetchRealDrivingRoute(state.originCoords, state.pickupCoords, state.destinationCoords);
}


// Map Controls: Layer Switcher, Autocomplete Search, Fullscreen Expand
function initMapControls() {
  // Layer Switcher Buttons
  const layerBtns = document.querySelectorAll('.map-layer-btn');
  layerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      layerBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const layerKey = btn.dataset.layer;
      const tileUrl = mapTileLayers[layerKey] || mapTileLayers.google_streets;

      if (currentTileLayer) {
        map.removeLayer(currentTileLayer);
      }
      currentTileLayer = L.tileLayer(tileUrl, {
        maxZoom: 20,
        subdomains: layerKey.startsWith('google') ? ['mt0', 'mt1', 'mt2', 'mt3'] : ['a', 'b', 'c']
      }).addTo(map);

      // Keep markers and route on top
      routePolyline.bringToFront();
      originMarker.bringToFront();
      destMarker.bringToFront();
    });
  });

  // Map Expand / Collapse Button
  const expandBtn = document.getElementById('toggleMapExpandBtn');
  const mapContainer = document.getElementById('mapContainer');
  const expandText = document.getElementById('expandBtnText');

  expandBtn.addEventListener('click', () => {
    playClickSound();
    const isExpanded = mapContainer.classList.toggle('expanded');
    expandText.textContent = isExpanded ? 'Kecilkan' : 'Besarkan';
    setTimeout(() => {
      map.invalidateSize();
    }, 320);
  });

  // Map Search with Live Autocomplete
  const searchInput = document.getElementById('mapSearchInput');
  const searchDropdown = document.getElementById('searchResultsDropdown');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  let debounceTimer = null;

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    clearSearchBtn.style.display = val ? 'flex' : 'none';

    if (val.length < 2) {
      searchDropdown.style.display = 'none';
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        // Search bias near Kelantan / Malaysia
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(val)}&limit=6&lat=${state.originCoords[0]}&lon=${state.originCoords[1]}`);
        const data = await res.json();

        if (data && data.features && data.features.length > 0) {
          searchDropdown.innerHTML = '';
          data.features.forEach(feat => {
            const prop = feat.properties;
            const coords = feat.geometry.coordinates; // [lng, lat]
            const title = prop.name || prop.street || 'Lokasi';
            const subtitle = [prop.street, prop.district, prop.city || prop.county, prop.state, prop.country]
              .filter(Boolean)
              .join(', ');

            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
              <span style="font-size: 1.1rem;">📍</span>
              <div>
                <strong style="color:#FFF;">${title}</strong><br>
                <small style="color:var(--text-sub); font-size:0.72rem;">${subtitle}</small>
              </div>
            `;

            item.addEventListener('click', () => {
              playClickSound();
              searchInput.value = title;
              searchDropdown.style.display = 'none';

              const lat = coords[1];
              const lng = coords[0];

              state.destinationName = `${title} (${prop.city || prop.state || 'Malaysia'})`;
              document.getElementById('destinationSelect').value = 'custom';
              document.getElementById('customDestGroup').style.display = 'block';
              document.getElementById('customDestInput').value = state.destinationName;

              map.flyTo([lat, lng], 14, { duration: 1.2 });
              setExactDestination(lat, lng, false);
            });

            searchDropdown.appendChild(item);
          });
          searchDropdown.style.display = 'block';
        } else {
          searchDropdown.style.display = 'none';
        }
      } catch (err) {
        console.warn('Geocoding search failed:', err);
      }
    }, 280);
  });

  clearSearchBtn.addEventListener('click', () => {
    playClickSound();
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchDropdown.style.display = 'none';
  });

  // Close search dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.map-search-wrapper')) {
      searchDropdown.style.display = 'none';
    }
  });
}

// Compute distance via Haversine
function computeHaversineDistance(c1, c2) {
  const R = 6371; // Earth radius in km
  const dLat = (c2[0] - c1[0]) * Math.PI / 180;
  const dLon = (c2[1] - c1[1]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(c1[0] * Math.PI / 180) * Math.cos(c2[0] * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* =========================================================================
   9. Navigation Tabs Controller (Top & Frosted Bottom Dock)
   ========================================================================= */
function initNavigationTabs() {
  const tabs = document.querySelectorAll('.tab-btn, .dock-tab-btn');
  const sections = document.querySelectorAll('.view-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      playClickSound();
      const targetId = tab.dataset.tab;

      // Sync active state across both top nav tabs and bottom dock tabs
      tabs.forEach(t => {
        if (t.dataset.tab === targetId) {
          t.classList.add('active');
        } else {
          t.classList.remove('active');
        }
      });

      sections.forEach(s => {
        s.classList.remove('active');
        if (s.id === targetId) {
          s.classList.add('active');
        }
      });

      // If switching back to calculator map, trigger leaflet resize
      if (targetId === 'calculator-view' && map) {
        setTimeout(() => map.invalidateSize(), 200);
      }

      // Hide or show calculator-specific elements
      const isCalc = targetId === 'calculator-view';
      const stepper = document.getElementById('calcConnectedStepper');
      const segmentedSwitch = document.querySelector('.segmented-mode-container');
      if (stepper) stepper.style.display = isCalc ? 'block' : 'none';
      if (segmentedSwitch) segmentedSwitch.style.display = isCalc ? 'block' : 'none';
    });
  });
}

/* =========================================================================
   Segmented Mode Switcher: [ Calculator ] [ Map View ]
   ========================================================================= */
function initSegmentedModeSwitch() {
  const btnCalc = document.getElementById('btnModeCalc');
  const btnMap = document.getElementById('btnModeMap');
  const calcContent = document.getElementById('calculatorModeContent');
  const mapContent = document.getElementById('mapModeContent');
  const locationCard = document.getElementById('section-location');

  if (btnCalc && btnMap) {
    btnCalc.addEventListener('click', () => {
      playClickSound();
      btnCalc.classList.add('active');
      btnMap.classList.remove('active');
      btnCalc.setAttribute('aria-selected', 'true');
      btnMap.setAttribute('aria-selected', 'false');

      if (calcContent) calcContent.style.display = 'block';
      if (mapContent) mapContent.style.display = 'none';

      if (locationCard) {
        locationCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    btnMap.addEventListener('click', () => {
      playClickSound();
      btnMap.classList.add('active');
      btnCalc.classList.remove('active');
      btnMap.setAttribute('aria-selected', 'true');
      btnCalc.setAttribute('aria-selected', 'false');

      if (calcContent) calcContent.style.display = 'none';
      if (mapContent) mapContent.style.display = 'block';

      if (map) {
        setTimeout(() => {
          map.invalidateSize();
          if (routePolyline) {
            map.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });
          }
        }, 120);
      }
    });
  }
}

/* =========================================================================
   Multi-Step Calculator Controller & Page Switcher
   ========================================================================= */
const CALC_STEPS = [
  { step: 1, icon: '📍', title: 'Lokasi & Kiraan Jarak (KM)', label: '1/5 Lokasi' },
  { step: 2, icon: '🚨', title: 'Kategori Perkhidmatan & Kecemasan', label: '2/5 Kategori' },
  { step: 3, icon: '👨‍⚕️', title: 'Bantuan Paramedik & Pegawai Perubatan', label: '3/5 Staf' },
  { step: 4, icon: '🩺', title: 'Peralatan & Bekalan Ubatan Tambahan', label: '4/5 Alatan' },
  { step: 5, icon: '💰', title: 'Semakan Kos & Jana Invois Rasmi', label: '5/5 Invois' }
];

function switchCalcStep(stepNum, shouldScroll = true) {
  stepNum = Math.max(1, Math.min(5, parseInt(stepNum, 10) || 1));
  state.calcStep = stepNum;

  // 1. Toggle Step Page containers
  const pages = document.querySelectorAll('.calc-step-page');
  pages.forEach(page => {
    const s = parseInt(page.getAttribute('data-step'), 10);
    page.classList.toggle('active', s === stepNum);
  });

  // 2. Update Connected Node Stepper
  const stepperNodes = document.querySelectorAll('.stepper-node-btn');
  stepperNodes.forEach(node => {
    const s = parseInt(node.getAttribute('data-step'), 10);
    if (s === stepNum) {
      node.classList.add('active');
      node.classList.remove('completed');
    } else if (s < stepNum) {
      node.classList.remove('active');
      node.classList.add('completed');
    } else {
      node.classList.remove('active');
      node.classList.remove('completed');
    }
  });

  // Stepper progress fill line: 10% on Step 1 up to 90% on Step 5
  const stepperFill = document.getElementById('stepperProgressFill');
  if (stepperFill) {
    const fillWidths = { 1: '10%', 2: '30%', 3: '50%', 4: '70%', 5: '90%' };
    stepperFill.style.width = fillWidths[stepNum] || '10%';
  }

  // 3. Update legacy subnav chips if present
  document.querySelectorAll('.step-chip-btn').forEach(btn => {
    const s = parseInt(btn.getAttribute('data-step'), 10);
    btn.classList.toggle('active', s === stepNum);
  });

  // 4. If Step 1, invalidate Leaflet Map size so it renders crisp and full width
  if (stepNum === 1 && map) {
    setTimeout(() => {
      map.invalidateSize();
      if (routePolyline) {
        map.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });
      }
    }, 120);
  }

  // 5. Scroll to top of the step smoothly
  if (shouldScroll) {
    const calcView = document.getElementById('calculator-view');
    if (calcView) {
      const headerOffset = window.innerWidth <= 768 ? 90 : 60;
      const elPos = calcView.getBoundingClientRect().top + window.pageYOffset - headerOffset;
      window.scrollTo({ top: Math.max(0, elPos), behavior: 'smooth' });
    }
  }
}

function initMultiStepCalculator() {
  // 1. Connected Stepper Node Button Clicks
  const stepperNodes = document.querySelectorAll('.stepper-node-btn');
  stepperNodes.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      const step = btn.getAttribute('data-step');
      if (step) switchCalcStep(step);
    });
  });

  // 2. Legacy Subnav Step Chip Clicks
  const stepChips = document.querySelectorAll('.step-chip-btn');
  stepChips.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      const step = btn.getAttribute('data-step');
      if (step) switchCalcStep(step);
    });
  });

  // 3. Next Step Buttons
  const nextBtns = document.querySelectorAll('.step-btn-next');
  nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      const nextStep = btn.getAttribute('data-next');
      if (nextStep) switchCalcStep(nextStep);
    });
  });

  // 4. Previous Step Buttons
  const prevBtns = document.querySelectorAll('.step-btn-prev');
  prevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      const prevStep = btn.getAttribute('data-prev');
      if (prevStep) switchCalcStep(prevStep);
    });
  });

  // 5. Restart / Recalculate Button on Step 5
  const stepRestartBtn = document.getElementById('stepRestartBtn');
  if (stepRestartBtn) {
    stepRestartBtn.addEventListener('click', () => {
      playClickSound();
      switchCalcStep(1);
    });
  }

  // 7. Persistent Mini Bar Jump Button -> Jumps straight to Step 5 (Invoice & Summary)!
  const miniBarJumpBtn = document.getElementById('miniBarJumpToSummaryBtn');
  if (miniBarJumpBtn) {
    miniBarJumpBtn.addEventListener('click', () => {
      playClickSound();
      switchCalcStep(5);
    });
  }

  // 8. Global Back to Top Button
  const backToTopBtn = document.getElementById('backToTopBtn');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
      playClickSound();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    }, { passive: true });
  }

  // Initial step setup (Step 1 without scrolling)
  switchCalcStep(1, false);
}

/* =========================================================================
   10. Modals & Printable Official Invoice Generator
   ========================================================================= */
function initModals() {
  const invoiceModal = document.getElementById('invoiceModal');
  const generateInvoiceBtn = document.getElementById('generateInvoiceBtn');
  const closeInvoiceModalBtn = document.getElementById('closeInvoiceModalBtn');
  const printInvoiceBtn = document.getElementById('printInvoiceBtn');
  const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');

  const sosEmergencyBtn = document.getElementById('sosEmergencyBtn');
  const sosModal = document.getElementById('sosModal');
  const closeSosModalBtn = document.getElementById('closeSosModalBtn');
  const dispatchSosNowBtn = document.getElementById('dispatchSosNowBtn');

  // Open Invoice Modal
  generateInvoiceBtn.addEventListener('click', () => {
    playSuccessChime();
    populateInvoice();
    invoiceModal.classList.add('active');
  });

  closeInvoiceModalBtn.addEventListener('click', () => {
    playClickSound();
    invoiceModal.classList.remove('active');
  });

  printInvoiceBtn.addEventListener('click', () => {
    playClickSound();
    window.print();
  });

  confirmPaymentBtn.addEventListener('click', async () => {
    playSuccessChime();
    const invNum = document.getElementById('invNumber').textContent;
    const grandTotal = parseFloat(document.getElementById('grandTotalDisplay').textContent);
    invoiceModal.classList.remove('active');

    // Add to local state
    const newOrder = {
      id: invNum,
      date: new Date().toLocaleDateString('ms-MY') + ' ' + new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }),
      route: `${state.currentHub.shortName} ➔ ${state.destinationName}`,
      distanceKm: state.distanceKm,
      assistance: state.selectedAssistance.name.split(' (')[0],
      equipment: getSelectedEquipSummary(),
      total: grandTotal,
      status: 'Dispatched'
    };
    state.recentOrders.unshift(newOrder);
    renderRecentOrdersTable();

    // Persist to Supabase if configured
    if (isSupabaseConfigured()) {
      const distance = Math.max(1, state.distanceKm);
      const extraKm = Math.max(0, distance - 25.0);
      const ratePerKm = state.isDieselSurge ? BASE_SETTINGS.extraKmRateDiesel : BASE_SETTINGS.extraKmRateNormal;
      const extraKmCost = extraKm * ratePerKm;

      let equipTotal = 0;
      ADDITIONAL_EQUIPMENTS.forEach(eq => {
        const qty = state.equipmentQuantities[eq.id] || 0;
        if (qty > 0) equipTotal += eq.price * qty;
      });

      const res = await insertBookingToSupabase({
        invoiceNumber: invNum,
        hubId: state.currentHub.id,
        hubName: state.currentHub.name,
        originName: state.currentHub.name,
        destinationName: state.destinationName,
        distanceKm: state.distanceKm,
        tripType: state.selectedTripType.name,
        baseFare: state.selectedTripType.baseFare,
        extraKmCost: extraKmCost,
        assistancePackage: state.selectedAssistance.name,
        assistanceCost: state.selectedAssistance.price,
        equipmentItems: getSelectedEquipSummary(),
        equipmentCost: equipTotal,
        miscFee: state.includeMiscFee ? BASE_SETTINGS.defaultLainLainCaj : 0.00,
        totalFare: grandTotal,
        isDieselSurge: state.isDieselSurge,
        plateNumber: state.currentHub.ambulancePlate,
        driverName: state.currentHub.primaryDriver,
        contactPhone: state.currentHub.contactNumber,
        status: 'Dispatched'
      });

      if (res.success) {
        alert(`✅ Pesanan ${invNum} Berjaya Disahkan & Disegerakkan ke Supabase Cloud (Live)!`);
      } else {
        alert(`✅ Pesanan ${invNum} Disahkan secara tempatan! (Supabase: ${res.error || 'Offline'})`);
      }
    } else {
      alert(`✅ Pesanan ${invNum} Berjaya Disahkan! Pemandu (${state.currentHub.primaryDriver}) bersiap sedia untuk digerakkan.`);
    }
  });

  // Emergency SOS Modal
  sosEmergencyBtn.addEventListener('click', () => {
    playEmergencyAlertSiren();
    sosModal.classList.add('active');
  });

  closeSosModalBtn.addEventListener('click', () => {
    playClickSound();
    sosModal.classList.remove('active');
  });

  dispatchSosNowBtn.addEventListener('click', () => {
    playSuccessChime();
    alert('🚨 Isyarat Kecemasan SOS Telah Dihantar! Ambulans Al-Farhain (VPQ 7606) sedang digerakkan terus ke koordinat anda.');
    sosModal.classList.remove('active');
  });

  // WhatsApp Share
  document.getElementById('shareWhatsAppBtn').addEventListener('click', () => {
    playClickSound();
    const total = document.getElementById('grandTotalDisplay').textContent;
    const msg = `*AL-FARHAIN AMC AMBULANS - TEMPAHAN TRIP*%0A` +
      `🏢 Pangkalan: ${state.currentHub.name} (${state.currentHub.ambulancePlate})%0A` +
      `🏠 Ambil Pesakit: ${state.pickupAddress}%0A` +
      `🏥 Hospital Destinasi: ${state.destinationName}%0A` +
      `🛣️ Jarak: ${state.distanceKm.toFixed(1)} KM (Pangkalan ➔ Rumah: ${state.leg1Km.toFixed(1)} KM | Rumah ➔ Hospital: ${state.leg2Km.toFixed(1)} KM)%0A` +
      `🚨 Kategori: ${state.selectedTripType.name}%0A` +
      `👨‍⚕️ Pakej Staf: ${state.selectedAssistance.name}%0A` +
      `🧪 Peralatan: ${getSelectedEquipSummary()}%0A` +
      `*💰 JUMLAH KOS ANGGARAN: RM ${total}*%0A` +
      `📞 Hotline 24 Jam: 013-9147606`;
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  });

  // Direct Call Button
  document.getElementById('directCallDriverBtn').addEventListener('click', () => {
    playClickSound();
    window.location.href = 'tel:0139147606';
  });

  // Mobile QR / Device Modal
  const openMobileModalBtn = document.getElementById('openMobileModalBtn');
  const mobileModal = document.getElementById('mobileModal');
  const closeMobileModalBtn = document.getElementById('closeMobileModalBtn');
  const closeMobileModalBtn2 = document.getElementById('closeMobileModalBtn2');

  if (openMobileModalBtn && mobileModal) {
    openMobileModalBtn.addEventListener('click', () => {
      playClickSound();
      mobileModal.classList.add('active');
    });
    [closeMobileModalBtn, closeMobileModalBtn2].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          playClickSound();
          mobileModal.classList.remove('active');
        });
      }
    });
  }
}

function getSelectedEquipSummary() {
  const items = [];
  ADDITIONAL_EQUIPMENTS.forEach(eq => {
    const qty = state.equipmentQuantities[eq.id];
    if (qty > 0) items.push(`${eq.name.split(' (')[0]} (${qty})`);
  });
  return items.length > 0 ? items.join(', ') : 'Tiada';
}

function populateInvoice() {
  const randomId = Math.floor(1000 + Math.random() * 9000);
  document.getElementById('invNumber').textContent = `INV-AMC-${randomId}`;
  document.getElementById('invDate').textContent = new Date().toLocaleDateString('ms-MY') + ' ' + new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('invPlateNumber').textContent = state.currentHub.ambulancePlate;
  document.getElementById('invDriverName').textContent = state.currentHub.primaryDriver;
  document.getElementById('invBranchName').textContent = state.currentHub.name;
  document.getElementById('invOrigin').textContent = `${state.currentHub.name} (Pangkalan)`;
  document.getElementById('invDestination').textContent = `${state.pickupAddress} ➔ ${state.destinationName}`;
  document.getElementById('invDistanceKm').textContent = `${state.distanceKm.toFixed(1)} KM (Pangkalan ➔ Rumah: ${state.leg1Km.toFixed(1)} KM, Rumah ➔ Hospital: ${state.leg2Km.toFixed(1)} KM)`;

  const tbody = document.getElementById('invTableBody');
  tbody.innerHTML = '';

  const distance = Math.max(1, state.distanceKm);
  const extraKm = Math.max(0, distance - 25.0);
  const ratePerKm = state.isDieselSurge ? BASE_SETTINGS.extraKmRateDiesel : BASE_SETTINGS.extraKmRateNormal;
  const extraKmCost = extraKm * ratePerKm;

  // Row 1: Base Fare
  addInvoiceRow(tbody, `Tambang Jarak Asas (Sehingga 25 KM) - ${state.selectedTripType.name}`, '1 Perjalanan', state.selectedTripType.baseFare);

  // Row 2: Extra Distance
  if (extraKm > 0) {
    addInvoiceRow(tbody, `Caj Lebihan Jarak Melebihi 25 KM (Kadar RM ${ratePerKm.toFixed(2)}/KM)`, `${extraKm.toFixed(1)} KM`, extraKmCost);
  }

  // Row 3: Staff Assistance
  if (state.selectedAssistance.price > 0) {
    addInvoiceRow(tbody, `Pakej Pegawai Pengiring: ${state.selectedAssistance.name}`, '1 Pakej', state.selectedAssistance.price);
  }

  // Row 4: Equipments
  ADDITIONAL_EQUIPMENTS.forEach(eq => {
    const qty = state.equipmentQuantities[eq.id] || 0;
    if (qty > 0) {
      addInvoiceRow(tbody, `Peralatan Tambahan: ${eq.name}`, `${qty} ${eq.unit}`, eq.price * qty);
    }
  });

  // Row 5: Misc charges
  if (state.includeMiscFee) {
    addInvoiceRow(tbody, 'Lain-lain Caj Operasi / Perkhidmatan Pengurusan', '1 Caj', BASE_SETTINGS.defaultLainLainCaj);
  }

  const grandTotal = document.getElementById('grandTotalDisplay').textContent;
  document.getElementById('invGrandTotal').textContent = `RM ${grandTotal}`;
}

function addInvoiceRow(tbody, name, qty, total) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><strong>${name}</strong></td>
    <td>${qty}</td>
    <td style="text-align: right; font-weight: 700;">RM ${total.toFixed(2)}</td>
  `;
  tbody.appendChild(tr);
}

/* =========================================================================
   11. Driver Cockpit HUD Controller
   ========================================================================= */
function initDriverHUD() {
  const nextStageBtn = document.getElementById('nextStageBtn');
  const stageSteps = document.querySelectorAll('.stage-step');
  const missionPill = document.getElementById('hudMissionPill');

  const stageLabels = [
    '1. Pesanan Diterima (Dispatched)',
    '2. Menuju Lokasi Pesakit (En Route)',
    '3. Tiba di Lokasi Pesakit (On Scene)',
    '4. Membawa Pesakit ke Hospital (In Transit)',
    '5. Tiba di Destinasi & Selesai (Arrived)'
  ];

  function updateStage(newStage) {
    state.driverStage = newStage;
    stageSteps.forEach((step, idx) => {
      const stepNum = idx + 1;
      step.classList.remove('active', 'completed');
      if (stepNum < newStage) {
        step.classList.add('completed');
      } else if (stepNum === newStage) {
        step.classList.add('active');
      }
    });

    missionPill.textContent = stageLabels[newStage - 1].toUpperCase();

    if (newStage === 5) {
      nextStageBtn.innerHTML = '<span>🔄</span> Misi Selesai - Reset Status';
    } else {
      nextStageBtn.innerHTML = '<span>⏩</span> Kemaskini Status Seterusnya';
    }
  }

  nextStageBtn.addEventListener('click', () => {
    playSuccessChime();
    let next = state.driverStage + 1;
    if (next > 5) next = 1;
    updateStage(next);
  });

  stageSteps.forEach((step, idx) => {
    step.addEventListener('click', () => {
      playClickSound();
      updateStage(idx + 1);
    });
  });
}

/* =========================================================================
   12. Branch Management & Analytics Table
   ========================================================================= */
function initAdminDashboard() {
  renderRecentOrdersTable();
}

function renderRecentOrdersTable() {
  const tbody = document.getElementById('recentTripsTableBody');
  tbody.innerHTML = '';

  state.recentOrders.forEach(ord => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span style="font-family: var(--font-mono); font-weight: 800; color: var(--amc-blue);">${ord.id}</span></td>
      <td style="font-size: 0.78rem; color: var(--text-dim);">${ord.date}</td>
      <td><strong>${ord.route}</strong></td>
      <td>${ord.distanceKm} KM</td>
      <td>${ord.assistance}</td>
      <td style="font-size: 0.75rem; color: var(--text-sub);">${ord.equipment}</td>
      <td style="font-family: var(--font-heading); font-weight: 800; color: var(--text-main);">RM ${ord.total.toFixed(2)}</td>
      <td>
        <span style="background: var(--amc-emerald-light); color: var(--amc-emerald); padding: 0.22rem 0.6rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; border: 1px solid rgba(5,150,105,0.25);">
          ${ord.status}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* =========================================================================
   13. Catalog & Search
   ========================================================================= */
function initCatalog() {
  const tbody = document.getElementById('catalogTableBody');
  const searchInput = document.getElementById('catalogSearchInput');

  // Curated master items from Stock_Services_Pricing_Ambulan.xlsx
  const masterCatalog = [
    { cat: 'Perkhidmatan Ambulan', name: 'AMBULANS - EMERGENCY (Kadar Asas <25 KM)', code: 'AMB-EMG', price: 250.00 },
    { cat: 'Perkhidmatan Ambulan', name: 'AMBULANS - NON EMERGENCY (Kadar Asas <25 KM)', code: 'AMB-NEMG', price: 250.00 },
    { cat: 'Perkhidmatan Ambulan', name: 'AMBULANS - EMERGENCY IN HOUSE', code: 'AMB-INH', price: 350.00 },
    { cat: 'Perkhidmatan Ambulan', name: 'AMBULANS - AED CRITICAL RESUSCITATION', code: 'AMB-AED', price: 500.00 },
    { cat: 'Perkhidmatan Ambulan', name: 'AMBULANS - JARAK MELEBIHI 25 KM (Per KM)', code: 'AMB-KM', price: 3.00 },
    { cat: 'Bantuan Paramedik', name: 'AMBULANS - PAKEJ C.A (Care / Clinical Assistant)', code: 'STF-CA', price: 100.00 },
    { cat: 'Bantuan Paramedik', name: 'AMBULANS - PAKEJ M.A (Medical Assistant / PPP)', code: 'STF-MA', price: 200.00 },
    { cat: 'Bantuan Paramedik', name: 'AMBULANS - PAKEJ DR (Pegawai Perubatan / Doctor Escort)', code: 'STF-DR', price: 400.00 },
    { cat: 'Peralatan Tambahan', name: 'Oxygen Tank Supply (Silinder Oksigen Perubatan)', code: 'EQP-O2', price: 50.00 },
    { cat: 'Peralatan Tambahan', name: 'Med Kit & First Aid Emergency', code: 'EQP-MED', price: 20.00 },
    { cat: 'Peralatan Tambahan', name: 'Transport Incubator (Inkubator Pengangkutan Bayi)', code: 'EQP-INC', price: 250.00 },
    { cat: 'Peralatan Tambahan', name: 'Infusion Pumps & Portable Ventilator', code: 'EQP-VENT', price: 150.00 },
    { cat: 'Peralatan Tambahan', name: 'Obstetric / Maternity Kit (Kit Bersalin Kecemasan)', code: 'EQP-MAT', price: 80.00 },
    { cat: 'Peralatan Tambahan', name: 'Portable Electric Suction Unit', code: 'EQP-SUCT', price: 30.00 },
    { cat: 'Peralatan Tambahan', name: 'Spinal Board Imobilisasi & Cervical Collar', code: 'EQP-SPIN', price: 40.00 },
    { cat: 'Prosedur & Rawatan', name: 'NASAL ASPIRATE (SUCTION/SEDUT KAHAK)', code: '100836', price: 60.00 },
    { cat: 'Prosedur & Rawatan', name: 'REFER HOSPITAL & REPORT FORM', code: 'REF-HOSP', price: 10.00 },
    { cat: 'Ujian Makmal Pantas', name: 'GLUCOMATE (Ujian Gula Darah Strip)', code: '122236', price: 45.00 },
    { cat: 'Ujian Makmal Pantas', name: 'BLOOD GROUP TEST (ABO & RhD Grouping)', code: '100612A', price: 25.00 }
  ];

  function renderRows(items) {
    tbody.innerHTML = '';
    items.forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span style="background: var(--amc-blue-light); color: var(--amc-blue); padding: 0.18rem 0.55rem; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">${it.cat}</span></td>
        <td><strong>${it.name}</strong></td>
        <td><code style="color: var(--text-dim);">${it.code}</code></td>
        <td style="font-family: var(--font-heading); font-weight: 800; color: var(--text-main);">RM ${it.price.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderRows(masterCatalog);

  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = masterCatalog.filter(it => 
      it.name.toLowerCase().includes(q) || 
      it.cat.toLowerCase().includes(q) || 
      it.code.toLowerCase().includes(q)
    );
    renderRows(filtered);
  });
}

/* =========================================================================
   14. AI FAQ Assistant
   ========================================================================= */
function initFAQAssistant() {
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');
  const quickFaqList = document.getElementById('quickFaqList');

  // Render quick FAQ clickable pills
  quickFaqList.innerHTML = '';
  FAQ_DATABASE.forEach(faq => {
    const pill = document.createElement('button');
    pill.className = 'secondary-btn';
    pill.style.justifyContent = 'flex-start';
    pill.style.textAlign = 'left';
    pill.style.padding = '0.65rem 0.9rem';
    pill.innerHTML = `<span style="color: var(--amc-cyan); font-weight: 700;">Q:</span> ${faq.q}`;

    pill.addEventListener('click', () => {
      playClickSound();
      appendUserMessage(faq.q);
      setTimeout(() => {
        appendBotMessage(faq.a);
      }, 300);
    });

    quickFaqList.appendChild(pill);
  });

  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    playClickSound();
    appendUserMessage(text);
    chatInput.value = '';

    setTimeout(() => {
      const lower = text.toLowerCase();
      let matchedAnswer = null;

      // Smart semantic keyword matching
      for (const faq of FAQ_DATABASE) {
        if (lower.includes('harga') || lower.includes('kira') || lower.includes('kos') || lower.includes('tambang')) {
          matchedAnswer = FAQ_DATABASE[0].a;
          break;
        } else if (lower.includes('jarak') || lower.includes('km') || lower.includes('hrpz') || lower.includes('kok lanas')) {
          matchedAnswer = FAQ_DATABASE[1].a;
          break;
        } else if (lower.includes('ma') || lower.includes('ca') || lower.includes('doktor') || lower.includes('staf') || lower.includes('paramedik')) {
          matchedAnswer = FAQ_DATABASE[2].a;
          break;
        } else if (lower.includes('discaj') || lower.includes('pulang') || lower.includes('bukan kecemasan')) {
          matchedAnswer = FAQ_DATABASE[3].a;
          break;
        } else if (lower.includes('oksigen') || lower.includes('ventilator') || lower.includes('alat')) {
          matchedAnswer = FAQ_DATABASE[4].a;
          break;
        } else if (lower.includes('plat') || lower.includes('pemandu') || lower.includes('kereta')) {
          matchedAnswer = FAQ_DATABASE[6].a;
          break;
        } else if (lower.includes('bayar') || lower.includes('tunai') || lower.includes('online') || lower.includes('fpx')) {
          matchedAnswer = FAQ_DATABASE[7].a;
          break;
        }
      }

      if (!matchedAnswer) {
        matchedAnswer = `Terima kasih atas pertanyaan anda. Untuk perkhidmatan ambulan Al-Farhain AMC, tambang asas adalah RM 250 untuk perjalanan sehingga 25 KM pertama, dan RM 3.00/KM bagi KM seterusnya. Anda juga boleh berhubung terus dengan Bilik Gerakan 24 Jam di talian 013-914 7606 untuk bantuan segera.`;
      }

      appendBotMessage(matchedAnswer);
    }, 400);
  }

  sendChatBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  function appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-bubble user';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendBotMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-bubble bot';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    playSuccessChime();
  }
}

/* =========================================================================
   15. Supabase Cloud Database Integration & Realtime Sync
   ========================================================================= */
function initSupabaseIntegration() {
  const supabaseConnectBtn = document.getElementById('supabaseConnectBtn');
  const supabaseModal = document.getElementById('supabaseModal');
  const closeSupabaseModalBtn = document.getElementById('closeSupabaseModalBtn');
  const supabaseUrlInput = document.getElementById('supabaseUrlInput');
  const supabaseKeyInput = document.getElementById('supabaseKeyInput');
  const testSupabaseBtn = document.getElementById('testSupabaseBtn');
  const saveSupabaseBtn = document.getElementById('saveSupabaseBtn');
  const supabaseTestResult = document.getElementById('supabaseTestResult');
  const copySqlBtn = document.getElementById('copySqlBtn');
  const supabaseDot = document.getElementById('supabaseDot');
  const supabaseStatusText = document.getElementById('supabaseStatusText');

  function updateStatusIndicator() {
    const isConn = isSupabaseConfigured();
    if (isConn) {
      supabaseDot.style.backgroundColor = '#10B981';
      supabaseDot.style.boxShadow = '0 0 10px #10B981';
      supabaseStatusText.textContent = 'Supabase: Aktif';
    } else {
      supabaseDot.style.backgroundColor = '#F59E0B';
      supabaseDot.style.boxShadow = '0 0 10px #F59E0B';
      supabaseStatusText.textContent = 'Sambung Supabase';
    }
  }

  updateStatusIndicator();

  // Populate inputs with stored config
  const creds = getStoredSupabaseConfig();
  if (creds.url) supabaseUrlInput.value = creds.url;
  if (creds.anonKey) supabaseKeyInput.value = creds.anonKey;

  // Open Supabase Modal
  supabaseConnectBtn.addEventListener('click', () => {
    playClickSound();
    const current = getStoredSupabaseConfig();
    if (current.url) supabaseUrlInput.value = current.url;
    if (current.anonKey) supabaseKeyInput.value = current.anonKey;
    supabaseModal.classList.add('active');
  });

  closeSupabaseModalBtn.addEventListener('click', () => {
    playClickSound();
    supabaseModal.classList.remove('active');
  });

  // Test Connection
  testSupabaseBtn.addEventListener('click', async () => {
    playClickSound();
    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();

    if (!url || !key) {
      supabaseTestResult.style.display = 'block';
      supabaseTestResult.style.background = 'rgba(239, 68, 68, 0.15)';
      supabaseTestResult.style.border = '1px solid rgba(239, 68, 68, 0.4)';
      supabaseTestResult.style.color = '#FCA5A5';
      supabaseTestResult.innerHTML = '⚠️ Sila masukkan Project URL dan Anon Key terlebih dahulu.';
      return;
    }

    testSupabaseBtn.disabled = true;
    testSupabaseBtn.innerHTML = '<span>⏳</span> Menguji...';

    const test = await testSupabaseConnection(url, key);
    testSupabaseBtn.disabled = false;
    testSupabaseBtn.innerHTML = '<span>🔍</span> Uji Sambungan';

    supabaseTestResult.style.display = 'block';
    if (test.success) {
      playSuccessChime();
      supabaseTestResult.style.background = 'rgba(16, 185, 129, 0.15)';
      supabaseTestResult.style.border = '1px solid rgba(16, 185, 129, 0.4)';
      supabaseTestResult.style.color = '#86EFAC';
      supabaseTestResult.innerHTML = `<strong>✅ Berjaya!</strong> ${test.message}`;
    } else {
      supabaseTestResult.style.background = 'rgba(239, 68, 68, 0.15)';
      supabaseTestResult.style.border = '1px solid rgba(239, 68, 68, 0.4)';
      supabaseTestResult.style.color = '#FCA5A5';
      supabaseTestResult.innerHTML = `<strong>❌ Gagal:</strong> ${test.message}`;
    }
  });

  // Save Configuration
  saveSupabaseBtn.addEventListener('click', async () => {
    playClickSound();
    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();

    if (!url || !key) {
      alert('Sila masukkan Project URL dan Anon Key.');
      return;
    }

    saveSupabaseConfig(url, key);
    updateStatusIndicator();
    playSuccessChime();

    alert('✅ Konfigurasi Supabase Disimpan! Memulakan penyegerakan tempahan...');
    supabaseModal.classList.remove('active');

    // Fetch live bookings from Supabase
    syncSupabaseBookings();

    // Start realtime subscription
    subscribeToRealtimeBookings(
      (newBooking) => {
        playCalculateChime();
        const formatted = {
          id: newBooking.invoice_number,
          date: new Date(newBooking.created_at).toLocaleDateString('ms-MY') + ' ' + new Date(newBooking.created_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }),
          route: `${newBooking.origin_name} ➔ ${newBooking.destination_name}`,
          distanceKm: Number(newBooking.distance_km),
          assistance: newBooking.assistance_package,
          equipment: newBooking.equipment_items || 'Tiada',
          total: Number(newBooking.total_fare),
          status: newBooking.status
        };
        if (!state.recentOrders.some(o => o.id === formatted.id)) {
          state.recentOrders.unshift(formatted);
          renderRecentOrdersTable();
        }
      },
      (updatedBooking) => {
        const item = state.recentOrders.find(o => o.id === updatedBooking.invoice_number);
        if (item) {
          item.status = updatedBooking.status;
          renderRecentOrdersTable();
        }
      }
    );
  });

  // Copy SQL script button
  copySqlBtn.addEventListener('click', () => {
    playClickSound();
    const sqlText = `-- Rujuk fail supabase_schema.sql dalam direktori projek anda untuk skrip lengkap!`;
    navigator.clipboard.writeText(sqlText);
    copySqlBtn.textContent = '✅ Disalin!';
    setTimeout(() => {
      copySqlBtn.textContent = '📋 Salin SQL';
    }, 2000);
  });

  // Initial Sync if already configured
  if (isSupabaseConfigured()) {
    syncSupabaseBookings();
  }
}

async function syncSupabaseBookings() {
  const remoteBookings = await fetchBookingsFromSupabase(15);
  if (remoteBookings && remoteBookings.length > 0) {
    const mapped = remoteBookings.map(b => ({
      id: b.invoice_number,
      date: new Date(b.created_at).toLocaleDateString('ms-MY') + ' ' + new Date(b.created_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }),
      route: `${b.origin_name} ➔ ${b.destination_name}`,
      distanceKm: Number(b.distance_km),
      assistance: b.assistance_package,
      equipment: b.equipment_items || 'Tiada',
      total: Number(b.total_fare),
      status: b.status
    }));

    mapped.forEach(mb => {
      if (!state.recentOrders.some(ro => ro.id === mb.id)) {
        state.recentOrders.push(mb);
      }
    });
    renderRecentOrdersTable();
  }
}

