-- =========================================================================
-- AL-FARHAIN AMBULANCE MEDICAL SYSTEM (AFAMS)
-- MIGRATION: Complete Booking Management System & Notifications
-- File: supabase_booking_management_schema.sql
-- Application Order:
--   1. supabase_schema.sql
--   2. supabase_driver_invitations_schema.sql
--   3. supabase_partner_ambulances_schema.sql
--   4. supabase_service_packages_schema.sql
--   5. supabase_booking_management_schema.sql (This file)
-- =========================================================================

-- 1. Extend ambulance_bookings Table for Multi-Stage Lifecycle & Concurrency
ALTER TABLE public.ambulance_bookings
    ADD COLUMN IF NOT EXISTS booking_status VARCHAR(50) DEFAULT 'pending_approval',
    ADD COLUMN IF NOT EXISTS assignment_status VARCHAR(50) DEFAULT 'unassigned',
    ADD COLUMN IF NOT EXISTS trip_status VARCHAR(50) DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS is_scheduled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS scheduled_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS patient_notes TEXT,
    ADD COLUMN IF NOT EXISTS pickup_category VARCHAR(60) DEFAULT 'Rumah / Kediaman',
    ADD COLUMN IF NOT EXISTS pickup_instructions TEXT,
    ADD COLUMN IF NOT EXISTS pickup_coordinates JSONB,
    ADD COLUMN IF NOT EXISTS pickup_confirmed_coords JSONB,
    ADD COLUMN IF NOT EXISTS destination_coordinates JSONB,
    ADD COLUMN IF NOT EXISTS stop4_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS stop4_name TEXT,
    ADD COLUMN IF NOT EXISTS stop4_address TEXT,
    ADD COLUMN IF NOT EXISTS stop4_coordinates JSONB,
    ADD COLUMN IF NOT EXISTS package_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS package_code VARCHAR(80),
    ADD COLUMN IF NOT EXISTS package_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS package_snapshot JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS route_snapshot JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100),
    ADD COLUMN IF NOT EXISTS assigned_provider_id UUID REFERENCES public.partner_companies(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_provider_name VARCHAR(200) DEFAULT 'Al-Farhain AMC',
    ADD COLUMN IF NOT EXISTS assigned_vehicle_id UUID,
    ADD COLUMN IF NOT EXISTS assigned_driver_id UUID,
    ADD COLUMN IF NOT EXISTS assigned_crew JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_requested BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cancellation_request_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_request_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reschedule_requested BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reschedule_request_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reschedule_request_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS approved_by VARCHAR(150),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(150),
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(150),
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS created_by_admin VARCHAR(150),
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS audit_trail JSONB DEFAULT '[]'::jsonb;

-- Idempotency key unique index (allows nulls for legacy)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ambulance_bookings_idempotency
ON public.ambulance_bookings(idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- Indexes for Admin Dashboard queries and Customer/Driver filters
CREATE INDEX IF NOT EXISTS idx_bookings_booking_status ON public.ambulance_bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_assignment_status ON public.ambulance_bookings(assignment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_trip_status ON public.ambulance_bookings(trip_status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_time ON public.ambulance_bookings(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_driver_id ON public.ambulance_bookings(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_bookings_hub_id ON public.ambulance_bookings(hub_id);

-- Backwards-compatibility data synchronization for existing records:
-- Maps existing legacy status to the new decoupled status fields
UPDATE public.ambulance_bookings
SET 
    booking_status = CASE 
        WHEN status IN ('Cancelled', 'Dibatalkan') THEN 'cancelled'
        WHEN status IN ('Ditolak', 'Rejected') THEN 'rejected'
        WHEN status IN ('Pending', 'Menunggu', 'Draft') THEN 'pending_approval'
        ELSE 'approved'
    END,
    assignment_status = CASE
        WHEN plate_number IS NOT NULL AND plate_number != '' AND driver_name IS NOT NULL AND driver_name != '' THEN 'assigned'
        ELSE 'unassigned'
    END,
    trip_status = CASE
        WHEN status IN ('Selesai', 'Completed', 'Arrived') THEN 'completed'
        WHEN status IN ('En Route', 'Menuju lokasi', 'Menuju Hospital', 'In Transit') THEN 'en_route_destination'
        WHEN status IN ('On Scene', 'Di lokasi') THEN 'arrived_pickup'
        WHEN status IN ('Dispatched') THEN 'en_route_pickup'
        ELSE 'not_started'
    END,
    version = COALESCE(version, 1),
    assigned_provider_name = COALESCE(assigned_provider_name, 'Al-Farhain AMC')
WHERE booking_status IS NULL OR booking_status = 'pending_approval' AND status IS NOT NULL AND status != 'pending_approval';

-- 2. In-App Notifications Table
CREATE TABLE IF NOT EXISTS public.booking_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.ambulance_bookings(id) ON DELETE CASCADE,
    booking_ref VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_role VARCHAR(40) NOT NULL CHECK (recipient_role IN ('customer', 'admin', 'driver', 'all')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    action_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_notifs_recipient ON public.booking_notifications(recipient_email, is_read);
CREATE INDEX IF NOT EXISTS idx_booking_notifs_booking ON public.booking_notifications(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_notifs_created ON public.booking_notifications(created_at DESC);

-- 3. Row Level Security & Policies
ALTER TABLE public.booking_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read booking_notifications" ON public.booking_notifications;
CREATE POLICY "Allow public read booking_notifications" 
ON public.booking_notifications FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert booking_notifications" ON public.booking_notifications;
CREATE POLICY "Allow public insert booking_notifications" 
ON public.booking_notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update booking_notifications" ON public.booking_notifications;
CREATE POLICY "Allow public update booking_notifications" 
ON public.booking_notifications FOR UPDATE USING (true);

-- 4. Enable Realtime Replication for Booking Notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'booking_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_notifications;
  END IF;
END $$;

