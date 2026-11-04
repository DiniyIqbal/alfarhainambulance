// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - RAKAN AMBULANS & 5% COMMISSION SERVICE
// Isomorphic Domain Engine (Browser + Node.js Serverless + Test Suite)
// Enforces RBAC, Company Isolation, Integer MYR Cents, Atomic Transitions,
// Commission Accrual & Manual Settlement Rules.
// =========================================================================

import { getSupabaseClient, broadcastSyncEvent } from './supabaseClient.js';

const STORAGE_KEYS = {
  COMPANIES: 'amc_partner_companies_v1',
  MEMBERSHIPS: 'amc_partner_memberships_v1',
  INVITATIONS: 'amc_partner_invitations_v1',
  VEHICLES: 'amc_partner_vehicles_v1',
  DRIVERS: 'amc_partner_drivers_v1',
  OFFERS: 'amc_partner_trip_offers_v1',
  LEDGER: 'amc_partner_commission_ledger_v1',
  BATCHES: 'amc_partner_settlement_batches_v1',
  ADJUSTMENTS: 'amc_partner_financial_adjustments_v1',
  AUDIT: 'amc_partner_audit_logs_v1'
};

// In-memory fallback store for Node.js serverless / unit test environments
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
    broadcastSyncEvent('PARTNER_SYNC', { key, updatedAt: new Date().toISOString() });
  } catch (e) {}
}

/* =========================================================================
   1. MONETARY & COMMISSION ARITHMETIC (INTEGER MYR CENTS)
   Documented Rounding Rule:
   - 1 MYR = 100 sen (integer cents).
   - Default commission rate = 5% (500 basis points, where 10000 bps = 100%).
   - Commission Cents = Math.round((EligibleBaseCents * RateBps) / 10000) (Half-Up).
   - Partner Share Cents = EligibleBaseCents - CommissionCents.
   ========================================================================= */

