-- =========================================================================
-- AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
-- MIGRATION: Rakan Ambulans (External Partner Ambulance Network & 5% Commission Ledger)
-- File: supabase_partner_ambulances_schema.sql
-- Application Order:
--   1. supabase_schema.sql
--   2. supabase_driver_invitations_schema.sql
--   3. supabase_partner_ambulances_schema.sql
-- =========================================================================

-- 1. Extend Staff Roles to include HQ Finance ('hq_finance')
ALTER TABLE public.staff_roles
DROP CONSTRAINT IF EXISTS staff_roles_role_check;

ALTER TABLE public.staff_roles
ADD CONSTRAINT staff_roles_role_check
CHECK (role IN ('hq_admin', 'branch_manager', 'dispatcher', 'hq_finance'));

INSERT INTO public.staff_roles (email, full_name, role, branch_id)
VALUES
    ('kewangan@alfarhain.my', 'Puan Siti Nurhaliza (Pegawai Kewangan HQ)', 'hq_finance', 'all')
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

-- 2. Partner Companies Table
CREATE TABLE IF NOT EXISTS public.partner_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_code VARCHAR(30) UNIQUE NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    ssm_registration_no VARCHAR(60) NOT NULL UNIQUE,
    company_email VARCHAR(255) NOT NULL UNIQUE,
    contact_phone VARCHAR(50) NOT NULL,
    director_name VARCHAR(150) NOT NULL,
    state_coverage VARCHAR(120) NOT NULL DEFAULT 'Kelantan & Terengganu',
    address TEXT,
    bank_name VARCHAR(100),
    bank_account_no VARCHAR(60),
    bank_account_holder VARCHAR(150),
    default_commission_bps INTEGER NOT NULL DEFAULT 500 CHECK (default_commission_bps >= 0 AND default_commission_bps <= 10000),
    commissionable_items JSONB NOT NULL DEFAULT '{"base_fare": true, "extra_km": true, "staff": true, "equipment": true}'::jsonb,
    cash_collection_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    kkm_permit_no VARCHAR(100),
    approval_status VARCHAR(40) NOT NULL DEFAULT 'Menunggu Kelulusan'
        CHECK (approval_status IN ('Dijemput', 'Profil Belum Lengkap', 'Menunggu Kelulusan', 'Perlu Pembetulan', 'Aktif', 'Ditolak', 'Digantung')),
    correction_notes TEXT,
    rejection_reason TEXT,
    suspension_reason TEXT,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by_name VARCHAR(150),
    approved_at TIMESTAMP WITH TIME ZONE,
    suspended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_companies_status ON public.partner_companies(approval_status);
CREATE INDEX IF NOT EXISTS idx_partner_companies_email ON public.partner_companies(company_email);

