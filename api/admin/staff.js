// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// SERVERLESS ENDPOINT: POST /api/admin/staff
// HQ staff account management (no email/SMTP needed):
//   LIST    - list staff accounts
//   CREATE  - create (or link) a login and grant a staff role
//   UPDATE  - change role / branch / name / active flag
// Caller must be an active hq_admin (verified JWT + staff_roles.user_id).
// =========================================================================

import crypto from 'crypto';
import { applyCors, requireAuth, getSupabaseAdmin, isDevServer } from '../_lib/security.js';

const ASSIGNABLE_ROLES = ['hq_admin', 'branch_manager', 'dispatcher', 'hq_finance'];
const BRANCHES = ['all', 'kok_lanas', 'raub', 'jeli', 'gua_musang'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function generatePassword() {
  const charset = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 14; i++) out += charset[crypto.randomInt(charset.length)];
  return out;
}

function fail(res, status, code, error) {
  return res.status(status).json({ success: false, code, error });
}

async function audit(supabase, actor, action, targetEmail, branchId, details) {
  try {
    await supabase.from('driver_audit_logs').insert({
      actor_id: actor.id,
      actor_name: actor.name || 'Pentadbir HQ',
      actor_role: actor.role,
      target_email: targetEmail,
      branch_id: branchId || null,
      action,
      reason: 'Pengurusan akaun staf HQ',
      details
    });
  } catch (err) {
    console.error('[admin/staff] audit failed:', err.message);
  }
}

function validateRoleAndBranch(role, branchId) {
  if (!ASSIGNABLE_ROLES.includes(role)) return 'Peranan tidak sah.';
  if (!BRANCHES.includes(branchId)) return 'Cawangan tidak sah.';
  if (role === 'branch_manager' && branchId === 'all') return 'Pengurus cawangan mesti ditetapkan kepada satu cawangan.';
  return null;
}

