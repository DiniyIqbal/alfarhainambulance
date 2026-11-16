// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - PENGURUSAN TEMPAHAN (ADMIN MODULE)
// Comprehensive Booking Desk: Review, Approve, Reject, Assign Resources,
// Real KPI Metrics, Filter/Search, Manual Admin Booking & Audit Log.
// =========================================================================

import {
  deriveCustomerStatus,
  approveBookingRequest,
  rejectBookingRequest,
  assignBookingResources,
  updateTripProgress,
  calculateAdminDashboardKpis,
  filterBookingsList,
  checkResourceConflicts,
  createPatientBooking
} from '../services/bookingManagementService.js';

import {
  fetchBookingsFromSupabase,
  saveLocalBookingCache,
  broadcastSyncEvent,
  subscribeToUnifiedSync
} from '../services/supabaseClient.js';

import {
  SERVICE_PACKAGES,
  HUBS,
  getServicePackageById
} from '../data/pricingData.js';

import {
  calculateTransportFare
} from '../services/pricingService.js';

let currentBookings = [];
let activeAdminUser = { name: 'Pegawai Operasi HQ', email: 'pengurus@alfarhain.my', branch: 'kok_lanas' };
let currentSelectedBookingId = null;
let currentDrawerTab = 'tindakan'; // 'tindakan' | 'laluan' | 'invois' | 'audit'
let currentFilters = {
  tab: 'all',
  search: '',
  branch: 'all',
  bookingStatus: 'all',
  paymentStatus: 'all',
  provider: 'all',
  sortBy: 'date_desc'
};

export async function initBookingManagementModule(portalState, showToast, playSuccessChime) {
  if (portalState?.currentUser) {
    activeAdminUser = portalState.currentUser;
  }

  // Load bookings from remote Supabase and local cache
  await refreshBookingsData();

  // Listen for Realtime / Sync events
  subscribeToUnifiedSync({
    onNewBooking: (newB) => {
      handleIncomingBooking(newB, showToast);
    },
    onUpdateBooking: (updatedB) => {
      handleUpdatedBooking(updatedB);
    }
  });

  // Attach DOM Listeners for filters and buttons
  setupBookingDeskListeners(showToast, playSuccessChime);

  // Initial Render
  renderBookingDashboard();
}

/**
 * Loads remote bookings, merges with local cache and preloaded records.
 */
async function refreshBookingsData() {
  const remote = await fetchBookingsFromSupabase(100);
  let local = [];
  try {
    const raw = localStorage.getItem('amc_all_bookings');
    local = raw ? JSON.parse(raw) : [];
  } catch (e) {
    local = [];
  }

  // Deduplicate by invoice_number
  const map = new Map();
  if (Array.isArray(remote)) {
    remote.forEach(b => {
      const inv = b.invoice_number || b.invoiceNumber;
      if (inv) map.set(inv, b);
    });
  }
  local.forEach(b => {
    const inv = b.invoice_number || b.invoiceNumber;
    if (inv && (!map.has(inv) || (new Date(b.updated_at || 0) > new Date(map.get(inv).updated_at || 0)))) {
      map.set(inv, b);
    }
  });

  // Ensure initial seed / demo records exist if empty
  if (map.size === 0) {
    const seed = getInitialSeedBookings();
    seed.forEach(b => map.set(b.invoice_number, b));
  }

  currentBookings = Array.from(map.values()).sort((a, b) => {
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
}

function handleIncomingBooking(newB, showToast) {
  const inv = newB.invoice_number || newB.invoiceNumber;
  if (!inv) return;
  const idx = currentBookings.findIndex(b => (b.invoice_number || b.invoiceNumber) === inv);
  if (idx >= 0) {
    currentBookings[idx] = { ...currentBookings[idx], ...newB };
  } else {
    currentBookings.unshift(newB);
  }
  renderBookingDashboard();
  if (showToast) {
    showToast(`🔔 Tempahan Baharu Diterima: ${inv}`);
  }
}

function handleUpdatedBooking(updatedB) {
  const inv = updatedB.invoice_number || updatedB.invoiceNumber;
  if (!inv) return;
  const idx = currentBookings.findIndex(b => (b.invoice_number || b.invoiceNumber) === inv);
  if (idx >= 0) {
    currentBookings[idx] = { ...currentBookings[idx], ...updatedB };
    renderBookingDashboard();
    if (currentSelectedBookingId === inv) {
      renderBookingDetailDrawer(currentBookings[idx]);
    }
  }
}

/**
 * Setup DOM event listeners for the booking desk
 */
function setupBookingDeskListeners(showToast, playSuccessChime) {
  // Search input
  const searchInput = document.getElementById('bookingSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilters.search = e.target.value.trim();
      renderBookingsTable();
    });
  }

  // Status Tabs Bar Navigation
  const tabsNav = document.getElementById('bookingStatusTabsNav');
  if (tabsNav) {
    tabsNav.querySelectorAll('.booking-status-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab || 'all';
        currentFilters.tab = tab;
        tabsNav.querySelectorAll('.booking-status-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderBookingsTable();
      });
    });
  }

  // Branch filter
  const branchFilter = document.getElementById('bookingBranchFilter');
  if (branchFilter) {
    branchFilter.addEventListener('change', (e) => {
      currentFilters.branch = e.target.value;
      renderBookingDashboard();
    });
  }

  // Status filter dropdown
  const statusFilter = document.getElementById('bookingStatusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      currentFilters.bookingStatus = e.target.value;
      renderBookingsTable();
    });
  }

  // Payment filter
  const paymentFilter = document.getElementById('bookingPaymentFilter');
  if (paymentFilter) {
    paymentFilter.addEventListener('change', (e) => {
      currentFilters.paymentStatus = e.target.value;
      renderBookingsTable();
    });
  }

  // Provider filter
  const providerFilter = document.getElementById('bookingProviderFilter');
  if (providerFilter) {
    providerFilter.addEventListener('change', (e) => {
      currentFilters.provider = e.target.value;
      renderBookingsTable();
    });
  }

  // Reset Filters Button
  const btnReset = document.getElementById('btnResetBookingFilters');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      currentFilters = {
        tab: 'all',
        search: '',
        branch: 'all',
        bookingStatus: 'all',
        paymentStatus: 'all',
        provider: 'all',
        sortBy: 'date_desc'
      };
      if (searchInput) searchInput.value = '';
      if (branchFilter) branchFilter.value = 'all';
      if (statusFilter) statusFilter.value = 'all';
      if (paymentFilter) paymentFilter.value = 'all';
      if (providerFilter) providerFilter.value = 'all';

      const nav = document.getElementById('bookingStatusTabsNav');
      if (nav) {
        nav.querySelectorAll('.booking-status-tab-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.tab === 'all');
        });
      }
      renderBookingDashboard();
    });
  }

  // KPI card clicks (Quick filter)
  const kpiPending = document.getElementById('kpiCardPending');
  if (kpiPending) {
    kpiPending.addEventListener('click', () => {
      setQuickFilterTab('menunggu_kelulusan');
    });
  }
  const kpiApproved = document.getElementById('kpiCardApproved');
  if (kpiApproved) {
    kpiApproved.addEventListener('click', () => {
      setQuickFilterTab('menunggu_agihan');
    });
  }
  const kpiOngoing = document.getElementById('kpiCardOngoing');
  if (kpiOngoing) {
    kpiOngoing.addEventListener('click', () => {
      setQuickFilterTab('sedang_misi');
    });
  }
  const kpiCompleted = document.getElementById('kpiCardCompletedToday');
  if (kpiCompleted) {
    kpiCompleted.addEventListener('click', () => {
      setQuickFilterTab('selesai');
    });
  }

  // Close Drawer actions
  const closeDrawerBtn = document.getElementById('closeBookingDrawerBtn');
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', closeBookingDetailDrawer);
  }

  const drawerBackdrop = document.getElementById('bookingDrawerBackdrop');
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', closeBookingDetailDrawer);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBookingDetailDrawer();
  });

  // New Manual Booking Button
  const btnNewManualBooking = document.getElementById('btnOpenManualBookingModal');
  if (btnNewManualBooking) {
    btnNewManualBooking.addEventListener('click', () => {
      openManualBookingModal(showToast, playSuccessChime);
    });
  }
}

