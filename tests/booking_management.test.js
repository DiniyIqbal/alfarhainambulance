// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// AUTOMATED TEST SUITE: COMPLETE BOOKING MANAGEMENT MODULE
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
  deriveCustomerStatus,
  generateIdempotencyKey,
  checkResourceConflicts,
  createPatientBooking,
  approveBookingRequest,
  rejectBookingRequest,
  assignBookingResources,
  updateTripProgress,
  customerCancelOrRequestBooking,
  customerRequestReschedule,
  calculateAdminDashboardKpis,
  filterBookingsList,
  CUSTOMER_STATUS
} from '../src/services/bookingManagementService.js';

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
  console.log('🧪 RUNNING COMPLETE BOOKING MANAGEMENT VERIFICATION SUITE');
  console.log('=============================================================\n');

  // Test 1: Customer Status Model Derivation
  test('1. Customer Status Model: Maps decoupled state to canonical Malay labels', () => {
    // 1a. Pending approval
    const s1 = deriveCustomerStatus({ booking_status: 'pending_approval' });
    assert.strictEqual(s1.code, 'menunggu_kelulusan');
    assert.strictEqual(s1.label, 'Menunggu kelulusan');

    // 1b. Approved but unassigned
    const s2 = deriveCustomerStatus({ booking_status: 'approved', assignment_status: 'unassigned' });
    assert.strictEqual(s2.code, 'menunggu_agihan');
    assert.strictEqual(s2.label, 'Diluluskan / Menunggu agihan');

    // 1c. Scheduled booking with assigned resources
    const s3 = deriveCustomerStatus({
      booking_status: 'approved',
      assignment_status: 'assigned',
      plate_number: 'VPQ 7606',
      is_scheduled: true,
      trip_status: 'not_started'
    });
    assert.strictEqual(s3.code, 'dijadualkan');
    assert.strictEqual(s3.label, 'Dijadualkan');

    // 1d. En route to pickup
    const s4 = deriveCustomerStatus({
      booking_status: 'approved',
      assignment_status: 'assigned',
      trip_status: 'en_route_pickup'
    });
    assert.strictEqual(s4.code, 'menuju_pengambilan');
    assert.strictEqual(s4.label, 'Menuju pengambilan');

    // 1e. Arrived at pickup
    const s5 = deriveCustomerStatus({
      booking_status: 'approved',
      assignment_status: 'assigned',
      trip_status: 'arrived_pickup'
    });
    assert.strictEqual(s5.code, 'tiba_pengambilan');
    assert.strictEqual(s5.label, 'Tiba di pengambilan');

    // 1f. En route to destination
    const s6 = deriveCustomerStatus({
      booking_status: 'approved',
      assignment_status: 'assigned',
      trip_status: 'en_route_destination'
    });
    assert.strictEqual(s6.code, 'menuju_destinasi');
    assert.strictEqual(s6.label, 'Menuju destinasi');

    // 1g. Completed
    const s7 = deriveCustomerStatus({
      booking_status: 'approved',
      assignment_status: 'assigned',
      trip_status: 'completed'
    });
    assert.strictEqual(s7.code, 'selesai');
    assert.strictEqual(s7.label, 'Selesai');

    // 1h. Rejected
    const s8 = deriveCustomerStatus({ booking_status: 'rejected' });
    assert.strictEqual(s8.code, 'ditolak');

    // 1i. Cancelled
    const s9 = deriveCustomerStatus({ booking_status: 'cancelled' });
    assert.strictEqual(s9.code, 'dibatalkan');
  });

  // Test 2: Idempotency Protection against duplicate taps
  test('2. Idempotency Protection: Rejects duplicate submission and returns existing booking', async () => {
    const input = {
      patientName: 'Ahmad bin Razali',
      patientPhone: '012-345 6789',
      patientEmail: 'ahmad.razali@gmail.com',
      hubId: 'kok_lanas',
      originName: 'Kediaman Kok Lanas',
      pickupCoords: [5.9176, 102.2446],
      destinationName: 'Hospital HRPZ II',
      packageId: 'pkg_kecemasan_standard',
      distanceKm: 26.3
    };

    const res1 = await createPatientBooking(input, []);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.data.booking_status, 'pending_approval');
    assert.strictEqual(res1.data.plate_number, ''); // Not assigned at submission!

    // Repeat tap with same idempotency key
    const res2 = await createPatientBooking(input, [res1.data]);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.isDuplicate, true);
    assert.strictEqual(res2.data.invoice_number, res1.data.invoice_number);
  });

  // Test 3: Optimistic Concurrency Control during Admin Approval
  test('3. Concurrency Protection: Detects version conflict if already processed', async () => {
    const booking = {
      id: 'b-001',
      invoice_number: 'AMC-1045',
      booking_status: 'pending_approval',
      version: 1,
      patient_name: 'Pak Hassan',
      patient_email: 'hassan@gmail.com',
      audit_trail: []
    };

    // Admin A approves
    const adminA = { name: 'Admin Ali', email: 'ali@alfarhain.my' };
    const resA = await approveBookingRequest({
      booking,
      adminUser: adminA,
      expectedVersion: 1
    });
    assert.strictEqual(resA.success, true);
    assert.strictEqual(resA.data.booking_status, 'approved');
    assert.strictEqual(resA.data.version, 2);

    // Admin B attempts to approve using stale version 1
    const adminB = { name: 'Admin Siti', email: 'siti@alfarhain.my' };
    const resB = await approveBookingRequest({
      booking: resA.data, // already at v2
      adminUser: adminB,
      expectedVersion: 1 // stale
    });
    assert.strictEqual(resB.success, false);
    assert.ok(resB.error.includes('Konflik kemas kini'));
  });

  // Test 4: Admin Rejection requires reason and timestamps
  test('4. Admin Rejection: Enforces non-empty reason, timestamp, and audit trail', async () => {
    const booking = {
      id: 'b-002',
      invoice_number: 'AMC-1046',
      booking_status: 'pending_approval',
      version: 1,
      patient_name: 'Puan Maznah',
      patient_email: 'maznah@gmail.com'
    };

    // Attempt without reason
    const failRes = await rejectBookingRequest({
      booking,
      reason: '   '
    });
    assert.strictEqual(failRes.success, false);
    assert.ok(failRes.error.includes('Sebab penolakan tempahan adalah wajib'));

    // Valid rejection
    const successRes = await rejectBookingRequest({
      booking,
      reason: 'Di luar kawasan liputan zon operasi semasa.',
      adminUser: { name: 'Dispatcher Ahmad', email: 'ahmad@alfarhain.my' }
    });
    assert.strictEqual(successRes.success, true);
    assert.strictEqual(successRes.data.booking_status, 'rejected');
    assert.strictEqual(successRes.data.rejection_reason, 'Di luar kawasan liputan zon operasi semasa.');
    assert.strictEqual(successRes.data.rejected_by, 'Dispatcher Ahmad');
    assert.ok(successRes.data.audit_trail.some(a => a.action === 'REJECTED'));
  });

  // Test 5: Resource Conflict Checks for Vehicles and Drivers
  test('5. Resource Assignment: Backend conflict check blocks overlapping active trips and buffer intervals', () => {
    const activeBooking = {
      id: 'b-active',
      invoice_number: 'AMC-1040',
      plate_number: 'VPQ 7606',
      driver_name: 'Abe Di / Syalihan',
      booking_status: 'approved',
      assignment_status: 'assigned',
      trip_status: 'en_route_pickup'
    };

    // 5a. Attempt to assign same vehicle currently active on the road
    const conf1 = checkResourceConflicts({
      vehiclePlate: 'VPQ 7606',
      driverName: 'Pemandu Lain',
      allBookings: [activeBooking]
    });
    assert.strictEqual(conf1.hasConflict, true);
    assert.ok(conf1.reason.includes('Ambulans VPQ 7606 sedang dalam perjalanan'));

    // 5b. Attempt to assign same driver currently active on the road
    const conf2 = checkResourceConflicts({
      vehiclePlate: 'DFG 7606',
      driverName: 'Abe Di / Syalihan',
      allBookings: [activeBooking]
    });
    assert.strictEqual(conf2.hasConflict, true);
    assert.ok(conf2.reason.includes('Pemandu Abe Di / Syalihan sedang mengendalikan tugasan aktif'));

    // 5c. Scheduled trip with overlapping interval (< 30-min buffer)
    const baseTime = Date.now() + (3 * 3600 * 1000); // 3 hours from now
    const scheduledBooking = {
      id: 'b-sched',
      invoice_number: 'AMC-1041',
      plate_number: 'DFG 7606',
      driver_name: 'Abe Din',
      booking_status: 'approved',
      assignment_status: 'assigned',
      trip_status: 'not_started',
      scheduled_time: new Date(baseTime).toISOString(),
      duration_min: 60
    };

    // Target trip scheduled 40 mins after previous ends (violates 30-min buffer after 60-min trip)
    const conf3 = checkResourceConflicts({
      vehiclePlate: 'DFG 7606',
      driverName: 'Abe Din',
      scheduledTime: new Date(baseTime + (45 * 60 * 1000)).toISOString(),
      allBookings: [scheduledBooking]
    });
    assert.strictEqual(conf3.hasConflict, true);
    assert.ok(conf3.reason.includes('pertindihan jadual'));

    // Target trip safely 3 hours later (no conflict)
    const conf4 = checkResourceConflicts({
      vehiclePlate: 'DFG 7606',
      driverName: 'Abe Din',
      scheduledTime: new Date(baseTime + (4 * 3600 * 1000)).toISOString(),
      allBookings: [scheduledBooking]
    });
    assert.strictEqual(conf4.hasConflict, false);
  });

  // Test 6: Valid Status Transition Pipeline and Multi-Destination Safeguard
  test('6. Trip Progress Pipeline: Enforces strictly ordered transitions and blocks premature completion', async () => {
    let booking = {
      id: 'b-trip',
      invoice_number: 'AMC-1047',
      trip_status: 'not_started',
      version: 1
    };

    // Invalid transition: not_started -> completed (skipping en_route)
    const invalidRes = await updateTripProgress({
      booking,
      nextTripStatus: 'completed'
    });
    assert.strictEqual(invalidRes.success, false);
    assert.ok(invalidRes.error.includes('Peralihan status tidak sah'));

    // Valid step 1: not_started -> en_route_pickup
    const step1 = await updateTripProgress({
      booking,
      nextTripStatus: 'en_route_pickup'
    });
    assert.strictEqual(step1.success, true);
    assert.strictEqual(step1.data.trip_status, 'en_route_pickup');

    // Valid step 2: en_route_pickup -> arrived_pickup
    const step2 = await updateTripProgress({
      booking: step1.data,
      nextTripStatus: 'arrived_pickup'
    });
    assert.strictEqual(step2.success, true);

    // Valid step 3: arrived_pickup -> en_route_destination
    const step3 = await updateTripProgress({
      booking: step2.data,
      nextTripStatus: 'en_route_destination'
    });
    assert.strictEqual(step3.success, true);

    // Multi-destination safeguard: Has return trip, cannot complete before return trip is done!
    const prematureComplete = await updateTripProgress({
      booking: step3.data,
      nextTripStatus: 'completed',
      hasReturnTrip: true,
      returnCompleted: false
    });
    assert.strictEqual(prematureComplete.success, false);
    assert.ok(prematureComplete.error.includes('mempunyai pusingan hantar pulang'));

    // Now mark return trip completed
    const finalComplete = await updateTripProgress({
      booking: step3.data,
      nextTripStatus: 'completed',
      hasReturnTrip: true,
      returnCompleted: true
    });
    assert.strictEqual(finalComplete.success, true);
    assert.strictEqual(finalComplete.data.trip_status, 'completed');
    assert.ok(finalComplete.data.completed_at);
  });

  // Test 7: Customer Cancellation and Rescheduling Workflows
  test('7. Customer Actions: Pending booking direct cancel vs approved booking request review', async () => {
    // 7a. Pending booking -> direct cancel
    const pendingBooking = {
      id: 'b-pend',
      invoice_number: 'AMC-1048',
      booking_status: 'pending_approval',
      version: 1
    };

    const cancelRes = await customerCancelOrRequestBooking({
      booking: pendingBooking,
      reason: 'Pesakit telah dibawa oleh kenderaan persendirian.',
      customerEmail: 'waris@gmail.com'
    });
    assert.strictEqual(cancelRes.success, true);
    assert.strictEqual(cancelRes.directCancelled, true);
    assert.strictEqual(cancelRes.data.booking_status, 'cancelled');

    // 7b. Approved booking -> request cancellation review
    const approvedBooking = {
      id: 'b-appr',
      invoice_number: 'AMC-1049',
      booking_status: 'approved',
      assignment_status: 'assigned',
      version: 1
    };

    const reqCancelRes = await customerCancelOrRequestBooking({
      booking: approvedBooking,
      reason: 'Temujanji hospital ditunda oleh doktor pakar.',
      customerEmail: 'waris@gmail.com'
    });
    assert.strictEqual(reqCancelRes.success, true);
    assert.strictEqual(reqCancelRes.directCancelled, false);
    assert.strictEqual(reqCancelRes.data.cancellation_requested, true);
    assert.strictEqual(reqCancelRes.data.booking_status, 'approved'); // still approved until admin decides

    // 7c. Approved booking -> request reschedule review
    const newTargetTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const reschedRes = await customerRequestReschedule({
      booking: approvedBooking,
      newTime: newTargetTime,
      reason: 'Tukar ke sesi petang.',
      customerEmail: 'waris@gmail.com'
    });
    assert.strictEqual(reschedRes.success, true);
    assert.strictEqual(reschedRes.data.reschedule_requested, true);
    assert.strictEqual(reschedRes.data.reschedule_request_time, newTargetTime);
  });

  // Test 8: Admin Dashboard KPI Metrics within Branch Scope
  test('8. Admin Dashboard KPIs: Real metrics accurately calculated within branch scope', () => {
    const todayIso = new Date().toISOString();
    const testRecords = [
      { id: '1', hub_id: 'kok_lanas', booking_status: 'pending_approval' },
      { id: '2', hub_id: 'kok_lanas', booking_status: 'approved', trip_status: 'not_started' },
      { id: '3', hub_id: 'kok_lanas', booking_status: 'approved', trip_status: 'en_route_pickup' },
      { id: '4', hub_id: 'kok_lanas', booking_status: 'approved', trip_status: 'completed', completed_at: todayIso },
      { id: '5', hub_id: 'raub', booking_status: 'pending_approval' } // different branch
    ];

    // Branch: all
    const kpiAll = calculateAdminDashboardKpis(testRecords, 'all');
    assert.strictEqual(kpiAll.pendingApproval, 2);
    assert.strictEqual(kpiAll.approved, 1);
    assert.strictEqual(kpiAll.ongoing, 1);
    assert.strictEqual(kpiAll.completedToday, 1);

    // Branch: kok_lanas scope
    const kpiKokLanas = calculateAdminDashboardKpis(testRecords, 'kok_lanas');
    assert.strictEqual(kpiKokLanas.pendingApproval, 1);
    assert.strictEqual(kpiKokLanas.approved, 1);
    assert.strictEqual(kpiKokLanas.ongoing, 1);
    assert.strictEqual(kpiKokLanas.completedToday, 1);
  });

  // Test 9: Filter & Search List Engine
  test('9. Filter Engine: Filters bookings by tab (Aktif vs Sejarah) and search query', () => {
    const records = [
      { invoice_number: 'AMC-1001', booking_status: 'pending_approval', origin_name: 'Kota Bharu' },
      { invoice_number: 'AMC-1002', booking_status: 'approved', trip_status: 'en_route_destination', origin_name: 'Machang' },
      { invoice_number: 'AMC-1003', booking_status: 'approved', trip_status: 'completed', origin_name: 'Pasir Mas' },
      { invoice_number: 'AMC-1004', booking_status: 'rejected', origin_name: 'Tumpat' }
    ];

    const aktif = filterBookingsList(records, { tab: 'aktif' });
    assert.strictEqual(aktif.length, 2); // AMC-1001 and AMC-1002

    const sejarah = filterBookingsList(records, { tab: 'sejarah' });
    assert.strictEqual(sejarah.length, 2); // AMC-1003 and AMC-1004

    const searchRes = filterBookingsList(records, { search: 'Machang' });
    assert.strictEqual(searchRes.length, 1);
    assert.strictEqual(searchRes[0].invoice_number, 'AMC-1002');
  });

  console.log('\n-------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runTests();
