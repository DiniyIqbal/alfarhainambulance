// AL-FARHAIN MEDICAL CENTER (AMC) - AMBULANCE ROUTING & DISTANCE SERVICE
// High-precision road calculation engine (OSRM + Malaysian Road Network Winding Calibration + Geocoding)

/**
 * Calculates Great-Circle distance using Haversine formula, calibrated with
 * the Malaysian Federal Road Network winding factor (tortuosity factor ~1.28).
 * Used for instant, zero-delay preliminary estimates and offline fallback.
 */
export function haversineKm(coord1, coord2, windingFactor = 1.28) {
  if (!coord1 || !coord2 || coord1.length < 2 || coord2.length < 2) return 0;
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;

  const R = 6371; // Earth radius in KM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const directKm = R * c;

  return Math.round(directKm * windingFactor * 10) / 10;
}

/**
 * Estimates driving duration in minutes based on distance and average ambulance speed.
 */
export function estimateDurationMin(distanceKm, isEmergency = true) {
  // Speed model: Urban short distance ~35km/h, highway/rural ~65km/h, emergency siren ~70km/h
  let avgSpeedKmh = 45;
  if (distanceKm > 40) avgSpeedKmh = isEmergency ? 68 : 58;
  else if (distanceKm > 15) avgSpeedKmh = isEmergency ? 52 : 44;
  else avgSpeedKmh = isEmergency ? 40 : 34;

  const hours = distanceKm / avgSpeedKmh;
  return Math.max(3, Math.round(hours * 60));
}

/**
 * Fetches real road routing geometry and precise driving distances via OSRM.
 * Returns exact road curvature coordinates for Leaflet polyline and exact leg distances.
 */
export async function fetchRoadRoute(originCoords, pickupCoords, destCoords) {
  // Prepare fallback immediately
  const fallbackLeg1Km = haversineKm(originCoords, pickupCoords, 1.26);
  const fallbackLeg2Km = haversineKm(pickupCoords, destCoords, 1.26);
  const fallbackTotalKm = Math.round((fallbackLeg1Km + fallbackLeg2Km) * 10) / 10;

  const fallbackResult = {
    success: false,
    isRealRoad: false,
    leg1Km: fallbackLeg1Km,
    leg1DurationMin: estimateDurationMin(fallbackLeg1Km),
    leg2Km: fallbackLeg2Km,
    leg2DurationMin: estimateDurationMin(fallbackLeg2Km),
    totalKm: fallbackTotalKm,
    totalDurationMin: estimateDurationMin(fallbackTotalKm),
    fullGeometry: [originCoords, pickupCoords, destCoords],
    leg1Geometry: [originCoords, pickupCoords],
    leg2Geometry: [pickupCoords, destCoords]
  };

  try {
    const coordsStr = `${originCoords[1]},${originCoords[0]};${pickupCoords[1]},${pickupCoords[0]};${destCoords[1]},${destCoords[0]}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
      throw new Error('OSRM no route found');
    }

    const route = data.routes[0];
    const legs = route.legs || [];

    const leg1Meters = legs[0]?.distance ?? (fallbackLeg1Km * 1000);
    const leg1Sec = legs[0]?.duration ?? (fallbackResult.leg1DurationMin * 60);

    const leg2Meters = legs[1]?.distance ?? (fallbackLeg2Km * 1000);
    const leg2Sec = legs[1]?.duration ?? (fallbackResult.leg2DurationMin * 60);

    const leg1Km = Math.round((leg1Meters / 1000) * 10) / 10;
    const leg2Km = Math.round((leg2Meters / 1000) * 10) / 10;
    const totalKm = Math.round((route.distance / 1000) * 10) / 10 || Math.round((leg1Km + leg2Km) * 10) / 10;

    // GeoJSON coordinates come in [lon, lat], Leaflet expects [lat, lon]
    const fullLatLngs = (route.geometry?.coordinates || []).map(coord => [coord[1], coord[0]]);

    // Find closest point to pickupCoords to split into leg1 & leg2 polylines
    let splitIdx = Math.floor(fullLatLngs.length / 2);
    let minD = Infinity;
    fullLatLngs.forEach((pt, idx) => {
      const d = Math.hypot(pt[0] - pickupCoords[0], pt[1] - pickupCoords[1]);
      if (d < minD) {
        minD = d;
        splitIdx = idx;
      }
    });

    const leg1LatLngs = fullLatLngs.slice(0, splitIdx + 1);
    const leg2LatLngs = fullLatLngs.slice(splitIdx);

    return {
      success: true,
      isRealRoad: true,
      leg1Km,
      leg1DurationMin: Math.max(2, Math.round(leg1Sec / 60)),
      leg2Km,
      leg2DurationMin: Math.max(2, Math.round(leg2Sec / 60)),
      totalKm,
      totalDurationMin: Math.max(4, Math.round(route.duration / 60)),
      fullGeometry: fullLatLngs.length > 2 ? fullLatLngs : fallbackResult.fullGeometry,
      leg1Geometry: leg1LatLngs.length > 1 ? leg1LatLngs : fallbackResult.leg1Geometry,
      leg2Geometry: leg2LatLngs.length > 1 ? leg2LatLngs : fallbackResult.leg2Geometry
    };
  } catch (err) {
    console.warn('[RoutingService] OSRM live routing unavailable or timed out, using calibrated fallback:', err.message);
    return fallbackResult;
  }
}

/**
 * Geocodes user text address to coordinates using Photon (Komoot OSM) with Nominatim fallback.
 */
export async function searchAddressGeocode(query, preferredState = 'Kelantan') {
  if (!query || query.trim().length < 2) return [];

  const cleanQuery = query.trim();
  const searchTerms = `${cleanQuery} Malaysia`;

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchTerms)}&limit=6`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.features && data.features.length) {
        return data.features
          .filter(f => {
            const country = (f.properties.country || '').toLowerCase();
            return !country || country === 'malaysia';
          })
          .map(f => {
            const p = f.properties;
            const parts = [p.name, p.street, p.district, p.city, p.state, p.postcode].filter(Boolean);
            const fullAddress = parts.join(', ');
            return {
              id: `geo_${f.geometry.coordinates[0]}_${f.geometry.coordinates[1]}`,
              name: p.name || parts[0] || cleanQuery,
              address: fullAddress,
              area: p.city || p.district || p.state || preferredState,
              coords: [f.geometry.coordinates[1], f.geometry.coordinates[0]] // [lat, lon]
            };
          });
      }
    }
  } catch (err) {
    console.warn('[RoutingService] Photon geocode error:', err.message);
  }

  // Fallback to OpenStreetMap Nominatim
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&countrycodes=my&limit=5`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(nomUrl, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'ms,en' }
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        return data.map(item => ({
          id: `nom_${item.place_id}`,
          name: item.display_name.split(',')[0],
          address: item.display_name,
          area: item.type || preferredState,
          coords: [parseFloat(item.lat), parseFloat(item.lon)]
        }));
      }
    }
  } catch (err) {
    console.warn('[RoutingService] Nominatim fallback error:', err.message);
  }

  return [];
}
