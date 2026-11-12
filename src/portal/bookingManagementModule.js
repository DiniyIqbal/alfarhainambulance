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

  // Branch filter
  const branchFilter = document.getElementById('bookingBranchFilter');
  if (branchFilter) {
    branchFilter.addEventListener('change', (e) => {
      currentFilters.branch = e.target.value;
      renderBookingDashboard();
    });
  }

  // Status filter
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

  // KPI card clicks (Quick filter)
  const kpiPending = document.getElementById('kpiCardPending');
  if (kpiPending) {
    kpiPending.addEventListener('click', () => {
      setQuickFilter('menunggu_kelulusan');
    });
  }
  const kpiApproved = document.getElementById('kpiCardApproved');
  if (kpiApproved) {
    kpiApproved.addEventListener('click', () => {
      setQuickFilter('menunggu_agihan');
    });
  }
  const kpiOngoing = document.getElementById('kpiCardOngoing');
  if (kpiOngoing) {
    kpiOngoing.addEventListener('click', () => {
      setQuickFilter('menuju_pengambilan');
    });
  }
  const kpiCompleted = document.getElementById('kpiCardCompletedToday');
  if (kpiCompleted) {
    kpiCompleted.addEventListener('click', () => {
      setQuickFilter('selesai');
    });
  }

  // Close Drawer
  const closeDrawerBtn = document.getElementById('closeBookingDrawerBtn');
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      const drawer = document.getElementById('bookingDetailDrawer');
      if (drawer) drawer.style.display = 'none';
      currentSelectedBookingId = null;
    });
  }

  // New Manual Booking Button
  const btnNewManualBooking = document.getElementById('btnOpenManualBookingModal');
  if (btnNewManualBooking) {
    btnNewManualBooking.addEventListener('click', () => {
      openManualBookingModal(showToast, playSuccessChime);
    });
  }
}

