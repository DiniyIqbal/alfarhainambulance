// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - REUSABLE GOOGLE MAPS JAVASCRIPT SERVICE
// High-Performance Map Engine powered by Google Maps JavaScript API & Places API (New)
// Uses official @googlemaps/js-api-loader with singleton lifecycle management.
// =========================================================================

import { Loader } from '@googlemaps/js-api-loader';
import { HUBS, OTHER_BRANCHES, PRESET_DESTINATIONS } from '../data/pricingData.js';

// Configuration from Vite environment variables (with safe fallback for Node.js test runners)
export const GOOGLE_MAPS_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY
  ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  : (process?.env?.VITE_GOOGLE_MAPS_API_KEY || '')).trim();

export const GOOGLE_MAPS_MAP_ID = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_MAP_ID
  ? import.meta.env.VITE_GOOGLE_MAPS_MAP_ID
  : (process?.env?.VITE_GOOGLE_MAPS_MAP_ID || '')).trim();

/**
 * AMC Brand Color Constants for Map Rendering
 */
export const AMC_MAP_COLORS = {
  primaryRed: '#C61E2F',       // Official AMC Emergency Red
  highlightPink: '#FFF0F2',     // Selected / highlight background
  readyGreen: '#10B981',        // Fleet Ready Status
  transitAmber: '#F59E0B',      // In-transit / Dispatched Status
  darkSlate: '#1E293B',         // Base text / pin outline
  deepTeal: '#007D77',          // AMC Secondary Accent
  purpleReturn: '#7C3AED',      // Return / Multi-stop Leg
  white: '#FFFFFF'
};

// Singleton loader promise to ensure Google Maps script loads once per page session
let googleMapsLoaderPromise = null;
let googleMapsLoaded = false;

/**
 * Loads the Google Maps JavaScript API SDK once per page using @googlemaps/js-api-loader.
 * @returns {Promise<typeof google>}
 */
export async function loadGoogleMaps() {
  if (window.google?.maps) {
    googleMapsLoaded = true;
    return window.google;
  }

  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'REPLACE_WITH_DEVELOPMENT_BROWSER_KEY') {
    console.warn('[GoogleMapsService] VITE_GOOGLE_MAPS_API_KEY is not configured or using placeholder.');
    return null;
  }

  const loaderOptions = {
    apiKey: GOOGLE_MAPS_API_KEY,
    version: 'weekly',
    libraries: ['maps', 'marker', 'places', 'geometry']
  };

  // If a production Map ID is configured, pass it to the loader
  if (GOOGLE_MAPS_MAP_ID) {
    loaderOptions.mapIds = [GOOGLE_MAPS_MAP_ID];
  }

  const loader = new Loader(loaderOptions);

  googleMapsLoaderPromise = loader.load().then(() => {
    googleMapsLoaded = true;
    return window.google;
  }).catch((err) => {
    console.error('[GoogleMapsService] Failed to load Google Maps SDK:', err);
    googleMapsLoaderPromise = null;
    return null;
  });

  return googleMapsLoaderPromise;
}

/**
 * Check if Google Maps is successfully configured and loaded.
 */
export function isGoogleMapsAvailable() {
  return Boolean(window.google?.maps);
}

/**
 * Coordinate Conversion Helpers:
 * Converts diverse coordinate inputs ([lat, lng], [lng, lat], {lat, lng})
 * into Google Maps { lat: number, lng: number } object.
 * 
 * Malaysia geographic bounds: Latitude ~1° to ~8° N, Longitude ~99° to ~119° E.
 * 
 * @param {Array<number>|Object} coord
 * @returns {{lat: number, lng: number}}
 */
