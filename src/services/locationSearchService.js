// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - ADVANCED LOCATION SEARCH SERVICE
// High-performance, resilient search engine uniting Google Places API (New),
// Verified Local Medical Facility Directory, Device Geolocation, and Map Fallbacks.
// =========================================================================

import { loadGoogleMaps, toGoogleLatLng } from './googleMapsService.js';
import {
  searchVerifiedFacilities,
  findVerifiedFacilityMatch,
  calculateDirectDistanceKm,
  normalizeSearchTerm
} from '../data/verifiedFacilitiesData.js';
import { PRESET_PICKUP_LOCATIONS, HUBS } from '../data/pricingData.js';

// Search areas / regional bias options
export const SEARCH_REGIONS = [
  { id: 'all_my', label: 'Seluruh Malaysia (Pilihan Luas)', biasCoords: null, radius: 800000 },
  { id: 'branch_near', label: 'Sekitar Cawangan Bertolak', biasCoords: null, radius: 60000 },
  { id: 'kelantan', label: 'Negeri Kelantan', biasCoords: [6.1248, 102.2544], radius: 100000 },
  { id: 'pahang', label: 'Negeri Pahang', biasCoords: [3.8055, 103.3240], radius: 120000 },
  { id: 'kl_selangor', label: 'Lembah Klang / KL / Selangor', biasCoords: [3.1390, 101.6869], radius: 60000 }
];

export const PICKUP_CATEGORIES = [
  { id: 'all', label: 'Semua', icon: '🔍' },
  { id: 'Rumah / Kediaman', label: 'Rumah / Kediaman', icon: '🏠' },
  { id: 'Hospital Kerajaan', label: 'Hospital Kerajaan', icon: '🏥' },
  { id: 'Hospital Swasta', label: 'Hospital Swasta', icon: '🏨' },
  { id: 'Klinik Swasta', label: 'Klinik Swasta', icon: '💊' },
  { id: 'Lain-lain', label: 'Lain-lain', icon: '📍' }
];

// Metrics collector (tracks latency and counts without storing sensitive patient addresses or coordinates)
export const searchMetrics = {
  totalSearches: 0,
  verifiedHits: 0,
  googleHits: 0,
  fallbackHits: 0,
  lastSearchLatencyMs: 0
};

/**
 * Manages an isolated location search session with:
 * - Proper Google Autocomplete Session Token lifecycle
 * - Request cancellation and request ID sequencing
 * - Debouncing
 * - In-flight cache and deduplication
 */
export class LocationSearchSession {
  constructor(options = {}) {
    this.options = {
      defaultCategory: 'all',
      defaultRegionId: 'branch_near',
      hubCoords: options.hubCoords || HUBS.KOK_LANAS.coords,
      onResults: options.onResults || (() => {}),
      onError: options.onError || (() => {}),
      onLoading: options.onLoading || (() => {}),
      ...options
    };

    this.activeCategory = this.options.defaultCategory;
    this.activeRegionId = this.options.defaultRegionId;
    this.currentQuery = '';
    this.lastExecutedQuery = '';
    this.searchRequestId = 0;
    this.abortController = null;
    this.debounceTimer = null;
    this.autocompleteSessionToken = null;
    this.isComposing = false; // IME keyboard composition state

    this.initSessionToken();
  }

  async initSessionToken() {
    try {
      const google = await loadGoogleMaps();
      if (google?.maps?.places?.AutocompleteSessionToken) {
        this.autocompleteSessionToken = new google.maps.places.AutocompleteSessionToken();
      }
    } catch (err) {
      this.autocompleteSessionToken = null;
    }
  }

  resetSessionToken() {
    this.initSessionToken();
  }

  setCategory(category) {
    this.activeCategory = category || 'all';
    this.executeSearch(this.currentQuery, { immediate: true });
  }

  setRegion(regionId) {
    this.activeRegionId = regionId || 'branch_near';
    this.executeSearch(this.currentQuery, { immediate: true });
  }