function setQuickFilter(statusKey) {
  const statusFilter = document.getElementById('bookingStatusFilter');
  if (statusFilter) {
    statusFilter.value = statusKey;
  }
  currentFilters.bookingStatus = statusKey;
  renderBookingsTable();
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
 * Renders the bookings table with all 8 specified columns.
 */
function renderBookingsTable() {
  const tbody = document.getElementById('bookingsTableBody');
  if (!tbody) return;

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
        <td colspan="8" style="text-align: center; padding: 36px 16px; color: #64748B;">
          <div style="font-size: 2rem; margin-bottom: 8px;">📋</div>
          <strong style="color: #0F172A; display: block; font-size: 0.95rem;">Tiada rekod tempahan ditemui</strong>
          <span style="font-size: 0.8rem;">Cuba ubah kriteria carian atau penapis status di atas.</span>
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
    let schedDisplay = '⚡ Secepat mungkin';
    if (isSched && schedTime) {
      try {
        const d = new Date(schedTime);
        schedDisplay = `📅 ${d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}`;
      } catch (e) {
        schedDisplay = '📅 Dijadualkan';
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
        : `<span class="badge-status-pill slate">Belum Bayar</span>`);

    // Assigned resources
    const plate = b.plate_number || b.plateNumber;
    const driver = b.driver_name || b.driverName;
    const provider = b.assigned_provider_name || b.assignedProviderName || 'Al-Farhain AMC';
    let resourceDisplay = `<span style="color: #94A3B8; font-size: 0.75rem; font-style: italic;">Belum diagih</span>`;
    if (plate && driver) {
      resourceDisplay = `
        <div style="font-size: 0.78rem; font-weight: 700; color: #0F172A;">🚑 ${escapeHtml(plate)}</div>
        <div style="font-size: 0.72rem; color: #475569;">👨‍✈️ ${escapeHtml(driver)}</div>
        <div style="font-size: 0.65rem; color: #059669; font-weight: 600;">${escapeHtml(provider)}</div>
      `;
    }

    // Amount
    const amount = Number(b.total_fare || b.totalFare || 250.00);

    return `
      <tr class="${isSelected ? 'selected-row' : ''}" data-inv="${escapeHtml(inv)}" style="cursor: pointer;">
        <td>
          <strong style="color: var(--amc-red); font-size: 0.85rem; display: block;">${escapeHtml(inv)}</strong>
          <span style="font-size: 0.75rem; font-weight: 700; color: #1E293B;">${escapeHtml(patientName)}</span>
          <span style="font-size: 0.68rem; color: #64748B; display: block;">📞 ${escapeHtml(patientPhone)}</span>
        </td>
        <td>
          <div style="font-size: 0.78rem; font-weight: 600; color: #0F172A;">${schedDisplay}</div>
          <span style="font-size: 0.68rem; color: #64748B;">Dihantar: ${formatTimestamp(b.created_at)}</span>
        </td>
        <td>
          <div style="font-size: 0.78rem; color: #0F172A; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(origin)}">
            <span style="color: #10B981; font-weight: 800;">A:</span> ${escapeHtml(origin)}
          </div>
          <div style="font-size: 0.78rem; color: #0F172A; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(dest)}">
            <span style="color: #EF4444; font-weight: 800;">D:</span> ${escapeHtml(dest)}
          </div>
          <span style="font-size: 0.68rem; color: #64748B;">${Number(b.distance_km || b.distanceKm || 25).toFixed(1)} km</span>
        </td>
        <td>
          <div style="font-size: 0.8rem; font-weight: 700; color: #0F172A;">${escapeHtml(pkgName)}</div>
          <span style="font-size: 0.72rem; color: #059669; font-weight: 700;">RM${amount.toFixed(2)}</span>
        </td>
        <td>
          <span class="badge-status-pill" style="background: ${custStatus.badgeBg}; color: ${custStatus.badgeColor}; border: 1px solid rgba(0,0,0,0.08); font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;">
            <span>${custStatus.icon}</span> <span>${custStatus.label}</span>
          </span>
          ${b.cancellation_requested ? `<span style="display:block; margin-top:3px; background:#FEE2E2; color:#991B1B; font-size:0.65rem; font-weight:800; padding:1px 5px; border-radius:4px;">⚠️ Mohon Batal</span>` : ''}
          ${b.reschedule_requested ? `<span style="display:block; margin-top:3px; background:#FEF3C7; color:#92400E; font-size:0.65rem; font-weight:800; padding:1px 5px; border-radius:4px;">⏳ Mohon Jadual</span>` : ''}
        </td>
        <td>
          ${payBadge}
        </td>
        <td>
          ${resourceDisplay}
        </td>
        <td>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button type="button" class="btn-table-action btn-open-drawer" data-inv="${escapeHtml(inv)}" style="background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 6px; padding: 4px 8px; font-size: 0.72rem; font-weight: 700; color: #0F172A; cursor: pointer;">
              Urus
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Row click listeners
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const inv = tr.dataset.inv;
      if (!inv) return;
      currentSelectedBookingId = inv;
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
      tr.classList.add('selected-row');
      const b = currentBookings.find(x => (x.invoice_number || x.invoiceNumber) === inv);
      if (b) renderBookingDetailDrawer(b);
    });
  });
}

/**
 * Renders the Right-hand Detail Drawer with interactive management tools
 */
export function renderBookingDetailDrawer(booking) {
  const drawer = document.getElementById('bookingDetailDrawer');
  if (!drawer) return;

  drawer.style.display = 'block';

  const inv = booking.invoice_number || booking.invoiceNumber;
  const custStatus = deriveCustomerStatus(booking);
  const isPending = custStatus.code === 'menunggu_kelulusan';
  const isApproved = custStatus.code === 'menunggu_agihan' || custStatus.code === 'dijadualkan';
  const isEnRoute = ['menuju_pengambilan', 'tiba_pengambilan', 'menuju_destinasi'].includes(custStatus.code);

  const container = document.getElementById('bookingDrawerContent');
  if (!container) return;

  const pkg = booking.package_snapshot || getServicePackageById(booking.package_id) || {
    name: booking.package_name || booking.trip_type || 'Kecemasan Standard',
    baseFare: booking.base_fare || 250.00,
    includedEquipment: [],
    includedStaff: []
  };

  const amount = Number(booking.total_fare || booking.totalFare || 250.00);

  container.innerHTML = `
    <!-- Header Ref & Status -->
    <div style="padding-bottom: 12px; border-bottom: 1px solid #E2E8F0; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <span style="font-size: 0.7rem; font-weight: 800; color: #64748B; text-transform: uppercase;">Rujukan Tempahan</span>
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--amc-red); margin: 2px 0 0;">${escapeHtml(inv)}</h3>
        </div>
        <span class="badge-status-pill" style="background: ${custStatus.badgeBg}; color: ${custStatus.badgeColor}; font-weight: 800; font-size: 0.75rem; padding: 4px 10px; border-radius: 999px;">
          ${custStatus.icon} ${custStatus.label}
        </span>
      </div>
      <div style="font-size: 0.72rem; color: #64748B; margin-top: 4px;">
        Versi rekod: v${booking.version || 1} · Dicipta: ${formatTimestamp(booking.created_at)}
      </div>
    </div>

    <!-- Customer Requests Alert (if cancellation or reschedule requested) -->
    ${booking.cancellation_requested ? `
      <div style="background: #FEF2F2; border: 1.5px solid #F87171; border-radius: 8px; padding: 10px; margin-bottom: 12px;">
        <strong style="color: #991B1B; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
          <span>⚠️</span> Pelanggan Memohon Pembatalan
        </strong>
        <p style="font-size: 0.72rem; color: #7F1D1D; margin: 4px 0 8px;">"${escapeHtml(booking.cancellation_request_reason || 'Tiada sebab')}"</p>
        <button type="button" class="btn-danger-sm" id="btnAdminAcceptCancel" style="background: #DC2626; color: #fff; border: none; border-radius: 6px; padding: 4px 10px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
          Sahkan &amp; Batalkan Tempahan
        </button>
      </div>
    ` : ''}

    ${booking.reschedule_requested ? `
      <div style="background: #FFFBEB; border: 1.5px solid #FCD34D; border-radius: 8px; padding: 10px; margin-bottom: 12px;">
        <strong style="color: #92400E; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
          <span>⏳</span> Pelanggan Memohon Jadual Semula
        </strong>
        <p style="font-size: 0.72rem; color: #78350F; margin: 4px 0 8px;">Masa baharu dipohon: <b>${formatTimestamp(booking.reschedule_request_time)}</b></p>
        <button type="button" class="btn-success-sm" id="btnAdminAcceptReschedule" style="background: #059669; color: #fff; border: none; border-radius: 6px; padding: 4px 10px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
          Luluskan Jadual Baharu
        </button>
      </div>
    ` : ''}

    <!-- Quick Approval / Rejection Actions (For Pending Bookings) -->
    ${isPending ? `
      <div style="background: #F8FAFC; border: 1.5px solid #CBD5E1; border-radius: 10px; padding: 12px; margin-bottom: 14px;">
        <div style="font-size: 0.75rem; font-weight: 800; color: #0F172A; margin-bottom: 6px;">KEPUTUSAN SEMAKAN HQ</div>
        <p style="font-size: 0.7rem; color: #64748B; margin-bottom: 10px;">
          Kelulusan menerima permohonan tempahan ke dalam jadual AFAMS. Agihan ambulans &amp; krew boleh dilakukan selepas ini.
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button type="button" id="btnDrawerApprove" style="background: #059669; color: #FFFFFF; border: none; border-radius: 8px; padding: 8px; font-weight: 700; font-size: 0.78rem; cursor: pointer;">
            ✓ Luluskan
          </button>
          <button type="button" id="btnDrawerReject" style="background: #DC2626; color: #FFFFFF; border: none; border-radius: 8px; padding: 8px; font-weight: 700; font-size: 0.78rem; cursor: pointer;">
            ✕ Tolak
          </button>
        </div>
      </div>
    ` : ''}

    <!-- Resource Assignment Section (Ambulance, Driver, Crew) -->
    <div style="background: #FFFFFF; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 12px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 0.75rem; font-weight: 800; color: #0F172A;">AGIHAN SUMBER OPERASI</span>
        ${booking.plate_number ? `<span style="font-size: 0.65rem; background: #ECFDF5; color: #047857; font-weight: 700; padding: 2px 6px; border-radius: 4px;">✓ Telah Diagih</span>` : `<span style="font-size: 0.65rem; background: #FEF3C7; color: #92400E; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Perlu Agihan</span>`}
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.78rem;">
        <div>
          <label style="font-size: 0.68rem; font-weight: 700; color: #64748B;">Penyedia Perkhidmatan</label>
          <select id="drawerAssignProviderSelect" style="width: 100%; padding: 6px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.75rem; font-weight: 600; margin-top: 2px;">
            <option value="internal" ${booking.assigned_provider_id ? '' : 'selected'}>Al-Farhain AMC (Armada Dalaman)</option>
            <option value="partner_medicorp">MediCorp Ambulance Services (Rakan B2B)</option>
            <option value="partner_pantai">ResQ Response Network (Rakan B2B)</option>
          </select>
        </div>

        <div>
          <label style="font-size: 0.68rem; font-weight: 700; color: #64748B;">Ambulans Bertugas</label>
          <select id="drawerAssignVehicleSelect" style="width: 100%; padding: 6px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.75rem; font-weight: 600; margin-top: 2px;">
            <option value="VPQ 7606" ${booking.plate_number === 'VPQ 7606' ? 'selected' : ''}>VPQ 7606 (Toyota Hiace AMC Kok Lanas - Aktif)</option>
            <option value="DFG 7606" ${booking.plate_number === 'DFG 7606' ? 'selected' : ''}>DFG 7606 (Toyota Hiace AMC Raub - Aktif)</option>
            <option value="VPP 9901" ${booking.plate_number === 'VPP 9901' ? 'selected' : ''}>VPP 9901 (Ambulans Simpanan Jeli)</option>
          </select>
        </div>

        <div>
          <label style="font-size: 0.68rem; font-weight: 700; color: #64748B;">Pemandu EMT Bertugas</label>
          <select id="drawerAssignDriverSelect" style="width: 100%; padding: 6px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 0.75rem; font-weight: 600; margin-top: 2px;">
            <option value="Abe Di / Syalihan" ${booking.driver_name === 'Abe Di / Syalihan' ? 'selected' : ''}>Abe Di / Syalihan (Kok Lanas - GDL/EMT Bertauliah)</option>
            <option value="Abe Din Estimos Sukrosa" ${booking.driver_name === 'Abe Din Estimos Sukrosa' ? 'selected' : ''}>Abe Din Estimos Sukrosa (Raub - EMT Bertauliah)</option>
            <option value="Kamarudin Ismail" ${booking.driver_name === 'Kamarudin Ismail' ? 'selected' : ''}>Kamarudin Ismail (EMT Pasir Mas)</option>
          </select>
        </div>

        <!-- Conflict Message Container -->
        <div id="drawerAssignConflictMsg" style="display: none; background: #FEF2F2; color: #991B1B; font-size: 0.72rem; padding: 6px 8px; border-radius: 6px;"></div>

        <button type="button" id="btnDrawerSaveAssignment" style="background: var(--amc-red); color: #fff; border: none; border-radius: 8px; padding: 7px; font-weight: 700; font-size: 0.78rem; cursor: pointer; margin-top: 4px;">
          ${booking.plate_number ? '🔄 Kemas Kini Agihan Sumber' : '🚑 Sahkan Agihan Sumber'}
        </button>
      </div>
    </div>

    <!-- Booking Details Summary -->
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px; margin-bottom: 14px; font-size: 0.78rem;">
      <div style="font-weight: 800; color: #0F172A; margin-bottom: 8px;">MAKLUMAT LALUAN &amp; PESAKIT</div>

      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div>
          <span style="font-size: 0.68rem; color: #64748B; font-weight: 700;">PESAKIT</span>
          <div style="font-weight: 700; color: #0F172A;">${escapeHtml(booking.patient_name || 'Pesakit AMC')}</div>
          <div style="font-size: 0.72rem; color: #475569;">📞 ${escapeHtml(booking.patient_phone || '—')} · ✉️ ${escapeHtml(booking.patient_email || '—')}</div>
        </div>

        <div style="margin-top: 4px;">
          <span style="font-size: 0.68rem; color: #64748B; font-weight: 700;">LOKASI PENGAMBILAN</span>
          <div style="font-weight: 600; color: #0F172A;">${escapeHtml(booking.origin_name || 'Pengambilan')}</div>
          ${booking.pickup_instructions ? `<div style="font-size: 0.7rem; color: #047857;">Nota masuk/wad: ${escapeHtml(booking.pickup_instructions)}</div>` : ''}
        </div>

        <div style="margin-top: 4px;">
          <span style="font-size: 0.68rem; color: #64748B; font-weight: 700;">PUSAT PERUBATAN TUJUAN</span>
          <div style="font-weight: 600; color: #0F172A;">${escapeHtml(booking.destination_name || 'Hospital')}</div>
        </div>

        <div style="margin-top: 4px; display: flex; justify-content: space-between; border-top: 1px dashed #CBD5E1; padding-top: 6px;">
          <span>Jumlah Jarak:</span>
          <b>${Number(booking.distance_km || 25).toFixed(1)} km</b>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Jumlah Keseluruhan:</span>
          <b style="color: var(--amc-red); font-size: 0.9rem;">RM${amount.toFixed(2)}</b>
        </div>
      </div>
    </div>

    <!-- Audit Trail -->
    <div style="font-size: 0.75rem;">
      <div style="font-weight: 800; color: #0F172A; margin-bottom: 6px;">LOG PERUBAHAN &amp; AUDIT</div>
      <div style="max-height: 140px; overflow-y: auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px;">
        ${(booking.audit_trail || []).map(a => `
          <div style="font-size: 0.68rem; border-bottom: 1px solid #F1F5F9; padding-bottom: 4px;">
            <div style="display: flex; justify-content: space-between; font-weight: 700; color: #334155;">
              <span>${escapeHtml(a.action || 'UPDATE')}</span>
              <span style="color: #94A3B8;">${formatTimestamp(a.timestamp)}</span>
            </div>
            <div style="color: #475569;">Oleh: ${escapeHtml(a.actor || 'Sistem')}</div>
            ${a.reason ? `<div style="color: #B91C1C;">Sebab: ${escapeHtml(a.reason)}</div>` : ''}
            ${a.notes ? `<div style="color: #64748B;">${escapeHtml(a.notes)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Attach drawer action listeners
  const btnApprove = document.getElementById('btnDrawerApprove');
  if (btnApprove) {
    btnApprove.addEventListener('click', async () => {
      btnApprove.disabled = true;
      btnApprove.textContent = '⏳ Mengesahkan...';
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
        btnApprove.textContent = '✓ Luluskan';
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
      btnReject.textContent = '⏳ Menolak...';
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
        btnReject.textContent = '✕ Tolak';
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
      btnSaveAssignment.textContent = '⏳ Memeriksa konflik sumber...';

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
        btnSaveAssignment.textContent = 'Ambulans & Pemandu Diagih';
      }
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