export function toGoogleLatLng(coord) {
  if (!coord) return { lat: 5.9176965, lng: 102.2446687 }; // Kok Lanas HQ default

  if (Array.isArray(coord)) {
    if (coord.length < 2) return { lat: 5.9176965, lng: 102.2446687 };
    let c0 = Number(coord[0]);
    let c1 = Number(coord[1]);

    // If first element is longitude (>50) and second is latitude (<20), swap them
    if (c0 > 50 && c1 < 20) {
      return { lat: c1, lng: c0 };
    }
    return { lat: c0, lng: c1 };
  }

  if (typeof coord === 'object') {
    const lat = Number(coord.lat ?? coord.latitude);
    const lng = Number(coord.lng ?? coord.lon ?? coord.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }

  return { lat: 5.9176965, lng: 102.2446687 };
}

/**
 * Converts Google Maps LatLng or coordinate object into standard [lat, lng] array.
 * @param {google.maps.LatLng|Object|Array<number>} coord
 * @returns {[number, number]} [latitude, longitude]
 */
export function toLatLngArray(coord) {
  if (!coord) return [5.9176965, 102.2446687];

  if (typeof coord.lat === 'function' && typeof coord.lng === 'function') {
    return [coord.lat(), coord.lng()];
  }

  if (Array.isArray(coord)) {
    let [c0, c1] = coord;
    if (c0 > 50 && c1 < 20) {
      return [c1, c0];
    }
    return [c0, c1];
  }

  if (typeof coord === 'object') {
    const lat = coord.lat ?? coord.latitude;
    const lng = coord.lng ?? coord.lon ?? coord.longitude;
    return [Number(lat), Number(lng)];
  }

  return [5.9176965, 102.2446687];
}

/**
 * Reusable Google Maps Controller
 * Preserves the exact API methods of the legacy controller (setRoute, addOrUpdateMarker,
 * fitBounds, clearAllRoutes, clearAllMarkers, resize, destroy).
 */
export class AmcGoogleMapsController {
  /**
   * @param {Object} options
   * @param {string|HTMLElement} options.container - Container element ID or node
   * @param {Array<number>} [options.center=[5.9176965, 102.2446687]] - Initial center [lat, lng]
   * @param {number} [options.zoom=11] - Initial zoom level
   * @param {boolean} [options.interactive=true] - Enable map interaction
   * @param {boolean} [options.showNavigation=true] - Show zoom/compass controls
   * @param {Function} [options.onReady] - Map ready callback
   * @param {Function} [options.onClick] - Map click callback
   */
  constructor(options = {}) {
    this.container = typeof options.container === 'string'
      ? document.getElementById(options.container)
      : options.container;

    this.options = options;
    this.map = null;
    this.routes = new Map();   // Map<routeId, google.maps.Polyline>
    this.markers = new Map();  // Map<markerId, { marker, infoWindow, listeners: [] }>
    this.eventListeners = [];  // Array of google.maps.event listeners for cleanup
    this.resizeObserver = null;
    this.isReady = false;

    if (this.container) {
      this._init();
    }
  }

  async _init() {
    const google = await loadGoogleMaps();
    if (!google || !this.container) {
      console.warn('[GoogleMapsController] Google Maps SDK unavailable for container:', this.container?.id);
      return;
    }

    const centerLatLng = toGoogleLatLng(this.options.center || [5.9176965, 102.2446687]);
    const zoomLevel = this.options.zoom || 11;
    const isInteractive = this.options.interactive !== false;

    const mapOptions = {
      center: centerLatLng,
      zoom: zoomLevel,
      gestureHandling: isInteractive ? 'auto' : 'none',
      zoomControl: this.options.showNavigation !== false && isInteractive,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      scaleControl: true
    };

    if (GOOGLE_MAPS_MAP_ID) {
      mapOptions.mapId = GOOGLE_MAPS_MAP_ID;
    }

    this.map = new google.maps.Map(this.container, mapOptions);

    // Map click event
    if (typeof this.options.onClick === 'function') {
      const clickListener = this.map.addListener('click', (e) => {
        if (!e.latLng) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        this.options.onClick({
          coords: [lat, lng],
          latLng: e.latLng
        });
      });
      this.eventListeners.push(clickListener);
    }

    // Handle hidden container becoming visible (e.g. tabs or modal open)
    this._setupResizeObserver();

    this.isReady = true;
    if (typeof this.options.onReady === 'function') {
      this.options.onReady(this);
    }
  }

  _setupResizeObserver() {
    if (!this.container || typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          this.resize();
        }
      }
    });

    this.resizeObserver.observe(this.container);
  }

  /**
   * Triggers map resize and repositioning.
   */
  resize() {
    if (!this.map || !window.google?.maps) return;
    window.google.maps.event.trigger(this.map, 'resize');
  }

  /**
   * Clears a specific polyline route.
   */
  clearRoute(routeId) {
    const existing = this.routes.get(routeId);
    if (existing) {
      existing.setMap(null);
      this.routes.delete(routeId);
    }
  }

  /**
   * Clears all drawn polyline routes.
   */
  clearAllRoutes() {
    for (const [id, polyline] of this.routes.entries()) {
      polyline.setMap(null);
    }
    this.routes.clear();
  }

  /**
   * Sets or updates a polyline route on the map.
   * @param {string} routeId - Unique route key (e.g. 'miniLeg1', 'fullLeg2')
   * @param {Array<[number, number]>} latLngPoints - Array of [lat, lng] points
   * @param {Object} [options]
   */
  setRoute(routeId, latLngPoints, options = {}) {
    if (!this.map || !window.google?.maps) return;
    this.clearRoute(routeId);

    if (!Array.isArray(latLngPoints) || latLngPoints.length < 2) return;

    const path = latLngPoints.map(pt => toGoogleLatLng(pt));
    const strokeColor = options.color || AMC_MAP_COLORS.primaryRed;
    const strokeOpacity = options.opacity ?? 0.9;
    const strokeWeight = options.width ?? 5;
    const isDashed = Boolean(options.dashArray);

    const polylineOptions = {
      path,
      strokeColor,
      strokeOpacity: isDashed ? 0 : strokeOpacity,
      strokeWeight,
      map: this.map
    };

    // If dashed route requested (e.g. Leg 2 Pickup -> Hospital)
    if (isDashed) {
      const lineSymbol = {
        path: 'M 0,-1 0,1',
        strokeOpacity: strokeOpacity,
        strokeColor: strokeColor,
        scale: strokeWeight
      };

      polylineOptions.icons = [{
        icon: lineSymbol,
        offset: '0',
        repeat: '15px'
      }];
    }

    const polyline = new window.google.maps.Polyline(polylineOptions);
    this.routes.set(routeId, polyline);

    if (options.autoFit) {
      this.fitBounds(latLngPoints);
    }

    return polyline;
  }

  /**
   * Adds or updates a marker on the map.
   * Supports custom HTML overlays, popups, and dragging.
   * 
   * @param {string} markerId - Unique marker key (e.g. 'hub', 'pickup', 'dest')
   * @param {Object} options
   */
  addOrUpdateMarker(markerId, options = {}) {
    if (!this.map || !window.google?.maps) return;
    this.removeMarker(markerId);

    const position = toGoogleLatLng(options.coords);
    const listeners = [];
    let marker = null;
    let infoWindow = null;

    // Standard OverlayView for 100% custom HTML pins with pixel-perfect styling
    class CustomHtmlMarker extends window.google.maps.OverlayView {
      constructor(pos, html, isDraggable, onDragCallback, onClickCallback) {
        super();
        this.pos = pos;
        this.html = html;
        this.isDraggable = isDraggable;
        this.onDragCallback = onDragCallback;
        this.onClickCallback = onClickCallback;
        this.div = null;
      }

      onAdd() {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.cursor = this.isDraggable ? 'grab' : 'pointer';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.zIndex = '100';
        div.innerHTML = this.html;

        if (this.isDraggable) {
          let isDragging = false;
          let startX, startY;

          div.addEventListener('mousedown', (e) => {
            isDragging = true;
            div.style.cursor = 'grabbing';
            startX = e.clientX;
            startY = e.clientY;
            e.stopPropagation();
          });

          window.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            div.style.cursor = 'grab';
            const projection = this.getProjection();
            if (projection) {
              const rect = div.getBoundingClientRect();
              const mapRect = this.getPanes().overlayMouseTarget.getBoundingClientRect();
              const pixelX = rect.left - mapRect.left + (rect.width / 2);
              const pixelY = rect.top - mapRect.top + (rect.height / 2);
              const newLatLng = projection.fromContainerPixelToLatLng(new window.google.maps.Point(pixelX, pixelY));
              if (newLatLng && typeof this.onDragCallback === 'function') {
                this.pos = newLatLng;
                this.onDragCallback([newLatLng.lat(), newLatLng.lng()]);
              }
            }
          });
        }

        if (typeof this.onClickCallback === 'function') {
          div.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onClickCallback();
          });
        }

        this.div = div;
        const panes = this.getPanes();
        panes.overlayMouseTarget.appendChild(div);
      }

      draw() {
        const overlayProjection = this.getProjection();
        if (!overlayProjection || !this.div) return;

        const point = overlayProjection.fromLatLngToDivPixel(this.pos);
        if (point) {
          this.div.style.left = point.x + 'px';
          this.div.style.top = point.y + 'px';
        }
      }

      onRemove() {
        if (this.div) {
          this.div.parentNode?.removeChild(this.div);
          this.div = null;
        }
      }

      setPosition(newPos) {
        this.pos = toGoogleLatLng(newPos);
        this.draw();
      }

      getPosition() {
        return this.pos;
      }
    }

    if (options.customHtml) {
      const overlay = new CustomHtmlMarker(
        position,
        options.customHtml,
        Boolean(options.draggable),
        options.onDragEnd,
        () => {
          if (infoWindow) {
            infoWindow.open({
              anchor: {
                getPosition: () => overlay.getPosition()
              },
              map: this.map,
              shouldFocus: false
            });
          }
        }
      );
      overlay.setMap(this.map);
      marker = overlay;
    } else {
      // Standard Marker fallback
      marker = new window.google.maps.Marker({
        position,
        map: this.map,
        draggable: Boolean(options.draggable),
        title: options.title || ''
      });

      if (options.draggable && typeof options.onDragEnd === 'function') {
        const dragListener = marker.addListener('dragend', (e) => {
          if (e.latLng) {
            options.onDragEnd([e.latLng.lat(), e.latLng.lng()]);
          }
        });
        listeners.push(dragListener);
      }
    }

    // Popup InfoWindow
    if (options.customPopupHtml) {
      infoWindow = new window.google.maps.InfoWindow({
        content: options.customPopupHtml,
        disableAutoPan: false
      });

      if (!options.customHtml) {
        const clickListener = marker.addListener('click', () => {
          infoWindow.open({
            anchor: marker,
            map: this.map,
            shouldFocus: false
          });
        });
        listeners.push(clickListener);
      }
    }

    this.markers.set(markerId, { marker, infoWindow, listeners });
    return marker;
  }

  /**
   * Removes a specific marker.
   */
  removeMarker(markerId) {
    const item = this.markers.get(markerId);
    if (item) {
      item.listeners?.forEach(l => window.google.maps.event.removeListener(l));
      if (typeof item.marker.setMap === 'function') {
        item.marker.setMap(null);
      }
      item.infoWindow?.close();
      this.markers.delete(markerId);
    }
  }

  /**
   * Clears all markers from the map.
   */
  clearAllMarkers() {
    for (const [id] of this.markers.entries()) {
      this.removeMarker(id);
    }
  }

  /**
   * Fits the map viewport to contain all given coordinate points.
   * @param {Array<[number, number]>} latLngPoints
   * @param {Object} [padding] - { top, bottom, left, right }
   */
  fitBounds(latLngPoints, padding = { top: 25, bottom: 25, left: 25, right: 25 }) {
    if (!this.map || !window.google?.maps || !Array.isArray(latLngPoints) || !latLngPoints.length) return;

    const bounds = new window.google.maps.LatLngBounds();
    latLngPoints.forEach(pt => {
      bounds.extend(toGoogleLatLng(pt));
    });

    this.map.fitBounds(bounds, padding);
  }

  /**
   * Smoothly pans the map to a center point.
   */
  panTo(coord) {
    if (!this.map) return;
    this.map.panTo(toGoogleLatLng(coord));
  }

  /**
   * Smoothly fly/zoom to point.
   */
  flyTo(coord, zoom = 12) {
    if (!this.map) return;
    this.map.setZoom(zoom);
    this.map.panTo(toGoogleLatLng(coord));
  }

  /**
   * Displays verified Al-Farhain network points (Hubs, Branches, Hospitals).
   */
  displayVerifiedNetworkPoints(options = {}) {
    // 1. Hubs
    Object.values(HUBS).forEach(hub => {
      this.addOrUpdateMarker(`hub_${hub.id}`, {
        coords: hub.coords,
        customHtml: `
          <div style="background:#007D77; color:#fff; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,125,119,0.4); border:2px solid #fff; font-size:14px;">
            🏛️
          </div>
        `,
        customPopupHtml: `
          <div style="font-size:0.8rem; padding:4px;">
            <strong style="color:#007D77;">${hub.name}</strong>
            <div style="font-size:0.72rem; color:#64748B; margin-top:2px;">${hub.address}</div>
            <div style="font-size:0.72rem; margin-top:4px;">Hotline: <b>${hub.contactNumber}</b></div>
          </div>
        `
      });
    });

    // 2. Branches
    if (options.includeAllBranches) {
      OTHER_BRANCHES.forEach(b => {
        this.addOrUpdateMarker(`branch_${b.id}`, {
          coords: b.coords,
          customHtml: `
            <div style="background:#1E293B; color:#fff; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3); border:2px solid #fff; font-size:11px;">
              🏥
            </div>
          `,
          customPopupHtml: `
            <div style="font-size:0.8rem; padding:4px;">
              <strong>${b.name}</strong>
              <div style="font-size:0.72rem; color:#64748B;">Cawangan ${b.state}</div>
            </div>
          `
        });
      });
    }
  }

  /**
   * Cleans up all listeners, observers, polylines, and markers.
   */
  destroy() {
    this.clearAllRoutes();
    this.clearAllMarkers();

    this.eventListeners.forEach(l => window.google?.maps?.event?.removeListener(l));
    this.eventListeners = [];

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.map = null;
    this.isReady = false;
  }
}

