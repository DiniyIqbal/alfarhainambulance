-- =========================================================================
-- AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
-- MIGRATION: Cash payment records + discount catalogue (admin-managed)
-- File: supabase_cash_payments_schema.sql
--
-- Run AFTER supabase_security_hardening.sql (needs app_is_staff and the
-- paid_amount / paid_at / amount_due booking columns). Safe to re-run.
--
-- Why RPC functions: the booking write-guard trigger stops browser clients
-- (including staff) from touching paid_amount / paid_at / amount_due. Cash is
-- therefore recorded ONLY by the SECURITY DEFINER functions below, which
--   * check the caller's staff role and branch,
--   * re-compute the discount on the server (the browser never sends a price),
--   * lock the booking row so a trip can't be paid twice,
--   * write an append-only audit entry to the booking.
--
-- Who can do what (roles come from staff_roles, never from user metadata):
--   record cash payment : hq_admin, hq_finance, branch_manager (own branch)
--   void cash payment   : hq_admin, hq_finance
--   manage discounts    : hq_admin, hq_finance
--   read ledger/discount: any active staff (own branch for the ledger)
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. Discount catalogue
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_discounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    value           NUMERIC(10, 2) NOT NULL CHECK (value > 0),
    max_discount    NUMERIC(10, 2) CHECK (max_discount IS NULL OR max_discount > 0), -- cap for percent
    min_fare        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_fare >= 0),         -- minimum trip total
    valid_from      DATE,
    valid_to        DATE,
    usage_limit     INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
    used_count      INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_discounts_percent_range CHECK (discount_type <> 'percent' OR value <= 100),
    CONSTRAINT payment_discounts_date_order CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_discounts_code_uidx ON public.payment_discounts (UPPER(code));


-- -------------------------------------------------------------------------
-- 2. Cash payment ledger (one row per cash receipt; voids keep the row)
-- -------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.cash_receipt_seq START 1;

CREATE TABLE IF NOT EXISTS public.cash_payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number      TEXT NOT NULL UNIQUE,
    booking_id          UUID NOT NULL REFERENCES public.ambulance_bookings(id) ON DELETE RESTRICT,
    invoice_number      TEXT NOT NULL,
    hub_id              TEXT NOT NULL,
    patient_name        TEXT,
    fare_amount         NUMERIC(10, 2) NOT NULL CHECK (fare_amount >= 0),     -- before discount
    discount_id         UUID REFERENCES public.payment_discounts(id) ON DELETE SET NULL,
    discount_code       TEXT,
    discount_amount     NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    amount_paid         NUMERIC(10, 2) NOT NULL CHECK (amount_paid >= 0),     -- fare - discount
    amount_tendered     NUMERIC(10, 2) NOT NULL CHECK (amount_tendered >= 0), -- cash handed over
    change_given        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (change_given >= 0),
    notes               TEXT,
    status              TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'voided')),
    received_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    received_by_name    TEXT,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    voided_by_name      TEXT,
    voided_at           TIMESTAMPTZ,
    void_reason         TEXT,
    CONSTRAINT cash_payments_tender_covers CHECK (amount_tendered >= amount_paid),
    CONSTRAINT cash_payments_void_has_reason CHECK (status <> 'voided' OR COALESCE(void_reason, '') <> '')
);

