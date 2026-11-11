// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - PERKHIDMATAN & SERVIS MODULE
// Faithful implementation of Mockup media_1794384691751_b6bfcb0e.jpg
// Manages Service Packages, Equipment Catalogue, Staff Roles & Audit Logs.
// =========================================================================

import {
  getServicePackagesList,
  getServicePackageByIdOrCode,
  saveServicePackage,
  duplicateServicePackage,
  archiveServicePackage,
  deleteServicePackage,
  getServiceEquipmentList,
  saveServiceEquipment,
  deleteServiceEquipment,
  getServiceStaffRolesList,
  saveServiceStaffRole,
  deleteServiceStaffRole,
  getServiceAuditLogs
} from '../services/servicePackageManager.js';

let activeSubTab = 'packages'; // 'packages' | 'equipment' | 'roles' | 'audit'
let selectedPackageId = 'pkg-1'; // For preview highlighting
let drawerMode = 'edit'; // 'add' | 'edit'
let editingPackageId = null;
let currentEditingVersion = 1;

// Drawer form state for inclusions
let drawerSelectedEquipIds = [];
let drawerSelectedRoleIds = [];

// Actor profile for audit logging
function getCurrentAdminActor() {
  let email = 'admin@alfarhain.my';
  let name = 'Pentadbir Sistem';
  try {
    const raw = localStorage.getItem('amc_portal_operator') || localStorage.getItem('amc_user_profile');
    if (raw) {
      const p = JSON.parse(raw);
      if (p.email) email = p.email;
      if (p.name || p.full_name) name = p.name || p.full_name;
    }
  } catch (e) {}
  return { email, name, role: 'admin' };
}

export function initPerkhidmatanServisModule() {
  const container = document.getElementById('perkhidmatanServisDynamicRoot');
  if (!container) return;

  renderPerkhidmatanServisView();
}

/**
 * Main Layout Renderer
 */
