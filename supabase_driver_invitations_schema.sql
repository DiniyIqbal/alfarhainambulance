-- =========================================================================
-- AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
-- MIGRATION: Driver Invitations, Multi-Stage Onboarding, Staff Roles & Audit Trail
-- File: supabase_driver_invitations_schema.sql
-- =========================================================================

-- 1. Staff Roles Table (Server-side Role-Based Access Control)
CREATE TABLE IF NOT EXISTS public.staff_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('hq_admin', 'branch_manager', 'dispatcher')),
    branch_id VARCHAR(50) DEFAULT 'all', -- 'kok_lanas', 'raub', 'jeli', 'gua_musang', or 'all'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Initial Authorized Staff Roles (Matches Al-Farhain Staff)
INSERT INTO public.staff_roles (email, full_name, role, branch_id)
VALUES 
    ('abedi@alfarhain.my', 'Abe Di (Pegawai Operasi)', 'hq_admin', 'all'),
    ('abedin@alfarhain.my', 'Abe Din Estimos Sukrosa', 'branch_manager', 'raub')
ON CONFLICT (email) DO UPDATE 
SET full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    branch_id = EXCLUDED.branch_id;

-- 2. Driver Invitations Table
CREATE TABLE IF NOT EXISTS public.driver_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of plaintext code
    masked_code VARCHAR(20) NOT NULL,      -- e.g. 'AMC-9X****'
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    branch_id VARCHAR(50) NOT NULL,
    assigned_plate VARCHAR(20) REFERENCES public.ambulance_fleet(plate_number) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'Dihantar' CHECK (status IN ('Dihantar', 'Diterima', 'Tamat Tempoh', 'Dibatalkan')),
    delivery_status VARCHAR(30) DEFAULT 'Tertangguh' CHECK (delivery_status IN ('Tertangguh', 'Dihantar', 'Gagal', 'Manual')),
    internal_notes TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(100) DEFAULT 'Pentadbir HQ',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_invitations_email ON public.driver_invitations(email);
CREATE INDEX IF NOT EXISTS idx_driver_invitations_hash ON public.driver_invitations(code_hash);
CREATE INDEX IF NOT EXISTS idx_driver_invitations_status ON public.driver_invitations(status);

-- 3. Enhance Ambulance Drivers Table
ALTER TABLE public.ambulance_drivers 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS ic_number VARCHAR(30),
ADD COLUMN IF NOT EXISTS account_status VARCHAR(30) DEFAULT 'Profil Belum Lengkap' 
    CHECK (account_status IN ('Profil Belum Lengkap', 'Menunggu Kelulusan', 'Perlu Pembetulan', 'Aktif', 'Ditolak', 'Digantung')),
ADD COLUMN IF NOT EXISTS invitation_id UUID REFERENCES public.driver_invitations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS correction_notes TEXT,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approved_by_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ambulance_drivers_email ON public.ambulance_drivers(email);
CREATE INDEX IF NOT EXISTS idx_ambulance_drivers_acc_status ON public.ambulance_drivers(account_status);

-- 4. Driver Audit Trail Table
CREATE TABLE IF NOT EXISTS public.driver_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,
    actor_name VARCHAR(150) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    target_driver_id UUID,
    target_email VARCHAR(255) NOT NULL,
    branch_id VARCHAR(50),
    action VARCHAR(60) NOT NULL,
    reason TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_audit_target_email ON public.driver_audit_logs(target_email);
CREATE INDEX IF NOT EXISTS idx_driver_audit_action ON public.driver_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_driver_audit_created ON public.driver_audit_logs(created_at DESC);

-- 5. Stored Procedure: Atomic Invitation Redemption
CREATE OR REPLACE FUNCTION public.redeem_driver_invitation(
    p_code_hash VARCHAR(64),
    p_email VARCHAR(255)
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    invitation_id UUID,
    full_name VARCHAR(150),
    branch_id VARCHAR(50),
    assigned_plate VARCHAR(20)
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_inv RECORD;
BEGIN
    -- Atomic Row Lock
    SELECT * INTO v_inv 
    FROM public.driver_invitations
    WHERE code_hash = p_code_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Kod jemputan tidak sah atau tidak wujud.', NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
        RETURN;
    END IF;

    IF LOWER(TRIM(v_inv.email)) <> LOWER(TRIM(p_email)) THEN
        RETURN QUERY SELECT FALSE, 'Emel yang dimasukkan tidak sepadan dengan rekod jemputan HQ.', NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
        RETURN;
    END IF;

    IF v_inv.status = 'Diterima' OR v_inv.consumed_at IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 'Kod jemputan ini telah pun digunakan sebelum ini.', NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
        RETURN;
    END IF;

    IF v_inv.status = 'Dibatalkan' OR v_inv.revoked_at IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 'Jemputan ini telah dibatalkan oleh pentadbir operasi.', NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
        RETURN;
    END IF;

    IF v_inv.expires_at < NOW() THEN
        UPDATE public.driver_invitations SET status = 'Tamat Tempoh', updated_at = NOW() WHERE id = v_inv.id;
        RETURN QUERY SELECT FALSE, 'Tempoh sah jemputan telah tamat (melepasi had masa dibenarkan).', NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
        RETURN;
    END IF;

    -- Mark invitation as redeemed atomically
    UPDATE public.driver_invitations 
    SET status = 'Diterima', 
        consumed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_inv.id;

    RETURN QUERY SELECT TRUE, 'Jemputan berjaya disahkan.', v_inv.id, v_inv.full_name, v_inv.branch_id, v_inv.assigned_plate;
END;
$$;

-- 6. Row Level Security Policies
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow public read of staff roles check via service role / authenticated
DROP POLICY IF EXISTS "Staf dibenarkan membaca peranan sendiri" ON public.staff_roles;
CREATE POLICY "Staf dibenarkan membaca peranan sendiri" ON public.staff_roles
    FOR SELECT USING (auth.uid() = user_id);

-- Restrict direct client writes to invitations; managed via backend API
DROP POLICY IF EXISTS "Pentadbir dibenarkan membaca jemputan" ON public.driver_invitations;
CREATE POLICY "Pentadbir dibenarkan membaca jemputan" ON public.driver_invitations
    FOR SELECT USING (auth.role() = 'authenticated');

