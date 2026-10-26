// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - REUSABLE MAPLIBRE GL JS SERVICE
// High-performance vector tile basemap with OpenFreeMap Liberty style
// =========================================================================

import {
  Map as MapLibreMap,
  Marker,
  Popup,
  NavigationControl,
  AttributionControl,
  LngLatBounds,
  setWorkerUrl
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { HUBS, OTHER_BRANCHES, PRESET_DESTINATIONS } from '../data/pricingData.js';

// Configure MapLibre Web Worker explicitly for Vite bundler
if (maplibreWorkerUrl && typeof setWorkerUrl === 'function') {
  try {
    setWorkerUrl(maplibreWorkerUrl);
  } catch (err) {
    console.warn('[MapLibreService] Failed to set explicit worker URL, falling back to default:', err);
  }
}

/**
 * Official Basemap Style URL (OpenFreeMap Liberty)
 * Fully open-source vector tiles, no API keys or paid subscriptions required.
 */
export const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

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

/**
 * Check if WebGL / WebGPU graphics acceleration is supported by the client.
 */
export function isMapLibreSupported() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl') || canvas.getContext('webgl2'))
    );
  } catch {
    return false;
  }
}

/**
 * Coordinate Boundary Conversion Helpers:
 * Stored database / pricing data format: [latitude, longitude]
 * MapLibre GL / GeoJSON format:          [longitude, latitude]
 */

/**
 * Converts [lat, lng] or {lat, lng} to MapLibre [lng, lat]
 * @param {Array<number>|Object} coord - [latitude, longitude] or {lat, lng}
 * @returns {[number, number]} [longitude, latitude]
 */
export function toLngLat(coord) {
  if (!coord) return [102.2446687, 5.9176965]; // Default: Kok Lanas HQ [lng, lat]

  if (Array.isArray(coord)) {
    if (coord.length < 2) return [102.2446687, 5.9176965];
    const [c0, c1] = coord;
    // Malaysia longitude is ~99 to 119, latitude is ~1 to 7.
    // If first element is already longitude (>50), return as-is
    if (c0 > 50 && c1 < 20) {
      return [c0, c1];
    }
    // Standard Leaflet [lat, lon] -> MapLibre [lon, lat]
    return [c1, c0];
  }

  if (typeof coord === 'object') {
    const lat = coord.lat ?? coord.latitude;
    const lng = coord.lng ?? coord.lon ?? coord.longitude;
    return [Number(lng), Number(lat)];
  }

  return [102.2446687, 5.9176965];
}

/**
 * Converts MapLibre [lng, lat] to Leaflet / Database [lat, lng]
 * @param {Array<number>|Object} coord - [longitude, latitude] or {lng, lat}
 * @returns {[number, number]} [latitude, longitude]
 */
export function toLatLng(coord) {
  if (!coord) return [5.9176965, 102.2446687];

  if (Array.isArray(coord)) {
    if (coord.length < 2) return [5.9176965, 102.2446687];
    const [c0, c1] = coord;
    // If first element is latitude (<20), it is already [lat, lon]
    if (c0 < 20 && c1 > 50) {
      return [c0, c1];
    }
    // MapLibre [lon, lat] -> Leaflet [lat, lon]
    return [c1, c0];
  }

  if (typeof coord === 'object') {
    const lat = coord.lat ?? coord.latitude;
    const lng = coord.lng ?? coord.lon ?? coord.longitude;
    return [Number(lat), Number(lng)];
  }

  return [5.9176965, 102.2446687];
}

/**
 * Converts an array of [lat, lng] points (from routingService.js) to MapLibre GeoJSON coordinates [[lng, lat], ...]
 * @param {Array<[number, number]>} latLngPoints 
 * @returns {Array<[number, number]>}
 */
export function convertGeometryToLngLat(latLngPoints) {
  if (!Array.isArray(latLngPoints)) return [];
  return latLngPoints.map(pt => toLngLat(pt));
}

/**
 * Reusable MapLibre GL Map Controller
 */
