// AL-FARHAIN AMC AMBULANCE - VERCEL SERVERLESS FUNCTION
// POST /api/maps/route
// High-Precision Route & Distance Calculation via Google Maps Routes API (v2)
// Strictly server-side: Never exposes GOOGLE_MAPS_SERVER_KEY to client or logs.

/**
 * In-memory sliding window rate limiter (per client IP)
 * Prevents API quota abuse and DoS on serverless instances.
 */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60;     // 60 calls per minute per IP

function isRateLimited(clientIp) {
  if (!clientIp) return false;
  const now = Date.now();
  const record = rateLimitMap.get(clientIp);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(clientIp, { startTime: now, count: 1 });
    return false;
  }

  record.count += 1;
  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  return false;
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.startTime > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref?.();

/**
 * Decodes Google Maps Encoded Polyline into an array of [lat, lng] coordinates.
 */
function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];
  const points = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/**
 * Validates and normalizes coordinate to { latitude, longitude } object.
 * Rejects invalid ranges or out-of-bounds coordinates.
 */
function normalizeCoordinate(coord) {
  if (!coord) return null;
  let lat = null;
  let lng = null;

  if (Array.isArray(coord) && coord.length >= 2) {
    lat = Number(coord[0]);
    lng = Number(coord[1]);
    // Malaysia longitude is ~99 to 119, latitude is ~1 to 8
    // If first element is longitude (>50) and second is latitude (<20), reverse them
    if (lat > 50 && lng < 20) {
      const temp = lat;
      lat = lng;
      lng = temp;
    }
  } else if (typeof coord === 'object') {
    lat = Number(coord.lat ?? coord.latitude);
    lng = Number(coord.lng ?? coord.lon ?? coord.longitude);
  }

  if (lat == null || isNaN(lat) || lng == null || isNaN(lng)) return null;

  // Global latitude and longitude boundary checks
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { latitude: lat, longitude: lng };
}

