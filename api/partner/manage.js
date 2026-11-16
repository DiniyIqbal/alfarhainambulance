// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - SERVERLESS PARTNER MANAGEMENT API
// Endpoint: POST /api/partner/manage
// Enforces server-side authentication, RBAC, company-scoped isolation,
// rate limiting, and 5% commission rules.
// =========================================================================

import {
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
  getPartnerPortalScopedData
} from '../../src/services/partnerAmbulanceService.js';
import { applyCors, requireAuth, getClientIp, STAFF_ROLES, PARTNER_ROLES } from '../_lib/security.js';

const rateLimitWindow = new Map();

function checkRateLimit(ip = 'local', limit = 30) {
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
  if (applyCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Kaedah HTTP tidak dibenarkan. Sila gunakan POST.'
    });
  }

  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp, 40)) {
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak permintaan dalam masa singkat. Sila cuba sebentar lagi.'
    });
  }

  try {
    // NOTE: any `actor` field in the request body is ignored on purpose.
    const { operation, payload = {} } = req.body || {};

    if (!operation) {
      return res.status(400).json({
        success: false,
        error: 'Operasi API Rakan Ambulans tidak dinyatakan.'
      });
    }

    // Invitation redemption is performed by not-yet-registered partners and is
    // protected by the one-time invitation code itself.
    let actor = null;
    if (operation !== 'REDEEM_INVITATION') {
      const ctx = await requireAuth(req, res, { roles: [...STAFF_ROLES, ...PARTNER_ROLES] });
      if (!ctx) return;
      actor = ctx.actor;
    }

    let result;
    switch (operation) {
      case 'CREATE_INVITATION':
        result = createPartnerInvitation(actor, payload);
        break;
      case 'REDEEM_INVITATION':
        result = redeemPartnerInvitation(payload);
        break;
      case 'REVIEW_COMPANY':
        result = reviewPartnerCompany(actor, payload);
        break;
      case 'REVIEW_RESOURCE':
        result = reviewPartnerResource(actor, payload);
        break;
      case 'CREATE_OFFER':
        result = createPartnerTripOffer(actor, payload);
        break;
      case 'RESPOND_OFFER':
        result = respondToPartnerTripOffer(actor, payload);
        break;
      case 'WITHDRAW_OFFER':
        result = withdrawPartnerTripOffer(actor, payload);
        break;
      case 'ASSIGN_RESOURCES':
        result = assignPartnerResourcesToTrip(actor, payload);
        break;
      case 'UPDATE_PROGRESS':
        result = updatePartnerTripProgress(actor, payload);
        break;
      case 'VERIFY_COMPLETION':
        result = verifyPartnerTripCompletion(actor, payload);
        break;
      case 'CREATE_ADJUSTMENT':
        result = createFinancialAdjustment(actor, payload);
        break;
      case 'CREATE_SETTLEMENT_BATCH':
        result = createSettlementBatch(actor, payload);
        break;
      case 'COMPLETE_SETTLEMENT_BATCH':
        result = completeSettlementBatch(actor, payload);
        break;
      case 'GET_SCOPED_DATA':
        // Partners are always scoped to their own company, whatever they request.
        result = getPartnerPortalScopedData(
          actor,
          PARTNER_ROLES.includes(actor.role) ? actor.companyId : payload.companyId
        );
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Operasi "${operation}" tidak sah.`
        });
    }

    const status = result.success ? 200 : 400;
    return res.status(status).json(result);
  } catch (err) {
    console.error('[Partner Manage API Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Ralat dalaman pelayan semasa memproses permintaan Rakan Ambulans.'
    });
  }
}

