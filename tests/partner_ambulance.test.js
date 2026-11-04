// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// TEST SUITE: Rakan Ambulans (Phases 1, 2, 3, 4 & Acceptance Criteria)
// File: tests/partner_ambulance.test.js
// =========================================================================

import assert from 'assert';
import {
  resetPartnerStoreForTests,
  rmToCents,
  centsToRm,
  calculatePartnerCommissionSnapshot,
  createPartnerInvitation,
  redeemPartnerInvitation,
  reviewPartnerCompany,
  reviewPartnerResource,
  createPartnerTripOffer,
  respondToPartnerTripOffer,
  withdrawPartnerTripOffer,
  assignPartnerResourcesToTrip,
  updatePartnerTripProgress,
  verifyPartnerTripCompletion,
  createFinancialAdjustment,
  createSettlementBatch,
  completeSettlementBatch,
  getPartnerPortalScopedData,
  getPartnerAuditLogs
} from '../src/services/partnerAmbulanceService.js';

console.log('🧪 Starting AFAMS "Rakan Ambulans" Multi-Phase Acceptance Test Suite...\n');

let passed = 0;
let failed = 0;

function runTest(title, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${title}`);
    console.error(`     -> ${err.message}`);
    failed++;
  }
}

const hqAdmin = { email: 'abedi@alfarhain.my', name: 'Abe Di (HQ Admin)', role: 'hq_admin' };
const hqDispatcher = { email: 'dispatch@alfarhain.my', name: 'Pegawai Dispatch HQ', role: 'dispatcher' };
const hqFinance = { email: 'kewangan@alfarhain.my', name: 'Puan Siti (HQ Finance)', role: 'hq_finance' };
const partnerAAdmin = { email: 'admin.medicare@gmail.com', name: 'En. Wan Kamarul', role: 'partner_admin' };
const partnerADriver = { email: 'pemandu.medicare@gmail.com', name: 'Mohd Hafizuddin', role: 'partner_driver' };
const partnerBAdmin = { email: 'admin.pantaimedic@gmail.com', name: 'Dr. Azlan Shah', role: 'partner_admin' };

// -------------------------------------------------------------------------
// PHASE 1 TESTS: Onboarding, Kod Jemputan, & HQ Approval
// -------------------------------------------------------------------------
resetPartnerStoreForTests();

runTest('Phase 1.1: HQ Admin creates single-use Partner Admin Kod Jemputan (hashed, masked, no plaintext in audit)', () => {
  const res = createPartnerInvitation(hqAdmin, {
    invitation_type: 'partner_admin',
    company_name: 'Salam Medic Kelantan Sdn. Bhd.',
    ssm_registration_no: '202401009988',
    recipient_name: 'Tuan Haji Rosli',
    recipient_email: 'admin.salammedic@gmail.com',
    recipient_phone: '019-900 1122',
    state_coverage: 'Kelantan Utara'
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.shareableCodeOnce.startsWith('RKN-'));
  assert.strictEqual(res.invitation.masked_code.endsWith('****'), true);
  assert.notStrictEqual(res.invitation.code_hash, res.shareableCodeOnce);

  // Verify audit log never contains plaintext code
  const logs = getPartnerAuditLogs();
  const rawLogs = JSON.stringify(logs);
  assert.strictEqual(rawLogs.includes(res.shareableCodeOnce), false, 'Plaintext code must never appear in audit logs');

  // Redeeming with mismatched email must fail
  const wrongEmail = redeemPartnerInvitation({
    plainCode: res.shareableCodeOnce,
    email: 'hacker@gmail.com',
    phone: '019-900 1122'
  });
  assert.strictEqual(wrongEmail.success, false);

  // Redeeming with matching email consumes invitation and sets status to Menunggu Kelulusan (never auto-active)
  const redeemed = redeemPartnerInvitation({
    plainCode: res.shareableCodeOnce,
    email: 'admin.salammedic@gmail.com',
    phone: '019-900 1122',
    companyDetails: { bank_name: 'Bank Islam', bank_account_no: '03018010099211' },
    vehicleDetails: { plate_number: 'DDX 5566', model: 'Toyota Hiace BLS' }
  });
  assert.strictEqual(redeemed.success, true);
  assert.strictEqual(redeemed.account_status, 'Menunggu Kelulusan');

  // Second redemption attempt with same code must fail
  const secondTry = redeemPartnerInvitation({
    plainCode: res.shareableCodeOnce,
    email: 'admin.salammedic@gmail.com',
    phone: '019-900 1122'
  });
  assert.strictEqual(secondTry.success, false);
});

runTest('Phase 1.2: Only approved partners can receive trip offers; unapproved partner is blocked', () => {
  resetPartnerStoreForTests();
  // Partner B (comp-pantaimedic-phg) has status 'Menunggu Kelulusan'
  const offerRes = createPartnerTripOffer(hqDispatcher, {
    companyId: 'comp-pantaimedic-phg',
    booking: {
      invoice_number: 'AMC-TEST-UNAPPROVED',
      origin_name: 'Raub',
      destination_name: 'Hospital Kuala Lipis',
      distance_km: 35.0,
      base_fare: 250
    }
  });
  assert.strictEqual(offerRes.success, false);
  assert.ok(offerRes.error.includes('Menunggu Kelulusan'));
});

// -------------------------------------------------------------------------
// PHASE 2 TESTS: Trip Offers, Tenant Isolation, Concurrency & Resource Locks
// -------------------------------------------------------------------------

runTest('Phase 2.1: Tenant Isolation - Partner B cannot access or accept Partner A data/offers', () => {
  resetPartnerStoreForTests();
  // Approve Partner B first so Partner B has an active account
  reviewPartnerCompany(hqAdmin, { companyId: 'comp-pantaimedic-phg', action: 'Luluskan' });

  // Partner B tries to read Partner A's portal data
  const crossRead = getPartnerPortalScopedData(partnerBAdmin, 'comp-medicare-kb');
  assert.strictEqual(crossRead.success, false, 'Cross-company read must be blocked');

  // Partner B tries to accept Partner A's offer (offer-demo-1002 belongs to comp-medicare-kb)
  const crossAccept = respondToPartnerTripOffer(partnerBAdmin, {
    offerId: 'offer-demo-1002',
    decision: 'Accept'
  });
  assert.strictEqual(crossAccept.success, false, 'Cross-company offer acceptance must be blocked');
});

runTest('Phase 2.2: Sensitive patient details are hidden before offer acceptance and revealed after acceptance', () => {
  resetPartnerStoreForTests();
  const beforeAccept = getPartnerPortalScopedData(partnerAAdmin);
  const pendingOffer = beforeAccept.offers.find(o => o.id === 'offer-demo-1002');
  assert.strictEqual(pendingOffer.offer_status, 'Offered');
  assert.strictEqual(pendingOffer.patient_phone, '***-*** ****');

  // Partner A attempts to unilaterally modify price during acceptance -> blocked
  const priceTamper = respondToPartnerTripOffer(partnerAAdmin, {
    offerId: 'offer-demo-1002',
    decision: 'Accept',
    attemptedPriceModification: 65000
  });
  assert.strictEqual(priceTamper.success, false);

  // Partner A accepts offer on agreed terms
  const acceptRes = respondToPartnerTripOffer(partnerAAdmin, {
    offerId: 'offer-demo-1002',
    decision: 'Accept'
  });
  assert.strictEqual(acceptRes.success, true);
  assert.strictEqual(acceptRes.offer.offer_status, 'Accepted');

  const afterAccept = getPartnerPortalScopedData(partnerAAdmin);
  const acceptedOffer = afterAccept.offers.find(o => o.id === 'offer-demo-1002');
  assert.strictEqual(acceptedOffer.patient_phone, '013-980 1120');
});

runTest('Phase 2.3: Duplicate active offers, withdrawn offers, and double-booking of vehicles/drivers are blocked', () => {
  resetPartnerStoreForTests();

  // Duplicate active offer for AMC-RKN-5002 (already Offered to MediCare) must fail
  const dupOffer = createPartnerTripOffer(hqDispatcher, {
    companyId: 'comp-medicare-kb',
    booking: { invoice_number: 'AMC-RKN-5002', base_fare: 400 }
  });
  assert.strictEqual(dupOffer.success, false);

  // Accept offer-demo-1002 and assign vehicle veh-medicare-01 & driver drv-medicare-01
  respondToPartnerTripOffer(partnerAAdmin, { offerId: 'offer-demo-1002', decision: 'Accept' });
  const assign1 = assignPartnerResourcesToTrip(partnerAAdmin, {
    offerId: 'offer-demo-1002',
    vehicleId: 'veh-medicare-01',
    driverId: 'drv-medicare-01'
  });
  assert.strictEqual(assign1.success, true);
  assert.strictEqual(assign1.vehicle.availability_status, 'Dalam Tugasan');

  // Create another offer AMC-RKN-5003, accept it, and try to assign the SAME busy vehicle/driver -> blocked!
  const newOfferRes = createPartnerTripOffer(hqDispatcher, {
    companyId: 'comp-medicare-kb',
    booking: { invoice_number: 'AMC-RKN-5003', base_fare: 300 }
  });
  respondToPartnerTripOffer(partnerAAdmin, { offerId: newOfferRes.offer.id, decision: 'Accept' });

  const doubleBook = assignPartnerResourcesToTrip(partnerAAdmin, {
    offerId: newOfferRes.offer.id,
    vehicleId: 'veh-medicare-01',
    driverId: 'drv-medicare-01'
  });
  assert.strictEqual(doubleBook.success, false, 'Busy vehicle/driver must not be double-booked');

  // Create offer AMC-RKN-5004, HQ withdraws it -> Partner cannot accept withdrawn offer
  const withdrawTestOffer = createPartnerTripOffer(hqDispatcher, {
    companyId: 'comp-medicare-kb',
    booking: { invoice_number: 'AMC-RKN-5004', base_fare: 250 }
  });
  withdrawPartnerTripOffer(hqDispatcher, { offerId: withdrawTestOffer.offer.id, reason: 'Pelanggan tukar jadual' });
  const acceptWithdrawn = respondToPartnerTripOffer(partnerAAdmin, {
    offerId: withdrawTestOffer.offer.id,
    decision: 'Accept'
  });
  assert.strictEqual(acceptWithdrawn.success, false);
});

// -------------------------------------------------------------------------
// PHASE 3 TESTS: 5% Commission Calculation, Completion & Ledger Obligations
// -------------------------------------------------------------------------

runTest('Phase 3.1: RM500.00 eligible trip produces exactly RM25.00 (2500 sen) commission and RM475.00 (47500 sen) partner share', () => {
  const snap = calculatePartnerCommissionSnapshot({
    lineItemsCents: {
      base_fare: rmToCents(250),
      extra_km: rmToCents(50),
      staff: rmToCents(150),
      equipment: rmToCents(50),
      extras: 0
    },
    commissionableFlags: { base_fare: true, extra_km: true, staff: true, equipment: true, extras: false },
    commissionRateBps: 500 // 5.00%
  });

  assert.strictEqual(snap.customer_invoice_cents, 50000);
  assert.strictEqual(snap.eligible_commission_base_cents, 50000);
  assert.strictEqual(snap.commission_amount_cents, 2500);
  assert.strictEqual(snap.partner_share_cents, 47500);
  assert.strictEqual(centsToRm(snap.commission_amount_cents), 25.00);
  assert.strictEqual(centsToRm(snap.partner_share_cents), 475.00);
});

runTest('Phase 3.2: Driver completion, HQ verification, idempotency, and Cash vs Online obligation directions', () => {
  resetPartnerStoreForTests();

  // Accept & assign offer-demo-1002 (RM400 -> RM20 commission, RM380 partner share)
  respondToPartnerTripOffer(partnerAAdmin, { offerId: 'offer-demo-1002', decision: 'Accept' });
  assignPartnerResourcesToTrip(partnerAAdmin, {
    offerId: 'offer-demo-1002',
    vehicleId: 'veh-medicare-01',
    driverId: 'drv-medicare-01'
  });

  // Partner driver updates progress to Completed Pending Review with evidence
  const prog = updatePartnerTripProgress(partnerADriver, {
    offerId: 'offer-demo-1002',
    newStatus: 'Completed Pending Review',
    completionEvidence: {
      handover_receiver_name: 'MA Firdaus (HUSM)',
      completion_notes: 'Pesakit selamat tiba di wad HUSM.',
      completion_odometer_km: 24.5,
      cash_collected_rm: 400 // Partner collected RM400 cash
    }
  });
  assert.strictEqual(prog.success, true);

  // HQ verifies completion with 'cash_collected_partner' -> RM20 commission is receivable from Partner!
  const ver = verifyPartnerTripCompletion(hqFinance, {
    offerId: 'offer-demo-1002',
    collectionChannel: 'cash_collected_partner',
    amountCollectedCents: 40000
  });
  assert.strictEqual(ver.success, true);
  assert.strictEqual(ver.ledgerEntry.commission_amount_cents, 2000); // RM 20.00
  assert.strictEqual(ver.ledgerEntry.receivable_from_partner_cents, 2000); // Partner owes HQ RM 20.00
  assert.strictEqual(ver.ledgerEntry.payable_to_partner_cents, 0);

  // Repeated verification request must NOT duplicate commission ledger record
  const duplicateVer = verifyPartnerTripCompletion(hqFinance, {
    offerId: 'offer-demo-1002',
    collectionChannel: 'cash_collected_partner'
  });
  assert.strictEqual(duplicateVer.success, false);
  assert.strictEqual(duplicateVer.duplicate, true);
});

// -------------------------------------------------------------------------
// PHASE 4 TESTS: Manual Settlements, Adjustments & Suspension Enforcement
// -------------------------------------------------------------------------

runTest('Phase 4.1: Financial adjustments and manual settlement batching compute accurate net balances without double payment', () => {
  resetPartnerStoreForTests();
  // Initial ledger has AMC-RKN-5001 (Online CHIP collected by HQ: Payable to Partner = RM475.00 / 47500 sen)
  // Add an adjustment: Dispute Credit +RM25.00 (2500 sen) to partner
  const adj = createFinancialAdjustment(hqFinance, {
    companyId: 'comp-medicare-kb',
    invoiceNumber: 'AMC-RKN-5001',
    adjustmentType: 'Dispute Credit',
    partnerShareAdjustmentCents: 2500,
    reason: 'Bayaran balik masa menunggu tambahan 1 jam di kecemasan'
  });
  assert.strictEqual(adj.success, true);

  // Create settlement batch -> 47500 + 2500 = 50000 sen (RM500.00 net payable to partner)
  const batchRes = createSettlementBatch(hqFinance, {
    companyId: 'comp-medicare-kb',
    notes: 'Penyelesaian Bulanan November 2026'
  });
  assert.strictEqual(batchRes.success, true);
  assert.strictEqual(batchRes.batch.net_settlement_cents, 50000);

  // Complete settlement batch with bank reference
  const settled = completeSettlementBatch(hqFinance, {
    batchId: batchRes.batch.id,
    paymentReference: 'MBB-TRX-20261104-9981'
  });
  assert.strictEqual(settled.success, true);
  assert.strictEqual(settled.batch.status, 'Settled');

  // Attempting to settle the same batch a second time must be rejected
  const doubleSettle = completeSettlementBatch(hqFinance, {
    batchId: batchRes.batch.id,
    paymentReference: 'MBB-TRX-DUPLICATE'
  });
  assert.strictEqual(doubleSettle.success, false);
  assert.strictEqual(doubleSettle.duplicate, true);
});

runTest('Phase 4.2: Suspending a partner immediately blocks existing partner sessions from operational access', () => {
  resetPartnerStoreForTests();
  const suspendRes = reviewPartnerCompany(hqAdmin, {
    companyId: 'comp-medicare-kb',
    action: 'Gantung',
    reason: 'Permit KKM tamat tempoh, menunggu pembaharuan'
  });
  assert.strictEqual(suspendRes.success, true);

  // Existing session of Partner A Admin or Driver tries to accept offer or read portal -> blocked
  const blockedAccept = respondToPartnerTripOffer(partnerAAdmin, {
    offerId: 'offer-demo-1002',
    decision: 'Accept'
  });
  assert.strictEqual(blockedAccept.success, false);
  assert.ok(blockedAccept.error.includes('Digantung'));
});

console.log('\n=========================================================================');
console.log(`🏁 AFAMS "Rakan Ambulans" Test Suite Results: ${passed}/${passed + failed} Passed`);
console.log('=========================================================================\n');

if (failed > 0) process.exit(1);

