// =========================================================================
-- AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
-- SERVERLESS ENDPOINT: POST /api/driver/invite
-- Strictly server-side: Generates cryptographic activation codes, computes SHA-256 hashes,
-- prevents duplicate active invitations, and audits staff actions.
// =========================================================================

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function generateSecureCode() {
  // Alphanumeric characters excluding visually ambiguous letters (0, O, 1, I, L)
  const charset = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let randomPart = '';
  const randomBytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    randomPart += charset[randomBytes[i] % charset.length];
  }
  return `AMC-${randomPart}`;
}

function hashToken(code) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

function maskCode(code) {
  if (!code || code.length < 6) return 'AMC-******';
  return `${code.slice(0, 6)}****`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Kaedah HTTP tidak dibenarkan. Sila gunakan POST.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    const {
      fullName,
      email,
      phone,
      branchId = 'kok_lanas',
      validHours = 48,
      internalNotes = '',
      assignedPlate = null,
      actor = { name: 'Pentadbir HQ', role: 'hq_admin', email: 'abedi@alfarhain.my' }
    } = req.body || {};

    // 1. Validation
    if (!fullName || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Sila lengkapkan nama penuh, emel rasmi, dan nombor telefon.',
        code: 'VALIDATION_FAILED'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanName = fullName.trim();
    const expiryHours = Math.max(1, Math.min(168, parseInt(validHours, 10) || 48)); // 1 hour to 7 days, default 48h
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    const plainCode = generateSecureCode();
    const codeHash = hashToken(plainCode);
    const maskedCode = maskCode(plainCode);

    // Build base URL for activation link
    const origin = req.headers.origin || req.headers.host 
      ? `https://${req.headers.host}`
      : 'https://alfarhainambulance.com';
    const activationLink = `${origin}/?act=${encodeURIComponent(plainCode)}&email=${encodeURIComponent(cleanEmail)}`;

    const supabase = getSupabaseAdmin();

    if (supabase) {
      // 2. Check for active duplicate invitations
      const { data: existingActive } = await supabase
        .from('driver_invitations')
        .select('id, status, expires_at')
        .eq('email', cleanEmail)
        .eq('status', 'Dihantar')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (existingActive) {
        return res.status(409).json({
          success: false,
          error: `Terdapat jemputan aktif sedia ada untuk emel ${cleanEmail}. Sila guna butang 'Jana Semula' sekiranya ingin menggantikan kod lama.`,
          code: 'DUPLICATE_ACTIVE_INVITATION'
        });
      }

      // Invalidate any previously expired or pending invitations for this email when creating a fresh one
      await supabase
        .from('driver_invitations')
        .update({ status: 'Dibatalkan', revoked_at: new Date().toISOString(), revoked_reason: 'Digantikan oleh jemputan baharu' })
        .eq('email', cleanEmail)
        .eq('status', 'Dihantar');

      // 3. Insert new invitation with hash only
      const { data: inserted, error: insertErr } = await supabase
        .from('driver_invitations')
        .insert({
          code_hash: codeHash,
          masked_code: maskedCode,
          full_name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          branch_id: branchId,
          assigned_plate: assignedPlate || null,
          status: 'Dihantar',
          delivery_status: 'Manual', // default until email provider configured
          internal_notes: internalNotes || null,
          expires_at: expiresAt,
          created_by_name: actor.name || 'Pentadbir HQ'
        })
        .select()
        .single();

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      // 4. Log Audit Event
      await supabase.from('driver_audit_logs').insert({
        actor_name: actor.name || 'Pentadbir HQ',
        actor_role: actor.role || 'hq_admin',
        target_email: cleanEmail,
        branch_id: branchId,
        action: 'JEMPUTAN_DICIPTA',
        reason: 'Jemputan onboarding pemandu baharu dikeluarkan.',
        details: {
          invitation_id: inserted.id,
          masked_code: maskedCode,
          branch_id: branchId,
          assigned_plate: assignedPlate || 'Tiada',
          valid_hours: expiryHours
        }
      });

      return res.status(201).json({
        success: true,
        message: 'Jemputan pemandu berjaya dicipta.',
        invitation: inserted,
        plainCode, // Returned ONLY on initial creation for manual sharing
        activationLink,
        deliveryStatus: 'Manual'
      });
    }

    // In-memory fallback if Supabase credentials are not configured in local environment
    return res.status(201).json({
      success: true,
      message: 'Jemputan pemandu berjaya dicipta (Mod Pangkalan Data Tempatan).',
      invitation: {
        id: 'inv-' + Date.now(),
        masked_code: maskedCode,
        full_name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        branch_id: branchId,
        assigned_plate: assignedPlate || null,
        status: 'Dihantar',
        delivery_status: 'Manual',
        expires_at: expiresAt,
        created_at: new Date().toISOString()
      },
      plainCode,
      activationLink,
      deliveryStatus: 'Manual'
    });

  } catch (err) {
    console.error('Error in /api/driver/invite:', err);
    return res.status(500).json({
      success: false,
      error: 'Ralat pelayan semasa menjana jemputan pemandu: ' + err.message,
      code: 'SERVER_ERROR'
    });
  }
}

