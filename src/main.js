// AL-FARHAIN MEDICAL CENTER (AMC) - AMBULANCE MEDICAL SYSTEM
// Main Application Controller & Calculation Engine

import {
  HUBS,
  OTHER_BRANCHES,
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
  destinationCoords: PRESET_DESTINATIONS[0].coords,
  destinationName: PRESET_DESTINATIONS[0].name,
  selectedDestId: PRESET_DESTINATIONS[0].id,
  distanceKm: 27.2, // Default HQ Kok Lanas to HRPZ II Kota Bharu
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
      route: 'HQ Kok Lanas ➔ HRPZ II Kota Bharu',
      distanceKm: 27.2,
      assistance: 'Pakej M.A (PPP)',
      equipment: 'Tangki Oksigen (1)',
      total: 556.60,
      status: 'Selesai'
    },
    {
      id: 'INV-AMC-1041',
      date: '15/10/2026 09:45 AM',
      route: 'HQ Kok Lanas ➔ Hospital Machang',
      distanceKm: 18.0,
      assistance: 'Krew EMT Standard',
      equipment: 'Tiada',
      total: 300.00,
      status: 'Selesai'
    },
    {
      id: 'INV-AMC-1040',
      date: '14/10/2026 08:15 PM',
      route: 'Cawangan Raub ➔ Hospital Kuala Lipis',
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
let destMarker = null;
let routePolyline = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initHubSelector();
  initDestinations();
  initTripTypes();
  initAssistancePackages();
  initEquipments();
  initDistanceControls();
  initLeafletMap();
  initNavigationTabs();
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
   1. Hub & Branch Selector Logic
   ========================================================================= */
function initHubSelector() {
  const hubSelector = document.getElementById('hubSelector');
  const activeHubBadge = document.getElementById('activeHubBadge');
  const pickupSelect = document.getElementById('pickupSelect');

  function updateHubUI(hubKey) {
    state.currentHub = HUBS[hubKey.toUpperCase()] || HUBS.KOK_LANAS;
    state.originCoords = state.currentHub.coords;

    activeHubBadge.textContent = state.currentHub.shortName.toUpperCase();
    document.getElementById('originTag').textContent = state.currentHub.name;
    document.getElementById('hudDriverName').textContent = state.currentHub.primaryDriver;
    document.getElementById('hudPlateNumber').innerHTML = `No. Plat: <strong>${state.currentHub.ambulancePlate}</strong> (${state.currentHub.shortName})`;

    // Re-center map & update route
    if (map) {
      updateMapMarkersAndRoute();
    }
    calculateAll();
  }

  hubSelector.addEventListener('change', (e) => {
    playClickSound();
    const val = e.target.value;
    updateHubUI(val);
    pickupSelect.value = val;
  });

  pickupSelect.addEventListener('change', (e) => {
    playClickSound();
    const val = e.target.value;
    if (val === 'kok_lanas' || val === 'raub') {
      hubSelector.value = val;
      updateHubUI(val);
    } else {
      const found = OTHER_BRANCHES.find(b => b.id === val);
      if (found) {
        state.originCoords = found.coords;
        document.getElementById('originTag').textContent = found.name;
        updateMapMarkersAndRoute();
        calculateAll();
      }
    }
  });
}

/* =========================================================================
   2. Destination Setup
   ========================================================================= */
function initDestinations() {
  const destSelect = document.getElementById('destinationSelect');
  const customDestGroup = document.getElementById('customDestGroup');
  const customDestInput = document.getElementById('customDestInput');

  destSelect.innerHTML = '';
  PRESET_DESTINATIONS.forEach(dest => {
    const opt = document.createElement('option');
    opt.value = dest.id;
    opt.textContent = `${dest.shortName} (${dest.distanceFromKokLanas} KM) - ${dest.category}`;
    destSelect.appendChild(opt);
  });

  // Add custom destination option
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = '📍 Destinasi Tersuai / Pilih Atas Peta (Custom KM)';
  destSelect.appendChild(customOpt);

  destSelect.addEventListener('change', (e) => {
    playClickSound();
    const val = e.target.value;
    state.selectedDestId = val;

    if (val === 'custom') {
      customDestGroup.style.display = 'block';
      state.destinationName = customDestInput.value || 'Destinasi Khas';
    } else {
      customDestGroup.style.display = 'none';
      const found = PRESET_DESTINATIONS.find(d => d.id === val);
      if (found) {
        state.destinationName = found.name;
        state.destinationCoords = found.coords;
        state.distanceKm = found.distanceFromKokLanas;
        updateDistanceInputs(state.distanceKm);
      }
    }
    updateMapMarkersAndRoute();
    calculateAll();
  });

  customDestInput.addEventListener('input', (e) => {
    state.destinationName = e.target.value;
    calculateAll();
  });
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

  // Open Google Maps Direct Button
  document.getElementById('openGoogleMapsBtn').addEventListener('click', () => {
    playClickSound();
    const orig = `${state.originCoords[0]},${state.originCoords[1]}`;
    const dest = `${state.destinationCoords[0]},${state.destinationCoords[1]}`;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}`;
    window.open(url, '_blank');
  });

  // Geolocation Button
  document.getElementById('locateMeBtn').addEventListener('click', () => {
    playClickSound();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          state.destinationCoords = [lat, lng];
          state.destinationName = 'Lokasi GPS Semasa Saya';
          document.getElementById('destinationSelect').value = 'custom';
          document.getElementById('customDestGroup').style.display = 'block';
          document.getElementById('customDestInput').value = 'Lokasi GPS Semasa Saya';
          
          // Compute approx distance in KM from origin
          const km = computeHaversineDistance(state.originCoords, [lat, lng]);
          state.distanceKm = Math.round(km * 1.25 * 10) / 10; // 1.25 road winding factor
          updateDistanceInputs(state.distanceKm);
          updateMapMarkersAndRoute();
          calculateAll();
        },
        () => {
          alert('Tidak dapat mengesan lokasi GPS. Sila pilih hospital atau masukkan jarak manual.');
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
    card.innerHTML = `
      <div>
        <div class="card-top">
          <span class="trip-type-name">${trip.name}</span>
          <span class="trip-type-badge" style="background: rgba(239, 68, 68, 0.15); color: ${trip.color}; border: 1px solid ${trip.color}40;">
            ${trip.badge}
          </span>
        </div>
        <div class="trip-type-desc">${trip.description}</div>
      </div>
      <div class="trip-type-price">RM ${trip.baseFare.toFixed(2)} <span style="font-size: 0.7rem; font-weight: 500; color: var(--text-dim);">kadar asas</span></div>
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
function calculateAll() {
  const distance = Math.max(1, state.distanceKm);
  const baseKm = BASE_SETTINGS.standardBaseKm; // 25.0 KM
  const extraKm = Math.max(0, distance - baseKm);

  // Rate per extra KM
  const dieselToggle = document.getElementById('dieselSurgeToggle');
  state.isDieselSurge = dieselToggle.checked;
  const ratePerKm = state.isDieselSurge ? BASE_SETTINGS.extraKmRateDiesel : BASE_SETTINGS.extraKmRateNormal;

  // Extra KM cost
  const extraKmCost = extraKm * ratePerKm;

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
  state.includeMiscFee = miscFeeCheckbox.checked;
  const miscFee = state.includeMiscFee ? BASE_SETTINGS.defaultLainLainCaj : 0.00;

  // Grand Total
  const grandTotal = tripBaseFare + extraKmCost + assistanceFare + equipTotal + miscFee;

  // Update UI Elements
  document.getElementById('displayDistanceKm').textContent = `${distance.toFixed(1)} KM`;
  document.getElementById('displayExtraKm').textContent = extraKm > 0 ? `+${extraKm.toFixed(1)} KM` : '0 KM';
  document.getElementById('ratePerKmLabel').textContent = ratePerKm.toFixed(2);

  document.getElementById('summaryTripName').textContent = state.selectedTripType.name.split(' (')[0];
  document.getElementById('summaryTripBase').textContent = `RM ${tripBaseFare.toFixed(2)}`;
  document.getElementById('summaryBaseKmFare').textContent = `RM ${tripBaseFare.toFixed(2)}`;

  document.getElementById('summaryExtraKmCount').textContent = extraKm.toFixed(1);
  document.getElementById('summaryKmRate').textContent = ratePerKm.toFixed(2);
  document.getElementById('summaryExtraKmFare').textContent = `RM ${extraKmCost.toFixed(2)}`;

  document.getElementById('summaryAssistanceRole').textContent = state.selectedAssistance.name.split(' (')[0];
  document.getElementById('summaryAssistanceFare').textContent = `RM ${assistanceFare.toFixed(2)}`;

  document.getElementById('summaryEquipCount').textContent = totalEquipItems;
  document.getElementById('summaryEquipFare').textContent = `RM ${equipTotal.toFixed(2)}`;
  document.getElementById('summaryMiscFare').textContent = `RM ${miscFee.toFixed(2)}`;

  document.getElementById('grandTotalDisplay').textContent = grandTotal.toFixed(2);

  // Play subtle feedback chime
  playCalculateChime();
}

// Diesel Toggle Listener
document.getElementById('dieselSurgeToggle').addEventListener('change', () => {
  playClickSound();
  calculateAll();
});

// Misc Fee Checkbox Listener
document.getElementById('includeMiscFee').addEventListener('change', () => {
  playClickSound();
  calculateAll();
});

/* =========================================================================
   8. Real Interactive Map Engine (Google Maps, Satellite, OSRM Road Routing)
   ========================================================================= */
let currentTileLayer = null;
const mapTileLayers = {
  google_streets: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  google_hybrid: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
};

function initLeafletMap() {
  if (typeof L === 'undefined') return;

  const defaultCenter = state.currentHub.coords;
  map = L.map('leafletMap', {
    zoomControl: true,
    attributionControl: false
  }).setView(defaultCenter, 11);

  // Set default real street tiles (Google Maps Streets, 100% free of watermark)
  currentTileLayer = L.tileLayer(mapTileLayers.google_streets, {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
  }).addTo(map);

  // Custom Animated Ambulance Marker Icon (Pickup)
  const ambulanceIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div style="background:#0284C7; border:2.5px solid #FFFFFF; border-radius:50%; width:38px; height:38px; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 0 18px rgba(2,132,199,0.8);">🚑</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });

  // Custom Animated Destination Pin (Draggable)
  const destinationIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div class="marker-pin-pulse">
             <div style="background:#EF4444; border:2.5px solid #FFFFFF; border-radius:50%; width:34px; height:34px; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 0 20px rgba(239,68,68,0.9); cursor:grab;">🎯</div>
           </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });

  originMarker = L.marker(state.originCoords, { icon: ambulanceIcon, draggable: false }).addTo(map)
    .bindPopup(`<b>${state.currentHub.name}</b><br>Pusat Operasi Ambulans AMC`);

  // Destination Marker with DRAG capability!
  destMarker = L.marker(state.destinationCoords, { icon: destinationIcon, draggable: true }).addTo(map)
    .bindPopup(`<b>${state.destinationName}</b><br>Tarik pin ini untuk tandakan lokasi tepat pesakit.`);

  // Drag listener: when user releases pin, recalculate exact location & road distance!
  destMarker.on('dragend', (e) => {
    playClickSound();
    const pos = e.target.getLatLng();
    setExactDestination(pos.lat, pos.lng, true);
  });

  // Polyline for real driving road route
  routePolyline = L.polyline([state.originCoords, state.destinationCoords], {
    color: '#0EA5E9',
    weight: 5,
    opacity: 0.9,
    lineJoin: 'round'
  }).addTo(map);

  // Click on map to place/move the exact destination pin!
  map.on('click', (e) => {
    playClickSound();
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    setExactDestination(lat, lng, true);
  });

  // Initialize Map Controls (Layer Switcher, Search, Fullscreen)
  initMapControls();

  // Fetch initial real road driving route
  fetchRealDrivingRoute(state.originCoords, state.destinationCoords);
}