export function renderPerkhidmatanServisView() {
  const container = document.getElementById('perkhidmatanServisDynamicRoot');
  if (!container) return;

  container.innerHTML = `
    <div class="ps-module-wrapper">
      <!-- Header Row -->
      <div class="ps-header-row">
        <div>
          <h1 class="ps-main-title">Perkhidmatan &amp; Servis</h1>
          <p class="ps-main-subtitle">Urus pakej, alatan dan staf dalam satu tempat.</p>
        </div>
        <button type="button" class="btn-ps-primary" id="btnPsHeaderAction">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span id="psHeaderActionLabel">+ Tambah pakej</span>
        </button>
      </div>

      <!-- 4 Tabs Bar -->
      <div class="ps-nav-tabs-bar">
        <button type="button" class="ps-tab-btn ${activeSubTab === 'packages' ? 'active' : ''}" data-tab="packages">Pakej perkhidmatan</button>
        <button type="button" class="ps-tab-btn ${activeSubTab === 'equipment' ? 'active' : ''}" data-tab="equipment">Alatan</button>
        <button type="button" class="ps-tab-btn ${activeSubTab === 'roles' ? 'active' : ''}" data-tab="roles">Peranan staf</button>
        <button type="button" class="ps-tab-btn ${activeSubTab === 'audit' ? 'active' : ''}" data-tab="audit">Log perubahan</button>
      </div>

      <!-- Filter Bar -->
      <div class="ps-filter-bar">
        <div class="ps-search-wrap">
          <svg class="ps-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748B" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="psSearchInput" class="ps-search-input" placeholder="Cari pakej...">
        </div>
        <div class="ps-select-wrap">
          <select id="psStatusFilter" class="ps-select-box">
            <option value="all">Semua status</option>
            <option value="Active">Aktif</option>
            <option value="Draft">Draf</option>
            <option value="Inactive">Tidak Aktif</option>
            <option value="Archived">Diarkib</option>
          </select>
        </div>
      </div>

      <!-- Tab Content Area -->
      <div id="psTabContentArea" class="ps-tab-content-area"></div>
    </div>

    <!-- Right-Side Sliding Drawer for Packages -->
    <div class="ps-drawer-backdrop" id="psPackageDrawerBackdrop" style="display:none;"></div>
    <div class="ps-drawer-panel" id="psPackageDrawer" style="display:none;">
      <div class="ps-drawer-header">
        <h2 class="ps-drawer-title" id="psDrawerTitle">Edit pakej</h2>
        <button type="button" class="ps-drawer-close-btn" id="btnPsCloseDrawer">&times;</button>
      </div>

      <div class="ps-drawer-body">
        <form id="psPackageForm" onsubmit="return false;">
          <!-- Nama Pakej -->
          <div class="ps-form-group">
            <label class="ps-field-label">Nama pakej *</label>
            <input type="text" id="psInputPkgName" class="ps-input-field" placeholder="cth: Kecemasan Standard" required>
          </div>

          <!-- Kod Pakej (Unique Stable Identifier) -->
          <div class="ps-form-group">
            <label class="ps-field-label">Kod pakej (Unik &amp; Stabil)</label>
            <input type="text" id="psInputPkgCode" class="ps-input-field" placeholder="cth: emergency_standard" required>
          </div>

          <!-- Base Price & Status Row -->
          <div class="ps-form-row-2col">
            <div class="ps-form-group">
              <label class="ps-field-label">Kadar asas (RM) *</label>
              <input type="number" id="psInputPkgPrice" class="ps-input-field" step="0.50" min="0" placeholder="250.00" required>
            </div>
            <div class="ps-form-group">
              <label class="ps-field-label">Status</label>
              <div class="ps-toggle-status-wrap">
                <label class="ps-switch">
                  <input type="checkbox" id="psInputPkgStatusToggle" checked>
                  <span class="ps-slider"></span>
                </label>
                <span id="psPkgStatusLabel" class="ps-status-toggle-text">Aktif</span>
              </div>
            </div>
          </div>

          <!-- Contoh Kes -->
          <div class="ps-form-group">
            <label class="ps-field-label">Contoh kes</label>
            <textarea id="psInputPkgCases" class="ps-textarea-field" rows="3" placeholder="Kes kecemasan umum, kemalangan, serangan akut, trauma ringan/sederhana."></textarea>
          </div>

          <!-- Alatan Termasuk -->
          <div class="ps-form-group">
            <label class="ps-field-label">Alatan termasuk</label>
            <div id="psIncludedEquipStack" class="ps-inclusions-stack">
              <!-- Rendered tags -->
            </div>
            <button type="button" class="btn-ps-add-inclusion" id="btnPsAddEquipPicker">
              + Tambah alatan
            </button>
          </div>

          <!-- Staf Termasuk -->
          <div class="ps-form-group">
            <label class="ps-field-label">Staf termasuk</label>
            <div id="psIncludedRolesStack" class="ps-inclusions-stack">
              <!-- Rendered tags -->
            </div>
            <button type="button" class="btn-ps-add-inclusion" id="btnPsAddRolePicker">
              + Tambah peranan
            </button>
            <div class="ps-field-subtext">Termasuk dalam kadar asas. Tiada caj berasingan.</div>
          </div>
        </form>
      </div>

      <div class="ps-drawer-footer">
        <button type="button" class="btn-ps-archive" id="btnPsArchivePkg">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>
          <span>Arkibkan pakej</span>
        </button>
        <div class="ps-drawer-footer-right">
          <button type="button" class="btn-ps-cancel" id="btnPsCancelDrawer">Batal</button>
          <button type="button" class="btn-ps-save" id="btnPsSavePackage">Simpan perubahan</button>
        </div>
      </div>
    </div>

    <!-- Modal for Equipment Add/Edit -->
    <div class="portal-modal-backdrop" id="modalPsEquipment" style="display:none;">
      <div class="portal-modal-box" style="max-width: 480px;">
        <div class="modal-header-banner" style="background:#C61E2F;color:#fff;padding:14px 20px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between;">
          <h2 style="font-size:1.05rem;margin:0;font-weight:700;" id="modalPsEquipTitle">Tambah Alatan Baharu</h2>
          <button type="button" class="modal-close-btn" id="btnCloseEquipModal" style="background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;">&times;</button>
        </div>
        <div style="padding: 20px;" class="space-y-3">
          <input type="hidden" id="modalEquipId">
          <div class="ps-form-group">
            <label class="ps-field-label">Nama alatan *</label>
            <input type="text" id="modalEquipName" class="ps-input-field" placeholder="cth: Stretcher" required>
          </div>
          <div class="ps-form-group">
            <label class="ps-field-label">Penerangan / Spesifikasi</label>
            <textarea id="modalEquipDesc" class="ps-textarea-field" rows="2" placeholder="Penerangan ringkas alatan"></textarea>
          </div>
          <div class="ps-form-group">
            <label class="ps-field-label">Status</label>
            <select id="modalEquipStatus" class="ps-select-box" style="width:100%;">
              <option value="Active">Aktif</option>
              <option value="Inactive">Tidak Aktif</option>
            </select>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
            <button type="button" class="btn-ps-cancel" id="btnCancelEquipModal">Batal</button>
            <button type="button" class="btn-ps-save" id="btnSaveEquipModal">Simpan Alatan</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal for Staff Role Add/Edit -->
    <div class="portal-modal-backdrop" id="modalPsStaffRole" style="display:none;">
      <div class="portal-modal-box" style="max-width: 480px;">
        <div class="modal-header-banner" style="background:#C61E2F;color:#fff;padding:14px 20px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between;">
          <h2 style="font-size:1.05rem;margin:0;font-weight:700;" id="modalPsRoleTitle">Tambah Peranan Staf Baharu</h2>
          <button type="button" class="modal-close-btn" id="btnCloseRoleModal" style="background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;">&times;</button>
        </div>
        <div style="padding: 20px;" class="space-y-3">
          <input type="hidden" id="modalRoleId">
          <div class="ps-form-group">
            <label class="ps-field-label">Nama peranan staf *</label>
            <input type="text" id="modalRoleName" class="ps-input-field" placeholder="cth: Clinic Assistant (CA)" required>
          </div>
          <div class="ps-form-group">
            <label class="ps-field-label">Penerangan Peranan</label>
            <textarea id="modalRoleDesc" class="ps-textarea-field" rows="2" placeholder="Penerangan bidang tugas staf"></textarea>
          </div>
          <div class="ps-form-group">
            <label class="ps-field-label">Status</label>
            <select id="modalRoleStatus" class="ps-select-box" style="width:100%;">
              <option value="Active">Aktif</option>
              <option value="Inactive">Tidak Aktif</option>
            </select>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
            <button type="button" class="btn-ps-cancel" id="btnCancelRoleModal">Batal</button>
            <button type="button" class="btn-ps-save" id="btnSaveRoleModal">Simpan Peranan</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Picker Dialog for Adding Equipment to Package -->
    <div class="portal-modal-backdrop" id="modalPickerEquip" style="display:none;">
      <div class="portal-modal-box" style="max-width: 440px;">
        <div class="modal-header-banner" style="background:#C61E2F;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between;">
          <h2 style="font-size:1rem;margin:0;font-weight:700;">Pilih Alatan untuk Disertakan</h2>
          <button type="button" class="modal-close-btn" id="btnClosePickerEquip" style="background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;">&times;</button>
        </div>
        <div style="padding: 16px;">
          <input type="text" id="pickerEquipSearch" class="ps-input-field" placeholder="Cari alatan..." style="margin-bottom:12px;">
          <div id="pickerEquipList" style="max-height: 240px; overflow-y: auto;" class="space-y-1"></div>
        </div>
      </div>
    </div>

    <!-- Picker Dialog for Adding Role to Package -->
    <div class="portal-modal-backdrop" id="modalPickerRole" style="display:none;">
      <div class="portal-modal-box" style="max-width: 440px;">
        <div class="modal-header-banner" style="background:#C61E2F;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between;">
          <h2 style="font-size:1rem;margin:0;font-weight:700;">Pilih Peranan Staf untuk Disertakan</h2>
          <button type="button" class="modal-close-btn" id="btnClosePickerRole" style="background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;">&times;</button>
        </div>
        <div style="padding: 16px;">
          <input type="text" id="pickerRoleSearch" class="ps-input-field" placeholder="Cari peranan..." style="margin-bottom:12px;">
          <div id="pickerRoleList" style="max-height: 240px; overflow-y: auto;" class="space-y-1"></div>
        </div>
      </div>
    </div>

    <!-- Confirmation Dialog (Delete, Archive, etc.) -->
    <div class="portal-modal-backdrop" id="modalPsConfirm" style="display:none;">
      <div class="portal-modal-box" style="max-width: 440px;">
        <div style="padding: 24px; text-align: center;">
          <div id="confirmIconBox" style="width: 52px; height: 52px; border-radius: 50%; background: #FEE2E2; color: #DC2626; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin: 0 auto 16px;">⚠️</div>
          <h3 style="font-size: 1.15rem; font-weight: 800; color: #0F172A; margin-bottom: 8px;" id="confirmModalTitle">Pengesahan Tindakan</h3>
          <p style="font-size: 0.86rem; color: #475569; line-height: 1.5; margin-bottom: 20px;" id="confirmModalDesc">Adakah anda pasti mahu meneruskan tindakan ini?</p>
          <div style="display: flex; gap: 10px; justify-content: center;">
            <button type="button" class="btn-ps-cancel" id="btnCancelConfirm">Batal</button>
            <button type="button" class="btn-ps-save" id="btnProceedConfirm" style="background:#DC2626;">Teruskan</button>
          </div>
        </div>
      </div>
    </div>
  `;

  bindTopLevelEvents();
  renderCurrentTabContent();
}

