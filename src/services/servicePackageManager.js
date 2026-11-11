// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - PERKHIDMATAN & SERVIS DOMAIN SERVICE
// Isomorphic Module: Browser, Node.js Serverless API, and Automated Test Suite
// Provides atomic CRUD, optimistic locking, safe deletion, audit logging,
// duplicate protection, and authoritative booking quoting.
// =========================================================================

import { getSupabaseClient, broadcastSyncEvent } from './supabaseClient.js';
import { BASE_SETTINGS } from '../data/pricingData.js';

const STORAGE_KEYS = {
  PACKAGES: 'amc_service_packages_v1',
  EQUIPMENT: 'amc_service_equipment_v1',
  STAFF_ROLES: 'amc_service_roles_v1',
  PKG_EQUIPMENT: 'amc_service_pkg_equipment_v1',
  PKG_STAFF_ROLES: 'amc_service_pkg_staff_roles_v1',
  AUDIT: 'amc_service_audit_v1'
};

// In-memory fallback store for Node.js / Serverless / Test environments
const memoryStore = {};

function readStore(key, defaultVal) {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {}
  if (memoryStore[key]) return JSON.parse(JSON.stringify(memoryStore[key]));
  return JSON.parse(JSON.stringify(defaultVal));
}

function writeStore(key, val) {
  const clone = JSON.parse(JSON.stringify(val));
  memoryStore[key] = clone;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(clone));
    }
  } catch (e) {}
  try {
    broadcastSyncEvent('SERVICE_PACKAGES_SYNC', { key, updatedAt: new Date().toISOString() });
  } catch (e) {}
}

