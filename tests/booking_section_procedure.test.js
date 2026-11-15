// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// AUTOMATED TEST SUITE: BOOKING SECTION & PROCEDURE SPECIFICATION
// Tests Regular Trip vs Event Standby, Pricing, Idempotency, and Validation
// =========================================================================

import assert from 'assert';

// Mock localStorage for Node.js test environment
if (typeof global.localStorage === 'undefined') {
  const store = new Map();
  global.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

import {
  createPatientBooking,
  deriveCustomerStatus,
  generateIdempotencyKey
} from '../src/services/bookingManagementService.js';

import {
  calculateBookingQuotation,
  calculateTransportFare
} from '../src/services/pricingService.js';

import {
  SERVICE_PACKAGES
} from '../src/data/pricingData.js';

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('🧪 RUNNING BOOKING SECTION & PROCEDURE VERIFICATION SUITE');
  console.log('=============================================================\n');

  // Test 1: Regular Trip Quotation & Snapshot Freezing
  test('1. Regular Trip: Calculates transport fare and freezes snapshots', async () => {
    const quote = calculateBookingQuotation({
      distanceKm: 28.5,
      servicePackage: SERVICE_PACKAGES[0], // Kecemasan Standard (RM250)
      isEventStandby: false
    });

    assert.strictEqual(quote.transport.baseFare, 250);
    assert.strictEqual(quote.transport.extraKm, 3.5);
    assert.strictEqual(quote.transport.extraDistanceFee, 10.50);
    assert.strictEqual(quote.grandTotal, 260.50);

    const payload = {
      invoiceNumber: 'AMC-20261115-1001',
      hubId: 'kok_lanas',
      originName: 'Bandar Kota Bharu',
      destinationName: 'Hospital Raja Perempuan Zainab II',
      pickupCoords: [6.1248, 102.2544],
      destinationCoords: [6.1256, 102.2482],
      patientName: 'Ahmad bin Razali',
      patientPhone: '012-3456789',
      patientEmail: 'ahmad@example.com',
      packageId: 'emergency_standard',
      baseFare: quote.transport.baseFare,
      extraKmCost: quote.transport.extraDistanceFee,
      totalFare: quote.grandTotal,
      distanceKm: 28.5,
      isScheduled: false
    };

    const result = await createPatientBooking(payload);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.booking_status, 'pending_approval');
    assert.strictEqual(result.data.assignment_status, 'unassigned');
    assert.strictEqual(result.data.trip_status, 'not_started');
    assert.strictEqual(result.data.total_fare, 260.50);
    assert.strictEqual(result.data.pricing_snapshot.baseFare, 250);
    assert.strictEqual(result.data.pricing_snapshot.extraKmCost, 10.50);
    assert.strictEqual(result.data.pricing_snapshot.totalFare, 260.50);
    assert.strictEqual(result.data.package_snapshot.name, 'Kecemasan Standard');
  });

  // Test 2: Event Standby Quotation & Pricing Tiers
  test('2. Event Standby: Calculates flat rates for 4h, 8h, 12h, and 24h tiers', () => {
    const q4 = calculateBookingQuotation({ isEventStandby: true, standbyHours: 4 });
    assert.strictEqual(q4.grandTotal, 450.00);
    assert.strictEqual(q4.transport.formulaText, 'Standby 4 Jam (Ambulans + Krew EMT)');

    const q8 = calculateBookingQuotation({ isEventStandby: true, standbyHours: 8 });
    assert.strictEqual(q8.grandTotal, 800.00);

    const q12 = calculateBookingQuotation({ isEventStandby: true, standbyHours: 12 });
    assert.strictEqual(q12.grandTotal, 1150.00);

    const q24 = calculateBookingQuotation({ isEventStandby: true, standbyHours: 24 });
    assert.strictEqual(q24.grandTotal, 2000.00);
  });

  // Test 3: Event Standby Booking Creation & Metadata Freezing
  test('3. Event Standby Booking: Freezes event name, duration, and standby rate', async () => {
    const payload = {
      invoiceNumber: 'AMC-20261115-2002',
      hubId: 'kok_lanas',
      originName: 'Stadium Sultan Muhammad IV',
      destinationName: 'Hospital Raja Perempuan Zainab II',
      pickupCoords: [6.1215, 102.2472],
      destinationCoords: [6.1256, 102.2482],
      patientName: 'Penganjur Sukan',
      patientPhone: '019-9876543',
      patientEmail: 'penganjur@sukan.my',
      isEventStandby: true,
      standbyHours: 8,
      standbyEventName: 'Kejohanan Ragbi Pantai Timur',
      baseFare: 800.00,
      extraKmCost: 0.00,
      totalFare: 800.00,
      tripType: 'Ambulance Standby (Event - 8 Jam)'
    };

    const res = await createPatientBooking(payload);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.is_event_standby, true);
    assert.strictEqual(res.data.standby_hours, 8);
    assert.strictEqual(res.data.standby_event_name, 'Kejohanan Ragbi Pantai Timur');
    assert.strictEqual(res.data.base_fare, 800.00);
    assert.strictEqual(res.data.total_fare, 800.00);
    assert.strictEqual(res.data.trip_type, 'Ambulance Standby (Event - 8 Jam)');
    assert.strictEqual(res.data.pricing_snapshot.baseFare, 800.00);
    assert.strictEqual(res.data.pricing_snapshot.totalFare, 800.00);
  });

  // Test 4: Validation Rule Checks
  test('4. Validation Rules: Rejects missing coords, patient info, and past dates', async () => {
    // 4a. Missing coordinates
    const r1 = await createPatientBooking({
      originName: 'Rumah',
      destinationName: 'Hospital',
      patientName: 'Abu',
      patientPhone: '0123456789'
    });
    assert.strictEqual(r1.success, false);
    assert(r1.error.includes('titik koordinat'));

    // 4b. Missing patient name & phone
    const r2 = await createPatientBooking({
      originName: 'Rumah',
      destinationName: 'Hospital',
      pickupCoords: [6.12, 102.24],
      patientName: '',
      patientPhone: ''
    });
    assert.strictEqual(r2.success, false);
    assert(r2.error.includes('Nama dan nombor telefon'));

    // 4c. Past scheduled time
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    const r3 = await createPatientBooking({
      originName: 'Rumah',
      destinationName: 'Hospital',
      pickupCoords: [6.12, 102.24],
      patientName: 'Abu',
      patientPhone: '0123456789',
      isScheduled: true,
      scheduledTime: pastDate
    });
    assert.strictEqual(r3.success, false);
    assert(r3.error.includes('waktu lampau'));

    // 4d. Valid future scheduled time passes
    const futureDate = new Date(Date.now() + 3600 * 1000 * 5).toISOString();
    const r4 = await createPatientBooking({
      originName: 'Rumah',
      destinationName: 'Hospital',
      pickupCoords: [6.12, 102.24],
      patientName: 'Abu',
      patientPhone: '0123456789',
      isScheduled: true,
      scheduledTime: futureDate
    });
    assert.strictEqual(r4.success, true);
    assert.strictEqual(r4.data.is_scheduled, true);
    assert.strictEqual(r4.data.scheduled_time, futureDate);
  });

  // Test 5: Idempotency Protection
  test('5. Idempotency: Duplicate booking submission returns existing record', async () => {
    const fixedKey = 'IDEMP-TEST-KEY-XYZ-999';
    const payload = {
      invoiceNumber: 'AMC-20261115-3003',
      idempotencyKey: fixedKey,
      originName: 'Klinik Kesihatan',
      destinationName: 'Hospital USM Kubang Kerian',
      pickupCoords: [6.0988, 102.2811],
      patientName: 'Siti Aminah',
      patientPhone: '013-1112233'
    };

    const first = await createPatientBooking(payload);
    assert.strictEqual(first.success, true);
    assert.strictEqual(first.isDuplicate, undefined);

    const second = await createPatientBooking(payload, [first.data]);
    assert.strictEqual(second.success, true);
    assert.strictEqual(second.isDuplicate, true);
    assert.strictEqual(second.data.invoice_number, first.data.invoice_number);
  });

  // Test 6: Online Payment vs Cash Settlement Procedure
  test('6. Payment Modes: Distinguishes between Cash upon arrival and Online CHIP', async () => {
    const cashBooking = await createPatientBooking({
      invoiceNumber: 'AMC-CASH-001',
      originName: 'Rumah',
      destinationName: 'HRPZ II',
      pickupCoords: [6.12, 102.25],
      patientName: 'Ali',
      patientPhone: '012-0000001',
      paymentMethod: 'cash',
      paymentStatus: 'unpaid'
    });
    assert.strictEqual(cashBooking.data.payment_method, 'cash');
    assert.strictEqual(cashBooking.data.payment_status, 'unpaid');
    assert.strictEqual(cashBooking.data.booking_status, 'pending_approval');

    const chipBooking = await createPatientBooking({
      invoiceNumber: 'AMC-CHIP-002',
      originName: 'Rumah',
      destinationName: 'HRPZ II',
      pickupCoords: [6.12, 102.25],
      patientName: 'Fatimah',
      patientPhone: '012-0000002',
      paymentMethod: 'chip',
      paymentStatus: 'pending'
    });
    assert.strictEqual(chipBooking.data.payment_method, 'chip');
    assert.strictEqual(chipBooking.data.payment_status, 'pending');
    assert.strictEqual(chipBooking.data.booking_status, 'pending_approval');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