function setQuickFilterTab(tabKey) {
  currentFilters.tab = tabKey;
  const nav = document.getElementById('bookingStatusTabsNav');
  if (nav) {
    nav.querySelectorAll('.booking-status-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabKey);
    });
  }
  renderBookingsTable();
}

/**
 * Opens slide-over drawer smoothly with backdrop
 */
export function openBookingDetailDrawer(booking) {
  currentSelectedBookingId = booking.invoice_number || booking.invoiceNumber;
  renderBookingDetailDrawer(booking);

  const drawer = document.getElementById('bookingDetailDrawer');
  const backdrop = document.getElementById('bookingDrawerBackdrop');

  if (drawer) {
    drawer.style.display = 'flex';
    void drawer.offsetWidth; // Force reflow
    drawer.classList.add('open');
  }
  if (backdrop) {
    backdrop.style.display = 'block';
    void backdrop.offsetWidth;
    backdrop.classList.add('open');
  }
}

/**
 * Closes slide-over drawer smoothly
 */
export function closeBookingDetailDrawer() {
  const drawer = document.getElementById('bookingDetailDrawer');
  const backdrop = document.getElementById('bookingDrawerBackdrop');

  if (drawer) {
    drawer.classList.remove('open');
    setTimeout(() => {
      if (!drawer.classList.contains('open')) {
        drawer.style.display = 'none';
      }
    }, 260);
  }
  if (backdrop) {
    backdrop.classList.remove('open');
    setTimeout(() => {
      if (!backdrop.classList.contains('open')) {
        backdrop.style.display = 'none';
      }
    }, 260);
  }

  currentSelectedBookingId = null;
  document.querySelectorAll('#bookingsTableBody tr').forEach(r => r.classList.remove('selected-row'));
}

/**
 * Main render function for KPI cards & table
 */
export function renderBookingDashboard() {
  renderKpiCards();
  renderBookingsTable();
}

/**
 * Calculates and updates the 4 KPI summary cards based on authorized scope.
 */
function renderKpiCards() {
  const kpis = calculateAdminDashboardKpis(currentBookings, currentFilters.branch);

  const elPending = document.getElementById('kpiCountPending');
  if (elPending) elPending.textContent = kpis.pendingApproval;

  const elApproved = document.getElementById('kpiCountApproved');
  if (elApproved) elApproved.textContent = kpis.approved;

  const elOngoing = document.getElementById('kpiCountOngoing');
  if (elOngoing) elOngoing.textContent = kpis.ongoing;

  const elCompleted = document.getElementById('kpiCountCompletedToday');
  if (elCompleted) elCompleted.textContent = kpis.completedToday;
}

/**
 * Updates count badges on the Status Quick Tabs Navigation bar
 */
function updateStatusTabsCountBadges() {
  let pendingCount = 0;
  let approvedCount = 0;
  let activeCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;

  currentBookings.forEach(b => {
    const s = deriveCustomerStatus(b).code;
    if (s === 'menunggu_kelulusan') pendingCount++;
    else if (s === 'menunggu_agihan') approvedCount++;
    else if (['menuju_pengambilan', 'tiba_pengambilan', 'menuju_destinasi'].includes(s)) activeCount++;
    else if (s === 'selesai') completedCount++;
    else if (['ditolak', 'dibatalkan'].includes(s)) cancelledCount++;
  });

  const elAll = document.getElementById('tabCountAll');
  if (elAll) elAll.textContent = currentBookings.length;

  const elPending = document.getElementById('tabCountPending');
  if (elPending) elPending.textContent = pendingCount;

  const elApproved = document.getElementById('tabCountApproved');
  if (elApproved) elApproved.textContent = approvedCount;

  const elActive = document.getElementById('tabCountActive');
  if (elActive) elActive.textContent = activeCount;

  const elCompleted = document.getElementById('tabCountCompleted');
  if (elCompleted) elCompleted.textContent = completedCount;

  const elCancelled = document.getElementById('tabCountCancelled');
  if (elCancelled) elCancelled.textContent = cancelledCount;
}

/**
 * Renders the bookings table with all 8 specified columns.
 */
