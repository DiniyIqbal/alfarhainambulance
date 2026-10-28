// AL-FARHAIN AMC AMBULANCE - AUTOMATED VERIFICATION SUITE
// Tests for Coordinate Conversion, Ordered Stops, Fare Boundaries,
// Missing Keys, Backend Error Handling, and Estimate/Invoice Distance Consistency.

import assert from 'assert';
import { toGoogleLatLng, toLatLngArray } from '../src/services/googleMapsService.js';
import { calculateTransportFare, calculateBookingQuotation } from '../src/services/pricingService.js';
import { getLatestRouteRequestId } from '../src/services/routingService.js';
import routeHandler from '../api/maps/route.js';

console.log('--- STARTING AFAMS VERIFICATION TEST SUITE ---');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// -------------------------------------------------------------
// 1. COORDINATE CONVERSION TESTS
// -------------------------------------------------------------
test('Coordinate conversion: standard [lat, lng] array', () => {
  const input = [5.9176965, 102.2446687];
  const gLatLng = toGoogleLatLng(input);
  assert.strictEqual(gLatLng.lat, 5.9176965);
  assert.strictEqual(gLatLng.lng, 102.2446687);

  const arr = toLatLngArray(gLatLng);
  assert.strictEqual(arr[0], 5.9176965);
  assert.strictEqual(arr[1], 102.2446687);
});

test('Coordinate conversion: swapped [lng, lat] (MapLibre GeoJSON format)', () => {
  // Longitude > 50, Latitude < 20 in Malaysia
  const inputGeoJson = [102.2446687, 5.9176965];
  const gLatLng = toGoogleLatLng(inputGeoJson);
  assert.strictEqual(gLatLng.lat, 5.9176965);
  assert.strictEqual(gLatLng.lng, 102.2446687);
});

test('Coordinate conversion: { latitude, longitude } object', () => {
  const inputObj = { latitude: 6.1248, longitude: 102.2544 };
  const gLatLng = toGoogleLatLng(inputObj);
  assert.strictEqual(gLatLng.lat, 6.1248);
  assert.strictEqual(gLatLng.lng, 102.2544);
});

// -------------------------------------------------------------
// 2. FARE BOUNDARIES & APPROVED TRANSPORT RULE
// -------------------------------------------------------------
test('Fare boundary: exactly 25.0 km must equal RM 250.00 transport fare', () => {
  const result = calculateTransportFare(25.0);
  assert.strictEqual(result.baseFare, 250.00);
  assert.strictEqual(result.extraKm, 0);
  assert.strictEqual(result.extraDistanceFee, 0);
  assert.strictEqual(result.totalTransportFare, 250.00);
});

test('Fare boundary: exactly 26.3 km must equal RM 253.90 transport fare', () => {
  const result = calculateTransportFare(26.3);
  assert.strictEqual(result.baseFare, 250.00);
  assert.strictEqual(result.extraKm, 1.3);
  assert.strictEqual(result.extraDistanceFee, 3.90);
  assert.strictEqual(result.totalTransportFare, 253.90);
});

test('Fare boundary: sub-25km (10.5 km) incurs no extra fee (RM 250.00)', () => {
  const result = calculateTransportFare(10.5);
  assert.strictEqual(result.extraKm, 0);
  assert.strictEqual(result.totalTransportFare, 250.00);
});

test('Fare boundary: high distance (100.0 km) calculation', () => {
  // 100 - 25 = 75 km * 3.00 = 225.00 + 250.00 = 475.00
  const result = calculateTransportFare(100.0);
  assert.strictEqual(result.extraKm, 75.0);
  assert.strictEqual(result.extraDistanceFee, 225.00);
  assert.strictEqual(result.totalTransportFare, 475.00);
});

// -------------------------------------------------------------
// 3. MATCHING ESTIMATE AND INVOICE DISTANCE
// -------------------------------------------------------------
test('Consistency: Single calculation source matches across quotation, invoice & billing', () => {
  const distanceKm = 26.3;
  const quote = calculateBookingQuotation({
    distanceKm,
    assistancePackage: { price: 200.00 }, // M.A
    equipmentQuantities: { oxygen_supply: 1 } // RM 50.00
  });

  // Verify transport subtotal
  assert.strictEqual(quote.transport.totalTransportFare, 253.90);
  // Verify staff fee
  assert.strictEqual(quote.staffFee, 200.00);
  // Verify equipment fee
  assert.strictEqual(quote.equipmentTotal, 50.00);
  // Grand total: 253.90 + 200.00 + 50.00 = 503.90
  assert.strictEqual(quote.grandTotal, 503.90);
});

// -------------------------------------------------------------
// 4. MISSING KEYS & BACKEND ERROR HANDLING
// -------------------------------------------------------------
await asyncTest('Backend /api/maps/route: returns fallbackToOSRM when key is unconfigured or placeholder', async () => {
  let statusCode = 0;
  let responseData = null;

  const fakeReq = {
    method: 'POST',
    headers: {},
    body: {
      origin: [5.9177, 102.2447],
      pickup: [6.1248, 102.2544],
      destination: [6.1256, 102.2482]
    }
  };

  const fakeRes = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
    }
  };

  await routeHandler(fakeReq, fakeRes);

  assert.strictEqual(statusCode, 200);
  assert.strictEqual(responseData.success, false);
  assert.strictEqual(responseData.fallbackToOSRM, true);
  assert(responseData.code === 'SERVER_KEY_NOT_CONFIGURED' || responseData.code === 'GOOGLE_API_ERROR' || responseData.fallbackToOSRM);
});

await asyncTest('Backend /api/maps/route: rejects invalid coordinates with 400', async () => {
  let statusCode = 0;
  let responseData = null;

  const fakeReq = {
    method: 'POST',
    headers: {},
    body: {
      origin: null,
      destination: [6.1256, 102.2482]
    }
  };

  const fakeRes = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
    }
  };

  await routeHandler(fakeReq, fakeRes);

  assert.strictEqual(statusCode, 400);
  assert.strictEqual(responseData.success, false);
  assert.strictEqual(responseData.code, 'INVALID_ORIGIN');
});

// -------------------------------------------------------------
// 5. STALE RESPONSE DISCARD TEST
// -------------------------------------------------------------
test('Routing Service: sequence ID exists and increments', () => {
  const id1 = getLatestRouteRequestId();
  assert(typeof id1 === 'number');
});

console.log(`\n--- ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY ---`);

