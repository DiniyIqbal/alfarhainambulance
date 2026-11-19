// =========================================================================
// AL-FARHAIN AMC - PORTAL: BAYARAN TUNAI & DISKAUN
// Admin-managed cash receipts and the discount catalogue.
//
// All money logic runs on the server (record_cash_payment / void_cash_payment
// in supabase_cash_payments_schema.sql). This file only collects input, shows a
// preview, and displays what the database returns. Role checks here just hide
// buttons; the database enforces them.
// =========================================================================

import { getSupabaseClient } from '../services/supabaseClient.js';

const MANAGE_ROLES = ['hq_admin', 'hq_finance'];             // discounts + void
const RECORD_ROLES = ['hq_admin', 'hq_finance', 'branch_manager']; // take cash

const state = {
  portalState: null,
  toast: null,
  tab: 'ledger',
  payments: [],
  discounts: [],
  filter: { q: '', status: 'all', from: '', to: '' },
  loaded: false,
  loading: false
};

/* ------------------------------ helpers ------------------------------ */
const $ = (id) => document.getElementById(id);

function escapeHtml(str = '') {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const money = (n) => 'RM ' + (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function localDateStr(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const role = () => state.portalState?.currentUser?.roleKey || '';
const canManage = () => MANAGE_ROLES.includes(role());
const canRecord = () => RECORD_ROLES.includes(role());

function notify(msg) { if (typeof state.toast === 'function') state.toast(msg); }

/** Mirrors calc_discount_amount() in SQL; the server result is authoritative. */
function discountAmount(d, fare) {
  if (!d) return 0;
  const raw = d.discount_type === 'percent'
    ? Math.min(fare * num(d.value) / 100, d.max_discount != null ? num(d.max_discount) : fare)
    : num(d.value);
  return round2(Math.min(fare, raw));
}

/** Why a discount can't be used right now (null = usable). */
function discountProblem(d, fare, today = localDateStr()) {
  if (!d.is_active) return 'Tidak aktif';
  if (d.valid_from && today < d.valid_from) return `Bermula ${d.valid_from}`;
  if (d.valid_to && today > d.valid_to) return 'Tamat tempoh';
  if (d.usage_limit != null && d.used_count >= d.usage_limit) return 'Had penggunaan penuh';
  if (fare != null && fare < num(d.min_fare)) return `Min. tambang ${money(d.min_fare)}`;
  return null;
}

/* ------------------------------ data ------------------------------ */
async function loadData() {
  const sb = getSupabaseClient();
  if (!sb) { state.loaded = true; return { offline: true }; }
  state.loading = true;
  const [pay, disc] = await Promise.all([
    sb.from('cash_payments').select('*').order('received_at', { ascending: false }).limit(500),
    sb.from('payment_discounts').select('*').order('created_at', { ascending: false })
  ]);
  state.loading = false;
  state.loaded = true;
  const err = pay.error || disc.error;
  if (err) return { error: err };
  state.payments = pay.data || [];
  state.discounts = disc.data || [];
  return {};
}

async function loadUnpaidCashBookings() {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('ambulance_bookings')
    .select('id, invoice_number, patient_name, patient_phone, hub_id, hub_name, total_fare, amount_due, payment_status, payment_method, booking_status, created_at')
    .or('payment_status.is.null,payment_status.in.(unpaid,pending)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || []).filter((b) =>
    (b.payment_method || 'cash') === 'cash' &&
    (b.booking_status || '') !== 'cancelled' &&
    (b.payment_status || 'unpaid') !== 'paid');
}

/* ------------------------------ rendering ------------------------------ */
export async function renderCashPaymentView() {
  const root = $('cashPaymentRoot');
  if (!root) return;
  if (!getSupabaseClient()) {
    root.innerHTML = notice('Supabase belum dikonfigurasi. Rekod bayaran tunai memerlukan sambungan pangkalan data.');
    return;
  }
  if (!state.loaded) root.innerHTML = notice('Memuatkan rekod bayaran...');
  const res = await loadData();
  if (res.error) {
    const missing = /relation .* does not exist|schema cache|Could not find/i.test(res.error.message || '');
    root.innerHTML = notice(missing
      ? 'Jadual bayaran tunai belum wujud. Jalankan supabase_cash_payments_schema.sql dalam Supabase SQL Editor.'
      : 'Gagal memuatkan data: ' + escapeHtml(res.error.message || ''), true);
    return;
  }
  root.innerHTML = shell();
  renderLedger();
  renderDiscounts();
  applyTab();
}

function notice(text, isError = false) {
  return `<div class="cp-notice${isError ? ' is-error' : ''}" role="status">${text}</div>`;
}

function shell() {
  return `
    <div class="cp-kpis" id="cpKpis"></div>
    <div class="settings-tabs-bar cp-tabs" role="tablist">
      <button type="button" class="set-tab-btn" role="tab" data-cptab="ledger" id="cpTabLedger">Rekod Bayaran Tunai</button>
      <button type="button" class="set-tab-btn" role="tab" data-cptab="discounts" id="cpTabDiscounts">Diskaun</button>
    </div>
    <div id="cpPaneLedger" role="tabpanel"></div>
    <div id="cpPaneDiscounts" role="tabpanel" hidden></div>`;
}

function applyTab() {
  document.querySelectorAll('[data-cptab]').forEach((b) => {
    const on = b.dataset.cptab === state.tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const l = $('cpPaneLedger'); const d = $('cpPaneDiscounts');
  if (l) l.hidden = state.tab !== 'ledger';
  if (d) d.hidden = state.tab !== 'discounts';
}

function filteredPayments() {
  const { q, status, from, to } = state.filter;
  const needle = q.trim().toLowerCase();
  return state.payments.filter((p) => {
    if (status !== 'all' && p.status !== status) return false;
    const day = localDateStr(new Date(p.received_at));
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (!needle) return true;
    return [p.receipt_number, p.invoice_number, p.patient_name, p.discount_code, p.received_by_name]
      .some((v) => String(v || '').toLowerCase().includes(needle));
  });
}

function renderKpis() {
  const el = $('cpKpis');
  if (!el) return;
  const today = localDateStr();
  const month = today.slice(0, 7);
  const live = state.payments.filter((p) => p.status === 'received');
  const sum = (arr, k) => round2(arr.reduce((s, p) => s + num(p[k]), 0));
  const todayRows = live.filter((p) => localDateStr(new Date(p.received_at)) === today);
  const monthRows = live.filter((p) => localDateStr(new Date(p.received_at)).startsWith(month));
  const card = (icon, cls, title, hero, sub) => `
    <div class="kpi-card-metric">
      <div class="kpi-icon-round ${cls}">${icon}</div>
      <div class="kpi-metric-texts">
        <span class="kpi-metric-title">${title}</span>
        <span class="kpi-metric-hero">${hero}</span>
        <span class="kpi-metric-sub">${sub}</span>
      </div>
    </div>`;
  el.innerHTML =
    card('💵', 'green', 'Tunai Diterima Hari Ini', money(sum(todayRows, 'amount_paid')), `${todayRows.length} resit`) +
    card('📅', 'teal', 'Tunai Diterima Bulan Ini', money(sum(monthRows, 'amount_paid')), `${monthRows.length} resit`) +
    card('🏷️', 'cyan', 'Diskaun Diberi Bulan Ini', money(sum(monthRows, 'discount_amount')), `${monthRows.filter((p) => num(p.discount_amount) > 0).length} resit berdiskaun`) +
    card('🚫', 'slate', 'Resit Dibatalkan', String(state.payments.filter((p) => p.status === 'voided').length), 'Direkod dalam log audit');
}

function renderLedger() {
  renderKpis();
  const pane = $('cpPaneLedger');
  if (!pane) return;
  const rows = filteredPayments();
  const totalPaid = round2(rows.filter((p) => p.status === 'received').reduce((s, p) => s + num(p.amount_paid), 0));
  pane.innerHTML = `
    <div class="portal-card">
      <div class="table-card-top-bar">
        <h3 class="card-heading">Lejar Bayaran Tunai</h3>
        <div class="cp-actions">
          <button type="button" class="btn-draft-action" id="cpExportCsv">📥 Eksport CSV</button>
          ${canRecord() ? '<button type="button" class="cp-btn-primary" id="cpNewPayment">+ Rekod Bayaran Tunai</button>' : ''}
        </div>
      </div>
      <div class="cp-filters">
        <input type="search" class="form-input-element" id="cpSearch" placeholder="Cari no. resit, invois, pesakit..." value="${escapeHtml(state.filter.q)}" aria-label="Cari resit">
        <select class="form-select-element" id="cpStatus" aria-label="Tapis status">
          <option value="all"${state.filter.status === 'all' ? ' selected' : ''}>Semua status</option>
          <option value="received"${state.filter.status === 'received' ? ' selected' : ''}>Diterima</option>
          <option value="voided"${state.filter.status === 'voided' ? ' selected' : ''}>Dibatalkan</option>
        </select>
        <input type="date" class="form-input-element" id="cpFrom" value="${escapeHtml(state.filter.from)}" aria-label="Dari tarikh">
        <input type="date" class="form-input-element" id="cpTo" value="${escapeHtml(state.filter.to)}" aria-label="Hingga tarikh">
      </div>
      <div class="records-table-scroll-container">
        <table class="amc-data-table cp-table">
          <thead><tr>
            <th>No. Resit</th><th>Tarikh</th><th>Invois / Pesakit</th><th>Cawangan</th>
            <th class="cp-num">Tambang</th><th class="cp-num">Diskaun</th><th class="cp-num">Dibayar</th>
            <th class="cp-num">Diterima / Baki</th><th>Diterima oleh</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${rows.length ? rows.map(ledgerRow).join('') : `<tr><td colspan="11" class="cp-empty">Tiada rekod bayaran tunai.</td></tr>`}</tbody>
          ${rows.length ? `<tfoot><tr><td colspan="6" class="cp-foot-label">Jumlah diterima (ikut tapisan)</td><td class="cp-num"><strong>${money(totalPaid)}</strong></td><td colspan="4"></td></tr></tfoot>` : ''}
        </table>
      </div>
    </div>`;
}

function ledgerRow(p) {
  const voided = p.status === 'voided';
  return `
    <tr class="${voided ? 'cp-voided' : ''}">
      <td><strong class="cp-receipt">${escapeHtml(p.receipt_number)}</strong></td>
      <td class="cp-nowrap">${fmtDateTime(p.received_at)}</td>
      <td><div>${escapeHtml(p.invoice_number)}</div><div class="cp-sub">${escapeHtml(p.patient_name || '—')}</div></td>
      <td>${escapeHtml(p.hub_id)}</td>
      <td class="cp-num">${money(p.fare_amount)}</td>
      <td class="cp-num">${num(p.discount_amount) > 0 ? `−${money(p.discount_amount)}<div class="cp-sub">${escapeHtml(p.discount_code || '')}</div>` : '—'}</td>
      <td class="cp-num"><strong>${money(p.amount_paid)}</strong></td>
      <td class="cp-num">${money(p.amount_tendered)}<div class="cp-sub">Baki ${money(p.change_given)}</div></td>
      <td>${escapeHtml(p.received_by_name || '—')}</td>
      <td>${voided
        ? `<span class="cp-pill is-void" title="${escapeHtml(p.void_reason || '')}">Dibatalkan</span><div class="cp-sub">${escapeHtml(p.void_reason || '')}</div>`
        : '<span class="cp-pill is-ok">Diterima</span>'}</td>
      <td>${!voided && canManage() ? `<button type="button" class="cp-btn-ghost" data-void="${escapeHtml(p.id)}">Batal resit</button>` : ''}</td>
    </tr>`;
}

function renderDiscounts() {
  const pane = $('cpPaneDiscounts');
  if (!pane) return;
  const rows = state.discounts;
  pane.innerHTML = `
    <div class="portal-card">
      <div class="table-card-top-bar">
        <div>
          <h3 class="card-heading">Katalog Diskaun</h3>
          <p class="cp-hint">Diskaun dipilih semasa merekod bayaran tunai. Jumlah potongan dikira oleh pelayan, bukan pelayar.</p>
        </div>
        ${canManage() ? '<button type="button" class="cp-btn-primary" id="cpNewDiscount">+ Diskaun Baharu</button>' : ''}
      </div>
      <div class="records-table-scroll-container">
        <table class="amc-data-table cp-table">
          <thead><tr>
            <th>Kod</th><th>Nama</th><th>Nilai</th><th class="cp-num">Min. Tambang</th>
            <th>Tempoh</th><th>Penggunaan</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${rows.length ? rows.map(discountRow).join('') : `<tr><td colspan="8" class="cp-empty">Belum ada diskaun. ${canManage() ? 'Tekan “Diskaun Baharu”.' : ''}</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

function discountRow(d) {
  const problem = discountProblem(d, null);
  const value = d.discount_type === 'percent'
    ? `${num(d.value)}%${d.max_discount != null ? `<div class="cp-sub">maks ${money(d.max_discount)}</div>` : ''}`
    : money(d.value);
  const period = (d.valid_from || d.valid_to) ? `${escapeHtml(d.valid_from || '…')} → ${escapeHtml(d.valid_to || '…')}` : 'Tanpa had';
  const usage = d.usage_limit != null ? `${d.used_count} / ${d.usage_limit}` : `${d.used_count} / ∞`;
  const pill = d.is_active
    ? (problem ? `<span class="cp-pill is-warn">${escapeHtml(problem)}</span>` : '<span class="cp-pill is-ok">Aktif</span>')
    : '<span class="cp-pill is-void">Tidak aktif</span>';
  return `
    <tr>
      <td><strong class="cp-receipt">${escapeHtml(d.code)}</strong></td>
      <td>${escapeHtml(d.name)}${d.notes ? `<div class="cp-sub">${escapeHtml(d.notes)}</div>` : ''}</td>
      <td>${value}</td>
      <td class="cp-num">${num(d.min_fare) > 0 ? money(d.min_fare) : '—'}</td>
      <td>${period}</td>
      <td>${usage}</td>
      <td>${pill}</td>
      <td><div class="cp-row-actions">${canManage() ? `
        <button type="button" class="cp-btn-ghost" data-edit-discount="${escapeHtml(d.id)}">Edit</button>
        <button type="button" class="cp-btn-ghost" data-toggle-discount="${escapeHtml(d.id)}">${d.is_active ? 'Nyahaktif' : 'Aktifkan'}</button>` : ''}</div></td>
    </tr>`;
}

/* ------------------------------ modal ------------------------------ */
function openModal({ title, body, submitLabel, onSubmit, wide = false }) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'cp-overlay';
  overlay.id = 'cpModal';
  overlay.innerHTML = `
    <form class="cp-modal${wide ? ' is-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="cpModalTitle" novalidate>
      <div class="cp-modal-head">
        <h3 id="cpModalTitle">${escapeHtml(title)}</h3>
        <button type="button" class="cp-modal-x" data-cp-close aria-label="Tutup">×</button>
      </div>
      <div class="cp-modal-body">${body}</div>
      <div class="cp-modal-error" id="cpModalError" role="alert" hidden></div>
      <div class="cp-modal-foot">
        <button type="button" class="cp-btn-ghost" data-cp-close>Batal</button>
        <button type="submit" class="cp-btn-primary" id="cpModalSubmit">${escapeHtml(submitLabel)}</button>
      </div>
    </form>`;
  document.body.appendChild(overlay);
  const form = overlay.querySelector('form');
  const submit = overlay.querySelector('#cpModalSubmit');
  const showError = (msg) => { const e = $('cpModalError'); e.textContent = msg; e.hidden = !msg; };

  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });
  overlay.querySelectorAll('[data-cp-close]').forEach((b) => b.addEventListener('click', closeModal));
  overlay._onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', overlay._onKey);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.dataset.busy === '1') return;
    form.dataset.busy = '1';
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = 'Memproses...';
    showError('');
    try {
      const keepOpen = await onSubmit(form, showError);
      if (keepOpen === true) return;
      closeModal();
    } catch (err) {
      showError(err?.message || 'Operasi gagal. Sila cuba lagi.');
    } finally {
      form.dataset.busy = '';
      submit.disabled = false;
      submit.textContent = label;
    }
  });

  const first = overlay.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
  if (first) first.focus();
  return { form, showError };
}

function closeModal() {
  const m = $('cpModal');
  if (!m) return;
  if (m._onKey) document.removeEventListener('keydown', m._onKey);
  m.remove();
}

/* ------------------------------ record cash payment ------------------------------ */
async function openRecordModal() {
  let bookings = [];
  try { bookings = await loadUnpaidCashBookings(); }
  catch (err) { notify('Gagal memuatkan tempahan: ' + (err.message || '')); return; }
  if (!bookings.length) { notify('Tiada tempahan tunai yang belum dibayar.'); return; }

  const fareOf = (b) => num(b.amount_due ?? b.total_fare);
  const options = bookings.map((b) =>
    `<option value="${escapeHtml(b.id)}">${escapeHtml(b.invoice_number)} · ${escapeHtml(b.patient_name || 'Tanpa nama')} · ${money(fareOf(b))}</option>`).join('');

  const { form } = openModal({
    title: 'Rekod Bayaran Tunai',
    submitLabel: 'Sahkan & Terbit Resit',
    wide: true,
    body: `
      <label class="cp-field"><span>Tempahan (tunai, belum dibayar)</span>
        <select class="form-select-element" name="booking" required>${options}</select></label>
      <label class="cp-field"><span>Diskaun (pilihan)</span>
        <select class="form-select-element" name="discount"></select></label>
      <div class="cp-summary" aria-live="polite">
        <div><span>Tambang</span><b id="cpSumFare">—</b></div>
        <div><span>Diskaun</span><b id="cpSumDisc">—</b></div>
        <div class="is-total"><span>Perlu dibayar</span><b id="cpSumNet">—</b></div>
      </div>
      <label class="cp-field"><span>Wang tunai diterima (RM)</span>
        <input class="form-input-element" name="tendered" type="number" inputmode="decimal" min="0" step="0.01" required></label>
      <div class="cp-change" id="cpChange" aria-live="polite"></div>
      <label class="cp-field"><span>Catatan (pilihan)</span>
        <textarea class="form-input-element" name="notes" rows="2" maxlength="300"></textarea></label>`,
    onSubmit: async (f, showError) => {
      const booking = bookings.find((b) => b.id === f.booking.value);
      const disc = state.discounts.find((d) => d.id === f.discount.value) || null;
      const net = round2(fareOf(booking) - discountAmount(disc, fareOf(booking)));
      const tendered = num(f.tendered.value);
      if (!f.tendered.value || tendered < net) {
        showError(`Wang tunai diterima mesti sekurang-kurangnya ${money(net)}.`);
        return true;
      }
      const { data, error } = await getSupabaseClient().rpc('record_cash_payment', {
        p_booking_id: booking.id,
        p_amount_tendered: tendered,
        p_discount_id: disc ? disc.id : null,
        p_notes: f.notes.value.trim() || null
      });
      if (error) throw new Error(error.message);
      notify(`✅ Resit ${data?.receipt_number || ''} direkod`);
      await renderCashPaymentView();
    }
  });

  const refresh = () => {
    const b = bookings.find((x) => x.id === form.booking.value);
    const fare = fareOf(b);
    const sel = form.discount.value;
    // Rebuild discount options for this fare, keeping the selection if still valid.
    const usable = state.discounts.filter((d) => !discountProblem(d, fare));
    form.discount.innerHTML = '<option value="">Tiada diskaun</option>' + usable.map((d) =>
      `<option value="${escapeHtml(d.id)}"${d.id === sel ? ' selected' : ''}>${escapeHtml(d.code)} · ${escapeHtml(d.name)} (${d.discount_type === 'percent' ? num(d.value) + '%' : money(d.value)})</option>`).join('');
    const disc = state.discounts.find((d) => d.id === form.discount.value) || null;
    const amt = discountAmount(disc, fare);
    const net = round2(fare - amt);
    $('cpSumFare').textContent = money(fare);
    $('cpSumDisc').textContent = amt > 0 ? '−' + money(amt) : '—';
    $('cpSumNet').textContent = money(net);
    const tendered = num(form.tendered.value);
    const c = $('cpChange');
    if (!form.tendered.value) { c.textContent = ''; c.className = 'cp-change'; }
    else if (tendered < net) { c.textContent = `Kurang ${money(net - tendered)}`; c.className = 'cp-change is-short'; }
    else { c.textContent = `Baki dikembalikan: ${money(tendered - net)}`; c.className = 'cp-change is-ok'; }
  };
  form.booking.addEventListener('change', refresh);
  form.discount.addEventListener('change', refresh);
  form.tendered.addEventListener('input', refresh);
  refresh();
}

/* ------------------------------ void ------------------------------ */
function openVoidModal(paymentId) {
  const p = state.payments.find((x) => x.id === paymentId);
  if (!p) return;
  openModal({
    title: `Batal Resit ${p.receipt_number}`,
    submitLabel: 'Batalkan Resit',
    body: `
      <p class="cp-hint">Resit untuk <b>${escapeHtml(p.invoice_number)}</b> (${money(p.amount_paid)}) akan dibatalkan dan tempahan dikembalikan kepada <b>belum dibayar</b>. Rekod tidak dipadam.</p>
      <label class="cp-field"><span>Sebab pembatalan (wajib)</span>
        <textarea class="form-input-element" name="reason" rows="3" maxlength="300" required></textarea></label>`,
    onSubmit: async (f, showError) => {
      const reason = f.reason.value.trim();
      if (!reason) { showError('Sila nyatakan sebab pembatalan.'); return true; }
      const { error } = await getSupabaseClient().rpc('void_cash_payment', { p_payment_id: p.id, p_reason: reason });
      if (error) throw new Error(error.message);
      notify(`Resit ${p.receipt_number} dibatalkan`);
      await renderCashPaymentView();
    }
  });
}

/* ------------------------------ discount form ------------------------------ */
function openDiscountModal(existing = null) {
  const d = existing || {};
  const v = (x) => escapeHtml(x ?? '');
  const { form } = openModal({
    title: existing ? `Edit Diskaun ${existing.code}` : 'Diskaun Baharu',
    submitLabel: existing ? 'Simpan' : 'Cipta Diskaun',
    wide: true,
    body: `
      <div class="cp-grid2">
        <label class="cp-field"><span>Kod</span>
          <input class="form-input-element" name="code" maxlength="30" required value="${v(d.code)}" ${existing ? 'disabled' : ''} placeholder="cth. WARGA60"></label>
        <label class="cp-field"><span>Nama diskaun</span>
          <input class="form-input-element" name="name" maxlength="80" required value="${v(d.name)}" placeholder="cth. Warga Emas"></label>
        <label class="cp-field"><span>Jenis</span>
          <select class="form-select-element" name="type">
            <option value="percent"${d.discount_type !== 'fixed' ? ' selected' : ''}>Peratus (%)</option>
            <option value="fixed"${d.discount_type === 'fixed' ? ' selected' : ''}>Jumlah tetap (RM)</option>
          </select></label>
        <label class="cp-field"><span id="cpValueLabel">Nilai</span>
          <input class="form-input-element" name="value" type="number" step="0.01" min="0.01" required value="${v(d.value)}"></label>
        <label class="cp-field" id="cpMaxWrap"><span>Had potongan maksimum (RM, pilihan)</span>
          <input class="form-input-element" name="max" type="number" step="0.01" min="0.01" value="${v(d.max_discount)}"></label>
        <label class="cp-field"><span>Tambang minimum (RM)</span>
          <input class="form-input-element" name="min" type="number" step="0.01" min="0" value="${v(d.min_fare ?? 0)}"></label>
        <label class="cp-field"><span>Sah dari</span>
          <input class="form-input-element" name="from" type="date" value="${v(d.valid_from)}"></label>
        <label class="cp-field"><span>Sah hingga</span>
          <input class="form-input-element" name="to" type="date" value="${v(d.valid_to)}"></label>
        <label class="cp-field"><span>Had penggunaan (kosong = tanpa had)</span>
          <input class="form-input-element" name="limit" type="number" step="1" min="1" value="${v(d.usage_limit)}"></label>
        <label class="cp-field cp-check"><input type="checkbox" name="active" ${d.is_active === false ? '' : 'checked'}><span>Aktif</span></label>
      </div>
      <label class="cp-field"><span>Catatan dalaman (pilihan)</span>
        <input class="form-input-element" name="notes" maxlength="200" value="${v(d.notes)}"></label>`,
    onSubmit: async (f, showError) => {
      const type = f.type.value;
      const value = num(f.value.value);
      if (!(value > 0)) { showError('Nilai diskaun mesti lebih daripada 0.'); return true; }
      if (type === 'percent' && value > 100) { showError('Peratus tidak boleh melebihi 100.'); return true; }
      if (f.from.value && f.to.value && f.to.value < f.from.value) { showError('Tarikh tamat mesti selepas tarikh mula.'); return true; }
      const payload = {
        name: f.name.value.trim(),
        discount_type: type,
        value,
        max_discount: type === 'percent' && f.max.value ? num(f.max.value) : null,
        min_fare: f.min.value ? num(f.min.value) : 0,
        valid_from: f.from.value || null,
        valid_to: f.to.value || null,
        usage_limit: f.limit.value ? parseInt(f.limit.value, 10) : null,
        is_active: f.active.checked,
        notes: f.notes.value.trim() || null
      };
      if (!payload.name) { showError('Nama diskaun diperlukan.'); return true; }
      const sb = getSupabaseClient();
      let error;
      if (existing) {
        ({ error } = await sb.from('payment_discounts').update(payload).eq('id', existing.id));
      } else {
        const code = f.code.value.trim().toUpperCase();
        if (!/^[A-Z0-9_-]{2,30}$/.test(code)) { showError('Kod hanya boleh mengandungi huruf, nombor, - dan _ (2-30 aksara).'); return true; }
        ({ error } = await sb.from('payment_discounts').insert({ code, ...payload }));
      }
      if (error) {
        throw new Error(/duplicate key|unique/i.test(error.message) ? 'Kod diskaun ini sudah wujud.' : error.message);
      }
      notify(existing ? 'Diskaun dikemas kini' : 'Diskaun dicipta');
      await renderCashPaymentView();
      state.tab = 'discounts';
      applyTab();
    }
  });

  const sync = () => {
    const pct = form.type.value === 'percent';
    $('cpValueLabel').textContent = pct ? 'Nilai (%)' : 'Nilai (RM)';
    $('cpMaxWrap').hidden = !pct;
    form.value.max = pct ? '100' : '';
  };
  form.type.addEventListener('change', sync);
  sync();
}

async function toggleDiscount(id) {
  const d = state.discounts.find((x) => x.id === id);
  if (!d) return;
  const { error } = await getSupabaseClient().from('payment_discounts').update({ is_active: !d.is_active }).eq('id', id);
  if (error) { notify('Gagal: ' + error.message); return; }
  notify(d.is_active ? `${d.code} dinyahaktifkan` : `${d.code} diaktifkan`);
  await renderCashPaymentView();
  state.tab = 'discounts';
  applyTab();
}

/* ------------------------------ CSV ------------------------------ */
function exportCsv() {
  const rows = filteredPayments();
  if (!rows.length) { notify('Tiada rekod untuk dieksport.'); return; }
  // Spreadsheet formula injection guard: prefix cells that start with = + - @
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ['No. Resit', 'Tarikh', 'Invois', 'Pesakit', 'Cawangan', 'Tambang', 'Kod Diskaun', 'Diskaun', 'Dibayar', 'Diterima', 'Baki', 'Diterima Oleh', 'Status', 'Sebab Batal'];
  const lines = [head.map(cell).join(',')].concat(rows.map((p) => [
    p.receipt_number, p.received_at, p.invoice_number, p.patient_name, p.hub_id,
    p.fare_amount, p.discount_code, p.discount_amount, p.amount_paid, p.amount_tendered,
    p.change_given, p.received_by_name, p.status, p.void_reason
  ].map(cell).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bayaran-tunai-${localDateStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ------------------------------ wiring ------------------------------ */
export function initCashPaymentModule(portalState, showToast) {
  state.portalState = portalState;
  state.toast = showToast;
  const root = $('cashPaymentRoot');
  if (!root) return;

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.cptab) { state.tab = t.dataset.cptab; applyTab(); }
    else if (t.id === 'cpNewPayment') openRecordModal();
    else if (t.id === 'cpNewDiscount') openDiscountModal();
    else if (t.id === 'cpExportCsv') exportCsv();
    else if (t.dataset.void) openVoidModal(t.dataset.void);
    else if (t.dataset.editDiscount) openDiscountModal(state.discounts.find((d) => d.id === t.dataset.editDiscount));
    else if (t.dataset.toggleDiscount) toggleDiscount(t.dataset.toggleDiscount);
  });

  const onFilter = () => {
    state.filter.q = $('cpSearch')?.value || '';
    state.filter.status = $('cpStatus')?.value || 'all';
    state.filter.from = $('cpFrom')?.value || '';
    state.filter.to = $('cpTo')?.value || '';
    const searchHadFocus = document.activeElement?.id === 'cpSearch';
    renderLedger();
    if (searchHadFocus) { const s = $('cpSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  };
  root.addEventListener('input', (e) => { if (e.target.id === 'cpSearch') onFilter(); });
  root.addEventListener('change', (e) => { if (['cpStatus', 'cpFrom', 'cpTo'].includes(e.target.id)) onFilter(); });
}
