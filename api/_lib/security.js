// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// Shared server-side security helpers for /api/* functions.
// Files under api/_lib are NOT exposed as endpoints by Vercel.
//
// Rules enforced here:
//   * Identity comes ONLY from a verified Supabase JWT (Authorization: Bearer)
//   * Roles come ONLY from staff_roles / ambulance_drivers / partner_memberships
//     (never from the request body or user_metadata)
//   * CORS is restricted to this deployment + ALLOWED_ORIGINS
//   * Missing server credentials fail closed outside the local dev server
// =========================================================================

import { createClient } from '@supabase/supabase-js';

export const STAFF_ROLES = ['hq_admin', 'branch_manager', 'dispatcher', 'hq_finance'];
export const HQ_ADMIN_ROLES = ['hq_admin', 'branch_manager'];
export const PARTNER_ROLES = ['partner_admin', 'partner_driver'];

/** True only when running under `npm run dev` (set by vite.config.js). */
export function isDevServer() {
  return process.env.AFAMS_DEV_SERVER === '1';
}

let adminClient = null;

/** Service-role client. Returns null when not configured. Server use only. */
export function getSupabaseAdmin() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return adminClient;
}

// -------------------------------------------------------------------------
// CORS
// -------------------------------------------------------------------------
function getAllowedOrigins(req) {
  const list = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (host) list.push(`https://${host}`);
  if (isDevServer()) {
    if (host) list.push(`http://${host}`);
    list.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }
  return list;
}

/**
 * Applies restrictive CORS headers. Returns true if the request was a
 * preflight that has been fully answered (caller should return).
 */
export function applyCors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers?.origin;
  if (origin && getAllowedOrigins(req).includes(origin.replace(/\/+$/, ''))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

// -------------------------------------------------------------------------
// Authentication & role resolution
// -------------------------------------------------------------------------
function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1].trim() : null;
}

async function resolveAccess(admin, user) {
  const email = (user.email || '').trim().toLowerCase();

  // Roles are linked manually by an administrator (user_id column).
  // They are NEVER matched by email address, so this does not depend on
  // Supabase "Confirm email" being enabled.

  // 1. HQ / branch staff
  const { data: staff } = await admin
    .from('staff_roles')
    .select('id, role, branch_id, full_name, email, is_active, user_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (staff) {
    return {
      role: staff.role,
      appRole: 'hq',
      fullName: staff.full_name,
      email: staff.email,
      branchId: staff.branch_id || 'all'
    };
  }

  // 2. Al-Farhain drivers (linked by /api/driver/activate)
  const { data: driver } = await admin
    .from('ambulance_drivers')
    .select('id, name, email, hub_id, assigned_plate, account_status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (driver) {
    return {
      role: 'driver',
      appRole: 'driver',
      driverId: driver.id,
      fullName: driver.name,
      email: driver.email,
      branchId: driver.hub_id,
      plate: driver.assigned_plate,
      accountStatus: driver.account_status
    };
  }

  // 3. Partner ambulance companies
  const { data: member } = await admin
    .from('partner_memberships')
    .select('id, company_id, role, full_name, email, account_status, user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (member && member.account_status === 'Aktif') {
    return {
      role: member.role,
      appRole: member.role === 'partner_driver' ? 'driver' : 'partner',
      fullName: member.full_name,
      email: member.email,
      companyId: member.company_id,
      accountStatus: member.account_status
    };
  }

  return { role: 'patient', appRole: 'patient', email };
}

function buildActor(user, access) {
  return {
    id: user.id,
    email: (access.email || user.email || '').toLowerCase(),
    name: access.fullName || user.email,
    role: access.role,
    branchId: access.branchId || null,
    companyId: access.companyId || null,
    // partnerAmbulanceService reads this as the server-trusted company scope
    trustedCompanyId: access.companyId || null
  };
}

const DEV_CONTEXT = Object.freeze({
  user: { id: '00000000-0000-0000-0000-000000000000', email: 'dev@localhost' },
  access: { role: 'hq_admin', appRole: 'hq', fullName: 'Dev HQ Admin', email: 'dev@localhost', branchId: 'all' },
  actor: {
    id: '00000000-0000-0000-0000-000000000000',
    email: 'dev@localhost',
    name: 'Dev HQ Admin',
    role: 'hq_admin',
    branchId: 'all',
    companyId: null,
    trustedCompanyId: null
  },
  isDevFallback: true
});

/**
 * Resolves the caller. Never throws for anonymous callers.
 * @returns {Promise<{user: object|null, access: object, actor: object|null, configError?: boolean}>}
 */
export async function getRequestContext(req) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    if (isDevServer()) {
      console.warn('[AFAMS security] SUPABASE_SERVICE_ROLE_KEY not set: using local dev HQ identity.');
      return DEV_CONTEXT;
    }
    return { user: null, access: { role: 'anonymous' }, actor: null, configError: true };
  }

  const token = getBearerToken(req);
  if (!token) return { user: null, access: { role: 'anonymous' }, actor: null };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, access: { role: 'anonymous' }, actor: null, invalidToken: true };
  }

  const access = await resolveAccess(admin, data.user);
  return { user: data.user, access, actor: buildActor(data.user, access) };
}

/**
 * Requires a signed-in caller (optionally with one of `roles`).
 * Sends the error response itself and returns null when access is denied.
 */
export async function requireAuth(req, res, { roles = null } = {}) {
  let ctx;
  try {
    ctx = await getRequestContext(req);
  } catch (err) {
    console.error('[AFAMS security] Auth resolution failed:', err.message);
    res.status(503).json({ success: false, error: 'Perkhidmatan pengesahan tidak tersedia.', code: 'AUTH_UNAVAILABLE' });
    return null;
  }

  if (ctx.configError) {
    res.status(503).json({ success: false, error: 'Pelayan belum dikonfigurasi dengan betul.', code: 'SERVER_NOT_CONFIGURED' });
    return null;
  }

  if (!ctx.user) {
    res.status(401).json({ success: false, error: 'Sila log masuk untuk meneruskan.', code: 'UNAUTHENTICATED' });
    return null;
  }

  if (roles && !roles.includes(ctx.access.role)) {
    res.status(403).json({ success: false, error: 'Akses ditolak untuk peranan anda.', code: 'FORBIDDEN' });
    return null;
  }

  return ctx;
}

/** True if a staff actor may act on records belonging to `branchId`. */
export function canAccessBranch(actor, branchId) {
  if (!actor) return false;
  if (!actor.branchId || actor.branchId === 'all') return true;
  return Boolean(branchId) && actor.branchId === branchId;
}

// -------------------------------------------------------------------------
// Raw request body (needed for webhook signature verification)
// -------------------------------------------------------------------------
export async function readRawBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');

  // Read the stream only if nothing has consumed it yet.
  if (req.readable && !req.readableEnded && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  return '';
}

/** Lightweight client IP for logging / rate limiting. */
export function getClientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
