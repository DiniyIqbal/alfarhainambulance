// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - RAKAN AMBULANS PORTAL UI MODULE
// Renders & controls:
//   1. HQ Admin "Rakan Ambulans" Module (5 tabs)
//   2. Partner Administrator Portal (6 company-scoped tabs)
// =========================================================================

import {
  formatRmFromCents,
  rmToCents,
  getPartnerCompanies,
  getPartnerInvitations,
  getPartnerVehicles,
  getPartnerDrivers,
  getPartnerTripOffers,
  getPartnerCommissionLedger,
  getPartnerSettlementBatches,
  getPartnerFinancialAdjustments,
  getPartnerAuditLogs,
  createPartnerInvitation,
  redeemPartnerInvitation,
  reviewPartnerCompany,
  reviewPartnerResource,
  createPartnerTripOffer,
  respondToPartnerTripOffer,
  withdrawPartnerTripOffer,
  assignPartnerResourcesToTrip,
  updatePartnerTripProgress,
  verifyPartnerTripCompletion,
  createFinancialAdjustment,
  createSettlementBatch,
  completeSettlementBatch,
  getPartnerPortalScopedData
} from '../services/partnerAmbulanceService.js';

const hqActor = {
  email: 'abedi@alfarhain.my',
  name: 'Abe Di (Pentadbir HQ)',
  role: 'hq_admin'
};

let activeHqTab = 'syarikat';
let activePartnerTab = 'dashboard';
let companySearchQuery = '';
let companyStatusFilter = 'all';
let currentPartnerActor = {
  email: 'admin.medicare@gmail.com',
  name: 'En. Wan Kamarul Ariffin',
  role: 'partner_admin'
};

function escapeHtml(str = '') {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadgeHtml(status = '') {
  const s = String(status);
  let bg = '#F1F5F9';
  let color = '#334155';
  if (['Aktif', 'Accepted', 'Verified Completed', 'Settled', 'Diterima', 'Tersedia'].includes(s)) {
    bg = '#ECFDF5';
    color = '#047857';
  } else if (['Menunggu Kelulusan', 'Offered', 'Completed Pending Review', 'Unsettled', 'Reviewed', 'Dihantar', 'Dalam Tugasan'].includes(s)) {
    bg = '#FEF3C7';
    color = '#B45309';
  } else if (['Perlu Pembetulan', 'Assigned', 'En Route', 'On Scene', 'In Transit', 'In Settlement Batch'].includes(s)) {
    bg = '#EFF6FF';
    color = '#1D4ED8';
  } else if (['Ditolak', 'Digantung', 'Declined', 'Withdrawn', 'Expired', 'Cancelled', 'Dibatalkan'].includes(s)) {
    bg = '#FEF2F2';
    color = '#B91C1C';
  }
  return `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:0.72rem;font-weight:800;background:${bg};color:${color};">${escapeHtml(s)}</span>`;
}

export function initPartnerPortalModule() {
  updateSidebarPartnerBadge();
  renderHqRakanAmbulansView();
  renderPartnerPortalView();

  // Check URL query parameter ?mode=partner
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'partner') {
      const btn = document.getElementById('navBtnPartnerPortal');
      if (btn) setTimeout(() => btn.click(), 150);
    }
  } catch (e) {}
}

export function updateSidebarPartnerBadge() {
  const badge = document.getElementById('badgePendingPartners');
  if (!badge) return;
  const pendingComps = getPartnerCompanies().filter(c => c.approval_status === 'Menunggu Kelulusan').length;
  const pendingReviews = getPartnerTripOffers().filter(o => o.trip_status === 'Completed Pending Review').length;
  const total = pendingComps + pendingReviews;
  badge.textContent = String(total);
  badge.style.display = total > 0 ? 'inline-flex' : 'none';
}

/* =========================================================================
   HQ ADMIN MODULE: RAKAN AMBULANS (5 TABS)
   ========================================================================= */

export function renderHqRakanAmbulansView() {
  const root = document.getElementById('rakanAmbulansDynamicRoot');
  if (!root) return;

  updateSidebarPartnerBadge();

  const companies = getPartnerCompanies();
  const offers = getPartnerTripOffers();
  const ledger = getPartnerCommissionLedger();

  const activeCompsCount = companies.filter(c => c.approval_status === 'Aktif').length;
  const pendingCompsCount = companies.filter(c => c.approval_status === 'Menunggu Kelulusan').length;
  const totalCommissionCents = ledger.reduce((acc, l) => acc + l.commission_amount_cents, 0);
  const totalPayableCents = ledger
    .filter(l => l.settlement_status === 'Unsettled')
    .reduce((acc, l) => acc + l.payable_to_partner_cents, 0);

  root.innerHTML = `
    <!-- Top KPI Strip -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-bottom:18px;">
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
        <div style="font-size:0.72rem;font-weight:800;color:#64748B;text-transform:uppercase;">Syarikat Rakan Diluluskan</div>
        <div style="font-size:1.65rem;font-weight:900;color:#0F172A;margin-top:4px;">${activeCompsCount} <span style="font-size:0.8rem;color:#B45309;font-weight:700;">(${pendingCompsCount} Menunggu)</span></div>
        <div style="font-size:0.74rem;color:#047857;margin-top:2px;">✓ Kadar Komisen Lalai: 5.0%</div>
      </div>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
        <div style="font-size:0.72rem;font-weight:800;color:#64748B;text-transform:uppercase;">Tawaran &amp; Tugasan Rakan</div>
        <div style="font-size:1.65rem;font-weight:900;color:#0F172A;margin-top:4px;">${offers.length} Trip</div>
        <div style="font-size:0.74rem;color:#1D4ED8;margin-top:2px;">⚡ Dikawal sepenuhnya oleh HQ</div>
      </div>
      <div style="background:#fff;border:1px solid #FFE4E6;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(198,30,47,0.05);">
        <div style="font-size:0.72rem;font-weight:800;color:#9F1239;text-transform:uppercase;">Hasil Komisen Al-Farhain (5%)</div>
        <div style="font-size:1.65rem;font-weight:900;color:#C61E2F;margin-top:4px;">${formatRmFromCents(totalCommissionCents)}</div>
        <div style="font-size:0.74rem;color:#64748B;margin-top:2px;">Hasil komisen (bukan untung bersih)</div>
      </div>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
        <div style="font-size:0.72rem;font-weight:800;color:#64748B;text-transform:uppercase;">Baki Belum Selesai Kepada Rakan</div>
        <div style="font-size:1.65rem;font-weight:900;color:#047857;margin-top:4px;">${formatRmFromCents(totalPayableCents)}</div>
        <div style="font-size:0.74rem;color:#64748B;margin-top:2px;">Penyelesaian disemak manual oleh Kewangan</div>
      </div>
    </div>

    <!-- 5 Sub-Navigation Tabs -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;border-bottom:1px solid #E2E8F0;padding-bottom:12px;">
      ${[
        { id: 'syarikat', label: '🏢 Syarikat Rakan' },
        { id: 'jemputan', label: `📩 Jemputan & Kelulusan (${pendingCompsCount})` },
        { id: 'armada', label: '🚑 Armada & Pemandu' },
        { id: 'tugasan', label: '📋 Tugasan Rakan' },
        { id: 'komisen', label: '💰 Komisen & Penyelesaian (5%)' }
      ]
        .map(
          t => `
        <button type="button" class="rakan-hq-tab-btn" data-rakan-tab="${t.id}"
          style="padding:9px 16px;border-radius:10px;font-size:0.82rem;font-weight:800;cursor:pointer;border:1.5px solid ${
            activeHqTab === t.id ? '#C61E2F' : '#E2E8F0'
          };background:${activeHqTab === t.id ? '#C61E2F' : '#FFFFFF'};color:${
            activeHqTab === t.id ? '#FFFFFF' : '#334155'
          };transition:all 0.15s;">
          ${t.label}
        </button>
      `
        )
        .join('')}
    </div>

    <!-- Active Sub-Tab Body -->
    <div id="rakanHqTabBody">
      ${renderActiveHqTabHtml()}
    </div>
  `;

  // Bind tab buttons
  root.querySelectorAll('.rakan-hq-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeHqTab = btn.dataset.rakanTab;
      renderHqRakanAmbulansView();
    });
  });

  bindActiveHqTabEvents(root);
}

function renderActiveHqTabHtml() {
  if (activeHqTab === 'syarikat') return renderHqTabSyarikat();
  if (activeHqTab === 'jemputan') return renderHqTabJemputan();
  if (activeHqTab === 'armada') return renderHqTabArmada();
  if (activeHqTab === 'tugasan') return renderHqTabTugasan();
  if (activeHqTab === 'komisen') return renderHqTabKomisen();
  return '';
}