function renderBookingsTable() {
  const tbody = document.getElementById('bookingsTableBody');
  if (!tbody) return;

  updateStatusTabsCountBadges();

  const filtered = filterBookingsList(currentBookings, {
    tab: currentFilters.tab,
    search: currentFilters.search,
    branch: currentFilters.branch,
    bookingStatus: currentFilters.bookingStatus,
    paymentStatus: currentFilters.paymentStatus,
    provider: currentFilters.provider,
    sortBy: currentFilters.sortBy
  });

  const countLabel = document.getElementById('bookingsCountLabel');
  if (countLabel) {
    countLabel.textContent = `Menunjukkan ${filtered.length} daripada ${currentBookings.length} rekod`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 48px 16px; color: #64748B;">
          <div style="font-size: 2.5rem; margin-bottom: 10px;">📋</div>
          <strong style="color: #0F172A; display: block; font-size: 1.05rem; margin-bottom: 4px;">Tiada Rekod Tempahan Ditemui</strong>
          <span style="font-size: 0.82rem; color: #64748B;">Cuba ubah kriteria carian atau klik tab status lain di atas.</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    const inv = b.invoice_number || b.invoiceNumber || 'AMC-0000';
    const custStatus = deriveCustomerStatus(b);
    const isSelected = currentSelectedBookingId === inv;

    // Schedule formatting (Asia/Kuala_Lumpur)
    const isSched = Boolean(b.is_scheduled || b.isScheduled);
    const schedTime = b.scheduled_time || b.scheduledTime;
    let schedDisplay = `<span style="display:inline-flex;align-items:center;gap:4px;color:#D97706;font-weight:700;">⚡ Secepat mungkin</span>`;
    if (isSched && schedTime) {
      try {
        const d = new Date(schedTime);
        schedDisplay = `<span style="color:#0F172A;font-weight:700;">📅 ${d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}</span>`;
      } catch (e) {
        schedDisplay = `<span style="color:#0F172A;font-weight:700;">📅 Dijadualkan</span>`;
      }
    }

    // Customer info
    const patientName = b.patient_name || b.patientName || 'Pesakit AMC';
    const patientPhone = b.patient_phone || b.patientPhone || '—';

    // Route
    const origin = b.origin_name || b.pickup_address || b.pickupAddress || 'Pengambilan';
    const dest = b.destination_name || b.destinationName || 'Destinasi';

    // Package
    const pkgName = b.package_name || b.trip_type || b.tripType || 'Kecemasan Standard';

    // Payment status badge
    const payStatus = (b.payment_status || b.paymentStatus || 'unpaid').toLowerCase();
    const payBadge = payStatus === 'paid'
      ? `<span class="badge-status-pill green">✓ Telah Bayar</span>`
      : (payStatus === 'deposit'
        ? `<span class="badge-status-pill amber">Deposit RM100</span>`
        : `<span class="badge-status-pill grey">Belum Bayar</span>`);

    // Assigned resources
    const plate = b.plate_number || b.plateNumber;
    const driver = b.driver_name || b.driverName;
    const provider = b.assigned_provider_name || b.assignedProviderName || 'Al-Farhain AMC';
    let resourceDisplay = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#FEF3C7;color:#92400E;font-size:0.72rem;font-weight:700;">⚠️ Perlu Agihan</span>`;
    if (plate && driver) {
      resourceDisplay = `
        <div style="font-size: 0.8rem; font-weight: 800; color: #0F172A; display:flex; align-items:center; gap:4px;">
          <span>🚑</span> <span>${escapeHtml(plate)}</span>
        </div>
        <div style="font-size: 0.74rem; color: #334155; font-weight: 600;">👨‍✈️ ${escapeHtml(driver)}</div>
        <div style="font-size: 0.68rem; color: #059669; font-weight: 700;">${escapeHtml(provider)}</div>
      `;
    }

    // Amount
    const amount = Number(b.total_fare || b.totalFare || 250.00);

    return `
      <tr class="${isSelected ? 'selected-row' : ''}" data-inv="${escapeHtml(inv)}" style="cursor: pointer; transition: background-color 0.15s;">
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <strong style="color: var(--amc-red); font-size: 0.88rem; font-weight: 900;">${escapeHtml(inv)}</strong>
          </div>
          <div style="font-size: 0.8rem; font-weight: 800; color: #0F172A; margin-top: 2px;">${escapeHtml(patientName)}</div>
          <div style="font-size: 0.72rem; color: #64748B;">📞 ${escapeHtml(patientPhone)}</div>
        </td>
        <td>
          <div style="font-size: 0.8rem;">${schedDisplay}</div>
          <div style="font-size: 0.7rem; color: #64748B; margin-top: 2px;">Dihantar: ${formatTimestamp(b.created_at)}</div>
        </td>
        <td>
          <div style="font-size: 0.8rem; color: #0F172A; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(origin)}">
            <span style="color: #10B981; font-weight: 900;">●</span> <b>A:</b> ${escapeHtml(origin)}
          </div>
          <div style="font-size: 0.8rem; color: #0F172A; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;" title="${escapeHtml(dest)}">
            <span style="color: #EF4444; font-weight: 900;">●</span> <b>D:</b> ${escapeHtml(dest)}
          </div>
          <div style="font-size: 0.7rem; color: #64748B; margin-top: 2px; font-weight: 600;">
            📍 Jarak: ${Number(b.distance_km || b.distanceKm || 25).toFixed(1)} km
          </div>
        </td>
        <td>
          <div style="font-size: 0.82rem; font-weight: 800; color: #0F172A;">${escapeHtml(pkgName)}</div>
          <div style="font-size: 0.82rem; color: #059669; font-weight: 900; margin-top: 2px;">RM ${amount.toFixed(2)}</div>
        </td>
        <td>
          <span class="badge-status-pill" style="background: ${custStatus.badgeBg}; color: ${custStatus.badgeColor}; border: 1px solid rgba(0,0,0,0.08); font-size: 0.74rem; font-weight: 800; padding: 4px 10px; border-radius: 999px; display: inline-flex; align-items: center; gap: 5px;">
            <span>${custStatus.icon}</span> <span>${custStatus.label}</span>
          </span>
          ${b.cancellation_requested ? `<div style="margin-top:4px; display:inline-block; background:#FEF2F2; color:#991B1B; font-size:0.68rem; font-weight:800; padding:2px 6px; border-radius:4px; border:1px solid #FECACA;">⚠️ Mohon Batal</div>` : ''}
          ${b.reschedule_requested ? `<div style="margin-top:4px; display:inline-block; background:#FEF3C7; color:#92400E; font-size:0.68rem; font-weight:800; padding:2px 6px; border-radius:4px; border:1px solid #FDE68A;">⏳ Mohon Jadual</div>` : ''}
        </td>
        <td>
          ${payBadge}
        </td>
        <td>
          ${resourceDisplay}
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn-table-action-primary btn-open-drawer" data-inv="${escapeHtml(inv)}" title="Buka panel kawalan operasi tempahan ini">
            <span>⚙️</span> <span>Urus</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Row & Urus Button click listeners
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', (e) => {
      const inv = tr.dataset.inv;
      if (!inv) return;
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
      tr.classList.add('selected-row');
      const b = currentBookings.find(x => (x.invoice_number || x.invoiceNumber) === inv);
      if (b) openBookingDetailDrawer(b);
    });
  });
}

/**
 * Renders the Right-hand Detail Slide-Over Drawer with comprehensive tabs & operational tools
 */
export function renderBookingDetailDrawer(booking) {
  const drawer = document.getElementById('bookingDetailDrawer');
  if (!drawer) return;

  const inv = booking.invoice_number || booking.invoiceNumber;
  const custStatus = deriveCustomerStatus(booking);
  const isPending = custStatus.code === 'menunggu_kelulusan';
  const isApproved = custStatus.code === 'menunggu_agihan' || custStatus.code === 'dijadualkan';
  const isEnRoute = ['menuju_pengambilan', 'tiba_pengambilan', 'menuju_destinasi'].includes(custStatus.code);
  const isCompleted = custStatus.code === 'selesai';

  const container = document.getElementById('bookingDrawerContent');
  if (!container) return;

  const pkg = booking.package_snapshot || getServicePackageById(booking.package_id) || {
    name: booking.package_name || booking.trip_type || 'Kecemasan Standard',
    baseFare: booking.base_fare || 250.00,
    includedEquipment: [],
    includedStaff: []
  };

  const amount = Number(booking.total_fare || booking.totalFare || 250.00);
  const patientPhone = (booking.patient_phone || booking.patientPhone || '').replace(/\s+/g, '');
  const cleanPhoneForWa = patientPhone.replace(/[^0-9]/g, '');
  const waUrl = cleanPhoneForWa ? `https://wa.me/${cleanPhoneForWa.startsWith('6') ? cleanPhoneForWa : '60' + cleanPhoneForWa.replace(/^0/, '')}?text=Salam%20dari%20Al-Farhain%20AMC%20Ambulans%20berkenaan%20tempahan%20${encodeURIComponent(inv)}` : '#';

  const originName = booking.origin_name || booking.pickup_address || booking.pickupAddress || 'Lokasi Pesakit';
  const destName = booking.destination_name || booking.destinationName || 'Hospital Pilihan';
  const mapsDirUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originName)}&destination=${encodeURIComponent(destName)}`;

  // Determine current mission step index (0: Dihantar, 1: Diluluskan, 2: Diagihkan, 3: Menuju Pengambilan, 4: Tiba Lokasi, 5: Menuju Hospital, 6: Selesai)
  let missionStep = 1;
  const currentTripStatus = (booking.trip_status || 'not_started').toLowerCase();
  if (booking.booking_status === 'pending_approval') missionStep = 0;
  else if (booking.booking_status === 'approved' && !booking.plate_number) missionStep = 1;
  else if (booking.plate_number && currentTripStatus === 'not_started') missionStep = 2;
  else if (currentTripStatus === 'en_route_pickup') missionStep = 3;
  else if (currentTripStatus === 'arrived_pickup') missionStep = 4;
  else if (currentTripStatus === 'en_route_destination') missionStep = 5;
  else if (currentTripStatus === 'completed') missionStep = 6;

  container.innerHTML = `
    <!-- 1. Drawer Header -->
    <div class="booking-drawer-header">
      <div class="booking-drawer-header-left">
        <div class="booking-drawer-icon-box">🚑</div>
        <div>
          <span class="booking-drawer-title-sub">Urus Tempahan &amp; Kawalan Operasi</span>
          <h3 class="booking-drawer-ref-title">${escapeHtml(inv)}</h3>
        </div>
      </div>
      <div class="booking-drawer-header-actions">
        <button type="button" class="btn-drawer-header-copy" id="btnDrawerCopyRef" title="Salin No Rujukan">
          <span>📋</span> <span id="copyRefLabel">Salin</span>
        </button>
        <button type="button" class="booking-drawer-close-btn" id="closeBookingDrawerBtn" aria-label="Tutup">&times;</button>
      </div>
    </div>

    <!-- 2. Quick Action & Status Banner -->
    <div class="booking-drawer-quick-bar">
      <div class="quick-bar-left">
        <span class="badge-status-pill" style="background: ${custStatus.badgeBg}; color: ${custStatus.badgeColor}; font-weight: 800; font-size: 0.76rem; padding: 4px 10px; border-radius: 999px;">
          ${custStatus.icon} ${custStatus.label}
        </span>
        <span style="font-size: 0.7rem; color: #64748B; font-weight: 600;">v${booking.version || 1}</span>
      </div>

      <div style="display: flex; gap: 6px;">
        ${patientPhone ? `
          <a href="tel:${escapeHtml(patientPhone)}" class="quick-action-pill-btn call" title="Panggil Pesakit/Waris">
            <span>📞</span> <span>Panggil</span>
          </a>
          <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="quick-action-pill-btn whatsapp" title="Hubungi melalui WhatsApp">
            <span>💬</span> <span>WhatsApp</span>
          </a>
        ` : ''}
        <a href="${mapsDirUrl}" target="_blank" rel="noopener noreferrer" class="quick-action-pill-btn map" title="Buka di Google Maps">
          <span>🗺️</span> <span>Peta</span>
        </a>
      </div>
    </div>

    <!-- 3. Drawer Segmented Navigation Tabs -->
    <nav class="booking-drawer-tabs-nav" aria-label="Pilihan Butiran">
      <button type="button" class="drawer-tab-btn ${currentDrawerTab === 'tindakan' ? 'active' : ''}" data-target-tab="tindakan">
        <span>⚡</span> <span>Operasi &amp; Agihan</span>
      </button>
      <button type="button" class="drawer-tab-btn ${currentDrawerTab === 'laluan' ? 'active' : ''}" data-target-tab="laluan">
        <span>📍</span> <span>Laluan &amp; Pesakit</span>
      </button>
      <button type="button" class="drawer-tab-btn ${currentDrawerTab === 'invois' ? 'active' : ''}" data-target-tab="invois">
        <span>💳</span> <span>Pakej &amp; Invois</span>
      </button>
      <button type="button" class="drawer-tab-btn ${currentDrawerTab === 'audit' ? 'active' : ''}" data-target-tab="audit">
        <span>📜</span> <span>Log Audit</span>
      </button>
    </nav>

    <!-- 4. Scrollable Drawer Body Content -->
    <div class="booking-drawer-body">
      
      <!-- ================= TAB 1: OPERASI & AGIHAN ================= -->
      <div id="drawerTabPanelTindakan" style="display: ${currentDrawerTab === 'tindakan' ? 'block' : 'none'};">
        
        <!-- Alerts: Cancellation / Reschedule Requests -->
        ${booking.cancellation_requested ? `
          <div style="background: #FEF2F2; border: 1.5px solid #F87171; border-radius: 10px; padding: 12px; margin-bottom: 14px;">
            <strong style="color: #991B1B; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
              <span>⚠️</span> Permohonan Pembatalan daripada Pelanggan
            </strong>
            <p style="font-size: 0.76rem; color: #7F1D1D; margin: 6px 0 10px; background: #fff; padding: 8px; border-radius: 6px; border: 1px dashed #FCA5A5;">
              "${escapeHtml(booking.cancellation_request_reason || 'Tiada sebab dinyatakan')}"
            </p>
            <button type="button" id="btnAdminAcceptCancel" style="background: #DC2626; color: #fff; border: none; border-radius: 7px; padding: 7px 14px; font-size: 0.76rem; font-weight: 800; cursor: pointer;">
              ✓ Sahkan &amp; Batalkan Tempahan Ini
            </button>
          </div>
        ` : ''}

        ${booking.reschedule_requested ? `
          <div style="background: #FFFBEB; border: 1.5px solid #FCD34D; border-radius: 10px; padding: 12px; margin-bottom: 14px;">
            <strong style="color: #92400E; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
              <span>⏳</span> Permohonan Anjakan Masa oleh Pelanggan
            </strong>
            <p style="font-size: 0.76rem; color: #78350F; margin: 6px 0 10px;">
              Masa Baharu Dipohon: <b>${formatTimestamp(booking.reschedule_request_time)}</b>
            </p>
            <button type="button" id="btnAdminAcceptReschedule" style="background: #059669; color: #fff; border: none; border-radius: 7px; padding: 7px 14px; font-size: 0.76rem; font-weight: 800; cursor: pointer;">
              ✓ Luluskan Anjakan Masa Ini
            </button>
          </div>
        ` : ''}

        <!-- Pending Approval Decision Card -->
        ${isPending ? `
          <div class="drawer-section-card" style="border-left: 4px solid #D97706; background: #FFFDF7;">
            <div class="drawer-card-header">
              <h4 class="drawer-card-title" style="color: #92400E;">
                <span>⏳</span> <span>Keputusan Semakan Permohonan HQ</span>
              </h4>
              <span class="badge-status-pill amber" style="font-size:0.68rem;">Perlu Tindakan</span>
            </div>
            <p style="font-size: 0.74rem; color: #475569; margin: 0 0 12px; line-height: 1.4;">
              Permohonan ini baru dihantar oleh pelanggan dan memerlukan kelulusan rasmi HQ sebelum ambulans dan krew diagihkan.
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <button type="button" id="btnDrawerApprove" style="background: #059669; color: #FFFFFF; border: none; border-radius: 8px; padding: 9px; font-weight: 800; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(5,150,105,0.25);">
                <span>✓</span> <span>Luluskan Tempahan</span>
              </button>
              <button type="button" id="btnDrawerReject" style="background: #DC2626; color: #FFFFFF; border: none; border-radius: 8px; padding: 9px; font-weight: 800; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <span>✕</span> <span>Tolak Tempahan</span>
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Resource Assignment Card -->
        <div class="drawer-section-card">
          <div class="drawer-card-header">
            <h4 class="drawer-card-title">
              <span>🚑</span> <span>Agihan Sumber Operasi (Armada &amp; Krew)</span>
            </h4>
            ${booking.plate_number ? `
              <span class="badge-status-pill green" style="font-size:0.68rem;">✓ Telah Diagih</span>
            ` : `
              <span class="badge-status-pill amber" style="font-size:0.68rem;">Belum Diagih</span>
            `}
          </div>

          <div class="drawer-form-group">
            <label class="drawer-form-label">Penyedia Perkhidmatan Ambulans</label>
            <select id="drawerAssignProviderSelect" class="drawer-form-select">
              <option value="internal" ${(!booking.assigned_provider_id || booking.assigned_provider_id === 'internal') ? 'selected' : ''}>Al-Farhain AMC (Armada Dalaman)</option>
              <option value="partner_medicorp" ${booking.assigned_provider_id === 'prov_med' ? 'selected' : ''}>MediCorp Ambulance Services (Rakan B2B)</option>
              <option value="partner_pantai" ${booking.assigned_provider_id === 'prov_resq' ? 'selected' : ''}>ResQ Response Network (Rakan B2B)</option>
            </select>
          </div>

          <div class="drawer-form-group">
            <label class="drawer-form-label">Ambulans Bertugas</label>
            <select id="drawerAssignVehicleSelect" class="drawer-form-select">
              <option value="VPQ 7606" ${booking.plate_number === 'VPQ 7606' ? 'selected' : ''}>VPQ 7606 — Toyota Hiace Medical (Kok Lanas HQ)</option>
              <option value="DFG 7606" ${booking.plate_number === 'DFG 7606' ? 'selected' : ''}>DFG 7606 — Toyota Hiace Emergency (Cawangan Raub)</option>
              <option value="VPP 9901" ${booking.plate_number === 'VPP 9901' ? 'selected' : ''}>VPP 9901 — Toyota Hiace Standby (Cawangan Jeli)</option>
              <option value="MD-AMB-01" ${booking.plate_number === 'MD-AMB-01' ? 'selected' : ''}>MD-AMB-01 — MediCorp Ambulance Unit 1 (Rakan B2B)</option>
            </select>
          </div>

          <div class="drawer-form-group">
            <label class="drawer-form-label">Pemandu EMT Bertugas</label>
            <select id="drawerAssignDriverSelect" class="drawer-form-select">
              <option value="Abe Di / Syalihan" ${booking.driver_name === 'Abe Di / Syalihan' ? 'selected' : ''}>Abe Di / Syalihan (GDL &amp; EMT Bertauliah · Kok Lanas)</option>
              <option value="Abe Din Estimos Sukrosa" ${booking.driver_name === 'Abe Din Estimos Sukrosa' ? 'selected' : ''}>Abe Din Estimos Sukrosa (EMT Bertauliah · Raub)</option>
              <option value="Kamarudin Ismail" ${booking.driver_name === 'Kamarudin Ismail' ? 'selected' : ''}>Kamarudin Ismail (EMT Pasir Mas)</option>
              <option value="Kapten Sani Roslan" ${booking.driver_name === 'Kapten Sani Roslan' ? 'selected' : ''}>Kapten Sani Roslan (Pemandu Kanan B2B)</option>
            </select>
          </div>

          <!-- Package included staff requirement -->
          <div style="background: #F1F5F9; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 0.72rem; color: #475569;">
            <b style="color: #1E293B;">Keperluan Krew Pakej:</b> ${pkg.includedStaff && pkg.includedStaff.length > 0 ? pkg.includedStaff.join(', ') : 'Pemandu Sahaja'}
          </div>

          <div id="drawerAssignConflictMsg" style="display: none; background: #FEF2F2; color: #991B1B; font-size: 0.74rem; padding: 8px 10px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #FECACA;"></div>

          <button type="button" id="btnDrawerSaveAssignment" style="width: 100%; background: var(--amc-red); color: #fff; border: none; border-radius: 8px; padding: 10px; font-weight: 800; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 8px rgba(198,30,47,0.25);">
            <span>🚑</span> <span>${booking.plate_number ? 'Kemas Kini Agihan Armada' : 'Sahkan &amp; Agih Misi Sekarang'}</span>
          </button>
        </div>

        <!-- Mission Progression Tracker & Controls -->
        <div class="drawer-section-card">
          <div class="drawer-card-header">
            <h4 class="drawer-card-title">
              <span>🧭</span> <span>Fasa Kemajuan Misi Ambulans</span>
            </h4>
            <span style="font-size:0.7rem; color:#64748B; font-weight:700;">Status Operasi</span>
          </div>

          <div class="mission-progress-stepper">
            <div class="mission-step-item ${missionStep >= 1 ? 'completed' : (missionStep === 0 ? 'active' : '')}">
              <div class="mission-step-dot"></div>
              <div>
                <div class="mission-step-text-title">1. Dihantar &amp; Disemak HQ</div>
                <div class="mission-step-text-sub">${formatTimestamp(booking.created_at)}</div>
              </div>
            </div>

            <div class="mission-step-item ${missionStep >= 2 ? 'completed' : (missionStep === 1 ? 'active' : '')}">
              <div class="mission-step-dot"></div>
              <div>
                <div class="mission-step-text-title">2. Kelulusan &amp; Agihan Armada</div>
                <div class="mission-step-text-sub">${booking.plate_number ? `${booking.plate_number} · ${booking.driver_name}` : 'Menunggu agihan'}</div>
              </div>
            </div>

            <div class="mission-step-item ${missionStep >= 3 ? 'completed' : (missionStep === 2 ? 'active' : '')}">
              <div class="mission-step-dot"></div>
              <div>
                <div class="mission-step-text-title">3. Menuju Pengambilan Pesakit</div>
                <div class="mission-step-text-sub">Ambulans bertolak dari pangkalan</div>
              </div>
            </div>

            <div class="mission-step-item ${missionStep >= 4 ? 'completed' : (missionStep === 3 ? 'active' : '')}">
              <div class="mission-step-dot"></div>
              <div>
                <div class="mission-step-text-title">4. Tiba di Lokasi Pesakit</div>
                <div class="mission-step-text-sub">Penstabilan &amp; pemindahan pesakit</div>
              </div>
            </div>

            <div class="mission-step-item ${missionStep >= 5 ? 'completed' : (missionStep === 4 ? 'active' : '')}">
              <div class="mission-step-dot"></div>
              <div>
                <div class="mission-step-text-title">5. Menuju Pusat Perubatan Tujuan</div>
                <div class="mission-step-text-sub">Perjalanan kecemasan / pengiring</div>
              </div>
            </div>

            <div class="mission-step-item ${missionStep >= 6 ? 'completed' : (missionStep === 5 ? 'active' : '')}">
              <div class="mission-step-dot"></div>
              <div>
                <div class="mission-step-text-title">6. Misi Selesai &amp; Diserah Selamat</div>
                <div class="mission-step-text-sub">${booking.completed_at ? formatTimestamp(booking.completed_at) : 'Penyerahan di wad/kecemasan'}</div>
              </div>
            </div>
          </div>

          <!-- Operational Transition Button for Active Trips -->
          ${booking.plate_number && !isCompleted ? `
            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #E2E8F0;">
              ${currentTripStatus === 'not_started' ? `
                <button type="button" id="btnAdminStepProgress" data-next-status="en_route_pickup" style="width:100%; background:#0284C7; color:#fff; border:none; border-radius:8px; padding:10px; font-weight:800; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                  <span>▶</span> <span>Mula Misi (Menuju Pengambilan)</span>
                </button>
              ` : (currentTripStatus === 'en_route_pickup' ? `
                <button type="button" id="btnAdminStepProgress" data-next-status="arrived_pickup" style="width:100%; background:#D97706; color:#fff; border:none; border-radius:8px; padding:10px; font-weight:800; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                  <span>📍</span> <span>Sahkan Tiba di Lokasi Pesakit</span>
                </button>
              ` : (currentTripStatus === 'arrived_pickup' ? `
                <button type="button" id="btnAdminStepProgress" data-next-status="en_route_destination" style="width:100%; background:#0D9488; color:#fff; border:none; border-radius:8px; padding:10px; font-weight:800; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                  <span>🚑</span> <span>Bertolak ke Hospital Tujuan</span>
                </button>
              ` : (currentTripStatus === 'en_route_destination' ? `
                <button type="button" id="btnAdminStepProgress" data-next-status="completed" style="width:100%; background:#10B981; color:#fff; border:none; border-radius:8px; padding:10px; font-weight:800; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                  <span>🏁</span> <span>Sahkan Misi Selesai</span>
                </button>
              ` : '')))}
            </div>
          ` : ''}

        </div>

      </div>

      <!-- ================= TAB 2: LALUAN & PESAKIT ================= -->
      <div id="drawerTabPanelLaluan" style="display: ${currentDrawerTab === 'laluan' ? 'block' : 'none'};">
        
        <!-- Patient Information Card -->
        <div class="drawer-section-card">
          <div class="drawer-card-header">
            <h4 class="drawer-card-title">
              <span>👤</span> <span>Maklumat Pesakit &amp; Waris</span>
            </h4>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.78rem;">
            <div>
              <span style="font-size: 0.7rem; font-weight: 700; color: #64748B;">NAMA PESAKIT</span>
              <div style="font-weight: 800; font-size: 0.95rem; color: #0F172A;">${escapeHtml(booking.patient_name || 'Pesakit AMC')}</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px;">
              <div>
                <span style="font-size: 0.7rem; font-weight: 700; color: #64748B;">NO. TELEFON</span>
                <div style="font-weight: 700; color: #0F172A;">${escapeHtml(booking.patient_phone || '—')}</div>
              </div>
              <div>
                <span style="font-size: 0.7rem; font-weight: 700; color: #64748B;">EMEL</span>
                <div style="font-weight: 600; color: #475569;">${escapeHtml(booking.patient_email || '—')}</div>
              </div>
            </div>

            ${booking.patient_notes ? `
              <div style="margin-top: 6px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 10px;">
                <b style="color: #92400E; display: block; font-size: 0.72rem; margin-bottom: 2px;">NOTA KESIHATAN / PESAKIT:</b>
                <span style="color: #78350F; font-size: 0.76rem;">${escapeHtml(booking.patient_notes)}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Full Route Card -->
        <div class="drawer-section-card">
          <div class="drawer-card-header">
            <h4 class="drawer-card-title">
              <span>🗺️</span> <span>Laluan Pengambilan &amp; Destinasi</span>
            </h4>
            <span style="font-weight: 800; color: #059669; font-size: 0.78rem;">${Number(booking.distance_km || 25).toFixed(1)} km</span>
          </div>

          <div class="route-timeline-box">
            <!-- Origin -->
            <div class="route-stop-point">
              <div class="route-stop-badge origin">A</div>
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 0.68rem; font-weight: 800; color: #059669; text-transform: uppercase;">Pengambilan</span>
                  ${booking.pickup_category ? `<span style="font-size: 0.65rem; background: #E2E8F0; color: #334155; font-weight: 700; padding: 1px 6px; border-radius: 4px;">${escapeHtml(booking.pickup_category)}</span>` : ''}
                </div>
                <div style="font-size: 0.82rem; font-weight: 700; color: #0F172A; margin-top: 2px;">
                  ${escapeHtml(originName)}
                </div>
                ${booking.pickup_instructions ? `
                  <div style="font-size: 0.72rem; color: #047857; margin-top: 3px; background: #ECFDF5; padding: 4px 8px; border-radius: 6px;">
                    📝 Panduan Masuk: ${escapeHtml(booking.pickup_instructions)}
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Destination -->
            <div class="route-stop-point">
              <div class="route-stop-badge dest">D</div>
              <div>
                <span style="font-size: 0.68rem; font-weight: 800; color: #DC2626; text-transform: uppercase;">Pusat Perubatan Tujuan</span>
                <div style="font-size: 0.82rem; font-weight: 700; color: #0F172A; margin-top: 2px;">
                  ${escapeHtml(destName)}
                </div>
              </div>
            </div>
          </div>

          <div style="margin-top: 12px;">
            <a href="${mapsDirUrl}" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: center; gap: 6px; background: #EFF6FF; color: #1D4ED8; border: 1.5px solid #BFDBFE; border-radius: 8px; padding: 8px; text-decoration: none; font-size: 0.78rem; font-weight: 800;">
              <span>🗺️</span> <span>Navigasi Laluan Penuh di Google Maps</span>
            </a>
          </div>
        </div>

      </div>

      <!-- ================= TAB 3: PAKEJ & INVOIS ================= -->
      <div id="drawerTabPanelInvois" style="display: ${currentDrawerTab === 'invois' ? 'block' : 'none'};">
        
        <!-- Service Package Summary -->
        <div class="drawer-section-card">
          <div class="drawer-card-header">
            <h4 class="drawer-card-title">
              <span>📦</span> <span>Pakej &amp; Spesifikasi Klinikal</span>
            </h4>
            <span style="font-weight: 800; color: var(--amc-red); font-size: 0.85rem;">RM ${Number(pkg.baseFare || 250).toFixed(2)}</span>
          </div>

          <div style="font-size: 0.78rem;">
            <strong style="color: #0F172A; font-size: 0.9rem;">${escapeHtml(pkg.name)}</strong>
            <p style="font-size: 0.72rem; color: #64748B; margin: 4px 0 10px;">
              ${escapeHtml(pkg.exampleCases || 'Perkhidmatan ambulan profesional AMC.')}
            </p>

            <div style="margin-bottom: 10px;">
              <span style="font-size: 0.7rem; font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">ALATAN TERMASUK:</span>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${(pkg.includedEquipment && pkg.includedEquipment.length > 0)
                  ? pkg.includedEquipment.map(e => `<span style="background: #F1F5F9; border: 1px solid #CBD5E1; color: #334155; font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 4px;">✓ ${escapeHtml(e)}</span>`).join('')
                  : '<span style="color: #94A3B8; font-size: 0.72rem;">Tiada alatan tambahan</span>'}
              </div>
            </div>

            <div>
              <span style="font-size: 0.7rem; font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">PERANAN STAF TERMASUK:</span>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${(pkg.includedStaff && pkg.includedStaff.length > 0)
                  ? pkg.includedStaff.map(s => `<span style="background: #ECFDF5; border: 1px solid #A7F3D0; color: #065F46; font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 4px;">👤 ${escapeHtml(s)}</span>`).join('')
                  : '<span style="background: #F1F5F9; border: 1px solid #CBD5E1; color: #334155; font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 4px;">👤 Pemandu Bertugas Sahaja</span>'}
              </div>
            </div>
          </div>
        </div>

        <!-- Invoicing & Pricing Breakdown Card -->
        <div class="drawer-section-card">
          <div class="drawer-card-header">
            <h4 class="drawer-card-title">
              <span>🧾</span> <span>Pecahan Caj Invois</span>
            </h4>
            <span style="font-size: 0.72rem; color: #64748B;">No: <b>${escapeHtml(inv)}</b></span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.78rem;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #475569;">Kadar Asas Pakej:</span>
              <span style="font-weight: 700;">RM ${Number(booking.base_fare || pkg.baseFare || 250).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #475569;">Caj Lebihan Jarak (${Number(booking.distance_km || 25).toFixed(1)} km):</span>
              <span style="font-weight: 700;">RM ${Number(booking.extra_km_cost || 0).toFixed(2)}</span>
            </div>
            ${booking.equipment_cost ? `
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #475569;">Caj Alatan Khas:</span>
                <span style="font-weight: 700;">RM ${Number(booking.equipment_cost).toFixed(2)}</span>
              </div>
            ` : ''}

            <div style="display: flex; justify-content: space-between; border-top: 1.5px solid #E2E8F0; padding-top: 8px; margin-top: 4px; font-size: 0.95rem;">
              <span style="font-weight: 800; color: #0F172A;">Jumlah Perlu Dibayar:</span>
              <span style="font-weight: 900; color: var(--amc-red); font-size: 1.15rem;">RM ${amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Payment Status & Action Card -->
        <div class="drawer-section-card" style="background: ${(booking.payment_status || 'unpaid').toLowerCase() === 'paid' ? '#F0FDF4' : '#FFFDF7'};">
          <div class="drawer-card-header">
            <h4 class="drawer-card-title">
              <span>💵</span> <span>Status Pembayaran</span>
            </h4>
            ${(booking.payment_status || 'unpaid').toLowerCase() === 'paid' ? `
              <span class="badge-status-pill green">✓ Telah Dibayar</span>
            ` : `
              <span class="badge-status-pill grey">Belum Dibayar</span>
            `}
          </div>

          <div style="font-size: 0.76rem; color: #475569; margin-bottom: 10px;">
            Kaedah Dipilih: <b style="color: #0F172A;">${booking.payment_method === 'chip' ? 'Gerbang Pembayaran CHIP (Online)' : 'Bayaran Tunai Semasa Ketibaan'}</b>
          </div>

          ${(booking.payment_status || 'unpaid').toLowerCase() !== 'paid' ? `
            <button type="button" id="btnDrawerMarkPaidCash" style="width: 100%; background: #059669; color: #FFFFFF; border: none; border-radius: 8px; padding: 9px; font-weight: 800; font-size: 0.78rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(5,150,105,0.2);">
              <span>💵</span> <span>Tanda Telah Bayar (Terima Tunai)</span>
            </button>
          ` : `
            <div style="font-size: 0.72rem; color: #047857; font-weight: 700; display: flex; align-items: center; gap: 4px;">
              <span>✓</span> Bayaran telah diterima dan direkodkan dengan selamat.
            </div>
          `}
        </div>

      </div>

      <!-- ================= TAB 4: LOG AUDIT ================= -->
      <div id="drawerTabPanelAudit" style="display: ${currentDrawerTab === 'audit' ? 'block' : 'none'};">
        <div class="drawer-section-card">
          <div class="drawer-card-header">
            <h4 class="drawer-card-title">
              <span>📜</span> <span>Garis Masa &amp; Log Perubahan</span>
            </h4>
            <span style="font-size: 0.7rem; color: #64748B;">Versi: <b>v${booking.version || 1}</b></span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 480px; overflow-y: auto;">
            ${(booking.audit_trail && booking.audit_trail.length > 0) ? booking.audit_trail.map(a => `
              <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px; font-size: 0.74rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                  <strong style="color: #0F172A;">${escapeHtml(a.action || 'UPDATE')}</strong>
                  <span style="color: #94A3B8; font-size: 0.68rem;">${formatTimestamp(a.timestamp)}</span>
                </div>
                <div style="color: #475569;">Pegawai: <b>${escapeHtml(a.actor || 'Sistem')}</b></div>
                ${a.reason ? `<div style="color: #DC2626; margin-top: 3px;">Sebab: "${escapeHtml(a.reason)}"</div>` : ''}
                ${a.notes ? `<div style="color: #64748B; margin-top: 3px;">Catatan: ${escapeHtml(a.notes)}</div>` : ''}
              </div>
            `).join('') : `
              <div style="text-align: center; padding: 24px; color: #94A3B8; font-size: 0.78rem;">
                Tiada rekod perubahan tambahan.
              </div>
            `}
          </div>
        </div>
      </div>

    </div>
  `;

  // Attach tab switching listeners inside drawer
  container.querySelectorAll('.drawer-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.targetTab;
      currentDrawerTab = target;
      container.querySelectorAll('.drawer-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.getElementById('drawerTabPanelTindakan').style.display = target === 'tindakan' ? 'block' : 'none';
      document.getElementById('drawerTabPanelLaluan').style.display = target === 'laluan' ? 'block' : 'none';
      document.getElementById('drawerTabPanelInvois').style.display = target === 'invois' ? 'block' : 'none';
      document.getElementById('drawerTabPanelAudit').style.display = target === 'audit' ? 'block' : 'none';
    });
  });

  // Attach Copy Ref listener
  const btnCopy = document.getElementById('btnDrawerCopyRef');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      navigator.clipboard?.writeText(inv);
      const label = document.getElementById('copyRefLabel');
      if (label) {
        label.textContent = 'Disalin!';
        setTimeout(() => { label.textContent = 'Salin'; }, 1500);
      }
    });
  }

  // Attach Close Button listener
  const closeBtn = document.getElementById('closeBookingDrawerBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeBookingDetailDrawer);
  }

  // Attach drawer action listeners
  const btnApprove = document.getElementById('btnDrawerApprove');
  if (btnApprove) {
    btnApprove.addEventListener('click', async () => {
      btnApprove.disabled = true;
      btnApprove.innerHTML = '<span>⏳ Mengesahkan...</span>';
      const res = await approveBookingRequest({
        booking,
        adminUser: activeAdminUser,
        expectedVersion: booking.version
      });
      if (res.success) {
        handleUpdatedBooking(res.data);
      } else {
        alert(res.error || 'Gagal meluluskan tempahan.');
        btnApprove.disabled = false;
        btnApprove.innerHTML = '<span>✓</span> <span>Luluskan Tempahan</span>';
      }
    });
  }

  const btnReject = document.getElementById('btnDrawerReject');
  if (btnReject) {
    btnReject.addEventListener('click', async () => {
      const reason = prompt('Sila nyatakan sebab penolakan permohonan tempahan:');
      if (reason === null) return;
      if (!reason.trim()) {
        alert('Sebab penolakan adalah wajib diisi.');
        return;
      }
      btnReject.disabled = true;
      btnReject.innerHTML = '<span>⏳ Menolak...</span>';
      const res = await rejectBookingRequest({
        booking,
        reason: reason.trim(),
        adminUser: activeAdminUser,
        expectedVersion: booking.version
      });
      if (res.success) {
        handleUpdatedBooking(res.data);
      } else {
        alert(res.error || 'Gagal menolak tempahan.');
        btnReject.disabled = false;
        btnReject.innerHTML = '<span>✕</span> <span>Tolak Tempahan</span>';
      }
    });
  }

  const btnSaveAssignment = document.getElementById('btnDrawerSaveAssignment');
  if (btnSaveAssignment) {
    btnSaveAssignment.addEventListener('click', async () => {
      const vehicleSelect = document.getElementById('drawerAssignVehicleSelect');
      const driverSelect = document.getElementById('drawerAssignDriverSelect');
      const providerSelect = document.getElementById('drawerAssignProviderSelect');
      const conflictMsg = document.getElementById('drawerAssignConflictMsg');

      const plate = vehicleSelect?.value;
      const driverName = driverSelect?.value;
      const provType = providerSelect?.value;

      const providerObj = provType === 'internal'
        ? { id: null, name: 'Al-Farhain AMC' }
        : { id: 'prov_med', name: 'MediCorp Ambulance' };

      btnSaveAssignment.disabled = true;
      btnSaveAssignment.innerHTML = '<span>⏳ Memeriksa konflik sumber...</span>';

      const res = await assignBookingResources({
        booking,
        provider: providerObj,
        vehicle: { plateNumber: plate },
        driver: { name: driverName, phone: '013-914 7606' },
        crew: pkg.includedStaff || [],
        reassignmentReason: booking.plate_number ? 'Penugasan semula oleh HQ' : 'Agihan sumber permulaan',
        adminUser: activeAdminUser,
        allBookings: currentBookings
      });

      if (res.success) {
        if (conflictMsg) conflictMsg.style.display = 'none';
        handleUpdatedBooking(res.data);
      } else {
        if (conflictMsg) {
          conflictMsg.textContent = res.error;
          conflictMsg.style.display = 'block';
        } else {
          alert(res.error);
        }
        btnSaveAssignment.disabled = false;
        btnSaveAssignment.innerHTML = '<span>🚑</span> <span>Sahkan &amp; Agih Misi Sekarang</span>';
      }
    });
  }

  // Mission step progression button
  const btnStepProgress = document.getElementById('btnAdminStepProgress');
  if (btnStepProgress) {
    btnStepProgress.addEventListener('click', async () => {
      const nextStatus = btnStepProgress.dataset.nextStatus;
      if (!nextStatus) return;

      btnStepProgress.disabled = true;
      btnStepProgress.innerHTML = '<span>⏳ Mengemas kini fasa...</span>';

      const res = await updateTripProgress({
        booking,
        nextTripStatus: nextStatus,
        actor: { name: activeAdminUser.name, role: 'admin' },
        notes: `Fasa perjalanan dikemas kini oleh ${activeAdminUser.name}`
      });

      if (res.success) {
        handleUpdatedBooking(res.data);
      } else {
        alert(res.error || 'Gagal mengemas kini status perjalanan.');
        btnStepProgress.disabled = false;
      }
    });
  }

  // Mark Cash Paid listener
  const btnMarkPaidCash = document.getElementById('btnDrawerMarkPaidCash');
  if (btnMarkPaidCash) {
    btnMarkPaidCash.addEventListener('click', async () => {
      const conf = confirm(`Adakah anda pasti ingin menandakan tempahan ${inv} sebagai TELAH BAYAR (Tunai)?`);
      if (!conf) return;

      const updated = {
        ...booking,
        payment_status: 'paid',
        payment_method: 'cash',
        paid_amount: Number(booking.total_fare || booking.totalFare || 250.00),
        version: Number(booking.version || 1) + 1,
        updated_at: new Date().toISOString(),
        audit_trail: [
          ...(booking.audit_trail || []),
          {
            action: 'PAYMENT_RECEIVED_CASH',
            actor: activeAdminUser.name,
            timestamp: new Date().toISOString(),
            amount: Number(booking.total_fare || booking.totalFare || 250.00),
            notes: 'Bayaran tunai disahkan diterima oleh HQ.'
          }
        ]
      };
      saveLocalBookingCache(updated);
      broadcastSyncEvent('UPDATE_BOOKING', updated);
      handleUpdatedBooking(updated);
    });
  }

  const btnAcceptCancel = document.getElementById('btnAdminAcceptCancel');
  if (btnAcceptCancel) {
    btnAcceptCancel.addEventListener('click', async () => {
      const conf = confirm(`Adakah anda pasti ingin membatalkan tempahan ${inv} mengikut permohonan pelanggan?`);
      if (!conf) return;
      const res = await rejectBookingRequest({
        booking,
        reason: `Dibatalkan atas permohonan pelanggan: ${booking.cancellation_request_reason || ''}`,
        adminUser: activeAdminUser
      });
      if (res.success) {
        res.data.booking_status = 'cancelled';
        res.data.status = 'Dibatalkan';
        handleUpdatedBooking(res.data);
      }
    });
  }

  const btnAcceptResched = document.getElementById('btnAdminAcceptReschedule');
  if (btnAcceptResched) {
    btnAcceptResched.addEventListener('click', async () => {
      const conf = confirm(`Luluskan anjakan masa ke ${formatTimestamp(booking.reschedule_request_time)}?`);
      if (!conf) return;
      const updated = {
        ...booking,
        scheduled_time: booking.reschedule_request_time,
        reschedule_requested: false,
        version: Number(booking.version || 1) + 1,
        audit_trail: [
          ...(booking.audit_trail || []),
          {
            action: 'RESCHEDULE_APPROVED',
            actor: activeAdminUser.name,
            timestamp: new Date().toISOString(),
            newScheduledTime: booking.reschedule_request_time
          }
        ]
      };
      saveLocalBookingCache(updated);
      broadcastSyncEvent('UPDATE_BOOKING', updated);
      handleUpdatedBooking(updated);
    });
  }
}