/**
 * Factory helper function matching legacy createAmcMap signature
 */
export function createGoogleAmcMap(containerId, options = {}) {
  return new AmcGoogleMapsController({
    container: containerId,
    ...options
  });
}

/**
 * Places API (New) Autocomplete Helper
 * 
 * Complies strictly with Google Maps Platform policies:
 * - Restricts search to Malaysia ('my').
 * - Biases search toward operating branch without preventing nationwide searches.
 * - Requests only required Basic/Essentials fields: ['displayName', 'formattedAddress', 'location'].
 *   (Documented Billing Tier: Essentials / Basic Data - lowest cost, avoids Atmosphere/Contact fees).
 * - Distinguishes Google content from user-entered data; does NOT bulk-copy into Supabase.
 * 
 * @param {HTMLInputElement|HTMLElement} inputElement
 * @param {Object} options
 * @param {Array<number>} [options.biasCoords] - [lat, lng] to bias around
 * @param {Function} options.onPlaceSelect - Callback receiving { name, address, coords, placeId }
 */
export async function setupPlacesAutocomplete(inputElement, options = {}) {
  const google = await loadGoogleMaps();
  if (!google || !inputElement) return null;

  const biasLatLng = toGoogleLatLng(options.biasCoords || [5.9176965, 102.2446687]);

  try {
    // Check if Places API (New) PlaceAutocompleteElement is supported
    if (google.maps.places?.PlaceAutocompleteElement) {
      const autocompleteEl = new google.maps.places.PlaceAutocompleteElement({
        includedRegionCodes: ['my'],
        locationBias: {
          center: biasLatLng,
          radius: 50000 // 50 KM bias radius around operating hub
        }
      });

      autocompleteEl.addEventListener('gmp-placeselect', async ({ place }) => {
        if (!place) return;
        try {
          // Request ONLY required Essentials fields to protect against unexpected billings
          await place.fetchFields({
            fields: ['displayName', 'formattedAddress', 'location']
          });

          if (!place.location) {
            alert('Lokasi ini tidak mempunyai koordinat yang sah. Sila pilih lokasi lain atau gunakan penanda manual pada peta.');
            return;
          }

          const coords = [place.location.lat(), place.location.lng()];
          const name = place.displayName || inputElement.value || 'Lokasi Terpilih';
          const address = place.formattedAddress || name;

          if (typeof options.onPlaceSelect === 'function') {
            options.onPlaceSelect({
              name,
              address,
              coords,
              placeId: place.id
            });
          }
        } catch (fetchErr) {
          console.warn('[PlacesAutocomplete] fetchFields error:', fetchErr);
        }
      });

      return autocompleteEl;
    }

    // Standard Google Places Autocomplete fallback
    if (google.maps.places?.Autocomplete) {
      const autocomplete = new google.maps.places.Autocomplete(inputElement, {
        componentRestrictions: { country: 'my' },
        fields: ['name', 'formatted_address', 'geometry.location', 'place_id']
      });

      const circle = new google.maps.Circle({
        center: biasLatLng,
        radius: 50000
      });
      autocomplete.setBounds(circle.getBounds());

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
          alert('Lokasi ini tidak mempunyai koordinat jalan yang sah. Sila laraskan pin pada peta.');
          return;
        }

        const coords = [place.geometry.location.lat(), place.geometry.location.lng()];
        const name = place.name || inputElement.value || 'Lokasi Terpilih';
        const address = place.formatted_address || name;

        if (typeof options.onPlaceSelect === 'function') {
          options.onPlaceSelect({
            name,
            address,
            coords,
            placeId: place.place_id
          });
        }
      });

      return autocomplete;
    }
  } catch (err) {
    console.warn('[GoogleMapsService] Autocomplete setup error:', err);
  }

  return null;
}
