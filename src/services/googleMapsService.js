// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - REUSABLE GOOGLE MAPS JAVASCRIPT SERVICE
// High-Performance Map Engine powered by Google Maps JavaScript API & Places API
// Resilient loader with lifecycle management, operation queueing, and fallback.
// =========================================================================

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

// Global auth failure handler for immediate diagnostic feedback in UI
if (typeof window !== 'undefined') {
  const previousAuthFailure = window.gm_authFailure;
  window.gm_authFailure = () => {
    console.error('[GoogleMapsService] Google Maps Authentication Failure: Invalid key or unauthorized HTTP Referer.');
    window.dispatchEvent(new CustomEvent('amc-gmaps-auth-failure'));
    if (typeof previousAuthFailure === 'function') previousAuthFailure();
  };
}

/**
 * Loads the Google Maps JavaScript API SDK once per page using dynamic script injection.
 * Fully compatible with Vite, browsers, and Android TWA / Bubblewrap WebViews.
 * @returns {Promise<typeof google>}
 */
export async function loadGoogleMaps() {
  if (typeof window === 'undefined') return null;

  if (window.google?.maps?.Map) {
    googleMapsLoaded = true;
    return window.google;
  }

  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  const apiKey = GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'REPLACE_WITH_DEVELOPMENT_BROWSER_KEY') {
    console.warn('[GoogleMapsService] VITE_GOOGLE_MAPS_API_KEY is not configured or using placeholder.');
    return null;
  }

  googleMapsLoaderPromise = new Promise((resolve) => {
    if (window.google?.maps?.Map) {
      googleMapsLoaded = true;
      resolve(window.google);
      return;
    }

    const existingScript = document.querySelector('script[data-gmaps-script="true"]');
    if (existingScript) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.google?.maps?.Map) {
          clearInterval(interval);
          googleMapsLoaded = true;
          resolve(window.google);
        } else if (attempts > 80) {
          clearInterval(interval);
          console.error('[GoogleMapsService] Timeout waiting for existing Google Maps script.');
          resolve(null);
        }
      }, 100);
      return;
    }

    const callbackName = '__amcGoogleMapsLoadedCallback__';
    window[callbackName] = async () => {
      try { delete window[callbackName]; } catch {}
      // If modern dynamic library loader is available, ensure required modules are loaded
      if (window.google?.maps?.importLibrary) {
        try {
          await Promise.all([
            window.google.maps.importLibrary('maps'),
            window.google.maps.importLibrary('marker'),
            window.google.maps.importLibrary('places'),
            window.google.maps.importLibrary('geometry')
          ]);
        } catch (e) {
          console.warn('[GoogleMapsService] importLibrary warning:', e);
        }
      }
      googleMapsLoaded = true;
      resolve(window.google);
    };

    const script = document.createElement('script');
    script.dataset.gmapsScript = 'true';
    script.async = true;
    script.defer = true;

    const params = new URLSearchParams({
      key: apiKey,
      libraries: 'places,geometry,marker',
      v: 'weekly',
      callback: callbackName
    });

    if (GOOGLE_MAPS_MAP_ID) {
      params.append('map_ids', GOOGLE_MAPS_MAP_ID);
    }

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.onerror = (err) => {
      console.error('[GoogleMapsService] Failed to load Google Maps script tag:', err);
      googleMapsLoaderPromise = null;
      resolve(null);
    };

    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
}

/**
 * Check if Google Maps is successfully configured and loaded.
 */