-- A booking can have at most one ACTIVE cash receipt (voided ones don't count).
CREATE UNIQUE INDEX IF NOT EXISTS cash_payments_one_active_per_booking
    ON public.cash_payments (booking_id) WHERE status = 'received';
CREATE INDEX IF NOT EXISTS cash_payments_received_at_idx ON public.cash_payments (received_at DESC);
CREATE INDEX IF NOT EXISTS cash_payments_hub_idx ON public.cash_payments (hub_id);


-- -------------------------------------------------------------------------
-- 3. Row Level Security + grants
-- -------------------------------------------------------------------------
ALTER TABLE public.payment_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payments     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_discounts_select_staff ON public.payment_discounts;
CREATE POLICY payment_discounts_select_staff ON public.payment_discounts
    FOR SELECT TO authenticated USING (public.app_is_staff());

DROP POLICY IF EXISTS payment_discounts_insert_admin ON public.payment_discounts;
CREATE POLICY payment_discounts_insert_admin ON public.payment_discounts
    FOR INSERT TO authenticated
    WITH CHECK (public.app_is_staff(NULL, ARRAY['hq_admin', 'hq_finance']));

DROP POLICY IF EXISTS payment_discounts_update_admin ON public.payment_discounts;
CREATE POLICY payment_discounts_update_admin ON public.payment_discounts
    FOR UPDATE TO authenticated
    USING (public.app_is_staff(NULL, ARRAY['hq_admin', 'hq_finance']))
    WITH CHECK (public.app_is_staff(NULL, ARRAY['hq_admin', 'hq_finance']));

-- Discounts are deactivated, never deleted (receipts reference them).
DROP POLICY IF EXISTS cash_payments_select_staff ON public.cash_payments;
CREATE POLICY cash_payments_select_staff ON public.cash_payments
    FOR SELECT TO authenticated USING (public.app_is_staff(hub_id));

REVOKE ALL ON public.payment_discounts FROM anon, authenticated;
REVOKE ALL ON public.cash_payments     FROM anon, authenticated;
GRANT SELECT ON public.payment_discounts TO authenticated;
GRANT SELECT ON public.cash_payments     TO authenticated;
-- used_count is maintained by the functions only.
GRANT INSERT (code, name, discount_type, value, max_discount, min_fare,
              valid_from, valid_to, usage_limit, is_active, notes, created_by)
    ON public.payment_discounts TO authenticated;
GRANT UPDATE (name, discount_type, value, max_discount, min_fare,
              valid_from, valid_to, usage_limit, is_active, notes)
    ON public.payment_discounts TO authenticated;

CREATE OR REPLACE FUNCTION public.payment_discounts_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    IF TG_OP = 'INSERT' AND current_user IN ('anon', 'authenticated') THEN
        NEW.created_by := auth.uid();
        NEW.used_count := 0;
    END IF;
    NEW.code := UPPER(TRIM(NEW.code));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_discounts_touch_trg ON public.payment_discounts;
CREATE TRIGGER payment_discounts_touch_trg
    BEFORE INSERT OR UPDATE ON public.payment_discounts
    FOR EACH ROW EXECUTE FUNCTION public.payment_discounts_touch();


-- -------------------------------------------------------------------------
-- 4. Shared helper: how much would this discount take off this fare?
--    Returns 0 when the discount does not apply (callers decide whether to
--    treat that as an error).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calc_discount_amount(p_discount public.payment_discounts, p_fare NUMERIC)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
AS $$
    SELECT LEAST(
        p_fare,
        ROUND(
            CASE WHEN p_discount.discount_type = 'percent'
                 THEN LEAST(p_fare * p_discount.value / 100.0,
                            COALESCE(p_discount.max_discount, p_fare))
                 ELSE p_discount.value
            END, 2)
    )
$$;


-- -------------------------------------------------------------------------
-- 5. record_cash_payment: the only way cash gets recorded
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_cash_payment(
    p_booking_id      UUID,
    p_amount_tendered NUMERIC,
    p_discount_id     UUID DEFAULT NULL,
    p_notes           TEXT DEFAULT NULL
)
RETURNS public.cash_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking   public.ambulance_bookings%ROWTYPE;
    v_discount  public.payment_discounts%ROWTYPE;
    v_staff     public.staff_roles%ROWTYPE;
    v_fare      NUMERIC(10, 2);
    v_disc_amt  NUMERIC(10, 2) := 0;
    v_net       NUMERIC(10, 2);
    v_receipt   public.cash_payments%ROWTYPE;
    v_actor     TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sila log masuk.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_booking FROM public.ambulance_bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tempahan tidak dijumpai.' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.app_is_staff(v_booking.hub_id, ARRAY['hq_admin', 'hq_finance', 'branch_manager']) THEN
        RAISE EXCEPTION 'Anda tidak dibenarkan merekod bayaran tunai untuk tempahan ini.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_staff FROM public.staff_roles
     WHERE user_id = auth.uid() AND is_active = TRUE LIMIT 1;
    v_actor := COALESCE(NULLIF(v_staff.full_name, ''), v_staff.email, auth.uid()::TEXT);

    IF COALESCE(v_booking.booking_status, '') = 'cancelled' THEN
        RAISE EXCEPTION 'Tempahan ini telah dibatalkan.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_booking.payment_status, 'unpaid') = 'paid' THEN
        RAISE EXCEPTION 'Tempahan ini sudah dibayar.' USING ERRCODE = '23505';
    END IF;
    IF COALESCE(v_booking.payment_method, 'cash') <> 'cash' THEN
        RAISE EXCEPTION 'Tempahan ini menggunakan bayaran dalam talian; tidak boleh direkod sebagai tunai.' USING ERRCODE = '22023';
    END IF;

    v_fare := COALESCE(v_booking.amount_due, v_booking.total_fare);
    IF v_fare IS NULL OR v_fare < 0 THEN
        RAISE EXCEPTION 'Jumlah tambang tempahan tidak sah.' USING ERRCODE = '22023';
    END IF;

    IF p_discount_id IS NOT NULL THEN
        SELECT * INTO v_discount FROM public.payment_discounts WHERE id = p_discount_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Diskaun tidak dijumpai.' USING ERRCODE = 'P0002';
        END IF;
        IF NOT v_discount.is_active THEN
            RAISE EXCEPTION 'Diskaun % tidak aktif.', v_discount.code USING ERRCODE = '22023';
        END IF;
        IF v_discount.valid_from IS NOT NULL AND CURRENT_DATE < v_discount.valid_from THEN
            RAISE EXCEPTION 'Diskaun % belum bermula.', v_discount.code USING ERRCODE = '22023';
        END IF;
        IF v_discount.valid_to IS NOT NULL AND CURRENT_DATE > v_discount.valid_to THEN
            RAISE EXCEPTION 'Diskaun % telah tamat tempoh.', v_discount.code USING ERRCODE = '22023';
        END IF;
        IF v_discount.usage_limit IS NOT NULL AND v_discount.used_count >= v_discount.usage_limit THEN
            RAISE EXCEPTION 'Had penggunaan diskaun % telah dicapai.', v_discount.code USING ERRCODE = '22023';
        END IF;
        IF v_fare < v_discount.min_fare THEN
            RAISE EXCEPTION 'Diskaun % memerlukan jumlah tambang minimum RM %.', v_discount.code, v_discount.min_fare
                USING ERRCODE = '22023';
        END IF;
        v_disc_amt := public.calc_discount_amount(v_discount, v_fare);
    END IF;

    v_net := v_fare - v_disc_amt;

    IF p_amount_tendered IS NULL OR p_amount_tendered < v_net THEN
        RAISE EXCEPTION 'Wang tunai diterima (RM %) kurang daripada jumlah perlu dibayar (RM %).',
            COALESCE(p_amount_tendered, 0), v_net USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.cash_payments (
        receipt_number, booking_id, invoice_number, hub_id, patient_name,
        fare_amount, discount_id, discount_code, discount_amount,
        amount_paid, amount_tendered, change_given, notes,
        received_by, received_by_name
    ) VALUES (
        'CR-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.cash_receipt_seq')::TEXT, 5, '0'),
        v_booking.id, v_booking.invoice_number, v_booking.hub_id, v_booking.patient_name,
        v_fare, v_discount.id, v_discount.code, v_disc_amt,
        v_net, p_amount_tendered, p_amount_tendered - v_net, NULLIF(TRIM(p_notes), ''),
        auth.uid(), v_actor
    )
    RETURNING * INTO v_receipt;

    IF v_discount.id IS NOT NULL THEN
        UPDATE public.payment_discounts SET used_count = used_count + 1 WHERE id = v_discount.id;
    END IF;

    -- Runs as the function owner, so the booking guard treats this as a trusted write.
    UPDATE public.ambulance_bookings SET
        payment_status = 'paid',
        payment_method = 'cash',
        amount_due     = v_net,
        paid_amount    = v_net,
        paid_at        = now(),
        updated_at     = now(),
        audit_trail    = COALESCE(audit_trail, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'action',    'CASH_PAYMENT_RECORDED',
            'actor',     v_actor,
            'timestamp', now(),
            'notes',     'Resit ' || v_receipt.receipt_number || ' - RM ' || v_net
                         || CASE WHEN v_disc_amt > 0
                                 THEN ' (diskaun ' || v_discount.code || ' -RM ' || v_disc_amt || ')'
                                 ELSE '' END
        ))
    WHERE id = v_booking.id;

    RETURN v_receipt;
