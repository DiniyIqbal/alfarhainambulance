// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - CHIP PAYMENT GATEWAY SERVICE
// Frontend Client for Checkout Initiation, Redirection & Status Verification
// Supports FPX, DuitNow QR, Cards & Android TWA / Bubblewrap WebViews.
// =========================================================================

/**
 * Initiates an online payment session with CHIP Payment Gateway.
 * 
 * @param {Object} bookingData - Complete ambulance booking payload
 * @param {string} [paymentType='full'] - 'full' | 'deposit'
 * @returns {Promise<{ success: boolean, checkoutUrl?: string, purchaseId?: string, isMock?: boolean, error?: string }>}
 */
export async function initiateChipPayment(bookingData, paymentType = 'full') {
  const invoiceNo = bookingData?.invoiceNumber || bookingData?.invoice_number;
  if (!bookingData || !invoiceNo) {
    return {
      success: false,
      error: 'Maklumat invois tempahan tidak lengkap.'
    };
  }

  const normalizedBooking = {
    ...bookingData,
    invoiceNumber: invoiceNo,
    invoice_number: invoiceNo,
    totalFare: bookingData.totalFare !== undefined ? bookingData.totalFare : (bookingData.total_fare || 250.00),
    total_fare: bookingData.total_fare !== undefined ? bookingData.total_fare : (bookingData.totalFare || 250.00),
    patientName: (bookingData.patientName || bookingData.patient_name || 'Pesakit AMC').trim(),
    patient_name: (bookingData.patient_name || bookingData.patientName || 'Pesakit AMC').trim(),
    patientPhone: (bookingData.patientPhone || bookingData.patient_phone || '0139147606').trim(),
    patient_phone: (bookingData.patient_phone || bookingData.patientPhone || '0139147606').trim(),
    patientEmail: (bookingData.patientEmail || bookingData.patient_email || 'pesakit@alfarhain.my').trim(),
    patient_email: (bookingData.patient_email || bookingData.patientEmail || 'pesakit@alfarhain.my').trim(),
    distanceKm: bookingData.distanceKm !== undefined ? bookingData.distanceKm : (bookingData.distance_km || 25.0),
    distance_km: bookingData.distance_km !== undefined ? bookingData.distance_km : (bookingData.distanceKm || 25.0)
  };

  try {
    const response = await fetch('/api/payment/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bookingData: normalizedBooking,
        paymentType
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Ralat semasa menjana sesi pembayaran CHIP.');
    }

    return {
      success: true,
      checkoutUrl: data.checkoutUrl,
      purchaseId: data.purchaseId,
      isMock: Boolean(data.isMock),
      amountToCharge: data.amountToCharge
    };

  } catch (err) {
    console.error('[ChipPaymentService] Initiate payment error:', err);
    return {
      success: false,
      error: err.message || 'Tidak dapat menghubungi gerbang pembayaran CHIP.'
    };
  }
}

/**
 * Checks URL query parameters to see if user just returned from CHIP checkout.
 * 
 * @returns {{ status: 'success' | 'failed' | 'cancelled' | null, invoice?: string, isMock?: boolean }}
 */
export function parsePaymentReturnStatus() {
  if (typeof window === 'undefined') return { status: null };

  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  const invoice = params.get('invoice');
  const isMock = params.get('mock') === 'true';

  if (!payment) return { status: null };

  return {
    status: payment, // 'success' | 'failed' | 'cancelled'
    invoice: invoice || '',
    isMock
  };
}

/**
 * Clean URL search parameters after processing payment return so refreshing
 * does not trigger repetitive alerts.
 */
export function clearPaymentQueryParams() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;

  const url = new URL(window.location.href);
  url.searchParams.delete('payment');
  url.searchParams.delete('invoice');
  url.searchParams.delete('mock');
  url.searchParams.delete('amount');
  window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
}

