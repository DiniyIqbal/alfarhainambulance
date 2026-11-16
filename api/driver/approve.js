// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// SERVERLESS ENDPOINT: POST /api/driver/approve
// Privileged administrative review endpoint: Luluskan, Minta Pembetulan, Tolak, Gantung.
// =========================================================================

import { applyCors, requireAuth, getSupabaseAdmin, isDevServer, canAccessBranch, HQ_ADMIN_ROLES } from '../_lib/security.js';

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Kaedah HTTP tidak dibenarkan.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  const ctx = await requireAuth(req, res, { roles: HQ_ADMIN_ROLES });
  if (!ctx) return;
  const actor = ctx.actor; // from verified JWT + staff_roles, never from the body

  try {
    const {
      driverId,
      driverEmail,
      action, // 'LULUSKAN' | 'MINTA_PEMBETULAN' | 'TOLAK' | 'GANTUNG' | 'AKTIFKAN_SEMULA'
      reason = '',
      assignedPlate = null,
      branchId = null
    } = req.body || {};

    if (!driverEmail && !driverId) {
      return res.status(400).json({
        success: false,
        error: 'ID atau emel pemandu diperlukan.',
        code: 'MISSING_DRIVER'
      });
    }

    const cleanEmail = (driverEmail || '').trim().toLowerCase();
    const cleanAction = (action || '').toUpperCase();

    // Prevent self-approval
    if (actor.email && cleanEmail && actor.email.toLowerCase() === cleanEmail) {
      return res.status(403).json({
        success: false,
        error: 'Tindakan disekat: Pentadbir tidak boleh meluluskan akaun pemandu sendiri.',
        code: 'SELF_APPROVAL_BLOCKED'
      });
    }

    // Require reason for corrections, rejection or suspension
    if (['MINTA_PEMBETULAN', 'TOLAK', 'GANTUNG'].includes(cleanAction) && (!reason || reason.trim().length < 5)) {
      return res.status(400).json({
        success: false,
        error: `Sila nyatakan ulasan/sebab bagi tindakan ${cleanAction} (minimum 5 aksara).`,
        code: 'REASON_REQUIRED'
      });
    }

    const supabase = getSupabaseAdmin();

    if (supabase) {
      // Find driver
      let query = supabase.from('ambulance_drivers').select('*');
      if (driverId) query = query.eq('id', driverId);
      else query = query.eq('email', cleanEmail);
      const { data: driver, error: findErr } = await query.maybeSingle();

      if (findErr) throw findErr;
      if (!driver) {
        return res.status(404).json({
          success: false,
          error: 'Rekod pemandu tidak ditemui.',
          code: 'DRIVER_NOT_FOUND'
        });
      }

      // Self-approval check against the stored driver record as well
      if (driver.user_id && driver.user_id === actor.id) {
        return res.status(403).json({
          success: false,
          error: 'Tindakan disekat: Pentadbir tidak boleh meluluskan akaun pemandu sendiri.',
          code: 'SELF_APPROVAL_BLOCKED'
        });
      }

      // Branch scope: current branch AND (if moving) the destination branch
      if (!canAccessBranch(actor, driver.hub_id) || (branchId && !canAccessBranch(actor, branchId))) {
        return res.status(403).json({
          success: false,
          error: `Akses ditolak: Anda hanya boleh menguruskan pemandu bagi cawangan ${actor.branchId}.`,
          code: 'CROSS_BRANCH_FORBIDDEN'
        });
      }

      const updates = {
        updated_at: new Date().toISOString()
      };
      if (assignedPlate !== undefined && assignedPlate !== null) updates.assigned_plate = assignedPlate;
      if (branchId) updates.hub_id = branchId;

      let newStatus = driver.account_status;

      if (cleanAction === 'LULUSKAN') {
        newStatus = 'Aktif';
        updates.account_status = 'Aktif';
        updates.approved_by = actor.id;
        updates.approved_by_name = actor.name;
        updates.approved_at = new Date().toISOString();
        updates.correction_notes = null;
        updates.rejection_reason = null;
        updates.suspension_reason = null;
      } else if (cleanAction === 'MINTA_PEMBETULAN') {
        newStatus = 'Perlu Pembetulan';
        updates.account_status = 'Perlu Pembetulan';
        updates.correction_notes = reason.trim();
      } else if (cleanAction === 'TOLAK') {
        newStatus = 'Ditolak';
        updates.account_status = 'Ditolak';
        updates.rejection_reason = reason.trim();
      } else if (cleanAction === 'GANTUNG') {
        newStatus = 'Digantung';
        updates.account_status = 'Digantung';
        updates.suspension_reason = reason.trim();
        updates.suspended_at = new Date().toISOString();
      } else if (cleanAction === 'AKTIFKAN_SEMULA') {
        newStatus = 'Aktif';
        updates.account_status = 'Aktif';
        updates.suspension_reason = null;
        updates.suspended_at = null;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Tindakan tidak sah: ' + cleanAction,
          code: 'INVALID_ACTION'
        });
      }

      const { data: updated, error: updateErr } = await supabase
        .from('ambulance_drivers')
        .update(updates)
        .eq('id', driver.id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Audit Log
      await supabase.from('driver_audit_logs').insert({
        actor_id: actor.id,
        actor_name: actor.name,
        actor_role: actor.role,
        target_driver_id: driver.id,
        target_email: driver.email,
        branch_id: driver.hub_id,
        action: cleanAction,
        reason: reason || 'Tindakan pentadbir disahkan.',
        details: {
          previous_status: driver.account_status,
          new_status: newStatus,
          assigned_plate: updates.assigned_plate || driver.assigned_plate,
          branch_id: updates.hub_id || driver.hub_id
        }
      });

      return res.status(200).json({
        success: true,
        message: `Status pemandu berjaya dikemas kini kepada '${newStatus}'.`,
        driver: updated
      });
    }

    // Mock Offline Fallback (local dev server only)
    if (!isDevServer()) {
      return res.status(503).json({ success: false, error: 'Pelayan belum dikonfigurasi.', code: 'SERVER_NOT_CONFIGURED' });
    }
    return res.status(200).json({
      success: true,
      message: `Status pemandu dikemas kini kepada '${cleanAction}' (Mod Tempatan).`,
      driver: {
        email: cleanEmail,
        account_status: cleanAction === 'LULUSKAN' ? 'Aktif' : cleanAction === 'MINTA_PEMBETULAN' ? 'Perlu Pembetulan' : cleanAction,
        assigned_plate: assignedPlate || 'VPQ 7606'
      }
    });

  } catch (err) {
    console.error('Error in /api/driver/approve:', err);
    return res.status(500).json({
      success: false,
      error: 'Ralat pelayan semasa mengemas kini status pemandu.',
      code: 'SERVER_ERROR'
    });
  }
}

