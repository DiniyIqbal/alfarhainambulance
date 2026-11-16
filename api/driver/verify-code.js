// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// SERVERLESS ENDPOINT: POST /api/driver/verify-code
// Validates an invitation code and matching email without consuming it prematurely.
// =========================================================================

import crypto from 'crypto';
import { applyCors, getSupabaseAdmin, isDevServer, getClientIp } from '../_lib/security.js';

// Best-effort brute-force brake (per warm instance). Phase 2: move to Redis.
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 15 * 60 * 1000; }
  entry.count += 1;
  attempts.set(ip, entry);
  return entry.count > 10;
}

function hashToken(code) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Kaedah HTTP tidak dibenarkan.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  if (tooManyAttempts(getClientIp(req))) {
    return res.status(429).json({ success: false, error: 'Terlalu banyak cubaan. Sila cuba lagi selepas 15 minit.', code: 'RATE_LIMITED' });
  }

  try {
    const { code, email } = req.body || {};

    if (!code || !email) {
      return res.status(400).json({
        success: false,
        error: 'Sila masukkan kod jemputan dan emel kerja anda.',
        code: 'MISSING_FIELDS'
      });
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    const codeHash = hashToken(cleanCode);

    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data: inv, error: findErr } = await supabase
        .from('driver_invitations')
        .select('id, full_name, email, phone, branch_id, assigned_plate, status, expires_at, consumed_at, revoked_at')
        .eq('code_hash', codeHash)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!inv) {
        return res.status(404).json({
          success: false,
          error: 'Kod jemputan tidak sah atau tidak wujud.',
          code: 'INVALID_CODE'
        });
      }

      // Check email match
      if (inv.email.toLowerCase() !== cleanEmail) {
        // Same response as an unknown code, so codes cannot be probed.
        return res.status(404).json({
          success: false,
          error: 'Kod jemputan atau emel tidak sah.',
          code: 'INVALID_CODE'
        });
      }

      // Check revoked
      if (inv.status === 'Dibatalkan' || inv.revoked_at) {
        return res.status(410).json({
          success: false,
          error: 'Jemputan ini telah dibatalkan oleh pentadbir HQ.',
          code: 'INVITATION_REVOKED'
        });
      }

      // Check consumed
      if (inv.status === 'Diterima' || inv.consumed_at) {
        return res.status(410).json({
          success: false,
          error: 'Kod jemputan ini telah digunakan sebelum ini.',
          code: 'INVITATION_ALREADY_USED'
        });
      }

      // Check expired
      if (new Date(inv.expires_at) < new Date()) {
        await supabase
          .from('driver_invitations')
          .update({ status: 'Tamat Tempoh' })
          .eq('id', inv.id);

        return res.status(410).json({
          success: false,
          error: 'Tempoh sah kod jemputan ini telah tamat (melepasi 48 jam). Sila hubungi HQ.',
          code: 'INVITATION_EXPIRED'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Kod jemputan sah. Sila lengkapkan profil anda.',
        invitation: {
          id: inv.id,
          fullName: inv.full_name,
          email: inv.email,
          phone: inv.phone,
          branchId: inv.branch_id,
          assignedPlate: inv.assigned_plate
        }
      });
    }

    // Mock verification fallback (local dev server only)
    if (isDevServer() && cleanCode.startsWith('AMC-')) {
      return res.status(200).json({
        success: true,
        message: 'Kod jemputan sah (Simulasi Luar Talian).',
        invitation: {
          id: 'mock-inv-' + cleanCode,
          fullName: 'Pemandu Baharu Al-Farhain',
          email: cleanEmail,
          phone: '012-3456789',
          branchId: 'kok_lanas',
          assignedPlate: 'VPQ 7606'
        }
      });
    }

    return res.status(404).json({
      success: false,
      error: 'Kod jemputan tidak sah.',
      code: 'INVALID_CODE'
    });

  } catch (err) {
    console.error('Error in /api/driver/verify-code:', err);
    return res.status(500).json({
      success: false,
      error: 'Ralat pelayan semasa mengesahkan kod.',
      code: 'SERVER_ERROR'
    });
  }
}

