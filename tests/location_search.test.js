// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// Automated Verification Suite: Location Search, Classification & Facility Directory

import assert from 'assert';
import {
  searchVerifiedFacilities,
  findVerifiedFacilityMatch,
  calculateDirectDistanceKm,
  VERIFIED_FACILITIES
} from '../src/data/verifiedFacilitiesData.js';
import {
  LocationSearchSession,
  SEARCH_REGIONS,
  PICKUP_CATEGORIES
} from '../src/services/locationSearchService.js';
import {
  calculateTransportFare,
  calculateBookingQuotation
} from '../src/services/pricingService.js';
import { haversineKm } from '../src/services/routingService.js';

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
  console.log('🧪 RUNNING PICKUP LOCATION & SEARCH COVERAGE TEST SUITE');
  console.log('=============================================================\n');

  test('1. Verified Clinics: Klinik Jega, Klinik Hojaz, and Klinik Insaf resolve with exact coordinates', () => {
    // 1. Klinik Jega
    const jegaMatches = searchVerifiedFacilities('Klinik Jega');
    assert.ok(jegaMatches.length > 0, 'Must find Klinik Jega');
    const jega = jegaMatches[0];
    assert.strictEqual(jega.name, 'Klinik Jega');
    assert.strictEqual(jega.category, 'Klinik Swasta');
    assert.ok(jega.address.includes('15000 Kota Bharu'), 'Must have verified Kota Bharu address');
    assert.ok(Math.abs(jega.coords[0] - 6.128789) < 0.001, 'Must have verified latitude');
    assert.ok(Math.abs(jega.coords[1] - 102.238062) < 0.001, 'Must have verified longitude');

    // 2. Klinik Hojaz (matching alias "Hojaz" for official Klinik Hijaz 24 Jam)
    const hojazMatches = searchVerifiedFacilities('Hojaz');
    assert.ok(hojazMatches.length > 0, 'Must find Klinik Hojaz through alias');
    const hojaz = hojazMatches[0];
    assert.ok(hojaz.name.includes('Hijaz') || hojaz.name.includes('Hojaz'));
    assert.strictEqual(hojaz.category, 'Klinik Swasta');
    assert.ok(hojaz.address.includes('Kok Lanas'), 'Must have verified Kok Lanas address');
    assert.ok(Math.abs(hojaz.coords[0] - 5.9220) < 0.001, 'Must have verified latitude');

    // 3. Klinik Insaf
    const insafMatches = searchVerifiedFacilities('Insaf');
    assert.ok(insafMatches.length > 0, 'Must find Klinik Insaf');
    const insaf = insafMatches[0];
    assert.strictEqual(insaf.name, 'Klinik Insaf');
    assert.strictEqual(insaf.category, 'Klinik Swasta');
    assert.ok(insaf.address.includes('Tanjong Mas') || insaf.address.includes('15400 Kota Bharu'), 'Must have verified address');
    assert.ok(Math.abs(insaf.coords[0] - 6.137149) < 0.001, 'Must have verified latitude');
  });

  test('2. Facility Classification: Correctly distinguishes Hospital Kerajaan vs Hospital Swasta vs Klinik Swasta', () => {
    const hrpz = searchVerifiedFacilities('HRPZ')[0];
    assert.ok(hrpz, 'HRPZ II must exist');
    assert.strictEqual(hrpz.category, 'Hospital Kerajaan', 'HRPZ II must be classified as Hospital Kerajaan');

    const husm = searchVerifiedFacilities('Hospital USM')[0];
    assert.ok(husm, 'HUSM must exist');
    assert.strictEqual(husm.category, 'Hospital Kerajaan', 'HUSM must be classified as Hospital Kerajaan');

    const kpj = searchVerifiedFacilities('KPJ Perdana')[0];
    assert.ok(kpj, 'KPJ Perdana must exist');
    assert.strictEqual(kpj.category, 'Hospital Swasta', 'KPJ Perdana must be classified as Hospital Swasta');

    const kbmc = searchVerifiedFacilities('KBMC')[0];
    assert.ok(kbmc, 'KBMC must exist');
    assert.strictEqual(kbmc.category, 'Hospital Swasta', 'KBMC must be classified as Hospital Swasta');

    const kk = searchVerifiedFacilities('KK Ketereh')[0];
    assert.ok(kk, 'KK Ketereh must exist');
    assert.strictEqual(kk.category, 'Klinik Kesihatan', 'KK Ketereh must be classified as Klinik Kesihatan');
  });

  test('3. Category Chips Filtering: Restricts results when specified without hiding verified items', () => {
    // Hospital Kerajaan filter
    const govHospitals = searchVerifiedFacilities('', { category: 'Hospital Kerajaan' });
    assert.ok(govHospitals.length >= 5, 'Should return government hospitals');
    govHospitals.forEach(h => {
      assert.strictEqual(h.category, 'Hospital Kerajaan', 'Only Hospital Kerajaan should be returned');
    });

    // Klinik Swasta filter
    const privateClinics = searchVerifiedFacilities('', { category: 'Klinik Swasta' });
    assert.ok(privateClinics.length >= 5, 'Should return private clinics');
    privateClinics.forEach(c => {
      assert.ok(['Klinik Swasta', 'Klinik Kesihatan'].includes(c.category), 'Only clinics should be returned');
    });

    // Broad search (Semua) includes all categories
    const allFacilities = searchVerifiedFacilities('', { category: 'all', limit: 50 });
    const categoriesFound = new Set(allFacilities.map(f => f.category));
    assert.ok(categoriesFound.has('Hospital Kerajaan'), 'Should contain Hospital Kerajaan');
    assert.ok(categoriesFound.has('Hospital Swasta'), 'Should contain Hospital Swasta');
    assert.ok(categoriesFound.has('Klinik Swasta'), 'Should contain Klinik Swasta');
  });

  test('4. Straight-Line Distance Calculation: Accurately computes direct km without confusion with road billing distance', () => {
    const kokLanasCoords = [5.9176965, 102.2446687];
    const hrpzCoords = [6.1256, 102.2482];

    const directDist = calculateDirectDistanceKm(kokLanasCoords, hrpzCoords);
    assert.ok(directDist > 20 && directDist < 26, `Direct distance should be ~23 km (got ${directDist})`);

    const matchesWithDistance = searchVerifiedFacilities('HRPZ', { refCoords: kokLanasCoords });
    assert.ok(matchesWithDistance[0].directDistanceKm !== null, 'Direct distance must be attached');
    assert.strictEqual(matchesWithDistance[0].directDistanceKm, directDist);
  });

  test('5. Deduplication and Matcher: Matches existing verified records by Place ID or name/coords', () => {
    const match = findVerifiedFacilityMatch({ name: 'Klinik Dr Jega' });
    assert.ok(match, 'Should find Klinik Jega via Dr Jega alias');
    assert.strictEqual(match.name, 'Klinik Jega');

    const coordMatch = findVerifiedFacilityMatch({ coords: [6.1256, 102.2482] });
    assert.ok(coordMatch, 'Should find HRPZ II by near-proximity coordinates');
    assert.strictEqual(coordMatch.id, 'fac_hrpz2');
  });

  test('6. LocationSearchSession Lifecycle: Request ID sequencing and debouncing', async () => {
    let capturedResults = null;
    let loadingState = false;

    const session = new LocationSearchSession({
      hubCoords: [5.9176965, 102.2446687],
      onResults: (res) => {
        capturedResults = res;
      },
      onLoading: (isLoading) => {
        loadingState = isLoading;
      }
    });

    // Instant execution for empty query returns default category list
    await session.executeSearch('', { immediate: true });
    assert.ok(capturedResults && capturedResults.length > 0, 'Empty query should return default facilities');
    assert.strictEqual(loadingState, false, 'Loading should be false after completion');

    // Simulate typing "Jega"
    await session.executeSearch('Jega', { immediate: true });
    assert.ok(capturedResults.some(r => r.name === 'Klinik Jega'), 'Must contain Klinik Jega in results');

    session.destroy();
  });

  test('7. Five Primary Pickup Categories: Supports all patient collection points', () => {
    const expectedCategories = [
      'Rumah / Kediaman',
      'Hospital Kerajaan',
      'Hospital Swasta',
      'Klinik Swasta',
      'Lain-lain'
    ];

    const session = new LocationSearchSession({
      hubCoords: [5.9176965, 102.2446687]
    });

    // 1. Rumah / Kediaman
    const residential = session.mergeAndClassifyResults({
      presets: [{ name: 'Kediaman Kota Bharu', category: 'Rumah / Kediaman' }],
      category: 'Rumah / Kediaman'
    });
    assert.ok(residential.length > 0, 'Must support Rumah / Kediaman');

    // 2. Hospital Kerajaan
    const gov = session.mergeAndClassifyResults({
      verified: searchVerifiedFacilities('HRPZ', { category: 'Hospital Kerajaan' }),
      category: 'Hospital Kerajaan'
    });
    assert.ok(gov.some(g => g.category === 'Hospital Kerajaan'), 'Must support Hospital Kerajaan');

    // 3. Hospital Swasta
    const privateHosp = session.mergeAndClassifyResults({
      verified: searchVerifiedFacilities('KPJ', { category: 'Hospital Swasta' }),
      category: 'Hospital Swasta'
    });
    assert.ok(privateHosp.some(p => p.category === 'Hospital Swasta'), 'Must support Hospital Swasta');

    // 4. Klinik Swasta
    const privateClinic = session.mergeAndClassifyResults({
      verified: searchVerifiedFacilities('Jega', { category: 'Klinik Swasta' }),
      category: 'Klinik Swasta'
    });
    assert.ok(privateClinic.some(c => c.category === 'Klinik Swasta'), 'Must support Klinik Swasta');

    session.destroy();
  });

  test('8. Exact Pickup Pin Adjustment & Non-Duplication of Access Segment', () => {
    const hubCoords = [5.9176965, 102.2446687]; // Kok Lanas HQ
    const initialHrpzCoords = [6.1256, 102.2482]; // Main facility
    const adjustedEntranceCoords = [6.1265, 102.2490]; // Specific A&E entrance

    const destCoords = [6.1001, 102.2828]; // HUSM

    // Calculate Leg 1 and Leg 2 before adjustment
    const leg1Before = haversineKm(hubCoords, initialHrpzCoords, 1.28);
    const leg2Before = haversineKm(initialHrpzCoords, destCoords, 1.28);
    const totalBefore = Math.round((leg1Before + leg2Before) * 10) / 10;

    // Calculate Leg 1 and Leg 2 after entrance adjustment
    const leg1After = haversineKm(hubCoords, adjustedEntranceCoords, 1.28);
    const leg2After = haversineKm(adjustedEntranceCoords, destCoords, 1.28);
    const totalAfter = Math.round((leg1After + leg2After) * 10) / 10;

    // Both legs seamlessly use the adjusted entrance coordinate without double counting
    assert.ok(leg1After > 0 && leg2After > 0);
    assert.ok(Math.abs(totalAfter - totalBefore) < 1.0, 'Entrance adjustment does not double-count segments');

    // Approved fare formula test: 26.3 km -> RM 253.90
    const fare26_3 = calculateTransportFare(26.3);
    assert.strictEqual(fare26_3.totalTransportFare, 253.90, 'Fare formula must remain exactly RM253.90 for 26.3 km');
  });

  console.log('\n-------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runTests();