export default async function handler(req, res) {
  // Method verification (Allow POST, support GET for diagnostic health checks)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  // Rate Limiting Check
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.headers['x-real-ip'] ||
                   req.socket?.remoteAddress ||
                   'local';

  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'Kadar permintaan terlalu tinggi. Sila cuba sebentar lagi.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  // Parse payload
  let payload = {};
  if (req.method === 'POST') {
    if (typeof req.body === 'string') {
      try {
        payload = JSON.parse(req.body);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Format JSON tidak sah.',
          code: 'INVALID_JSON'
        });
      }
    } else {
      payload = req.body || {};
    }
  } else {
    payload = req.query || {};
  }

  const {
    origin,
    destination,
    pickup,
    destination2,
    intermediates = [],
    travelMode = 'DRIVE',
    routingPreference = 'TRAFFIC_UNAWARE'
  } = payload;

  // Validate coordinates
  const originNorm = normalizeCoordinate(origin);
  const destNorm = normalizeCoordinate(destination2 || destination);

  if (!originNorm) {
    return res.status(400).json({
      success: false,
      error: 'Koordinat asal (origin) diperlukan dan mestilah sah.',
      code: 'INVALID_ORIGIN'
    });
  }

  if (!destNorm) {
    return res.status(400).json({
      success: false,
      error: 'Koordinat destinasi (destination) diperlukan dan mestilah sah.',
      code: 'INVALID_DESTINATION'
    });
  }

  // Build ordered intermediate stops
  // Multi-leg AFAMS Dispatch Model:
  // Leg 1: origin -> pickup
  // Leg 2: pickup -> destination 1
  // Leg 3 (optional): destination 1 -> destination 2 / return
  const rawIntermediates = [];

  if (pickup) {
    rawIntermediates.push(pickup);
  }

  // If destination2 is specified, destination 1 becomes an intermediate stop
  if (destination2 && destination) {
    rawIntermediates.push(destination);
  }

  if (Array.isArray(intermediates) && intermediates.length > 0) {
    rawIntermediates.push(...intermediates);
  }

  // Waypoint limit check (maximum 5 intermediate stops to prevent billing spikes)
  if (rawIntermediates.length > 5) {
    return res.status(400).json({
      success: false,
      error: 'Maksimum 5 hentian perantaraan sahaja dibenarkan.',
      code: 'WAYPOINT_LIMIT_EXCEEDED'
    });
  }

  const validIntermediates = [];
  for (const item of rawIntermediates) {
    const norm = normalizeCoordinate(item);
    if (norm) {
      validIntermediates.push({
        location: {
          latLng: {
            latitude: norm.latitude,
            longitude: norm.longitude
          }
        }
      });
    }
  }

  // Check Google Maps Server Key
  const serverApiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  const isKeyPlaceholder = !serverApiKey ||
    serverApiKey === 'REPLACE_WITH_DEVELOPMENT_SERVER_KEY' ||
    serverApiKey === 'YOUR_BACKEND_ROUTES_KEY' ||
    serverApiKey.trim().length === 0;

  if (isKeyPlaceholder) {
    return res.status(200).json({
      success: false,
      fallbackToOSRM: true,
      message: 'GOOGLE_MAPS_SERVER_KEY belum dikonfigurasi. Sila gunakan sandaran OSRM.',
      code: 'SERVER_KEY_NOT_CONFIGURED'
    });
  }

  const hasLeg3 = Boolean(destination2 && destination);

  // Construct Routes API (v2) computeRoutes Request
  const requestBody = {
    origin: {
      location: {
        latLng: {
          latitude: originNorm.latitude,
          longitude: originNorm.longitude
        }
      }
    },
    destination: {
      location: {
        latLng: {
          latitude: destNorm.latitude,
          longitude: destNorm.longitude
        }
      }
    },
    travelMode: travelMode === 'DRIVE' ? 'DRIVE' : 'DRIVE',
    routingPreference: routingPreference === 'TRAFFIC_AWARE' ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE'
  };

  if (validIntermediates.length > 0) {
    requestBody.intermediates = validIntermediates;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const apiResponse = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': serverApiKey.trim(),
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!apiResponse.ok) {
      const errText = await apiResponse.text().catch(() => '');
      let reason = `HTTP_${apiResponse.status}`;
      try {
        const parsed = JSON.parse(errText);
        reason = parsed?.error?.details?.[0]?.reason || parsed?.error?.status || reason;
      } catch {}

      if (apiResponse.status === 400 || apiResponse.status === 403) {
        console.info(`[Google Routes API] Status ${apiResponse.status} (${reason}). Seamlessly using high-precision OSRM fallback.`);
      } else {
        console.warn(`[Google Routes API HTTP ${apiResponse.status}]:`, reason);
      }

      return res.status(200).json({
        success: false,
        fallbackToOSRM: true,
        error: `Google Routes API HTTP ${apiResponse.status} (${reason})`,
        code: reason
      });
    }

    const data = await apiResponse.json();

    if (!data.routes || !data.routes.length) {
      return res.status(200).json({
        success: false,
        fallbackToOSRM: true,
        error: 'Tiada laluan jalan raya ditemui bagi koordinat yang diberikan.',
        code: 'NO_ROUTE_FOUND'
      });
    }

    const route = data.routes[0];
    const legs = route.legs || [];

    // Parse duration string e.g. "1245s" -> seconds
    const parseDurationSec = (durStr) => {
      if (!durStr) return 0;
      return parseFloat(String(durStr).replace('s', '')) || 0;
    };

    const totalDistanceMeters = route.distanceMeters || 0;
    const totalDurationSec = parseDurationSec(route.duration);

    // Extract per-leg metrics
    const leg1Meters = legs[0]?.distanceMeters ?? (totalDistanceMeters / Math.max(1, legs.length));
    const leg1Sec = parseDurationSec(legs[0]?.duration);

    const leg2Meters = legs[1]?.distanceMeters ?? (hasLeg3 ? 0 : (totalDistanceMeters - leg1Meters));
    const leg2Sec = parseDurationSec(legs[1]?.duration);

    const leg3Meters = hasLeg3 ? (legs[2]?.distanceMeters ?? 0) : 0;
    const leg3Sec = hasLeg3 ? parseDurationSec(legs[2]?.duration) : 0;

    const leg1Km = Math.round((leg1Meters / 1000) * 10) / 10;
    const leg2Km = Math.round((leg2Meters / 1000) * 10) / 10;
    const leg3Km = hasLeg3 ? Math.round((leg3Meters / 1000) * 10) / 10 : 0;
    const totalKm = Math.round((totalDistanceMeters / 1000) * 10) / 10 || Math.round((leg1Km + leg2Km + leg3Km) * 10) / 10;

    const leg1DurationMin = Math.max(1, Math.round(leg1Sec / 60));
    const leg2DurationMin = Math.max(1, Math.round(leg2Sec / 60));
    const leg3DurationMin = hasLeg3 ? Math.max(1, Math.round(leg3Sec / 60)) : 0;
    const totalDurationMin = Math.max(2, Math.round(totalDurationSec / 60));

    // Decode polyline geometry
    const fullGeometry = decodePolyline(route.polyline?.encodedPolyline);

    // Split geometry into approximate legs based on waypoint count if individual step polylines are absent
    let leg1Geometry = fullGeometry;
    let leg2Geometry = fullGeometry;
    let leg3Geometry = null;

    if (fullGeometry.length > 2) {
      const numSegments = hasLeg3 ? 3 : 2;
      const seg1 = Math.floor(fullGeometry.length / numSegments);
      const seg2 = hasLeg3 ? Math.floor((fullGeometry.length * 2) / 3) : fullGeometry.length;

      leg1Geometry = fullGeometry.slice(0, seg1 + 1);
      leg2Geometry = hasLeg3 ? fullGeometry.slice(seg1, seg2 + 1) : fullGeometry.slice(seg1);
      leg3Geometry = hasLeg3 ? fullGeometry.slice(seg2) : null;
    }

    return res.status(200).json({
      success: true,
      provider: 'google_routes_v2',
      isRealRoad: true,
      hasLeg3,
      totalKm,
      totalDurationMin,
      distanceMeters: totalDistanceMeters,
      durationSeconds: totalDurationSec,
      leg1Km,
      leg1DurationMin,
      leg2Km,
      leg2DurationMin,
      leg3Km,
      leg3DurationMin,
      fullGeometry,
      leg1Geometry,
      leg2Geometry,
      leg3Geometry
    });

  } catch (err) {
    console.warn('[POST /api/maps/route Exception]:', err.message);
    return res.status(200).json({
      success: false,
      fallbackToOSRM: true,
      error: err.message,
      code: 'REQUEST_TIMEOUT_OR_NETWORK_ERROR'
    });
  }
}

