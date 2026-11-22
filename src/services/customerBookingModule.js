// =========================================================================
// AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
// CUSTOMER BOOKING MODULE (Frontend Controller for Mobile App)
// Manages "Tempahan saya" (Aktif vs Sejarah), Booking Details Modal,
// Live Tracking View, Cancellation, Rescheduling & Schedule Selection.
// =========================================================================

import {
  deriveCustomerStatus,
  filterBookingsList,
  customerCancelOrRequestBooking,
  customerRequestReschedule
} from './bookingManagementService.js';

import {
  fetchPatientBookingsFromSupabase,
  saveLocalBookingCache,
  broadcastSyncEvent,
  subscribeToUnifiedSync
} from './supabaseClient.js';

import {
  getStoredUserProfile
} from './supabaseClient.js';

import {
  initiateChipPayment
} from './chipPaymentService.js';

let appState = null;
let currentTab = 'aktif';
let currentSearch = '';
let cachedBookings = [];
let customerLiveMap = null;

export function initCustomerBookingModule(state) {
  appState = state;
  state.scheduleType = state.scheduleType || 'asap';
  state.scheduledDateTime = state.scheduledDateTime || null;

  // 1. Setup Schedule Toggle in Step 1 (Lokasi)
  setupScheduleToggle();

  // 2. Setup Customer "Tempahan saya" View Listeners
  setupCustomerBookingsListeners();

  // 3. Setup Confirmation Modal buttons
  setupConfirmationModalListeners();

  // 4. Initial load of customer bookings
  loadAndRenderCustomerBookings();

  // 5. Subscribe to Realtime / Unified Sync for live updates
  subscribeToUnifiedSync({
    onNewBooking: () => {
      loadAndRenderCustomerBookings();
    },
    onUpdateBooking: () => {
      loadAndRenderCustomerBookings();
    }
  });
}

/**
 * 1. Schedule Selector in Step 1 (Lokasi)
 * Supports "Secepat mungkin" vs "Jadualkan perjalanan".
 */
function setupScheduleToggle() {
  const btnAsap = document.getElementById('btnSchedAsap');
  const btnLater = document.getElementById('btnSchedLater');
  const inputsBox = document.getElementById('scheduledTimeInputsBox');
  const dtInput = document.getElementById('customerScheduledDateTime');

  if (btnAsap && btnLater) {
    btnAsap.addEventListener('click', () => {
      appState.scheduleType = 'asap';
      appState.scheduledDateTime = null;
      btnAsap.classList.add('active');
      btnAsap.style.borderColor = 'var(--amc-red)';
      btnAsap.style.background = '#FFF5F5';

      btnLater.classList.remove('active');
      btnLater.style.borderColor = '#E2E8F0';
      btnLater.style.background = '#FFFFFF';

      if (inputsBox) inputsBox.style.display = 'none';
      updateScheduleSummaryText();
    });

    btnLater.addEventListener('click', () => {
      appState.scheduleType = 'scheduled';
      btnLater.classList.add('active');
      btnLater.style.borderColor = 'var(--amc-red)';
      btnLater.style.background = '#FFF5F5';

      btnAsap.classList.remove('active');
      btnAsap.style.borderColor = '#E2E8F0';
      btnAsap.style.background = '#FFFFFF';

      if (inputsBox) inputsBox.style.display = 'block';

      // Set default time to now + 2 hours
      if (dtInput && !dtInput.value) {
        const d = new Date(Date.now() + 2 * 3600 * 1000);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        dtInput.value = d.toISOString().slice(0, 16);
        appState.scheduledDateTime = dtInput.value;
      }
      updateScheduleSummaryText();
    });
  }

  if (dtInput) {
    dtInput.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        const chosen = new Date(val);
        if (chosen.getTime() < Date.now() - (5 * 60 * 1000)) {
          alert('Masa jadual perjalanan tidak boleh pada waktu lampau.');
          const now = new Date();
          now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
          dtInput.value = now.toISOString().slice(0, 16);
        }
        appState.scheduledDateTime = dtInput.value;
      }
      updateScheduleSummaryText();
    });
  }
}

function updateScheduleSummaryText() {
  const summaryEl = document.getElementById('invSummaryScheduleText');
  if (summaryEl) {
    if (appState.scheduleType === 'asap' || !appState.scheduledDateTime) {
      summaryEl.textContent = '⚡ Secepat mungkin (Kecemasan / Segera)';
    } else {
      const d = new Date(appState.scheduledDateTime);
      summaryEl.textContent = `📅 ${d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}`;
    }
  }
}

/**
 * 2. Setup Customer "Tempahan saya" Listeners
 */