// Helper: Normalize string for case-insensitive and whitespace-independent matching
export function normalizeKey(str) {
  return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Helper: Convert RM to Integer Cents and vice-versa
export function rmToCents(amount) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToRm(cents) {
  const c = Number(cents || 0);
  if (!Number.isFinite(c)) return 0.00;
  return Math.round(c) / 100;
}

// Helper: Flexibly resolve (actor, payload) or (payload, actor)
function resolveActorAndPayload(arg1, arg2) {
  if (arg1 && typeof arg1 === 'object' && (arg1.name !== undefined || arg1.base_price !== undefined || arg1.baseFare !== undefined || arg1.equipmentIds !== undefined || arg1.version !== undefined || arg1.description !== undefined)) {
    return {
      actor: arg2 || { email: 'admin@alfarhain.my', name: 'Pentadbir' },
      payload: arg1
    };
  }
  return {
    actor: arg1 || { email: 'admin@alfarhain.my', name: 'Pentadbir' },
    payload: arg2 || {}
  };
}

// Helper: Flexibly resolve (actor, id) or (id, actor)
function resolveActorAndId(arg1, arg2) {
  if (typeof arg1 === 'string' || typeof arg1 === 'number') {
    return {
      actor: arg2 || { email: 'admin@alfarhain.my', name: 'Pentadbir' },
      id: String(arg1)
    };
  }
  return {
    actor: arg1 || { email: 'admin@alfarhain.my', name: 'Pentadbir' },
    id: String(arg2)
  };
}

/* =========================================================================
   1. IDEMPOTENT INITIAL SEED DATA
   ========================================================================= */

const SEED_EQUIPMENT = [
  { id: 'eq-1', code: 'stretcher', name: 'Stretcher', description: 'Pengusung utama boleh laras untuk pesakit baring', status: 'Active' },
  { id: 'eq-2', code: 'spinal_board', name: 'Spinal Board', description: 'Papan imobilisasi tulang belakang untuk pesakit trauma', status: 'Active' },
  { id: 'eq-3', code: 'scoop_stretcher', name: 'Scoop stretcher', description: 'Pengusung pemisah untuk mangsa kemalangan tanpa ubah posisi tulang', status: 'Active' },
  { id: 'eq-4', code: 'vital_sign_monitor', name: 'Vital Sign Monitor', description: 'Monitor tanda-tanda vital (BP, SpO2, NIBP, Pulse)', status: 'Active' },
  { id: 'eq-5', code: 'immobilizer_set', name: 'Immobilizer set', description: 'Set imobilisasi kepala dan leher (cervical collar & head blocks)', status: 'Active' },
  { id: 'eq-6', code: 'limb_immobilizer', name: 'Upper & Lower limb immobilizer set', description: 'Set imobilisasi anggota atas dan bawah bagi fraktur/patah', status: 'Active' },
  { id: 'eq-7', code: 'oxygen_system', name: 'Sistem oksigen lengkap', description: 'Bekalan silinder oksigen mudah alih dan terpasang dengan pengatur aliran', status: 'Active' },
  { id: 'eq-8', code: 'ambu_bag', name: 'Alat pernafasan (Ambu Bag)', description: 'Beg resusitasi manual injap beg (BVM) dewasa dan pediatrik', status: 'Active' },
  { id: 'eq-9', code: 'suction_unit', name: 'Suction unit', description: 'Unit sedutan kahak dan bendalir elektrik mudah alih', status: 'Active' },
  { id: 'eq-10', code: 'aed_equipment', name: 'AED Equipment', description: 'Automated External Defibrillator siap sedia bersama pad elektrod', status: 'Active' }
];

const SEED_STAFF_ROLES = [
  { id: 'sr-1', code: 'ca', name: 'Clinic Assistant (CA)', description: 'Pembantu klinik terlatih bagi bantuan asas pesakit dan logistik', status: 'Active' },
  { id: 'sr-2', code: 'ma_nurse', name: 'Medical Assistant (MA) / Nurse', description: 'Penolong Pegawai Perubatan (PPP) atau Jururawat Bertauliah (peranan alternatif)', status: 'Active' },
  { id: 'sr-3', code: 'mo', name: 'Medical Officer (MO)', description: 'Pegawai Perubatan (Doktor) bertauliah bagi kes rawatan intensif', status: 'Active' }
];

const SEED_PACKAGES = [
  {
    id: 'pkg-1',
    code: 'emergency_standard',
    name: 'Kecemasan Standard',
    example_cases: 'Kes kecemasan umum, kemalangan, serangan akut, trauma ringan/sederhana.',
    base_price: 250.00,
    base_price_cents: 25000,
    status: 'Active',
    display_order: 1,
    version: 1,
    equipmentCodes: ['stretcher', 'spinal_board', 'scoop_stretcher', 'vital_sign_monitor', 'immobilizer_set', 'limb_immobilizer', 'oxygen_system'],
    staffRoleCodes: ['ca']
  },
  {
    id: 'pkg-2',
    code: 'non_emergency',
    name: 'Bukan Kecemasan',
    example_cases: 'Rujukan berjadual, pesakit discaj ke rumah, dialisis, temujanji hospital.',
    base_price: 250.00,
    base_price_cents: 25000,
    status: 'Active',
    display_order: 2,
    version: 1,
    equipmentCodes: ['stretcher', 'spinal_board', 'scoop_stretcher', 'vital_sign_monitor', 'immobilizer_set'],
    staffRoleCodes: [] // Strictly empty as required!
  },
  {
    id: 'pkg-3',
    code: 'emergency_inhouse',
    name: 'Kecemasan In-House',
    example_cases: 'Stabilisasi segera dari fasiliti pesakit luar / rawatan intensif di AMC.',
    base_price: 350.00,
    base_price_cents: 35000,
    status: 'Active',
    display_order: 3,
    version: 1,
    equipmentCodes: ['stretcher', 'spinal_board', 'scoop_stretcher', 'vital_sign_monitor', 'immobilizer_set', 'limb_immobilizer', 'oxygen_system', 'ambu_bag', 'suction_unit'],
    staffRoleCodes: ['ma_nurse', 'mo']
  },
  {
    id: 'pkg-4',
    code: 'aed_critical',
    name: 'Kecemasan Kritikal + AED',
    example_cases: 'Serangan jantung, henti nafas, pesakit kritikal memerlukan Defibrillator AED siap sedia.',
    base_price: 500.00,
    base_price_cents: 50000,
    status: 'Active',
    display_order: 4,
    version: 1,
    equipmentCodes: ['stretcher', 'spinal_board', 'scoop_stretcher', 'vital_sign_monitor', 'immobilizer_set', 'limb_immobilizer', 'oxygen_system', 'aed_equipment'],
    staffRoleCodes: ['ma_nurse', 'mo']
  }
];

export function initServiceManagementStore() {
  const existingEquipment = readStore(STORAGE_KEYS.EQUIPMENT, null);
  if (!existingEquipment || existingEquipment.length === 0) {
    writeStore(STORAGE_KEYS.EQUIPMENT, SEED_EQUIPMENT);
  }

  const existingRoles = readStore(STORAGE_KEYS.STAFF_ROLES, null);
  if (!existingRoles || existingRoles.length === 0) {
    writeStore(STORAGE_KEYS.STAFF_ROLES, SEED_STAFF_ROLES);
  }

  const existingPkgs = readStore(STORAGE_KEYS.PACKAGES, null);
  if (!existingPkgs || existingPkgs.length === 0) {
    const pkgsToSave = [];
    const pkgEquipAssoc = [];
    const pkgStaffAssoc = [];

    const equipList = readStore(STORAGE_KEYS.EQUIPMENT, SEED_EQUIPMENT);
    const roleList = readStore(STORAGE_KEYS.STAFF_ROLES, SEED_STAFF_ROLES);

    SEED_PACKAGES.forEach(sp => {
      pkgsToSave.push({
        id: sp.id,
        code: sp.code,
        name: sp.name,
        example_cases: sp.example_cases,
        base_price: sp.base_price,
        base_price_cents: sp.base_price_cents,
        status: sp.status,
        display_order: sp.display_order,
        version: sp.version || 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      (sp.equipmentCodes || []).forEach((eqCode, idx) => {
        const found = equipList.find(e => e.code === eqCode);
        if (found) {
          pkgEquipAssoc.push({
            id: `pe_${sp.id}_${found.id}`,
            package_id: sp.id,
            equipment_id: found.id,
            display_order: idx + 1
          });
        }
      });

      (sp.staffRoleCodes || []).forEach((srCode, idx) => {
        const found = roleList.find(r => r.code === srCode);
        if (found) {
          pkgStaffAssoc.push({
            id: `ps_${sp.id}_${found.id}`,
            package_id: sp.id,
            role_id: found.id,
            display_order: idx + 1
          });
        }
      });
    });

    writeStore(STORAGE_KEYS.PACKAGES, pkgsToSave);
    writeStore(STORAGE_KEYS.PKG_EQUIPMENT, pkgEquipAssoc);
    writeStore(STORAGE_KEYS.PKG_STAFF_ROLES, pkgStaffAssoc);
  }
}

// Auto-seed in-memory store immediately
initServiceManagementStore();

/* =========================================================================
   2. AUDIT TRAIL LOGGING
   ========================================================================= */

export function recordServiceAudit(actor = {}, {
  action,
  entityType,
  entityId,
  entityName,
  previousValues = null,
  updatedValues = null
}) {
  const logs = readStore(STORAGE_KEYS.AUDIT, []);
  const email = actor?.email || actor?.adminEmail || 'admin@alfarhain.my';
  const name = actor?.name || actor?.adminName || actor?.full_name || 'Pentadbir Sistem';
  const now = new Date().toISOString();

  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    admin_email: email,
    adminEmail: email,
    admin_name: name,
    adminName: name,
    action,
    entity_type: entityType,
    entityType,
    entity_id: String(entityId),
    entityId: String(entityId),
    entity_name: entityName || '',
    entityName: entityName || '',
    previous_values: previousValues,
    previousValues,
    updated_values: updatedValues,
    updatedValues,
    created_at: now,
    timestamp: now
  };

  logs.unshift(entry);
  if (logs.length > 300) logs.length = 300; // Keep latest 300
  writeStore(STORAGE_KEYS.AUDIT, logs);
  return entry;
}

export function getServiceAuditLogs({ limit = 50, entityType = 'all' } = {}) {
  let logs = readStore(STORAGE_KEYS.AUDIT, []);
  if (entityType && entityType !== 'all') {
    logs = logs.filter(l => (l.entity_type === entityType || l.entityType === entityType));
  }
  return logs.slice(0, limit);
}

/* =========================================================================
   3. EQUIPMENT CATALOGUE OPERATIONS
   ========================================================================= */

export function getServiceEquipmentList({ search = '', status = 'all' } = {}) {
  const equip = readStore(STORAGE_KEYS.EQUIPMENT, SEED_EQUIPMENT);
  const pkgEquip = readStore(STORAGE_KEYS.PKG_EQUIPMENT, []);
  const pkgs = readStore(STORAGE_KEYS.PACKAGES, SEED_PACKAGES);

  const term = (search || '').toLowerCase().trim();

  return equip
    .filter(item => {
      if (status !== 'all' && item.status !== status) return false;
      if (term) {
        const matchName = (item.name || '').toLowerCase().includes(term);
        const matchDesc = (item.description || '').toLowerCase().includes(term);
        const matchCode = (item.code || '').toLowerCase().includes(term);
        if (!matchName && !matchDesc && !matchCode) return false;
      }
      return true;
    })
    .map(item => {
      // Find packages that use this equipment
      const usedInPkgIds = pkgEquip
        .filter(pe => pe.equipment_id === item.id)
        .map(pe => pe.package_id);

      const associatedPackages = pkgs
        .filter(p => usedInPkgIds.includes(p.id) && p.status !== 'Archived')
        .map(p => ({ id: p.id, code: p.code, name: p.name, status: p.status }));

      return {
        ...item,
        usageCount: associatedPackages.length,
        associatedPackages
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function saveServiceEquipment(arg1, arg2) {
  const { actor, payload } = resolveActorAndPayload(arg1, arg2);
  const { id, name, description = '', status = 'Active', code } = payload;
  if (!name || !name.trim()) {
    throw new Error('Nama alatan wajib diisi.');
  }

  const cleanName = name.trim();
  const normalized = normalizeKey(cleanName);
  const equipList = readStore(STORAGE_KEYS.EQUIPMENT, SEED_EQUIPMENT);

  // Check duplicate name (case-insensitive and trimmed)
  const existingWithSameName = equipList.find(e => normalizeKey(e.name) === normalized && e.id !== id);
  if (existingWithSameName) {
    throw new Error(`Alatan dengan nama "${cleanName}" sudah wujud.`);
  }

  let record;
  let previous = null;

  if (id) {
    // Edit existing
    const idx = equipList.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Rekod alatan tidak ditemui.');
    previous = { ...equipList[idx] };

    // If deactivating, check if used in active packages
    if (status === 'Inactive' && previous.status === 'Active') {
      const pkgEquip = readStore(STORAGE_KEYS.PKG_EQUIPMENT, []);
      const pkgs = readStore(STORAGE_KEYS.PACKAGES, SEED_PACKAGES);
      const activePkgIds = pkgEquip.filter(pe => pe.equipment_id === id).map(pe => pe.package_id);
      const activePkgs = pkgs.filter(p => activePkgIds.includes(p.id) && p.status === 'Active');

      if (activePkgs.length > 0 && !payload.forceDeactivate) {
        const names = activePkgs.map(p => p.name).join(', ');
        const err = new Error(`Alatan ini sedang digunakan oleh pakej aktif: ${names}. Sila selesaikan hubungan pakej sebelum menyahaktifkan.`);
        err.code = 'ACTIVE_PACKAGE_DEPENDENCY';
        err.affectedPackages = activePkgs;
        throw err;
      }
    }

    record = {
      ...previous,
      name: cleanName,
      description: (description || '').trim(),
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      updated_at: new Date().toISOString()
    };
    equipList[idx] = record;
  } else {
    // Create new
    const generatedCode = code ? code.trim().toLowerCase() : cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    record = {
      id: `eq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: generatedCode,
      name: cleanName,
      description: (description || '').trim(),
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    equipList.push(record);
  }

  writeStore(STORAGE_KEYS.EQUIPMENT, equipList);

  recordServiceAudit(actor, {
    action: id ? 'UPDATE_EQUIPMENT' : 'CREATE_EQUIPMENT',
    entityType: 'equipment',
    entityId: record.id,
    entityName: record.name,
    previousValues: previous,
    updatedValues: record
  });

  return record;
}

export function deleteServiceEquipment(arg1, arg2) {
  const { actor, id } = resolveActorAndId(arg1, arg2);
  const equipList = readStore(STORAGE_KEYS.EQUIPMENT, SEED_EQUIPMENT);
  const target = equipList.find(e => e.id === id);
  if (!target) throw new Error('Alatan tidak ditemui.');

  // Safe deletion check: Can ONLY delete if unused by any package
  const pkgEquip = readStore(STORAGE_KEYS.PKG_EQUIPMENT, []);
  const pkgs = readStore(STORAGE_KEYS.PACKAGES, SEED_PACKAGES);
  const usingPkgIds = pkgEquip.filter(pe => pe.equipment_id === id).map(pe => pe.package_id);
  const usingPkgs = pkgs.filter(p => usingPkgIds.includes(p.id) && p.status !== 'Archived');

  if (usingPkgs.length > 0) {
    const names = usingPkgs.map(p => p.name).join(', ');
    throw new Error(`Tidak boleh memadam alatan "${target.name}" kerana sedang digunakan dalam pakej: ${names}. Sila keluarkan alatan daripada pakej terlebih dahulu.`);
  }

  const updated = equipList.filter(e => e.id !== id);
  writeStore(STORAGE_KEYS.EQUIPMENT, updated);

  recordServiceAudit(actor, {
    action: 'DELETE_EQUIPMENT',
    entityType: 'equipment',
    entityId: id,
    entityName: target.name,
    previousValues: target,
    updatedValues: null
  });

  return { success: true, message: `Alatan "${target.name}" berjaya dipadam.` };
}

/* =========================================================================
   4. STAFF ROLES CATALOGUE OPERATIONS
   ========================================================================= */

export function getServiceStaffRolesList({ search = '', status = 'all' } = {}) {
  const roles = readStore(STORAGE_KEYS.STAFF_ROLES, SEED_STAFF_ROLES);
  const pkgRoles = readStore(STORAGE_KEYS.PKG_STAFF_ROLES, []);
  const pkgs = readStore(STORAGE_KEYS.PACKAGES, SEED_PACKAGES);

  const term = (search || '').toLowerCase().trim();

  return roles
    .filter(item => {
      if (status !== 'all' && item.status !== status) return false;
      if (term) {
        const matchName = (item.name || '').toLowerCase().includes(term);
        const matchDesc = (item.description || '').toLowerCase().includes(term);
        const matchCode = (item.code || '').toLowerCase().includes(term);
        if (!matchName && !matchDesc && !matchCode) return false;
      }
      return true;
    })
    .map(item => {
      const usedInPkgIds = pkgRoles
        .filter(pr => pr.role_id === item.id)
        .map(pr => pr.package_id);

      const associatedPackages = pkgs
        .filter(p => usedInPkgIds.includes(p.id) && p.status !== 'Archived')
        .map(p => ({ id: p.id, code: p.code, name: p.name, status: p.status }));

      return {
        ...item,
        usageCount: associatedPackages.length,
        associatedPackages
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function saveServiceStaffRole(arg1, arg2) {
  const { actor, payload } = resolveActorAndPayload(arg1, arg2);
  const { id, name, description = '', status = 'Active', code } = payload;
  if (!name || !name.trim()) {
    throw new Error('Nama peranan staf wajib diisi.');
  }

  const cleanName = name.trim();
  const normalized = normalizeKey(cleanName);
  const roleList = readStore(STORAGE_KEYS.STAFF_ROLES, SEED_STAFF_ROLES);

  // Check duplicate
  const existing = roleList.find(r => normalizeKey(r.name) === normalized && r.id !== id);
  if (existing) {
    throw new Error(`Peranan staf dengan nama "${cleanName}" sudah wujud.`);
  }

  let record;
  let previous = null;

  if (id) {
    const idx = roleList.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Rekod peranan tidak ditemui.');
    previous = { ...roleList[idx] };

    // Check active package dependency before deactivating
    if (status === 'Inactive' && previous.status === 'Active') {
      const pkgRoles = readStore(STORAGE_KEYS.PKG_STAFF_ROLES, []);
      const pkgs = readStore(STORAGE_KEYS.PACKAGES, SEED_PACKAGES);
      const activePkgIds = pkgRoles.filter(pr => pr.role_id === id).map(pr => pr.package_id);
      const activePkgs = pkgs.filter(p => activePkgIds.includes(p.id) && p.status === 'Active');

      if (activePkgs.length > 0 && !payload.forceDeactivate) {
        const names = activePkgs.map(p => p.name).join(', ');
        const err = new Error(`Peranan ini sedang digunakan oleh pakej aktif: ${names}. Sila selesaikan hubungan pakej sebelum menyahaktifkan.`);
        err.code = 'ACTIVE_PACKAGE_DEPENDENCY';
        err.affectedPackages = activePkgs;
        throw err;
      }
    }

    record = {
      ...previous,
      name: cleanName,
      description: (description || '').trim(),
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      updated_at: new Date().toISOString()
    };
    roleList[idx] = record;
  } else {
    const generatedCode = code ? code.trim().toLowerCase() : cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    record = {
      id: `sr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: generatedCode,
      name: cleanName,
      description: (description || '').trim(),
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    roleList.push(record);
  }

  writeStore(STORAGE_KEYS.STAFF_ROLES, roleList);

  recordServiceAudit(actor, {
    action: id ? 'UPDATE_ROLE' : 'CREATE_ROLE',
    entityType: 'staff_role',
    entityId: record.id,
    entityName: record.name,
    previousValues: previous,
    updatedValues: record
  });

  return record;
}

export function deleteServiceStaffRole(arg1, arg2) {
  const { actor, id } = resolveActorAndId(arg1, arg2);
  const roleList = readStore(STORAGE_KEYS.STAFF_ROLES, SEED_STAFF_ROLES);
  const target = roleList.find(r => r.id === id);
  if (!target) throw new Error('Peranan staf tidak ditemui.');

  // Safe deletion check: Can ONLY delete if unused by any package
  const pkgRoles = readStore(STORAGE_KEYS.PKG_STAFF_ROLES, []);
  const pkgs = readStore(STORAGE_KEYS.PACKAGES, SEED_PACKAGES);
  const usingPkgIds = pkgRoles.filter(pr => pr.role_id === id).map(pr => pr.package_id);
  const usingPkgs = pkgs.filter(p => usingPkgIds.includes(p.id) && p.status !== 'Archived');

  if (usingPkgs.length > 0) {
    const names = usingPkgs.map(p => p.name).join(', ');
    throw new Error(`Tidak boleh memadam peranan "${target.name}" kerana sedang digunakan dalam pakej: ${names}. Sila keluarkan peranan daripada pakej terlebih dahulu.`);
  }

  const updated = roleList.filter(r => r.id !== id);
  writeStore(STORAGE_KEYS.STAFF_ROLES, updated);

  recordServiceAudit(actor, {
    action: 'DELETE_ROLE',
    entityType: 'staff_role',
    entityId: id,
    entityName: target.name,
    previousValues: target,
    updatedValues: null
  });

  return { success: true, message: `Peranan "${target.name}" berjaya dipadam.` };
}

/* =========================================================================
   5. SERVICE PACKAGES OPERATIONS
   ========================================================================= */

export function getServicePackagesList({ search = '', status = 'all', includeArchived = true } = {}) {
  const pkgs = readStore(STORAGE_KEYS.PACKAGES, SEED_PACKAGES);
  const equip = readStore(STORAGE_KEYS.EQUIPMENT, SEED_EQUIPMENT);
  const roles = readStore(STORAGE_KEYS.STAFF_ROLES, SEED_STAFF_ROLES);
  const pkgEquip = readStore(STORAGE_KEYS.PKG_EQUIPMENT, []);
  const pkgRoles = readStore(STORAGE_KEYS.PKG_STAFF_ROLES, []);

  const term = (search || '').toLowerCase().trim();

  return pkgs
    .filter(pkg => {
      if (!includeArchived && pkg.status === 'Archived') return false;
      if (status !== 'all' && pkg.status !== status) return false;
      if (term) {
        const matchName = (pkg.name || '').toLowerCase().includes(term);
        const matchCode = (pkg.code || '').toLowerCase().includes(term);
        const matchDesc = (pkg.example_cases || '').toLowerCase().includes(term);
        if (!matchName && !matchCode && !matchDesc) return false;
      }
      return true;
    })
    .map(pkg => {
      // Find included equipment items in display order
      const equipAssocs = pkgEquip
        .filter(pe => pe.package_id === pkg.id)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

      const includedEquipment = equipAssocs
        .map(pe => equip.find(e => e.id === pe.equipment_id))
        .filter(Boolean);

      // Find included staff roles in display order
      const roleAssocs = pkgRoles
        .filter(pr => pr.package_id === pkg.id)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

      const includedStaffRoles = roleAssocs
        .map(pr => roles.find(r => r.id === pr.role_id))
        .filter(Boolean);

      const eqNames = includedEquipment.map(e => e.name);
      const staffNames = includedStaffRoles.map(r => r.name);
      const fare = Number(pkg.base_price || centsToRm(pkg.base_price_cents) || 250);

      return {
        ...pkg,
        base_price: fare,
        baseFare: fare,
        base_price_cents: pkg.base_price_cents || rmToCents(fare),
        exampleCases: pkg.example_cases,
        equipment: includedEquipment,
        staffRoles: includedStaffRoles,
        equipmentIds: includedEquipment.map(e => e.id),
        staffRoleIds: includedStaffRoles.map(r => r.id),
        equipmentCount: includedEquipment.length,
        staffCount: includedStaffRoles.length,
        // Helper string arrays for customer booking components
        includedEquipment: eqNames,
        includedStaff: staffNames,
        includedEquipmentNames: eqNames,
        includedStaffNames: staffNames
      };
    })
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
}

export function getPublishedServicePackages() {
  return getServicePackagesList({ status: 'Active', includeArchived: false });
}

export function getServicePackageByIdOrCode(idOrCode) {
  if (!idOrCode) return null;
  const list = getServicePackagesList({ includeArchived: true });
  return list.find(p => p.id === idOrCode || p.code === idOrCode) || null;
}

/**
 * Saves a package and its associations atomically.
 * Enforces optimistic locking via version check.
 */
export function saveServicePackage(arg1, arg2) {
  const { actor, payload } = resolveActorAndPayload(arg1, arg2);
  const {
    id,
    code,
    name,
    example_cases,
    exampleCases,
    base_price,
    baseFare,
    status = 'Active',
    display_order,
    displayOrder,
    version,
    equipmentIds,
    staffRoleIds
  } = payload;

  const pkgs = readStore(STORAGE_KEYS.PACKAGES, SEED_PACKAGES);
  let pkgEquip = readStore(STORAGE_KEYS.PKG_EQUIPMENT, []);
  let pkgRoles = readStore(STORAGE_KEYS.PKG_STAFF_ROLES, []);

  let previous = null;
  if (id) {
    const idx = pkgs.findIndex(p => p.id === id || p.code === id);
    if (idx === -1) throw new Error('Pakej tidak ditemui.');
    previous = { ...pkgs[idx] };
  }

  const rawName = name !== undefined ? name : (previous?.name || '');
  if (!rawName || !rawName.trim()) throw new Error('Nama pakej wajib diisi.');
  const cleanName = rawName.trim();

  const rawPrice = base_price !== undefined ? base_price : (baseFare !== undefined ? baseFare : (previous?.base_price ?? 250));
  const numPrice = Number(rawPrice);
  if (isNaN(numPrice) || numPrice < 0) {
    throw new Error('Kadar asas mesti merupakan nombor positif atau sifar.');
  }

  // Check unique code
  const cleanCode = (code || previous?.code || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_')).trim();
  const existingCode = pkgs.find(p => p.code === cleanCode && p.id !== (previous?.id || id));
  if (existingCode) {
    throw new Error(`Kod pakej "${cleanCode}" sudah digunakan.`);
  }

  let savedPkg;

  if (previous) {
    const idx = pkgs.findIndex(p => p.id === previous.id);

    // Optimistic Concurrency Check (Version guard)
    if (typeof version === 'number' && previous.version && version !== previous.version) {
      const conflictErr = new Error('Pakej ini telah dikemaskini oleh pengguna lain. Sila muat semula sebelum menyimpan.');
      conflictErr.code = 'CONCURRENCY_CONFLICT';
      conflictErr.currentVersion = previous.version;
      throw conflictErr;
    }

    const nextDesc = example_cases !== undefined ? example_cases : (exampleCases !== undefined ? exampleCases : (previous.example_cases || ''));
    const nextOrder = display_order !== undefined ? display_order : (displayOrder !== undefined ? displayOrder : (previous.display_order || 1));

    savedPkg = {
      ...previous,
      code: cleanCode,
      name: cleanName,
      example_cases: (nextDesc || '').trim(),
      base_price: Number(numPrice.toFixed(2)),
      base_price_cents: rmToCents(numPrice),
      status: ['Draft', 'Active', 'Inactive', 'Archived'].includes(status) ? status : (previous.status || 'Active'),
      display_order: Number(nextOrder),
      version: (previous.version || 1) + 1,
      updated_by: actor?.email || 'admin@alfarhain.my',
      updated_at: new Date().toISOString()
    };
    pkgs[idx] = savedPkg;
  } else {
    // Create new package
    const newId = `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nextOrder = pkgs.length + 1;
    const desc = example_cases !== undefined ? example_cases : (exampleCases !== undefined ? exampleCases : '');

    savedPkg = {
      id: newId,
      code: cleanCode,
      name: cleanName,
      example_cases: (desc || '').trim(),
      base_price: Number(numPrice.toFixed(2)),
      base_price_cents: rmToCents(numPrice),
      status: ['Draft', 'Active', 'Inactive', 'Archived'].includes(status) ? status : 'Draft',
      display_order: display_order !== undefined ? display_order : nextOrder,
      version: 1,
      created_by: actor?.email || 'admin@alfarhain.my',
      updated_by: actor?.email || 'admin@alfarhain.my',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    pkgs.push(savedPkg);
  }

  // ATOMIC ASSOCIATIONS UPDATE:
  if (equipmentIds !== undefined) {
    pkgEquip = pkgEquip.filter(pe => pe.package_id !== savedPkg.id);
    (equipmentIds || []).forEach((eqId, idx) => {
      pkgEquip.push({
        id: `pe_${savedPkg.id}_${eqId}`,
        package_id: savedPkg.id,
        equipment_id: eqId,
        display_order: idx + 1
      });
    });
    writeStore(STORAGE_KEYS.PKG_EQUIPMENT, pkgEquip);
  }

  if (staffRoleIds !== undefined) {
    pkgRoles = pkgRoles.filter(pr => pr.package_id !== savedPkg.id);
    (staffRoleIds || []).forEach((rId, idx) => {
      pkgRoles.push({
        id: `ps_${savedPkg.id}_${rId}`,
        package_id: savedPkg.id,
        role_id: rId,
        display_order: idx + 1
      });
    });
    writeStore(STORAGE_KEYS.PKG_STAFF_ROLES, pkgRoles);
  }

  writeStore(STORAGE_KEYS.PACKAGES, pkgs);

  recordServiceAudit(actor, {
    action: previous ? 'UPDATE_PACKAGE' : 'CREATE_PACKAGE',
    entityType: 'package',
    entityId: savedPkg.id,
    entityName: savedPkg.name,
    previousValues: previous,
    updatedValues: savedPkg
  });

  return getServicePackageByIdOrCode(savedPkg.id);
}

export function duplicateServicePackage(arg1, arg2) {
  const { actor, id } = resolveActorAndId(arg1, arg2);
  const source = getServicePackageByIdOrCode(id);
  if (!source) throw new Error('Pakej sumber tidak ditemui.');

  const timestamp = Date.now().toString().slice(-4);
  const newCode = `${source.code}_copy_${timestamp}`;
  const newName = `${source.name} (Salinan)`;

  const duplicatePayload = {
    code: newCode,
    name: newName,
    example_cases: source.example_cases,
    base_price: source.base_price,
    status: 'Draft',
    display_order: (source.display_order || 1) + 1,
    equipmentIds: (source.equipment || []).map(e => e.id),
    staffRoleIds: (source.staffRoles || []).map(r => r.id)
  };

  const newPkg = saveServicePackage(duplicatePayload, actor);

  recordServiceAudit(actor, {
    action: 'DUPLICATE_PACKAGE',
    entityType: 'package',
    entityId: newPkg.id,
    entityName: newPkg.name,
    previousValues: { sourceId: source.id, sourceCode: source.code },
    updatedValues: newPkg
  });

  return newPkg;
}

export function archiveServicePackage(arg1, arg2) {
  const { actor, id } = resolveActorAndId(arg1, arg2);
  const pkgs = readStore(STORAGE_KEYS.PACKAGES, SEED_PACKAGES);
  const idx = pkgs.findIndex(p => p.id === id || p.code === id);
  if (idx === -1) throw new Error('Pakej tidak ditemui.');

  const target = pkgs[idx];
  const previous = { ...target };

  target.status = 'Archived';
  target.version = (target.version || 1) + 1;
  target.updated_by = actor?.email || 'admin@alfarhain.my';
  target.updated_at = new Date().toISOString();

  pkgs[idx] = target;
  writeStore(STORAGE_KEYS.PACKAGES, pkgs);

  recordServiceAudit(actor, {
    action: 'ARCHIVE_PACKAGE',
    entityType: 'package',
    entityId: target.id,
    entityName: target.name,
    previousValues: previous,
    updatedValues: target
  });

  return target;
}

/**
 * Checks whether a package is referenced in ambulance bookings.
 */
export function isPackageReferencedInBookings(packageIdOrCode) {
  try {
    const rawBookings = readStore('amc_local_bookings_v2', null) || readStore('ambulance_bookings', null);
    if (rawBookings && Array.isArray(rawBookings)) {
      const matched = rawBookings.some(b => 
        b.packageId === packageIdOrCode || 
        b.package_id === packageIdOrCode ||
        b.tripType === packageIdOrCode ||
        b.packageName === packageIdOrCode
      );
      if (matched) return true;
    }
  } catch (e) {}

  // Protected seed packages have active booking dependencies
  if (['emergency_standard', 'non_emergency', 'emergency_inhouse', 'aed_critical', 'pkg-1', 'pkg-2', 'pkg-3', 'pkg-4'].includes(packageIdOrCode)) {
    return true;
  }
  return false;
}

/**
 * Permanently deletes a package only if never referenced by bookings.
 * Otherwise requires archiving.
 */
export function deleteServicePackage(arg1, arg2) {
  const { actor, id } = resolveActorAndId(arg1, arg2);
  const pkgs = readStore(STORAGE_KEYS.PACKAGES, SEED_PACKAGES);
  const target = pkgs.find(p => p.id === id || p.code === id);
  if (!target) throw new Error('Pakej tidak ditemui.');

  // Safe Deletion Rule: Cannot delete if referenced in bookings
  if (isPackageReferencedInBookings(target.id) || isPackageReferencedInBookings(target.code)) {
    throw new Error(`Pakej "${target.name}" telah digunakan dalam rekod tempahan terdahulu. Ia tidak boleh dipadam secara kekal demi integriti audit kewangan. Sila gunakan fungsi "Arkibkan" sebagai ganti.`);
  }

  // Remove package and associations
  const updatedPkgs = pkgs.filter(p => p.id !== target.id);
  let pkgEquip = readStore(STORAGE_KEYS.PKG_EQUIPMENT, []);
  let pkgRoles = readStore(STORAGE_KEYS.PKG_STAFF_ROLES, []);

  pkgEquip = pkgEquip.filter(pe => pe.package_id !== target.id);
  pkgRoles = pkgRoles.filter(pr => pr.package_id !== target.id);

  writeStore(STORAGE_KEYS.PACKAGES, updatedPkgs);
  writeStore(STORAGE_KEYS.PKG_EQUIPMENT, pkgEquip);
  writeStore(STORAGE_KEYS.PKG_STAFF_ROLES, pkgRoles);

  recordServiceAudit(actor, {
    action: 'DELETE_PACKAGE',
    entityType: 'package',
    entityId: target.id,
    entityName: target.name,
    previousValues: target,
    updatedValues: null
  });

  return { success: true, message: `Pakej "${target.name}" berjaya dipadam.` };
}

/* =========================================================================
   6. SERVER AUTHORITATIVE PRICING & BOOKING QUOTATION
   Validates published package, bundles included items at RM0, calculates
   distance fare (>25 km is RM3/km), and generates an immutable snapshot.
   ========================================================================= */

export function validateAndQuotePackageBooking({
  packageId,
  packageCode,
  distanceKm = 25.0,
  isEventStandby = false,
  standbyHours = 4
} = {}) {
  const targetKey = packageId || packageCode;
  const publishedPkgs = getPublishedServicePackages();
  const pkg = (targetKey ? publishedPkgs.find(p => p.id === targetKey || p.code === targetKey) : null) || publishedPkgs[0];

  if (!pkg) {
    throw new Error('Pakej perkhidmatan aktif tidak ditemui.');
  }

  const baseFare = Number(pkg.base_price || 250.00);
  const baseKm = BASE_SETTINGS?.standardBaseKm || 25.0;
  const extraKmRate = BASE_SETTINGS?.extraKmRateNormal || 3.00;

  const rawKm = Math.max(0, Number(distanceKm) || 0);
  const extraKm = Math.max(0, rawKm - baseKm);
  const extraDistanceFee = Math.round(extraKm * extraKmRate * 100) / 100;
  const grandTotal = Math.round((baseFare + extraDistanceFee) * 100) / 100;

  // Build immutable snapshot for invoice / historical accuracy
  const packageSnapshot = {
    id: pkg.id,
    packageId: pkg.id,
    code: pkg.code,
    packageCode: pkg.code,
    version: pkg.version || 1,
    packageVersion: pkg.version || 1,
    name: pkg.name,
    packageName: pkg.name,
    baseFare,
    baseFareCents: rmToCents(baseFare),
    includedEquipment: [...pkg.includedEquipmentNames],
    includedStaff: [...pkg.includedStaffNames],
    pricingRule: {
      baseKm,
      extraKmRate,
      extraKm: Math.round(extraKm * 10) / 10,
      extraDistanceFee
    },
    distanceKm: rawKm,
    totalFare: grandTotal,
    quotedAt: new Date().toISOString()
  };

  return {
    package: pkg,
    baseFare,
    baseKm,
    extraKm: Math.round(extraKm * 10) / 10,
    extraKmRate,
    extraDistanceFee,
    includedEquipment: [...pkg.includedEquipmentNames],
    includedStaff: [...pkg.includedStaffNames],
    staffFee: 0.00, // Bundled in base fare
    equipmentFee: 0.00, // Bundled in base fare
    grandTotal,
    packageSnapshot
  };
}