  setCompositionState(isComposing) {
    this.isComposing = isComposing;
  }

  /**
   * Called on every input keystroke.
   * Debounces input by ~300ms, respects IME, and starts searching after 2 characters.
   */
  onInput(query) {
    this.currentQuery = query || '';

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.isComposing) {
      return;
    }

    const trimmed = this.currentQuery.trim();

    // If query is empty, show default verified facilities for active category
    if (!trimmed) {
      this.executeSearch('', { immediate: true });
      return;
    }

    // Debounce by 300ms for active typing
    this.debounceTimer = setTimeout(() => {
      this.executeSearch(trimmed);
    }, 300);
  }

  /**
   * Executes multi-layer location search.
   */
  async executeSearch(query = '', { immediate = false, isTextSearchFallback = false } = {}) {
    const trimmed = (query || '').trim();
    const requestId = ++this.searchRequestId;

    // Cancel in-flight network requests
    if (this.abortController) {
      try { this.abortController.abort(); } catch {}
    }
    this.abortController = new AbortController();

    this.options.onLoading(true, { requestId, query: trimmed });

    const startTime = Date.now();
    searchMetrics.totalSearches++;

    try {
      // 1. Query Verified Facility Directory (Instant & Zero Network Delay)
      const verifiedResults = searchVerifiedFacilities(trimmed, {
        category: this.activeCategory,
        refCoords: this.options.hubCoords,
        limit: 10
      });

      if (verifiedResults.length > 0) {
        searchMetrics.verifiedHits++;
      }

      // 2. Query Google Places Autocomplete (or Text Search fallback)
      let googleResults = [];
      if (trimmed.length >= 2) {
        try {
          if (isTextSearchFallback) {
            googleResults = await this.searchGooglePlacesText(trimmed, this.abortController.signal);
          } else {
            googleResults = await this.searchGooglePlacesAutocomplete(trimmed, this.abortController.signal);
          }
        } catch (gErr) {
          // If aborted, exit quietly
          if (gErr.name === 'AbortError') return;
          console.warn('[LocationSearch] Google Places search warning:', gErr.message);
        }
      }

      // Check request ID sequence: ignore if a newer search has superseded this one
      if (requestId !== this.searchRequestId) {
        return;
      }

      if (googleResults.length > 0) {
        searchMetrics.googleHits++;
      }

      // 3. Fallback: Presets matching query if any
      const presetMatches = this.getMatchingPresets(trimmed);

      // 4. Merge, Classify, and Deduplicate results
      const merged = this.mergeAndClassifyResults({
        verified: verifiedResults,
        google: googleResults,
        presets: presetMatches,
        category: this.activeCategory,
        query: trimmed
      });

      const latencyMs = Date.now() - startTime;
      searchMetrics.lastSearchLatencyMs = latencyMs;

      this.options.onLoading(false, { requestId, query: trimmed });
      this.options.onResults(merged, {
        query: trimmed,
        category: this.activeCategory,
        regionId: this.activeRegionId,
        latencyMs,
        isTextSearchFallback
      });

    } catch (err) {
      if (err.name === 'AbortError' || requestId !== this.searchRequestId) {
        return;
      }
      this.options.onLoading(false, { requestId, query: trimmed });
      this.options.onError(err, { query: trimmed });
    }
  }

  /**
   * Google Places Autocomplete using modern SDK and session token.
   */
  async searchGooglePlacesAutocomplete(query, signal) {
    const google = await loadGoogleMaps();
    if (!google || !google.maps?.places) return [];

    const biasConfig = this.getSearchLocationBias();

    return new Promise((resolve) => {
      // 1. Modern Places API (New): AutocompleteService
      const service = new google.maps.places.AutocompleteService();

      const request = {
        input: query,
        componentRestrictions: { country: 'my' },
        sessionToken: this.autocompleteSessionToken || undefined
      };

      if (biasConfig.biasCoords) {
        request.location = toGoogleLatLng(biasConfig.biasCoords);
        request.radius = biasConfig.radius;
      }

      service.getPlacePredictions(request, (predictions, status) => {
        if (signal?.aborted) return resolve([]);

        if (status === google.maps.places.PlacesServiceStatus.OK && predictions && predictions.length) {
          const formatted = predictions.map(p => {
            const isBroadArea = (p.types || []).some(t => 
              ['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'sublocality', 'postal_code', 'country'].includes(t)
            );

            return {
              id: `g_place_${p.place_id}`,
              placeId: p.place_id,
              name: p.structured_formatting?.main_text || p.description.split(',')[0],
              address: p.description,
              types: p.types || [],
              isBroadArea,
              source: 'google_places',
              sourceLabel: 'Google Maps'
            };
          });
          resolve(formatted);
        } else {
          resolve([]);
        }
      });
    });
  }

  /**
   * Google Places Text Search (New fallback for "Cari lebih banyak tempat").
   */
  async searchGooglePlacesText(query, signal) {
    const google = await loadGoogleMaps();
    if (!google || !google.maps?.places) return [];

    const dummyDiv = document.createElement('div');
    const service = new google.maps.places.PlacesService(dummyDiv);
    const biasConfig = this.getSearchLocationBias();

    const request = {
      query: `${query} Malaysia`,
      bounds: undefined
    };

    if (biasConfig.biasCoords) {
      request.location = toGoogleLatLng(biasConfig.biasCoords);
      request.radius = biasConfig.radius;
    }

    return new Promise((resolve) => {
      service.textSearch(request, (results, status) => {
        if (signal?.aborted) return resolve([]);

        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length) {
          const formatted = results.map(r => {
            const coords = r.geometry?.location ? [r.geometry.location.lat(), r.geometry.location.lng()] : null;
            const distKm = coords ? calculateDirectDistanceKm(this.options.hubCoords, coords) : null;

            return {
              id: `g_text_${r.place_id}`,
              placeId: r.place_id,
              name: r.name,
              address: r.formatted_address || r.name,
              coords,
              directDistanceKm: distKm,
              types: r.types || [],
              isBroadArea: false,
              source: 'google_places_text',
              sourceLabel: 'Google Maps (Carian Penuh)'
            };
          });
          resolve(formatted);
        } else {
          resolve([]);
        }
      });
    });
  }

  /**
   * Determines geographic location bias without strictly clamping/restricting bounds.
   */
  getSearchLocationBias() {
    const reg = SEARCH_REGIONS.find(r => r.id === this.activeRegionId) || SEARCH_REGIONS[1];
    if (reg.id === 'branch_near') {
      return {
        biasCoords: this.options.hubCoords || HUBS.KOK_LANAS.coords,
        radius: 60000 // 60 km soft bias
      };
    }
    return {
      biasCoords: reg.biasCoords,
      radius: reg.radius || 100000
    };
  }

  /**
   * Retrieves preset pickup cards matching query.
   */
  getMatchingPresets(query = '') {
    const norm = normalizeSearchTerm(query);
    const allPresets = [];

    Object.values(PRESET_PICKUP_LOCATIONS).forEach(list => {
      list.forEach(p => {
        allPresets.push({
          id: `preset_${p.id}`,
          presetId: p.id,
          name: p.name,
          address: p.address,
          coords: p.coords,
          category: 'Rumah / Kediaman',
          isVerified: true,
          source: 'preset',
          sourceLabel: 'Kawasan Kediaman'
        });
      });
    });

    if (!norm) return allPresets.slice(0, 8);

    return allPresets.filter(p => {
      const nName = normalizeSearchTerm(p.name);
      const nAddr = normalizeSearchTerm(p.address);
      return nName.includes(norm) || nAddr.includes(norm);
    });
  }

  /**
   * Merges verified records, Google Place suggestions, and presets with
   * category filtering and strict deduplication by Place ID, name, and address.
   */
  mergeAndClassifyResults({ verified = [], google = [], presets = [], category = 'all', query = '' }) {
    const merged = [];
    const seenKeys = new Set();

    // 1. Verified Directory Results (Highest Priority)
    for (const v of verified) {
      const dedupeKey = normalizeSearchTerm(v.name);
      seenKeys.add(dedupeKey);
      if (v.address) seenKeys.add(normalizeSearchTerm(v.address));
      if (v.placeId) seenKeys.add(v.placeId);

      merged.push({
        ...v,
        category: v.category || 'Klinik Swasta'
      });
    }

    // 2. Google Places Results
    for (const g of google) {
      const normName = normalizeSearchTerm(g.name);
      const normAddr = normalizeSearchTerm(g.address);

      if (seenKeys.has(normName) || (g.placeId && seenKeys.has(g.placeId))) {
        continue; // Deduplicate
      }

      // Check if this Google place corresponds to an internally verified facility
      const verifiedMatch = findVerifiedFacilityMatch({
        name: g.name,
        address: g.address,
        coords: g.coords,
        placeId: g.placeId
      });

      let assignedCategory = null;
      let isVerified = false;
      let sourceLabel = g.sourceLabel || 'Google Maps';

      if (verifiedMatch) {
        assignedCategory = verifiedMatch.category;
        isVerified = true;
        sourceLabel = '✓ Disahkan AMC (Google)';
      } else {
        // Classify from name keywords if obvious, otherwise leave uninvented
        const lowerName = g.name.toLowerCase();
        if (lowerName.includes('hospital') || lowerName.includes('pusat perubatan')) {
          // If contains 'hospital' or 'kkm' or 'kerajaan' vs 'swasta' / 'specialist'
          if (lowerName.includes('pakar') || lowerName.includes('specialist') || lowerName.includes('kpj') || lowerName.includes('medical centre') || lowerName.includes('gleneagles') || lowerName.includes('pantai') || lowerName.includes('sunway')) {
            assignedCategory = 'Hospital Swasta';
          } else {
            assignedCategory = 'Hospital Kerajaan';
          }
        } else if (lowerName.includes('klinik kesihatan') || lowerName.includes('kk ')) {
          assignedCategory = 'Klinik Kesihatan';
        } else if (lowerName.includes('klinik') || lowerName.includes('poliklinik') || lowerName.includes('clinic')) {
          assignedCategory = 'Klinik Swasta';
        } else if (lowerName.includes('taman') || lowerName.includes('kampung') || lowerName.includes('lorong') || lowerName.includes('jalan') || lowerName.includes('kediaman') || lowerName.includes('kondominium') || lowerName.includes('apartment') || lowerName.includes('flat')) {
          assignedCategory = 'Rumah / Kediaman';
        } else {
          assignedCategory = 'Lokasi Lain';
        }
      }

      // Category filter check
      if (category !== 'all' && category !== 'Lain-lain') {
        if (category === 'Rumah / Kediaman' && assignedCategory !== 'Rumah / Kediaman') continue;
        if (category === 'Hospital Kerajaan' && assignedCategory !== 'Hospital Kerajaan') continue;
        if (category === 'Hospital Swasta' && assignedCategory !== 'Hospital Swasta') continue;
        if (category === 'Klinik Swasta' && assignedCategory !== 'Klinik Swasta' && assignedCategory !== 'Klinik Kesihatan') continue;
      }

      seenKeys.add(normName);
      if (g.placeId) seenKeys.add(g.placeId);

      merged.push({
        ...g,
        category: assignedCategory,
        isVerified,
        sourceLabel
      });
    }

    // 3. Preset Pickups (if searching for residential or category matches)
    if (category === 'all' || category === 'Rumah / Kediaman') {
      for (const p of presets) {
        const dedupeKey = normalizeSearchTerm(p.name);
        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          merged.push(p);
        }
      }
    }

    return merged;
  }

  /**
   * Fetches exact coordinates and place details for a selected Google place.
   * Concludes the Google Autocomplete Session Token lifecycle.
   */
  async resolvePlaceDetails(placeItem) {
    if (placeItem.coords && placeItem.coords.length === 2 && !placeItem.placeId) {
      return {
        name: placeItem.name,
        address: placeItem.address,
        coords: placeItem.coords,
        category: placeItem.category || 'Lokasi Lain',
        placeId: null,
        isVerified: Boolean(placeItem.isVerified)
      };
    }

    if (!placeItem.placeId) {
      return {
        name: placeItem.name,
        address: placeItem.address,
        coords: placeItem.coords || this.options.hubCoords,
        category: placeItem.category || 'Lokasi Lain',
        placeId: null,
        isVerified: false
      };
    }

    const google = await loadGoogleMaps();
    if (!google?.maps?.places) {
      return {
        name: placeItem.name,
        address: placeItem.address,
        coords: placeItem.coords || this.options.hubCoords,
        category: placeItem.category || 'Lokasi Lain',
        placeId: placeItem.placeId,
        isVerified: false
      };
    }

    const dummyDiv = document.createElement('div');
    const service = new google.maps.places.PlacesService(dummyDiv);

    return new Promise((resolve, reject) => {
      service.getDetails({
        placeId: placeItem.placeId,
        fields: ['name', 'formatted_address', 'geometry.location', 'address_components', 'types', 'place_id'],
        sessionToken: this.autocompleteSessionToken || undefined
      }, (place, status) => {
        // Conclude and reset session token immediately after fetching details
        this.resetSessionToken();

        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          const coords = [place.geometry.location.lat(), place.geometry.location.lng()];
          resolve({
            name: place.name || placeItem.name,
            address: place.formatted_address || placeItem.address,
            coords,
            category: placeItem.category || 'Lokasi Lain',
            placeId: place.place_id,
            types: place.types || [],
            isVerified: Boolean(placeItem.isVerified)
          });
        } else {
          // Graceful fallback to item's existing coords or hub coords
          resolve({
            name: placeItem.name,
            address: placeItem.address,
            coords: placeItem.coords || this.options.hubCoords,
            category: placeItem.category || 'Lokasi Lain',
            placeId: placeItem.placeId,
            isVerified: false
          });
        }
      });
    });
  }

  destroy() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.abortController) {
      try { this.abortController.abort(); } catch {}
    }
  }
}

