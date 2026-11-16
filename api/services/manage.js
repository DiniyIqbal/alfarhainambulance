// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - SERVERLESS SERVICES MANAGEMENT API
// Endpoint: POST /api/services/manage
// Enforces server-side authentication, RBAC, atomic CRUD, and safe deletion.
// =========================================================================

import {
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
  validateAndQuotePackageBooking
} from '../../src/services/servicePackageManager.js';
import { applyCors, requireAuth, getClientIp, HQ_ADMIN_ROLES } from '../_lib/security.js';

const rateLimitWindow = new Map();

function checkRateLimit(ip = 'local', limit = 60) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const entry = rateLimitWindow.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  rateLimitWindow.set(ip, entry);
  return entry.count <= limit;
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, GET, OPTIONS')) return;

  // Public GET for customer booking flow (published active packages only)
  if (req.method === 'GET') {
    try {
      const published = getPublishedServicePackages();
      return res.status(200).json({ success: true, packages: published });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Kaedah HTTP tidak dibenarkan. Sila gunakan POST.'
    });
  }

  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp, 60)) {
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak permintaan. Sila tunggu sebentar.'
    });
  }

  try {
    // NOTE: any `actor` field in the request body is ignored on purpose.
    const { operation, payload = {} } = req.body || {};
    let actor = null;

    if (!operation) {
      return res.status(400).json({
        success: false,
        error: 'Operasi pengurusan perkhidmatan tidak dinyatakan.'
      });
    }

    // Role check for administrative actions
    const adminOperations = [
      'SAVE_PACKAGE', 'DUPLICATE_PACKAGE', 'ARCHIVE_PACKAGE', 'DELETE_PACKAGE',
      'SAVE_EQUIPMENT', 'DELETE_EQUIPMENT',
      'SAVE_STAFF_ROLE', 'DELETE_STAFF_ROLE',
      'GET_AUDIT_LOGS'
    ];

    if (adminOperations.includes(operation)) {
      const ctx = await requireAuth(req, res, { roles: HQ_ADMIN_ROLES });
      if (!ctx) return;
      actor = ctx.actor;
    }

    let result;
    switch (operation) {
      // Package operations
      case 'GET_PACKAGES':
        result = getServicePackagesList(payload);
        break;
      case 'GET_PACKAGE_BY_ID':
        result = getServicePackageByIdOrCode(payload.id);
        break;
      case 'SAVE_PACKAGE':
        result = saveServicePackage(actor, payload);
        break;
      case 'DUPLICATE_PACKAGE':
        result = duplicateServicePackage(actor, payload.id);
        break;
      case 'ARCHIVE_PACKAGE':
        result = archiveServicePackage(actor, payload.id);
        break;
      case 'DELETE_PACKAGE':
        result = deleteServicePackage(actor, payload.id);
        break;

      // Equipment operations
      case 'GET_EQUIPMENT':
        result = getServiceEquipmentList(payload);
        break;
      case 'SAVE_EQUIPMENT':
        result = saveServiceEquipment(actor, payload);
        break;
      case 'DELETE_EQUIPMENT':
        result = deleteServiceEquipment(actor, payload.id);
        break;

      // Staff role operations
      case 'GET_STAFF_ROLES':
        result = getServiceStaffRolesList(payload);
        break;
      case 'SAVE_STAFF_ROLE':
        result = saveServiceStaffRole(actor, payload);
        break;
      case 'DELETE_STAFF_ROLE':
        result = deleteServiceStaffRole(actor, payload.id);
        break;

      // Audit logs
      case 'GET_AUDIT_LOGS':
        result = getServiceAuditLogs(payload);
        break;

      // Authoritative pricing quote
      case 'QUOTE_BOOKING':
        result = validateAndQuotePackageBooking(payload);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Operasi "${operation}" tidak dikenali.`
        });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    const statusCode = err.code === 'CONCURRENCY_CONFLICT' ? 409 : 400;
    return res.status(statusCode).json({
      success: false,
      error: err.message || 'Ralat semasa memproses operasi perkhidmatan.',
      code: err.code || 'SERVICE_OP_ERROR',
      affectedPackages: err.affectedPackages || null
    });
  }
}