END;
$$;


-- -------------------------------------------------------------------------
-- 6. void_cash_payment: reverse a receipt (reason is mandatory, row is kept)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_cash_payment(p_payment_id UUID, p_reason TEXT)
RETURNS public.cash_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pay    public.cash_payments%ROWTYPE;
    v_staff  public.staff_roles%ROWTYPE;
    v_actor  TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sila log masuk.' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Sebab pembatalan resit diperlukan.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_pay FROM public.cash_payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Resit tidak dijumpai.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.app_is_staff(v_pay.hub_id, ARRAY['hq_admin', 'hq_finance']) THEN
        RAISE EXCEPTION 'Hanya Pentadbir HQ atau Pegawai Kewangan boleh membatalkan resit.' USING ERRCODE = '42501';
    END IF;
    IF v_pay.status = 'voided' THEN
        RAISE EXCEPTION 'Resit ini sudah dibatalkan.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_staff FROM public.staff_roles
     WHERE user_id = auth.uid() AND is_active = TRUE LIMIT 1;
    v_actor := COALESCE(NULLIF(v_staff.full_name, ''), v_staff.email, auth.uid()::TEXT);

    UPDATE public.cash_payments SET
        status         = 'voided',
        voided_by      = auth.uid(),
        voided_by_name = v_actor,
        voided_at      = now(),
        void_reason    = TRIM(p_reason)
    WHERE id = v_pay.id
    RETURNING * INTO v_pay;

    IF v_pay.discount_id IS NOT NULL THEN
        UPDATE public.payment_discounts SET used_count = GREATEST(used_count - 1, 0)
         WHERE id = v_pay.discount_id;
    END IF;

    UPDATE public.ambulance_bookings SET
        payment_status = 'unpaid',
        paid_amount    = NULL,
        paid_at        = NULL,
        updated_at     = now(),
        audit_trail    = COALESCE(audit_trail, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'action',    'CASH_PAYMENT_VOIDED',
            'actor',     v_actor,
            'timestamp', now(),
            'reason',    TRIM(p_reason),
            'notes',     'Resit ' || v_pay.receipt_number || ' dibatalkan'
        ))
    WHERE id = v_pay.booking_id;

    RETURN v_pay;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cash_payment(UUID, NUMERIC, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_cash_payment(UUID, TEXT)                  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_payment(UUID, NUMERIC, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_cash_payment(UUID, TEXT)                  TO authenticated;
