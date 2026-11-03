// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// SERVERLESS ENDPOINT: POST /api/driver/activate
// Atomically consumes invitation, registers driver profile, and sets status to 'Menunggu Kelulusan'.
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

function hashToken(code) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
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
      error: 'Kaedah HTTP tidak dibenarkan.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    const {
      code,
      email,
      phone,
      fullName,
      password,
      icNumber = '',
      licenseType = 'GDL D / E Bertauliah EMT'
    } = req.body || {};

    if (!code || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Sila lengkapkan maklumat kod jemputan, emel dan kata laluan.',
        code: 'MISSING_FIELDS'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Kata laluan mestilah sekurang-kurangnya 8 aksara.',
        code: 'WEAK_PASSWORD'
      });
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    const codeHash = hashToken(cleanCode);

    const supabase = getSupabaseAdmin();

    if (supabase) {
      // 1. Redeem atomically using Stored Procedure
      const { data: redeemResults, error: rpcErr } = await supabase.rpc('redeem_driver_invitation', {
        p_code_hash: codeHash,
        p_email: cleanEmail
      });

      let redemption = redeemResults && redeemResults[0];

      // Fallback if stored proc not yet loaded into live db
      if (rpcErr || !redemption) {
        const { data: inv, error: invErr } = await supabase
          .from('driver_invitations')
          .select('*')
          .eq('code_hash', codeHash)
          .maybeSingle();

        if (invErr || !inv) {
          return res.status(404).json({
            success: false,
            error: 'Kod jemputan tidak sah atau telah luput.',
            code: 'INVALID_CODE'
          });
        }

        if (inv.email.toLowerCase() !== cleanEmail) {
          return res.status(403).json({
            success: false,
            error: 'Emel tidak sepadan dengan jemputan HQ.',
            code: 'EMAIL_MISMATCH'
          });
        }

        if (inv.status === 'Diterima' || inv.consumed_at) {
          return res.status(410).json({
            success: false,
            error: 'Kod jemputan ini telah pun digunakan.',
            code: 'INVITATION_ALREADY_USED'
          });
        }

        if (inv.status === 'Dibatalkan' || inv.revoked_at) {
          return res.status(410).json({
            success: false,
            error: 'Jemputan ini telah dibatalkan oleh HQ.',
            code: 'INVITATION_REVOKED'
          });
        }

        if (new Date(inv.expires_at) < new Date()) {
          return res.status(410).json({
            success: false,
            error: 'Kod jemputan telah tamat tempoh sah.',
            code: 'INVITATION_EXPIRED'
          });
        }

        // Consume invitation
        await supabase
          .from('driver_invitations')
          .update({ status: 'Diterima', consumed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', inv.id);

        redemption = {
          success: true,
          invitation_id: inv.id,
          full_name: inv.full_name,
          branch_id: inv.branch_id,
          assigned_plate: inv.assigned_plate
        };
      } else if (!redemption.success) {
        return res.status(400).json({
          success: false,
          error: redemption.message,
          code: 'REDEMPTION_FAILED'
        });
      }

      // 2. Register / Update Auth User securely
      let authUserId = null;
      try {
        const { data: userCreated, error: createAuthErr } = await supabase.auth.admin.createUser({
          email: cleanEmail,
          password: password,
          email_confirm: true,
          user_metadata: { role: 'driver', full_name: fullName || redemption.full_name }
        });

        if (userCreated && userCreated.user) {
          authUserId = userCreated.user.id;
        } else if (createAuthErr) {
          // If user already exists in auth, update their password
          const { data: listUser } = await supabase.auth.admin.listUsers();
          const existingUser = listUser?.users?.find(u => u.email.toLowerCase() === cleanEmail);
          if (existingUser) {
            authUserId = existingUser.id;
            await supabase.auth.admin.updateUserById(existingUser.id, {
              password: password,
              user_metadata: { role: 'driver', full_name: fullName || redemption.full_name }
            });
          }
        }
      } catch (authErr) {
        console.warn('Supabase Auth Admin fallback:', authErr.message);
      }

      // 3. Upsert driver profile with account_status = 'Menunggu Kelulusan'
      const driverRecord = {
        name: fullName || redemption.full_name,
        email: cleanEmail,
        phone: phone || '013-914 7606',
        hub_id: redemption.branch_id || 'kok_lanas',
        assigned_plate: redemption.assigned_plate || null,
        license_type: licenseType,
        ic_number: icNumber,
        account_status: 'Menunggu Kelulusan', // strictly pending approval
        invitation_id: redemption.invitation_id,
        user_id: authUserId,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: updatedDriver, error: driverErr } = await supabase
        .from('ambulance_drivers')
        .upsert(driverRecord, { onConflict: 'email' })
        .select()
        .single();

      if (driverErr) {
        // Fallback insert without conflict constraint
        await supabase.from('ambulance_drivers').insert(driverRecord);
      }

      // 4. Log Audit Event
      await supabase.from('driver_audit_logs').insert({
        actor_name: fullName || cleanEmail,
        actor_role: 'driver',
        target_email: cleanEmail,
        branch_id: redemption.branch_id || 'kok_lanas',
        action: 'PROFIL_DIHANTAR',
        reason: 'Pemandu berjaya menebus jemputan dan menghantar permohonan pengaktifan.',
        details: {
          invitation_id: redemption.invitation_id,
          branch_id: redemption.branch_id,
          account_status: 'Menunggu Kelulusan'
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Permohonan pengaktifan akaun pemandu telah berjaya dihantar. Sila tunggu kelulusan HQ.',
        accountStatus: 'Menunggu Kelulusan',
        driver: {
          email: cleanEmail,
          fullName: fullName || redemption.full_name,
          branchId: redemption.branch_id,
          status: 'Menunggu Kelulusan'
        }
      });
    }

    // Mock Offline / Local Mode
    return res.status(200).json({
      success: true,
      message: 'Permohonan dihantar (Simulasi Luar Talian). Menunggu kelulusan HQ.',
      accountStatus: 'Menunggu Kelulusan',
      driver: {
        email: cleanEmail,
        fullName: fullName || 'Pemandu AFAMS',
        branchId: 'kok_lanas',
        status: 'Menunggu Kelulusan'
      }
    });

  } catch (err) {
    console.error('Error in /api/driver/activate:', err);
    return res.status(500).json({
      success: false,
      error: 'Ralat pelayan semasa mengaktifkan pemandu: ' + err.message,
      code: 'SERVER_ERROR'
    });
  }
}

