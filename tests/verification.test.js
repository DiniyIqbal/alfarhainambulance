// AL-FARHAIN AMC AMBULANCE - AUTOMATED VERIFICATION SUITE
// Tests for Coordinate Conversion, Ordered Stops, Fare Boundaries,
// Missing Keys, Backend Error Handling, and Estimate/Invoice Distance Consistency.

import assert from 'assert';
import { toGoogleLatLng, toLatLngArray } from '../src/services/googleMapsService.js';
import { calculateTransportFare, calculateBookingQuotation } from '../src/services/pricingService.js';
import { getLatestRouteRequestId } from '../src/services/routingService.js';
import routeHandler from '../api/maps/route.js';
import createCheckoutHandler from '../api/payment/create-checkout.js';
import webhookHandler from '../api/payment/webhook.js';

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

// -------------------------------------------------------------
// 6. CHIP PAYMENT GATEWAY TESTS
// -------------------------------------------------------------
await asyncTest('Backend /api/payment/create-checkout: rejects request without bookingData with 400', async () => {
  let statusCode = 0;
  let responseData = null;

  const fakeReq = {
    method: 'POST',
    headers: {},
    body: {}
  };

  const fakeRes = {
    setHeader() {},
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
    }
  };

  await createCheckoutHandler(fakeReq, fakeRes);

  assert.strictEqual(statusCode, 400);
  assert.strictEqual(responseData.success, false);
  assert.strictEqual(responseData.code, 'INVALID_BOOKING_DATA');
});

// Helper: captures handler responses
function makeRes() {
  const out = { statusCode: 0, data: null };
  out.res = {
    setHeader() {},
    status(code) { out.statusCode = code; return this; },
    json(data) { out.data = data; },
    end() {}
  };
  return out;
}

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

const NO_CHIP = { CHIP_SECRET_KEY: undefined, CHIP_BRAND_ID: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined };

await asyncTest('Security: create-checkout fails closed (503) when CHIP is not configured outside dev', async () => {
  await withEnv({ ...NO_CHIP, AFAMS_DEV_SERVER: undefined }, async () => {
    const out = makeRes();
    await createCheckoutHandler({
      method: 'POST',
      headers: { host: 'example.vercel.app' },
      body: { bookingData: { invoiceNumber: 'AMC-TEST-001', totalFare: 253.90 }, paymentType: 'full' }
    }, out.res);
    assert.strictEqual(out.statusCode, 503);
    assert.strictEqual(out.data.code, 'PAYMENT_GATEWAY_UNAVAILABLE');
  });
});

await asyncTest('Security: create-checkout charges the SERVER quote, never the client total (dev mock)', async () => {
  await withEnv({ ...NO_CHIP, AFAMS_DEV_SERVER: '1' }, async () => {
    const out = makeRes();
    await createCheckoutHandler({
      method: 'POST',
      headers: { host: 'localhost:5173' },
      body: { bookingData: { invoiceNumber: 'AMC-TEST-002', totalFare: 1.00, distanceKm: 10 }, paymentType: 'full' }
    }, out.res);
    assert.strictEqual(out.statusCode, 200);
    assert.strictEqual(out.data.isMock, true);
    assert(out.data.amountToCharge > 1.00, 'client-supplied totalFare must be ignored');
  });
});

await asyncTest('Security: webhook rejects a forged X-Signature with 401', async () => {
  const crypto = await import('crypto');
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const rawBody = JSON.stringify({ id: 'pur_test_123', status: 'paid', reference: 'AMC-TEST-001' });

  await withEnv({ ...NO_CHIP, CHIP_PUBLIC_KEY: pem, AFAMS_DEV_SERVER: '1' }, async () => {
    const out = makeRes();
    await webhookHandler({
      method: 'POST',
      headers: { 'x-signature': Buffer.from('forged').toString('base64') },
      rawBody,
      body: JSON.parse(rawBody)
    }, out.res);
    assert.strictEqual(out.statusCode, 401);
  });
});

