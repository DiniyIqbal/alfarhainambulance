-- =========================================================================
-- AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
-- MIGRATION: Security Hardening (Phase 1)
-- File: supabase_security_hardening.sql
--
-- What this does:
--   * Removes every "public" (USING true) read/write policy on patient data
--   * Adds role helpers backed by staff_roles / ambulance_drivers /
--     partner_memberships (roles are NEVER taken from user_metadata)
--   * Scopes bookings: staff -> own branch, driver -> assigned plate,
--     patient -> own rows (patient_user_id), guest -> token-based RPC only
--   * Adds a write-guard trigger so clients cannot mark bookings paid,
--     re-price them, hijack ownership or rewrite the audit trail
--   * Adds the payment columns the CHIP webhook writes
--
-- Application order (run this file LAST, and re-run it after re-running
-- any earlier schema file):
--   1. supabase_schema.sql
--   2. supabase_driver_invitations_schema.sql
--   3. supabase_partner_ambulances_schema.sql
--   4. supabase_booking_management_schema.sql
--   5. supabase_service_packages_schema.sql
--   6. supabase_security_hardening.sql   <-- this file
--
-- Safe to re-run (idempotent).
-- Prerequisite in Supabase Dashboard: Authentication -> Providers -> Email ->
-- "Confirm email" MUST be ON. Staff/partner matching by email only trusts
-- confirmed addresses.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. New columns
-- -------------------------------------------------------------------------
ALTER TABLE public.ambulance_bookings
    ADD COLUMN IF NOT EXISTS patient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS guest_access_token UUID,
    ADD COLUMN IF NOT EXISTS amount_due NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS chip_purchase_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS chip_receipt_url TEXT,
    ADD COLUMN IF NOT EXISTS is_event_standby BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS standby_hours NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS standby_event_name TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_patient_user_id ON public.ambulance_bookings(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_plate_number ON public.ambulance_bookings(plate_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_chip_purchase_id
    ON public.ambulance_bookings(chip_purchase_id) WHERE chip_purchase_id IS NOT NULL;

-- Backfill ownership for existing rows whose email matches a CONFIRMED account.
-- Placeholder emails the app used as defaults are excluded on purpose.
UPDATE public.ambulance_bookings b
SET patient_user_id = u.id
FROM auth.users u
WHERE b.patient_user_id IS NULL
  AND COALESCE(b.patient_email, '') <> ''
  AND LOWER(b.patient_email) NOT IN ('pesakit.demo@gmail.com', 'pesakit@alfarhain.my')
  AND LOWER(b.patient_email) = LOWER(u.email)
  AND u.email_confirmed_at IS NOT NULL;


-- -------------------------------------------------------------------------
-- 2. Role helper functions (SECURITY DEFINER, used inside RLS policies)
-- -------------------------------------------------------------------------

-- Email of the caller, only if the address has been confirmed.
CREATE OR REPLACE FUNCTION public.app_current_email()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT LOWER(u.email)
    FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
$$;

-- TRUE if the caller is active HQ/branch staff.
--   p_branch: booking/driver branch to check against (NULL = any branch)
--   p_roles : restrict to these staff roles (NULL = any staff role)
CREATE OR REPLACE FUNCTION public.app_is_staff(p_branch TEXT DEFAULT NULL, p_roles TEXT[] DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.staff_roles s
        WHERE s.is_active = TRUE
          AND auth.uid() IS NOT NULL
          AND (
                s.user_id = auth.uid()
             OR (s.user_id IS NULL AND LOWER(s.email) = public.app_current_email())
          )
          AND (p_roles IS NULL OR s.role = ANY (p_roles))
          AND (p_branch IS NULL OR s.branch_id = 'all' OR s.branch_id = p_branch)
    )
$$;

-- Plate number of the caller's ambulance, if the caller is an ACTIVE driver.
CREATE OR REPLACE FUNCTION public.app_driver_plate()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT d.assigned_plate
    FROM public.ambulance_drivers d
    WHERE auth.uid() IS NOT NULL
      AND d.user_id = auth.uid()
      AND d.account_status = 'Aktif'
      AND COALESCE(d.assigned_plate, '') <> ''
    LIMIT 1
$$;

-- Server-resolved role for the signed-in user. The web app uses this for
-- routing/UI; real enforcement is RLS + the API auth helper.
CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_email   TEXT := public.app_current_email();
    v_staff   public.staff_roles%ROWTYPE;
    v_driver  public.ambulance_drivers%ROWTYPE;
    v_partner public.partner_memberships%ROWTYPE;
    v_company TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('role', 'anonymous', 'app_role', 'anonymous');
    END IF;

    -- Link rows pre-provisioned by email to this verified account (one-time).
    IF v_email IS NOT NULL THEN
        UPDATE public.staff_roles
           SET user_id = v_uid, updated_at = NOW()
         WHERE user_id IS NULL AND LOWER(email) = v_email;

        UPDATE public.partner_memberships
           SET user_id = v_uid, updated_at = NOW()
         WHERE user_id IS NULL AND LOWER(email) = v_email;
    END IF;

    SELECT * INTO v_staff FROM public.staff_roles
     WHERE user_id = v_uid AND is_active = TRUE
     LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'role', v_staff.role,
            'app_role', 'hq',
            'full_name', v_staff.full_name,
            'email', v_staff.email,
            'branch_id', v_staff.branch_id
        );
    END IF;

    SELECT * INTO v_driver FROM public.ambulance_drivers
     WHERE user_id = v_uid
     LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'role', 'driver',
            'app_role', 'driver',
            'full_name', v_driver.name,
            'email', v_driver.email,
            'branch_id', v_driver.hub_id,
            'ambulance_plate', v_driver.assigned_plate,
            'account_status', v_driver.account_status,
            'correction_notes', v_driver.correction_notes
        );
    END IF;

    SELECT * INTO v_partner FROM public.partner_memberships
     WHERE user_id = v_uid
     LIMIT 1;
    IF FOUND THEN
        SELECT company_name INTO v_company FROM public.partner_companies WHERE id = v_partner.company_id;
        RETURN jsonb_build_object(
            'role', v_partner.role,
            'app_role', CASE WHEN v_partner.role = 'partner_driver' THEN 'driver' ELSE 'partner' END,
            'full_name', v_partner.full_name,
            'email', v_partner.email,
            'company_id', v_partner.company_id,
            'company_name', v_company,
            'account_status', v_partner.account_status
        );
    END IF;

    RETURN jsonb_build_object('role', 'patient', 'app_role', 'patient');
