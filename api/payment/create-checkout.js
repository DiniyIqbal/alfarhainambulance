// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - CHIP PAYMENT CHECKOUT ENDPOINT
// Vercel Serverless Function: POST /api/payment/create-checkout
// Strictly server-side: Never exposes CHIP_SECRET_KEY or credentials to client.
//
// Security rules:
//   * The amount charged is ALWAYS quoted on the server (no client fallback)
//   * Simulation (mock) mode is only allowed on the local dev server
//   * Pay-after-approval: checkout is refused unless the booking exists AND HQ has
//     approved it (booking_status = 'approved'). A rejected or pending booking
//     therefore never takes money, so no refund flow is needed.
//   * An existing booking may only be (re)used for payment by its owner:
//       - signed-in patient  -> patient_user_id must match the JWT user
//       - guest              -> guest_access_token must match
//     and never once it has been paid
// =========================================================================

import { validateAndQuotePackageBooking } from '../../src/services/servicePackageManager.js';
import { applyCors, getRequestContext, getSupabaseAdmin, isDevServer } from '../_lib/security.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVOICE_RE = /^[A-Za-z0-9_-]{3,50}$/;

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Kaedah HTTP tidak dibenarkan. Sila gunakan POST.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    const { bookingData, paymentType = 'full' } = req.body || {};

    const invoiceNo = String(bookingData?.invoiceNumber || bookingData?.invoice_number || '').trim();
    if (!bookingData || !INVOICE_RE.test(invoiceNo)) {
      return res.status(400).json({
        success: false,
        error: 'Maklumat tempahan tidak lengkap (invoiceNumber diperlukan).',
        code: 'INVALID_BOOKING_DATA'
      });
    }

    // ---- Authoritative server-side pricing (no fallback to client totals) ----
    let quote;
    try {
      const pkgId = bookingData.packageId || bookingData.package_id || bookingData.tripType || bookingData.trip_type;
      quote = validateAndQuotePackageBooking({
        packageId: pkgId,
        distanceKm: Number(bookingData.distanceKm !== undefined ? bookingData.distanceKm : bookingData.distance_km) || 0
      });
    } catch (e) {
      console.error('[Create Checkout] Server quotation failed:', e.message);
      return res.status(400).json({
        success: false,
        error: 'Harga tempahan tidak dapat disahkan oleh pelayan. Sila cuba semula.',
        code: 'QUOTE_FAILED'
      });
    }

    const verifiedTotal = quote.grandTotal;
    const amountToCharge = paymentType === 'deposit' ? Math.min(100.00, verifiedTotal) : verifiedTotal;
    const amountInCents = Math.round(amountToCharge * 100);

    if (amountInCents < 100) {
      return res.status(400).json({
        success: false,
        error: 'Jumlah bayaran minimum adalah RM 1.00.',
        code: 'INVALID_AMOUNT'
      });
    }

    const secretKey = (process.env.CHIP_SECRET_KEY || '').trim();
    const brandId = (process.env.CHIP_BRAND_ID || '').trim();
    const chipApiUrl = (process.env.CHIP_API_URL || 'https://gate.chip-in.asia/api/v1').replace(/\/+$/, '');
    const chipConfigured = Boolean(secretKey && brandId &&
      secretKey !== 'masukkan_test_secret_key_anda_di_sini' &&
      brandId !== 'masukkan_test_brand_id_anda_di_sini');

    if (!chipConfigured && !isDevServer()) {
      console.error('[CHIP Checkout] CHIP credentials missing in a deployed environment.');
      return res.status(503).json({
        success: false,
        error: 'Pembayaran dalam talian tidak tersedia buat masa ini. Sila pilih bayaran tunai.',
        code: 'PAYMENT_GATEWAY_UNAVAILABLE'
      });
    }

    // ---- Ownership: who is paying for this invoice? ----
    const ctx = await getRequestContext(req);
    const userId = ctx.user && !ctx.isDevFallback ? ctx.user.id : null;
    const guestToken = String(bookingData.guestAccessToken || bookingData.guest_access_token || '');

    const admin = getSupabaseAdmin();
    if (!admin && !isDevServer()) {
      return res.status(503).json({ success: false, error: 'Pelayan belum dikonfigurasi.', code: 'SERVER_NOT_CONFIGURED' });
    }

    let existing = null;
    if (admin) {
      const { data, error } = await admin
        .from('ambulance_bookings')
        .select('id, payment_status, booking_status, patient_user_id, guest_access_token')
        .eq('invoice_number', invoiceNo)
        .maybeSingle();
      if (error) throw error;
      existing = data;

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Tempahan tidak dijumpai. Sila hantar tempahan dahulu.', code: 'BOOKING_NOT_FOUND' });
      }

      if (existing) {
        if (existing.payment_status === 'paid') {
          return res.status(409).json({ success: false, error: 'Tempahan ini telah dibayar.', code: 'ALREADY_PAID' });
        }
        const ownsAsUser = existing.patient_user_id && userId && existing.patient_user_id === userId;
        const ownsAsGuest = existing.guest_access_token && guestToken && existing.guest_access_token === guestToken;
        const isStaff = ctx.actor && ['hq_admin', 'branch_manager', 'dispatcher', 'hq_finance'].includes(ctx.access?.role);
        if (!ownsAsUser && !ownsAsGuest && !isStaff) {
          return res.status(403).json({ success: false, error: 'Anda tidak dibenarkan membuat bayaran bagi tempahan ini.', code: 'NOT_BOOKING_OWNER' });
        }
        if (existing.booking_status !== 'approved') {
          return res.status(409).json({ success: false, error: 'Bayaran dalam talian dibuka selepas tempahan diluluskan oleh HQ.', code: 'NOT_APPROVED_YET' });
        }
      }
    }

    // ---- Redirect / callback URLs ----
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
    const proto = req.headers['x-forwarded-proto'] || (String(host).includes('localhost') ? 'http' : 'https');
    const baseUrl = (process.env.APP_BASE_URL || `${proto}://${host}`).replace(/\/+$/, '');

    const rawEmail = (bookingData.patientEmail || bookingData.patient_email || '').trim();
    const patientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : 'pesakit@alfarhain.my';
    const patientName = String(bookingData.patientName || bookingData.patient_name || 'Pesakit AMC').trim().slice(0, 150);
    const patientPhone = String(bookingData.patientPhone || bookingData.patient_phone || '').trim().slice(0, 50);

    const paymentRecord = {
      admin,
      existing,
      bookingData,
      invoiceNo,
      userId,
      guestToken: UUID_RE.test(guestToken) ? guestToken : null,
      verifiedTotal,
      quote,
      amountDue: amountToCharge
    };

    // ---- Local dev simulation ----
    if (!chipConfigured) {
      console.warn('[CHIP Checkout] Simulation mode (local dev server only).');
      const mockPurchaseId = `mock_pur_${Date.now()}`;
      await recordPendingPayment({ ...paymentRecord, purchaseId: mockPurchaseId, method: 'fpx_simulation' });
      return res.status(200).json({
        success: true,
        isMock: true,
        purchaseId: mockPurchaseId,
        checkoutUrl: `${baseUrl}/?payment=success&invoice=${encodeURIComponent(invoiceNo)}&mock=true&amount=${amountToCharge}`,
        amountToCharge,
        message: 'Mod simulasi: Kunci CHIP belum dikonfigurasi penuh.'
      });
    }

    let webhookCallbackUrl = process.env.CHIP_WEBHOOK_URL;
    if (!webhookCallbackUrl) {
      webhookCallbackUrl = String(host).includes(':') || String(host).includes('localhost')
        ? 'https://alfarhainambulance.vercel.app/api/payment/webhook'
        : `${baseUrl}/api/payment/webhook`;
    }

    const purchaseTitle = paymentType === 'deposit'
      ? `Deposit Tempahan Ambulans AMC (${invoiceNo})`
      : `Tambang Ambulans AMC (${invoiceNo})`;

    const purchasePayload = {
      brand_id: brandId,
      client: { email: patientEmail, phone: patientPhone, full_name: patientName },
      purchase: {
        currency: 'MYR',
        products: [{ name: purchaseTitle, price: amountInCents, quantity: 1 }]
      },
      reference: invoiceNo,
      success_redirect: `${baseUrl}/?payment=success&invoice=${encodeURIComponent(invoiceNo)}`,
      failure_redirect: `${baseUrl}/?payment=failed&invoice=${encodeURIComponent(invoiceNo)}`,
      cancel_redirect: `${baseUrl}/?payment=cancelled&invoice=${encodeURIComponent(invoiceNo)}`,
      success_callback: webhookCallbackUrl
    };

    const chipResponse = await fetch(`${chipApiUrl}/purchases/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(purchasePayload)
    });
    const chipData = await chipResponse.json();

    if (!chipResponse.ok) {
      console.error('[CHIP API Error]:', chipData);
      return res.status(502).json({
        success: false,
        error: extractChipErrorMessage(chipData),
        code: 'CHIP_GATEWAY_ERROR'
      });
    }

    await recordPendingPayment({ ...paymentRecord, purchaseId: chipData.id, method: 'chip' });

    return res.status(200).json({
      success: true,
      purchaseId: chipData.id,
      checkoutUrl: chipData.checkout_url,
      amountToCharge
    });
  } catch (err) {
    console.error('[Create Checkout Exception]:', err);
    return res.status(500).json({
      success: false,
      error: 'Ralat pelayan dalaman semasa memproses bayaran.',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
}

/**
 * Binds the CHIP purchase to the booking and stores the server-quoted amount.
 * Uses the service-role client; never touches an already-paid booking.
 */
async function recordPendingPayment({
  admin, existing, bookingData, invoiceNo, userId, guestToken, verifiedTotal, quote, amountDue, purchaseId, method
}) {
  if (!admin) {
    console.warn('[CHIP Checkout] No service-role key: payment not persisted (local dev).');
    return;
  }

  const paymentFields = {
    payment_status: 'pending',
    payment_method: method,
    chip_purchase_id: purchaseId,
    amount_due: amountDue,
    total_fare: verifiedTotal,
    base_fare: quote.baseFare,
    extra_km_cost: quote.extraDistanceFee,
    package_id: quote.package?.id || null,
    updated_at: new Date().toISOString()
  };

  if (!existing) throw new Error('Tempahan tidak dijumpai.');

  const { error } = await admin
    .from('ambulance_bookings')
    .update(paymentFields)
    .eq('id', existing.id)
    .neq('payment_status', 'paid');
  if (error) throw new Error(`Gagal mengemas kini tempahan: ${error.message}`);
}

/**
 * Parses and extracts readable error message from CHIP Collect API response
 */
function extractChipErrorMessage(chipData) {
  if (!chipData) return 'Ralat tidak diketahui dari gerbang pembayaran CHIP.';
  if (typeof chipData.message === 'string') return chipData.message;
  if (typeof chipData.error === 'string') return chipData.error;
  if (typeof chipData === 'string') return chipData;

  for (const key of Object.keys(chipData)) {
    const val = chipData[key];
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0];
      if (typeof first === 'string') return `${key}: ${first}`;
      if (first && typeof first.message === 'string') return `${key}: ${first.message}`;
    } else if (typeof val === 'object' && val !== null) {
      for (const subKey of Object.keys(val)) {
        const subVal = val[subKey];
        if (Array.isArray(subVal) && subVal.length > 0) {
          const item = subVal[0];
          if (typeof item === 'string') return `${key}.${subKey}: ${item}`;
          if (item && typeof item.message === 'string') return `${key}.${subKey}: ${item.message}`;
        }
      }
    }
  }

  return 'Ralat semasa menjana sesi pembayaran CHIP.';
}