/**
 * Opens modal for counter / phone manual bookings
 */
function openManualBookingModal(showToast, playSuccessChime) {
  let modal = document.getElementById('manualAdminBookingModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'manualAdminBookingModal';
    modal.className = 'admin-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="admin-modal-box" style="max-width: 540px; background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #E2E8F0; padding-bottom: 10px; margin-bottom: 14px;">
        <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--amc-red); margin: 0;">➕ Tempahan Manual (Kaunter / Panggilan Telefon)</h3>
        <button type="button" id="closeManualBookingModalBtn" style="background: none; border: none; font-size: 1.25rem; font-weight: 700; cursor: pointer; color: #64748B;">&times;</button>
      </div>

      <form id="manualBookingForm" style="display: flex; flex-direction: column; gap: 10px; font-size: 0.8rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-weight: 700; font-size: 0.72rem;">* Nama Pesakit</label>
            <input type="text" id="mbPatientName" required class="search-bar-box" style="width: 100%; margin-top: 2px;" placeholder="Cth: Siti Aminah">
          </div>
          <div>
            <label style="font-weight: 700; font-size: 0.72rem;">* No. Telefon</label>
            <input type="tel" id="mbPatientPhone" required class="search-bar-box" style="width: 100%; margin-top: 2px;" placeholder="01X-XXXXXXX" value="013-9147606">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-weight: 700; font-size: 0.72rem;">Cawangan Berlepas</label>
            <select id="mbHubSelect" class="search-bar-box" style="width: 100%; margin-top: 2px;">
              <option value="kok_lanas">Kok Lanas HQ</option>
              <option value="raub">Cawangan Raub</option>
              <option value="machang">Machang</option>
              <option value="jeli">Jeli</option>
            </select>
          </div>
          <div>
            <label style="font-weight: 700; font-size: 0.72rem;">Pakej Perkhidmatan</label>
            <select id="mbPackageSelect" class="search-bar-box" style="width: 100%; margin-top: 2px;">
              <option value="pkg_kecemasan_standard">Kecemasan Standard (RM250)</option>
              <option value="pkg_bukan_kecemasan">Bukan Kecemasan (RM250)</option>
              <option value="pkg_kecemasan_inhouse">Kecemasan In-House (RM350)</option>
              <option value="pkg_kritikal_aed">Kecemasan Kritikal + AED (RM500)</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-weight: 700; font-size: 0.72rem;">* Lokasi Pengambilan</label>
          <input type="text" id="mbOriginInput" required class="search-bar-box" style="width: 100%; margin-top: 2px;" placeholder="Alamat atau kawasan pengambilan" value="Bandar Kota Bharu">
        </div>

        <div>
          <label style="font-weight: 700; font-size: 0.72rem;">* Pusat Perubatan Destinasi</label>
          <input type="text" id="mbDestInput" required class="search-bar-box" style="width: 100%; margin-top: 2px;" placeholder="Hospital atau klinik destinasi" value="Hospital Raja Perempuan Zainab II">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-weight: 700; font-size: 0.72rem;">Jarak Anggaran (KM)</label>
            <input type="number" id="mbDistanceInput" class="search-bar-box" style="width: 100%; margin-top: 2px;" value="26.3" step="0.1" min="1">
          </div>
          <div>
            <label style="font-weight: 700; font-size: 0.72rem;">Kaedah Bayaran</label>
            <select id="mbPaymentMethod" class="search-bar-box" style="width: 100%; margin-top: 2px;">
              <option value="cash" selected>Tunai Semasa Ketibaan</option>
              <option value="chip">Gerbang CHIP (Pautan Bayaran)</option>
            </select>
          </div>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; border-top: 1px solid #E2E8F0; padding-top: 12px;">
          <button type="button" id="btnCancelManualBooking" style="background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 8px; padding: 8px 14px; font-weight: 700; cursor: pointer;">
            Batal
          </button>
          <button type="submit" style="background: var(--amc-red); color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-weight: 700; cursor: pointer;">
            ✓ Cipta Tempahan
          </button>
        </div>
      </form>
    </div>
  `;

  modal.style.display = 'flex';

  document.getElementById('closeManualBookingModalBtn')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  document.getElementById('btnCancelManualBooking')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  document.getElementById('manualBookingForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('mbPatientName')?.value.trim();
    const phone = document.getElementById('mbPatientPhone')?.value.trim();
    const hubId = document.getElementById('mbHubSelect')?.value;
    const pkgId = document.getElementById('mbPackageSelect')?.value;
    const origin = document.getElementById('mbOriginInput')?.value.trim();
    const dest = document.getElementById('mbDestInput')?.value.trim();
    const dist = parseFloat(document.getElementById('mbDistanceInput')?.value || 25);
    const payMethod = document.getElementById('mbPaymentMethod')?.value;

    const pkg = getServicePackageById(pkgId) || SERVICE_PACKAGES[0];
    const fare = calculateTransportFare(dist, { baseFare: pkg.baseFare || 250 });

    const newBookingData = {
      patientName: name,
      patientPhone: phone,
      hubId,
      packageId: pkg.id,
      packageSnapshot: pkg,
      originName: origin,
      destinationName: dest,
      distanceKm: dist,
      extraKmCost: fare.extraDistanceFee || 0,
      totalFare: (pkg.baseFare || 250) + (fare.extraDistanceFee || 0),
      pickupCoords: [6.1256, 102.2482],
      paymentMethod: payMethod,
      created_by_admin: activeAdminUser.name
    };

    const res = await createPatientBooking(newBookingData, currentBookings);
    if (res.success) {
      modal.style.display = 'none';
      handleIncomingBooking(res.data, showToast);
      if (playSuccessChime) playSuccessChime();
    } else {
      alert(res.error || 'Gagal mencipta tempahan manual.');
    }
  });
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return `${d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return String(ts);
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getInitialSeedBookings() {
  return [
    {
      invoice_number: 'AMC-1043',
      hub_id: 'kok_lanas',
      hub_name: 'HQ Kok Lanas',
      origin_name: 'Bandar Kota Bharu',
      destination_name: 'Hospital Raja Perempuan Zainab II',
      distance_km: 26.3,
      trip_type: 'Kecemasan Standard',
      base_fare: 250.00,
      extra_km_cost: 3.90,
      total_fare: 253.90,
      booking_status: 'approved',
      assignment_status: 'assigned',
      trip_status: 'en_route_destination',
      status: 'Menuju lokasi',
      plate_number: 'VPQ 7606',
      driver_name: 'Abe Di / Syalihan',
      contact_phone: '013-914 7606',
      patient_name: 'Pak Daud bin Seman',
      patient_phone: '019-988 7766',
      patient_email: 'daud.seman@gmail.com',
      payment_status: 'unpaid',
      payment_method: 'cash',
      version: 2,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 1800000).toISOString()
    },
    {
      invoice_number: 'AMC-1042',
      hub_id: 'raub',
      hub_name: 'Cawangan Raub',
      origin_name: 'Taman Raub Jaya',
      destination_name: 'Hospital Kuala Lipis',
      distance_km: 58.0,
      trip_type: 'Bukan Kecemasan',
      base_fare: 250.00,
      extra_km_cost: 99.00,
      total_fare: 349.00,
      booking_status: 'approved',
      assignment_status: 'assigned',
      trip_status: 'completed',
      status: 'Selesai',
      plate_number: 'DFG 7606',
      driver_name: 'Abe Din Estimos Sukrosa',
      contact_phone: '013-914 7606',
      patient_name: 'Puan Halimah binti Kassim',
      patient_phone: '012-345 6789',
      payment_status: 'paid',
      payment_method: 'chip',
      completed_at: new Date(Date.now() - 7200000).toISOString(),
      version: 3,
      created_at: new Date(Date.now() - 14400000).toISOString(),
      updated_at: new Date(Date.now() - 7200000).toISOString()
    },
    {
      invoice_number: 'AMC-1044',
      hub_id: 'kok_lanas',
      hub_name: 'HQ Kok Lanas',
      origin_name: 'Kubang Kerian',
      destination_name: 'Hospital Universiti Sains Malaysia (HUSM)',
      distance_km: 12.0,
      trip_type: 'Kecemasan In-House',
      base_fare: 350.00,
      extra_km_cost: 0.00,
      total_fare: 350.00,
      booking_status: 'pending_approval',
      assignment_status: 'unassigned',
      trip_status: 'not_started',
      status: 'Menunggu kelulusan',
      plate_number: '',
      driver_name: '',
      contact_phone: '013-914 7606',
      patient_name: 'Haji Ibrahim bin Ahmad',
      patient_phone: '017-889 9001',
      patient_email: 'ibrahim.ahmad@gmail.com',
      payment_status: 'unpaid',
      payment_method: 'cash',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];
}

