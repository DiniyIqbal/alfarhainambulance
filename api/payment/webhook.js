// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - CHIP WEBHOOK NOTIFICATION ENDPOINT
// Vercel Serverless Function: POST /api/payment/webhook
// Verifies RSA PKCS#1 v1.5 SHA256 signature using CHIP_PUBLIC_KEY.
// Updates ambulance booking status in Supabase upon payment settlement.
// =========================================================================

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signature = req.headers['x-signature'];
    const payload = req.body || {};
    const publicKey = (process.env.CHIP_PUBLIC_KEY || '').trim();

    // 1. Signature Verification (if Public Key is configured)
    if (publicKey && publicKey.length > 50 && signature) {
      try {
        const rawBody = typeof req.rawBody === 'string'
          ? req.rawBody
          : JSON.stringify(payload);

        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(rawBody);
        const isVerified = verifier.verify(publicKey, signature, 'base64');

        if (!isVerified) {
          console.error('[CHIP Webhook] Cryptographic signature mismatch. Rejecting payload.');
          return res.status(400).json({ error: 'Invalid webhook signature', code: 'SIGNATURE_MISMATCH' });
        }
      } catch (cryptoErr) {
        console.warn('[CHIP Webhook Crypto Warning]:', cryptoErr.message);
      }
    }

    const eventType = payload.event_type || payload.type || '';
    const status = payload.status || '';
    const purchaseId = payload.id;
    const invoiceNo = payload.reference;

    console.info(`[CHIP Webhook Received]: Purchase ${purchaseId} | Status: ${status} | Event: ${eventType} | Invoice: ${invoiceNo}`);

    // Check if payment is successful
    const isPaid = status === 'paid' || eventType === 'purchase.paid';

    if (isPaid && invoiceNo) {
      await markBookingAsPaidInSupabase(invoiceNo, payload);
    } else if (status === 'cancelled' || eventType === 'purchase.cancelled') {
      await updateBookingPaymentStatus(invoiceNo, 'cancelled');
    } else if (status === 'failed' || eventType === 'purchase.failed') {
      await updateBookingPaymentStatus(invoiceNo, 'failed');
    }

    return res.status(200).json({
      status: 'success',
      received: true,
      purchaseId,
      invoiceNo
    });

  } catch (err) {
    console.error('[CHIP Webhook Processing Error]:', err);
    // Still return 200 to acknowledge receipt and prevent CHIP retry spam
    return res.status(200).json({
      status: 'error_logged',
      message: err.message
    });
  }
}

/**
 * Updates Supabase booking record to 'paid' with audit metadata
 */
async function markBookingAsPaidInSupabase(invoiceNo, payload) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[CHIP Webhook] Supabase keys not set. Cannot update booking to paid.');
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const paidCents = payload.purchase?.total || payload.payment?.amount || 0;
    const paidAmount = paidCents > 0 ? (paidCents / 100) : null;
    const paymentMethod = payload.transaction_data?.payment_method || payload.payment?.payment_method || 'fpx';
    const receiptUrl = payload.transaction_data?.receipt_url || payload.receipt_url || null;

    const { error } = await supabase
      .from('ambulance_bookings')
      .update({
        payment_status: 'paid',
        payment_method: paymentMethod,
        paid_amount: paidAmount,
        paid_at: new Date().toISOString(),
        chip_receipt_url: receiptUrl,
        updated_at: new Date().toISOString()
      })
      .eq('invoice_number', invoiceNo);

    if (error) {
      console.error('[CHIP Webhook DB Error]:', error.message);
    } else {
      console.info(`[CHIP Webhook Success]: Booking ${invoiceNo} marked as PAID via ${paymentMethod}.`);
    }
  } catch (err) {
    console.error('[CHIP Webhook DB Exception]:', err.message);
  }
}

/**
 * Generic status updater for non-paid events (cancelled/failed)
 */
async function updateBookingPaymentStatus(invoiceNo, status) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey || !invoiceNo) return;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase
      .from('ambulance_bookings')
      .update({
        payment_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('invoice_number', invoiceNo);
  } catch (err) {
    console.warn(`[CHIP Webhook] Failed to update status to ${status}:`, err.message);
  }
}