export function isGoogleMapsAvailable() {
  return Boolean(typeof window !== 'undefined' && window.google?.maps?.Map);
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
 * fitBounds, clearAllRoutes, clearAllMarkers, resize, invalidateSize, destroy).
 * Buffers calls before map readiness to guarantee 100% reliable initialization.
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

    if (!this.container && typeof options.container === 'string') {
      this.container = document.getElementById(options.container);
    }

    this.options = options;
    this.map = null;
    this.routes = new Map();   // Map<routeId, google.maps.Polyline>
    this.markers = new Map();  // Map<markerId, { marker, infoWindow, listeners: [] }>
    this.eventListeners = [];  // Array of google.maps.event listeners for cleanup
    this.queuedOperations = [];// Buffered operations called before Google Maps finishes loading
    this.resizeObserver = null;
    this.isReady = false;
    this._lastFitBounds = null;

    if (typeof window !== 'undefined') {
      this._authFailureHandler = () => {
        this._renderFallbackMessage('Ralat Pengesahan Kunci Google Maps API. Sila pastikan domain atau localhost ini dibenarkan dalam Google Cloud Console (HTTP Referrers).');
      };
      window.addEventListener('amc-gmaps-auth-failure', this._authFailureHandler);
    }

    this._init();
  }

  async _init() {
    if (!this.container && typeof this.options.container === 'string') {
      this.container = document.getElementById(this.options.container);
    }

    const google = await loadGoogleMaps();

    if (!this.container && typeof this.options.container === 'string') {
      this.container = document.getElementById(this.options.container);
    }

    if (!google || !this.container) {
      console.warn('[GoogleMapsController] Google Maps SDK unavailable for container:', this.container?.id || this.options.container);
      if (this.container) {
        this._renderFallbackMessage('Peta Google tidak dapat dimuatkan. Sila semak sambungan internet dan konfigurasi API key.');
      }
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

    // Flush all queued operations
    const ops = [...this.queuedOperations];
    this.queuedOperations = [];
    for (const op of ops) {
      try {
        op();
      } catch (err) {
        console.warn('[GoogleMapsController] Error executing queued op:', err);
      }
    }

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

  _renderFallbackMessage(msg) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height:110px; padding:16px; text-align:center; background:#FFF0F2; color:#C61E2F; border-radius:12px; font-family:sans-serif; border:1px solid #FECDD3;">
        <div style="font-size:1.5rem; margin-bottom:4px;">⚠️</div>
        <div style="font-weight:700; font-size:13px; margin-bottom:2px;">Paparan Peta Tidak Tersedia</div>
        <div style="font-size:11px; color:#526966; max-width:300px; line-height:1.4;">${msg}</div>
      </div>
    `;
  }

  /**
   * Triggers map resize and repositioning.
   */
  resize() {
    if (!this.isReady || !this.map || !window.google?.maps) return;
    window.google.maps.event.trigger(this.map, 'resize');
    if (this._lastFitBounds) {
      this.fitBounds(this._lastFitBounds.points, this._lastFitBounds.padding);
    }
  }

  /**
   * Alias for Leaflet/MapLibre invalidateSize compatibility.
   */
  invalidateSize() {
    return this.resize();
  }

  /**
   * Clears a specific polyline route.
   */
  clearRoute(routeId) {
    if (!this.isReady) {
      this.queuedOperations.push(() => this.clearRoute(routeId));
      return;
    }
    const existing = this.routes.get(routeId);
    if (existing) {
      existing.setMap(null);
      this.routes.delete(routeId);
    }
  }

  /**
   * Alias for MapLibre removeRoute compatibility.
   */
  removeRoute(routeId) {
    return this.clearRoute(routeId);
  }

  /**
   * Clears all drawn polyline routes.
   */
  clearAllRoutes() {
    if (!this.isReady) {
      this.queuedOperations.push(() => this.clearAllRoutes());
      return;
    }
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
    if (!this.isReady) {
      this.queuedOperations.push(() => this.setRoute(routeId, latLngPoints, options));
      return;
    }
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
    if (!this.isReady) {
      this.queuedOperations.push(() => this.addOrUpdateMarker(markerId, options));
      return;
    }
    if (!this.map || !window.google?.maps) return;
    this.removeMarker(markerId);

    const position = toGoogleLatLng(options.coords);
    const listeners = [];
    let marker = null;
    let infoWindow = null;

    // OverlayView for 100% custom HTML pins with pixel-perfect styling
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
          const onMove = (clientX, clientY) => {
            const projection = this.getProjection();
            const panes = this.getPanes();
            const targetPane = panes?.overlayMouseTarget || panes?.overlayLayer;
            if (projection && targetPane) {
              const mapRect = targetPane.getBoundingClientRect();
              const pixelX = clientX - mapRect.left;
              const pixelY = clientY - mapRect.top;
              const newLatLng = projection.fromContainerPixelToLatLng(new window.google.maps.Point(pixelX, pixelY));
              if (newLatLng) {
                this.pos = newLatLng;
                this.draw();
              }
            }
          };

          div.addEventListener('mousedown', (e) => {
            isDragging = true;
            div.style.cursor = 'grabbing';
            e.stopPropagation();
          });

          const mouseMoveHandler = (e) => {
            if (!isDragging) return;
            onMove(e.clientX, e.clientY);
          };

          const mouseUpHandler = () => {
            if (!isDragging) return;
            isDragging = false;
            div.style.cursor = 'grab';
            if (typeof this.onDragCallback === 'function') {
              this.onDragCallback([this.pos.lat(), this.pos.lng()]);
            }
          };

          window.addEventListener('mousemove', mouseMoveHandler);
          window.addEventListener('mouseup', mouseUpHandler);

          // Touch support for mobile & Android TWA / Bubblewrap
          div.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
              isDragging = true;
              e.stopPropagation();
            }
          }, { passive: true });

          const touchMoveHandler = (e) => {
            if (!isDragging || e.touches.length !== 1) return;
            onMove(e.touches[0].clientX, e.touches[0].clientY);
          };

          const touchEndHandler = () => {
            if (!isDragging) return;
            isDragging = false;
            if (typeof this.onDragCallback === 'function') {
              this.onDragCallback([this.pos.lat(), this.pos.lng()]);
            }
          };

          window.addEventListener('touchmove', touchMoveHandler, { passive: true });
          window.addEventListener('touchend', touchEndHandler, { passive: true });
        }

        if (typeof this.onClickCallback === 'function') {
          div.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onClickCallback();
          });
        }

        this.div = div;
        const panes = this.getPanes();
        const targetPane = panes?.overlayMouseTarget || panes?.overlayLayer;
        if (targetPane) {
          targetPane.appendChild(div);
        }
      }

      draw() {
        const overlayProjection = this.getProjection();
        if (!overlayProjection || !this.div) return;

        if (!this.div.parentNode) {
          const panes = this.getPanes();
          const targetPane = panes?.overlayMouseTarget || panes?.overlayLayer;
          if (targetPane) targetPane.appendChild(this.div);
        }

        const point = overlayProjection.fromLatLngToDivPixel(this.pos);
        if (point) {
          this.div.style.left = Math.round(point.x) + 'px';
          this.div.style.top = Math.round(point.y) + 'px';
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
            infoWindow.setPosition(overlay.getPosition());
            infoWindow.open(this.map);
          }
        }
      );
      overlay.setMap(this.map);
      marker = overlay;
    } else {
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
        maxWidth: 320
      });

      if (!options.customHtml && marker) {
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
    if (!this.isReady) {
      this.queuedOperations.push(() => this.removeMarker(markerId));
      return;
    }
    const item = this.markers.get(markerId);
    if (item) {
      item.listeners?.forEach(l => window.google?.maps?.event?.removeListener(l));
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
    if (!this.isReady) {
      this.queuedOperations.push(() => this.clearAllMarkers());
      return;
    }
    for (const [id] of this.markers.entries()) {
      this.removeMarker(id);
    }
  }

  /**
   * Fits the map viewport to contain all given coordinate points.
   * @param {Array<[number, number]>} latLngPoints
   * @param {Object|number} [padding] - { top, bottom, left, right } or number in px
   */
  fitBounds(latLngPoints, padding = { top: 25, bottom: 25, left: 25, right: 25 }) {
    if (!this.isReady) {
      this.queuedOperations.push(() => this.fitBounds(latLngPoints, padding));
      return;
    }
    if (!this.map || !window.google?.maps || !Array.isArray(latLngPoints) || !latLngPoints.length) return;

    this._lastFitBounds = { points: latLngPoints, padding };
    const bounds = new window.google.maps.LatLngBounds();
    latLngPoints.forEach(pt => {
      bounds.extend(toGoogleLatLng(pt));
    });

    const pad = typeof padding === 'number'
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : { top: padding?.top ?? 25, right: padding?.right ?? 25, bottom: padding?.bottom ?? 25, left: padding?.left ?? 25 };

    this.map.fitBounds(bounds, pad);
  }

  /**
   * Smoothly pans the map to a center point.
   */
  panTo(coord) {
    if (!this.isReady) {
      this.queuedOperations.push(() => this.panTo(coord));
      return;
    }
    if (!this.map) return;
    this.map.panTo(toGoogleLatLng(coord));
  }

  /**
   * Smoothly fly/zoom to point.
   */
  flyTo(coord, zoom = 12) {
    if (!this.isReady) {
      this.queuedOperations.push(() => this.flyTo(coord, zoom));
      return;
    }
    if (!this.map) return;
    this.map.setZoom(zoom);
    this.map.panTo(toGoogleLatLng(coord));
  }

  /**
   * Displays verified Al-Farhain network points (Hubs, Branches, Hospitals).
   */
  displayVerifiedNetworkPoints(options = {}) {
    if (!this.isReady) {
      this.queuedOperations.push(() => this.displayVerifiedNetworkPoints(options));
      return;
    }

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

    // 3. Key Hospitals
    if (options.includeTopHospitals) {
      PRESET_DESTINATIONS.slice(0, 5).forEach(h => {
        this.addOrUpdateMarker(`dest_${h.id}`, {
          coords: h.coords,
          customHtml: `
            <div style="background:#C61E2F; color:#fff; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(198,30,47,0.4); border:2px solid #fff; font-size:11px;">
              🚑
            </div>
          `,
          customPopupHtml: `
            <div style="font-size:0.8rem; padding:4px;">
              <strong style="color:#C61E2F;">${h.name}</strong>
              <div style="font-size:0.72rem; color:#64748B;">${h.address}</div>
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

    if (this._authFailureHandler && typeof window !== 'undefined') {
      window.removeEventListener('amc-gmaps-auth-failure', this._authFailureHandler);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.map = null;
    this.isReady = false;
    this.queuedOperations = [];
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
 * Places API Autocomplete Helper
 * 
 * Complies strictly with Google Maps Platform policies:
 * - Restricts search to Malaysia ('my').
 * - Biases search toward operating branch without preventing nationwide searches.
 * - Requests only required Basic/Essentials fields: ['name', 'formatted_address', 'geometry.location', 'place_id'].
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
    if (google.maps.places?.Autocomplete) {
      const autocomplete = new google.maps.places.Autocomplete(inputElement, {
        componentRestrictions: { country: 'my' },
        fields: ['name', 'formatted_address', 'geometry.location', 'place_id']
      });

      const circle = new google.maps.Circle({
        center: biasLatLng,
        radius: 50000 // 50 KM bias radius around operating hub
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
    console.warn('[GoogleMapsService] Autocomplete setup warning:', err);
  }

  return null;
}
