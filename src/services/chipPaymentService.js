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
  if (!bookingData || !bookingData.invoiceNumber) {
    return {
      success: false,
      error: 'Maklumat invois tempahan tidak lengkap.'
    };
  }

  try {
    const response = await fetch('/api/payment/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bookingData,
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