function renderHqTabSyarikat() {
  const all = getPartnerCompanies();
  const filtered = all.filter(c => {
    const matchStatus = companyStatusFilter === 'all' || c.approval_status === companyStatusFilter;
    const q = companySearchQuery.toLowerCase().trim();
    const matchQuery =
      !q ||
      c.company_name.toLowerCase().includes(q) ||
      c.ssm_registration_no.toLowerCase().includes(q) ||
      c.state_coverage.toLowerCase().includes(q);
    return matchStatus && matchQuery;
  });

  return `
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
        <div>
          <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:#0F172A;">Direktori Syarikat Rakan Ambulans Luar</h3>
          <p style="margin:2px 0 0 0;font-size:0.78rem;color:#64748B;">Senarai syarikat rakan berdaftar, liputan negeri, terma komisen dan status kelulusan HQ</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="inputSearchPartnerComp" value="${escapeHtml(companySearchQuery)}" placeholder="Cari nama syarikat / SSM / negeri..."
            style="padding:8px 12px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;min-width:220px;">
          <select id="selectFilterPartnerStatus" style="padding:8px 12px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;">
            <option value="all" ${companyStatusFilter === 'all' ? 'selected' : ''}>Semua Status</option>
            <option value="Aktif" ${companyStatusFilter === 'Aktif' ? 'selected' : ''}>Aktif</option>
            <option value="Menunggu Kelulusan" ${companyStatusFilter === 'Menunggu Kelulusan' ? 'selected' : ''}>Menunggu Kelulusan</option>
            <option value="Digantung" ${companyStatusFilter === 'Digantung' ? 'selected' : ''}>Digantung</option>
          </select>
        </div>
      </div>

      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
          <thead>
            <tr style="background:#F8FAFC;border-bottom:1.5px solid #E2E8F0;text-align:left;color:#475569;">
              <th style="padding:11px 12px;">Kod &amp; Nama Syarikat</th>
              <th style="padding:11px 12px;">No. SSM &amp; Permit KKM</th>
              <th style="padding:11px 12px;">Liputan &amp; Hubungan</th>
              <th style="padding:11px 12px;">Terma Komisen</th>
              <th style="padding:11px 12px;">Status HQ</th>
              <th style="padding:11px 12px;text-align:right;">Tindakan Kawalan</th>
            </tr>
          </thead>
          <tbody>
            ${filtered
              .map(
                c => `
              <tr style="border-bottom:1px solid #F1F5F9;">
                <td style="padding:12px;">
                  <div style="font-weight:800;color:#0F172A;">${escapeHtml(c.company_name)}</div>
                  <div style="font-size:0.72rem;color:#64748B;">Kod: <b>${escapeHtml(c.company_code)}</b> · Pengarah: ${escapeHtml(c.director_name)}</div>
                </td>
                <td style="padding:12px;">
                  <div style="font-family:monospace;font-weight:700;color:#1E293B;">${escapeHtml(c.ssm_registration_no)}</div>
                  <div style="font-size:0.72rem;color:#047857;">${escapeHtml(c.kkm_permit_no || 'Permit Dalam Semakan')}</div>
                </td>
                <td style="padding:12px;">
                  <div style="font-weight:700;color:#334155;">📍 ${escapeHtml(c.state_coverage)}</div>
                  <div style="font-size:0.72rem;color:#64748B;">${escapeHtml(c.company_email)} · ${escapeHtml(c.contact_phone)}</div>
                </td>
                <td style="padding:12px;">
                  <div style="font-weight:800;color:#C61E2F;">${(c.default_commission_bps / 100).toFixed(1)}% Komisen AFAMS</div>
                  <div style="font-size:0.7rem;color:#64748B;">Kutipan Tunai Rakan: <b>${c.cash_collection_allowed ? 'Dibenarkan' : 'Tidak'}</b></div>
                </td>
                <td style="padding:12px;">
                  ${statusBadgeHtml(c.approval_status)}
                  ${c.approved_by_name ? `<div style="font-size:0.68rem;color:#64748B;margin-top:3px;">Oleh: ${escapeHtml(c.approved_by_name)}</div>` : ''}
                </td>
                <td style="padding:12px;text-align:right;">
                  <div style="display:inline-flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                    ${
                      c.approval_status !== 'Aktif'
                        ? `<button type="button" class="btn-hq-comp-action" data-comp-id="${c.id}" data-action="Luluskan" style="padding:5px 10px;border-radius:7px;background:#059669;color:#fff;border:none;font-size:0.73rem;font-weight:700;cursor:pointer;">✓ Luluskan</button>`
                        : `<button type="button" class="btn-hq-comp-action" data-comp-id="${c.id}" data-action="Gantung" style="padding:5px 10px;border-radius:7px;background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA;font-size:0.73rem;font-weight:700;cursor:pointer;">⛔ Gantung</button>`
                    }
                    <button type="button" class="btn-open-partner-portal-as" data-comp-email="${escapeHtml(c.company_email)}" style="padding:5px 10px;border-radius:7px;background:#F1F5F9;color:#0F172A;border:1px solid #CBD5E1;font-size:0.73rem;font-weight:700;cursor:pointer;">
                      👁️ Pratonton Portal Rakan
                    </button>
                  </div>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderHqTabJemputan() {
  const invitations = getPartnerInvitations();
  const pendingComps = getPartnerCompanies().filter(c => c.approval_status !== 'Aktif');

  return `
    <div style="display:grid;grid-template-columns:1fr 1.3fr;gap:18px;">
      <!-- Create Partner Invitation Form -->
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <h3 style="margin:0 0 4px 0;font-size:1rem;font-weight:800;color:#0F172A;">➕ Jemput Syarikat Rakan Ambulans Baharu</h3>
        <p style="margin:0 0 14px 0;font-size:0.75rem;color:#64748B;">Menjana Kod Jemputan satu-kali-guna (SHA-256). Jemputan tidak memberi kelulusan automatik.</p>

        <form id="formCreatePartnerInvite" style="display:flex;flex-direction:column;gap:10px;">
          <div>
            <label style="font-size:0.72rem;font-weight:800;color:#334155;">NAMA SYARIKAT RAKAN AMBULANS *</label>
            <input type="text" id="invCompName" required placeholder="Cth: MedicOne Ambulance Sdn. Bhd." style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="font-size:0.72rem;font-weight:800;color:#334155;">NO. PENDAFTARAN SSM *</label>
              <input type="text" id="invCompSsm" required placeholder="202301018899" style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;">
            </div>
            <div>
              <label style="font-size:0.72rem;font-weight:800;color:#334155;">KAWASAN LIPUTAN NEGERI *</label>
              <input type="text" id="invCompState" required value="Kelantan &amp; Terengganu" style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="font-size:0.72rem;font-weight:800;color:#334155;">NAMA PENGARAH / PENTADBIR *</label>
              <input type="text" id="invRecipName" required placeholder="En. Ahmad Faizal" style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;">
            </div>
            <div>
              <label style="font-size:0.72rem;font-weight:800;color:#334155;">NO. TELEFON RASMI *</label>
              <input type="text" id="invRecipPhone" required placeholder="019-988 1122" style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1.3fr 0.7fr;gap:10px;">
            <div>
              <label style="font-size:0.72rem;font-weight:800;color:#334155;">EMEL RASMI PENTADBIR RAKAN *</label>
              <input type="email" id="invRecipEmail" required placeholder="admin@medicone.my" style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;">
            </div>
            <div>
              <label style="font-size:0.72rem;font-weight:800;color:#334155;">KOMISEN AFAMS (%)</label>
              <input type="number" id="invCompCommPct" value="5" min="0" max="50" step="0.5" style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;">
            </div>
          </div>
          <button type="submit" style="margin-top:6px;padding:10px 14px;background:#C61E2F;color:#fff;border:none;border-radius:10px;font-weight:800;font-size:0.82rem;cursor:pointer;">
            🔐 Jana Kod Jemputan Rakan Ambulans
          </button>
        </form>

        <div id="partnerGeneratedCodeAlert" style="display:none;margin-top:12px;padding:12px;background:#ECFDF5;border:1.5px solid #10B981;border-radius:10px;font-size:0.8rem;color:#065F46;"></div>
      </div>

      <!-- Pending Approvals & Sent Invitations -->
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
          <h3 style="margin:0 0 10px 0;font-size:0.98rem;font-weight:800;color:#0F172A;">⏳ Senarai Menunggu Semakan &amp; Kelulusan HQ (${pendingComps.length})</h3>
          ${
            pendingComps.length === 0
              ? `<div style="padding:14px;background:#F8FAFC;border-radius:10px;font-size:0.8rem;color:#64748B;">Tiada syarikat rakan yang menunggu kelulusan buat masa ini.</div>`
              : pendingComps
                  .map(
                    c => `
                <div style="padding:12px;border:1px solid #E2E8F0;border-radius:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
                  <div>
                    <div style="font-weight:800;color:#0F172A;">${escapeHtml(c.company_name)} ${statusBadgeHtml(c.approval_status)}</div>
                    <div style="font-size:0.74rem;color:#64748B;margin-top:2px;">SSM: ${escapeHtml(c.ssm_registration_no)} · Emel: ${escapeHtml(c.company_email)}</div>
                  </div>
                  <div style="display:flex;gap:6px;">
                    <button type="button" class="btn-hq-comp-action" data-comp-id="${c.id}" data-action="Luluskan" style="padding:6px 10px;background:#059669;color:#fff;border:none;border-radius:8px;font-size:0.74rem;font-weight:700;cursor:pointer;">Luluskan</button>
                    <button type="button" class="btn-hq-comp-action" data-comp-id="${c.id}" data-action="Minta Pembetulan" style="padding:6px 10px;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;border-radius:8px;font-size:0.74rem;font-weight:700;cursor:pointer;">Minta Pembetulan</button>
                    <button type="button" class="btn-hq-comp-action" data-comp-id="${c.id}" data-action="Tolak" style="padding:6px 10px;background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA;border-radius:8px;font-size:0.74rem;font-weight:700;cursor:pointer;">Tolak</button>
                  </div>
                </div>
              `
                  )
                  .join('')
          }
        </div>

        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
          <h3 style="margin:0 0 10px 0;font-size:0.95rem;font-weight:800;color:#0F172A;">🔑 Rekod Kod Jemputan Rakan (Kod Bertopeng)</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
              <thead>
                <tr style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;text-align:left;">
                  <th style="padding:8px;">Kod Bertopeng</th>
                  <th style="padding:8px;">Syarikat &amp; Penerima</th>
                  <th style="padding:8px;">Status</th>
                  <th style="padding:8px;">Tamat Tempoh</th>
                </tr>
              </thead>
              <tbody>
                ${invitations
                  .map(
                    inv => `
                  <tr style="border-bottom:1px solid #F1F5F9;">
                    <td style="padding:8px;font-family:monospace;font-weight:800;">${escapeHtml(inv.masked_code)}</td>
                    <td style="padding:8px;">
                      <div style="font-weight:700;">${escapeHtml(inv.company_name)}</div>
                      <div style="font-size:0.7rem;color:#64748B;">${escapeHtml(inv.recipient_email)}</div>
                    </td>
                    <td style="padding:8px;">${statusBadgeHtml(inv.status)}</td>
                    <td style="padding:8px;font-size:0.72rem;color:#64748B;">${new Date(inv.expires_at).toLocaleDateString('ms-MY')}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderHqTabArmada() {
  const vehicles = getPartnerVehicles();
  const drivers = getPartnerDrivers();

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
      <!-- Partner Vehicles -->
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <h3 style="margin:0 0 4px 0;font-size:1rem;font-weight:800;color:#0F172A;">🚑 Kelulusan Armada Rakan Ambulans (${vehicles.length})</h3>
        <p style="margin:0 0 12px 0;font-size:0.75rem;color:#64748B;">Hanya ambulans berstatus Aktif &amp; Tersedia boleh ditugaskan untuk misi pesakit</p>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${vehicles
            .map(
              v => `
            <div style="padding:12px;border:1px solid #E2E8F0;border-radius:12px;background:#F8FAFC;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <span style="font-family:monospace;font-weight:900;font-size:0.9rem;background:#0F172A;color:#fff;padding:2px 8px;border-radius:6px;">${escapeHtml(v.plate_number)}</span>
                  <span style="font-weight:800;font-size:0.84rem;color:#0F172A;margin-left:6px;">${escapeHtml(v.model)}</span>
                </div>
                <div style="display:flex;gap:6px;">
                  ${statusBadgeHtml(v.approval_status)}
                  ${statusBadgeHtml(v.availability_status)}
                </div>
              </div>
              <div style="font-size:0.74rem;color:#475569;margin-top:6px;">
                🏢 <b>${escapeHtml(v.company_name)}</b> · ${escapeHtml(v.vehicle_type)}<br>
                🩺 Alatan: ${escapeHtml(v.equipment_list)}
              </div>
              <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;">
                ${
                  v.approval_status !== 'Aktif'
                    ? `<button type="button" class="btn-hq-res-action" data-res-type="vehicle" data-res-id="${v.id}" data-action="Luluskan" style="padding:4px 10px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:0.72rem;font-weight:700;cursor:pointer;">✓ Luluskan Unit</button>`
                    : ''
                }
                ${
                  v.approval_status !== 'Ditolak'
                    ? `<button type="button" class="btn-hq-res-action" data-res-type="vehicle" data-res-id="${v.id}" data-action="Tolak" style="padding:4px 10px;background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA;border-radius:6px;font-size:0.72rem;font-weight:700;cursor:pointer;">Tolak</button>`
                    : ''
                }
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- Partner Drivers -->
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <h3 style="margin:0 0 4px 0;font-size:1rem;font-weight:800;color:#0F172A;">👨‍⚕️ Kelulusan Pemandu &amp; Krew Rakan (${drivers.length})</h3>
        <p style="margin:0 0 12px 0;font-size:0.75rem;color:#64748B;">Semakan lesen memandu, kelayakan klinikal EMT/MA dan status ketersediaan</p>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${drivers
            .map(
              d => `
            <div style="padding:12px;border:1px solid #E2E8F0;border-radius:12px;background:#F8FAFC;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:800;font-size:0.86rem;color:#0F172A;">${escapeHtml(d.full_name)}</div>
                <div style="display:flex;gap:6px;">
                  ${statusBadgeHtml(d.approval_status)}
                  ${statusBadgeHtml(d.availability_status)}
                </div>
              </div>
              <div style="font-size:0.74rem;color:#475569;margin-top:6px;">
                🏢 <b>${escapeHtml(d.company_name)}</b> · 📞 ${escapeHtml(d.phone)}<br>
                🎓 Kelayakan: <b>${escapeHtml(d.clinical_qualification)}</b> · Emel: ${escapeHtml(d.email)}
              </div>
              <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;">
                ${
                  d.approval_status !== 'Aktif'
                    ? `<button type="button" class="btn-hq-res-action" data-res-type="driver" data-res-id="${d.id}" data-action="Luluskan" style="padding:4px 10px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:0.72rem;font-weight:700;cursor:pointer;">✓ Luluskan Pemandu</button>`
                    : ''
                }
                ${
                  d.approval_status !== 'Ditolak'
                    ? `<button type="button" class="btn-hq-res-action" data-res-type="driver" data-res-id="${d.id}" data-action="Tolak" style="padding:4px 10px;background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA;border-radius:6px;font-size:0.72rem;font-weight:700;cursor:pointer;">Tolak</button>`
                    : ''
                }
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
}

function renderHqTabTugasan() {
  const activeCompanies = getPartnerCompanies().filter(c => c.approval_status === 'Aktif');
  const offers = getPartnerTripOffers();

  return `
    <div style="display:flex;flex-direction:column;gap:18px;">
      <!-- Create New Partner Trip Offer -->
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <h3 style="margin:0 0 4px 0;font-size:1rem;font-weight:800;color:#0F172A;">📤 Tawarkan Tugasan Tempahan Kepada Syarikat Rakan Diluluskan</h3>
        <p style="margin:0 0 14px 0;font-size:0.76rem;color:#64748B;">Pilih syarikat rakan berstatus Aktif. Sistem akan mengunci snapshot harga pelanggan, komisen 5% Al-Farhain dan 95% bahagian rakan.</p>

        <form id="formCreatePartnerOffer" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px;align-items:end;">
          <div>
            <label style="font-size:0.7rem;font-weight:800;color:#334155;">NO. INVOIS TEMPAHAN *</label>
            <input type="text" id="offerInvNo" required value="AMC-RKN-${Math.floor(5100 + Math.random() * 800)}" style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;font-family:monospace;font-weight:700;">
          </div>
          <div>
            <label style="font-size:0.7rem;font-weight:800;color:#334155;">SYARIKAT RAKAN DILULUSKAN *</label>
            <select id="offerCompanyId" required style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;">
              ${activeCompanies.map(c => `<option value="${c.id}">${escapeHtml(c.company_name)} (Komisen ${(c.default_commission_bps / 100).toFixed(0)}%)</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:0.7rem;font-weight:800;color:#334155;">LOKASI PENGAMBILAN *</label>
            <input type="text" id="offerOrigin" required value="Kuala Krai, Kelantan" style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;">
          </div>
          <div>
            <label style="font-size:0.7rem;font-weight:800;color:#334155;">DESTINASI HOSPITAL *</label>
            <input type="text" id="offerDest" required value="HRPZ II Kota Bharu" style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;">
          </div>
          <div>
            <label style="font-size:0.7rem;font-weight:800;color:#334155;">JUMLAH LAYAK KOMISEN (RM) *</label>
            <input type="number" id="offerEligibleRm" required value="500" min="50" step="10" style="width:100%;padding:8px 10px;border:1px solid #CBD5E1;border-radius:8px;font-size:0.8rem;margin-top:3px;font-weight:800;">
          </div>
          <div>
            <button type="submit" style="width:100%;padding:9px 14px;background:#C61E2F;color:#fff;border:none;border-radius:8px;font-weight:800;font-size:0.8rem;cursor:pointer;">
              🚀 Hantar Tawaran Tugasan
            </button>
          </div>
        </form>
      </div>

      <!-- Active & Historical Partner Trip Offers Table -->
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <h3 style="margin:0 0 12px 0;font-size:1rem;font-weight:800;color:#0F172A;">📋 Penjejakan Tawaran, Tugasan Lapangan &amp; Pengesahan Bukti Selesai</h3>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead>
              <tr style="background:#F8FAFC;border-bottom:1.5px solid #E2E8F0;text-align:left;color:#475569;">
                <th style="padding:10px;">No. Invois &amp; Syarikat</th>
                <th style="padding:10px;">Laluan &amp; Keperluan</th>
                <th style="padding:10px;">Snapshot Kewangan (5%)</th>
                <th style="padding:10px;">Status Tawaran &amp; Trip</th>
                <th style="padding:10px;">Ambulans / Bukti Selesai</th>
                <th style="padding:10px;text-align:right;">Tindakan HQ</th>
              </tr>
            </thead>
            <tbody>
              ${offers
                .map(
                  o => `
                <tr style="border-bottom:1px solid #F1F5F9;">
                  <td style="padding:10px;">
                    <div style="font-family:monospace;font-weight:900;color:#0F172A;">${escapeHtml(o.invoice_number)}</div>
                    <div style="font-size:0.73rem;font-weight:700;color:#334155;">${escapeHtml(o.company_name)}</div>
                  </td>
                  <td style="padding:10px;">
                    <div style="font-weight:700;color:#1E293B;">${escapeHtml(o.origin_area)} &rarr; ${escapeHtml(o.destination_area)}</div>
                    <div style="font-size:0.71rem;color:#64748B;">${o.distance_km} km · ${escapeHtml(o.required_crew)}</div>
                  </td>
                  <td style="padding:10px;">
                    <div>Invois: <b>${formatRmFromCents(o.customer_invoice_cents)}</b></div>
                    <div style="color:#C61E2F;font-weight:800;font-size:0.74rem;">Komisen (${o.commission_rate_bps / 100}%): ${formatRmFromCents(o.commission_amount_cents)}</div>
                    <div style="color:#047857;font-weight:800;font-size:0.74rem;">Bahagian Rakan: ${formatRmFromCents(o.partner_share_cents)}</div>
                  </td>
                  <td style="padding:10px;">
                    <div style="margin-bottom:4px;">Tawaran: ${statusBadgeHtml(o.offer_status)}</div>
                    <div>Operasi: ${statusBadgeHtml(o.trip_status)}</div>
                  </td>
                  <td style="padding:10px;font-size:0.73rem;">
                    ${
                      o.assigned_plate
                        ? `<div>🚑 <b>${escapeHtml(o.assigned_plate)}</b> · ${escapeHtml(o.assigned_driver_name)}</div>`
                        : `<div style="color:#94A3B8;">Belum ditetapkan ambulans</div>`
                    }
                    ${
                      o.handover_receiver_name
                        ? `<div style="color:#047857;margin-top:3px;">✓ Diserah kpd: <b>${escapeHtml(o.handover_receiver_name)}</b></div>`
                        : ''
                    }
                  </td>
                  <td style="padding:10px;text-align:right;">
                    ${
                      o.offer_status === 'Offered'
                        ? `<button type="button" class="btn-hq-withdraw-offer" data-offer-id="${o.id}" style="padding:5px 10px;background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA;border-radius:6px;font-size:0.72rem;font-weight:700;cursor:pointer;">Tarik Balik</button>`
                        : ''
                    }
                    ${
                      o.offer_status === 'Accepted' && o.trip_status !== 'Verified Completed' && o.trip_status !== 'Cancelled'
                        ? `<button type="button" class="btn-hq-verify-completion" data-offer-id="${o.id}" style="padding:6px 10px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:0.72rem;font-weight:800;cursor:pointer;">✓ Sahkan Selesai &amp; Akru Komisen</button>`
                        : ''
                    }
                    ${
                      o.trip_status === 'Verified Completed'
                        ? `<span style="font-size:0.72rem;font-weight:800;color:#047857;">✓ Komisen Diakru</span>`
                        : ''
                    }
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderHqTabKomisen() {
  const ledger = getPartnerCommissionLedger();
  const batches = getPartnerSettlementBatches();
  const adjustments = getPartnerFinancialAdjustments();
  const auditLogs = getPartnerAuditLogs();
  const companies = getPartnerCompanies();

  return `
    <div style="display:flex;flex-direction:column;gap:18px;">
      <!-- 1. Commission Ledger Table -->
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;">
          <div>
            <h3 style="margin:0;font-size:1rem;font-weight:800;color:#0F172A;">💰 Lejar Komisen 5% &amp; Obligasi Penyelesaian Rakan Ambulans</h3>
            <p style="margin:2px 0 0 0;font-size:0.75rem;color:#64748B;">Komisen hanya diakru selepas pengesahan selesai. Membezakan kutipan dalam talian CHIP HQ vs Tunai Rakan.</p>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" id="btnGenerateSettlementBatchHq" style="padding:8px 14px;background:#0F172A;color:#fff;border:none;border-radius:8px;font-size:0.78rem;font-weight:800;cursor:pointer;">
              📄 Jana Penyata Penyelesaian (MediCare)
            </button>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.79rem;">
            <thead>
              <tr style="background:#F8FAFC;border-bottom:1.5px solid #E2E8F0;text-align:left;color:#475569;">
                <th style="padding:10px;">Invois &amp; Syarikat</th>
                <th style="padding:10px;">Invois Pelanggan</th>
                <th style="padding:10px;">Asas Layak</th>
                <th style="padding:10px;">Komisen AFAMS (5%)</th>
                <th style="padding:10px;">Bahagian Rakan (95%)</th>
                <th style="padding:10px;">Saluran Kutipan</th>
                <th style="padding:10px;">Obligasi Bersih</th>
                <th style="padding:10px;">Status Penyelesaian</th>
              </tr>
            </thead>
            <tbody>
              ${ledger
                .map(
                  l => `
                <tr style="border-bottom:1px solid #F1F5F9;">
                  <td style="padding:10px;">
                    <div style="font-family:monospace;font-weight:800;">${escapeHtml(l.invoice_number)}</div>
                    <div style="font-size:0.7rem;color:#64748B;">${escapeHtml(l.company_name)}</div>
                  </td>
                  <td style="padding:10px;font-weight:700;">${formatRmFromCents(l.customer_invoice_cents)}</td>
                  <td style="padding:10px;">${formatRmFromCents(l.eligible_base_cents)}</td>
                  <td style="padding:10px;font-weight:800;color:#C61E2F;">${formatRmFromCents(l.commission_amount_cents)} (${(l.commission_rate_bps / 100).toFixed(0)}%)</td>
                  <td style="padding:10px;font-weight:800;color:#047857;">${formatRmFromCents(l.partner_share_cents)}</td>
                  <td style="padding:10px;font-size:0.73rem;font-weight:700;">${escapeHtml(l.collection_channel)}</td>
                  <td style="padding:10px;font-size:0.74rem;">
                    ${
                      l.payable_to_partner_cents > 0
                        ? `<span style="color:#047857;font-weight:800;">HQ Bayar Rakan: ${formatRmFromCents(l.payable_to_partner_cents)}</span>`
                        : l.receivable_from_partner_cents > 0
                        ? `<span style="color:#B45309;font-weight:800;">Tuntut Dari Rakan: ${formatRmFromCents(l.receivable_from_partner_cents)}</span>`
                        : `<span style="color:#64748B;">Menunggu Kutipan</span>`
                    }
                  </td>
                  <td style="padding:10px;">${statusBadgeHtml(l.settlement_status)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. Settlement Batches & Financial Adjustments -->
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;">
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
          <h3 style="margin:0 0 10px 0;font-size:0.95rem;font-weight:800;color:#0F172A;">📑 Penyata Penyelesaian Manual (Settlement Batches)</h3>
          ${
            batches.length === 0
              ? `<div style="padding:12px;background:#F8FAFC;border-radius:10px;font-size:0.78rem;color:#64748B;">Belum ada penyata penyelesaian dijana. Klik "Jana Penyata Penyelesaian" di atas untuk mengumpulkan trip yang belum selesai.</div>`
              : batches
                  .map(
                    b => `
                <div style="padding:12px;border:1px solid #E2E8F0;border-radius:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <div style="font-weight:800;color:#0F172A;">${escapeHtml(b.batch_reference)} · ${escapeHtml(b.company_name)} ${statusBadgeHtml(b.status)}</div>
                    <div style="font-size:0.74rem;color:#475569;margin-top:3px;">
                      Trip: ${b.total_trips} · Komisen 5%: <b>${formatRmFromCents(b.total_commission_cents)}</b> · Penyelesaian Bersih: <b style="color:#047857;">${formatRmFromCents(b.net_settlement_cents)}</b>
                    </div>
                    ${b.payment_reference ? `<div style="font-size:0.7rem;color:#047857;">Rujukan Bank: ${escapeHtml(b.payment_reference)}</div>` : ''}
                  </div>
                  ${
                    b.status !== 'Settled'
                      ? `<button type="button" class="btn-complete-settlement-batch" data-batch-id="${b.id}" style="padding:6px 12px;background:#059669;color:#fff;border:none;border-radius:8px;font-size:0.74rem;font-weight:800;cursor:pointer;">✓ Tandakan Selesai Dibayar</button>`
                      : ''
                  }
                </div>
              `
                  )
                  .join('')
          }
        </div>

        <!-- Add Financial Adjustment Form -->
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
          <h3 style="margin:0 0 8px 0;font-size:0.95rem;font-weight:800;color:#0F172A;">⚖️ Rekod Pelarasan Kewangan / Pulangan Wang</h3>
          <form id="formCreateAdjustment" style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <select id="adjCompanyId" style="padding:7px;border:1px solid #CBD5E1;border-radius:7px;font-size:0.78rem;">
                ${companies.map(c => `<option value="${c.id}">${escapeHtml(c.company_name)}</option>`).join('')}
              </select>
              <select id="adjType" style="padding:7px;border:1px solid #CBD5E1;border-radius:7px;font-size:0.78rem;">
                <option value="Dispute Credit">Dispute Credit (+Rakan)</option>
                <option value="Dispute Debit">Dispute Debit (-Rakan)</option>
                <option value="Partial Refund">Pulangan Sebahagian</option>
                <option value="Cancellation Charge">Caj Pembatalan</option>
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <input type="text" id="adjInvNo" placeholder="No. Invois (Cth: AMC-RKN-5001)" style="padding:7px;border:1px solid #CBD5E1;border-radius:7px;font-size:0.78rem;">
              <input type="number" id="adjPartnerShareRm" required placeholder="Nilai Pelarasan RM (Cth: 25)" step="1" style="padding:7px;border:1px solid #CBD5E1;border-radius:7px;font-size:0.78rem;">
            </div>
            <input type="text" id="adjReason" required placeholder="Sebab rasmi pelarasan (Wajib untuk jejak audit)" style="padding:7px;border:1px solid #CBD5E1;border-radius:7px;font-size:0.78rem;">
            <button type="submit" style="padding:8px;background:#334155;color:#fff;border:none;border-radius:8px;font-size:0.78rem;font-weight:800;cursor:pointer;">
              + Simpan Pelarasan Berkelulusan
            </button>
          </form>
          ${
            adjustments.length > 0
              ? `<div style="margin-top:10px;font-size:0.73rem;color:#475569;">Pelarasan Terkini: ${adjustments
                  .slice(0, 2)
                  .map(a => `<b>${escapeHtml(a.adjustment_reference)}</b> (${escapeHtml(a.adjustment_type)}: ${formatRmFromCents(a.partner_share_adjustment_cents)})`)
                  .join(', ')}</div>`
              : ''
          }
        </div>
      </div>

      <!-- 3. Audit History -->
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <h3 style="margin:0 0 10px 0;font-size:0.95rem;font-weight:800;color:#0F172A;">🛡️ Log Audit Rakan Ambulans &amp; Kewangan</h3>
        <div style="max-height:220px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.76rem;">
            <thead>
              <tr style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;text-align:left;">
                <th style="padding:7px;">Masa</th>
                <th style="padding:7px;">Pelaku &amp; Peranan</th>
                <th style="padding:7px;">Syarikat / Invois</th>
                <th style="padding:7px;">Tindakan</th>
                <th style="padding:7px;">Catatan / Sebab</th>
              </tr>
            </thead>
            <tbody>
              ${auditLogs
                .slice(0, 15)
                .map(
                  log => `
                <tr style="border-bottom:1px solid #F1F5F9;">
                  <td style="padding:7px;color:#64748B;">${new Date(log.created_at).toLocaleString('ms-MY')}</td>
                  <td style="padding:7px;font-weight:700;">${escapeHtml(log.actor_name)} (${escapeHtml(log.actor_role)})</td>
                  <td style="padding:7px;">${escapeHtml(log.company_name || '-')} ${log.invoice_number ? `[${escapeHtml(log.invoice_number)}]` : ''}</td>
                  <td style="padding:7px;font-family:monospace;font-weight:800;color:#C61E2F;">${escapeHtml(log.action)}</td>
                  <td style="padding:7px;color:#334155;">${escapeHtml(log.reason)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function bindActiveHqTabEvents(root) {
  // Search & filter on Syarikat tab
  const searchIn = root.querySelector('#inputSearchPartnerComp');
  if (searchIn) {
    searchIn.addEventListener('input', e => {
      companySearchQuery = e.target.value;
      renderHqRakanAmbulansView();
    });
  }

  const statusSel = root.querySelector('#selectFilterPartnerStatus');
  if (statusSel) {
    statusSel.addEventListener('change', e => {
      companyStatusFilter = e.target.value;
      renderHqRakanAmbulansView();
    });
  }

  // Company Approve / Suspend / Reject buttons
  root.querySelectorAll('.btn-hq-comp-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const compId = btn.dataset.compId;
      const action = btn.dataset.action;
      let reason = '';
      if (['Minta Pembetulan', 'Tolak', 'Gantung'].includes(action)) {
        reason = window.prompt(`Sila masukkan sebab rasmi untuk tindakan "${action}":`, 'Semakan dokumen KKM / insurans diperlukan') || '';
        if (!reason.trim()) return;
      }
      const res = reviewPartnerCompany(hqActor, { companyId: compId, action, reason });
      if (!res.success) {
        alert(res.error);
        return;
      }
      renderHqRakanAmbulansView();
      renderPartnerPortalView();
    });
  });

  // Preview Partner Portal for a company
  root.querySelectorAll('.btn-open-partner-portal-as').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.compEmail;
      currentPartnerActor = { email, name: email.split('@')[0], role: 'partner_admin' };
      renderPartnerPortalView();
      const navBtn = document.getElementById('navBtnPartnerPortal');
      if (navBtn) navBtn.click();
    });
  });

  // Create Partner Invitation Form
  const formInv = root.querySelector('#formCreatePartnerInvite');
  if (formInv) {
    formInv.addEventListener('submit', e => {
      e.preventDefault();
      const commPct = Number(document.getElementById('invCompCommPct')?.value || 5);
      const res = createPartnerInvitation(hqActor, {
        invitation_type: 'partner_admin',
        company_name: document.getElementById('invCompName')?.value,
        ssm_registration_no: document.getElementById('invCompSsm')?.value,
        state_coverage: document.getElementById('invCompState')?.value,
        recipient_name: document.getElementById('invRecipName')?.value,
        recipient_phone: document.getElementById('invRecipPhone')?.value,
        recipient_email: document.getElementById('invRecipEmail')?.value,
        default_commission_bps: Math.round(commPct * 100)
      });
      if (!res.success) {
        alert(res.error);
        return;
      }
      renderHqRakanAmbulansView();
      const alertEl = document.getElementById('partnerGeneratedCodeAlert');
      if (alertEl) {
        alertEl.style.display = 'block';
        alertEl.innerHTML = `✅ <b>Kod Jemputan Rakan Berjaya Dijana (Dipaparkan Sekali Sahaja):</b> <code style="font-size:1rem;font-weight:900;background:#fff;padding:2px 8px;border-radius:6px;">${escapeHtml(
          res.shareableCodeOnce
        )}</code><br><span style="font-size:0.72rem;">Sila salin dan kongsikan kepada ${escapeHtml(
          res.invitation.recipient_email
        )}. Selepas ini kod disimpan dalam bentuk hash SHA-256 (${escapeHtml(res.invitation.masked_code)}).</span>`;
      }
    });
  }

  // Approve/Reject Vehicle or Driver
  root.querySelectorAll('.btn-hq-res-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const resourceType = btn.dataset.resType;
      const resourceId = btn.dataset.resId;
      const action = btn.dataset.action;
      let reason = 'Diluluskan oleh HQ';
      if (action === 'Tolak') {
        reason = window.prompt('Sila nyatakan sebab penolakan:', 'Dokumen cukai jalan / lesen tidak lengkap') || '';
        if (!reason.trim()) return;
      }
      const res = reviewPartnerResource(hqActor, { resourceType, resourceId, action, reason });
      if (!res.success) {
        alert(res.error);
        return;
      }
      renderHqRakanAmbulansView();
      renderPartnerPortalView();
    });
  });

  // Create Partner Trip Offer
  const formOffer = root.querySelector('#formCreatePartnerOffer');
  if (formOffer) {
    formOffer.addEventListener('submit', e => {
      e.preventDefault();
      const eligibleRm = Number(document.getElementById('offerEligibleRm')?.value || 500);
      const res = createPartnerTripOffer(hqActor, {
        companyId: document.getElementById('offerCompanyId')?.value,
        booking: {
          invoice_number: document.getElementById('offerInvNo')?.value,
          origin_name: document.getElementById('offerOrigin')?.value,
          destination_name: document.getElementById('offerDest')?.value,
          distance_km: 26.5,
          base_fare: eligibleRm
        }
      });
      if (!res.success) {
        alert(res.error);
        return;
      }
      renderHqRakanAmbulansView();
      renderPartnerPortalView();
    });
  }

  // Withdraw Offer
  root.querySelectorAll('.btn-hq-withdraw-offer').forEach(btn => {
    btn.addEventListener('click', () => {
      const offerId = btn.dataset.offerId;
      const res = withdrawPartnerTripOffer(hqActor, { offerId, reason: 'Ditarik balik oleh pegawai dispatch HQ' });
      if (!res.success) {
        alert(res.error);
        return;
      }
      renderHqRakanAmbulansView();
      renderPartnerPortalView();
    });
  });

  // Verify Trip Completion & Accrue 5% Commission
  root.querySelectorAll('.btn-hq-verify-completion').forEach(btn => {
    btn.addEventListener('click', () => {
      const offerId = btn.dataset.offerId;
      const channel =
        window.prompt(
          'Pilih saluran kutipan bayaran pelanggan:\n1. chip_online_hq (Bayaran Online CHIP ke HQ)\n2. cash_collected_hq (Tunai diterima HQ)\n3. cash_collected_partner (Tunai dikutip oleh Rakan)',
          'chip_online_hq'
        ) || 'chip_online_hq';
      const res = verifyPartnerTripCompletion(hqActor, {
        offerId,
        collectionChannel: channel.trim()
      });
      if (!res.success) {
        alert(res.error);
        return;
      }
      alert(
        `✅ Pengesahan Selesai Berjaya!\nKomisen 5% AFAMS: ${formatRmFromCents(
          res.ledgerEntry.commission_amount_cents
        )}\nBahagian Rakan (95%): ${formatRmFromCents(res.ledgerEntry.partner_share_cents)}`
      );
      renderHqRakanAmbulansView();
      renderPartnerPortalView();
    });
  });

  // Generate Settlement Batch
  const btnGenBatch = root.querySelector('#btnGenerateSettlementBatchHq');
  if (btnGenBatch) {
    btnGenBatch.addEventListener('click', () => {
      const res = createSettlementBatch(hqActor, {
        companyId: 'comp-medicare-kb',
        notes: 'Penyata Penyelesaian Disemak HQ'
      });
      if (!res.success) {
        alert(res.error);
        return;
      }
      renderHqRakanAmbulansView();
      renderPartnerPortalView();
    });
  }

  // Complete Settlement Batch
  root.querySelectorAll('.btn-complete-settlement-batch').forEach(btn => {
    btn.addEventListener('click', () => {
      const batchId = btn.dataset.batchId;
      const ref = window.prompt('Masukkan No. Rujukan Transaksi Bank / Resit Penyelesaian:', `MBB-FT-${Date.now().toString().slice(-6)}`);
      if (!ref) return;
      const res = completeSettlementBatch(hqActor, { batchId, paymentReference: ref });
      if (!res.success) {
        alert(res.error);
        return;
      }
      renderHqRakanAmbulansView();
      renderPartnerPortalView();
    });
  });

  // Create Financial Adjustment
  const formAdj = root.querySelector('#formCreateAdjustment');
  if (formAdj) {
    formAdj.addEventListener('submit', e => {
      e.preventDefault();
      const adjType = document.getElementById('adjType')?.value;
      const rmVal = Number(document.getElementById('adjPartnerShareRm')?.value || 0);
      const signedCents = adjType === 'Dispute Debit' || adjType === 'Partial Refund' ? -Math.abs(rmToCents(rmVal)) : rmToCents(rmVal);
      const res = createFinancialAdjustment(hqActor, {
        companyId: document.getElementById('adjCompanyId')?.value,
        invoiceNumber: document.getElementById('adjInvNo')?.value || null,
        adjustmentType: adjType,
        partnerShareAdjustmentCents: signedCents,
        reason: document.getElementById('adjReason')?.value
      });
      if (!res.success) {
        alert(res.error);
        return;
      }
      renderHqRakanAmbulansView();
      renderPartnerPortalView();
    });
  }
}