/**
 * Binds tabs, search, and drawer event handlers
 */
function bindTopLevelEvents() {
  // Tab Switching
  const tabBtns = document.querySelectorAll('.ps-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSubTab = btn.dataset.tab;

      // Update header button label based on tab
      const actionLabel = document.getElementById('psHeaderActionLabel');
      const searchInput = document.getElementById('psSearchInput');
      if (activeSubTab === 'packages') {
        if (actionLabel) actionLabel.textContent = '+ Tambah pakej';
        if (searchInput) searchInput.placeholder = 'Cari pakej...';
      } else if (activeSubTab === 'equipment') {
        if (actionLabel) actionLabel.textContent = '+ Tambah alatan';
        if (searchInput) searchInput.placeholder = 'Cari alatan...';
      } else if (activeSubTab === 'roles') {
        if (actionLabel) actionLabel.textContent = '+ Tambah peranan';
        if (searchInput) searchInput.placeholder = 'Cari peranan...';
      } else {
        if (actionLabel) actionLabel.textContent = 'Eksport Log';
        if (searchInput) searchInput.placeholder = 'Cari dalam log audit...';
      }

      renderCurrentTabContent();
    });
  });

  // Header Add Action Button
  const headerBtn = document.getElementById('btnPsHeaderAction');
  if (headerBtn) {
    headerBtn.addEventListener('click', () => {
      if (activeSubTab === 'packages') {
        openPackageDrawer('add');
      } else if (activeSubTab === 'equipment') {
        openEquipmentModal('add');
      } else if (activeSubTab === 'roles') {
        openRoleModal('add');
      }
    });
  }

  // Search input
  const searchInput = document.getElementById('psSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderCurrentTabContent();
    });
  }

  // Status Filter
  const statusFilter = document.getElementById('psStatusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      renderCurrentTabContent();
    });
  }

  // Drawer Close & Backdrop
  document.getElementById('btnPsCloseDrawer')?.addEventListener('click', closePackageDrawer);
  document.getElementById('btnPsCancelDrawer')?.addEventListener('click', closePackageDrawer);
  document.getElementById('psPackageDrawerBackdrop')?.addEventListener('click', closePackageDrawer);

  // Status toggle in drawer
  const statusToggle = document.getElementById('psInputPkgStatusToggle');
  if (statusToggle) {
    statusToggle.addEventListener('change', (e) => {
      const lbl = document.getElementById('psPkgStatusLabel');
      if (lbl) lbl.textContent = e.target.checked ? 'Aktif' : 'Draf';
    });
  }

  // Add Inclusion pickers
  document.getElementById('btnPsAddEquipPicker')?.addEventListener('click', openEquipPicker);
  document.getElementById('btnPsAddRolePicker')?.addEventListener('click', openRolePicker);

  // Close Picker Modals
  document.getElementById('btnClosePickerEquip')?.addEventListener('click', () => {
    document.getElementById('modalPickerEquip').style.display = 'none';
  });
  document.getElementById('btnClosePickerRole')?.addEventListener('click', () => {
    document.getElementById('modalPickerRole').style.display = 'none';
  });

  // Drawer Save Package Button
  document.getElementById('btnPsSavePackage')?.addEventListener('click', handleSavePackageFromDrawer);

  // Drawer Archive Package Button
  document.getElementById('btnPsArchivePkg')?.addEventListener('click', () => {
    if (!editingPackageId) return;
    openConfirmDialog(
      'Arkibkan Pakej Perkhidmatan',
      'Pakej ini tidak akan lagi dipaparkan dalam tempahan pelanggan baharu. Rekod sejarah tempahan lama akan kekal terpelihara.',
      () => {
        try {
          archiveServicePackage(getCurrentAdminActor(), editingPackageId);
          closePackageDrawer();
          renderCurrentTabContent();
          showToast('Pakej berjaya diarkibkan.', 'success');
        } catch (e) {
          showToast(e.message, 'error');
        }
      }
    );
  });

  // Equipment Modal Actions
  document.getElementById('btnCloseEquipModal')?.addEventListener('click', () => {
    document.getElementById('modalPsEquipment').style.display = 'none';
  });
  document.getElementById('btnCancelEquipModal')?.addEventListener('click', () => {
    document.getElementById('modalPsEquipment').style.display = 'none';
  });
  document.getElementById('btnSaveEquipModal')?.addEventListener('click', handleSaveEquipmentModal);

  // Role Modal Actions
  document.getElementById('btnCloseRoleModal')?.addEventListener('click', () => {
    document.getElementById('modalPsStaffRole').style.display = 'none';
  });
  document.getElementById('btnCancelRoleModal')?.addEventListener('click', () => {
    document.getElementById('modalPsStaffRole').style.display = 'none';
  });
  document.getElementById('btnSaveRoleModal')?.addEventListener('click', handleSaveRoleModal);

  // Real-time Preview listeners while editing
  ['psInputPkgName', 'psInputPkgPrice', 'psInputPkgCases'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateLivePreviewFromDrawer);
    }
  });
}

function renderCurrentTabContent() {
  const container = document.getElementById('psTabContentArea');
  if (!container) return;

  const search = document.getElementById('psSearchInput')?.value || '';
  const status = document.getElementById('psStatusFilter')?.value || 'all';

  if (activeSubTab === 'packages') {
    renderPackagesTab(container, search, status);
  } else if (activeSubTab === 'equipment') {
    renderEquipmentTab(container, search, status);
  } else if (activeSubTab === 'roles') {
    renderRolesTab(container, search, status);
  } else if (activeSubTab === 'audit') {
    renderAuditTab(container, search);
  }
}

/* =========================================================================
   A. TAB: PAKEJ PERKHIDMATAN (FAITHFUL REPRODUCTION OF MOCKUP)
   ========================================================================= */