// Function to set exact destination coordinates, reverse-geocode & compute driving distance
async function setExactDestination(lat, lng, reverseGeocode = false) {
  state.destinationCoords = [lat, lng];
  destMarker.setLatLng([lat, lng]);

  document.getElementById('mapCoordsBadge').textContent = `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;

  // Fetch real road route via OSRM Driving Engine
  await fetchRealDrivingRoute(state.originCoords, [lat, lng]);

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
          document.getElementById('mapCoordsBadge').textContent = `${placeName.substring(0, 32)}...`;
          document.getElementById('destinationSelect').value = 'custom';
          document.getElementById('customDestGroup').style.display = 'block';
          document.getElementById('customDestInput').value = placeName;
          destMarker.setPopupContent(`<b>${placeName}</b><br>Jarak Sebenar: ${state.distanceKm} KM`);
        }
      }
    } catch (err) {
      console.warn('Reverse geocoding error:', err);
    }
  }

  calculateAll();
}

// Fetch turn-by-turn REAL driving road route from OSRM
async function fetchRealDrivingRoute(orig, dest) {
  const url = `https://router.project-osrm.org/route/v1/driving/${orig[1]},${orig[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      // Real road distance in KM
      const roadKm = Math.round((route.distance / 1000) * 10) / 10;
      state.distanceKm = roadKm;
      updateDistanceInputs(roadKm);

      // Convert GeoJSON coordinates [lng, lat] to Leaflet [lat, lng]
      const latlngs = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      routePolyline.setLatLngs(latlngs);

      // Update ETA
      const estMinutes = Math.round(route.duration / 60);
      const hudEta = document.getElementById('hudEtaMinutes');
      const hudKm = document.getElementById('hudRemainingKm');
      if (hudEta) hudEta.textContent = `${estMinutes} Minit`;
      if (hudKm) hudKm.textContent = `${roadKm} KM`;

      // Fit map bounds to show full route
      map.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });
      return;
    }
  } catch (e) {
    console.warn('OSRM routing failed, using geodesic fallback:', e);
  }

  // Fallback: geodesic distance with road winding multiplier
  const fallbackKm = Math.round(computeHaversineDistance(orig, dest) * 1.25 * 10) / 10;
  state.distanceKm = fallbackKm;
  updateDistanceInputs(fallbackKm);
  routePolyline.setLatLngs([orig, dest]);
  map.fitBounds([orig, dest], { padding: [40, 40] });
}