-- 3. Partner Memberships & Permissions (Company-Scoped Access)
CREATE TABLE IF NOT EXISTS public.partner_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.partner_companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    role VARCHAR(40) NOT NULL CHECK (role IN ('partner_admin', 'partner_driver')),
    account_status VARCHAR(40) NOT NULL DEFAULT 'Menunggu Kelulusan'
        CHECK (account_status IN ('Profil Belum Lengkap', 'Menunggu Kelulusan', 'Perlu Pembetulan', 'Aktif', 'Ditolak', 'Digantung')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_memberships_company ON public.partner_memberships(company_id);
CREATE INDEX IF NOT EXISTS idx_partner_memberships_email ON public.partner_memberships(email);

-- 4. Partner Invitations (Extends Kod Jemputan Architecture for Partner Admins & Drivers)
CREATE TABLE IF NOT EXISTS public.partner_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash VARCHAR(64) NOT NULL UNIQUE,
    masked_code VARCHAR(25) NOT NULL,
    invitation_type VARCHAR(40) NOT NULL CHECK (invitation_type IN ('partner_admin', 'partner_driver')),
    company_id UUID REFERENCES public.partner_companies(id) ON DELETE CASCADE,
    company_name VARCHAR(200) NOT NULL,
    ssm_registration_no VARCHAR(60),
    recipient_name VARCHAR(150) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(50) NOT NULL,
    state_coverage VARCHAR(120),
    default_commission_bps INTEGER DEFAULT 500,
    status VARCHAR(30) NOT NULL DEFAULT 'Dihantar'
        CHECK (status IN ('Dihantar', 'Diterima', 'Tamat Tempoh', 'Dibatalkan')),
    delivery_status VARCHAR(30) NOT NULL DEFAULT 'Manual'
        CHECK (delivery_status IN ('Tertangguh', 'Dihantar', 'Gagal', 'Manual')),
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    internal_notes TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason TEXT,
    created_by_name VARCHAR(150) DEFAULT 'Pentadbir HQ',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_invitations_email ON public.partner_invitations(recipient_email);
CREATE INDEX IF NOT EXISTS idx_partner_invitations_company ON public.partner_invitations(company_id);

-- 5. Partner Vehicles (Armada Rakan Ambulans)
CREATE TABLE IF NOT EXISTS public.partner_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.partner_companies(id) ON DELETE CASCADE,
    plate_number VARCHAR(20) NOT NULL UNIQUE,
    vehicle_type VARCHAR(80) NOT NULL DEFAULT 'Type B - Basic Life Support (BLS)',
    model VARCHAR(100) NOT NULL DEFAULT 'Toyota Hiace High Roof',
    equipment_list TEXT DEFAULT 'Stretcher, Tangki Oksigen, Kit Pertolongan Cemas, Suction Unit',
    insurance_expiry DATE,
    roadtax_expiry DATE,
    approval_status VARCHAR(40) NOT NULL DEFAULT 'Menunggu Kelulusan'
        CHECK (approval_status IN ('Menunggu Kelulusan', 'Perlu Pembetulan', 'Aktif', 'Ditolak', 'Digantung')),
    availability_status VARCHAR(40) NOT NULL DEFAULT 'Tersedia'
        CHECK (availability_status IN ('Tersedia', 'Dalam Tugasan', 'Penyelenggaraan', 'Tidak Aktif')),
    rejection_reason TEXT,
    approved_by_name VARCHAR(150),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_vehicles_company ON public.partner_vehicles(company_id);
CREATE INDEX IF NOT EXISTS idx_partner_vehicles_status ON public.partner_vehicles(approval_status, availability_status);

-- 6. Partner Drivers (Pemandu & Krew Rakan Ambulans)
CREATE TABLE IF NOT EXISTS public.partner_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.partner_companies(id) ON DELETE CASCADE,
    membership_id UUID REFERENCES public.partner_memberships(id) ON DELETE SET NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50) NOT NULL,
    ic_number VARCHAR(30),
    license_no VARCHAR(50),
    license_expiry DATE,
    clinical_qualification VARCHAR(100) DEFAULT 'Pemandu Perubatan Terlatih / EMT',
    assigned_vehicle_id UUID REFERENCES public.partner_vehicles(id) ON DELETE SET NULL,
    assigned_plate VARCHAR(20),
    approval_status VARCHAR(40) NOT NULL DEFAULT 'Menunggu Kelulusan'
        CHECK (approval_status IN ('Profil Belum Lengkap', 'Menunggu Kelulusan', 'Perlu Pembetulan', 'Aktif', 'Ditolak', 'Digantung')),
    availability_status VARCHAR(40) NOT NULL DEFAULT 'Tersedia'
        CHECK (availability_status IN ('Tersedia', 'Dalam Tugasan', 'Rehat', 'Tidak Aktif')),
    rejection_reason TEXT,
    approved_by_name VARCHAR(150),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_drivers_company ON public.partner_drivers(company_id);
CREATE INDEX IF NOT EXISTS idx_partner_drivers_email ON public.partner_drivers(email);

