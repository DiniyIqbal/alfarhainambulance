-- =========================================================================
-- AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
-- MIGRATION: Perkhidmatan & Servis Management System
-- File: supabase_service_packages_schema.sql
-- Application Order:
--   1. supabase_schema.sql
--   2. supabase_driver_invitations_schema.sql
--   3. supabase_partner_ambulances_schema.sql
--   4. supabase_service_packages_schema.sql (This file)
-- =========================================================================

-- 1. Create Service Equipment Catalogue Table (Defines package inclusions)
CREATE TABLE IF NOT EXISTS public.service_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(80) UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Case-insensitive and trimmed uniqueness for equipment names
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_equipment_unique_name
ON public.service_equipment (LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_service_equipment_status
ON public.service_equipment(status);

-- 2. Create Service Staff Roles Catalogue Table (Included clinical role requirements)
CREATE TABLE IF NOT EXISTS public.service_staff_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(80) UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Case-insensitive and trimmed uniqueness for staff role names
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_staff_roles_unique_name
ON public.service_staff_roles (LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_service_staff_roles_status
ON public.service_staff_roles(status);

-- 3. Create Service Packages Table
CREATE TABLE IF NOT EXISTS public.service_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(80) UNIQUE NOT NULL,
    name TEXT NOT NULL,
    example_cases TEXT,
    base_price NUMERIC(10, 2) NOT NULL CHECK (base_price >= 0),
    base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'Active' CHECK (status IN ('Draft', 'Active', 'Inactive', 'Archived')),
    display_order INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_by VARCHAR(150),
    updated_by VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_packages_status
ON public.service_packages(status);

CREATE INDEX IF NOT EXISTS idx_service_packages_order
ON public.service_packages(display_order ASC);

-- 4. Package-to-Equipment Association (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.service_package_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES public.service_equipment(id) ON DELETE RESTRICT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(package_id, equipment_id)
);

CREATE INDEX IF NOT EXISTS idx_pkg_equip_package_id
ON public.service_package_equipment(package_id);

CREATE INDEX IF NOT EXISTS idx_pkg_equip_equipment_id
ON public.service_package_equipment(equipment_id);

-- 5. Package-to-Staff-Role Association (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.service_package_staff_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.service_staff_roles(id) ON DELETE RESTRICT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(package_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_pkg_roles_package_id
ON public.service_package_staff_roles(package_id);

CREATE INDEX IF NOT EXISTS idx_pkg_roles_role_id
ON public.service_package_staff_roles(role_id);

-- 6. Service Management Audit Log Table
CREATE TABLE IF NOT EXISTS public.service_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email VARCHAR(255) NOT NULL,
    admin_name VARCHAR(150),
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL CHECK (entity_type IN ('package', 'equipment', 'staff_role')),
    entity_id VARCHAR(100) NOT NULL,
    entity_name TEXT,
    previous_values JSONB,
    updated_values JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_audit_entity
ON public.service_audit_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_service_audit_created_at
ON public.service_audit_log(created_at DESC);

-- 7. Add Package Tracking & Immutable Snapshot Columns to Ambulance Bookings
ALTER TABLE public.ambulance_bookings 
ADD COLUMN IF NOT EXISTS package_id VARCHAR(80);

ALTER TABLE public.ambulance_bookings 
ADD COLUMN IF NOT EXISTS package_version INTEGER DEFAULT 1;

ALTER TABLE public.ambulance_bookings 
ADD COLUMN IF NOT EXISTS package_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_bookings_package_id
ON public.ambulance_bookings(package_id);

-- 8. Enable Row Level Security (RLS)
ALTER TABLE public.service_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_package_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_package_staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_audit_log ENABLE ROW LEVEL SECURITY;

-- Public / Customer Policies (Read published active packages & inclusions only)
DROP POLICY IF EXISTS "Public can view active service packages" ON public.service_packages;
CREATE POLICY "Public can view active service packages"
ON public.service_packages FOR SELECT
USING (status = 'Active');

DROP POLICY IF EXISTS "Public can view active service equipment" ON public.service_equipment;
CREATE POLICY "Public can view active service equipment"
ON public.service_equipment FOR SELECT
USING (status = 'Active');

DROP POLICY IF EXISTS "Public can view active service staff roles" ON public.service_staff_roles;
CREATE POLICY "Public can view active service staff roles"
ON public.service_staff_roles FOR SELECT
USING (status = 'Active');

DROP POLICY IF EXISTS "Public can view package equipment associations" ON public.service_package_equipment;
CREATE POLICY "Public can view package equipment associations"
ON public.service_package_equipment FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Public can view package staff role associations" ON public.service_package_staff_roles;
CREATE POLICY "Public can view package staff role associations"
ON public.service_package_staff_roles FOR SELECT
USING (true);

-- SECURITY: HQ-only write policies live in supabase_security_hardening.sql (run it last).
-- The previous "Admins full access" policies used USING (true), which let ANY
-- visitor rewrite prices. They are dropped here and must not be re-added.
DROP POLICY IF EXISTS "Admins full access to service packages" ON public.service_packages;
DROP POLICY IF EXISTS "Admins full access to service equipment" ON public.service_equipment;
DROP POLICY IF EXISTS "Admins full access to service staff roles" ON public.service_staff_roles;
DROP POLICY IF EXISTS "Admins full access to package equipment" ON public.service_package_equipment;
DROP POLICY IF EXISTS "Admins full access to package staff roles" ON public.service_package_staff_roles;
DROP POLICY IF EXISTS "Admins view audit log" ON public.service_audit_log;
DROP POLICY IF EXISTS "Admins insert audit log" ON public.service_audit_log;

-- =========================================================================
-- 9. SEED INITIAL EQUIPMENT, STAFF ROLES & PACKAGES (IDEMPOTENT)
-- =========================================================================

-- Seed Equipment
INSERT INTO public.service_equipment (code, name, description, status)
VALUES
    ('stretcher', 'Stretcher', 'Pengusung utama ambulan standard perubatan', 'Active'),
    ('spinal_board', 'Spinal Board', 'Papan imobilisasi tulang belakang untuk pesakit trauma', 'Active'),
    ('scoop_stretcher', 'Scoop stretcher', 'Pengusung pemisah untuk mengangkat mangsa kemalangan tanpa pergerakan tulang', 'Active'),
    ('vital_sign_monitor', 'Vital Sign Monitor', 'Monitor tanda-tanda vital (BP, SpO2, NIBP, Pulse)', 'Active'),
    ('immobilizer_set', 'Immobilizer set', 'Set imobilisasi kepala dan leher (cervical collar & head blocks)', 'Active'),
    ('limb_immobilizer', 'Upper & Lower limb immobilizer set', 'Set imobilisasi anggota atas dan bawah bagi kecederaan fraktur/patah', 'Active'),
    ('oxygen_system', 'Sistem oksigen lengkap', 'Bekalan silinder oksigen mudah alih dan terpasang dengan pengatur aliran', 'Active'),
    ('ambu_bag', 'Alat pernafasan (Ambu Bag)', 'Beg resusitasi manual injap beg (BVM) dewasa dan pediatrik', 'Active'),
    ('suction_unit', 'Suction unit', 'Unit sedutan kahak dan bendalir elektrik mudah alih', 'Active'),
    ('aed_equipment', 'AED Equipment', 'Automated External Defibrillator siap sedia bersama pad elektrod', 'Active')
ON CONFLICT (code) DO NOTHING;

-- Seed Staff Roles
INSERT INTO public.service_staff_roles (code, name, description, status)
VALUES
    ('ca', 'Clinic Assistant (CA)', 'Pembantu klinik terlatih bagi bantuan asas pesakit dan logistik', 'Active'),
    ('ma_nurse', 'Medical Assistant (MA) / Nurse', 'Penolong Pegawai Perubatan (PPP) atau Jururawat Bertauliah bagi pemantauan klinikal', 'Active'),
    ('mo', 'Medical Officer (MO)', 'Pegawai Perubatan (Doktor) bertauliah bagi kes rawatan intensif dan kritikal', 'Active')
ON CONFLICT (code) DO NOTHING;

-- Seed Standard Service Packages
INSERT INTO public.service_packages (code, name, example_cases, base_price, base_price_cents, status, display_order)
VALUES
    (
        'emergency_standard',
        'Kecemasan Standard',
        'Kes kecemasan umum, kemalangan, serangan akut, trauma ringan/sederhana.',
        250.00,
        25000,
        'Active',
        1
    ),
    (
        'non_emergency',
        'Bukan Kecemasan',
        'Rujukan berjadual, pesakit discaj ke rumah, dialisis, temujanji hospital.',
        250.00,
        25000,
        'Active',
        2
    ),
    (
        'emergency_inhouse',
        'Kecemasan In-House',
        'Stabilisasi segera dari fasiliti pesakit luar / rawatan intensif di AMC.',
        350.00,
        35000,
        'Active',
        3
    ),
    (
        'aed_critical',
        'Kecemasan Kritikal + AED',
        'Serangan jantung, henti nafas, pesakit kritikal memerlukan Defibrillator AED siap sedia.',
        500.00,
        50000,
        'Active',
        4
    )
ON CONFLICT (code) DO NOTHING;

-- Seed Package Associations (Equipment & Staff Roles)
DO $$
DECLARE
    pkg_std_id UUID;
    pkg_non_id UUID;
    pkg_inh_id UUID;
    pkg_aed_id UUID;
BEGIN
    SELECT id INTO pkg_std_id FROM public.service_packages WHERE code = 'emergency_standard';
    SELECT id INTO pkg_non_id FROM public.service_packages WHERE code = 'non_emergency';
    SELECT id INTO pkg_inh_id FROM public.service_packages WHERE code = 'emergency_inhouse';
    SELECT id INTO pkg_aed_id FROM public.service_packages WHERE code = 'aed_critical';

    -- Package A: Kecemasan Standard (7 alatan, 1 staf CA)
    IF pkg_std_id IS NOT NULL THEN
        INSERT INTO public.service_package_equipment (package_id, equipment_id, display_order)
        SELECT pkg_std_id, id, row_number() OVER ()
        FROM public.service_equipment
        WHERE code IN ('stretcher', 'spinal_board', 'scoop_stretcher', 'vital_sign_monitor', 'immobilizer_set', 'limb_immobilizer', 'oxygen_system')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.service_package_staff_roles (package_id, role_id, display_order)
        SELECT pkg_std_id, id, 1
        FROM public.service_staff_roles
        WHERE code = 'ca'
        ON CONFLICT DO NOTHING;
    END IF;

    -- Package B: Bukan Kecemasan (5 alatan, 0 staf)
    IF pkg_non_id IS NOT NULL THEN
        INSERT INTO public.service_package_equipment (package_id, equipment_id, display_order)
        SELECT pkg_non_id, id, row_number() OVER ()
        FROM public.service_equipment
        WHERE code IN ('stretcher', 'spinal_board', 'scoop_stretcher', 'vital_sign_monitor', 'immobilizer_set')
        ON CONFLICT DO NOTHING;
        -- Staff remains empty
    END IF;

    -- Package C: Kecemasan In-House (9 alatan including Ambu Bag & Suction, 2 staf: MA/Nurse & MO)
    IF pkg_inh_id IS NOT NULL THEN
        INSERT INTO public.service_package_equipment (package_id, equipment_id, display_order)
        SELECT pkg_inh_id, id, row_number() OVER ()
        FROM public.service_equipment
        WHERE code IN ('stretcher', 'spinal_board', 'scoop_stretcher', 'vital_sign_monitor', 'immobilizer_set', 'limb_immobilizer', 'oxygen_system', 'ambu_bag', 'suction_unit')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.service_package_staff_roles (package_id, role_id, display_order)
        SELECT pkg_inh_id, id, CASE WHEN code = 'ma_nurse' THEN 1 ELSE 2 END
        FROM public.service_staff_roles
        WHERE code IN ('ma_nurse', 'mo')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Package D: Kecemasan Kritikal + AED (8 alatan including AED Equipment, NO Ambu/Suction, 2 staf: MA/Nurse & MO)
    IF pkg_aed_id IS NOT NULL THEN
        INSERT INTO public.service_package_equipment (package_id, equipment_id, display_order)
        SELECT pkg_aed_id, id, row_number() OVER ()
        FROM public.service_equipment
        WHERE code IN ('stretcher', 'spinal_board', 'scoop_stretcher', 'vital_sign_monitor', 'immobilizer_set', 'limb_immobilizer', 'oxygen_system', 'aed_equipment')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.service_package_staff_roles (package_id, role_id, display_order)
        SELECT pkg_aed_id, id, CASE WHEN code = 'ma_nurse' THEN 1 ELSE 2 END
        FROM public.service_staff_roles
        WHERE code IN ('ma_nurse', 'mo')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

