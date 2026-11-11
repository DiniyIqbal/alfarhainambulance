// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// Comprehensive Test Suite: "Perkhidmatan & Servis" Management Module

import assert from 'assert';
import {
  initServiceManagementStore,
  getServicePackagesList,
  getPublishedServicePackages,
  getServicePackageByIdOrCode,
  saveServicePackage,
  duplicateServicePackage,
  archiveServicePackage,
  deleteServicePackage,
  getServiceEquipmentList,
  saveServiceEquipment,
  deleteServiceEquipment,
  getServiceStaffRolesList,
  saveServiceStaffRole,
  deleteServiceStaffRole,
  getServiceAuditLogs,
  validateAndQuotePackageBooking,
  isPackageReferencedInBookings
} from '../src/services/servicePackageManager.js';

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
  console.log('🧪 RUNNING "PERKHIDMATAN & SERVIS" MANAGEMENT TEST SUITE');
  console.log('=============================================================\n');

  // Reinitialize store with clean state
  initServiceManagementStore();

  test('1. Initial Seed: All 4 service packages exist with correct pricing and inclusions', () => {
    const packages = getPublishedServicePackages();
    assert.strictEqual(packages.length, 4, 'Must have exactly 4 published packages');

    const std = packages.find(p => p.code === 'emergency_standard');
    assert.ok(std, 'Kecemasan Standard must exist');
    assert.strictEqual(std.baseFare, 250, 'Standard base fare must be RM250');
    assert.strictEqual(std.includedEquipment.length, 7, 'Standard must have 7 equipment');
    assert.deepStrictEqual(std.includedStaff, ['Clinic Assistant (CA)'], 'Standard staff must be CA');

    const nonEmerg = packages.find(p => p.code === 'non_emergency');
    assert.ok(nonEmerg, 'Bukan Kecemasan must exist');
    assert.strictEqual(nonEmerg.baseFare, 250, 'Bukan Kecemasan base fare must be RM250');
    assert.strictEqual(nonEmerg.includedEquipment.length, 5, 'Bukan Kecemasan must have 5 equipment');
    assert.strictEqual(nonEmerg.includedStaff.length, 0, 'Bukan Kecemasan must omit staff (0 staff)');

    const inHouse = packages.find(p => p.code === 'emergency_inhouse');
    assert.ok(inHouse, 'Kecemasan In-House must exist');
    assert.strictEqual(inHouse.baseFare, 350, 'In-House base fare must be RM350');
    assert.strictEqual(inHouse.includedEquipment.length, 9, 'In-House must have 9 equipment');
    assert.ok(inHouse.includedEquipment.includes('Alat pernafasan (Ambu Bag)'), 'In-House must include Ambu Bag');
    assert.ok(inHouse.includedEquipment.includes('Suction unit'), 'In-House must include Suction unit');
    assert.deepStrictEqual(inHouse.includedStaff, ['Medical Assistant (MA) / Nurse', 'Medical Officer (MO)'], 'In-House staff must include MA/Nurse and MO');

    const aed = packages.find(p => p.code === 'aed_critical');
    assert.ok(aed, 'Kecemasan Kritikal + AED must exist');
    assert.strictEqual(aed.baseFare, 500, 'AED base fare must be RM500');
    assert.strictEqual(aed.includedEquipment.length, 8, 'AED must have 8 equipment');
    assert.ok(aed.includedEquipment.includes('AED Equipment'), 'AED package must include AED Equipment');
    assert.ok(!aed.includedEquipment.includes('Alat pernafasan (Ambu Bag)'), 'AED package must NOT include Ambu Bag');
    assert.ok(!aed.includedEquipment.includes('Suction unit'), 'AED package must NOT include Suction unit');
    assert.deepStrictEqual(aed.includedStaff, ['Medical Assistant (MA) / Nurse', 'Medical Officer (MO)'], 'AED staff must include MA/Nurse and MO');
  });

  test('2. Equipment Catalogue: Normalized duplicate prevention (casing and whitespace)', () => {
    // Attempt to add duplicate "  stretcher  " or "STRETCHER"
    assert.throws(() => {
      saveServiceEquipment({ name: '  stretcher  ' });
    }, /sudah wujud/i, 'Must throw duplicate validation error for identical equipment name');

    assert.throws(() => {
      saveServiceEquipment({ name: 'SISTEM OKSIGEN LENGKAP' });
    }, /sudah wujud/i, 'Must throw duplicate validation error regardless of casing');

    // Adding unique equipment should succeed
    const newEq = saveServiceEquipment({
      name: 'Ventilator Pengangkutan Mudah Alih',
      description: 'Ventilator mudah alih untuk ICU transit'
    }, { adminEmail: 'admin@amc.my' });

    assert.ok(newEq.id, 'New equipment should have generated id');
    const list = getServiceEquipmentList();
    assert.ok(list.some(e => e.name === 'Ventilator Pengangkutan Mudah Alih'), 'New equipment should be listed');
  });

  test('3. Staff Role Catalogue: Normalized duplicate prevention and clinical qualification integrity', () => {
    assert.throws(() => {
      saveServiceStaffRole({ name: 'clinic assistant (ca)' });
    }, /sudah wujud/i, 'Must reject duplicate staff role name with different casing');

    // Adding unique role
    const newRole = saveServiceStaffRole({
      name: 'Pakar Bius (Anaesthesiologist)',
      description: 'Pakar perubatan bius untuk kes kritikal tinggi'
    }, { adminEmail: 'admin@amc.my' });

    assert.ok(newRole.id, 'New role should have generated id');
    const roles = getServiceStaffRolesList();
    assert.ok(roles.some(r => r.name === 'Pakar Bius (Anaesthesiologist)'), 'New role should be listed');
  });

  test('4. Safe Deletion: Prevents deleting equipment or roles currently referenced by packages', () => {
    const stretcher = getServiceEquipmentList().find(e => e.name === 'Stretcher');
    assert.ok(stretcher, 'Stretcher must exist');

    assert.throws(() => {
      deleteServiceEquipment(stretcher.id);
    }, /memadam/i, 'Must block deleting equipment used in packages');

    const caRole = getServiceStaffRolesList().find(r => r.name === 'Clinic Assistant (CA)');
    assert.ok(caRole, 'CA role must exist');

    assert.throws(() => {
      deleteServiceStaffRole(caRole.id);
    }, /memadam/i, 'Must block deleting role used in packages');
  });

  test('5. Package Duplication: Creates draft with "(Salinan)" and distinct code', () => {
    const std = getServicePackagesList().find(p => p.code === 'emergency_standard');
    const duplicated = duplicateServicePackage(std.id, { adminEmail: 'operator@amc.my' });

    assert.ok(duplicated, 'Duplicated package must be returned');
    assert.strictEqual(duplicated.status, 'Draft', 'Duplicated package must be in Draft status');
    assert.ok(duplicated.code.includes('copy'), 'Code must be unique with copy prefix');
    assert.strictEqual(duplicated.name, 'Kecemasan Standard (Salinan)', 'Name must append (Salinan)');
    assert.strictEqual(duplicated.baseFare, 250, 'Base fare must match original');
    assert.strictEqual(duplicated.equipmentIds.length, std.equipmentIds.length, 'Inclusions must be cloned');

    // Drafts do not appear in published customer packages
    const published = getPublishedServicePackages();
    assert.ok(!published.some(p => p.id === duplicated.id), 'Draft must NOT appear in published customer packages');
  });

  test('6. Package Editing: Optimistic concurrency control (version conflict detection)', () => {
    const std = getServicePackagesList().find(p => p.code === 'emergency_standard');
    const originalVersion = std.version || 1;

    // Successful update increments version
    const updated = saveServicePackage({
      id: std.id,
      name: 'Kecemasan Standard Dikemaskini',
      version: originalVersion
    }, { adminEmail: 'admin@amc.my' });

    assert.strictEqual(updated.version, originalVersion + 1, 'Version should increment after update');

    // Concurrency conflict: saving with stale version should fail
    assert.throws(() => {
      saveServicePackage({
        id: std.id,
        name: 'Kemaskini Konflik',
        version: originalVersion // Stale version
      }, { adminEmail: 'other_admin@amc.my' });
    }, /telah dikemaskini oleh pengguna lain/i, 'Must reject stale version update with concurrency conflict');
  });

  test('7. Authoritative Server-Side Fare Calculation: calculateAndQuote', () => {
    // 25.0 km (Within base allowance) -> exactly RM250.00
    const quote25 = validateAndQuotePackageBooking({
      packageCode: 'non_emergency',
      distanceKm: 25.0
    });
    assert.strictEqual(quote25.baseFare, 250);
    assert.strictEqual(quote25.extraKm, 0);
    assert.strictEqual(quote25.extraDistanceFee, 0);
    assert.strictEqual(quote25.grandTotal, 250.00);

    // 26.3 km (1.3 km excess @ RM3.00/km) -> RM253.90
    const quote26_3 = validateAndQuotePackageBooking({
      packageCode: 'emergency_standard',
      distanceKm: 26.3
    });
    assert.strictEqual(quote26_3.baseFare, 250);
    assert.strictEqual(quote26_3.extraKm, 1.3);
    assert.strictEqual(quote26_3.extraDistanceFee, 3.90);
    assert.strictEqual(quote26_3.grandTotal, 253.90);

    // Bundled inclusions are RM0.00, verified in quote snapshot
    assert.strictEqual(quote26_3.staffFee, 0);
    assert.strictEqual(quote26_3.equipmentFee, 0);
    assert.ok(quote26_3.packageSnapshot, 'Quote must produce immutable packageSnapshot');
    assert.strictEqual(quote26_3.packageSnapshot.name, 'Kecemasan Standard Dikemaskini');
  });

  test('8. Package Archive & Safe Deletion: Cannot delete package with existing bookings', () => {
    const pkg = getServicePackagesList().find(p => p.code === 'emergency_standard');

    // Standard package has mock bookings associated with it
    assert.throws(() => {
      deleteServicePackage(pkg.id);
    }, /telah digunakan dalam rekod tempahan/i, 'Must block deletion of packages referenced in bookings');

    // Archiving should succeed
    const archived = archiveServicePackage(pkg.id, { adminEmail: 'admin@amc.my' });
    assert.strictEqual(archived.status, 'Archived', 'Status must be Archived');

    // Archived package is excluded from published booking options
    const published = getPublishedServicePackages();
    assert.ok(!published.some(p => p.id === pkg.id), 'Archived package must not be in published list');
  });

  test('9. Audit Trail: Every mutation logs acting admin, action, and diff snapshots', () => {
    const logs = getServiceAuditLogs();
    assert.ok(logs.length > 0, 'Audit logs must be populated');

    const recentLog = logs[0];
    assert.ok(recentLog.id, 'Log must have id');
    assert.ok(recentLog.action, 'Log must have action');
    assert.ok(recentLog.adminEmail, 'Log must record acting admin email');
    assert.ok(recentLog.timestamp, 'Log must record timestamp');

    // Check that we have logs for DUPLICATE, UPDATE, ARCHIVE
    const actions = logs.map(l => l.action);
    assert.ok(actions.includes('DUPLICATE_PACKAGE'), 'Must contain DUPLICATE_PACKAGE log');
    assert.ok(actions.includes('UPDATE_PACKAGE'), 'Must contain UPDATE_PACKAGE log');
    assert.ok(actions.includes('ARCHIVE_PACKAGE'), 'Must contain ARCHIVE_PACKAGE log');
  });

  console.log('\n-------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