/* =========================================================================
   PARTNER ADMINISTRATOR PORTAL (COMPANY-SCOPED 6 TABS)
   ========================================================================= */

export function renderPartnerPortalView() {
  const root = document.getElementById('partnerPortalDynamicRoot');
  if (!root) return;

  const scoped = getPartnerPortalScopedData(currentPartnerActor);
  if (!scoped.success) {
    root.innerHTML = `
      <div style="background:#FEF2F2;border:1.5px solid #EF4444;border-radius:16px;padding:24px;color:#991B1B;">
        <h3 style="margin:0 0 8px 0;font-weight:800;">🔒 Akses Portal Rakan Ambulans Disekat</h3>
        <p style="margin:0;font-size:0.86rem;">${escapeHtml(scoped.error)}</p>
        <div style="margin-top:14px;">
          <button type="button" id="btnResetPartnerActorDefault" style="padding:8px 14px;background:#C61E2F;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">
            Log Masuk Semula Sebagai Pentadbir MediCare (Aktif)
          </button>
        </div>
      </div>
    `;
    const resetBtn = root.querySelector('#btnResetPartnerActorDefault');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        currentPartnerActor = { email: 'admin.medicare@gmail.com', name: 'En. Wan Kamarul Ariffin', role: 'partner_admin' };
        renderPartnerPortalView();
      });
    }
    return;
  }

  const { company, vehicles, drivers, offers, ledger, batches } = scoped;
  const pendingOffers = offers.filter(o => o.offer_status === 'Offered');
  const activeTrips = offers.filter(o => o.offer_status === 'Accepted' && o.trip_status !== 'Verified Completed' && o.trip_status !== 'Cancelled');
  const totalShareCents = ledger.reduce((acc, l) => acc + l.partner_share_cents, 0);

  root.innerHTML = `
    <!-- Company Identity Banner -->
    <div style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);color:#fff;border-radius:16px;padding:18px 20px;margin-bottom:18px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="background:#C61E2F;color:#fff;font-size:0.7rem;font-weight:900;padding:3px 9px;border-radius:9999px;">PORTAL RAKAN AMBULANS RASMI</span>
          <span style="font-size:0.76rem;color:#94A3B8;">Kod: ${escapeHtml(company.company_code)} · SSM: ${escapeHtml(company.ssm_registration_no)}</span>
        </div>
        <h2 style="margin:6px 0 2px 0;font-size:1.3rem;font-weight:900;">${escapeHtml(company.company_name)}</h2>
        <div style="font-size:0.78rem;color:#CBD5E1;">📍 Liputan: ${escapeHtml(company.state_coverage)} · Kadar Komisen AFAMS: <b>${(company.default_commission_bps / 100).toFixed(1)}%</b> (Bahagian Rakan: <b>${(100 - company.default_commission_bps / 100).toFixed(1)}%</b>)</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.72rem;color:#94A3B8;">Pentadbir Bertugas (Skop Syarikat Sendiri Sahaja)</div>
        <div style="font-weight:800;font-size:0.88rem;">👤 ${escapeHtml(currentPartnerActor.email)}</div>
      </div>
    </div>

    <!-- 6 Partner Portal Sub-Tabs -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;border-bottom:1px solid #E2E8F0;padding-bottom:12px;">
      ${[
        { id: 'dashboard', label: '📊 Dashboard' },
        { id: 'tawaran', label: `🔔 Tawaran Tugasan (${pendingOffers.length})` },
        { id: 'aktif', label: `🚑 Tugasan Aktif (${activeTrips.length})` },
        { id: 'armada', label: `🚐 Armada & Pemandu (${vehicles.length}/${drivers.length})` },
        { id: 'pendapatan', label: '💳 Pendapatan & Penyelesaian' },
        { id: 'profil', label: '🏢 Profil Syarikat' }
      ]
        .map(
          t => `
        <button type="button" class="partner-portal-tab-btn" data-ptab="${t.id}"
          style="padding:9px 15px;border-radius:10px;font-size:0.8rem;font-weight:800;cursor:pointer;border:1.5px solid ${
            activePartnerTab === t.id ? '#C61E2F' : '#E2E8F0'
          };background:${activePartnerTab === t.id ? '#C61E2F' : '#FFFFFF'};color:${
            activePartnerTab === t.id ? '#FFFFFF' : '#334155'
          };">
          ${t.label}
        </button>
      `
        )
        .join('')}
    </div>

    <!-- Active Partner Tab Content -->
    <div>
      ${renderActivePartnerTabHtml({ company, vehicles, drivers, offers, ledger, batches, totalShareCents })}
    </div>
  `;

  root.querySelectorAll('.partner-portal-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activePartnerTab = btn.dataset.ptab;
      renderPartnerPortalView();
    });
  });

  bindPartnerPortalEvents(root, { company, vehicles, drivers });
}