export class AmcMapLibreController {
  /**
   * @param {Object} options
   * @param {string|HTMLElement} options.container - Container element ID or node
   * @param {Array<number>} [options.center=[5.9176965, 102.2446687]] - Initial center [lat, lng]
   * @param {number} [options.zoom=8] - Initial zoom level
   * @param {boolean} [options.interactive=true] - Enable map interaction
   * @param {boolean} [options.showNavigation=true] - Show zoom & compass controls
   * @param {boolean} [options.showAttribution=true] - Show required attribution
   * @param {string} [options.customStyleUrl] - Custom vector style URL (defaults to OpenFreeMap Liberty)
   * @param {Function} [options.onReady] - Map ready callback
   * @param {Function} [options.onClick] - Map click callback (receives [lat, lng])
   */
  constructor(options = {}) {
    this.options = {
      center: [5.9176965, 102.2446687], // Kok Lanas HQ [lat, lng]
      zoom: 8,
      interactive: true,
      showNavigation: true,
      showAttribution: true,
      customStyleUrl: OPENFREEMAP_LIBERTY_STYLE,
      ...options
    };

    this.container = typeof this.options.container === 'string'
      ? document.getElementById(this.options.container)
      : this.options.container;

    this.map = null;
    this.isReady = false;
    this.markers = new Map(); // id -> { marker, el, config }
    this.routes = new Map();  // routeId -> { sourceId, layerId }
    this.resizeObserver = null;
    this.queuedOperations = [];

    this._init();
  }

  _init() {
    if (!this.container) {
      console.warn('[AmcMapLibre] Container not found:', this.options.container);
      return;
    }

    // 1. Hardware acceleration & WebGL support check
    if (!isMapLibreSupported()) {
      console.error('[AmcMapLibre] WebGL is not supported in this browser/device.');
      this._renderFallbackMessage('Akselerasi WebGL tidak disokong pada pelayar atau peranti ini. Sila semak tetapan pecutan perkakasan (Hardware Acceleration).');
      return;
    }

    try {
      const initialCenterLngLat = toLngLat(this.options.center);

      this.map = new MapLibreMap({
        container: this.container,
        style: this.options.customStyleUrl,
        center: initialCenterLngLat,
        zoom: this.options.zoom,
        attributionControl: false, // We add custom configured attribution control below
        interactive: this.options.interactive
      });

      // 2. Attribution Control (OpenFreeMap + OpenStreetMap + Al-Farhain AMC)
      if (this.options.showAttribution) {
        const attribution = new AttributionControl({
          compact: true,
          customAttribution: '© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> • <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> • AMC Ambulans'
        });
        this.map.addControl(attribution, 'bottom-right');
      }

      // 3. Navigation Controls (Zoom in, Zoom out, Pitch/Bearing reset)
      if (this.options.showNavigation && this.options.interactive) {
        const nav = new NavigationControl({
          showCompass: true,
          showZoom: true,
          visualizePitch: true
        });
        this.map.addControl(nav, 'top-right');
      }

      // 4. Map Load Event
      this.map.on('load', () => {
        this.isReady = true;

        // Process any queued routes or markers added before style load
        this.queuedOperations.forEach(op => {
          try { op(); } catch (e) { console.warn('[AmcMapLibre] Queued op error:', e); }
        });
        this.queuedOperations = [];

        if (typeof this.options.onReady === 'function') {
          this.options.onReady(this);
        }
      });

      // 5. Map Click Event (Boundaries converted back to [lat, lng])
      if (typeof this.options.onClick === 'function') {
        this.map.on('click', (e) => {
          const lat = Math.round(e.lngLat.lat * 100000) / 100000;
          const lng = Math.round(e.lngLat.lng * 100000) / 100000;
          this.options.onClick({
            coords: [lat, lng],
            lat,
            lng,
            originalEvent: e
          });
        });
      }

      // 6. Responsive ResizeObserver (Handles hidden tabs, drawer toggles & mobile resizing)
      this._setupResizeObserver();

      // 7. Error Handling
      this.map.on('error', (e) => {
        // Suppress benign style sprite/tile 404 warnings without crashing the app
        if (e && e.error && !e.error.message?.includes('404')) {
          console.warn('[AmcMapLibre] Map event warning:', e.error);
        }
      });

    } catch (err) {
      console.error('[AmcMapLibre] Initialization exception:', err);
      this._renderFallbackMessage('Ralat semasa memuatkan enjin peta MapLibre GL. Menggunakan mod sandaran.');
    }
  }

