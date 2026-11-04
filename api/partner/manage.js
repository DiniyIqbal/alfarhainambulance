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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Kaedah HTTP tidak dibenarkan. Sila gunakan POST.'
    });
  }

  const clientIp = req.headers?.['x-forwarded-for'] || '127.0.0.1';
  if (!checkRateLimit(clientIp, 40)) {
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak permintaan dalam masa singkat. Sila cuba sebentar lagi.'
    });
  }

  try {
    const { operation, actor, payload = {} } = req.body || {};

    if (!operation) {
      return res.status(400).json({
        success: false,
        error: 'Operasi API Rakan Ambulans tidak dinyatakan.'
      });
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
        result = getPartnerPortalScopedData(actor, payload.companyId);
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