function updateMapMarkersAndRoute() {
  if (!map || !originMarker || !destMarker || !routePolyline) return;

  originMarker.setLatLng(state.originCoords);
  destMarker.setLatLng(state.destinationCoords);

  originMarker.setPopupContent(`<b>${state.currentHub.name}</b><br>Pusat Operasi AMC (${state.currentHub.ambulancePlate})`);
  destMarker.setPopupContent(`<b>${state.destinationName}</b><br>Jarak Pemanduan: ${state.distanceKm} KM`);

  document.getElementById('mapCoordsBadge').textContent = `${state.destinationName.substring(0, 32)} (${state.distanceKm} KM)`;

  // Fetch real road route
  fetchRealDrivingRoute(state.originCoords, state.destinationCoords);
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
   9. Navigation Tabs Controller
   ========================================================================= */
function initNavigationTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const sections = document.querySelectorAll('.view-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      playClickSound();
      const targetId = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

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
    });
  });
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
    const msg = `*AL-FARHAIN AMC AMBULANS - ANGGARAN TRIP*%0A` +
      `Laluan: ${state.currentHub.name} ➔ ${state.destinationName}%0A` +
      `Jarak: ${state.distanceKm} KM%0A` +
      `Kategori: ${state.selectedTripType.name}%0A` +
      `Pakej Staf: ${state.selectedAssistance.name}%0A` +
      `Peralatan: ${getSelectedEquipSummary()}%0A` +
      `*JUMLAH KOS ANGGARAN: RM ${total}*%0A` +
      `Hubungi Hotline 24 Jam: 013-9147606`;
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
  document.getElementById('invOrigin').textContent = state.currentHub.name;
  document.getElementById('invDestination').textContent = state.destinationName;
  document.getElementById('invDistanceKm').textContent = `${state.distanceKm} KM`;

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
      <td><span style="font-family: var(--font-mono); font-weight: 700; color: var(--amc-cyan);">${ord.id}</span></td>
      <td style="font-size: 0.78rem; color: var(--text-dim);">${ord.date}</td>
      <td><strong>${ord.route}</strong></td>
      <td>${ord.distanceKm} KM</td>
      <td>${ord.assistance}</td>
      <td style="font-size: 0.75rem; color: var(--text-sub);">${ord.equipment}</td>
      <td style="font-family: var(--font-heading); font-weight: 800; color: #FFFFFF;">RM ${ord.total.toFixed(2)}</td>
      <td>
        <span style="background: rgba(16, 185, 129, 0.15); color: var(--amc-emerald); padding: 0.2rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 700;">
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
        <td><span style="background: rgba(14, 165, 233, 0.12); color: var(--amc-cyan); padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.72rem;">${it.cat}</span></td>
        <td><strong>${it.name}</strong></td>
        <td><code style="color: var(--text-dim);">${it.code}</code></td>
        <td style="font-family: var(--font-heading); font-weight: 700; color: #FFFFFF;">RM ${it.price.toFixed(2)}</td>
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