/** Number of active hq_admin accounts that can actually sign in. */
async function countActiveAdmins(supabase, exceptId = null) {
  let q = supabase
    .from('staff_roles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'hq_admin')
    .eq('is_active', true)
    .not('user_id', 'is', null);
  if (exceptId) q = q.neq('id', exceptId);
  const { count } = await q;
  return count || 0;
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Kaedah HTTP tidak dibenarkan.');

  // Only full HQ administrators may manage staff accounts.
  const ctx = await requireAuth(req, res, { roles: ['hq_admin'] });
  if (!ctx) return;
  const actor = ctx.actor;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return fail(res, 503, 'SERVER_NOT_CONFIGURED', isDevServer()
      ? 'Pengurusan staf memerlukan SUPABASE_SERVICE_ROLE_KEY.'
      : 'Pelayan belum dikonfigurasi.');
  }

  try {
    const { operation, payload = {} } = req.body || {};

    // ---------------------------------------------------------------- LIST
    if (operation === 'LIST') {
      const { data, error } = await supabase
        .from('staff_roles')
        .select('id, user_id, email, full_name, role, branch_id, is_active, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const staff = (data || []).map((s) => ({
        id: s.id,
        email: s.email,
        fullName: s.full_name,
        role: s.role,
        branchId: s.branch_id,
        isActive: s.is_active,
        linked: Boolean(s.user_id), // false = no login yet, cannot sign in
        createdAt: s.created_at
      }));
      return res.status(200).json({ success: true, staff });
    }

    // -------------------------------------------------------------- CREATE
    if (operation === 'CREATE') {
      const email = String(payload.email || '').trim().toLowerCase();
      const fullName = String(payload.fullName || '').trim();
      const role = payload.role;
      const branchId = payload.branchId || (role === 'branch_manager' ? '' : 'all');

      if (!EMAIL_RE.test(email)) return fail(res, 400, 'VALIDATION_FAILED', 'Emel tidak sah.');
      if (fullName.length < 2) return fail(res, 400, 'VALIDATION_FAILED', 'Nama penuh diperlukan.');
      const bad = validateRoleAndBranch(role, branchId);
      if (bad) return fail(res, 400, 'VALIDATION_FAILED', bad);

      const { data: existingRow } = await supabase
        .from('staff_roles').select('id, user_id').eq('email', email).maybeSingle();
      if (existingRow?.user_id) {
        return fail(res, 409, 'STAFF_EXISTS', 'Akaun staf untuk emel ini sudah wujud. Gunakan kemas kini.');
      }

      // Password: supplied by the admin, or generated and shown once.
      let password = typeof payload.password === 'string' ? payload.password : '';
      let generated = false;
      if (!password) { password = generatePassword(); generated = true; }
      if (password.length < 10) {
        return fail(res, 400, 'WEAK_PASSWORD', 'Kata laluan mestilah sekurang-kurangnya 10 aksara.');
      }

      // Create the login, or link an existing one WITHOUT touching its password.
      let userId = null;
      let linkedExisting = false;
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // admin-created: no email round-trip needed
        user_metadata: { full_name: fullName }
      });
      if (created?.user) {
        userId = created.user.id;
      } else if (createErr) {
        const { data: foundId } = await supabase.rpc('app_find_user_id_by_email', { p_email: email });
        if (!foundId) {
          console.error('[admin/staff] createUser failed:', createErr.message);
          return fail(res, 400, 'AUTH_CREATE_FAILED', 'Gagal mencipta akaun log masuk.');
        }
        userId = foundId;
        linkedExisting = true;
        generated = false;
      }

      // A login may hold only one HQ role.
      const { data: dup } = await supabase
        .from('staff_roles').select('id, email').eq('user_id', userId).maybeSingle();
      if (dup && dup.email !== email) {
        return fail(res, 409, 'USER_ALREADY_STAFF', 'Pengguna ini sudah mempunyai peranan staf lain.');
      }

      const row = {
        email,
        full_name: fullName,
        role,
        branch_id: branchId,
        is_active: true,
        user_id: userId,
        updated_at: new Date().toISOString()
      };
      const { data: saved, error: saveErr } = await supabase
        .from('staff_roles')
        .upsert(row, { onConflict: 'email' })
        .select('id, email, full_name, role, branch_id, is_active')
        .single();
      if (saveErr) throw saveErr;

      await audit(supabase, actor, 'STAF_DICIPTA', email, branchId, { role, branch_id: branchId, linked_existing: linkedExisting });

      return res.status(201).json({
        success: true,
        message: linkedExisting
          ? 'Akaun sedia ada dipautkan sebagai staf. Kata laluan tidak diubah.'
          : 'Akaun staf berjaya dicipta.',
        staff: saved,
        // Shown ONCE, only when the server generated it.
        temporaryPassword: generated ? password : undefined,
        linkedExisting
      });
    }

    // -------------------------------------------------------------- UPDATE
    if (operation === 'UPDATE') {
      const { data: target } = await supabase
        .from('staff_roles')
        .select('id, user_id, email, full_name, role, branch_id, is_active')
        .eq('id', payload.id || '')
        .maybeSingle();
      if (!target) return fail(res, 404, 'NOT_FOUND', 'Rekod staf tidak ditemui.');

      const role = payload.role ?? target.role;
      const branchId = payload.branchId ?? target.branch_id;
      const isActive = payload.isActive ?? target.is_active;
      const fullName = payload.fullName != null ? String(payload.fullName).trim() : target.full_name;

      const bad = validateRoleAndBranch(role, branchId);
      if (bad) return fail(res, 400, 'VALIDATION_FAILED', bad);
      if (fullName.length < 2) return fail(res, 400, 'VALIDATION_FAILED', 'Nama penuh diperlukan.');
      if (typeof isActive !== 'boolean') return fail(res, 400, 'VALIDATION_FAILED', 'Status aktif tidak sah.');

      const isSelf = target.user_id && target.user_id === actor.id;
      const losesAdmin = target.role === 'hq_admin' && target.is_active && (role !== 'hq_admin' || !isActive);

      if (isSelf && (role !== target.role || !isActive)) {
        return fail(res, 403, 'SELF_CHANGE_BLOCKED', 'Anda tidak boleh menukar peranan atau menyahaktifkan akaun sendiri.');
      }
      if (losesAdmin && (await countActiveAdmins(supabase, target.id)) < 1) {
        return fail(res, 409, 'LAST_ADMIN', 'Mesti sekurang-kurangnya seorang Pentadbir HQ aktif.');
      }

      const { data: saved, error: saveErr } = await supabase
        .from('staff_roles')
        .update({ role, branch_id: branchId, is_active: isActive, full_name: fullName, updated_at: new Date().toISOString() })
        .eq('id', target.id)
        .select('id, email, full_name, role, branch_id, is_active')
        .single();
      if (saveErr) throw saveErr;

      await audit(supabase, actor, 'STAF_DIKEMASKINI', target.email, branchId, {
        from: { role: target.role, branch_id: target.branch_id, is_active: target.is_active },
        to: { role, branch_id: branchId, is_active: isActive }
      });

      // Deactivation takes effect on the next API call; also end live sessions.
      if (!isActive && target.user_id) {
        try { await supabase.auth.admin.signOut(target.user_id, 'global'); } catch { /* best effort */ }
      }

      return res.status(200).json({ success: true, message: 'Akaun staf dikemas kini.', staff: saved });
    }

    return fail(res, 400, 'INVALID_OPERATION', `Operasi "${operation}" tidak sah.`);
  } catch (err) {
    console.error('[admin/staff] error:', err);
    return fail(res, 500, 'SERVER_ERROR', 'Ralat pelayan semasa menguruskan akaun staf.');
  }
}
