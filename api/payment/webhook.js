// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - CHIP WEBHOOK NOTIFICATION ENDPOINT
// Vercel Serverless Function: POST /api/payment/webhook
//
// Trust model:
//   1. If an X-Signature header is sent it MUST verify against CHIP_PUBLIC_KEY
//      (RSA PKCS#1 v1.5 SHA-256 over the raw body). Bad signature -> 401.
//   2. The payload is treated only as a notification. The purchase is always
//      re-fetched from the CHIP API with our secret key, and THAT response is
//      the source of truth for status, reference and amount.
//   3. The booking must be bound to the same purchase id, and the amount paid
//      must equal the amount due recorded at checkout.
//   4. Processing is idempotent: repeated notifications are no-ops.
// =========================================================================

import crypto from 'crypto';
import { getSupabaseAdmin, isDevServer, readRawBody } from '../_lib/security.js';

function chipConfig() {
  return {
    secretKey: (process.env.CHIP_SECRET_KEY || '').trim(),
    brandId: (process.env.CHIP_BRAND_ID || '').trim(),
    publicKey: (process.env.CHIP_PUBLIC_KEY || '').replace(/\\n/g, '\n').trim(),
    apiUrl: (process.env.CHIP_API_URL || 'https://gate.chip-in.asia/api/v1').replace(/\/+$/, '')
  };
}

function verifySignature(rawBody, signature, publicKey) {
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(rawBody);
  return verifier.verify(publicKey, signature, 'base64');
}

async function fetchPurchaseFromChip(purchaseId, cfg) {
  const response = await fetch(`${cfg.apiUrl}/purchases/${encodeURIComponent(purchaseId)}/`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cfg.secretKey}` }
  });
  if (!response.ok) {
    throw new Error(`CHIP purchase lookup failed with HTTP ${response.status}`);
  }
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cfg = chipConfig();
  const chipConfigured = Boolean(cfg.secretKey && cfg.brandId);

  // ---- 1. Parse body (raw first, so the signature can be checked) ----
  let rawBody = '';
  let payload = {};
  try {
    rawBody = await readRawBody(req);
    payload = rawBody ? JSON.parse(rawBody) : (req.body && typeof req.body === 'object' ? req.body : {});
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // ---- 2. Signature (defence in depth) ----
  const signature = req.headers['x-signature'];
  if (signature) {
    if (!cfg.publicKey) {
      console.error('[CHIP Webhook] Signature received but CHIP_PUBLIC_KEY is not configured.');
      return res.status(503).json({ error: 'Webhook verification not configured' });
    }
    if (!rawBody) {
      console.warn('[CHIP Webhook] Raw body unavailable; relying on CHIP API re-verification.');
    } else {
      let valid = false;
      try {
        valid = verifySignature(rawBody, signature, cfg.publicKey);
      } catch (err) {
        console.error('[CHIP Webhook] Signature verification error:', err.message);
        return res.status(400).json({ error: 'Signature verification failed' });
      }
      if (!valid) {
        console.error('[CHIP Webhook] Signature mismatch. Rejecting.');
        return res.status(401).json({ error: 'Invalid webhook signature', code: 'SIGNATURE_MISMATCH' });
      }
    }
  }

  const purchaseId = typeof payload.id === 'string' ? payload.id : null;
  if (!purchaseId) {
    return res.status(400).json({ error: 'Missing purchase id' });
  }

  // ---- 3. Authoritative purchase data ----
  let purchase;
  if (chipConfigured) {
    try {
      purchase = await fetchPurchaseFromChip(purchaseId, cfg);
    } catch (err) {
      console.error('[CHIP Webhook] Could not verify purchase with CHIP:', err.message);
      return res.status(502).json({ error: 'Unable to verify purchase' }); // CHIP will retry
    }
    if (purchase.brand_id && purchase.brand_id !== cfg.brandId) {
      console.error('[CHIP Webhook] Purchase belongs to another brand. Ignoring.');
      return res.status(400).json({ error: 'Brand mismatch' });
    }
  } else if (isDevServer()) {
    console.warn('[CHIP Webhook] CHIP not configured: trusting payload (local dev only).');
    purchase = payload;
  } else {
    console.error('[CHIP Webhook] CHIP credentials missing in production. Rejecting.');
    return res.status(503).json({ error: 'Payment gateway not configured' });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    console.error('[CHIP Webhook] SUPABASE_SERVICE_ROLE_KEY missing. Cannot record payment.');
    return res.status(503).json({ error: 'Database not configured' }); // CHIP will retry
  }

  const invoiceNo = purchase.reference;
  const status = String(purchase.status || '').toLowerCase();
  if (!invoiceNo) {
    return res.status(400).json({ error: 'Purchase has no reference' });
  }

  try {
    const { data: booking, error: findErr } = await admin
      .from('ambulance_bookings')
      .select('id, invoice_number, payment_status, chip_purchase_id, amount_due, total_fare')
      .eq('invoice_number', invoiceNo)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!booking) {
      console.error(`[CHIP Webhook] No booking for reference ${invoiceNo}.`);
      return res.status(200).json({ received: true, ignored: 'unknown_reference' });
    }

    if (booking.chip_purchase_id && booking.chip_purchase_id !== purchaseId) {
      console.error(`[CHIP Webhook] Purchase ${purchaseId} does not match booking ${invoiceNo}.`);
      return res.status(200).json({ received: true, ignored: 'purchase_mismatch' });
    }

    // Idempotency
    if (booking.payment_status === 'paid') {
      return res.status(200).json({ received: true, alreadyProcessed: true });
    }

    const now = new Date().toISOString();

    if (status === 'paid') {
      const paidCents = Number(purchase.purchase?.total ?? purchase.payment?.amount ?? 0);
      const dueCents = Math.round(Number(booking.amount_due ?? booking.total_fare ?? 0) * 100);
      const amountOk = paidCents > 0 && paidCents === dueCents;

      const { error } = await admin
        .from('ambulance_bookings')
        .update({
          payment_status: amountOk ? 'paid' : 'amount_mismatch',
          payment_method: purchase.transaction_data?.payment_method || purchase.payment?.payment_method || 'chip',
          paid_amount: paidCents / 100,
          paid_at: now,
          chip_purchase_id: purchaseId,
          chip_receipt_url: purchase.transaction_data?.receipt_url || null,
          updated_at: now
        })
        .eq('id', booking.id);
      if (error) throw error;

      if (!amountOk) {
        console.error(`[CHIP Webhook] Amount mismatch on ${invoiceNo}: paid ${paidCents} cents, due ${dueCents} cents. Flagged for review.`);
      } else {
        console.info(`[CHIP Webhook] Booking ${invoiceNo} marked as paid.`);
      }
    } else if (['cancelled', 'expired', 'error', 'blocked', 'failed'].includes(status)) {
      const { error } = await admin
        .from('ambulance_bookings')
        .update({ payment_status: status === 'cancelled' ? 'cancelled' : 'failed', updated_at: now })
        .eq('id', booking.id);
      if (error) throw error;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[CHIP Webhook] Processing error:', err.message);
    return res.status(500).json({ error: 'Processing error' }); // CHIP will retry
  }
}