-- 7. Enhance ambulance_bookings with Provider Metadata (Preserves Existing Bookings)
ALTER TABLE public.ambulance_bookings
ADD COLUMN IF NOT EXISTS provider_type VARCHAR(30) DEFAULT 'internal' CHECK (provider_type IN ('internal', 'partner')),
ADD COLUMN IF NOT EXISTS partner_company_id UUID REFERENCES public.partner_companies(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS partner_company_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS partner_offer_id UUID;

-- 8. Partner Trip Offers & Operational Assignments
CREATE TABLE IF NOT EXISTS public.partner_trip_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.ambulance_bookings(id) ON DELETE SET NULL,
    invoice_number VARCHAR(50) NOT NULL,
    company_id UUID NOT NULL REFERENCES public.partner_companies(id) ON DELETE RESTRICT,
    company_name VARCHAR(200) NOT NULL,
    offer_status VARCHAR(40) NOT NULL DEFAULT 'Offered'
        CHECK (offer_status IN ('Draft', 'Offered', 'Accepted', 'Declined', 'Expired', 'Withdrawn')),
    trip_status VARCHAR(40) NOT NULL DEFAULT 'Unassigned'
        CHECK (trip_status IN ('Unassigned', 'Assigned', 'En Route', 'On Scene', 'In Transit', 'Completed Pending Review', 'Verified Completed', 'Cancelled')),
    -- Immutable Financial Snapshot in Integer MYR Cents (RM1.00 = 100 sen)
    customer_invoice_cents BIGINT NOT NULL CHECK (customer_invoice_cents >= 0),
    eligible_commission_base_cents BIGINT NOT NULL CHECK (eligible_commission_base_cents >= 0),
    commission_rate_bps INTEGER NOT NULL DEFAULT 500 CHECK (commission_rate_bps >= 0 AND commission_rate_bps <= 10000),
    commission_amount_cents BIGINT NOT NULL CHECK (commission_amount_cents >= 0),
    partner_share_cents BIGINT NOT NULL CHECK (partner_share_cents >= 0),
    commissionable_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Pre-Acceptance Operational Summary (No sensitive patient data exposed before acceptance)
    origin_area TEXT NOT NULL,
    destination_area TEXT NOT NULL,
    distance_km NUMERIC(8,2) NOT NULL,
    trip_type TEXT NOT NULL,
    required_crew TEXT,
    required_equipment TEXT,
    scheduled_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Post-Acceptance Sensitive Patient Details & Assigned Resources
    patient_name VARCHAR(150),
    patient_phone VARCHAR(50),
    patient_notes TEXT,
    assigned_vehicle_id UUID REFERENCES public.partner_vehicles(id) ON DELETE SET NULL,
    assigned_plate VARCHAR(20),
    assigned_driver_id UUID REFERENCES public.partner_drivers(id) ON DELETE SET NULL,
    assigned_driver_name VARCHAR(150),
    assigned_driver_phone VARCHAR(50),
    -- Completion Evidence & Cash Handling
    completion_notes TEXT,
    completion_odometer_km NUMERIC(8,2),
    handover_receiver_name VARCHAR(150),
    completion_photo_url TEXT,
    cash_collected_by_partner_cents BIGINT DEFAULT 0,
    completion_submitted_at TIMESTAMP WITH TIME ZONE,
    verified_by_hq_name VARCHAR(150),
    verified_at TIMESTAMP WITH TIME ZONE,
    -- Lifecycle Timestamps
    offered_by_name VARCHAR(150) DEFAULT 'Pegawai Dispatch HQ',
    offered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    decline_reason TEXT,
    withdrawn_reason TEXT,
    cancellation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prevent duplicate active offers for the same booking invoice
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_offer_per_invoice
ON public.partner_trip_offers(invoice_number)
WHERE offer_status IN ('Offered', 'Accepted') AND trip_status != 'Cancelled';

CREATE INDEX IF NOT EXISTS idx_partner_offers_company ON public.partner_trip_offers(company_id, offer_status);
CREATE INDEX IF NOT EXISTS idx_partner_offers_invoice ON public.partner_trip_offers(invoice_number);

-- 9. Partner Settlement Batches
CREATE TABLE IF NOT EXISTS public.partner_settlement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_reference VARCHAR(50) UNIQUE NOT NULL,
    company_id UUID NOT NULL REFERENCES public.partner_companies(id) ON DELETE RESTRICT,
    company_name VARCHAR(200) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_trips INTEGER NOT NULL DEFAULT 0,
    total_gross_cents BIGINT NOT NULL DEFAULT 0,
    total_commission_cents BIGINT NOT NULL DEFAULT 0,
    total_payable_to_partner_cents BIGINT NOT NULL DEFAULT 0,
    total_receivable_from_partner_cents BIGINT NOT NULL DEFAULT 0,
    total_adjustments_cents BIGINT NOT NULL DEFAULT 0,
    net_settlement_cents BIGINT NOT NULL DEFAULT 0, -- >0 HQ pays Partner; <0 Partner pays HQ
    status VARCHAR(40) NOT NULL DEFAULT 'Draft'
        CHECK (status IN ('Draft', 'Reviewed', 'Settled', 'Cancelled')),
    payment_reference VARCHAR(120),
    notes TEXT,
    created_by_name VARCHAR(150),
    reviewed_by_name VARCHAR(150),
    settled_by_name VARCHAR(150),
    settled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_company ON public.partner_settlement_batches(company_id, status);

-- 10. Partner Commission Ledger (Accrued Strictly After Verified Completion)
CREATE TABLE IF NOT EXISTS public.partner_commission_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID UNIQUE NOT NULL REFERENCES public.partner_trip_offers(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    company_id UUID NOT NULL REFERENCES public.partner_companies(id) ON DELETE RESTRICT,
    company_name VARCHAR(200) NOT NULL,
    customer_invoice_cents BIGINT NOT NULL,
    eligible_base_cents BIGINT NOT NULL,
    commission_rate_bps INTEGER NOT NULL DEFAULT 500,
    commission_amount_cents BIGINT NOT NULL,
    partner_share_cents BIGINT NOT NULL,
    gateway_fee_cents BIGINT NOT NULL DEFAULT 0,
    amount_collected_cents BIGINT NOT NULL DEFAULT 0,
    collection_channel VARCHAR(40) NOT NULL
        CHECK (collection_channel IN ('chip_online_hq', 'cash_collected_hq', 'cash_collected_partner', 'uncollected')),
    customer_payment_verified BOOLEAN NOT NULL DEFAULT FALSE,
    payable_to_partner_cents BIGINT NOT NULL DEFAULT 0,
    receivable_from_partner_cents BIGINT NOT NULL DEFAULT 0,
    settlement_status VARCHAR(40) NOT NULL DEFAULT 'Unsettled'
        CHECK (settlement_status IN ('Unsettled', 'Pending Customer Payment', 'In Settlement Batch', 'Settled', 'Disputed', 'Voided')),
    settlement_batch_id UUID REFERENCES public.partner_settlement_batches(id) ON DELETE SET NULL,
    verified_by_name VARCHAR(150) NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_company ON public.partner_commission_ledger(company_id, settlement_status);

-- 11. Financial Adjustments (Refunds, Cancellations, Disputes & Reconciliations)
CREATE TABLE IF NOT EXISTS public.partner_financial_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adjustment_reference VARCHAR(50) UNIQUE NOT NULL,
    company_id UUID NOT NULL REFERENCES public.partner_companies(id) ON DELETE RESTRICT,
    company_name VARCHAR(200) NOT NULL,
    invoice_number VARCHAR(50),
    ledger_id UUID REFERENCES public.partner_commission_ledger(id) ON DELETE SET NULL,
    settlement_batch_id UUID REFERENCES public.partner_settlement_batches(id) ON DELETE SET NULL,
    adjustment_type VARCHAR(50) NOT NULL
        CHECK (adjustment_type IN ('Cancellation Charge', 'Partial Refund', 'Full Refund', 'Dispute Credit', 'Dispute Debit', 'Cash Reconciliation')),
    customer_refund_cents BIGINT NOT NULL DEFAULT 0,
    commission_adjustment_cents BIGINT NOT NULL DEFAULT 0,
    partner_share_adjustment_cents BIGINT NOT NULL DEFAULT 0, -- positive increases payable to partner, negative reduces
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Approved' CHECK (status IN ('Pending', 'Approved', 'Applied', 'Rejected')),
    approved_by_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_adjustments_company ON public.partner_financial_adjustments(company_id);

-- 12. Partner Audit Trail Table
CREATE TABLE IF NOT EXISTS public.partner_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_name VARCHAR(150) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    company_id UUID,
    company_name VARCHAR(200),
    invoice_number VARCHAR(50),
    action VARCHAR(80) NOT NULL,
    reason TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_audit_company ON public.partner_audit_logs(company_id, created_at DESC);

-- 13. Row-Level Security (Strict Company-Scoped & HQ Enforcement; No Public Policies)
ALTER TABLE public.partner_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_trip_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_financial_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy 1: HQ Staff Access
DROP POLICY IF EXISTS "HQ staff view partner companies" ON public.partner_companies;
CREATE POLICY "HQ staff view partner companies"
ON public.partner_companies FOR SELECT TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.staff_roles sr WHERE sr.email = auth.jwt()->>'email' AND sr.is_active = TRUE)
    OR EXISTS (SELECT 1 FROM public.partner_memberships pm WHERE pm.email = auth.jwt()->>'email' AND pm.company_id = partner_companies.id AND pm.account_status != 'Digantung')
);