function renderActivePartnerTabHtml({ company, vehicles, drivers, offers, ledger, batches, totalShareCents }) {
  if (activePartnerTab === 'dashboard') {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:18px;">
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;">
          <div style="font-size:0.72rem;font-weight:800;color:#64748B;">TAWARAN MENUNGGU TINDAKAN</div>
          <div style="font-size:1.6rem;font-weight:900;color:#B45309;margin-top:4px;">${offers.filter(o => o.offer_status === 'Offered').length}</div>
        </div>
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;">
          <div style="font-size:0.72rem;font-weight:800;color:#64748B;">AMBULANS &amp; PEMANDU AKTIF</div>
          <div style="font-size:1.6rem;font-weight:900;color:#0F172A;margin-top:4px;">${vehicles.filter(v => v.approval_status === 'Aktif').length} Unit / ${drivers.filter(d => d.approval_status === 'Aktif').length} Krew</div>
        </div>
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;">
          <div style="font-size:0.72rem;font-weight:800;color:#64748B;">PENDAPATAN BERSIH RAKAN (95%)</div>
          <div style="font-size:1.6rem;font-weight:900;color:#047857;margin-top:4px;">${formatRmFromCents(totalShareCents)}</div>
        </div>
      </div>
    `;
  }

  if (activePartnerTab === 'tawaran') {
    const incoming = offers.filter(o => o.offer_status === 'Offered');
    return `
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <h3 style="margin:0 0 4px 0;font-size:1rem;font-weight:800;color:#0F172A;">🔔 Tawaran Tugasan Daripada HQ Al-Farhain</h3>
        <p style="margin:0 0 14px 0;font-size:0.75rem;color:#64748B;">Maklumat peribadi pesakit dirahsiakan sehingga tawaran diterima. Harga &amp; komisen 5% adalah tetap mengikut terma tawaran.</p>
        ${
          incoming.length === 0
            ? `<div style="padding:18px;background:#F8FAFC;border-radius:12px;font-size:0.82rem;color:#64748B;">Tiada tawaran baharu yang menunggu keputusan anda.</div>`
            : incoming
                .map(
                  o => `
              <div style="padding:16px;border:1.5px solid #FDE68A;background:#FFFBEB;border-radius:14px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <span style="font-family:monospace;font-weight:900;font-size:0.9rem;color:#0F172A;">${escapeHtml(o.invoice_number)}</span>
                  ${statusBadgeHtml(o.offer_status)}
                </div>
                <div style="font-weight:800;font-size:0.92rem;color:#0F172A;">📍 Kawasan Laluan: ${escapeHtml(o.origin_area)} &rarr; ${escapeHtml(o.destination_area)} (${o.distance_km} km)</div>
                <div style="font-size:0.78rem;color:#475569;margin-top:4px;">
                  👨‍⚕️ Keperluan Krew: <b>${escapeHtml(o.required_crew)}</b> · 🩹 Alatan: <b>${escapeHtml(o.required_equipment)}</b><br>
                  🔒 Data Pesakit: <i>${escapeHtml(o.patient_name)} (${escapeHtml(o.patient_phone)})</i>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;padding:10px;background:#fff;border-radius:10px;border:1px solid #FDE68A;font-size:0.8rem;">
                  <div>Harga Dipersetujui: <b>${formatRmFromCents(o.customer_invoice_cents)}</b></div>
                  <div style="color:#C61E2F;">Komisen AFAMS (${o.commission_rate_bps / 100}%): <b>-${formatRmFromCents(o.commission_amount_cents)}</b></div>
                  <div style="color:#047857;font-weight:900;">Bahagian Syarikat Anda (95%): ${formatRmFromCents(o.partner_share_cents)}</div>
                </div>
                <div style="display:flex;gap:10px;margin-top:12px;">
                  <button type="button" class="btn-partner-respond-offer" data-offer-id="${o.id}" data-decision="Accept" style="padding:8px 16px;background:#059669;color:#fff;border:none;border-radius:8px;font-weight:800;font-size:0.8rem;cursor:pointer;">
                    ✓ Terima Tawaran Tugasan
                  </button>
                  <button type="button" class="btn-partner-respond-offer" data-offer-id="${o.id}" data-decision="Decline" style="padding:8px 16px;background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA;border-radius:8px;font-weight:800;font-size:0.8rem;cursor:pointer;">
                    ✕ Tolak Tawaran
                  </button>
                </div>
              </div>
            `
                )
                .join('')
        }
      </div>
    `;
  }

  if (activePartnerTab === 'aktif') {
    const accepted = offers.filter(o => o.offer_status === 'Accepted');
    const availVehicles = vehicles.filter(v => v.approval_status === 'Aktif' && v.availability_status === 'Tersedia');
    const availDrivers = drivers.filter(d => d.approval_status === 'Aktif' && d.availability_status === 'Tersedia');

    return `
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <h3 style="margin:0 0 12px 0;font-size:1rem;font-weight:800;color:#0F172A;">🚑 Pengurusan Tugasan Diterima &amp; Penetapan Ambulans/Pemandu</h3>
        ${accepted
          .map(
            o => `
          <div style="padding:14px;border:1px solid #E2E8F0;border-radius:12px;margin-bottom:12px;background:#F8FAFC;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <span style="font-family:monospace;font-weight:900;">${escapeHtml(o.invoice_number)}</span> ·
                <b>${escapeHtml(o.origin_area)} &rarr; ${escapeHtml(o.destination_area)}</b>
              </div>
              ${statusBadgeHtml(o.trip_status)}
            </div>
            <div style="font-size:0.78rem;color:#1E293B;margin-top:6px;">
              👤 Pesakit (Dibuka selepas terima): <b>${escapeHtml(o.patient_name)}</b> · 📞 <b>${escapeHtml(o.patient_phone)}</b><br>
              💰 Bahagian Rakan: <b style="color:#047857;">${formatRmFromCents(o.partner_share_cents)}</b>
            </div>

            ${
              !o.assigned_vehicle_id
                ? `
              <div style="margin-top:10px;padding:10px;background:#fff;border:1px dashed #CBD5E1;border-radius:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                <select id="selVeh_${o.id}" style="padding:6px 10px;border:1px solid #CBD5E1;border-radius:6px;font-size:0.78rem;">
                  ${availVehicles.map(v => `<option value="${v.id}">${escapeHtml(v.plate_number)} (${escapeHtml(v.model)})</option>`).join('')}
                </select>
                <select id="selDrv_${o.id}" style="padding:6px 10px;border:1px solid #CBD5E1;border-radius:6px;font-size:0.78rem;">
                  ${availDrivers.map(d => `<option value="${d.id}">${escapeHtml(d.full_name)} (${escapeHtml(d.clinical_qualification)})</option>`).join('')}
                </select>
                <button type="button" class="btn-partner-assign-res" data-offer-id="${o.id}" style="padding:6px 12px;background:#C61E2F;color:#fff;border:none;border-radius:6px;font-size:0.76rem;font-weight:800;cursor:pointer;">
                  Tetapkan Ambulans &amp; Pemandu
                </button>
              </div>
            `
                : `
              <div style="margin-top:8px;font-size:0.78rem;color:#047857;font-weight:700;">
                🚑 Unit Ditetapkan: ${escapeHtml(o.assigned_plate)} · Pemandu: ${escapeHtml(o.assigned_driver_name)} (${escapeHtml(o.assigned_driver_phone)})
              </div>
              ${
                o.trip_status !== 'Completed Pending Review' && o.trip_status !== 'Verified Completed'
                  ? `
                <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
                  <button type="button" class="btn-partner-prog" data-offer-id="${o.id}" data-status="En Route" style="padding:5px 10px;background:#1D4ED8;color:#fff;border:none;border-radius:6px;font-size:0.72rem;font-weight:700;cursor:pointer;">1. Menuju Lokasi</button>
                  <button type="button" class="btn-partner-prog" data-offer-id="${o.id}" data-status="On Scene" style="padding:5px 10px;background:#1D4ED8;color:#fff;border:none;border-radius:6px;font-size:0.72rem;font-weight:700;cursor:pointer;">2. Tiba di Lokasi</button>
                  <button type="button" class="btn-partner-prog" data-offer-id="${o.id}" data-status="In Transit" style="padding:5px 10px;background:#1D4ED8;color:#fff;border:none;border-radius:6px;font-size:0.72rem;font-weight:700;cursor:pointer;">3. Dalam Perjalanan Hospital</button>
                  <button type="button" class="btn-partner-prog" data-offer-id="${o.id}" data-status="Completed Pending Review" style="padding:5px 10px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:0.72rem;font-weight:700;cursor:pointer;">4. Hantar Bukti Selesai</button>
                </div>
              `
                  : ''
              }
            `
            }
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  if (activePartnerTab === 'armada') {
    return `
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <h3 style="margin:0 0 10px 0;font-size:1rem;font-weight:800;color:#0F172A;">🚐 Senarai Armada &amp; Pemandu Syarikat Anda</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <h4 style="margin:0 0 8px 0;font-size:0.86rem;font-weight:800;">Kenderaan Ambulans (${vehicles.length})</h4>
            ${vehicles
              .map(
                v => `
              <div style="padding:10px;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:8px;font-size:0.78rem;">
                <b>${escapeHtml(v.plate_number)}</b> · ${escapeHtml(v.model)} ${statusBadgeHtml(v.approval_status)} ${statusBadgeHtml(v.availability_status)}
              </div>
            `
              )
              .join('')}
          </div>
          <div>
            <h4 style="margin:0 0 8px 0;font-size:0.86rem;font-weight:800;">Pemandu &amp; Krew (${drivers.length})</h4>
            ${drivers
              .map(
                d => `
              <div style="padding:10px;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:8px;font-size:0.78rem;">
                <b>${escapeHtml(d.full_name)}</b> · ${escapeHtml(d.clinical_qualification)} ${statusBadgeHtml(d.approval_status)} ${statusBadgeHtml(d.availability_status)}
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  if (activePartnerTab === 'pendapatan') {
    return `
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;">
        <h3 style="margin:0 0 10px 0;font-size:1rem;font-weight:800;color:#0F172A;">💳 Penyata Pendapatan &amp; Penyelesaian Syarikat</h3>
        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
          <thead>
            <tr style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;text-align:left;">
              <th style="padding:8px;">Invois</th>
              <th style="padding:8px;">Jumlah Trip</th>
              <th style="padding:8px;">Komisen AFAMS (5%)</th>
              <th style="padding:8px;">Bahagian Syarikat (95%)</th>
              <th style="padding:8px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${ledger
              .map(
                l => `
              <tr style="border-bottom:1px solid #F1F5F9;">
                <td style="padding:8px;font-family:monospace;font-weight:800;">${escapeHtml(l.invoice_number)}</td>
                <td style="padding:8px;">${formatRmFromCents(l.customer_invoice_cents)}</td>
                <td style="padding:8px;color:#C61E2F;">-${formatRmFromCents(l.commission_amount_cents)}</td>
                <td style="padding:8px;font-weight:800;color:#047857;">${formatRmFromCents(l.partner_share_cents)}</td>
                <td style="padding:8px;">${statusBadgeHtml(l.settlement_status)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Profil Syarikat
  return `
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;font-size:0.82rem;line-height:1.6;">
      <h3 style="margin:0 0 10px 0;font-size:1rem;font-weight:800;color:#0F172A;">🏢 Profil Rasmi Syarikat Rakan</h3>
      <div><b>Nama Syarikat:</b> ${escapeHtml(company.company_name)}</div>
      <div><b>No. Pendaftaran SSM:</b> ${escapeHtml(company.ssm_registration_no)}</div>
      <div><b>No. Permit KKM:</b> ${escapeHtml(company.kkm_permit_no)}</div>
      <div><b>Alamat Berdaftar:</b> ${escapeHtml(company.address)}</div>
      <div><b>Akaun Bank Penyelesaian:</b> ${escapeHtml(company.bank_name)} · ${escapeHtml(company.bank_account_no)} (${escapeHtml(company.bank_account_holder)})</div>
      <div><b>Status Kelulusan HQ:</b> ${statusBadgeHtml(company.approval_status)}</div>
    </div>
  `;
}

function bindPartnerPortalEvents(root) {
  // Accept / Decline Offer
  root.querySelectorAll('.btn-partner-respond-offer').forEach(btn => {
    btn.addEventListener('click', () => {
      const offerId = btn.dataset.offerId;
      const decision = btn.dataset.decision;
      let declineReason = '';
      if (decision === 'Decline') {
        declineReason = window.prompt('Sila nyatakan sebab menolak tawaran:', 'Semua unit ambulans sedang dalam tugasan') || '';
      }
      const res = respondToPartnerTripOffer(currentPartnerActor, { offerId, decision, declineReason });
      if (!res.success) {
        alert(res.error);
        return;
      }
      if (decision === 'Accept') activePartnerTab = 'aktif';
      renderPartnerPortalView();
      renderHqRakanAmbulansView();
    });
  });

  // Assign Vehicle & Driver
  root.querySelectorAll('.btn-partner-assign-res').forEach(btn => {
    btn.addEventListener('click', () => {
      const offerId = btn.dataset.offerId;
      const vehicleId = document.getElementById(`selVeh_${offerId}`)?.value;
      const driverId = document.getElementById(`selDrv_${offerId}`)?.value;
      const res = assignPartnerResourcesToTrip(currentPartnerActor, { offerId, vehicleId, driverId });
      if (!res.success) {
        alert(res.error);
        return;
      }
      renderPartnerPortalView();
      renderHqRakanAmbulansView();
    });
  });

  // Update Operational Trip Progress
  root.querySelectorAll('.btn-partner-prog').forEach(btn => {
    btn.addEventListener('click', () => {
      const offerId = btn.dataset.offerId;
      const newStatus = btn.dataset.status;
      let completionEvidence = {};
      if (newStatus === 'Completed Pending Review') {
        const receiver = window.prompt('Nama kakitangan hospital yang menerima pesakit:', 'SN Siti Hajar (Kecemasan HUSM)');
        if (!receiver) return;
        const notes = window.prompt('Catatan serahan pesakit:', 'Pesakit diserahkan dalam keadaan stabil bersama rekod vital.');
        completionEvidence = {
          handover_receiver_name: receiver,
          completion_notes: notes || 'Serahan selesai',
          completion_odometer_km: 25.0
        };
      }
      const res = updatePartnerTripProgress(currentPartnerActor, { offerId, newStatus, completionEvidence });
      if (!res.success) {
        alert(res.error);
        return;
      }
      renderPartnerPortalView();
      renderHqRakanAmbulansView();
    });
  });
}

