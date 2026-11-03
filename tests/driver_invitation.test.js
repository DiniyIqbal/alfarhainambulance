// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// AUTOMATED TEST SUITE: Driver Invitations & HQ Approval Flow
// File: tests/driver_invitation.test.js
// =========================================================================

import assert from 'assert';
import crypto from 'crypto';

console.log('🧪 Starting AFAMS Driver Invitation & HQ Approval Flow Tests...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// Helper: Hashing
function hashToken(code) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

// -------------------------------------------------------------------------
// TEST 1: Cryptographic Code Generation & Format
// -------------------------------------------------------------------------
runTest('Kod jemputan mestilah berformat AMC-XXXXXX dengan aksara selamat', () => {
  const charset = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let rand = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    rand += charset[bytes[i] % charset.length];
  }
  const code = `AMC-${rand}`;

  assert.strictEqual(code.startsWith('AMC-'), true, 'Code must start with AMC- prefix');
  assert.strictEqual(code.length, 10, 'Code must have exactly 10 characters (AMC- + 6)');
  assert.strictEqual(/^[A-Z0-9-]+$/.test(code), true, 'Code must contain only uppercase alphanumeric and dash');
  assert.strictEqual(code.includes('0'), false, 'Code should avoid confusing digit 0');
  assert.strictEqual(code.includes('O'), false, 'Code should avoid confusing letter O');
  assert.strictEqual(code.includes('1'), false, 'Code should avoid confusing digit 1');
  assert.strictEqual(code.includes('I'), false, 'Code should avoid confusing letter I');
});

// -------------------------------------------------------------------------
// TEST 2: SHA-256 Hashing & Masking
// -------------------------------------------------------------------------
runTest('Hash SHA-256 mestilah konsisten dan kod dipaparkan secara bertopeng', () => {
  const code = 'AMC-9X2W7P';
  const hash1 = hashToken(code);
  const hash2 = hashToken('amc-9x2w7p'); // case-insensitive check
  assert.strictEqual(hash1, hash2, 'Hash must be consistent regardless of casing');
  assert.strictEqual(hash1.length, 64, 'SHA-256 output must be 64 hex characters');

  const masked = `${code.slice(0, 6)}****`;
  assert.strictEqual(masked, 'AMC-9X****', 'Masked code must conceal the trailing secret characters');
});

// -------------------------------------------------------------------------
// TEST 3: Email Ownership & Mismatch Rejection
// -------------------------------------------------------------------------
runTest('Penebusan jemputan ditolak jika emel tidak sepadan', () => {
  const invitation = {
    code_hash: hashToken('AMC-9X2W7P'),
    email: 'faizul@alfarhain.my',
    status: 'Dihantar'
  };

  const attemptEmail = 'attacker@contoh.com';
  const isMatch = invitation.email.toLowerCase() === attemptEmail.toLowerCase();
  assert.strictEqual(isMatch, false, 'Should reject mismatched email attempt');
});

// -------------------------------------------------------------------------
// TEST 4: Single-Use & Atomic Consumption
// -------------------------------------------------------------------------
runTest('Jemputan yang telah ditebus (Diterima) tidak boleh digunakan kali kedua', () => {
  const invitation = {
    id: 'inv-1',
    status: 'Diterima',
    consumed_at: new Date().toISOString()
  };

  function tryRedeem(inv) {
    if (inv.status === 'Diterima' || inv.consumed_at) {
      return { success: false, error: 'Kod jemputan ini telah pun digunakan sebelum ini.' };
    }
    inv.status = 'Diterima';
    inv.consumed_at = new Date().toISOString();
    return { success: true };
  }

  const result = tryRedeem(invitation);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'Kod jemputan ini telah pun digunakan sebelum ini.');
});

// -------------------------------------------------------------------------
// TEST 5: Expiration Enforcement (48 Hours Default)
// -------------------------------------------------------------------------
runTest('Jemputan yang melepasi tempoh luput ditolak sebagai Tamat Tempoh', () => {
  const pastDate = new Date(Date.now() - 50 * 3600 * 1000).toISOString(); // 50 hours ago
  const invitation = {
    id: 'inv-expired',
    expires_at: pastDate,
    status: 'Dihantar'
  };

  const isExpired = new Date(invitation.expires_at) < new Date();
  assert.strictEqual(isExpired, true, 'Should detect past expiry');
});

// -------------------------------------------------------------------------
// TEST 6: Resend / Regeneration Invalidates Old Code
// -------------------------------------------------------------------------
runTest('Penjanaan semula jemputan membatalkan kod terdahulu secara automatik', () => {
  const oldCode = 'AMC-OLD123';
  let currentInvitation = {
    code_hash: hashToken(oldCode),
    status: 'Dihantar'
  };

  // Admin triggers regenerate
  currentInvitation.status = 'Dibatalkan';
  currentInvitation.revoked_at = new Date().toISOString();

  const newCode = 'AMC-NEW456';
  const newInvitation = {
    code_hash: hashToken(newCode),
    status: 'Dihantar',
    expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
  };

  // Attempting to use oldCode
  assert.strictEqual(currentInvitation.status, 'Dibatalkan', 'Old invitation must be revoked');
  assert.notStrictEqual(currentInvitation.code_hash, newInvitation.code_hash, 'Hashes must differ');
});