function renderPackagesTab(container, search, status) {
  const packages = getServicePackagesList({ search, status });

  // If selectedPackageId is not in list, pick first
  if (!packages.some(p => p.id === selectedPackageId) && packages.length > 0) {
    selectedPackageId = packages[0].id;
  }

  let rowsHtml = '';
  if (packages.length === 0) {
    rowsHtml = `
      <tr>
        <td colspan="5" class="ps-table-empty">Tiada rekod pakej perkhidmatan yang sepadan.</td>
      </tr>
    `;
  } else {
    rowsHtml = packages.map(pkg => {
      const isSelected = (pkg.id === selectedPackageId);
      const rowClass = isSelected ? 'ps-table-row selected' : 'ps-table-row';

      // Status pill
      let statusBadge = '';
      if (pkg.status === 'Active') {
        statusBadge = '<span class="ps-badge-pill ps-badge-active">Aktif</span>';
      } else if (pkg.status === 'Draft') {
        statusBadge = '<span class="ps-badge-pill ps-badge-draft">Draf</span>';
      } else if (pkg.status === 'Archived') {
        statusBadge = '<span class="ps-badge-pill ps-badge-archived">Diarkib</span>';
      } else {
        statusBadge = '<span class="ps-badge-pill ps-badge-inactive">Tidak Aktif</span>';
      }

      // Content text: e.g. "7 alatan · 1 peranan" or "5 alatan"
      let contentText = `${pkg.equipmentCount} alatan`;
      if (pkg.staffCount > 0) {
        contentText += ` · ${pkg.staffCount} peranan`;
      }

      return `
        <tr class="${rowClass}" data-id="${pkg.id}" onclick="selectPackageForPreview('${pkg.id}')">
          <td class="ps-td-name">
            <strong>${escapeHtml(pkg.name)}</strong>
          </td>
          <td class="ps-td-price">RM${Number(pkg.base_price).toFixed(0)}</td>
          <td class="ps-td-content">${contentText}</td>
          <td class="ps-td-status">${statusBadge}</td>
          <td class="ps-td-actions" style="text-align: right;" onclick="event.stopPropagation();">
            <button type="button" class="btn-ps-icon-edit" onclick="openPackageDrawer('edit', '${pkg.id}')" title="Edit pakej">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <div class="ps-action-menu-wrap">
              <button type="button" class="btn-ps-icon-more" onclick="togglePackageActionDropdown(event, '${pkg.id}')" title="Pilihan tambahan">
                &hellip;
              </button>
              <div class="ps-action-dropdown-menu" id="dropdown-${pkg.id}" style="display:none;">
                <button type="button" class="ps-dropdown-item" onclick="openPackageDrawer('edit', '${pkg.id}')">
                  <span>✏️</span> Edit
                </button>
                <button type="button" class="ps-dropdown-item" onclick="handleDuplicatePackage('${pkg.id}')">
                  <span>📄</span> Duplikasi
                </button>
                <button type="button" class="ps-dropdown-item" onclick="handleArchivePackage('${pkg.id}')">
                  <span>🗄️</span> Arkibkan
                </button>
                <button type="button" class="ps-dropdown-item ps-item-danger" onclick="handleDeletePackage('${pkg.id}')">
                  <span>🗑️</span> Padam
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  container.innerHTML = `
    <!-- Packages Table Card -->
    <div class="ps-table-card">
      <table class="ps-table">
        <thead>
          <tr>
            <th style="width: 32%;">Pakej</th>
            <th style="width: 20%;">Kadar asas</th>
            <th style="width: 25%;">Kandungan</th>
            <th style="width: 13%;">Status</th>
            <th style="width: 10%; text-align: right;">Tindakan</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <!-- Application Live Preview Card (Pratonton aplikasi) -->
    <div class="ps-preview-section">
      <h3 class="ps-preview-heading">Pratonton aplikasi</h3>
      <div id="psLivePreviewCardSlot">
        <!-- Rendered preview card -->
      </div>
    </div>
  `;

  renderLivePreviewSlot();
}

window.selectPackageForPreview = function(pkgId) {
  selectedPackageId = pkgId;
  const rows = document.querySelectorAll('.ps-table-row');
  rows.forEach(r => {
    r.classList.toggle('selected', r.dataset.id === pkgId);
  });
  renderLivePreviewSlot();
};

window.togglePackageActionDropdown = function(event, pkgId) {
  event.stopPropagation();
  // Close any open dropdowns first
  document.querySelectorAll('.ps-action-dropdown-menu').forEach(m => m.style.display = 'none');
  const target = document.getElementById(`dropdown-${pkgId}`);
  if (target) {
    target.style.display = 'block';
  }
};

// Global click outside to dismiss dropdowns
document.addEventListener('click', () => {
  document.querySelectorAll('.ps-action-dropdown-menu').forEach(m => m.style.display = 'none');
});

/**
 * Renders the Pratonton Aplikasi card below the table
 */
function renderLivePreviewSlot() {
  const slot = document.getElementById('psLivePreviewCardSlot');
  if (!slot) return;

  const pkg = getServicePackageByIdOrCode(selectedPackageId) || getServicePackagesList()[0];
  if (!pkg) {
    slot.innerHTML = '<div class="ps-empty-preview">Tiada pakej dipilih untuk pratonton.</div>';
    return;
  }

  // Icons matching customer mobile app
  const iconMap = {
    'emergency_standard': `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="3"></rect><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>`,
    'non_emergency': `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>`,
    'emergency_inhouse': `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h6M9 13h6M12 7v8"/></svg>`,
    'aed_critical': `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>`
  };

  const iconSvg = iconMap[pkg.code] || iconMap['emergency_standard'];
  const staffStr = pkg.staffRoles && pkg.staffRoles.length > 0
    ? `${pkg.staffRoles.length} peranan staf (${pkg.staffRoles.map(r => r.name).join(', ')})`
    : null;

  slot.innerHTML = `
    <div class="ps-preview-card">
      <div class="ps-preview-inner">
        <div class="ps-preview-icon-box">
          ${iconSvg}
        </div>
        <div class="ps-preview-texts">
          <div class="ps-preview-title">${escapeHtml(pkg.name)}</div>
          <div class="ps-preview-price">RM${Number(pkg.base_price).toFixed(0)}</div>
          <div class="ps-preview-inclusions">
            <div class="ps-preview-inc-line">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
              <span>${pkg.equipmentCount} alatan disertakan</span>
            </div>
            ${staffStr ? `
              <div class="ps-preview-inc-line">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span>${escapeHtml(staffStr)}</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
      <div class="ps-preview-footer-note">
        Perubahan digunakan untuk tempahan baharu.
      </div>
    </div>
  `;
}

/**
 * Real-time update of preview while editing drawer inputs
 */
function updateLivePreviewFromDrawer() {
  const name = document.getElementById('psInputPkgName')?.value || 'Kecemasan Standard';
  const price = document.getElementById('psInputPkgPrice')?.value || '250';
  
  const allEquip = getServiceEquipmentList();
  const allRoles = getServiceStaffRolesList();

  const equipCount = drawerSelectedEquipIds.length;
  const roles = drawerSelectedRoleIds.map(rid => allRoles.find(r => r.id === rid)).filter(Boolean);

  const slot = document.getElementById('psLivePreviewCardSlot');
  if (!slot) return;

  const staffStr = roles.length > 0
    ? `${roles.length} peranan staf (${roles.map(r => r.name).join(', ')})`
    : null;

  slot.innerHTML = `
    <div class="ps-preview-card">
      <div class="ps-preview-inner">
        <div class="ps-preview-icon-box">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="3"></rect><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
        </div>
        <div class="ps-preview-texts">
          <div class="ps-preview-title">${escapeHtml(name)}</div>
          <div class="ps-preview-price">RM${Number(price).toFixed(0)}</div>
          <div class="ps-preview-inclusions">
            <div class="ps-preview-inc-line">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
              <span>${equipCount} alatan disertakan</span>
            </div>
            ${staffStr ? `
              <div class="ps-preview-inc-line">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span>${escapeHtml(staffStr)}</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
      <div class="ps-preview-footer-note">
        Perubahan digunakan untuk tempahan baharu.
      </div>
    </div>
  `;
}

/* =========================================================================
   DRAWER CONTROLLER (RIGHT SLIDE-IN EDIT/ADD FOR PACKAGES)
   ========================================================================= */

window.openPackageDrawer = function(mode = 'edit', pkgId = null) {
  drawerMode = mode;
  editingPackageId = pkgId;

  const drawer = document.getElementById('psPackageDrawer');
  const backdrop = document.getElementById('psPackageDrawerBackdrop');
  const title = document.getElementById('psDrawerTitle');
  const archiveBtn = document.getElementById('btnPsArchivePkg');

  if (!drawer || !backdrop) return;

  if (mode === 'add') {
    title.textContent = 'Tambah pakej';
    if (archiveBtn) archiveBtn.style.display = 'none';

    document.getElementById('psInputPkgName').value = '';
    document.getElementById('psInputPkgCode').value = '';
    document.getElementById('psInputPkgPrice').value = '250.00';
    document.getElementById('psInputPkgCases').value = '';
    document.getElementById('psInputPkgStatusToggle').checked = true;
    document.getElementById('psPkgStatusLabel').textContent = 'Aktif';

    drawerSelectedEquipIds = [];
    drawerSelectedRoleIds = [];
    currentEditingVersion = 1;
  } else {
    title.textContent = 'Edit pakej';
    if (archiveBtn) archiveBtn.style.display = 'inline-flex';

    const pkg = getServicePackageByIdOrCode(pkgId);
    if (!pkg) return;

    selectedPackageId = pkg.id;
    currentEditingVersion = pkg.version || 1;

    document.getElementById('psInputPkgName').value = pkg.name || '';
    document.getElementById('psInputPkgCode').value = pkg.code || '';
    document.getElementById('psInputPkgPrice').value = Number(pkg.base_price).toFixed(2);
    document.getElementById('psInputPkgCases').value = pkg.example_cases || '';
    document.getElementById('psInputPkgStatusToggle').checked = (pkg.status === 'Active');
    document.getElementById('psPkgStatusLabel').textContent = (pkg.status === 'Active') ? 'Aktif' : (pkg.status === 'Draft' ? 'Draf' : 'Tidak Aktif');

    drawerSelectedEquipIds = pkg.equipment.map(e => e.id);
    drawerSelectedRoleIds = pkg.staffRoles.map(r => r.id);
  }

  renderDrawerInclusionTags();
  updateLivePreviewFromDrawer();

  backdrop.style.display = 'block';
  drawer.style.display = 'flex';
  setTimeout(() => drawer.classList.add('open'), 10);
};

export function closePackageDrawer() {
  const drawer = document.getElementById('psPackageDrawer');
  const backdrop = document.getElementById('psPackageDrawerBackdrop');
  if (drawer) {
    drawer.classList.remove('open');
    setTimeout(() => {
      drawer.style.display = 'none';
      if (backdrop) backdrop.style.display = 'none';
    }, 220);
  }
}

function renderDrawerInclusionTags() {
  const allEquip = getServiceEquipmentList();
  const allRoles = getServiceStaffRolesList();

  // Equipment tags
  const equipStack = document.getElementById('psIncludedEquipStack');
  if (equipStack) {
    if (drawerSelectedEquipIds.length === 0) {
      equipStack.innerHTML = '<div class="ps-no-inclusions-text">Tiada alatan disertakan setakat ini.</div>';
    } else {
      equipStack.innerHTML = drawerSelectedEquipIds.map(id => {
        const item = allEquip.find(e => e.id === id) || { name: id };
        return `
          <div class="ps-inclusion-tag-row">
            <span class="ps-tag-name">${escapeHtml(item.name)}</span>
            <button type="button" class="btn-ps-tag-remove" onclick="removeDrawerEquip('${id}')" title="Keluarkan daripada pakej">&times;</button>
          </div>
        `;
      }).join('');
    }
  }

  // Staff role tags
  const rolesStack = document.getElementById('psIncludedRolesStack');
  if (rolesStack) {
    if (drawerSelectedRoleIds.length === 0) {
      rolesStack.innerHTML = '<div class="ps-no-inclusions-text">Tiada peranan staf disertakan (hanya pemandu standard).</div>';
    } else {
      rolesStack.innerHTML = drawerSelectedRoleIds.map(id => {
        const item = allRoles.find(r => r.id === id) || { name: id };
        return `
          <div class="ps-inclusion-tag-row">
            <span class="ps-tag-name">${escapeHtml(item.name)}</span>
            <button type="button" class="btn-ps-tag-remove" onclick="removeDrawerRole('${id}')" title="Keluarkan daripada pakej">&times;</button>
          </div>
        `;
      }).join('');
    }
  }
}

window.removeDrawerEquip = function(id) {
  drawerSelectedEquipIds = drawerSelectedEquipIds.filter(eId => eId !== id);
  renderDrawerInclusionTags();
  updateLivePreviewFromDrawer();
};

window.removeDrawerRole = function(id) {
  drawerSelectedRoleIds = drawerSelectedRoleIds.filter(rId => rId !== id);
  renderDrawerInclusionTags();
  updateLivePreviewFromDrawer();
};

function openEquipPicker() {
  const modal = document.getElementById('modalPickerEquip');
  const listContainer = document.getElementById('pickerEquipList');
  const searchInput = document.getElementById('pickerEquipSearch');
  if (!modal || !listContainer) return;

  function renderList() {
    const q = (searchInput?.value || '').toLowerCase().trim();
    const allEquip = getServiceEquipmentList();
    const available = allEquip.filter(e => !drawerSelectedEquipIds.includes(e.id) && e.status === 'Active');

    const filtered = available.filter(e => e.name.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q));

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div style="font-size:0.8rem;color:#64748B;padding:10px;text-align:center;">Tiada alatan tambahan tersedia.</div>';
      return;
    }

    listContainer.innerHTML = filtered.map(item => `
      <div class="ps-picker-item" onclick="pickEquipItem('${item.id}')">
        <div>
          <div style="font-weight:700;font-size:0.84rem;color:#0F172A;">${escapeHtml(item.name)}</div>
          <div style="font-size:0.75rem;color:#64748B;">${escapeHtml(item.description || 'Alatan perubatan')}</div>
        </div>
        <span class="btn-ps-picker-add">+ Tambah</span>
      </div>
    `).join('');
  }

  if (searchInput) {
    searchInput.value = '';
    searchInput.oninput = renderList;
  }

  renderList();
  modal.style.display = 'block';
}

window.pickEquipItem = function(id) {
  if (!drawerSelectedEquipIds.includes(id)) {
    drawerSelectedEquipIds.push(id);
    renderDrawerInclusionTags();
    updateLivePreviewFromDrawer();
  }
  document.getElementById('modalPickerEquip').style.display = 'none';
};

function openRolePicker() {
  const modal = document.getElementById('modalPickerRole');
  const listContainer = document.getElementById('pickerRoleList');
  const searchInput = document.getElementById('pickerRoleSearch');
  if (!modal || !listContainer) return;

  function renderList() {
    const q = (searchInput?.value || '').toLowerCase().trim();
    const allRoles = getServiceStaffRolesList();
    const available = allRoles.filter(r => !drawerSelectedRoleIds.includes(r.id) && r.status === 'Active');

    const filtered = available.filter(r => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div style="font-size:0.8rem;color:#64748B;padding:10px;text-align:center;">Tiada peranan tambahan tersedia.</div>';
      return;
    }

    listContainer.innerHTML = filtered.map(item => `
      <div class="ps-picker-item" onclick="pickRoleItem('${item.id}')">
        <div>
          <div style="font-weight:700;font-size:0.84rem;color:#0F172A;">${escapeHtml(item.name)}</div>
          <div style="font-size:0.75rem;color:#64748B;">${escapeHtml(item.description || 'Peranan staf')}</div>
        </div>
        <span class="btn-ps-picker-add">+ Tambah</span>
      </div>
    `).join('');
  }

  if (searchInput) {
    searchInput.value = '';
    searchInput.oninput = renderList;
  }

  renderList();
  modal.style.display = 'block';
}

window.pickRoleItem = function(id) {
  if (!drawerSelectedRoleIds.includes(id)) {
    drawerSelectedRoleIds.push(id);
    renderDrawerInclusionTags();
    updateLivePreviewFromDrawer();
  }
  document.getElementById('modalPickerRole').style.display = 'none';
};

function handleSavePackageFromDrawer() {
  const name = document.getElementById('psInputPkgName')?.value?.trim();
  const code = document.getElementById('psInputPkgCode')?.value?.trim();
  const price = parseFloat(document.getElementById('psInputPkgPrice')?.value);
  const cases = document.getElementById('psInputPkgCases')?.value?.trim();
  const isActive = document.getElementById('psInputPkgStatusToggle')?.checked;
  const status = isActive ? 'Active' : 'Draft';

  if (!name) {
    showToast('Sila masukkan nama pakej.', 'error');
    return;
  }

  if (isNaN(price) || price < 0) {
    showToast('Sila masukkan kadar asas yang sah.', 'error');
    return;
  }

  const payload = {
    id: drawerMode === 'edit' ? editingPackageId : undefined,
    code: code || undefined,
    name,
    example_cases: cases,
    base_price: price,
    status,
    version: currentEditingVersion,
    equipmentIds: drawerSelectedEquipIds,
    staffRoleIds: drawerSelectedRoleIds
  };

  try {
    const saved = saveServicePackage(getCurrentAdminActor(), payload);
    selectedPackageId = saved.id;
    closePackageDrawer();
    renderCurrentTabContent();
    showToast(`Pakej "${saved.name}" berjaya disimpan!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.handleDuplicatePackage = function(id) {
  try {
    const dup = duplicateServicePackage(getCurrentAdminActor(), id);
    renderCurrentTabContent();
    showToast(`Pakej berjaya diduplikasi sebagai draf: "${dup.name}"`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.handleArchivePackage = function(id) {
  const target = getServicePackageByIdOrCode(id);
  if (!target) return;

  openConfirmDialog(
    'Arkibkan Pakej Perkhidmatan',
    `Adakah anda pasti mahu mengarkibkan pakej "${target.name}"? Pakej ini tidak akan muncul dalam tempahan baharu.`,
    () => {
      try {
        archiveServicePackage(getCurrentAdminActor(), id);
        renderCurrentTabContent();
        showToast('Pakej berjaya diarkibkan.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
};

window.handleDeletePackage = function(id) {
  const target = getServicePackageByIdOrCode(id);
  if (!target) return;

  openConfirmDialog(
    'Padam Pakej Perkhidmatan',
    `Adakah anda pasti mahu memadam pakej "${target.name}" secara kekal? Tindakan ini tidak boleh diundur.`,
    () => {
      try {
        deleteServicePackage(getCurrentAdminActor(), id);
        renderCurrentTabContent();
        showToast('Pakej berjaya dipadam.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
};

/* =========================================================================
   B. TAB: ALATAN CATALOGUE
   ========================================================================= */

function renderEquipmentTab(container, search, status) {
  const items = getServiceEquipmentList({ search, status });

  let rowsHtml = '';
  if (items.length === 0) {
    rowsHtml = `
      <tr>
        <td colspan="5" class="ps-table-empty">Tiada rekod alatan ditemui.</td>
      </tr>
    `;
  } else {
    rowsHtml = items.map(item => {
      const isUsed = item.usageCount > 0;
      const usagePill = isUsed
        ? `<span class="ps-usage-pill" title="Digunakan oleh: ${item.associatedPackages.map(p => p.name).join(', ')}">${item.usageCount} pakej</span>`
        : '<span class="ps-usage-pill-zero">Tidak digunakan</span>';

      const statusBadge = item.status === 'Active'
        ? '<span class="ps-badge-pill ps-badge-active">Aktif</span>'
        : '<span class="ps-badge-pill ps-badge-inactive">Tidak Aktif</span>';

      return `
        <tr class="ps-table-row">
          <td class="ps-td-name">
            <strong>${escapeHtml(item.name)}</strong>
            <div style="font-size:0.76rem;color:#64748B;">${escapeHtml(item.description || 'Peralatan sokongan')}</div>
          </td>
          <td class="ps-td-code font-mono text-xs text-slate-500">${escapeHtml(item.code)}</td>
          <td class="ps-td-usage">${usagePill}</td>
          <td class="ps-td-status">${statusBadge}</td>
          <td class="ps-td-actions" style="text-align: right;">
            <button type="button" class="btn-ps-icon-edit" onclick="openEquipmentModal('edit', '${item.id}')" title="Edit alatan">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button type="button" class="btn-ps-icon-delete ${isUsed ? 'disabled' : ''}" onclick="${isUsed ? `alertCannotDeleteUsedEquip('${escapeHtml(item.name)}')` : `confirmDeleteEquip('${item.id}')`}" title="${isUsed ? 'Tidak boleh dipadam kerana sedang digunakan' : 'Padam alatan'}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  container.innerHTML = `
    <div class="ps-table-card">
      <table class="ps-table">
        <thead>
          <tr>
            <th style="width: 38%;">Nama Alatan</th>
            <th style="width: 20%;">Kod Unik</th>
            <th style="width: 20%;">Pakej Menggunakan</th>
            <th style="width: 12%;">Status</th>
            <th style="width: 10%; text-align: right;">Tindakan</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

window.alertCannotDeleteUsedEquip = function(name) {
  showToast(`Alatan "${name}" tidak boleh dipadam kerana masih digunakan oleh pakej perkhidmatan aktif.`, 'warning');
};

window.openEquipmentModal = function(mode = 'add', id = null) {
  const modal = document.getElementById('modalPsEquipment');
  const title = document.getElementById('modalPsEquipTitle');
  if (!modal) return;

  if (mode === 'add') {
    title.textContent = 'Tambah Alatan Baharu';
    document.getElementById('modalEquipId').value = '';
    document.getElementById('modalEquipName').value = '';
    document.getElementById('modalEquipDesc').value = '';
    document.getElementById('modalEquipStatus').value = 'Active';
  } else {
    title.textContent = 'Kemaskini Alatan';
    const all = getServiceEquipmentList();
    const item = all.find(e => e.id === id);
    if (!item) return;

    document.getElementById('modalEquipId').value = item.id;
    document.getElementById('modalEquipName').value = item.name;
    document.getElementById('modalEquipDesc').value = item.description || '';
    document.getElementById('modalEquipStatus').value = item.status;
  }

  modal.style.display = 'block';
};

function handleSaveEquipmentModal() {
  const id = document.getElementById('modalEquipId')?.value;
  const name = document.getElementById('modalEquipName')?.value?.trim();
  const desc = document.getElementById('modalEquipDesc')?.value?.trim();
  const status = document.getElementById('modalEquipStatus')?.value || 'Active';

  if (!name) {
    showToast('Sila masukkan nama alatan.', 'error');
    return;
  }

  try {
    saveServiceEquipment(getCurrentAdminActor(), { id: id || undefined, name, description: desc, status });
    document.getElementById('modalPsEquipment').style.display = 'none';
    renderCurrentTabContent();
    showToast('Rekod alatan berjaya disimpan.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.confirmDeleteEquip = function(id) {
  const all = getServiceEquipmentList();
  const item = all.find(e => e.id === id);
  if (!item) return;

  openConfirmDialog(
    'Padam Alatan',
    `Adakah anda pasti mahu memadam alatan "${item.name}" daripada katalog?`,
    () => {
      try {
        deleteServiceEquipment(getCurrentAdminActor(), id);
        renderCurrentTabContent();
        showToast('Alatan berjaya dipadam.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
};

/* =========================================================================
   C. TAB: PERANAN STAF CATALOGUE
   ========================================================================= */

function renderRolesTab(container, search, status) {
  const items = getServiceStaffRolesList({ search, status });

  let rowsHtml = '';
  if (items.length === 0) {
    rowsHtml = `
      <tr>
        <td colspan="5" class="ps-table-empty">Tiada rekod peranan staf ditemui.</td>
      </tr>
    `;
  } else {
    rowsHtml = items.map(item => {
      const isUsed = item.usageCount > 0;
      const usagePill = isUsed
        ? `<span class="ps-usage-pill" title="Digunakan oleh: ${item.associatedPackages.map(p => p.name).join(', ')}">${item.usageCount} pakej</span>`
        : '<span class="ps-usage-pill-zero">Tidak digunakan</span>';

      const statusBadge = item.status === 'Active'
        ? '<span class="ps-badge-pill ps-badge-active">Aktif</span>'
        : '<span class="ps-badge-pill ps-badge-inactive">Tidak Aktif</span>';

      return `
        <tr class="ps-table-row">
          <td class="ps-td-name">
            <strong>${escapeHtml(item.name)}</strong>
            <div style="font-size:0.76rem;color:#64748B;">${escapeHtml(item.description || 'Peranan staf klinikal')}</div>
          </td>
          <td class="ps-td-code font-mono text-xs text-slate-500">${escapeHtml(item.code)}</td>
          <td class="ps-td-usage">${usagePill}</td>
          <td class="ps-td-status">${statusBadge}</td>
          <td class="ps-td-actions" style="text-align: right;">
            <button type="button" class="btn-ps-icon-edit" onclick="openRoleModal('edit', '${item.id}')" title="Edit peranan">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button type="button" class="btn-ps-icon-delete ${isUsed ? 'disabled' : ''}" onclick="${isUsed ? `alertCannotDeleteUsedRole('${escapeHtml(item.name)}')` : `confirmDeleteRole('${item.id}')`}" title="${isUsed ? 'Tidak boleh dipadam kerana sedang digunakan' : 'Padam peranan'}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  container.innerHTML = `
    <div class="ps-table-card">
      <table class="ps-table">
        <thead>
          <tr>
            <th style="width: 38%;">Nama Peranan Staf</th>
            <th style="width: 20%;">Kod Unik</th>
            <th style="width: 20%;">Pakej Menggunakan</th>
            <th style="width: 12%;">Status</th>
            <th style="width: 10%; text-align: right;">Tindakan</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

window.alertCannotDeleteUsedRole = function(name) {
  showToast(`Peranan "${name}" tidak boleh dipadam kerana masih digunakan oleh pakej perkhidmatan aktif.`, 'warning');
};

window.openRoleModal = function(mode = 'add', id = null) {
  const modal = document.getElementById('modalPsStaffRole');
  const title = document.getElementById('modalPsRoleTitle');
  if (!modal) return;

  if (mode === 'add') {
    title.textContent = 'Tambah Peranan Staf Baharu';
    document.getElementById('modalRoleId').value = '';
    document.getElementById('modalRoleName').value = '';
    document.getElementById('modalRoleDesc').value = '';
    document.getElementById('modalRoleStatus').value = 'Active';
  } else {
    title.textContent = 'Kemaskini Peranan Staf';
    const all = getServiceStaffRolesList();
    const item = all.find(r => r.id === id);
    if (!item) return;

    document.getElementById('modalRoleId').value = item.id;
    document.getElementById('modalRoleName').value = item.name;
    document.getElementById('modalRoleDesc').value = item.description || '';
    document.getElementById('modalRoleStatus').value = item.status;
  }

  modal.style.display = 'block';
};

function handleSaveRoleModal() {
  const id = document.getElementById('modalRoleId')?.value;
  const name = document.getElementById('modalRoleName')?.value?.trim();
  const desc = document.getElementById('modalRoleDesc')?.value?.trim();
  const status = document.getElementById('modalRoleStatus')?.value || 'Active';

  if (!name) {
    showToast('Sila masukkan nama peranan staf.', 'error');
    return;
  }

  try {
    saveServiceStaffRole(getCurrentAdminActor(), { id: id || undefined, name, description: desc, status });
    document.getElementById('modalPsStaffRole').style.display = 'none';
    renderCurrentTabContent();
    showToast('Rekod peranan staf berjaya disimpan.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.confirmDeleteRole = function(id) {
  const all = getServiceStaffRolesList();
  const item = all.find(r => r.id === id);
  if (!item) return;

  openConfirmDialog(
    'Padam Peranan Staf',
    `Adakah anda pasti mahu memadam peranan "${item.name}" daripada katalog?`,
    () => {
      try {
        deleteServiceStaffRole(getCurrentAdminActor(), id);
        renderCurrentTabContent();
        showToast('Peranan staf berjaya dipadam.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
};

/* =========================================================================
   D. TAB: LOG PERUBAHAN (AUDIT TRAIL)
   ========================================================================= */

function renderAuditTab(container, search) {
  const logs = getServiceAuditLogs({ limit: 100 });
  const term = (search || '').toLowerCase().trim();

  const filtered = logs.filter(l => {
    if (!term) return true;
    return (l.action || '').toLowerCase().includes(term) ||
           (l.entity_name || '').toLowerCase().includes(term) ||
           (l.admin_email || '').toLowerCase().includes(term) ||
           (l.admin_name || '').toLowerCase().includes(term);
  });

  let rowsHtml = '';
  if (filtered.length === 0) {
    rowsHtml = `
      <tr>
        <td colspan="5" class="ps-table-empty">Tiada rekod log perubahan ditemui.</td>
      </tr>
    `;
  } else {
    rowsHtml = filtered.map(log => {
      const dateStr = new Date(log.created_at).toLocaleString('ms-MY', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      let actionBadge = `<span class="ps-badge-pill ps-badge-active">${log.action}</span>`;
      if (log.action.includes('DELETE')) {
        actionBadge = `<span class="ps-badge-pill ps-badge-inactive">${log.action}</span>`;
      } else if (log.action.includes('ARCHIVE') || log.action.includes('DUPLICATE')) {
        actionBadge = `<span class="ps-badge-pill ps-badge-draft">${log.action}</span>`;
      }

      let diffText = '-';
      if (log.previous_values && log.updated_values) {
        const pPrice = log.previous_values.base_price;
        const uPrice = log.updated_values.base_price;
        if (pPrice !== undefined && uPrice !== undefined && pPrice !== uPrice) {
          diffText = `Kadar: RM${pPrice} ➔ RM${uPrice}`;
        } else {
          diffText = `Kemaskini rekod versi ${(log.previous_values.version || 1)} ➔ ${(log.updated_values.version || 2)}`;
        }
      } else if (log.updated_values) {
        diffText = `Cipta rekod baharu (Status: ${log.updated_values.status || 'Aktif'})`;
      } else if (log.previous_values) {
        diffText = `Padam kekal daripada sistem`;
      }

      return `
        <tr class="ps-table-row">
          <td class="font-mono text-xs text-slate-500">${dateStr}</td>
          <td>
            <strong>${escapeHtml(log.admin_name)}</strong>
            <div style="font-size:0.75rem;color:#64748B;">${escapeHtml(log.admin_email)}</div>
          </td>
          <td>${actionBadge}</td>
          <td>
            <strong>${escapeHtml(log.entity_name || log.entity_id)}</strong>
            <div style="font-size:0.75rem;color:#64748B;text-transform:capitalize;">${escapeHtml(log.entity_type)}</div>
          </td>
          <td style="font-size:0.8rem;color:#334155;">${escapeHtml(diffText)}</td>
        </tr>
      `;
    }).join('');
  }

  container.innerHTML = `
    <div class="ps-table-card">
      <table class="ps-table">
        <thead>
          <tr>
            <th style="width: 20%;">Masa &amp; Tarikh</th>
            <th style="width: 25%;">Pentadbir Bertugas</th>
            <th style="width: 15%;">Tindakan</th>
            <th style="width: 20%;">Entiti Terlibat</th>
            <th style="width: 20%;">Perubahan</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

/* =========================================================================
   CONFIRMATION MODAL & TOAST HELPERS
   ========================================================================= */

let onConfirmCallback = null;

function openConfirmDialog(title, desc, onProceed) {
  const modal = document.getElementById('modalPsConfirm');
  const titleEl = document.getElementById('confirmModalTitle');
  const descEl = document.getElementById('confirmModalDesc');
  const proceedBtn = document.getElementById('btnProceedConfirm');
  const cancelBtn = document.getElementById('btnCancelConfirm');

  if (!modal) return;

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;

  onConfirmCallback = onProceed;

  proceedBtn.onclick = () => {
    modal.style.display = 'none';
    if (typeof onConfirmCallback === 'function') {
      onConfirmCallback();
      onConfirmCallback = null;
    }
  };

  cancelBtn.onclick = () => {
    modal.style.display = 'none';
    onConfirmCallback = null;
  };

  modal.style.display = 'block';
}

function showToast(message, type = 'info') {
  const existing = document.getElementById('psToastAlert');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'psToastAlert';
  toast.className = `ps-toast-banner ${type}`;
  toast.innerHTML = `
    <span>${type === 'error' ? '❌' : (type === 'warning' ? '⚠️' : '✅')}</span>
    <span>${escapeHtml(message)}</span>
  `;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('visible');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