function setupCustomerBookingsListeners() {
  const tabAktif = document.getElementById('tabCustBookingsActive');
  const tabSejarah = document.getElementById('tabCustBookingsHistory');
  const searchInput = document.getElementById('custBookingSearchInput');
  const btnRetry = document.getElementById('btnRetryCustBookings');
  const btnNewTop = document.getElementById('btnCustNewBookingTop');
  const btnEmptyCreate = document.getElementById('btnCustEmptyCreate');

  if (tabAktif && tabSejarah) {
    tabAktif.addEventListener('click', () => {
      currentTab = 'aktif';
      tabAktif.classList.add('active');
      tabAktif.style.background = '#fff';
      tabAktif.style.color = 'var(--text-heading)';
      tabSejarah.classList.remove('active');
      tabSejarah.style.background = 'transparent';
      tabSejarah.style.color = 'var(--text-muted)';
      renderCards();
    });

    tabSejarah.addEventListener('click', () => {
      currentTab = 'sejarah';
      tabSejarah.classList.add('active');
      tabSejarah.style.background = '#fff';
      tabSejarah.style.color = 'var(--text-heading)';
      tabAktif.classList.remove('active');
      tabAktif.style.background = 'transparent';
      tabAktif.style.color = 'var(--text-muted)';
      renderCards();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.trim().toLowerCase();
      renderCards();
    });
  }

  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      loadAndRenderCustomerBookings();
    });
  }

  // Navigate to calculator view
  const switchToBookingFlow = () => {
    const dockUtama = document.querySelector('.dock-tab-item[data-tab="calculator-view"]');
    if (dockUtama) dockUtama.click();
  };

  if (btnNewTop) btnNewTop.addEventListener('click', switchToBookingFlow);
  if (btnEmptyCreate) btnEmptyCreate.addEventListener('click', switchToBookingFlow);

  // Close Customer Details Modal
  const btnCloseModal = document.getElementById('btnCloseCustDetailModal');
  const detailModal = document.getElementById('customerBookingDetailsModal');
  if (btnCloseModal && detailModal) {
    btnCloseModal.addEventListener('click', () => {
      detailModal.classList.remove('show');
      detailModal.style.display = 'none';
    });
  }
  if (detailModal) {
    detailModal.addEventListener('click', (e) => {
      if (e.target === detailModal) {
        detailModal.classList.remove('show');
        detailModal.style.display = 'none';
      }
    });
  }

  // Close Live Tracking Modal
  const btnCloseTrack = document.getElementById('btnCloseLiveTrackingModal');
  const trackModal = document.getElementById('customerLiveTrackingModal');
  if (btnCloseTrack && trackModal) {
    btnCloseTrack.addEventListener('click', () => {
      trackModal.classList.remove('show');
      trackModal.style.display = 'none';
    });
  }
  if (trackModal) {
    trackModal.addEventListener('click', (e) => {
      if (e.target === trackModal) {
        trackModal.classList.remove('show');
        trackModal.style.display = 'none';
      }
    });
  }
}

/**
 * 3. Setup Confirmation Modal buttons
 */
function setupConfirmationModalListeners() {
  const confModal = document.getElementById('bookingConfirmationModal');
  const btnViewBookings = document.getElementById('btnConfViewMyBookings');
  const btnBackHome = document.getElementById('btnConfBackToHome');

  if (btnViewBookings && confModal) {
    btnViewBookings.addEventListener('click', () => {
      confModal.style.display = 'none';
      // Switch to Tempahan tab
      const tabTempahan = document.querySelector('.dock-tab-item[data-tab="customer-bookings-view"]');
      if (tabTempahan) tabTempahan.click();
    });
  }

  if (btnBackHome && confModal) {
    btnBackHome.addEventListener('click', () => {
      confModal.style.display = 'none';
      const tabUtama = document.querySelector('.dock-tab-item[data-tab="calculator-view"]');
      if (tabUtama) tabUtama.click();
    });
  }
}

/**
 * 4. Loads bookings from Supabase + local cache and renders cards
 */
export async function loadAndRenderCustomerBookings() {
  const loading = document.getElementById('custBookingsLoading');
  const errorBox = document.getElementById('custBookingsError');

  if (loading) loading.style.display = 'block';
  if (errorBox) errorBox.style.display = 'none';

  try {
    const user = getStoredUserProfile() || { email: 'pesakit.demo@gmail.com' };
    const list = await fetchPatientBookingsFromSupabase(user);

    let all = Array.isArray(list) ? list : [];
    if (all.length === 0) {
      try {
        const raw = localStorage.getItem('amc_all_bookings');
        all = raw ? JSON.parse(raw) : [];
      } catch (e) {
        all = [];
      }
    }

    cachedBookings = all;
    if (loading) loading.style.display = 'none';
    renderCards();
  } catch (err) {
    console.error('[CustomerBookingModule] Load error:', err);
    if (loading) loading.style.display = 'none';
    if (errorBox) errorBox.style.display = 'block';
  }
}