/**
 * Requests device GPS location with explicit permission prompt.
 * Gracefully handles permission denial without blocking the booking flow.
 */
export async function getDeviceCurrentLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Pelayar anda tidak menyokong fungsi Geolocation.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        let address = `Lokasi Semasa (${coords[0].toFixed(5)}, ${coords[1].toFixed(5)})`;
        let name = 'Lokasi Semasa Pesakit (GPS)';

        // Attempt reverse geocoding via Google Maps
        try {
          const google = await loadGoogleMaps();
          if (google?.maps?.Geocoder) {
            const geocoder = new google.maps.Geocoder();
            const res = await geocoder.geocode({ location: { lat: coords[0], lng: coords[1] } });
            if (res.results && res.results[0]) {
              address = res.results[0].formatted_address;
              name = res.results[0].address_components?.[0]?.long_name || 'Lokasi Semasa (GPS)';
            }
          }
        } catch (e) {
          console.warn('[Geolocation] Reverse geocoding fallback:', e);
        }

        resolve({
          name,
          address,
          coords,
          category: 'Rumah / Kediaman',
          source: 'device_gps',
          sourceLabel: 'GPS Peranti'
        });
      },
      (err) => {
        let msg = 'Tidak dapat mengakses lokasi semasa.';
        if (err.code === 1) { // PERMISSION_DENIED
          msg = 'Akses lokasi peranti ditolak. Sila pilih lokasi pada peta atau taip alamat di ruangan carian.';
        } else if (err.code === 2) { // POSITION_UNAVAILABLE
          msg = 'Maklumat GPS peranti tidak tersedia pada masa ini.';
        } else if (err.code === 3) { // TIMEOUT
          msg = 'Akses lokasi peranti tamat masa.';
        }
        const error = new Error(msg);
        error.code = err.code;
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  });
}