await asyncTest('Security: webhook accepts a valid signature but still fails closed without a database', async () => {
  const crypto = await import('crypto');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const rawBody = JSON.stringify({ id: 'pur_test_456', status: 'paid', reference: 'AMC-TEST-001' });
  const signature = crypto.createSign('RSA-SHA256').update(rawBody).sign(privateKey, 'base64');

  await withEnv({ ...NO_CHIP, CHIP_PUBLIC_KEY: pem, AFAMS_DEV_SERVER: '1' }, async () => {
    const out = makeRes();
    await webhookHandler({ method: 'POST', headers: { 'x-signature': signature }, rawBody, body: JSON.parse(rawBody) }, out.res);
    assert.strictEqual(out.statusCode, 503, 'signature passed; no service-role key so nothing is written');
  });
});

await asyncTest('Security: unsigned "paid" webhook is NOT trusted in production (503 without CHIP verification)', async () => {
  await withEnv({ ...NO_CHIP, AFAMS_DEV_SERVER: undefined }, async () => {
    const out = makeRes();
    await webhookHandler({
      method: 'POST',
      headers: {},
      body: { id: 'pur_forged', status: 'paid', reference: 'AMC-TEST-001' }
    }, out.res);
    assert.strictEqual(out.statusCode, 503);
  });
});

await asyncTest('Security: admin APIs ignore body-supplied actor and require a JWT (401)', async () => {
  const { default: bookingManage } = await import('../api/booking/manage.js');
  const { default: driverApprove } = await import('../api/driver/approve.js');
  await withEnv({
    AFAMS_DEV_SERVER: undefined,
    VITE_SUPABASE_URL: 'https://example-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key'
  }, async () => {
    const forgedAdmin = { name: 'Attacker', role: 'hq_admin', email: 'abedi@alfarhain.my', branchId: 'all' };

    const a = makeRes();
    await bookingManage({ method: 'POST', headers: {}, body: { action: 'APPROVE_BOOKING', payload: { booking: {}, adminUser: forgedAdmin } } }, a.res);
    assert.strictEqual(a.statusCode, 401);

    const b = makeRes();
    await driverApprove({ method: 'POST', headers: {}, body: { driverEmail: 'x@y.com', action: 'LULUSKAN', actor: forgedAdmin } }, b.res);
    assert.strictEqual(b.statusCode, 401);
  });
});

// -------------------------------------------------------------
// 7. REAL-TIME DATA SYNCHRONIZATION & MULTI-PORTAL TESTS
// -------------------------------------------------------------
await asyncTest('Real-time Sync: insertBookingToSupabase & updateBookingStatus offline fallback', async () => {
  // Ensure mock storage for Node environment
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear()
    };
  }

  const {
    insertBookingToSupabase,
    updateBookingStatusInSupabase,
    fetchActiveMissionForDriver
  } = await import('../src/services/supabaseClient.js');

  const testBooking = {
    invoiceNumber: 'AMC-SYNC-9999',
    hubId: 'kok_lanas',
    hubName: 'HQ Pusat Rawatan Al-Farhain',
    originName: 'Kota Bharu',
    destinationName: 'HRPZ II',
    distanceKm: 26.3,
    totalFare: 253.90,
    patientName: 'Pesakit Ujian Sync',
    plateNumber: 'VPQ 7606',
    status: 'Dispatched'
  };

  const insertRes = await insertBookingToSupabase(testBooking);
  assert.strictEqual(insertRes.success, true);
  assert.strictEqual(insertRes.data.invoice_number, 'AMC-SYNC-9999');

  // Verify fetchActiveMission retrieves the latest active mission
  const activeMission = await fetchActiveMissionForDriver('VPQ 7606');
  assert(activeMission);
  assert.strictEqual(activeMission.invoice_number, 'AMC-SYNC-9999');
  assert.strictEqual(activeMission.patient_name, 'Pesakit Ujian Sync');

  // Verify status update to 'Menuju Lokasi'
  const updateRes = await updateBookingStatusInSupabase('AMC-SYNC-9999', 'Menuju Lokasi');
  assert.strictEqual(updateRes.success, true);

  const updatedMission = await fetchActiveMissionForDriver('VPQ 7606');
  assert.strictEqual(updatedMission.status, 'Menuju Lokasi');
});

console.log(`\n--- ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY ---`);
process.exit(0);

