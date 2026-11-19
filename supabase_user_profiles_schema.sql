-- =============================================================================
-- Al-Farhain AMC: patient / public user registration profiles
-- Run once in the Supabase SQL Editor (after supabase_security_hardening.sql,
-- which defines public.app_is_staff).
--
-- Every sign-up (supabase.auth.signUp) creates a row in auth.users. This adds a
-- readable public.profiles table that is filled automatically by a trigger, so
-- registrations are visible in Table Editor and queryable by HQ staff.
-- Roles are NOT stored here: staff/driver/partner access stays in staff_roles,
-- ambulance_drivers and partner_memberships.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT,
    full_name   TEXT,
    phone       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (LOWER(email));

-- ---------------------------------------------------------------------------
-- Auto-create a profile for every new auth user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone)
    VALUES (
        NEW.id,
        NEW.email,
        NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfill users who registered before this table existed
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, email, full_name, phone, created_at)
SELECT u.id,
       u.email,
       NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')), ''),
       NULLIF(TRIM(u.raw_user_meta_data->>'phone'), ''),
       u.created_at
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Row Level Security: users see/edit only their own row; staff can read all.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_select_staff ON public.profiles;
CREATE POLICY profiles_select_staff ON public.profiles
    FOR SELECT TO authenticated
    USING (public.app_is_staff());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Inserts come only from the trigger (SECURITY DEFINER); clients never insert.
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, DELETE ON public.profiles FROM authenticated;
-- Users may edit only their own contact details, never the id/email/timestamps.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.profiles_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
CREATE TRIGGER profiles_touch
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.profiles_touch_updated_at();