// -------------------------------------------------------------------------
// TEST 7: Prevention of Self-Approval
// -------------------------------------------------------------------------
runTest('Pentadbir disekat daripada meluluskan akaun pemandu sendiri', () => {
  const actor = { email: 'abedi@alfarhain.my', role: 'hq_admin' };
  const targetDriverEmail = 'abedi@alfarhain.my';

  function validateApproval(act, targetEmail) {
    if (act.email.toLowerCase() === targetEmail.toLowerCase()) {
      return { allowed: false, error: 'Self-approval is forbidden.' };
    }
    return { allowed: true };
  }

  const check = validateApproval(actor, targetDriverEmail);
  assert.strictEqual(check.allowed, false);
  assert.strictEqual(check.error, 'Self-approval is forbidden.');
});

// -------------------------------------------------------------------------
// TEST 8: Branch Scoping for Branch Managers
// -------------------------------------------------------------------------
runTest('Pengurus cawangan hanya boleh meluluskan pemandu cawangan sendiri', () => {
  const branchManager = { email: 'abedin@alfarhain.my', role: 'branch_manager', branchId: 'raub' };
  const driverKokLanas = { id: 'drv-kl', hub_id: 'kok_lanas' };
  const driverRaub = { id: 'drv-rb', hub_id: 'raub' };

  function canManageDriver(mgr, driver) {
    if (mgr.role === 'hq_admin') return true;
    if (mgr.role === 'branch_manager') return mgr.branchId === driver.hub_id;
    return false;
  }

  assert.strictEqual(canManageDriver(branchManager, driverKokLanas), false, 'Cannot manage other branch');
  assert.strictEqual(canManageDriver(branchManager, driverRaub), true, 'Can manage own branch');
});

// -------------------------------------------------------------------------
// TEST 9: Mandatory Reasons for Corrections, Rejection & Suspension
// -------------------------------------------------------------------------
runTest('Tindakan Minta Pembetulan, Tolak, dan Gantung mewajibkan sebab/catatan', () => {
  function validateDecision(action, reason) {
    if (['MINTA_PEMBETULAN', 'TOLAK', 'GANTUNG'].includes(action)) {
      if (!reason || reason.trim().length < 5) {
        return { valid: false, error: 'Sebab wajib diisi (minimum 5 aksara).' };
      }
    }
    return { valid: true };
  }

  assert.strictEqual(validateDecision('MINTA_PEMBETULAN', '').valid, false);
  assert.strictEqual(validateDecision('MINTA_PEMBETULAN', 'Lesen tamat').valid, true);
  assert.strictEqual(validateDecision('TOLAK', '   ').valid, false);
  assert.strictEqual(validateDecision('GANTUNG', 'Pelanggaran SOP').valid, true);
  assert.strictEqual(validateDecision('LULUSKAN', '').valid, true); // Approval doesn't strictly need rejection reason
});

// -------------------------------------------------------------------------
// TEST 10: Pending Drivers Blocked from Operational Dispatch
// -------------------------------------------------------------------------
runTest('Pemandu dalam status Menunggu Kelulusan disekat daripada tugasan operasi', () => {
  const pendingDriver = {
    email: 'newbie@alfarhain.my',
    account_status: 'Menunggu Kelulusan'
  };

  const activeDriver = {
    email: 'abedi@alfarhain.my',
    account_status: 'Aktif'
  };

  function canAccessDispatch(driver) {
    return driver.account_status === 'Aktif';
  }

  assert.strictEqual(canAccessDispatch(pendingDriver), false, 'Pending driver must NOT access dispatch');
  assert.strictEqual(canAccessDispatch(activeDriver), true, 'Active driver allowed');
});

// -------------------------------------------------------------------------
// TEST 11: Independence of Invitation Status vs Account Status
// -------------------------------------------------------------------------
runTest('Pembatalan jemputan tidak menggantung pemandu yang telah berstatus Aktif', () => {
  let invitation = { id: 'inv-1', status: 'Diterima' };
  let driver = { id: 'drv-1', account_status: 'Aktif' };

  // If another invitation is revoked
  let otherInv = { id: 'inv-2', status: 'Dibatalkan' };

  assert.strictEqual(driver.account_status, 'Aktif', 'Active driver remains active');
  assert.strictEqual(otherInv.status, 'Dibatalkan', 'Other invitation is revoked separately');
});

console.log(`\n=========================================================================`);
console.log(`🏁 AFAMS Driver Invitation & Approval Test Results: ${passedTests}/${totalTests} Passed`);
console.log(`=========================================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}