-- Policy 2: Partner Vehicles Scoped to Own Company or HQ
DROP POLICY IF EXISTS "Company scoped vehicles" ON public.partner_vehicles;
CREATE POLICY "Company scoped vehicles"
ON public.partner_vehicles FOR SELECT TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.staff_roles sr WHERE sr.email = auth.jwt()->>'email' AND sr.is_active = TRUE)
    OR EXISTS (SELECT 1 FROM public.partner_memberships pm WHERE pm.email = auth.jwt()->>'email' AND pm.company_id = partner_vehicles.company_id AND pm.account_status = 'Aktif')
);

-- Policy 3: Partner Drivers Scoped to Own Company or HQ
DROP POLICY IF EXISTS "Company scoped drivers" ON public.partner_drivers;
CREATE POLICY "Company scoped drivers"
ON public.partner_drivers FOR SELECT TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.staff_roles sr WHERE sr.email = auth.jwt()->>'email' AND sr.is_active = TRUE)
    OR EXISTS (SELECT 1 FROM public.partner_memberships pm WHERE pm.email = auth.jwt()->>'email' AND pm.company_id = partner_drivers.company_id AND pm.account_status = 'Aktif')
);

-- Policy 4: Partner Trip Offers Scoped to Own Company or HQ
DROP POLICY IF EXISTS "Company scoped trip offers" ON public.partner_trip_offers;
CREATE POLICY "Company scoped trip offers"
ON public.partner_trip_offers FOR SELECT TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.staff_roles sr WHERE sr.email = auth.jwt()->>'email' AND sr.is_active = TRUE)
    OR EXISTS (
        SELECT 1 FROM public.partner_memberships pm
        WHERE pm.email = auth.jwt()->>'email'
          AND pm.company_id = partner_trip_offers.company_id
          AND pm.account_status = 'Aktif'
    )
);

-- Policy 5: Partner Financial Ledger Scoped to Partner Admin or HQ Finance/Admin
DROP POLICY IF EXISTS "Company scoped commission ledger" ON public.partner_commission_ledger;
CREATE POLICY "Company scoped commission ledger"
ON public.partner_commission_ledger FOR SELECT TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.staff_roles sr WHERE sr.email = auth.jwt()->>'email' AND sr.role IN ('hq_admin', 'hq_finance') AND sr.is_active = TRUE)
    OR EXISTS (
        SELECT 1 FROM public.partner_memberships pm
        WHERE pm.email = auth.jwt()->>'email'
          AND pm.company_id = partner_commission_ledger.company_id
          AND pm.role = 'partner_admin'
          AND pm.account_status = 'Aktif'
    )
);

