// =========================================================================
// AL-FARHAIN AMC - SERVICE PACKAGES & SIMPLIFIED BOOKING FLOW TEST SUITE
// Tests 4 service packages, bundled inclusions, 3-step flow, and fare calculation
// =========================================================================

import assert from 'assert';
import fs from 'fs';
import {
  SERVICE_PACKAGES,
  getServicePackageById,
  BASE_SETTINGS
} from '../src/data/pricingData.js';
import {
  calculateBookingQuotation,
  calculateTransportFare
} from '../src/services/pricingService.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('--- STARTING SERVICE PACKAGES TEST SUITE ---');

// Test 1: Exactly four service packages defined
test('Four service packages defined', () => {
  assert.strictEqual(SERVICE_PACKAGES.length, 4);
  const ids = SERVICE_PACKAGES.map(p => p.id);
  assert.deepStrictEqual(ids, [
    'emergency_standard',
    'non_emergency',
    'emergency_inhouse',
    'aed_critical'
  ]);
});

// Test 2: Package A: Kecemasan Standard — RM250
test('Package A: Kecemasan Standard specifications', () => {
  const pkgA = getServicePackageById('emergency_standard');
  assert.strictEqual(pkgA.name, 'Kecemasan Standard');
  assert.strictEqual(pkgA.baseFare, 250);
  assert.ok(pkgA.exampleCases.includes('Kes kecemasan umum'));
  assert.deepStrictEqual(pkgA.includedEquipment, [
    'Stretcher',
    'Spinal Board',
    'Scoop stretcher',
    'Vital Sign Monitor',
    'Immobilizer set',
    'Upper & Lower limb immobilizer set',
    'Sistem oksigen lengkap'
  ]);
  assert.deepStrictEqual(pkgA.includedStaff, ['Clinic Assistant (CA)']);
});

// Test 3: Package B: Bukan Kecemasan — RM250 (Staff omitted completely)
test('Package B: Bukan Kecemasan specifications (staff omitted)', () => {
  const pkgB = getServicePackageById('non_emergency');
  assert.strictEqual(pkgB.name, 'Bukan Kecemasan');
  assert.strictEqual(pkgB.baseFare, 250);
  assert.ok(pkgB.exampleCases.includes('Rujukan berjadual'));
  assert.deepStrictEqual(pkgB.includedEquipment, [
    'Stretcher',
    'Spinal Board',
    'Scoop stretcher',
    'Vital Sign Monitor',
    'Immobilizer set'
  ]);
  assert.strictEqual(pkgB.includedStaff.length, 0, 'No staff inclusion allowed for Bukan Kecemasan');
});

// Test 4: Package C: Kecemasan In-House — RM350
test('Package C: Kecemasan In-House specifications (has Ambu Bag & Suction unit)', () => {
  const pkgC = getServicePackageById('emergency_inhouse');
  assert.strictEqual(pkgC.name, 'Kecemasan In-House');
  assert.strictEqual(pkgC.baseFare, 350);
  assert.ok(pkgC.exampleCases.includes('Stabilisasi segera'));
  assert.ok(pkgC.includedEquipment.includes('Alat pernafasan (Ambu Bag)'));
  assert.ok(pkgC.includedEquipment.includes('Suction unit'));
  assert.deepStrictEqual(pkgC.includedStaff, [
    'Medical Assistant (MA) / Nurse',
    'Medical Officer (MO)'
  ]);
});

// Test 5: Package D: Kecemasan Kritikal + AED — RM500
test('Package D: Kecemasan Kritikal + AED specifications (has AED, NO Ambu/Suction)', () => {
  const pkgD = getServicePackageById('aed_critical');
  assert.strictEqual(pkgD.name, 'Kecemasan Kritikal + AED');
  assert.strictEqual(pkgD.baseFare, 500);
  assert.ok(pkgD.exampleCases.includes('Serangan jantung'));
  assert.ok(pkgD.includedEquipment.includes('AED Equipment'));
  assert.ok(!pkgD.includedEquipment.includes('Alat pernafasan (Ambu Bag)'), 'AED package must NOT have Ambu Bag');
  assert.ok(!pkgD.includedEquipment.includes('Suction unit'), 'AED package must NOT have Suction unit');
  assert.deepStrictEqual(pkgD.includedStaff, [
    'Medical Assistant (MA) / Nurse',
    'Medical Officer (MO)'
  ]);
});

// Test 6: Inclusions bundled at RM0 extra
test('Quotation bundles included items without extra charges', () => {
  const quoteA = calculateBookingQuotation({
    distanceKm: 20.0,
    packageId: 'emergency_standard'
  });
  assert.strictEqual(quoteA.grandTotal, 250.00);
  assert.strictEqual(quoteA.staffFee, 0.00);
  assert.strictEqual(quoteA.equipmentTotal, 0.00);

  const quoteC = calculateBookingQuotation({
    distanceKm: 20.0,
    packageId: 'emergency_inhouse'
  });
  assert.strictEqual(quoteC.grandTotal, 350.00);

  const quoteD = calculateBookingQuotation({
    distanceKm: 20.0,
    packageId: 'aed_critical'
  });
  assert.strictEqual(quoteD.grandTotal, 500.00);
});

// Test 7: Distance charges preserved (> 25km adds RM3.00/km)
test('Distance charges applied accurately above 25 km threshold', () => {
  // 26.3 km = 25.0 km base + 1.3 km * RM3.00 = base + RM3.90
  const quoteA = calculateBookingQuotation({
    distanceKm: 26.3,
    packageId: 'emergency_standard'
  });
  assert.strictEqual(quoteA.transport.baseFare, 250.00);
  assert.strictEqual(quoteA.transport.extraKm, 1.3);
  assert.strictEqual(quoteA.transport.extraDistanceFee, 3.90);
  assert.strictEqual(quoteA.grandTotal, 253.90);

  const quoteD = calculateBookingQuotation({
    distanceKm: 26.3,
    packageId: 'aed_critical'
  });
  assert.strictEqual(quoteD.transport.baseFare, 500.00);
  assert.strictEqual(quoteD.transport.extraDistanceFee, 3.90);
  assert.strictEqual(quoteD.grandTotal, 503.90);
});

// Test 8: Index.html has exactly 3 dispatch stepper nodes and 3 calc-step-pages
test('HTML booking flow has simplified 3-step navigation', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('stepper-3-nodes'), 'Stepper has 3 nodes container');
  assert.ok(html.includes('data-step="1"'), 'Step 1 exists');
  assert.ok(html.includes('data-step="2"'), 'Step 2 exists');
  assert.ok(html.includes('data-step="3"'), 'Step 3 exists');
  assert.ok(!html.includes('data-step="4"'), 'Step 4 removed from calculator');
  assert.ok(!html.includes('data-step="5"'), 'Step 5 removed from calculator');
  assert.ok(html.includes('serviceCardsContainer'), 'serviceCardsContainer exists');
  assert.ok(html.includes('Teruskan ke Invois'), 'Sticky button text matches mockup');
});

console.log(`\n--- ALL ${passed} SERVICE PACKAGES TESTS PASSED SUCCESSFULLY ---`);