END;
$$;

-- Guest (not signed in) booking tracking. Requires the secret token that was
-- generated in the guest's browser when the booking was created.
CREATE OR REPLACE FUNCTION public.get_guest_booking(p_invoice TEXT, p_token UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT to_jsonb(t)
    FROM (
        SELECT b.id, b.invoice_number, b.status, b.booking_status, b.assignment_status,
               b.trip_status, b.hub_id, b.hub_name, b.origin_name, b.destination_name,
               b.distance_km, b.trip_type, b.package_name, b.total_fare, b.payment_status,
               b.payment_method, b.plate_number, b.driver_name, b.contact_phone,
               b.patient_name, b.is_scheduled, b.scheduled_time, b.created_at, b.updated_at
        FROM public.ambulance_bookings b
        WHERE p_token IS NOT NULL
          AND b.invoice_number = p_invoice
          AND b.guest_access_token = p_token
        LIMIT 1
    ) t
$$;

-- Server-only lookup used by /api/driver/activate to link an existing account
-- without listing every user (auth.admin.listUsers is paginated and slow).
CREATE OR REPLACE FUNCTION public.app_find_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT u.id FROM auth.users u WHERE LOWER(u.email) = LOWER(TRIM(p_email)) LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.app_find_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_find_user_id_by_email(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.app_current_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_is_staff(TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_driver_plate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_guest_booking(TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.app_current_email() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_is_staff(TEXT, TEXT[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_driver_plate() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_guest_booking(TEXT, UUID) TO anon, authenticated;

-- Invitation redemption is server-only (called by /api/driver/activate with the service role).
DO $$
BEGIN
    REVOKE ALL ON FUNCTION public.redeem_driver_invitation(VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.redeem_driver_invitation(VARCHAR, VARCHAR) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;


-- -------------------------------------------------------------------------
-- 3. Booking write guard (runs for browser clients only)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_ambulance_booking_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_is_staff      BOOLEAN;
    v_driver_plate  TEXT;
    v_changed       TEXT[];
    v_allowed       TEXT[];
    v_old_len       INTEGER;
    v_staff_locked  TEXT[] := ARRAY[
        'id', 'invoice_number', 'patient_user_id', 'guest_access_token', 'created_at',
        'amount_due', 'paid_amount', 'paid_at', 'chip_purchase_id', 'chip_receipt_url'
    ];
BEGIN
    -- Trusted paths: service_role (server APIs / webhook), SQL editor, migrations.
    IF current_user NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;

    -- ---------------- INSERT ----------------
    IF TG_OP = 'INSERT' THEN
        IF public.app_is_staff(NEW.hub_id) THEN
            NEW.paid_amount := NULL;
            NEW.paid_at := NULL;
            NEW.chip_purchase_id := NULL;
            NEW.chip_receipt_url := NULL;
            RETURN NEW;
        END IF;

        -- Patient / guest submission: always starts as an unapproved, unpaid request.
        NEW.patient_user_id   := auth.uid();
        NEW.payment_status    := CASE WHEN NEW.payment_status IN ('unpaid', 'pending')
                                      THEN NEW.payment_status ELSE 'unpaid' END;
        NEW.amount_due        := NULL;
        NEW.paid_amount       := NULL;
        NEW.paid_at           := NULL;
        NEW.chip_purchase_id  := NULL;
        NEW.chip_receipt_url  := NULL;
        NEW.booking_status    := 'pending_approval';
        NEW.assignment_status := 'unassigned';
        NEW.trip_status       := 'not_started';
        NEW.status            := 'Menunggu kelulusan';
        NEW.plate_number      := '';
        NEW.driver_name       := '';
        NEW.assigned_provider_id := NULL;
        NEW.assigned_vehicle_id  := NULL;
        NEW.assigned_driver_id   := NULL;
        NEW.assigned_crew     := '[]'::jsonb;
        NEW.approved_by       := NULL;
        NEW.approved_at       := NULL;
        NEW.rejected_by       := NULL;
        NEW.rejected_at       := NULL;
        NEW.assigned_by       := NULL;
        NEW.assigned_at       := NULL;
        NEW.completed_at      := NULL;
        NEW.created_by_admin  := NULL;
        NEW.version           := 1;
        NEW.created_at        := NOW();
        NEW.updated_at        := NOW();
        RETURN NEW;
    END IF;

    -- ---------------- UPDATE ----------------
    -- audit_trail is append-only for every browser role.
    IF NEW.audit_trail IS DISTINCT FROM OLD.audit_trail THEN
        v_old_len := COALESCE(jsonb_array_length(OLD.audit_trail), 0);
        IF NEW.audit_trail IS NULL
           OR jsonb_typeof(NEW.audit_trail) <> 'array'
           OR jsonb_array_length(NEW.audit_trail) < v_old_len
           OR (v_old_len > 0 AND (
                SELECT jsonb_agg(x.e ORDER BY x.i)
                FROM jsonb_array_elements(NEW.audit_trail) WITH ORDINALITY AS x(e, i)
                WHERE x.i <= v_old_len
              ) IS DISTINCT FROM OLD.audit_trail)
        THEN
            RAISE EXCEPTION 'audit_trail is append-only' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT COALESCE(array_agg(n.key), ARRAY[]::TEXT[])
      INTO v_changed
      FROM jsonb_each(to_jsonb(NEW)) AS n
     WHERE n.key <> 'updated_at'
       AND n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);

    IF array_length(v_changed, 1) IS NULL THEN
        RETURN NEW;
    END IF;

    v_is_staff := public.app_is_staff(OLD.hub_id) AND public.app_is_staff(NEW.hub_id);

    -- Staff: full operational control, except identity/ownership/settlement fields.
    IF v_is_staff THEN
        IF v_changed && v_staff_locked THEN
            RAISE EXCEPTION 'Staff cannot modify protected booking fields: %',
                ARRAY(SELECT unnest(v_changed) INTERSECT SELECT unnest(v_staff_locked))
                USING ERRCODE = '42501';
        END IF;
        -- Online (CHIP) payments are settled only by the verified webhook.
        IF COALESCE(OLD.payment_method, 'cash') <> 'cash'
           AND v_changed && ARRAY['payment_status', 'payment_method'] THEN
            RAISE EXCEPTION 'Online payment status can only be changed by the payment gateway'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    -- Driver: trip progress on bookings assigned to their own ambulance.
    v_driver_plate := public.app_driver_plate();
    IF v_driver_plate IS NOT NULL AND OLD.plate_number = v_driver_plate THEN
        v_allowed := ARRAY['status', 'trip_status', 'completed_at', 'version', 'audit_trail'];
        IF NOT (v_changed <@ v_allowed) THEN
            RAISE EXCEPTION 'Drivers may only update trip progress fields'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    -- Patient: cancel (while pending) or request cancellation / reschedule.
    IF OLD.patient_user_id IS NOT NULL AND OLD.patient_user_id = auth.uid() THEN
        v_allowed := ARRAY[
            'booking_status', 'status', 'cancellation_reason',
            'cancellation_requested', 'cancellation_request_reason', 'cancellation_request_at',
            'reschedule_requested', 'reschedule_request_time', 'reschedule_request_at',
            'version', 'audit_trail'
        ];
        IF NOT (v_changed <@ v_allowed) THEN
            RAISE EXCEPTION 'Patients may only cancel or request changes to a booking'
                USING ERRCODE = '42501';
        END IF;
        IF v_changed && ARRAY['booking_status', 'status'] THEN
            IF NOT (COALESCE(OLD.booking_status, '') = 'pending_approval'
                    AND NEW.booking_status = 'cancelled'
                    AND NEW.status = 'Dibatalkan') THEN
                RAISE EXCEPTION 'Patients may only cancel a booking that is still pending approval'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Not permitted to modify this booking' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_ambulance_booking_write ON public.ambulance_bookings;
CREATE TRIGGER trg_guard_ambulance_booking_write
    BEFORE INSERT OR UPDATE ON public.ambulance_bookings
    FOR EACH ROW EXECUTE FUNCTION public.guard_ambulance_booking_write();


-- -------------------------------------------------------------------------
-- 4. ambulance_bookings policies
-- -------------------------------------------------------------------------
ALTER TABLE public.ambulance_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read ambulance_bookings" ON public.ambulance_bookings;
DROP POLICY IF EXISTS "Allow public insert ambulance_bookings" ON public.ambulance_bookings;
DROP POLICY IF EXISTS "Allow public update ambulance_bookings" ON public.ambulance_bookings;
DROP POLICY IF EXISTS bookings_select_staff ON public.ambulance_bookings;
DROP POLICY IF EXISTS bookings_select_driver ON public.ambulance_bookings;
DROP POLICY IF EXISTS bookings_select_patient ON public.ambulance_bookings;
DROP POLICY IF EXISTS bookings_insert_client ON public.ambulance_bookings;
DROP POLICY IF EXISTS bookings_update_staff ON public.ambulance_bookings;
DROP POLICY IF EXISTS bookings_update_driver ON public.ambulance_bookings;
DROP POLICY IF EXISTS bookings_update_patient ON public.ambulance_bookings;

CREATE POLICY bookings_select_staff ON public.ambulance_bookings
    FOR SELECT TO authenticated
    USING (public.app_is_staff(hub_id));

CREATE POLICY bookings_select_driver ON public.ambulance_bookings
    FOR SELECT TO authenticated
    USING (COALESCE(plate_number, '') <> '' AND plate_number = public.app_driver_plate());

CREATE POLICY bookings_select_patient ON public.ambulance_bookings
    FOR SELECT TO authenticated
    USING (patient_user_id IS NOT NULL AND patient_user_id = auth.uid());

-- Guests and patients may submit requests; the trigger above sanitises them.
CREATE POLICY bookings_insert_client ON public.ambulance_bookings
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY bookings_update_staff ON public.ambulance_bookings
    FOR UPDATE TO authenticated
    USING (public.app_is_staff(hub_id))
    WITH CHECK (public.app_is_staff(hub_id));

CREATE POLICY bookings_update_driver ON public.ambulance_bookings
    FOR UPDATE TO authenticated
    USING (COALESCE(plate_number, '') <> '' AND plate_number = public.app_driver_plate())
    WITH CHECK (COALESCE(plate_number, '') <> '' AND plate_number = public.app_driver_plate());

CREATE POLICY bookings_update_patient ON public.ambulance_bookings
    FOR UPDATE TO authenticated
    USING (patient_user_id IS NOT NULL AND patient_user_id = auth.uid())
    WITH CHECK (patient_user_id IS NOT NULL AND patient_user_id = auth.uid());

-- No DELETE policy: deletions only via service role.


-- -------------------------------------------------------------------------
-- 5. booking_notifications policies
-- -------------------------------------------------------------------------
ALTER TABLE public.booking_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read booking_notifications" ON public.booking_notifications;
DROP POLICY IF EXISTS "Allow public insert booking_notifications" ON public.booking_notifications;
DROP POLICY IF EXISTS "Allow public update booking_notifications" ON public.booking_notifications;
DROP POLICY IF EXISTS notifs_select_recipient ON public.booking_notifications;
DROP POLICY IF EXISTS notifs_insert_client ON public.booking_notifications;
DROP POLICY IF EXISTS notifs_update_recipient ON public.booking_notifications;

CREATE POLICY notifs_select_recipient ON public.booking_notifications
    FOR SELECT TO authenticated
    USING (
        LOWER(recipient_email) = public.app_current_email()
        OR (recipient_role IN ('admin', 'all') AND public.app_is_staff())
    );

CREATE POLICY notifs_insert_client ON public.booking_notifications
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        recipient_role = 'admin'
        OR public.app_is_staff()
        OR LOWER(recipient_email) = public.app_current_email()
    );

CREATE POLICY notifs_update_recipient ON public.booking_notifications
    FOR UPDATE TO authenticated
    USING (
        LOWER(recipient_email) = public.app_current_email()
        OR (recipient_role IN ('admin', 'all') AND public.app_is_staff())
    )
    WITH CHECK (
        LOWER(recipient_email) = public.app_current_email()
        OR (recipient_role IN ('admin', 'all') AND public.app_is_staff())
    );


-- -------------------------------------------------------------------------
-- 6. Drivers, invitations, staff
-- -------------------------------------------------------------------------
-- ambulance_drivers holds IC numbers and phone numbers: never public.
DROP POLICY IF EXISTS "Allow public read drivers" ON public.ambulance_drivers;
DROP POLICY IF EXISTS drivers_select_staff ON public.ambulance_drivers;
DROP POLICY IF EXISTS drivers_select_self ON public.ambulance_drivers;

CREATE POLICY drivers_select_staff ON public.ambulance_drivers
    FOR SELECT TO authenticated
    USING (public.app_is_staff(hub_id));

CREATE POLICY drivers_select_self ON public.ambulance_drivers
    FOR SELECT TO authenticated
    USING (user_id IS NOT NULL AND user_id = auth.uid());

-- Invitations: previously readable by ANY signed-in user.
DROP POLICY IF EXISTS "Pentadbir dibenarkan membaca jemputan" ON public.driver_invitations;
DROP POLICY IF EXISTS invitations_select_admin ON public.driver_invitations;

CREATE POLICY invitations_select_admin ON public.driver_invitations
    FOR SELECT TO authenticated
    USING (public.app_is_staff(branch_id, ARRAY['hq_admin', 'branch_manager']));


-- -------------------------------------------------------------------------
-- 7. Service catalogue: public may read Active rows, only HQ may write
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins full access to service packages" ON public.service_packages;
DROP POLICY IF EXISTS "Admins full access to service equipment" ON public.service_equipment;
DROP POLICY IF EXISTS "Admins full access to service staff roles" ON public.service_staff_roles;
DROP POLICY IF EXISTS "Admins full access to package equipment" ON public.service_package_equipment;
DROP POLICY IF EXISTS "Admins full access to package staff roles" ON public.service_package_staff_roles;
DROP POLICY IF EXISTS "Admins view audit log" ON public.service_audit_log;
DROP POLICY IF EXISTS "Admins insert audit log" ON public.service_audit_log;
DROP POLICY IF EXISTS hq_write_service_packages ON public.service_packages;
DROP POLICY IF EXISTS hq_write_service_equipment ON public.service_equipment;
DROP POLICY IF EXISTS hq_write_service_staff_roles ON public.service_staff_roles;
DROP POLICY IF EXISTS hq_write_package_equipment ON public.service_package_equipment;
DROP POLICY IF EXISTS hq_write_package_staff_roles ON public.service_package_staff_roles;
DROP POLICY IF EXISTS hq_read_service_audit ON public.service_audit_log;
DROP POLICY IF EXISTS hq_insert_service_audit ON public.service_audit_log;

CREATE POLICY hq_write_service_packages ON public.service_packages
    FOR ALL TO authenticated
    USING (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']))
    WITH CHECK (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']));

CREATE POLICY hq_write_service_equipment ON public.service_equipment
    FOR ALL TO authenticated
    USING (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']))
    WITH CHECK (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']));

CREATE POLICY hq_write_service_staff_roles ON public.service_staff_roles
    FOR ALL TO authenticated
    USING (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']))
    WITH CHECK (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']));

CREATE POLICY hq_write_package_equipment ON public.service_package_equipment
    FOR ALL TO authenticated
    USING (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']))
    WITH CHECK (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']));

CREATE POLICY hq_write_package_staff_roles ON public.service_package_staff_roles
    FOR ALL TO authenticated
    USING (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']))
    WITH CHECK (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']));

-- Audit log: staff may read and append; nobody may edit or delete from the browser.
CREATE POLICY hq_read_service_audit ON public.service_audit_log
    FOR SELECT TO authenticated
    USING (public.app_is_staff());

CREATE POLICY hq_insert_service_audit ON public.service_audit_log
    FOR INSERT TO authenticated
    WITH CHECK (public.app_is_staff(NULL, ARRAY['hq_admin', 'branch_manager']));


-- -------------------------------------------------------------------------
-- 8. Verification queries (run manually after applying)
-- -------------------------------------------------------------------------
-- Every policy that still grants unconditional access (should only be the
-- public catalogue tables: fleet, equipment, active packages):
--   SELECT tablename, policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')
--   ORDER BY tablename;