export function rmToCents(rmAmount) {
  const num = Number(rmAmount || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function centsToRm(centsAmount) {
  const c = Number(centsAmount || 0);
  if (!Number.isFinite(c)) return 0;
  return Number((c / 100).toFixed(2));
}

export function formatRmFromCents(centsAmount) {
  const c = Number(centsAmount || 0);
  const abs = Math.abs(c);
  const sign = c < 0 ? '-' : '';
  return `${sign}RM ${(abs / 100).toFixed(2)}`;
}

/**
 * Calculates an immutable financial snapshot in integer MYR cents.
 * Keeps customer invoice total, eligible commission base, commission rate,
 * commission amount, and partner share strictly separate.
 */
export function calculatePartnerCommissionSnapshot({
  lineItemsCents = {},
  commissionableFlags = { base_fare: true, extra_km: true, staff: true, equipment: true, extras: false },
  commissionRateBps = 500
}) {
  const rateBps = Math.max(0, Math.min(10000, Math.round(Number(commissionRateBps ?? 500))));

  const normalizedItems = {
    base_fare: Math.max(0, Math.round(Number(lineItemsCents.base_fare ?? 0))),
    extra_km: Math.max(0, Math.round(Number(lineItemsCents.extra_km ?? 0))),
    staff: Math.max(0, Math.round(Number(lineItemsCents.staff ?? 0))),
    equipment: Math.max(0, Math.round(Number(lineItemsCents.equipment ?? 0))),
    extras: Math.max(0, Math.round(Number(lineItemsCents.extras ?? 0)))
  };

  const customerInvoiceCents =
    normalizedItems.base_fare +
    normalizedItems.extra_km +
    normalizedItems.staff +
    normalizedItems.equipment +
    normalizedItems.extras;

  let eligibleCommissionBaseCents = 0;
  Object.keys(normalizedItems).forEach((key) => {
    if (commissionableFlags && commissionableFlags[key] === true) {
      eligibleCommissionBaseCents += normalizedItems[key];
    }
  });

  const commissionAmountCents = Math.round((eligibleCommissionBaseCents * rateBps) / 10000);
  const partnerShareFromEligibleCents = eligibleCommissionBaseCents - commissionAmountCents;
  const nonCommissionablePassThroughCents = customerInvoiceCents - eligibleCommissionBaseCents;
  const partnerTotalShareCents = partnerShareFromEligibleCents + nonCommissionablePassThroughCents;

  return {
    customer_invoice_cents: customerInvoiceCents,
    eligible_commission_base_cents: eligibleCommissionBaseCents,
    commission_rate_bps: rateBps,
    commission_rate_percent: Number((rateBps / 100).toFixed(2)),
    commission_amount_cents: commissionAmountCents,
    partner_share_cents: partnerTotalShareCents,
    partner_eligible_share_cents: partnerShareFromEligibleCents,
    non_commissionable_cents: nonCommissionablePassThroughCents,
    commissionable_breakdown: {
      line_items_cents: normalizedItems,
      commissionable_flags: { ...commissionableFlags }
    }
  };
}

/* =========================================================================
   2. CRYPTOGRAPHIC HASH & INVITATION CODE HELPERS
   ========================================================================= */

export function generatePartnerInviteCode(prefix = 'RKN') {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes ambiguous 0/O/1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    const randIdx = Math.floor(Math.random() * alphabet.length);
    code += alphabet[randIdx];
  }
  return `${prefix}-${code}`;
}

export function maskInviteCode(plainCode = '') {
  const clean = String(plainCode).trim().toUpperCase();
  if (clean.length < 6) return 'RKN-******';
  return `${clean.slice(0, 6)}****`;
}

export function hashInviteCodeSync(plainCode = '') {
  const clean = String(plainCode).trim().toUpperCase();
  // Deterministic FNV-1a / SHA-like 64-char hex digest for isomorphic browser/Node execution
  let h1 = 0xdeadbeef ^ clean.length;
  let h2 = 0x41c6ce57 ^ clean.length;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (hex1 + hex2).repeat(4);
}

/* =========================================================================
   3. DEFAULT SEEDED PARTNER ECOSYSTEM DATA
   ========================================================================= */

const INITIAL_COMPANIES = [
  {
    id: 'comp-medicare-kb',
    company_code: 'RKN-KB01',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    ssm_registration_no: '202101014822 (1415122-K)',
    company_email: 'admin.medicare@gmail.com',
    contact_phone: '019-988 4412',
    director_name: 'En. Wan Kamarul Ariffin',
    state_coverage: 'Kelantan & Terengganu',
    address: 'PT 1482, Jalan Sultan Yahya Petra, 15200 Kota Bharu, Kelantan',
    bank_name: 'Maybank Islamic Berhad',
    bank_account_no: '5530-1088-9921',
    bank_account_holder: 'MEDICARE AMBULANCE SERVICES SDN BHD',
    default_commission_bps: 500, // 5.00%
    commissionable_items: { base_fare: true, extra_km: true, staff: true, equipment: true, extras: false },
    cash_collection_allowed: true,
    kkm_permit_no: 'KKM/AMB/KEL/2025/088',
    approval_status: 'Aktif',
    approved_by_name: 'Abe Di (Pegawai Operasi HQ)',
    approved_at: '2026-10-15T09:00:00Z',
    created_at: '2026-10-12T08:00:00Z',
    updated_at: '2026-10-15T09:00:00Z'
  },
  {
    id: 'comp-pantaimedic-phg',
    company_code: 'RKN-PHG02',
    company_name: 'Pantai Timur Medic Response Sdn. Bhd.',
    ssm_registration_no: '202201033910 (1479210-M)',
    company_email: 'admin.pantaimedic@gmail.com',
    contact_phone: '013-922 7781',
    director_name: 'Dr. Azlan Shah bin Ismail',
    state_coverage: 'Pahang Barat (Raub, Bentong, Lipis)',
    address: 'No. 18, Pusat Komersial Sempalit, 27600 Raub, Pahang',
    bank_name: 'CIMB Islamic Bank',
    bank_account_no: '8604-2219-8800',
    bank_account_holder: 'PANTAI TIMUR MEDIC RESPONSE SDN BHD',
    default_commission_bps: 500, // 5.00%
    commissionable_items: { base_fare: true, extra_km: true, staff: true, equipment: true, extras: false },
    cash_collection_allowed: false,
    kkm_permit_no: 'KKM/AMB/PHG/2026/019',
    approval_status: 'Menunggu Kelulusan',
    approved_by_name: null,
    approved_at: null,
    created_at: '2026-11-01T10:30:00Z',
    updated_at: '2026-11-02T14:15:00Z'
  }
];

const INITIAL_MEMBERSHIPS = [
  {
    id: 'mem-medicare-admin',
    company_id: 'comp-medicare-kb',
    email: 'admin.medicare@gmail.com',
    full_name: 'En. Wan Kamarul Ariffin',
    phone: '019-988 4412',
    role: 'partner_admin',
    account_status: 'Aktif',
    created_at: '2026-10-15T09:00:00Z'
  },
  {
    id: 'mem-medicare-driver1',
    company_id: 'comp-medicare-kb',
    email: 'pemandu.medicare@gmail.com',
    full_name: 'Mohd Hafizuddin bin Razak',
    phone: '014-821 9033',
    role: 'partner_driver',
    account_status: 'Aktif',
    created_at: '2026-10-16T09:00:00Z'
  },
  {
    id: 'mem-pantaimedic-admin',
    company_id: 'comp-pantaimedic-phg',
    email: 'admin.pantaimedic@gmail.com',
    full_name: 'Dr. Azlan Shah bin Ismail',
    phone: '013-922 7781',
    role: 'partner_admin',
    account_status: 'Menunggu Kelulusan',
    created_at: '2026-11-01T10:30:00Z'
  }
];

const INITIAL_VEHICLES = [
  {
    id: 'veh-medicare-01',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    plate_number: 'DDU 8892',
    vehicle_type: 'Type B - Basic Life Support (BLS)',
    model: 'Toyota Hiace High Roof 2.8L',
    equipment_list: 'Stretcher Hidraulik, Tangki Oksigen Dual, AED Defibrillator, Suction Unit',
    insurance_expiry: '2027-06-30',
    roadtax_expiry: '2027-06-30',
    approval_status: 'Aktif',
    availability_status: 'Tersedia',
    approved_by_name: 'Abe Di (Pegawai Operasi HQ)',
    approved_at: '2026-10-16T10:00:00Z'
  },
  {
    id: 'veh-medicare-02',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    plate_number: 'DDV 4120',
    vehicle_type: 'Type A - Advanced Life Support (ALS)',
    model: 'Mercedes-Benz Sprinter Ambulance',
    equipment_list: 'Ventilator Mudah Alih, Patient Monitor, Oksigen, Syringe Pump, AED',
    insurance_expiry: '2027-08-15',
    roadtax_expiry: '2027-08-15',
    approval_status: 'Aktif',
    availability_status: 'Tersedia',
    approved_by_name: 'Abe Di (Pegawai Operasi HQ)',
    approved_at: '2026-10-16T10:00:00Z'
  },
  {
    id: 'veh-pantaimedic-01',
    company_id: 'comp-pantaimedic-phg',
    company_name: 'Pantai Timur Medic Response Sdn. Bhd.',
    plate_number: 'CEE 9011',
    vehicle_type: 'Type B - Basic Life Support (BLS)',
    model: 'Nissan Urvan NV350 Ambulance',
    equipment_list: 'Stretcher, Tangki Oksigen, Kit Pertolongan Cemas',
    insurance_expiry: '2027-04-20',
    roadtax_expiry: '2027-04-20',
    approval_status: 'Menunggu Kelulusan',
    availability_status: 'Tersedia',
    approved_by_name: null,
    approved_at: null
  }
];

const INITIAL_DRIVERS = [
  {
    id: 'drv-medicare-01',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    full_name: 'Mohd Hafizuddin bin Razak',
    email: 'pemandu.medicare@gmail.com',
    phone: '014-821 9033',
    ic_number: '920415-03-5411',
    license_no: 'D-920415035411',
    license_expiry: '2028-04-15',
    clinical_qualification: 'EMT & Pembantu Perubatan Terlatih',
    assigned_vehicle_id: 'veh-medicare-01',
    assigned_plate: 'DDU 8892',
    approval_status: 'Aktif',
    availability_status: 'Tersedia',
    approved_by_name: 'Abe Di (Pegawai Operasi HQ)',
    approved_at: '2026-10-16T10:15:00Z'
  },
  {
    id: 'drv-medicare-02',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    full_name: 'Syed Amirul Hakim',
    email: 'amirul.medicare@gmail.com',
    phone: '011-2940 8812',
    ic_number: '940822-03-6109',
    license_no: 'D-940822036109',
    license_expiry: '2027-08-22',
    clinical_qualification: 'Penolong Pegawai Perubatan (MA)',
    assigned_vehicle_id: 'veh-medicare-02',
    assigned_plate: 'DDV 4120',
    approval_status: 'Aktif',
    availability_status: 'Tersedia',
    approved_by_name: 'Abe Di (Pegawai Operasi HQ)',
    approved_at: '2026-10-16T10:15:00Z'
  },
  {
    id: 'drv-pantaimedic-01',
    company_id: 'comp-pantaimedic-phg',
    company_name: 'Pantai Timur Medic Response Sdn. Bhd.',
    full_name: 'Zulkifli bin Othman',
    email: 'zulkifli.pantaimedic@gmail.com',
    phone: '017-901 2245',
    ic_number: '891103-06-5123',
    license_no: 'D-891103065123',
    license_expiry: '2027-11-03',
    clinical_qualification: 'Pemandu Ambulans & BLS',
    assigned_vehicle_id: 'veh-pantaimedic-01',
    assigned_plate: 'CEE 9011',
    approval_status: 'Menunggu Kelulusan',
    availability_status: 'Tersedia',
    approved_by_name: null,
    approved_at: null
  }
];

const INITIAL_OFFERS = [
  {
    id: 'offer-demo-1001',
    invoice_number: 'AMC-RKN-5001',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    offer_status: 'Accepted',
    trip_status: 'Verified Completed',
    customer_invoice_cents: 50000, // RM 500.00
    eligible_commission_base_cents: 50000, // RM 500.00
    commission_rate_bps: 500, // 5%
    commission_amount_cents: 2500, // RM 25.00
    partner_share_cents: 47500, // RM 475.00
    commissionable_breakdown: {
      line_items_cents: { base_fare: 25000, extra_km: 5000, staff: 15000, equipment: 5000, extras: 0 },
      commissionable_flags: { base_fare: true, extra_km: true, staff: true, equipment: true, extras: false }
    },
    origin_area: 'Pasir Mas, Kelantan',
    destination_area: 'Hospital Raja Perempuan Zainab II (HRPZ II), Kota Bharu',
    distance_km: 28.4,
    trip_type: 'Kecemasan Standard + MA',
    required_crew: 'Penolong Pegawai Perubatan (MA) + Pemandu BLS',
    required_equipment: 'Stretcher Hidraulik, Tangki Oksigen Portabel',
    scheduled_time: '2026-11-02T10:00:00Z',
    patient_name: 'Haji Mahmud bin Salleh',
    patient_phone: '019-912 3341',
    patient_notes: 'Pesakit memerlukan sokongan oksigen 3L/min sepanjang perjalanan.',
    assigned_vehicle_id: 'veh-medicare-01',
    assigned_plate: 'DDU 8892',
    assigned_driver_id: 'drv-medicare-01',
    assigned_driver_name: 'Mohd Hafizuddin bin Razak',
    assigned_driver_phone: '014-821 9033',
    completion_notes: 'Pesakit selamat diserahkan ke Zon Kuning Kecemasan HRPZ II dalam keadaan stabil.',
    completion_odometer_km: 29.0,
    handover_receiver_name: 'SN Noraini (Zon Kuning HRPZ II)',
    cash_collected_by_partner_cents: 0,
    completion_submitted_at: '2026-11-02T11:25:00Z',
    verified_by_hq_name: 'Abe Di (Pegawai Operasi HQ)',
    verified_at: '2026-11-02T12:00:00Z',
    offered_by_name: 'Abe Di (Pegawai Operasi HQ)',
    offered_at: '2026-11-02T09:30:00Z',
    expires_at: '2026-11-02T10:30:00Z',
    responded_at: '2026-11-02T09:35:00Z'
  },
  {
    id: 'offer-demo-1002',
    invoice_number: 'AMC-RKN-5002',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    offer_status: 'Offered',
    trip_status: 'Unassigned',
    customer_invoice_cents: 40000, // RM 400.00
    eligible_commission_base_cents: 40000, // RM 400.00
    commission_rate_bps: 500, // 5%
    commission_amount_cents: 2000, // RM 20.00
    partner_share_cents: 38000, // RM 380.00
    commissionable_breakdown: {
      line_items_cents: { base_fare: 25000, extra_km: 0, staff: 10000, equipment: 5000, extras: 0 },
      commissionable_flags: { base_fare: true, extra_km: true, staff: true, equipment: true, extras: false }
    },
    origin_area: 'Tanah Merah, Kelantan',
    destination_area: 'Hospital Universiti Sains Malaysia (HUSM), Kubang Kerian',
    distance_km: 24.0,
    trip_type: 'Bukan Kecemasan (Pindah Wad)',
    required_crew: 'Pembantu Klinikal (CA) + Pemandu BLS',
    required_equipment: 'Stretcher, Tangki Oksigen',
    scheduled_time: new Date(Date.now() + 2 * 3600000).toISOString(),
    patient_name: 'Puan Zainab binti Jusoh',
    patient_phone: '013-980 1120',
    patient_notes: 'Discaj wad untuk rawatan susulan pakar HUSM.',
    assigned_vehicle_id: null,
    assigned_plate: null,
    assigned_driver_id: null,
    assigned_driver_name: null,
    assigned_driver_phone: null,
    offered_by_name: 'Abe Di (Pegawai Operasi HQ)',
    offered_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
    responded_at: null
  }
];

const INITIAL_LEDGER = [
  {
    id: 'led-demo-1001',
    offer_id: 'offer-demo-1001',
    invoice_number: 'AMC-RKN-5001',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    customer_invoice_cents: 50000, // RM 500.00
    eligible_base_cents: 50000, // RM 500.00
    commission_rate_bps: 500, // 5%
    commission_amount_cents: 2500, // RM 25.00
    partner_share_cents: 47500, // RM 475.00
    gateway_fee_cents: 150, // RM 1.50 FPX fee borne by HQ
    amount_collected_cents: 50000,
    collection_channel: 'chip_online_hq',
    customer_payment_verified: true,
    payable_to_partner_cents: 47500, // HQ owes Partner RM 475.00
    receivable_from_partner_cents: 0,
    settlement_status: 'Unsettled',
    settlement_batch_id: null,
    verified_by_name: 'Abe Di (Pegawai Operasi HQ)',
    verified_at: '2026-11-02T12:00:00Z'
  }
];

const INITIAL_INVITATIONS = [
  {
    id: 'pinv-demo-01',
    code_hash: hashInviteCodeSync('RKN-MC2026'),
    masked_code: 'RKN-MC****',
    invitation_type: 'partner_admin',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    ssm_registration_no: '202101014822 (1415122-K)',
    recipient_name: 'En. Wan Kamarul Ariffin',
    recipient_email: 'admin.medicare@gmail.com',
    recipient_phone: '019-988 4412',
    state_coverage: 'Kelantan & Terengganu',
    default_commission_bps: 500,
    status: 'Diterima',
    delivery_status: 'Dihantar',
    failed_attempts: 0,
    expires_at: '2026-12-31T23:59:59Z',
    consumed_at: '2026-10-14T15:00:00Z',
    created_by_name: 'Abe Di (Pegawai Operasi HQ)',
    created_at: '2026-10-12T08:00:00Z'
  }
];

const INITIAL_AUDIT = [
  {
    id: 'paud-01',
    actor_name: 'Abe Di (Pegawai Operasi HQ)',
    actor_role: 'hq_admin',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    invoice_number: null,
    action: 'LULUS_SYARIKAT_RAKAN',
    reason: 'Dokumen SSM, permit KKM dan perlindungan insurans telah disahkan.',
    created_at: '2026-10-15T09:00:00Z'
  },
  {
    id: 'paud-02',
    actor_name: 'Abe Di (Pegawai Operasi HQ)',
    actor_role: 'hq_admin',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    invoice_number: 'AMC-RKN-5001',
    action: 'SAHKAN_SELESAI_DAN_REKOD_KOMISEN',
    reason: 'Bukti serahan HRPZ II disahkan. Komisen 5% (RM25.00) & Bahagian Rakan (RM475.00) direkodkan.',
    created_at: '2026-11-02T12:00:00Z'
  }
];

/* =========================================================================
   4. STATE ACCESSORS & AUDIT HELPER
   ========================================================================= */

export function getPartnerCompanies() {
  return readStore(STORAGE_KEYS.COMPANIES, INITIAL_COMPANIES);
}

export function getPartnerMemberships() {
  return readStore(STORAGE_KEYS.MEMBERSHIPS, INITIAL_MEMBERSHIPS);
}

export function getPartnerInvitations() {
  return readStore(STORAGE_KEYS.INVITATIONS, INITIAL_INVITATIONS);
}

export function getPartnerVehicles() {
  return readStore(STORAGE_KEYS.VEHICLES, INITIAL_VEHICLES);
}

export function getPartnerDrivers() {
  return readStore(STORAGE_KEYS.DRIVERS, INITIAL_DRIVERS);
}

export function getPartnerTripOffers() {
  return readStore(STORAGE_KEYS.OFFERS, INITIAL_OFFERS);
}

export function getPartnerCommissionLedger() {
  return readStore(STORAGE_KEYS.LEDGER, INITIAL_LEDGER);
}

export function getPartnerSettlementBatches() {
  return readStore(STORAGE_KEYS.BATCHES, []);
}

export function getPartnerFinancialAdjustments() {
  return readStore(STORAGE_KEYS.ADJUSTMENTS, []);
}

export function getPartnerAuditLogs() {
  return readStore(STORAGE_KEYS.AUDIT, INITIAL_AUDIT);
}

export function getPartnerState() {
  return {
    companies: getPartnerCompanies(),
    memberships: getPartnerMemberships(),
    invitations: getPartnerInvitations(),
    vehicles: getPartnerVehicles(),
    drivers: getPartnerDrivers(),
    trip_offers: getPartnerTripOffers(),
    ledger: getPartnerCommissionLedger(),
    batches: getPartnerSettlementBatches(),
    adjustments: getPartnerFinancialAdjustments(),
    audits: getPartnerAuditLogs()
  };
}

export function resetPartnerStoreForTests() {
  writeStore(STORAGE_KEYS.COMPANIES, INITIAL_COMPANIES);
  writeStore(STORAGE_KEYS.MEMBERSHIPS, INITIAL_MEMBERSHIPS);
  writeStore(STORAGE_KEYS.INVITATIONS, INITIAL_INVITATIONS);
  writeStore(STORAGE_KEYS.VEHICLES, INITIAL_VEHICLES);
  writeStore(STORAGE_KEYS.DRIVERS, INITIAL_DRIVERS);
  writeStore(STORAGE_KEYS.OFFERS, INITIAL_OFFERS);
  writeStore(STORAGE_KEYS.LEDGER, INITIAL_LEDGER);
  writeStore(STORAGE_KEYS.BATCHES, []);
  writeStore(STORAGE_KEYS.ADJUSTMENTS, []);
  writeStore(STORAGE_KEYS.AUDIT, INITIAL_AUDIT);
}

function recordPartnerAudit({ actorName, actorRole, companyId = null, companyName = null, invoiceNumber = null, action, reason = '', details = {} }) {
  const logs = getPartnerAuditLogs();
  // Strip any sensitive keys from details
  const safeDetails = { ...details };
  delete safeDetails.plainCode;
  delete safeDetails.password;
  delete safeDetails.token;

  const entry = {
    id: `paud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    actor_name: actorName || 'Sistem AFAMS',
    actor_role: actorRole || 'system',
    company_id: companyId,
    company_name: companyName,
    invoice_number: invoiceNumber,
    action,
    reason,
    details: safeDetails,
    created_at: new Date().toISOString()
  };
  logs.unshift(entry);
  writeStore(STORAGE_KEYS.AUDIT, logs.slice(0, 250));
  return entry;
}

/* =========================================================================
   5. AUTHORIZATION & TENANT ISOLATION ENFORCEMENT
   Never trust unverified company IDs or cross-tenant requests.
   ========================================================================= */

export function authorizeActor(actor = {}, allowedRoles = []) {
  if (!actor || !actor.role || !actor.email) {
    return { authorized: false, error: 'Sesi pengguna tidak sah. Sila log masuk semula.' };
  }

  // Check if partner membership or company is suspended
  if (actor.role === 'partner_admin' || actor.role === 'partner_driver') {
    const memberships = getPartnerMemberships();
    const mem = memberships.find(m => m.email.toLowerCase() === actor.email.toLowerCase());
    if (!mem) {
      return { authorized: false, error: 'Akaun rakan ambulans tidak ditemui dalam rekod keahlian.' };
    }
    if (mem.account_status !== 'Aktif') {
      return {
        authorized: false,
        error: `Akses disekat: Status akaun anda ialah "${mem.account_status}". Sila hubungi HQ Al-Farhain.`
      };
    }

    const companies = getPartnerCompanies();
    const comp = companies.find(c => c.id === mem.company_id);
    if (!comp || comp.approval_status !== 'Aktif') {
      return {
        authorized: false,
        error: `Akses operasi disekat: Status syarikat "${comp ? comp.company_name : ''}" ialah "${comp ? comp.approval_status : 'Tidak Sah'}".`
      };
    }

    // Bind trusted company_id from membership table, overriding any client-supplied companyId
    actor.trustedCompanyId = comp.id;
    actor.trustedCompanyName = comp.company_name;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(actor.role)) {
    return {
      authorized: false,
      error: `Akses ditolak: Peranan "${actor.role}" tidak mempunyai kebenaran untuk tindakan ini.`
    };
  }

  return { authorized: true, actor };
}

/* =========================================================================
   6. PHASE 1: PARTNER ONBOARDING, KOD JEMPUTAN & HQ APPROVAL
   ========================================================================= */

export function createPartnerInvitation(actor, payload = {}) {
  const auth = authorizeActor(actor, ['hq_admin', 'partner_admin']);
  if (!auth.authorized) return { success: false, error: auth.error };

  const invitationType = payload.invitation_type || 'partner_admin';
  if (actor.role === 'partner_admin' && invitationType !== 'partner_driver') {
    return { success: false, error: 'Pentadbir Rakan hanya dibenarkan menjemput pemandu syarikat sendiri.' };
  }

  const email = String(payload.recipient_email || '').trim().toLowerCase();
  const recipientName = String(payload.recipient_name || '').trim();
  const recipientPhone = String(payload.recipient_phone || '').trim();
  const companyName = actor.role === 'partner_admin'
    ? actor.trustedCompanyName
    : String(payload.company_name || '').trim();

  if (!email || !email.includes('@') || !recipientName || !recipientPhone || !companyName) {
    return { success: false, error: 'Sila lengkapkan nama syarikat, nama penerima, emel dan nombor telefon.' };
  }

  const invitations = getPartnerInvitations();
  const duplicateActive = invitations.find(
    inv => inv.recipient_email.toLowerCase() === email && inv.status === 'Dihantar' && new Date(inv.expires_at) > new Date()
  );
  if (duplicateActive) {
    return {
      success: false,
      error: `Masih terdapat jemputan aktif (${duplicateActive.masked_code}) untuk emel ${email}. Sila batalkan atau jana semula.`
    };
  }

  const plainCode = generatePartnerInviteCode(invitationType === 'partner_admin' ? 'RKN' : 'DRV');
  const codeHash = hashInviteCodeSync(plainCode);
  const maskedCode = maskInviteCode(plainCode);
  const expiresHours = Math.max(1, Number(payload.expires_hours || 48));
  const expiresAt = new Date(Date.now() + expiresHours * 3600000).toISOString();

  // Create pre-registered company record if new partner_admin invitation
  let companyId = actor.role === 'partner_admin' ? actor.trustedCompanyId : payload.company_id;
  const companies = getPartnerCompanies();

  if (invitationType === 'partner_admin' && !companyId) {
    const ssmNo = String(payload.ssm_registration_no || `SSM-${Date.now().toString().slice(-6)}`).trim();
    const newComp = {
      id: `comp-${Date.now()}`,
      company_code: `RKN-${Math.floor(100 + Math.random() * 900)}`,
      company_name: companyName,
      ssm_registration_no: ssmNo,
      company_email: email,
      contact_phone: recipientPhone,
      director_name: recipientName,
      state_coverage: payload.state_coverage || 'Kelantan & Pahang',
      address: payload.address || '',
      bank_name: payload.bank_name || '',
      bank_account_no: payload.bank_account_no || '',
      bank_account_holder: companyName.toUpperCase(),
      default_commission_bps: Number(payload.default_commission_bps ?? 500),
      commissionable_items: { base_fare: true, extra_km: true, staff: true, equipment: true, extras: false },
      cash_collection_allowed: Boolean(payload.cash_collection_allowed),
      kkm_permit_no: payload.kkm_permit_no || '',
      approval_status: 'Dijemput',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    companies.unshift(newComp);
    writeStore(STORAGE_KEYS.COMPANIES, companies);
    companyId = newComp.id;
  }

  const newInvitation = {
    id: `pinv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    code_hash: codeHash,
    masked_code: maskedCode,
    invitation_type: invitationType,
    company_id: companyId,
    company_name: companyName,
    ssm_registration_no: payload.ssm_registration_no || '',
    recipient_name: recipientName,
    recipient_email: email,
    recipient_phone: recipientPhone,
    state_coverage: payload.state_coverage || 'Kelantan',
    default_commission_bps: Number(payload.default_commission_bps ?? 500),
    status: 'Dihantar',
    delivery_status: 'Manual',
    failed_attempts: 0,
    internal_notes: payload.internal_notes || '',
    expires_at: expiresAt,
    consumed_at: null,
    created_by_name: actor.name || actor.email,
    created_at: new Date().toISOString()
  };

  invitations.unshift(newInvitation);
  writeStore(STORAGE_KEYS.INVITATIONS, invitations);

  recordPartnerAudit({
    actorName: actor.name || actor.email,
    actorRole: actor.role,
    companyId,
    companyName,
    action: 'CIPTA_JEMPUTAN_RAKAN',
    reason: `Jemputan ${invitationType} kepada ${email} (${maskedCode})`
  });

  // Return plainCode ONCE at creation for authorized staff to share
  return {
    success: true,
    invitation: newInvitation,
    shareableCodeOnce: plainCode
  };
}

export function redeemPartnerInvitation({ plainCode, email, phone, companyDetails = {}, vehicleDetails = null, driverDetails = null }) {
  const cleanCode = String(plainCode || '').trim().toUpperCase();
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (!cleanCode || !cleanEmail) {
    return { success: false, error: 'Sila masukkan Kod Jemputan dan emel yang didaftarkan.' };
  }

  const codeHash = hashInviteCodeSync(cleanCode);
  const invitations = getPartnerInvitations();
  const inv = invitations.find(i => i.code_hash === codeHash);

  if (!inv) {
    return { success: false, error: 'Kod jemputan tidak sah atau tidak wujud.' };
  }

  if (inv.failed_attempts >= 5) {
    inv.status = 'Dibatalkan';
    writeStore(STORAGE_KEYS.INVITATIONS, invitations);
    return { success: false, error: 'Jemputan ini telah dikunci kerana melebihi had percubaan gagal.' };
  }

  if (inv.status === 'Diterima') {
    return { success: false, error: 'Kod jemputan ini telah pun digunakan dan tidak boleh ditebus semula.' };
  }

  if (inv.status === 'Dibatalkan') {
    return { success: false, error: 'Jemputan ini telah dibatalkan oleh HQ.' };
  }

  if (new Date(inv.expires_at) <= new Date()) {
    inv.status = 'Tamat Tempoh';
    writeStore(STORAGE_KEYS.INVITATIONS, invitations);
    return { success: false, error: 'Kod jemputan ini telah tamat tempoh sah.' };
  }

  if (inv.recipient_email.toLowerCase() !== cleanEmail) {
    inv.failed_attempts = (inv.failed_attempts || 0) + 1;
    writeStore(STORAGE_KEYS.INVITATIONS, invitations);
    return { success: false, error: 'Emel yang dimasukkan tidak sepadan dengan emel jemputan rasmi.' };
  }

  // Atomic consumption
  inv.status = 'Diterima';
  inv.consumed_at = new Date().toISOString();
  writeStore(STORAGE_KEYS.INVITATIONS, invitations);

  // Update company & membership status to 'Menunggu Kelulusan' (Never auto-approve!)
  const companies = getPartnerCompanies();
  const comp = companies.find(c => c.id === inv.company_id);
  if (comp && inv.invitation_type === 'partner_admin') {
    comp.approval_status = 'Menunggu Kelulusan';
    if (companyDetails.ssm_registration_no) comp.ssm_registration_no = companyDetails.ssm_registration_no;
    if (companyDetails.address) comp.address = companyDetails.address;
    if (companyDetails.bank_name) comp.bank_name = companyDetails.bank_name;
    if (companyDetails.bank_account_no) comp.bank_account_no = companyDetails.bank_account_no;
    if (companyDetails.kkm_permit_no) comp.kkm_permit_no = companyDetails.kkm_permit_no;
    comp.updated_at = new Date().toISOString();
    writeStore(STORAGE_KEYS.COMPANIES, companies);
  }

  const memberships = getPartnerMemberships();
  let mem = memberships.find(m => m.email.toLowerCase() === cleanEmail);
  if (!mem) {
    mem = {
      id: `mem-${Date.now()}`,
      company_id: inv.company_id,
      email: cleanEmail,
      full_name: inv.recipient_name,
      phone: phone || inv.recipient_phone,
      role: inv.invitation_type,
      account_status: 'Menunggu Kelulusan',
      created_at: new Date().toISOString()
    };
    memberships.unshift(mem);
  } else {
    mem.account_status = 'Menunggu Kelulusan';
  }
  writeStore(STORAGE_KEYS.MEMBERSHIPS, memberships);

  if (vehicleDetails && vehicleDetails.plate_number) {
    const vehicles = getPartnerVehicles();
    vehicles.unshift({
      id: `veh-${Date.now()}`,
      company_id: inv.company_id,
      company_name: inv.company_name,
      plate_number: vehicleDetails.plate_number.toUpperCase(),
      vehicle_type: vehicleDetails.vehicle_type || 'Type B - Basic Life Support (BLS)',
      model: vehicleDetails.model || 'Toyota Hiace Ambulance',
      equipment_list: vehicleDetails.equipment_list || 'Stretcher, Oksigen, First Aid',
      approval_status: 'Menunggu Kelulusan',
      availability_status: 'Tersedia',
      created_at: new Date().toISOString()
    });
    writeStore(STORAGE_KEYS.VEHICLES, vehicles);
  }

  if (driverDetails || inv.invitation_type === 'partner_driver') {
    const drivers = getPartnerDrivers();
    drivers.unshift({
      id: `drv-${Date.now()}`,
      company_id: inv.company_id,
      company_name: inv.company_name,
      full_name: (driverDetails && driverDetails.full_name) || inv.recipient_name,
      email: cleanEmail,
      phone: phone || inv.recipient_phone,
      ic_number: (driverDetails && driverDetails.ic_number) || '',
      license_no: (driverDetails && driverDetails.license_no) || '',
      clinical_qualification: (driverDetails && driverDetails.clinical_qualification) || 'EMT / Pemandu Ambulans',
      approval_status: 'Menunggu Kelulusan',
      availability_status: 'Tersedia',
      created_at: new Date().toISOString()
    });
    writeStore(STORAGE_KEYS.DRIVERS, drivers);
  }

  recordPartnerAudit({
    actorName: inv.recipient_name,
    actorRole: inv.invitation_type,
    companyId: inv.company_id,
    companyName: inv.company_name,
    action: 'TEBUS_JEMPUTAN_DAN_HANTAR_PROFIL',
    reason: 'Profil dihantar dan kini Menunggu Kelulusan HQ.'
  });

  return {
    success: true,
    account_status: 'Menunggu Kelulusan',
    company_id: inv.company_id,
    company_name: inv.company_name,
    message: 'Jemputan disahkan. Akaun dan profil syarikat kini berstatus Menunggu Kelulusan HQ.'
  };
}

export function reviewPartnerCompany(actor, { companyId, action, reason = '', commissionBps, commissionableItems, cashCollectionAllowed }) {
  const auth = authorizeActor(actor, ['hq_admin']);
  if (!auth.authorized) return { success: false, error: auth.error };

  const companies = getPartnerCompanies();
  const comp = companies.find(c => c.id === companyId);
  if (!comp) return { success: false, error: 'Syarikat rakan ambulans tidak ditemui.' };

  if (comp.company_email.toLowerCase() === actor.email.toLowerCase()) {
    return { success: false, error: 'Pentadbir tidak dibenarkan meluluskan akaun syarikat sendiri.' };
  }

  const cleanReason = String(reason || '').trim();
  if (['Minta Pembetulan', 'Tolak', 'Gantung'].includes(action) && !cleanReason) {
    return { success: false, error: `Sila nyatakan sebab rasmi bagi tindakan "${action}".` };
  }

  const memberships = getPartnerMemberships();

  if (action === 'Luluskan' || action === 'Aktifkan Semula') {
    comp.approval_status = 'Aktif';
    comp.approved_by_name = actor.name || actor.email;
    comp.approved_at = new Date().toISOString();
    if (commissionBps !== undefined) comp.default_commission_bps = Math.max(0, Math.min(10000, Number(commissionBps)));
    if (commissionableItems) comp.commissionable_items = { ...comp.commissionable_items, ...commissionableItems };
    if (cashCollectionAllowed !== undefined) comp.cash_collection_allowed = Boolean(cashCollectionAllowed);

    // Activate company admin membership
    memberships.forEach(m => {
      if (m.company_id === comp.id && m.role === 'partner_admin') {
        m.account_status = 'Aktif';
      }
    });
  } else if (action === 'Minta Pembetulan') {
    comp.approval_status = 'Perlu Pembetulan';
    comp.correction_notes = cleanReason;
  } else if (action === 'Tolak') {
    comp.approval_status = 'Ditolak';
    comp.rejection_reason = cleanReason;
    memberships.forEach(m => {
      if (m.company_id === comp.id) m.account_status = 'Ditolak';
    });
  } else if (action === 'Gantung') {
    comp.approval_status = 'Digantung';
    comp.suspension_reason = cleanReason;
    comp.suspended_at = new Date().toISOString();
    memberships.forEach(m => {
      if (m.company_id === comp.id) m.account_status = 'Digantung';
    });
  } else {
    return { success: false, error: `Tindakan kelulusan "${action}" tidak dikenali.` };
  }

  comp.updated_at = new Date().toISOString();
  writeStore(STORAGE_KEYS.COMPANIES, companies);
  writeStore(STORAGE_KEYS.MEMBERSHIPS, memberships);

  recordPartnerAudit({
    actorName: actor.name || actor.email,
    actorRole: actor.role,
    companyId: comp.id,
    companyName: comp.company_name,
    action: `SEMAKAN_SYARIKAT_${action.toUpperCase().replace(/\s+/g, '_')}`,
    reason: cleanReason || 'Diluluskan oleh Pentadbir HQ'
  });

  return { success: true, company: comp };
}

export function reviewPartnerResource(actor, { resourceType, resourceId, action, reason = '' }) {
  const auth = authorizeActor(actor, ['hq_admin']);
  if (!auth.authorized) return { success: false, error: auth.error };

  const cleanReason = String(reason || '').trim();
  if (['Tolak', 'Gantung', 'Minta Pembetulan'].includes(action) && !cleanReason) {
    return { success: false, error: `Sila berikan sebab bagi tindakan "${action}".` };
  }

  if (resourceType === 'vehicle') {
    const vehicles = getPartnerVehicles();
    const veh = vehicles.find(v => v.id === resourceId);
    if (!veh) return { success: false, error: 'Kenderaan rakan tidak ditemui.' };
    veh.approval_status = action === 'Luluskan' ? 'Aktif' : action === 'Tolak' ? 'Ditolak' : 'Digantung';
    veh.approved_by_name = actor.name || actor.email;
    veh.approved_at = new Date().toISOString();
    writeStore(STORAGE_KEYS.VEHICLES, vehicles);

    recordPartnerAudit({
      actorName: actor.name || actor.email,
      actorRole: actor.role,
      companyId: veh.company_id,
      companyName: veh.company_name,
      action: `SEMAKAN_KENDERAAN_${veh.plate_number}_${veh.approval_status.toUpperCase()}`,
      reason: cleanReason
    });
    return { success: true, resource: veh };
  }

  if (resourceType === 'driver') {
    const drivers = getPartnerDrivers();
    const drv = drivers.find(d => d.id === resourceId);
    if (!drv) return { success: false, error: 'Pemandu rakan tidak ditemui.' };
    drv.approval_status = action === 'Luluskan' ? 'Aktif' : action === 'Tolak' ? 'Ditolak' : 'Digantung';
    drv.approved_by_name = actor.name || actor.email;
    drv.approved_at = new Date().toISOString();
    writeStore(STORAGE_KEYS.DRIVERS, drivers);

    const memberships = getPartnerMemberships();
    const mem = memberships.find(m => m.email.toLowerCase() === drv.email.toLowerCase());
    if (mem) {
      mem.account_status = drv.approval_status;
      writeStore(STORAGE_KEYS.MEMBERSHIPS, memberships);
    }

    recordPartnerAudit({
      actorName: actor.name || actor.email,
      actorRole: actor.role,
      companyId: drv.company_id,
      companyName: drv.company_name,
      action: `SEMAKAN_PEMANDU_${drv.full_name}_${drv.approval_status.toUpperCase()}`,
      reason: cleanReason
    });
    return { success: true, resource: drv };
  }

  return { success: false, error: 'Jenis sumber tidak sah.' };
}

/* =========================================================================
   7. PHASE 2: TRIP OFFERS, ACCEPTANCE & DRIVER/VEHICLE ASSIGNMENT
   ========================================================================= */

export function createPartnerTripOffer(actor, { booking, companyId, expiresHours = 2 }) {
  const auth = authorizeActor(actor, ['hq_admin', 'dispatcher']);
  if (!auth.authorized) return { success: false, error: auth.error };

  if (!booking || !booking.invoice_number) {
    return { success: false, error: 'Maklumat tempahan dan nombor invois diperlukan.' };
  }

  const companies = getPartnerCompanies();
  const comp = companies.find(c => c.id === companyId);
  if (!comp) {
    return { success: false, error: 'Syarikat rakan ambulans yang dipilih tidak wujud.' };
  }

  if (comp.approval_status !== 'Aktif') {
    return {
      success: false,
      error: `Tawaran disekat: Syarikat "${comp.company_name}" berstatus "${comp.approval_status}". Hanya rakan berstatus Aktif boleh menerima tawaran.`
    };
  }

  const offers = getPartnerTripOffers();
  const existingActive = offers.find(
    o =>
      o.invoice_number === booking.invoice_number &&
      ['Offered', 'Accepted'].includes(o.offer_status) &&
      o.trip_status !== 'Cancelled'
  );

  if (existingActive) {
    return {
      success: false,
      error: `Tempahan ${booking.invoice_number} sudah mempunyai tawaran aktif kepada ${existingActive.company_name} (${existingActive.offer_status}).`
    };
  }

  // Compute immutable financial snapshot in integer MYR cents
  const lineItemsCents = booking.line_items_cents || {
    base_fare: rmToCents(booking.base_fare ?? booking.total_fare ?? 250),
    extra_km: rmToCents(booking.extra_km_cost ?? 0),
    staff: rmToCents(booking.assistance_cost ?? 0),
    equipment: rmToCents(booking.equipment_cost ?? 0),
    extras: rmToCents(booking.non_commissionable_extras ?? 0)
  };

  const commissionFlags = booking.commissionable_flags || comp.commissionable_items || {
    base_fare: true,
    extra_km: true,
    staff: true,
    equipment: true,
    extras: false
  };

  const rateBps = booking.commission_rate_bps ?? comp.default_commission_bps ?? 500;
  const snapshot = calculatePartnerCommissionSnapshot({
    lineItemsCents,
    commissionableFlags: commissionFlags,
    commissionRateBps: rateBps
  });

  const newOffer = {
    id: `offer-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    invoice_number: booking.invoice_number,
    company_id: comp.id,
    company_name: comp.company_name,
    offer_status: 'Offered',
    trip_status: 'Unassigned',
    customer_invoice_cents: snapshot.customer_invoice_cents,
    eligible_commission_base_cents: snapshot.eligible_commission_base_cents,
    commission_rate_bps: snapshot.commission_rate_bps,
    commission_amount_cents: snapshot.commission_amount_cents,
    partner_share_cents: snapshot.partner_share_cents,
    commissionable_breakdown: snapshot.commissionable_breakdown,
    origin_area: booking.origin_name || 'Lokasi Pengambilan',
    destination_area: booking.destination_name || 'Hospital Tujuan',
    distance_km: Number(booking.distance_km || 25.0),
    trip_type: booking.trip_type || 'Kecemasan Standard',
    required_crew: booking.assistance_package || 'Pemandu Perubatan BLS',
    required_equipment: booking.equipment_items || 'Stretcher & Oksigen',
    scheduled_time: booking.scheduled_time || new Date().toISOString(),
    patient_name: booking.patient_name || 'Pesakit AFAMS',
    patient_phone: booking.patient_phone || '013-914 7606',
    patient_notes: booking.patient_notes || '',
    assigned_vehicle_id: null,
    assigned_plate: null,
    assigned_driver_id: null,
    assigned_driver_name: null,
    assigned_driver_phone: null,
    offered_by_name: actor.name || actor.email,
    offered_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + Number(expiresHours) * 3600000).toISOString(),
    responded_at: null
  };

  offers.unshift(newOffer);
  writeStore(STORAGE_KEYS.OFFERS, offers);

  recordPartnerAudit({
    actorName: actor.name || actor.email,
    actorRole: actor.role,
    companyId: comp.id,
    companyName: comp.company_name,
    invoiceNumber: booking.invoice_number,
    action: 'HANTAR_TAWARAN_TUGASAN_RAKAN',
    reason: `Tawaran dihantar kepada ${comp.company_name}. Harga: ${formatRmFromCents(snapshot.customer_invoice_cents)}, Komisen 5%: ${formatRmFromCents(snapshot.commission_amount_cents)}, Bahagian Rakan: ${formatRmFromCents(snapshot.partner_share_cents)}`
  });

  return { success: true, offer: newOffer, financialSnapshot: snapshot };
}

export function respondToPartnerTripOffer(actor, { offerId, decision, declineReason = '', attemptedPriceModification = null }) {
  const auth = authorizeActor(actor, ['partner_admin']);
  if (!auth.authorized) return { success: false, error: auth.error };

  if (attemptedPriceModification !== null && attemptedPriceModification !== undefined) {
    return {
      success: false,
      error: 'Syarikat rakan tidak dibenarkan mengubah harga atau kadar komisen secara sebelah pihak. Sila minta tawaran semakan daripada HQ.'
    };
  }

  const offers = getPartnerTripOffers();
  const offer = offers.find(o => o.id === offerId);
  if (!offer) {
    return { success: false, error: 'Tawaran tugasan tidak ditemui.' };
  }

  // Strict Company Isolation: Partner A cannot view or accept Partner B's offer
  if (offer.company_id !== auth.actor.trustedCompanyId) {
    return {
      success: false,
      error: 'Akses ditolak: Anda tidak mempunyai kebenaran ke atas tawaran milik syarikat rakan lain.'
    };
  }

  if (offer.offer_status !== 'Offered') {
    return {
      success: false,
      error: `Tawaran ini tidak boleh diterima/ditolak kerana berstatus "${offer.offer_status}".`
    };
  }

  if (new Date(offer.expires_at) <= new Date()) {
    offer.offer_status = 'Expired';
    writeStore(STORAGE_KEYS.OFFERS, offers);
    return { success: false, error: 'Tawaran tugasan ini telah tamat tempoh.' };
  }

  // Check no other partner already accepted this invoice concurrently
  const alreadyAcceptedOther = offers.find(
    o => o.invoice_number === offer.invoice_number && o.id !== offer.id && o.offer_status === 'Accepted' && o.trip_status !== 'Cancelled'
  );
  if (alreadyAcceptedOther) {
    return { success: false, error: 'Tugasan ini telah pun diterima dan dikunci oleh penyedia lain.' };
  }

  if (decision === 'Accept') {
    offer.offer_status = 'Accepted';
    offer.responded_at = new Date().toISOString();
    writeStore(STORAGE_KEYS.OFFERS, offers);

    recordPartnerAudit({
      actorName: actor.name || actor.email,
      actorRole: actor.role,
      companyId: offer.company_id,
      companyName: offer.company_name,
      invoiceNumber: offer.invoice_number,
      action: 'TERIMA_TAWARAN_TUGASAN',
      reason: `Tawaran diterima pada terma tetap: Bahagian Rakan ${formatRmFromCents(offer.partner_share_cents)}`
    });

    return { success: true, offer };
  } else if (decision === 'Decline') {
    const cleanReason = String(declineReason || '').trim() || 'Tiada ambulans/krew berkelapangan';
    offer.offer_status = 'Declined';
    offer.decline_reason = cleanReason;
    offer.responded_at = new Date().toISOString();
    writeStore(STORAGE_KEYS.OFFERS, offers);

    recordPartnerAudit({
      actorName: actor.name || actor.email,
      actorRole: actor.role,
      companyId: offer.company_id,
      companyName: offer.company_name,
      invoiceNumber: offer.invoice_number,
      action: 'TOLAK_TAWARAN_TUGASAN',
      reason: cleanReason
    });

    return { success: true, offer };
  }

  return { success: false, error: 'Keputusan tawaran mestilah "Accept" atau "Decline".' };
}

export function withdrawPartnerTripOffer(actor, { offerId, reason = '' }) {
  const auth = authorizeActor(actor, ['hq_admin', 'dispatcher']);
  if (!auth.authorized) return { success: false, error: auth.error };

  const offers = getPartnerTripOffers();
  const offer = offers.find(o => o.id === offerId);
  if (!offer) return { success: false, error: 'Tawaran tidak ditemui.' };

  if (offer.offer_status !== 'Offered') {
    return { success: false, error: `Hanya tawaran berstatus "Offered" boleh ditarik balik (status semasa: ${offer.offer_status}).` };
  }

  offer.offer_status = 'Withdrawn';
  offer.withdrawn_reason = reason || 'Ditarik balik oleh pusat kawalan HQ';
  writeStore(STORAGE_KEYS.OFFERS, offers);

  recordPartnerAudit({
    actorName: actor.name || actor.email,
    actorRole: actor.role,
    companyId: offer.company_id,
    companyName: offer.company_name,
    invoiceNumber: offer.invoice_number,
    action: 'TARIK_BALIK_TAWARAN',
    reason: offer.withdrawn_reason
  });

  return { success: true, offer };
}

export function assignPartnerResourcesToTrip(actor, { offerId, vehicleId, driverId }) {
  const auth = authorizeActor(actor, ['partner_admin']);
  if (!auth.authorized) return { success: false, error: auth.error };

  const offers = getPartnerTripOffers();
  const offer = offers.find(o => o.id === offerId);
  if (!offer) return { success: false, error: 'Tawaran tugasan tidak ditemui.' };

  if (offer.company_id !== auth.actor.trustedCompanyId) {
    return { success: false, error: 'Akses ditolak: Anda tidak boleh menguruskan tugasan syarikat lain.' };
  }

  if (offer.offer_status !== 'Accepted') {
    return { success: false, error: 'Sila terima tawaran tugasan terlebih dahulu sebelum menetapkan ambulans dan pemandu.' };
  }

  const vehicles = getPartnerVehicles();
  const veh = vehicles.find(v => v.id === vehicleId && v.company_id === offer.company_id);
  if (!veh) return { success: false, error: 'Ambulans tidak ditemui dalam senarai armada syarikat anda.' };
  if (veh.approval_status !== 'Aktif') {
    return { success: false, error: `Ambulans ${veh.plate_number} belum diluluskan oleh HQ (${veh.approval_status}).` };
  }
  if (veh.availability_status !== 'Tersedia') {
    return { success: false, error: `Ambulans ${veh.plate_number} sedang tidak tersedia (${veh.availability_status}). Elakkan tempahan bertindih.` };
  }

  const drivers = getPartnerDrivers();
  const drv = drivers.find(d => d.id === driverId && d.company_id === offer.company_id);
  if (!drv) return { success: false, error: 'Pemandu tidak ditemui dalam senarai krew syarikat anda.' };
  if (drv.approval_status !== 'Aktif') {
    return { success: false, error: `Pemandu ${drv.full_name} belum diluluskan oleh HQ (${drv.approval_status}).` };
  }
  if (drv.availability_status !== 'Tersedia') {
    return { success: false, error: `Pemandu ${drv.full_name} sedang dalam tugasan lain (${drv.availability_status}).` };
  }

  // Lock vehicle & driver availability
  veh.availability_status = 'Dalam Tugasan';
  drv.availability_status = 'Dalam Tugasan';
  writeStore(STORAGE_KEYS.VEHICLES, vehicles);
  writeStore(STORAGE_KEYS.DRIVERS, drivers);

  offer.assigned_vehicle_id = veh.id;
  offer.assigned_plate = veh.plate_number;
  offer.assigned_driver_id = drv.id;
  offer.assigned_driver_name = drv.full_name;
  offer.assigned_driver_phone = drv.phone;
  offer.trip_status = 'Assigned';
  offer.updated_at = new Date().toISOString();
  writeStore(STORAGE_KEYS.OFFERS, offers);

  // Sync actual provider info to customer's booking in amc_all_bookings
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('amc_all_bookings');
      if (raw) {
        const list = JSON.parse(raw);
        const idx = list.findIndex(b => (b.invoice_number || b.invoiceNumber) === offer.invoice_number);
        if (idx >= 0) {
          list[idx].provider_type = 'partner';
          list[idx].partner_company_id = offer.company_id;
          list[idx].partner_company_name = offer.company_name;
          list[idx].plate_number = veh.plate_number;
          list[idx].driver_name = `${drv.full_name} (${offer.company_name})`;
          list[idx].contact_phone = drv.phone;
          list[idx].status = 'Assigned';
          localStorage.setItem('amc_all_bookings', JSON.stringify(list));
        }
      }
    }
  } catch (e) {}

  recordPartnerAudit({
    actorName: actor.name || actor.email,
    actorRole: actor.role,
    companyId: offer.company_id,
    companyName: offer.company_name,
    invoiceNumber: offer.invoice_number,
    action: 'TETAPKAN_AMBULANS_DAN_PEMANDU_RAKAN',
    reason: `Ambulans ${veh.plate_number} & Pemandu ${drv.full_name} ditetapkan.`
  });

  return { success: true, offer, vehicle: veh, driver: drv };
}

/* =========================================================================
   8. PHASE 3: TRIP PROGRESS, COMPLETION EVIDENCE & 5% COMMISSION LEDGER
   ========================================================================= */

export function updatePartnerTripProgress(actor, { offerId, newStatus, completionEvidence = {} }) {
  const auth = authorizeActor(actor, ['partner_driver', 'partner_admin']);
  if (!auth.authorized) return { success: false, error: auth.error };

  const offers = getPartnerTripOffers();
  const offer = offers.find(o => o.id === offerId);
  if (!offer) return { success: false, error: 'Tugasan tidak ditemui.' };

  if (offer.company_id !== auth.actor.trustedCompanyId) {
    return { success: false, error: 'Akses ditolak: Tugasan ini bukan milik syarikat anda.' };
  }

  const validStatuses = ['Assigned', 'En Route', 'On Scene', 'In Transit', 'Completed Pending Review', 'Cancelled'];
  if (!validStatuses.includes(newStatus)) {
    return { success: false, error: `Status perjalanan "${newStatus}" tidak sah.` };
  }

  if (newStatus === 'Completed Pending Review') {
    if (!completionEvidence.handover_receiver_name || !completionEvidence.completion_notes) {
      return {
        success: false,
        error: 'Sila lengkapkan bukti serahan pesakit (nama penerima di destinasi dan catatan serahan).'
      };
    }

    // Check cash collection permission
    const cashCents = rmToCents(completionEvidence.cash_collected_rm || 0);
    if (cashCents > 0) {
      const companies = getPartnerCompanies();
      const comp = companies.find(c => c.id === offer.company_id);
      if (!comp || !comp.cash_collection_allowed) {
        return {
          success: false,
          error: 'Syarikat anda tidak mempunyai kebenaran HQ untuk mengutip bayaran tunai daripada pelanggan.'
        };
      }
      offer.cash_collected_by_partner_cents = cashCents;
    }

    offer.completion_notes = completionEvidence.completion_notes;
    offer.handover_receiver_name = completionEvidence.handover_receiver_name;
    offer.completion_odometer_km = Number(completionEvidence.completion_odometer_km || offer.distance_km);
    offer.completion_submitted_at = new Date().toISOString();

    // Release vehicle & driver back to Tersedia
    const vehicles = getPartnerVehicles();
    const veh = vehicles.find(v => v.id === offer.assigned_vehicle_id);
    if (veh) veh.availability_status = 'Tersedia';
    writeStore(STORAGE_KEYS.VEHICLES, vehicles);

    const drivers = getPartnerDrivers();
    const drv = drivers.find(d => d.id === offer.assigned_driver_id);
    if (drv) drv.availability_status = 'Tersedia';
    writeStore(STORAGE_KEYS.DRIVERS, drivers);
  }

  offer.trip_status = newStatus;
  offer.updated_at = new Date().toISOString();
  writeStore(STORAGE_KEYS.OFFERS, offers);

  recordPartnerAudit({
    actorName: actor.name || actor.email,
    actorRole: actor.role,
    companyId: offer.company_id,
    companyName: offer.company_name,
    invoiceNumber: offer.invoice_number,
    action: `KEMASKINI_STATUS_TUGASAN_${newStatus.toUpperCase().replace(/\s+/g, '_')}`,
    reason: offer.completion_notes || `Status dikemas kini kepada ${newStatus}`
  });

  return { success: true, offer };
}

/**
 * HQ verifies partner trip completion and accrues the 5% commission into the ledger.
 * Strictly idempotent: prevents duplicate commission accrual for the same offer/invoice.
 */
export function verifyPartnerTripCompletion(
  actor,
  { offerId, collectionChannel = 'chip_online_hq', amountCollectedCents, gatewayFeeCents = 0, verificationNotes = '' }
) {
  const auth = authorizeActor(actor, ['hq_admin', 'hq_finance']);
  if (!auth.authorized) return { success: false, error: auth.error };

  const offers = getPartnerTripOffers();
  const offer = offers.find(o => o.id === offerId);
  if (!offer) return { success: false, error: 'Rekod tugasan rakan tidak ditemui.' };

  if (offer.trip_status === 'Cancelled' || offer.offer_status !== 'Accepted') {
    return {
      success: false,
      error: 'Tugasan yang dibatalkan atau belum diterima tidak layak untuk pengesahan selesai dan komisen.'
    };
  }

  // Idempotency check: prevent duplicate commission accrual
  const ledger = getPartnerCommissionLedger();
  const existingEntry = ledger.find(l => l.offer_id === offer.id || l.invoice_number === offer.invoice_number);
  if (existingEntry) {
    return {
      success: false,
      duplicate: true,
      error: `Komisen bagi invois ${offer.invoice_number} telah pun direkodkan sebelum ini (ID Lejar: ${existingEntry.id}).`,
      ledgerEntry: existingEntry
    };
  }

  offer.trip_status = 'Verified Completed';
  offer.verified_by_hq_name = actor.name || actor.email;
  offer.verified_at = new Date().toISOString();
  writeStore(STORAGE_KEYS.OFFERS, offers);

  const collectedCents =
    amountCollectedCents !== undefined
      ? Math.round(Number(amountCollectedCents))
      : collectionChannel === 'uncollected'
      ? 0
      : offer.customer_invoice_cents;

  let payableToPartnerCents = 0;
  let receivableFromPartnerCents = 0;
  let customerPaymentVerified = false;
  let settlementStatus = 'Unsettled';

  if (collectionChannel === 'chip_online_hq' || collectionChannel === 'cash_collected_hq') {
    // Al-Farhain collected the funds -> Partner's share (e.g. RM475) is payable to Partner
    customerPaymentVerified = collectedCents >= offer.customer_invoice_cents;
    payableToPartnerCents = offer.partner_share_cents;
    receivableFromPartnerCents = 0;
    settlementStatus = customerPaymentVerified ? 'Unsettled' : 'Pending Customer Payment';
  } else if (collectionChannel === 'cash_collected_partner') {
    // Partner collected cash (e.g. RM500) -> Al-Farhain's 5% commission (e.g. RM25) is receivable from Partner
    customerPaymentVerified = true;
    payableToPartnerCents = 0;
    receivableFromPartnerCents = offer.commission_amount_cents;
    settlementStatus = 'Unsettled';
  } else {
    // Uncollected customer payment -> cannot be settled until customer payment is verified
    customerPaymentVerified = false;
    payableToPartnerCents = 0;
    receivableFromPartnerCents = 0;
    settlementStatus = 'Pending Customer Payment';
  }

  const newLedgerEntry = {
    id: `led-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    offer_id: offer.id,
    invoice_number: offer.invoice_number,
    company_id: offer.company_id,
    company_name: offer.company_name,
    customer_invoice_cents: offer.customer_invoice_cents,
    eligible_base_cents: offer.eligible_commission_base_cents,
    commission_rate_bps: offer.commission_rate_bps,
    commission_amount_cents: offer.commission_amount_cents,
    partner_share_cents: offer.partner_share_cents,
    gateway_fee_cents: Math.max(0, Math.round(Number(gatewayFeeCents || 0))),
    amount_collected_cents: collectedCents,
    collection_channel: collectionChannel,
    customer_payment_verified: customerPaymentVerified,
    payable_to_partner_cents: payableToPartnerCents,
    receivable_from_partner_cents: receivableFromPartnerCents,
    settlement_status: settlementStatus,
    settlement_batch_id: null,
    verified_by_name: actor.name || actor.email,
    verified_at: new Date().toISOString()
  };

  ledger.unshift(newLedgerEntry);
  writeStore(STORAGE_KEYS.LEDGER, ledger);

  recordPartnerAudit({
    actorName: actor.name || actor.email,
    actorRole: actor.role,
    companyId: offer.company_id,
    companyName: offer.company_name,
    invoiceNumber: offer.invoice_number,
    action: 'SAHKAN_SELESAI_DAN_REKOD_KOMISEN',
    reason:
      verificationNotes ||
      `Komisen ${formatRmFromCents(newLedgerEntry.commission_amount_cents)} (${newLedgerEntry.commission_rate_bps / 100}%) direkodkan melalui saluran ${collectionChannel}.`
  });

  return { success: true, offer, ledgerEntry: newLedgerEntry };
}

/* =========================================================================
   9. PHASE 4: MANUAL SETTLEMENTS, STATEMENTS & FINANCIAL ADJUSTMENTS
   ========================================================================= */

export function createFinancialAdjustment(
  actor,
  {
    companyId,
    invoiceNumber = null,
    adjustmentType,
    customerRefundCents = 0,
    commissionAdjustmentCents = 0,
    partnerShareAdjustmentCents = 0,
    reason
  }
) {
  const auth = authorizeActor(actor, ['hq_admin', 'hq_finance']);
  if (!auth.authorized) return { success: false, error: auth.error };

  const cleanReason = String(reason || '').trim();
  if (!cleanReason) {
    return { success: false, error: 'Sebab pelarasan kewangan wajib dinyatakan untuk rekod audit.' };
  }

  const companies = getPartnerCompanies();
  const comp = companies.find(c => c.id === companyId);
  if (!comp) return { success: false, error: 'Syarikat rakan tidak ditemui.' };

  const validTypes = [
    'Cancellation Charge',
    'Partial Refund',
    'Full Refund',
    'Dispute Credit',
    'Dispute Debit',
    'Cash Reconciliation'
  ];
  if (!validTypes.includes(adjustmentType)) {
    return { success: false, error: `Jenis pelarasan "${adjustmentType}" tidak sah.` };
  }

  const adjustments = getPartnerFinancialAdjustments();
  const newAdj = {
    id: `adj-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    adjustment_reference: `ADJ-${Date.now().toString().slice(-6)}`,
    company_id: comp.id,
    company_name: comp.company_name,
    invoice_number: invoiceNumber,
    adjustment_type: adjustmentType,
    customer_refund_cents: Math.round(Number(customerRefundCents || 0)),
    commission_adjustment_cents: Math.round(Number(commissionAdjustmentCents || 0)),
    partner_share_adjustment_cents: Math.round(Number(partnerShareAdjustmentCents || 0)),
    reason: cleanReason,
    status: 'Approved',
    settlement_batch_id: null,
    approved_by_name: actor.name || actor.email,
    created_at: new Date().toISOString()
  };

  adjustments.unshift(newAdj);
  writeStore(STORAGE_KEYS.ADJUSTMENTS, adjustments);

  recordPartnerAudit({
    actorName: actor.name || actor.email,
    actorRole: actor.role,
    companyId: comp.id,
    companyName: comp.company_name,
    invoiceNumber,
    action: `PELARASAN_KEWANGAN_${adjustmentType.toUpperCase().replace(/\s+/g, '_')}`,
    reason: `${cleanReason} (Pelarasan Bahagian Rakan: ${formatRmFromCents(newAdj.partner_share_adjustment_cents)})`
  });

  return { success: true, adjustment: newAdj };
}

export function createSettlementBatch(actor, { companyId, periodStart, periodEnd, notes = '' }) {
  const auth = authorizeActor(actor, ['hq_admin', 'hq_finance']);
  if (!auth.authorized) return { success: false, error: auth.error };

  const companies = getPartnerCompanies();
  const comp = companies.find(c => c.id === companyId);
  if (!comp) return { success: false, error: 'Syarikat rakan tidak ditemui.' };

  const ledger = getPartnerCommissionLedger();
  const eligibleLedgerItems = ledger.filter(
    l =>
      l.company_id === companyId &&
      l.settlement_status === 'Unsettled' &&
      l.customer_payment_verified === true &&
      !l.settlement_batch_id
  );

  const adjustments = getPartnerFinancialAdjustments();
  const eligibleAdjustments = adjustments.filter(
    a => a.company_id === companyId && a.status === 'Approved' && !a.settlement_batch_id
  );

  if (eligibleLedgerItems.length === 0 && eligibleAdjustments.length === 0) {
    return {
      success: false,
      error: 'Tiada item lejar yang telah disahkan bayaran atau pelarasan terbuka untuk dimasukkan ke dalam penyata penyelesaian.'
    };
  }

  let totalGrossCents = 0;
  let totalCommissionCents = 0;
  let totalPayableToPartnerCents = 0;
  let totalReceivableFromPartnerCents = 0;
  let totalAdjustmentsCents = 0;

  eligibleLedgerItems.forEach(item => {
    totalGrossCents += item.customer_invoice_cents;
    totalCommissionCents += item.commission_amount_cents;
    totalPayableToPartnerCents += item.payable_to_partner_cents;
    totalReceivableFromPartnerCents += item.receivable_from_partner_cents;
  });

  eligibleAdjustments.forEach(adj => {
    totalAdjustmentsCents += adj.partner_share_adjustment_cents;
    totalCommissionCents += adj.commission_adjustment_cents;
  });

  const netSettlementCents = totalPayableToPartnerCents - totalReceivableFromPartnerCents + totalAdjustmentsCents;

  const batchId = `batch-${Date.now()}`;
  const batchRef = `STL-${new Date().toISOString().slice(0, 7).replace('-', '')}-${Math.floor(100 + Math.random() * 900)}`;

  const newBatch = {
    id: batchId,
    batch_reference: batchRef,
    company_id: comp.id,
    company_name: comp.company_name,
    period_start: periodStart || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    period_end: periodEnd || new Date().toISOString().slice(0, 10),
    total_trips: eligibleLedgerItems.length,
    total_gross_cents: totalGrossCents,
    total_commission_cents: totalCommissionCents,
    total_payable_to_partner_cents: totalPayableToPartnerCents,
    total_receivable_from_partner_cents: totalReceivableFromPartnerCents,
    total_adjustments_cents: totalAdjustmentsCents,
    net_settlement_cents: netSettlementCents,
    status: 'Reviewed',
    payment_reference: null,
    notes,
    created_by_name: actor.name || actor.email,
    reviewed_by_name: actor.name || actor.email,
    settled_by_name: null,
    settled_at: null,
    created_at: new Date().toISOString()
  };

  eligibleLedgerItems.forEach(item => {
    item.settlement_batch_id = batchId;
    item.settlement_status = 'In Settlement Batch';
  });

  eligibleAdjustments.forEach(adj => {
    adj.settlement_batch_id = batchId;
    adj.status = 'Applied';
  });

  const batches = getPartnerSettlementBatches();
  batches.unshift(newBatch);

  writeStore(STORAGE_KEYS.LEDGER, ledger);
  writeStore(STORAGE_KEYS.ADJUSTMENTS, adjustments);
  writeStore(STORAGE_KEYS.BATCHES, batches);

  recordPartnerAudit({
    actorName: actor.name || actor.email,
    actorRole: actor.role,
    companyId: comp.id,
    companyName: comp.company_name,
    action: 'JANA_PENYATA_PENYELESAIAN',
    reason: `Penyata ${batchRef} dijana untuk ${eligibleLedgerItems.length} trip. Nilai bersih: ${formatRmFromCents(netSettlementCents)}`
  });

  return { success: true, batch: newBatch };
}

export function completeSettlementBatch(actor, { batchId, paymentReference, notes = '' }) {
  const auth = authorizeActor(actor, ['hq_admin', 'hq_finance']);
  if (!auth.authorized) return { success: false, error: auth.error };

  const cleanRef = String(paymentReference || '').trim();
  if (!cleanRef) {
    return { success: false, error: 'Sila masukkan nombor rujukan transaksi bank / resit penyelesaian.' };
  }

  const batches = getPartnerSettlementBatches();
  const batch = batches.find(b => b.id === batchId);
  if (!batch) return { success: false, error: 'Penyata penyelesaian tidak ditemui.' };

  if (batch.status === 'Settled') {
    return {
      success: false,
      duplicate: true,
      error: `Penyata ${batch.batch_reference} telah pun diselesaikan pada ${batch.settled_at} (Rujukan: ${batch.payment_reference}).`
    };
  }

  batch.status = 'Settled';
  batch.payment_reference = cleanRef;
  if (notes) batch.notes = notes;
  batch.settled_by_name = actor.name || actor.email;
  batch.settled_at = new Date().toISOString();

  const ledger = getPartnerCommissionLedger();
  ledger.forEach(item => {
    if (item.settlement_batch_id === batch.id) {
      item.settlement_status = 'Settled';
      item.settled_at = batch.settled_at;
    }
  });

  writeStore(STORAGE_KEYS.BATCHES, batches);
  writeStore(STORAGE_KEYS.LEDGER, ledger);

  recordPartnerAudit({
    actorName: actor.name || actor.email,
    actorRole: actor.role,
    companyId: batch.company_id,
    companyName: batch.company_name,
    action: 'SELESAIKAN_PEMBAYARAN_PENYATA',
    reason: `Penyata ${batch.batch_reference} selesai. Rujukan Bank/Resit: ${cleanRef}`
  });

  return { success: true, batch };
}

/* =========================================================================
   10. COMPANY-SCOPED PORTAL VIEW QUERIES (PARTNER ISOLATION)
   ========================================================================= */

export function getPartnerPortalScopedData(actor, requestedCompanyId = null) {
  const auth = authorizeActor(actor, ['partner_admin', 'partner_driver', 'hq_admin', 'hq_finance', 'dispatcher']);
  if (!auth.authorized) return { success: false, error: auth.error };

  let targetCompanyId = requestedCompanyId;

  if (actor.role === 'partner_admin' || actor.role === 'partner_driver') {
    if (requestedCompanyId && requestedCompanyId !== auth.actor.trustedCompanyId) {
      return {
        success: false,
        error: 'Pelanggaran keselamatan disekat: Anda tidak dibenarkan mengakses data syarikat rakan ambulans lain.'
      };
    }
    targetCompanyId = auth.actor.trustedCompanyId;
  }

  const companies = getPartnerCompanies();
  const company = companies.find(c => c.id === targetCompanyId) || companies[0];
  if (!company) return { success: false, error: 'Tiada syarikat rakan ditemui.' };

  const cid = company.id;
  const vehicles = getPartnerVehicles().filter(v => v.company_id === cid);
  const drivers = getPartnerDrivers().filter(d => d.company_id === cid);

  // Redact sensitive patient phone/name on unaccepted offers!
  const rawOffers = getPartnerTripOffers().filter(o => o.company_id === cid);
  const scopedOffers = rawOffers.map(o => {
    if (o.offer_status !== 'Accepted') {
      return {
        ...o,
        patient_name: 'Dirahsiakan Sehingga Tawaran Diterima',
        patient_phone: '***-*** ****',
        patient_notes: 'Maklumat klinikal terperinci dipaparkan selepas tawaran diterima.'
      };
    }
    return o;
  });

  const ledger = actor.role === 'partner_driver' ? [] : getPartnerCommissionLedger().filter(l => l.company_id === cid);
  const batches = actor.role === 'partner_driver' ? [] : getPartnerSettlementBatches().filter(b => b.company_id === cid);
  const adjustments = actor.role === 'partner_driver' ? [] : getPartnerFinancialAdjustments().filter(a => a.company_id === cid);

  return {
    success: true,
    company,
    vehicles,
    drivers,
    offers: scopedOffers,
    ledger,
    batches,
    adjustments
  };
}