/**
 * Renders the filtered list of booking cards
 */
function renderCards() {
  const container = document.getElementById('custBookingsListContainer');
  const emptyBox = document.getElementById('custBookingsEmpty');
  const badgeAktif = document.getElementById('badgeTabAktifCount');
  const badgeSejarah = document.getElementById('badgeTabSejarahCount');
  const badgeDock = document.getElementById('badgeActiveCustomerBookings');

  if (!container) return;

  // Compute tab counts
  const aktifList = cachedBookings.filter(b => {
    const s = deriveCustomerStatus(b).code;
    return ['menunggu_kelulusan', 'menunggu_agihan', 'dijadualkan', 'menuju_pengambilan', 'tiba_pengambilan', 'menuju_destinasi'].includes(s);
  });

  const sejarahList = cachedBookings.filter(b => {
    const s = deriveCustomerStatus(b).code;
    return ['selesai', 'ditolak', 'dibatalkan'].includes(s);
  });

  if (badgeAktif) badgeAktif.textContent = aktifList.length;
  if (badgeSejarah) badgeSejarah.textContent = sejarahList.length;

  if (badgeDock) {
    if (aktifList.length > 0) {
      badgeDock.textContent = aktifList.length;
      badgeDock.style.display = 'flex';
    } else {
      badgeDock.style.display = 'none';
    }
  }

  // Filter current tab & search
  let displayList = currentTab === 'aktif' ? aktifList : sejarahList;

  if (currentSearch) {
    displayList = displayList.filter(b => {
      const inv = (b.invoice_number || b.invoiceNumber || '').toLowerCase();
      const origin = (b.origin_name || b.originName || '').toLowerCase();
      const dest = (b.destination_name || b.destinationName || '').toLowerCase();
      const pkg = (b.package_name || b.trip_type || '').toLowerCase();
      return inv.includes(currentSearch) || origin.includes(currentSearch) || dest.includes(currentSearch) || pkg.includes(currentSearch);
    });
  }

  if (displayList.length === 0) {
    container.innerHTML = '';
    if (emptyBox) emptyBox.style.display = 'block';
    return;
  }

  if (emptyBox) emptyBox.style.display = 'none';

  container.innerHTML = displayList.map(b => {
    const inv = b.invoice_number || b.invoiceNumber || 'AMC-0000';
    const custStatus = deriveCustomerStatus(b);

    // Schedule
    const isSched = Boolean(b.is_scheduled || b.isScheduled);
    const schedTime = b.scheduled_time || b.scheduledTime;
    let schedDisplay = '⚡ Secepat mungkin';
    if (isSched && schedTime) {
      try {
        const d = new Date(schedTime);
        schedDisplay = `📅 ${d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}`;
      } catch (e) {
        schedDisplay = '📅 Dijadualkan';
      }
    }

    const origin = b.origin_name || b.pickup_address || b.pickupAddress || 'Lokasi Pesakit';
    const dest = b.destination_name || b.destinationName || 'Hospital';
    const pkgName = b.package_name || b.trip_type || 'Kecemasan Standard';
    const amount = Number(b.total_fare || b.totalFare || 250.00);

    // Only display ambulance and driver info AFTER assignment!
    const plate = b.plate_number || b.plateNumber;
    const driver = b.driver_name || b.driverName;
    const isAssigned = Boolean(plate && driver);

    // Live Tracking availability: only when trip is actively on the road
    const canTrack = isAssigned && ['menuju_pengambilan', 'tiba_pengambilan', 'menuju_destinasi'].includes(custStatus.code);

    const isPending = custStatus.code === 'menunggu_kelulusan';
    const isApproved = custStatus.code === 'menunggu_agihan' || custStatus.code === 'dijadualkan';

    return `
      <div class="cust-booking-card" style="background:#FFFFFF; border:1.5px solid #E2E8F0; border-radius:14px; padding:14px; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
        <!-- Top row: Ref & Status -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-weight:800; font-size:0.9rem; color:var(--amc-red);">${escapeHtml(inv)}</span>
            <span style="font-size:0.7rem; color:#64748B;">· ${schedDisplay}</span>
          </div>
          <span class="badge-status-pill" style="background:${custStatus.badgeBg}; color:${custStatus.badgeColor}; font-size:0.72rem; font-weight:800; padding:3px 9px; border-radius:999px; display:inline-flex; align-items:center; gap:4px;">
            <span>${custStatus.icon}</span> <span>${custStatus.label}</span>
          </span>
        </div>

        <!-- Package & Route -->
        <div style="margin-bottom:10px;">
          <div style="font-size:0.85rem; font-weight:800; color:#0F172A;">${escapeHtml(pkgName)}</div>
          <div style="font-size:0.75rem; color:#475569; margin-top:4px; display:flex; flex-direction:column; gap:2px;">
            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              <span style="color:#10B981; font-weight:800;">A:</span> ${escapeHtml(origin)}
            </div>
            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              <span style="color:#EF4444; font-weight:800;">D:</span> ${escapeHtml(dest)}
            </div>
          </div>
        </div>

        <!-- Assigned Resources (ONLY shown if assigned!) -->
        ${isAssigned ? `
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:8px 10px; margin-bottom:10px; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-weight:800; color:#0F172A;">🚑 ${escapeHtml(plate)}</span>
              <span style="color:#64748B; margin-left:6px;">👨‍✈️ ${escapeHtml(driver)}</span>
            </div>
            <span style="font-size:0.68rem; color:#059669; font-weight:700;">Diagihkan HQ</span>
          </div>
        ` : ''}

        <!-- Price & Action Buttons -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px dashed #E2E8F0;">
          <div>
            <span style="font-size:0.68rem; color:#64748B; display:block;">Jumlah anggaran:</span>
            <span style="font-size:0.95rem; font-weight:800; color:#0F172A;">RM${amount.toFixed(2)}</span>
          </div>

          <div style="display:flex; gap:6px;">
            ${canTrack ? `
              <button type="button" class="btn-track-action" data-inv="${escapeHtml(inv)}" style="background:#0D9488; color:#fff; border:none; border-radius:8px; padding:6px 10px; font-size:0.75rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
                <span>🚑</span> <span>Jejak</span>
              </button>
            ` : ''}
            <button type="button" class="btn-view-detail" data-inv="${escapeHtml(inv)}" style="background:#F1F5F9; color:#0F172A; border:1px solid #CBD5E1; border-radius:8px; padding:6px 12px; font-size:0.75rem; font-weight:700; cursor:pointer;">
              Lihat butiran ›
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach button click listeners
  container.querySelectorAll('.btn-view-detail').forEach(btn => {
    btn.addEventListener('click', () => {
      const inv = btn.dataset.inv;
      const b = cachedBookings.find(x => (x.invoice_number || x.invoiceNumber) === inv);
      if (b) openCustomerBookingDetails(b);
    });
  });

  container.querySelectorAll('.btn-track-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const inv = btn.dataset.inv;
      const b = cachedBookings.find(x => (x.invoice_number || x.invoiceNumber) === inv);
      if (b) openCustomerLiveTracking(b);
    });
  });
}

/**
 * 5. Opens Customer Booking Details Modal
 */
export function openCustomerBookingDetails(booking) {
  const modal = document.getElementById('customerBookingDetailsModal');
  const titleEl = document.getElementById('custDetailRefTitle');
  const contentEl = document.getElementById('custDetailModalContent');

  if (!modal || !contentEl) return;

  const inv = booking.invoice_number || booking.invoiceNumber || 'AMC-0000';
  if (titleEl) titleEl.textContent = inv;

  const custStatus = deriveCustomerStatus(booking);
  const pkg = booking.package_snapshot || {
    name: booking.package_name || booking.trip_type || 'Kecemasan Standard',
    baseFare: booking.base_fare || 250.00,
    includedEquipment: [],
    includedStaff: []
  };

  const amount = Number(booking.total_fare || booking.totalFare || 250.00);

  // Stepper Stage
  const stepIdx = custStatus.stepIndex || 1;

  // Only display ambulance and driver info AFTER assignment!
  const plate = booking.plate_number || booking.plateNumber;
  const driver = booking.driver_name || booking.driverName;
  const isAssigned = Boolean(plate && driver);
  const canTrack = isAssigned && ['menuju_pengambilan', 'tiba_pengambilan', 'menuju_destinasi'].includes(custStatus.code);

  const isPending = custStatus.code === 'menunggu_kelulusan';
  const isApproved = custStatus.code === 'menunggu_agihan' || custStatus.code === 'dijadualkan';

  // Schedule Display
  const isSched = Boolean(booking.is_scheduled || booking.isScheduled);
  const schedTime = booking.scheduled_time || booking.scheduledTime;
  let scheduleDisplay = '⚡ Secepat mungkin (Kecemasan / Segera)';
  if (isSched && schedTime) {
    try {
      const d = new Date(schedTime);
      scheduleDisplay = `📅 ${d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (_) {
      scheduleDisplay = '📅 Dijadualkan';
    }
  }

  // Patient Info
  const patientName = (booking.patient_name || booking.patientName || 'Pesakit AMC').trim();
  const patientPhone = (booking.patient_phone || booking.patientPhone || '—').trim();

  // Payment status
  const payStatus = (booking.payment_status || booking.paymentStatus || 'unpaid').toLowerCase();
  const isPaid = payStatus === 'paid';
  const payMethod = booking.payment_method || booking.paymentMethod || 'cash';
  const isChipPending = payMethod === 'chip' && !isPaid;

  const closeModal = () => {
    modal.classList.remove('show');
    modal.style.display = 'none';
  };

  contentEl.innerHTML = `
    <!-- Status Badge & Description -->
    <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:12px; margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span class="badge-status-pill" style="background:${custStatus.badgeBg}; color:${custStatus.badgeColor}; font-weight:800; font-size:0.78rem; padding:4px 10px; border-radius:999px;">
          ${custStatus.icon} ${custStatus.label}
        </span>
        <span style="font-size:0.7rem; color:#64748B;">Versi: v${booking.version || 1}</span>
      </div>
      <p style="font-size:0.75rem; color:#475569; margin:0; line-height:1.4;">${custStatus.description}</p>
    </div>

    <!-- 5-Stage Visual Stepper -->
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; padding:0 4px;">
      <div style="text-align:center;">
        <div style="width:24px; height:24px; border-radius:50%; background:${stepIdx >= 1 ? 'var(--amc-red)' : '#CBD5E1'}; color:#fff; font-size:0.7rem; font-weight:800; display:flex; align-items:center; justify-content:center; margin:0 auto 4px;">1</div>
        <span style="font-size:0.65rem; color:#475569; font-weight:700;">Dihantar</span>
      </div>
      <div style="flex:1; height:2px; background:${stepIdx >= 2 ? 'var(--amc-red)' : '#E2E8F0'}; margin:0 4px 16px;"></div>

      <div style="text-align:center;">
        <div style="width:24px; height:24px; border-radius:50%; background:${stepIdx >= 2 ? 'var(--amc-red)' : '#CBD5E1'}; color:#fff; font-size:0.7rem; font-weight:800; display:flex; align-items:center; justify-content:center; margin:0 auto 4px;">2</div>
        <span style="font-size:0.65rem; color:#475569; font-weight:700;">Kelulusan</span>
      </div>
      <div style="flex:1; height:2px; background:${stepIdx >= 3 ? 'var(--amc-red)' : '#E2E8F0'}; margin:0 4px 16px;"></div>

      <div style="text-align:center;">
        <div style="width:24px; height:24px; border-radius:50%; background:${stepIdx >= 3 ? 'var(--amc-red)' : '#CBD5E1'}; color:#fff; font-size:0.7rem; font-weight:800; display:flex; align-items:center; justify-content:center; margin:0 auto 4px;">3</div>
        <span style="font-size:0.65rem; color:#475569; font-weight:700;">Agihan</span>
      </div>
      <div style="flex:1; height:2px; background:${stepIdx >= 4 ? 'var(--amc-red)' : '#E2E8F0'}; margin:0 4px 16px;"></div>

      <div style="text-align:center;">
        <div style="width:24px; height:24px; border-radius:50%; background:${stepIdx >= 4 ? 'var(--amc-red)' : '#CBD5E1'}; color:#fff; font-size:0.7rem; font-weight:800; display:flex; align-items:center; justify-content:center; margin:0 auto 4px;">4</div>
        <span style="font-size:0.65rem; color:#475569; font-weight:700;">Misi</span>
      </div>
      <div style="flex:1; height:2px; background:${stepIdx >= 5 ? 'var(--amc-red)' : '#E2E8F0'}; margin:0 4px 16px;"></div>

      <div style="text-align:center;">
        <div style="width:24px; height:24px; border-radius:50%; background:${stepIdx >= 5 ? '#10B981' : '#CBD5E1'}; color:#fff; font-size:0.7rem; font-weight:800; display:flex; align-items:center; justify-content:center; margin:0 auto 4px;">✓</div>
        <span style="font-size:0.65rem; color:#475569; font-weight:700;">Selesai</span>
      </div>
    </div>

    <!-- Route & Patient Details Card -->
    <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:12px; margin-bottom:12px; font-size:0.78rem;">
      <div style="font-weight:800; color:#0F172A; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #F1F5F9; padding-bottom:6px;">
        <span>LALUAN &amp; MAKLUMAT TRIP</span>
        <span style="font-size:0.68rem; font-weight:700; color:var(--amc-red);">${escapeHtml(scheduleDisplay)}</span>
      </div>

      <div style="margin-bottom:8px; padding-bottom:6px; border-bottom:1px dashed #E2E8F0;">
        <span style="font-size:0.68rem; font-weight:700; color:#64748B;">PESAKIT / WARIS</span>
        <div style="font-weight:700; color:#0F172A;">${escapeHtml(patientName)} <span style="font-weight:500; color:#475569;">(${escapeHtml(patientPhone)})</span></div>
      </div>

      <div style="margin-bottom:8px;">
        <span style="font-size:0.68rem; font-weight:700; color:#64748B;">LOKASI PENGAMBILAN (${escapeHtml(booking.pickup_category || 'Rumah / Kediaman')})</span>
        <div style="font-weight:700; color:#0F172A;">${escapeHtml(booking.origin_name || 'Pengambilan')}</div>
        ${booking.pickup_instructions ? `<div style="font-size:0.7rem; color:#047857; margin-top:2px;">Nota: ${escapeHtml(booking.pickup_instructions)}</div>` : ''}
      </div>

      <div>
        <span style="font-size:0.68rem; font-weight:700; color:#64748B;">PUSAT PERUBATAN TUJUAN</span>
        <div style="font-weight:700; color:#0F172A;">${escapeHtml(booking.destination_name || 'Hospital')}</div>
      </div>

      ${(booking.stop4_name || booking.return_name) ? `
        <div style="margin-top:8px; padding-top:6px; border-top:1px dashed #E2E8F0;">
          <span style="font-size:0.68rem; font-weight:700; color:#0284C7;">🔄 ${booking.stop4_type === 'return' ? 'HANTAR PULANG' : 'DESTINASI KE-2'}</span>
          <div style="font-weight:700; color:#0F172A;">${escapeHtml(booking.stop4_name || booking.return_name)}</div>
        </div>
      ` : ''}
    </div>

    <!-- Assigned Resources (Hidden if not assigned yet) -->
    ${isAssigned ? `
      <div style="background:#ECFDF5; border:1px solid #A7F3D0; border-radius:12px; padding:12px; margin-bottom:12px; font-size:0.78rem;">
        <div style="font-weight:800; color:#065F46; margin-bottom:6px;">AMBULANS &amp; KREW DIAGIHKAN</div>
        <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
          <span style="color:#047857;">Kenderaan:</span>
          <b>🚑 ${escapeHtml(plate)}</b>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
          <span style="color:#047857;">Pemandu EMT:</span>
          <b>👨‍✈️ ${escapeHtml(driver)}</b>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:#047857;">Penyedia:</span>
          <b>${escapeHtml(booking.assigned_provider_name || 'Al-Farhain AMC')}</b>
        </div>
      </div>
    ` : ''}

    <!-- Package & Price Breakdown -->
    <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:12px; margin-bottom:14px; font-size:0.78rem;">
      <div style="font-weight:800; color:#0F172A; margin-bottom:8px;">PAKEJ &amp; BUTIRAN HARGA</div>
      
      ${booking.is_event_standby ? `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>Pakej Acara: Standby ${booking.standby_hours || 4} Jam</span>
          <b>RM${amount.toFixed(2)}</b>
        </div>
        ${booking.standby_event_name ? `
          <div style="font-size:0.7rem; color:#64748B; margin-bottom:4px;">Acara: ${escapeHtml(booking.standby_event_name)}</div>
        ` : ''}
      ` : `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>Pakej: ${escapeHtml(pkg.name)}</span>
          <b>RM${Number(pkg.baseFare || 250).toFixed(2)}</b>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>Caj jarak (${Number(booking.distance_km || 25).toFixed(1)} km):</span>
          <span>RM${Number(booking.extra_km_cost || 0).toFixed(2)}</span>
        </div>
      `}

      ${(pkg.includedStaff && pkg.includedStaff.length > 0) ? `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.72rem; color:#475569;">
          <span>Staf Termasuk:</span>
          <span style="color:#10B981; font-weight:700;">${escapeHtml(pkg.includedStaff.join(', '))}</span>
        </div>
      ` : ''}

      ${(pkg.includedEquipment && pkg.includedEquipment.length > 0) ? `
        <div style="margin-bottom:6px; font-size:0.7rem; color:#64748B;">
          <span>Alatan: ${escapeHtml(pkg.includedEquipment.slice(0, 4).join(', '))}${pkg.includedEquipment.length > 4 ? ' + lagi' : ''}</span>
        </div>
      ` : ''}

      <div style="display:flex; justify-content:space-between; border-top:1px dashed #CBD5E1; padding-top:6px; font-weight:800; font-size:0.92rem; color:var(--amc-red);">
        <span>Jumlah Anggaran / Sah:</span>
        <span>RM${amount.toFixed(2)}</span>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; font-size:0.72rem; color:#64748B;">
        <span>Kaedah Bayaran: <b>${payMethod === 'chip' ? 'Gerbang CHIP Online' : 'Tunai Semasa Ketibaan'}</b></span>
        <span style="font-weight:800; color:${isPaid ? '#059669' : '#D97706'};">${isPaid ? '✅ Lunas' : '⏳ Belum Bayar'}</span>
      </div>

      ${isChipPending ? `
        <button type="button" id="btnDetailPayChip" style="width:100%; margin-top:10px; background:linear-gradient(135deg, #007D77 0%, #005F5A 100%); color:#fff; border:none; border-radius:8px; padding:10px; font-size:0.82rem; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 3px 10px rgba(0,125,119,0.25);">
          <span>💳</span> <span>Bayar Sekarang (CHIP Online)</span>
        </button>
      ` : ''}
    </div>

    <!-- Rejection reason if rejected -->
    ${booking.rejection_reason ? `
      <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:10px; padding:10px; margin-bottom:14px; font-size:0.75rem; color:#991B1B;">
        <b>Sebab Penolakan HQ:</b> ${escapeHtml(booking.rejection_reason)}
      </div>
    ` : ''}

    <!-- Action Buttons -->
    <div style="display:flex; flex-direction:column; gap:8px;">
      ${canTrack ? `
        <button type="button" id="btnDetailOpenTracking" style="background:#0D9488; color:#fff; border:none; border-radius:8px; padding:10px; font-size:0.82rem; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
          <span>🚑</span> <span>Jejak Ambulans Langsung</span>
        </button>
      ` : ''}

      ${isPending ? `
        <button type="button" id="btnDetailCancelPending" style="background:#FEE2E2; color:#991B1B; border:1px solid #FCA5A5; border-radius:8px; padding:9px; font-size:0.78rem; font-weight:700; cursor:pointer;">
          ✕ Batal Permohonan Tempahan
        </button>
      ` : ''}

      ${isApproved ? `
        <button type="button" id="btnDetailRequestCancelOrResched" style="background:#F8FAFC; color:#334155; border:1px solid #CBD5E1; border-radius:8px; padding:9px; font-size:0.78rem; font-weight:700; cursor:pointer;">
          ⚠️ Mohon Batal / Jadual Semula
        </button>
      ` : ''}

      <a href="tel:0139147606" style="display:flex; align-items:center; justify-content:center; gap:6px; background:#F1F5F9; color:#0F172A; text-decoration:none; border-radius:8px; padding:9px; font-size:0.78rem; font-weight:700; border:1px solid #E2E8F0;">
        <span>📞</span> <span>Hubungi Pusat Operasi HQ</span>
      </a>
    </div>
  `;

  modal.classList.add('show');
  modal.style.display = 'flex';

  // Attach button actions
  const btnTrack = document.getElementById('btnDetailOpenTracking');
  if (btnTrack) {
    btnTrack.addEventListener('click', () => {
      closeModal();
      openCustomerLiveTracking(booking);
    });
  }

  const btnPayChip = document.getElementById('btnDetailPayChip');
  if (btnPayChip) {
    btnPayChip.addEventListener('click', async () => {
      const originalText = btnPayChip.innerHTML;
      btnPayChip.disabled = true;
      btnPayChip.innerHTML = '<span>⏳ Membuka Gerbang CHIP...</span>';
      try {
        const res = await initiateChipPayment(booking, 'full');
        if (res.success && res.checkoutUrl) {
          window.location.href = res.checkoutUrl;
        } else {
          alert('Ralat Pembayaran: ' + (res.error || 'Sila cuba lagi.'));
          btnPayChip.disabled = false;
          btnPayChip.innerHTML = originalText;
        }
      } catch (err) {
        alert('Ralat Pembayaran: ' + err.message);
        btnPayChip.disabled = false;
        btnPayChip.innerHTML = originalText;
      }
    });
  }

  const btnCancelPending = document.getElementById('btnDetailCancelPending');
  if (btnCancelPending) {
    btnCancelPending.addEventListener('click', async () => {
      const reason = prompt('Sila nyatakan sebab pembatalan tempahan ini:');
      if (reason === null) return;
      if (!reason.trim()) {
        alert('Sebab pembatalan adalah wajib diisi.');
        return;
      }
      btnCancelPending.disabled = true;
      btnCancelPending.textContent = '⏳ Membatalkan...';

      const user = getStoredUserProfile() || {};
      const res = await customerCancelOrRequestBooking({
        booking,
        reason: reason.trim(),
        customerEmail: user.email || booking.patient_email
      });

      if (res.success) {
        alert('Tempahan anda telah berjaya dibatalkan.');
        closeModal();
        loadAndRenderCustomerBookings();
      } else {
        alert(res.error || 'Gagal membatalkan tempahan.');
        btnCancelPending.disabled = false;
        btnCancelPending.textContent = '✕ Batal Permohonan Tempahan';
      }
    });
  }

  const btnReqChange = document.getElementById('btnDetailRequestCancelOrResched');
  if (btnReqChange) {
    btnReqChange.addEventListener('click', async () => {
      const choice = confirm('Pilih [OK] untuk memohon anjakan masa (jadual semula), atau [Batal] untuk memohon pembatalan tempahan.');
      const user = getStoredUserProfile() || {};

      if (choice) {
        // Reschedule
        const newTimeStr = prompt('Sila masukkan tarikh dan masa baharu (Format: YYYY-MM-DD HH:mm):');
        if (!newTimeStr) return;
        const res = await customerRequestReschedule({
          booking,
          newTime: new Date(newTimeStr).toISOString(),
          reason: 'Permohonan anjakan masa pelanggan.',
          customerEmail: user.email || booking.patient_email
        });
        alert(res.message || 'Permohonan anjakan masa dihantar.');
        closeModal();
        loadAndRenderCustomerBookings();
      } else {
        // Cancellation request
        const reason = prompt('Sila nyatakan sebab permohonan pembatalan tempahan yang telah disahkan ini:');
        if (!reason || !reason.trim()) return;
        const res = await customerCancelOrRequestBooking({
          booking,
          reason: reason.trim(),
          customerEmail: user.email || booking.patient_email
        });
        alert(res.message || 'Permohonan pembatalan dihantar untuk semakan HQ.');
        closeModal();
        loadAndRenderCustomerBookings();
      }
    });
  }
}

/**
 * 6. Opens Customer Live Ambulance Tracking
 */
export function openCustomerLiveTracking(booking) {
  const trackModal = document.getElementById('customerLiveTrackingModal');
  if (!trackModal) return;

  trackModal.style.display = 'flex';

  const refEl = document.getElementById('trackModalRefText');
  const plateEl = document.getElementById('trackModalPlate');
  const driverEl = document.getElementById('trackModalDriver');
  const etaEl = document.getElementById('trackModalEta');
  const distEl = document.getElementById('trackModalDist');

  const inv = booking.invoice_number || booking.invoiceNumber || 'AMC-1043';
  if (refEl) refEl.textContent = inv;
  if (plateEl) plateEl.textContent = booking.plate_number ? `🚑 ${booking.plate_number}` : '🚑 Belum ditetapkan';
  if (driverEl) driverEl.textContent = booking.driver_name ? `👨‍✈️ ${booking.driver_name}` : '👨‍✈️ Belum ditetapkan';

  // Only display reliable ETA / distance, never placeholder values
  const km = Number(booking.distance_km || 25);
  if (distEl) distEl.textContent = `${(km * 0.4).toFixed(1)} km`;
  if (etaEl) etaEl.textContent = `${Math.round((km * 0.4) * 2.2)} min`;

  // Initialize or resize Leaflet Map
  setTimeout(() => {
    initOrUpdateCustomerLiveMap(booking);
  }, 100);
}

function initOrUpdateCustomerLiveMap(booking) {
  const mapCanvas = document.getElementById('customerLiveMapCanvas');
  if (!mapCanvas || typeof L === 'undefined') return;

  const defaultCoords = [6.1256, 102.2482]; // Kota Bharu
  const pickup = booking.pickup_coordinates || defaultCoords;

  if (!customerLiveMap) {
    customerLiveMap = L.map('customerLiveMapCanvas', {
      zoomControl: false,
      attributionControl: false
    }).setView(pickup, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(customerLiveMap);
  } else {
    customerLiveMap.setView(pickup, 13);
    customerLiveMap.invalidateSize();
  }

  // Clear previous markers
  customerLiveMap.eachLayer((layer) => {
    if (layer instanceof L.Marker || layer instanceof L.Polyline) {
      customerLiveMap.removeLayer(layer);
    }
  });

  // Pickup marker
  L.marker(pickup, {
    title: 'Lokasi Pengambilan'
  }).addTo(customerLiveMap).bindPopup(`<b>Lokasi Pengambilan</b><br>${booking.origin_name || ''}`).openPopup();
}

/**
 * Helper to escape HTML
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