  _setupResizeObserver() {
    if (typeof ResizeObserver === 'undefined' || !this.container) return;

    let resizeTimer = null;
    this.resizeObserver = new ResizeObserver(() => {
      // Debounce resize to prevent excessive layout thrashing
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.map && this.container.offsetWidth > 0 && this.container.offsetHeight > 0) {
          this.map.resize();
        }
      }, 100);
    });

    this.resizeObserver.observe(this.container);

    // Also observe visibility changes (e.g., user returns to tab)
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible' && this.map) {
        setTimeout(() => this.map.resize(), 150);
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  _renderFallbackMessage(msg) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height:220px; padding:24px; text-align:center; background:#FFF0F2; color:#C61E2F; border-radius:12px; font-family:sans-serif; border:1px solid #FECDD3;">
        <div style="font-size:2rem; margin-bottom:8px;">⚠️</div>
        <div style="font-weight:700; font-size:14px; margin-bottom:4px;">Paparan Peta Vektor Tidak Tersedia</div>
        <div style="font-size:12px; color:#526966; max-width:320px;">${msg}</div>
      </div>
    `;
  }

  /**
   * Safely invalidates size / triggers container resize
   */
  resize() {
    if (this.map) {
      this.map.resize();
    }
  }

  /**
   * Alias for Leaflet backwards compatibility
   */
  invalidateSize() {
    this.resize();
  }

  /**
   * Smoothly fly to given [lat, lng]
   * @param {Array<number>} coords - [latitude, longitude]
   * @param {number} [zoom=12]
   */
  flyTo(coords, zoom = 12) {
    if (!this.map) return;
    const lngLat = toLngLat(coords);
    this.map.flyTo({
      center: lngLat,
      zoom,
      essential: true,
      duration: 1200
    });
  }

  /**
   * Fit map viewport to encompass a list of coordinates
   * @param {Array<Array<number>>} coordsList - Array of [lat, lng]
   * @param {Object} [padding={ top: 40, bottom: 40, left: 40, right: 40 }]
   */
  fitBounds(coordsList, padding = { top: 40, bottom: 40, left: 40, right: 40 }) {
    if (!this.map || !coordsList || coordsList.length === 0) return;

    let padObj = { top: 40, bottom: 40, left: 40, right: 40 };
    if (typeof padding === 'number') {
      padObj = { top: padding, bottom: padding, left: padding, right: padding };
    } else if (Array.isArray(padding)) {
      if (padding.length === 2) {
        padObj = { top: padding[0], bottom: padding[0], left: padding[1], right: padding[1] };
      } else if (padding.length >= 4) {
        padObj = { top: padding[0], right: padding[1], bottom: padding[2], left: padding[3] };
      }
    } else if (typeof padding === 'object' && padding !== null) {
      padObj = {
        top: padding.top ?? 40,
        bottom: padding.bottom ?? 40,
        left: padding.left ?? 40,
        right: padding.right ?? 40
      };
    }

    const bounds = new LngLatBounds();
    coordsList.forEach(coord => {
      bounds.extend(toLngLat(coord));
    });

    if (!bounds.isEmpty()) {
      this.map.fitBounds(bounds, { padding: padObj, maxZoom: 16, duration: 800 });
    }
  }

  /**
   * Draws a real road route line using OSRM geometry from routingService.js
   * @param {string} routeId - Unique route identifier (e.g. 'primaryRoute', 'leg1Route')
   * @param {Array<[number, number]>} latLngGeometry - Coordinates [[lat, lng], ...]
   * @param {Object} [options]
   * @param {string} [options.color='#C61E2F'] - Line color
   * @param {number} [options.width=5] - Line width in px
   * @param {number} [options.opacity=0.9] - Line opacity
   * @param {Array<number>} [options.dashArray] - Dash array pattern (e.g. [2, 2])
   * @param {boolean} [options.autoFit=true] - Automatically fit map to route
   */
  setRoute(routeId, latLngGeometry, options = {}) {
    const doSet = () => {
      if (!this.map || !latLngGeometry || latLngGeometry.length < 2) return;

      const sourceId = `source-${routeId}`;
      const layerId = `layer-${routeId}`;
      const color = options.color || AMC_MAP_COLORS.primaryRed;
      const width = options.width || 5;
      const opacity = options.opacity || 0.9;

      const lngLatCoords = convertGeometryToLngLat(latLngGeometry);

      const geojsonData = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: lngLatCoords
        }
      };

      const existingSource = this.map.getSource(sourceId);
      if (existingSource) {
        existingSource.setData(geojsonData);
      } else {
        this.map.addSource(sourceId, {
          type: 'geojson',
          data: geojsonData
        });

        const layerDef = {
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': color,
            'line-width': width,
            'line-opacity': opacity
          }
        };

        if (options.dashArray) {
          layerDef.paint['line-dasharray'] = options.dashArray;
        }

        this.map.addLayer(layerDef);
        this.routes.set(routeId, { sourceId, layerId });
      }

      if (options.autoFit !== false && lngLatCoords.length > 0) {
        this.fitBounds(latLngGeometry, options.padding || { top: 50, bottom: 50, left: 50, right: 50 });
      }
    };

    if (this.isReady) {
      doSet();
    } else {
      this.queuedOperations.push(doSet);
    }
  }

  /**
   * Removes a route layer and source
   * @param {string} routeId
   */
  removeRoute(routeId) {
    if (!this.map) return;
    const info = this.routes.get(routeId);
    if (info) {
      if (this.map.getLayer(info.layerId)) this.map.removeLayer(info.layerId);
      if (this.map.getSource(info.sourceId)) this.map.removeSource(info.sourceId);
      this.routes.delete(routeId);
    }
  }

  /**
   * Clear all active routes
   */
  clearAllRoutes() {
    this.routes.forEach((_, id) => this.removeRoute(id));
  }

  /**
   * Adds or updates a custom DOM marker without rebuilding the map.
   * Demonstrates Requirement 8: Shows last-update timestamp.
   * @param {string} id - Unique marker ID
   * @param {Object} config
   * @param {Array<number>} config.coords - [lat, lng]
   * @param {string} [config.type='ambulance'] - 'ambulance' | 'hub' | 'pickup' | 'hospital' | 'custom'
   * @param {string} [config.plate] - e.g. 'VPQ 7606'
   * @param {string} [config.driver] - e.g. 'Abe Di / Syalihan'
   * @param {string} [config.status] - e.g. 'Menuju lokasi', 'Bersedia'
   * @param {string} [config.title] - Marker title
   * @param {string} [config.subtitle] - Marker subtitle
   * @param {boolean} [config.isSelected=false] - Selected marker styling (#C61E2F highlight)
   * @param {boolean} [config.draggable=false] - Is marker draggable
   * @param {Date|string} [config.timestamp] - Last GPS update timestamp
   * @param {Function} [config.onDragEnd] - Callback when dragged ([lat, lng])
   * @param {Function} [config.onClick] - Click callback
   */
  addOrUpdateMarker(id, config = {}) {
    const doMarker = () => {
      if (!this.map) return;

      const coords = config.coords || this.options.center;
      const lngLat = toLngLat(coords);
      const isSelected = Boolean(config.isSelected);
      const timestamp = config.timestamp ? new Date(config.timestamp) : new Date();
      const timeStr = timestamp.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // If marker already exists, smoothly update coordinates and content without tearing down!
      if (this.markers.has(id)) {
        const item = this.markers.get(id);
        item.marker.setLngLat(lngLat);

        // Update DOM element content & classes
        this._updateMarkerDOM(item.el, config, timeStr, isSelected);

        // Update popup if exists
        const popup = item.marker.getPopup();
        if (popup) {
          popup.setHTML(this._buildPopupHTML(config, timeStr));
        }

        item.config = config;
        return;
      }

      // Create new custom DOM element
      const el = document.createElement('div');
      el.className = `amc-maplibre-marker marker-type-${config.type || 'ambulance'}${isSelected ? ' is-selected' : ''}`;
      el.id = `amc-marker-${id}`;
      this._updateMarkerDOM(el, config, timeStr, isSelected);

      const marker = new Marker({
        element: el,
        draggable: Boolean(config.draggable),
        anchor: 'bottom'
      }).setLngLat(lngLat);

      // Create popup
      const popup = new Popup({
        offset: [0, -32],
        closeButton: true,
        closeOnClick: false,
        className: 'amc-map-popup'
      }).setHTML(this._buildPopupHTML(config, timeStr));

      marker.setPopup(popup);
      marker.addTo(this.map);

      // Draggable callback (converts boundary back to [lat, lng])
      if (config.draggable) {
        marker.on('dragend', () => {
          const pos = marker.getLngLat();
          const lat = Math.round(pos.lat * 100000) / 100000;
          const lng = Math.round(pos.lng * 100000) / 100000;
          if (typeof config.onDragEnd === 'function') {
            config.onDragEnd([lat, lng]);
          }
        });
      }

      // Click callback
      el.addEventListener('click', (e) => {
        if (typeof config.onClick === 'function') {
          config.onClick(id, config);
        }
      });

      this.markers.set(id, { marker, el, config });
    };

    if (this.isReady) {
      doMarker();
    } else {
      this.queuedOperations.push(doMarker);
    }
  }

  _updateMarkerDOM(el, config, timeStr, isSelected) {
    if (config.customHtml) {
      el.innerHTML = config.customHtml;
      return;
    }

    const type = config.type || 'ambulance';
    const isReady = config.status === 'Bersedia';
    const statusBg = isReady ? AMC_MAP_COLORS.readyGreen : AMC_MAP_COLORS.primaryRed;
    const highlightRing = isSelected ? `box-shadow: 0 0 0 4px ${AMC_MAP_COLORS.highlightPink}, 0 6px 18px rgba(198,30,47,0.45);` : 'box-shadow: 0 3px 12px rgba(0,0,0,0.25);';

    if (type === 'ambulance') {
      el.innerHTML = `
        <div class="amc-amb-badge" style="display:flex; align-items:center; gap:6px; background:${statusBg}; color:#FFFFFF; padding:4px 10px; border-radius:9999px; font-size:11px; font-weight:800; font-family:var(--font-sans, sans-serif); border:2px solid #FFFFFF; ${highlightRing} cursor:pointer; transition:transform 0.2s ease;">
          <span style="font-size:13px;">🚑</span>
          <span>${config.plate || 'Ambulans'}</span>
          <span style="background:rgba(255,255,255,0.25); padding:1px 6px; border-radius:4px; font-size:9px;">${config.status || 'Aktif'}</span>
        </div>
        <div class="amc-marker-pulse-dot" style="width:8px; height:8px; background:${statusBg}; border-radius:50%; margin:2px auto 0 auto; border:1.5px solid #FFF;"></div>
      `;
    } else if (type === 'hub') {
      el.innerHTML = `
        <div class="amc-hub-badge" style="display:flex; align-items:center; gap:5px; background:${AMC_MAP_COLORS.deepTeal}; color:#FFFFFF; padding:4px 9px; border-radius:9999px; font-size:10px; font-weight:700; border:2px solid #FFFFFF; ${highlightRing} cursor:pointer;">
          <span>🏛️</span>
          <span>${config.title || 'Pangkalan'}</span>
        </div>
      `;
    } else if (type === 'hospital') {
      el.innerHTML = `
        <div class="amc-hosp-badge" style="display:flex; align-items:center; gap:5px; background:${AMC_MAP_COLORS.primaryRed}; color:#FFFFFF; padding:4px 9px; border-radius:9999px; font-size:10px; font-weight:700; border:2px solid #FFFFFF; ${highlightRing} cursor:pointer;">
          <span>🏥</span>
          <span>${config.title || 'Hospital'}</span>
        </div>
      `;
    } else if (type === 'pickup') {
      el.innerHTML = `
        <div class="amc-pickup-badge" style="display:flex; align-items:center; gap:5px; background:${AMC_MAP_COLORS.primaryRed}; color:#FFFFFF; padding:4px 9px; border-radius:9999px; font-size:10px; font-weight:700; border:2px solid #FFFFFF; box-shadow:0 0 0 3px ${AMC_MAP_COLORS.highlightPink}, 0 4px 12px rgba(198,30,47,0.35); cursor:grab;">
          <span>📍</span>
          <span>${config.title || 'Pesakit'}</span>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div style="background:${AMC_MAP_COLORS.primaryRed}; color:#FFF; padding:3px 8px; border-radius:9999px; font-size:10px; font-weight:700; border:1.5px solid #FFF;">
          ${config.title || 'Lokasi'}
        </div>
      `;
    }
  }

  _buildPopupHTML(config, timeStr) {
    if (config.customPopupHtml) {
      return config.customPopupHtml;
    }

    const isAmbulance = (config.type || 'ambulance') === 'ambulance';
    const isReady = config.status === 'Bersedia';
    const statusColor = isReady ? AMC_MAP_COLORS.readyGreen : AMC_MAP_COLORS.primaryRed;

    return `
      <div style="font-family:var(--font-sans, sans-serif); padding:4px 2px; color:#1E293B; min-width:180px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px; border-bottom:1px solid #F1F5F9; padding-bottom:4px;">
          <strong style="color:${AMC_MAP_COLORS.primaryRed}; font-size:13px;">${config.plate || config.title || 'Lokasi AMC'}</strong>
          <span style="font-size:10px; background:${statusColor}; color:#FFF; padding:1px 6px; border-radius:4px; font-weight:700;">
            ${config.status || (isAmbulance ? 'Aktif' : 'Disahkan')}
          </span>
        </div>
        ${config.driver ? `<div style="font-size:11px; color:#526966; margin-top:2px;">Pemandu: <b style="color:#1E293B;">${config.driver}</b></div>` : ''}
        ${config.subtitle ? `<div style="font-size:11px; color:#64748B; margin-top:2px;">${config.subtitle}</div>` : ''}
        ${config.hubName ? `<div style="font-size:11px; color:#64748B; margin-top:1px;">Hub: <b>${config.hubName}</b></div>` : ''}
        <div style="font-size:10px; color:#94A3B8; margin-top:6px; border-top:1px dashed #E2E8F0; padding-top:4px; display:flex; align-items:center; gap:4px;">
          <span>📡 GPS Terkini:</span>
          <b style="color:#007D77;">${timeStr}</b>
        </div>
      </div>
    `;
  }

  /**
   * Removes a marker by ID
   * @param {string} id
   */
  removeMarker(id) {
    const item = this.markers.get(id);
    if (item) {
      item.marker.remove();
      this.markers.delete(id);
    }
  }

  /**
   * Clears all markers
   */
  clearAllMarkers() {
    this.markers.forEach(item => item.marker.remove());
    this.markers.clear();
  }

  /**
   * Displays all verified AMC hubs and major hospitals on the map
   */
  displayVerifiedNetworkPoints(options = {}) {
    // 1. Hubs (Kok Lanas HQ & Raub)
    Object.values(HUBS).forEach(hub => {
      this.addOrUpdateMarker(`hub_${hub.id}`, {
        coords: hub.coords,
        type: 'hub',
        title: hub.shortName,
        subtitle: hub.name,
        hubName: hub.state
      });
    });

    // 2. Other Branches
    if (options.includeAllBranches) {
      OTHER_BRANCHES.forEach(b => {
        this.addOrUpdateMarker(`branch_${b.id}`, {
          coords: b.coords,
          type: 'hub',
          title: b.name.replace('Al-Farhain Medical Center (', '').replace(')', ''),
          subtitle: b.name,
          hubName: b.state
        });
      });
    }

    // 3. Top Hospitals
    if (options.includeTopHospitals) {
      const topHospitals = PRESET_DESTINATIONS.filter(d => d.id.includes('hrpz') || d.id.includes('husm') || d.id.includes('kualalipis') || d.id.includes('raub')).slice(0, 4);
      topHospitals.forEach(h => {
        this.addOrUpdateMarker(`hosp_${h.id}`, {
          coords: h.coords,
          type: 'hospital',
          title: h.shortName || h.name,
          subtitle: h.category
        });
      });
    }
  }

  /**
   * Component cleanup: destroys map instance, unhooks observers and frees WebGL contexts
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    this.clearAllMarkers();
    this.clearAllRoutes();
    if (this.map) {
      try {
        this.map.remove();
      } catch (err) {
        console.warn('[AmcMapLibre] Error during map remove:', err);
      }
      this.map = null;
    }
    this.isReady = false;
  }
}

/**
 * Factory helper function to instantiate AmcMapLibreController
 * @param {string|HTMLElement} container
 * @param {Object} options
 * @returns {AmcMapLibreController}
 */
export function createAmcMap(container, options = {}) {
  return new AmcMapLibreController({
    container,
    ...options
  });
}
