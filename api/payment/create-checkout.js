// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - CHIP PAYMENT CHECKOUT ENDPOINT
// Vercel Serverless Function: POST /api/payment/create-checkout
// Strictly server-side: Never exposes CHIP_SECRET_KEY or credentials to client.
// =========================================================================

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS & Method check
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Kaedah HTTP tidak dibenarkan. Sila gunakan POST.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    const { bookingData, paymentType = 'full' } = req.body || {};

    if (!bookingData || !bookingData.invoiceNumber) {
      return res.status(400).json({
        success: false,
        error: 'Maklumat tempahan tidak lengkap (invoiceNumber diperlukan).',
        code: 'INVALID_BOOKING_DATA'
      });
    }

    // Determine amount to charge
    // Full payment vs fixed commitment deposit (e.g. RM 100)
    const rawTotal = parseFloat(bookingData.totalFare) || 250.00;
    const amountToCharge = paymentType === 'deposit'
      ? Math.min(100.00, rawTotal)
      : rawTotal;

    // CHIP expects amount in integer CENTS (e.g. RM 253.90 -> 25390)
    const amountInCents = Math.round(amountToCharge * 100);

    if (amountInCents < 100) { // minimum RM 1.00
      return res.status(400).json({
        success: false,
        error: 'Jumlah bayaran minimum adalah RM 1.00.',
        code: 'INVALID_AMOUNT'
      });
    }

    const secretKey = (process.env.CHIP_SECRET_KEY || '').trim();
    const brandId = (process.env.CHIP_BRAND_ID || '').trim();
    const chipApiUrl = (process.env.CHIP_API_URL || 'https://gate.chip-in.asia/api/v1').replace(/\/+$/, '');

    // Determine return base URL from request headers
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
    const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${proto}://${host}`;

    const invoiceNo = bookingData.invoiceNumber;
    const patientName = (bookingData.patientName || 'Pesakit AMC').trim();
    const patientPhone = (bookingData.patientPhone || '0139147606').trim();
    const patientEmail = (bookingData.patientEmail || 'pesakit@alfarhain.my').trim();

    // Safe Mock Mode fallback if CHIP credentials are placeholder / unconfigured in local dev
    const isMock = !secretKey ||
      secretKey === 'masukkan_test_secret_key_anda_di_sini' ||
      !brandId ||
      brandId === 'masukkan_test_brand_id_anda_di_sini';

    if (isMock) {
      console.warn('[CHIP Checkout] CHIP credentials not fully configured. Operating in simulation mode.');
      const mockPurchaseId = `mock_pur_${Date.now()}`;
      const mockCheckoutUrl = `${baseUrl}/?payment=success&invoice=${encodeURIComponent(invoiceNo)}&mock=true&amount=${amountToCharge}`;

      await recordPendingBookingToSupabase(bookingData, {
        chipPurchaseId: mockPurchaseId,
        paymentStatus: 'pending',
        paymentMethod: 'fpx_simulation',
        paidAmount: amountToCharge
      });

      return res.status(200).json({
        success: true,
        isMock: true,
        purchaseId: mockPurchaseId,
        checkoutUrl: mockCheckoutUrl,
        message: 'Mod simulasi: Kunci CHIP belum dikonfigurasi penuh.'
      });
    }

    // Construct CHIP Purchase payload
    const purchaseTitle = paymentType === 'deposit'
      ? `Deposit Tempahan Ambulans AMC (${invoiceNo})`
      : `Tambang Ambulans AMC (${invoiceNo})`;

    const purchasePayload = {
      brand_id: brandId,
      client: {
        email: patientEmail,
        phone: patientPhone,
        full_name: patientName
      },
      purchase: {
        currency: 'MYR',
        products: [
          {
            name: purchaseTitle,
            price: amountInCents,
            quantity: 1
          }
        ]
      },
      reference: invoiceNo,
      success_redirect: `${baseUrl}/?payment=success&invoice=${encodeURIComponent(invoiceNo)}`,
      failure_redirect: `${baseUrl}/?payment=failed&invoice=${encodeURIComponent(invoiceNo)}`,
      cancel_redirect: `${baseUrl}/?payment=cancelled&invoice=${encodeURIComponent(invoiceNo)}`,
      success_callback: `${baseUrl}/api/payment/webhook`
    };

    // Call CHIP Collect REST API
    const chipResponse = await fetch(`${chipApiUrl}/purchases/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(purchasePayload)
    });

    const chipData = await chipResponse.json();

    if (!chipResponse.ok) {
      console.error('[CHIP API Error]:', chipData);
      return res.status(chipResponse.status).json({
        success: false,
        error: chipData?.message || chipData?.error || 'Ralat semasa menjana sesi pembayaran CHIP.',
        details: chipData,
        code: 'CHIP_GATEWAY_ERROR'
      });
    }

    const purchaseId = chipData.id;
    const checkoutUrl = chipData.checkout_url;

    // Record pending transaction in Supabase
    await recordPendingBookingToSupabase(bookingData, {
      chipPurchaseId: purchaseId,
      paymentStatus: 'pending',
      paymentMethod: 'chip',
      paidAmount: amountToCharge
    });

    return res.status(200).json({
      success: true,
      purchaseId,
      checkoutUrl,
      amountToCharge
    });

  } catch (err) {
    console.error('[Create Checkout Exception]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Ralat pelayan dalaman semasa memproses bayaran.',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
}

/**
 * Helper to record or update booking in Supabase with payment metadata
 */
async function recordPendingBookingToSupabase(bookingData, paymentMeta) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[CHIP Supabase] Supabase credentials not found on server. Skipping server DB update.');
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const invoiceNo = bookingData.invoiceNumber;

    // Upsert booking record
    const { error } = await supabase
      .from('ambulance_bookings')
      .upsert({
        invoice_number: invoiceNo,
        hub_id: bookingData.hubId || 'kok_lanas',
        hub_name: bookingData.hubName || 'HQ Kok Lanas',
        origin_name: bookingData.originName || 'Pangkalan',
        destination_name: bookingData.destinationName || 'Hospital',
        distance_km: bookingData.distanceKm || 26.3,
        trip_type: bookingData.tripType || 'Kecemasan Sehala',
        base_fare: bookingData.baseFare || 250.00,
        extra_km_cost: bookingData.extraKmCost || 0.00,
        assistance_package: bookingData.assistancePackage || 'Pemandu Sahaja',
        assistance_cost: bookingData.assistanceCost || 0.00,
        equipment_items: bookingData.equipmentItems || '',
        equipment_cost: bookingData.equipmentCost || 0.00,
        misc_fee: bookingData.miscFee || 0.00,
        total_fare: bookingData.totalFare || 250.00,
        patient_name: bookingData.patientName || '',
        patient_phone: bookingData.patientPhone || '',
        plate_number: bookingData.plateNumber || 'VPQ 9147',
        driver_name: bookingData.driverName || 'Pemandu Bertugas',
        status: 'Dispatched',
        payment_status: paymentMeta.paymentStatus || 'pending',
        payment_method: paymentMeta.paymentMethod || 'chip',
        chip_purchase_id: paymentMeta.chipPurchaseId || null,
        paid_amount: paymentMeta.paidAmount || null
      }, { onConflict: 'invoice_number' });

    if (error) {
      console.warn('[CHIP Supabase Upsert Warning]:', error.message);
    }
  } catch (dbErr) {
    console.warn('[CHIP Supabase Exception]:', dbErr.message);
  }
}

