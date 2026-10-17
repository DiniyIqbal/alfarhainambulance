-- =========================================================================
-- AL-FARHAIN MEDICAL CENTER (AMC) - AMBULANCE MEDICAL SYSTEM
-- Supabase Database Schema, Tables, Policies & Realtime Setup
-- =========================================================================
-- How to apply:
-- 1. Open your Supabase Dashboard (https://app.supabase.com)
-- 2. Select your Project -> Click "SQL Editor" in the left sidebar
-- 3. Click "New Query", paste this entire script, and click "Run" (Ctrl+Enter)
-- =========================================================================

-- 1. Create Ambulance Bookings Table (Core Trip Records)
CREATE TABLE IF NOT EXISTS public.ambulance_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    hub_id VARCHAR(50) NOT NULL,
    hub_name TEXT NOT NULL,
    origin_name TEXT NOT NULL,
    destination_name TEXT NOT NULL,
    distance_km NUMERIC(8, 2) NOT NULL,
    trip_type TEXT NOT NULL,
    base_fare NUMERIC(10, 2) NOT NULL,
    extra_km_cost NUMERIC(10, 2) DEFAULT 0.00,
    assistance_package TEXT NOT NULL,
    assistance_cost NUMERIC(10, 2) DEFAULT 0.00,
    equipment_items TEXT,
    equipment_cost NUMERIC(10, 2) DEFAULT 0.00,
    misc_fee NUMERIC(10, 2) DEFAULT 50.00,
    total_fare NUMERIC(10, 2) NOT NULL,
    is_diesel_surge BOOLEAN DEFAULT FALSE,
    plate_number VARCHAR(20) NOT NULL,
    driver_name VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(50) DEFAULT '013-914 7606',
    patient_name VARCHAR(150),
    patient_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Dispatched', -- Dispatched, En Route, On Scene, In Transit, Arrived, Cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for speedy querying by invoice and creation date
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.ambulance_bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.ambulance_bookings(status);

-- 2. Create Ambulance Fleet Table
CREATE TABLE IF NOT EXISTS public.ambulance_fleet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number VARCHAR(20) UNIQUE NOT NULL,
    hub_id VARCHAR(50) NOT NULL,
    hub_name TEXT NOT NULL,
    model TEXT DEFAULT 'Toyota Hiace High Roof Ambulance',
    status VARCHAR(50) DEFAULT 'Active', -- Active, In Mission, Maintenance
    current_driver VARCHAR(100),
    hotline VARCHAR(50) DEFAULT '013-914 7606',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Drivers Table
CREATE TABLE IF NOT EXISTS public.ambulance_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    hub_id VARCHAR(50) NOT NULL,
    assigned_plate VARCHAR(20) REFERENCES public.ambulance_fleet(plate_number),
    phone VARCHAR(50) NOT NULL,
    license_type VARCHAR(50) DEFAULT 'GDL D / E Bertauliah EMT',
    status VARCHAR(50) DEFAULT 'Available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create Equipment & Services Catalogue Table
CREATE TABLE IF NOT EXISTS public.equipment_catalogue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code VARCHAR(50) UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    standard_price NUMERIC(10, 2) NOT NULL,
    price_range TEXT,
    unit TEXT DEFAULT 'Per Unit',
    in_stock BOOLEAN DEFAULT TRUE
);

-- Seed Initial Fleet & Drivers (Al-Farhain Official Data)
INSERT INTO public.ambulance_fleet (plate_number, hub_id, hub_name, model, status, current_driver, hotline)
VALUES 
    ('VPQ 7606', 'kok_lanas', 'HQ Pusat Rawatan Al-Farhain (Kok Lanas, Kelantan)', 'Toyota Hiace Medical Ambulance', 'Active', 'Abe Di / Syalihan', '013-914 7606'),
    ('DFG 7606', 'raub', 'Al-Farhain Medical Center (Cawangan Raub, Pahang)', 'Toyota Hiace Emergency Ambulance', 'Active', 'Abe Din Estimos Sukrosa', '013-914 7606')
ON CONFLICT (plate_number) DO NOTHING;

INSERT INTO public.ambulance_drivers (name, hub_id, assigned_plate, phone, status)
VALUES 
    ('Abe Di / Syalihan', 'kok_lanas', 'VPQ 7606', '013-914 7606', 'Available'),
    ('Abe Din Estimos Sukrosa', 'raub', 'DFG 7606', '013-914 7606', 'Available')
ON CONFLICT DO NOTHING;

-- Seed Standard Equipments
INSERT INTO public.equipment_catalogue (item_code, name, category, standard_price, price_range, unit)
VALUES
    ('EQP-O2', 'Bekalan Tangki Oksigen (Oxygen Tank Supply)', 'Sokongan Pernafasan', 50.00, 'RM30 - RM70', 'Per Silinder'),
    ('EQP-MED', 'Kit Pertolongan Cemas (Med Kit)', 'Ubatan & Konsumabel', 20.00, 'RM20', 'Per Set'),
    ('EQP-INC', 'Inkubator Pengangkutan Bayi (Transport Incubator)', 'Pediatrik & Neonatal', 250.00, 'RM100 - RM500', 'Per Trip'),
    ('EQP-VENT', 'Pam Infusi & Ventilator Mudah Alih', 'Kritikal & ICU', 150.00, 'RM70 - RM250', 'Per Trip'),
    ('EQP-MAT', 'Kit Bersalin Kecemasan (Obstetric / Maternity Kit)', 'Bersalin', 80.00, 'RM50 - RM120', 'Per Set'),
    ('EQP-SUCT', 'Mesin Sedut Kahak Elektrik (Portable Suction Unit)', 'Sokongan Pernafasan', 30.00, 'RM30', 'Per Unit'),
    ('EQP-AED', 'Unit Defibrillator AED Tambahan', 'Kardiak & Resusitasi', 500.00, 'RM500', 'Per Unit'),
    ('EQP-SPIN', 'Papan Tulang Belakang & Cervical Collar Set', 'Imobilisasi Trauma', 40.00, 'RM40', 'Per Set'),
    ('EQP-IV', 'Pek Infusi Cecair IV & Drip (Normal Saline)', 'Ubatan', 25.00, 'RM25', 'Per Pek')
ON CONFLICT (item_code) DO NOTHING;

-- 5. Enable Row Level Security (RLS) & Public Policies
ALTER TABLE public.ambulance_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulance_fleet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulance_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_catalogue ENABLE ROW LEVEL SECURITY;

-- Allow anonymous and authenticated users to read and insert bookings
CREATE POLICY "Allow public read ambulance_bookings" 
ON public.ambulance_bookings FOR SELECT USING (true);

CREATE POLICY "Allow public insert ambulance_bookings" 
ON public.ambulance_bookings FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update ambulance_bookings" 
ON public.ambulance_bookings FOR UPDATE USING (true);

CREATE POLICY "Allow public read fleet" 
ON public.ambulance_fleet FOR SELECT USING (true);

CREATE POLICY "Allow public read drivers" 
ON public.ambulance_drivers FOR SELECT USING (true);

CREATE POLICY "Allow public read equipment" 
ON public.equipment_catalogue FOR SELECT USING (true);

-- 6. Enable Realtime Replication for Live Dispatch Tracking
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE public.ambulance_bookings;
COMMIT;
