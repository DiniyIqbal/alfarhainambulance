// Supabase Client & Database Services for Al-Farhain AMC Ambulance System
import { createClient } from '@supabase/supabase-js';

// Default / Stored Credentials
let clientInstance = null;

const META_ENV = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

/**
 * Demo mode: 1-click demo accounts, local mock users and the in-app Supabase
 * config override. Enabled ONLY on the local dev server, or when a build
 * explicitly sets VITE_ENABLE_DEMO=true (e.g. a sales demo deployment that
 * is NOT connected to the production database).
 * Real data is protected by RLS regardless of this flag.
 */
export const DEMO_MODE = Boolean(META_ENV.DEV) || META_ENV.VITE_ENABLE_DEMO === 'true';

export function getStoredSupabaseConfig() {
  const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};

  const envUrl = META_ENV.VITE_SUPABASE_URL || procEnv.VITE_SUPABASE_URL || '';
  const envKey = META_ENV.VITE_SUPABASE_ANON_KEY || META_ENV.VITE_SUPABASE_PUBLISHABLE_KEY ||
                 procEnv.VITE_SUPABASE_ANON_KEY || procEnv.VITE_SUPABASE_PUBLISHABLE_KEY || '';

  // The localStorage override lets anyone point the app at another backend;
  // only honour it in demo/dev builds.
  let localUrl = '';
  let localKey = '';
  if (DEMO_MODE && typeof localStorage !== 'undefined') {
    localUrl = localStorage.getItem('amc_supabase_url') || '';
    localKey = localStorage.getItem('amc_supabase_anon_key') || '';
  }

  const url = localUrl || envUrl;
  const anonKey = localKey || envKey;

  return { url: url.trim(), anonKey: anonKey.trim() };
}

export function isSupabaseConfigured() {
  const { url, anonKey } = getStoredSupabaseConfig();
  return Boolean(url && anonKey && url.startsWith('http') && !url.includes('your-project-id'));
}

export function getSupabaseClient() {
  if (clientInstance) return clientInstance;

  const { url, anonKey } = getStoredSupabaseConfig();
  if (!url || !anonKey || !url.startsWith('http')) {
    return null;
  }

  try {
    clientInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    return clientInstance;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export function saveSupabaseConfig(url, anonKey) {
  if (!DEMO_MODE) {
    console.warn('Supabase configuration override is disabled in production builds.');
    return getSupabaseClient();
  }
  localStorage.setItem('amc_supabase_url', url.trim());
  localStorage.setItem('amc_supabase_anon_key', anonKey.trim());
  clientInstance = null; // Reset instance to recreate with new credentials
  return getSupabaseClient();
}

export async function testSupabaseConnection(url, anonKey) {
  try {
    const tempClient = createClient(url.trim(), anonKey.trim());
    // Try pinging the database or fetching 1 row
    const { data, error } = await tempClient
      .from('ambulance_bookings')
      .select('id')
      .limit(1);

    if (error) {
      // Table might not exist yet, but if auth is valid, status won't be 401
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return {
          success: true,
          tableExists: false,
          message: 'Sambungan ke Supabase berjaya! Sila jalankan fail supabase_schema.sql di SQL Editor untuk mencipta jadual.'
        };
      }
      return { success: false, message: error.message || 'Ralat pengesahan kunci Supabase.' };
    }

    return {
      success: true,
      tableExists: true,
      message: 'Sambungan ke Supabase & jadual ambulance_bookings aktif!'
    };
  } catch (err) {
    return { success: false, message: err.message || 'Tidak dapat menghubungi pelayan Supabase.' };
  }
}

/* =========================================================================
   Database CRUD & Realtime Subscriptions
   ========================================================================= */

// Helper to broadcast sync messages across browser tabs & app contexts
let syncBroadcastChannel = null;
function getSyncBroadcastChannel() {
  if (typeof BroadcastChannel !== 'undefined' && !syncBroadcastChannel) {
    try {
      syncBroadcastChannel = new BroadcastChannel('amc_sync_channel');
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }
  }
  return syncBroadcastChannel;
}

export function broadcastSyncEvent(type, data) {
  const payload = { type, data, timestamp: Date.now() };
  try {
    const bc = getSyncBroadcastChannel();
    if (bc) bc.postMessage(payload);
  } catch (e) {}

  try {
    localStorage.setItem('amc_last_sync_event', JSON.stringify(payload));
  } catch (e) {}
}

/* -------------------------------------------------------------------------
   Guest booking access tokens
   A guest (not signed in) cannot read bookings through RLS. When a guest
   creates a booking, a random token is stored with it and kept in this
   browser only; get_guest_booking(invoice, token) returns that one booking.
   ------------------------------------------------------------------------- */
const GUEST_TOKEN_KEY = 'amc_guest_booking_tokens';

function randomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readGuestTokens() {
  try {
    return JSON.parse(localStorage.getItem(GUEST_TOKEN_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function getGuestBookingToken(invoiceNumber) {
  if (!invoiceNumber || typeof localStorage === 'undefined') return null;
  return readGuestTokens()[invoiceNumber] || null;
}

/** Returns the existing token for this invoice, or creates and stores one. */
export function ensureGuestBookingToken(invoiceNumber) {
  if (!invoiceNumber || typeof localStorage === 'undefined') return null;
  const tokens = readGuestTokens();
  if (!tokens[invoiceNumber]) {
    tokens[invoiceNumber] = randomUuid();
    // keep the 20 most recent
    const trimmed = Object.fromEntries(Object.entries(tokens).slice(-20));
    try {
      localStorage.setItem(GUEST_TOKEN_KEY, JSON.stringify(trimmed));
    } catch (e) {}
    return trimmed[invoiceNumber] || tokens[invoiceNumber];
  }
  return tokens[invoiceNumber];
}

/** Keeps only real table columns (snake_case) and drops undefined values. */
export function toBookingRow(record) {
  return Object.fromEntries(
    Object.entries(record || {}).filter(([k, v]) => v !== undefined && !/[A-Z]/.test(k))
  );
}

/** Authorization header for /api/* calls (empty object when signed out). */
export async function getAuthHeaders() {
  const supabase = getSupabaseClient();
  if (!supabase) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export function saveLocalBookingCache(bookingRecord) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem('amc_all_bookings');
    const list = raw ? JSON.parse(raw) : [];
    const inv = bookingRecord.invoice_number || bookingRecord.invoiceNumber;
    const idx = list.findIndex(b => (b.invoice_number || b.invoiceNumber) === inv);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...bookingRecord };
    } else {
      list.unshift(bookingRecord);
    }
    localStorage.setItem('amc_all_bookings', JSON.stringify(list.slice(0, 50)));
  } catch (e) {
    console.warn('Failed to update local booking cache:', e);
  }
}

// Insert a new ambulance booking to Supabase and broadcast
export async function insertBookingToSupabase(bookingData) {
  const newRecord = {
    invoice_number: bookingData.invoiceNumber || bookingData.invoice_number || `AMC-${Date.now().toString().slice(-4)}`,
    hub_id: bookingData.hubId || bookingData.hub_id || 'kok_lanas',
    hub_name: bookingData.hubName || bookingData.hub_name || 'HQ Pusat Rawatan Al-Farhain (Kok Lanas)',
    origin_name: bookingData.originName || bookingData.origin_name || bookingData.pickup_address || bookingData.pickupName || 'Kota Bharu',
    destination_name: bookingData.destinationName || bookingData.destination_name || bookingData.dropoff_address || 'HRPZ II',
    distance_km: Number(bookingData.distanceKm || bookingData.distance_km || 26.3),
    trip_type: bookingData.tripType || bookingData.trip_type || 'Kecemasan standard (RM250)',
    base_fare: Number(bookingData.baseFare || bookingData.base_fare || 250.00),
    extra_km_cost: Number(bookingData.extraKmCost || bookingData.extra_km_cost || 0.00),
    assistance_package: bookingData.assistancePackage || bookingData.assistance_package || 'Tiada Staf Tambahan',
    assistance_cost: Number(bookingData.assistanceCost || bookingData.assistance_cost || 0.00),
    equipment_items: bookingData.equipmentItems || bookingData.equipment_items || '',
    equipment_cost: Number(bookingData.equipmentCost || bookingData.equipment_cost || 0.00),
    misc_fee: Number(bookingData.miscFee || bookingData.misc_fee || 0.00),
    total_fare: Number(bookingData.totalFare || bookingData.total_fare || 250.00),
    is_diesel_surge: Boolean(bookingData.isDieselSurge || bookingData.is_diesel_surge),
    // Assignment is done by HQ; patients never pick a vehicle/driver.
    plate_number: bookingData.plateNumber || bookingData.plate_number || '',
    driver_name: bookingData.driverName || bookingData.driver_name || '',
    contact_phone: bookingData.contactPhone || bookingData.contact_phone || '013-914 7606',
    patient_name: bookingData.patientName || bookingData.patient_name || 'Pesakit AMC',
    patient_phone: bookingData.patientPhone || bookingData.patient_phone || '013-914 7606',
    patient_email: bookingData.patientEmail || bookingData.patient_email || '',
    payment_status: bookingData.paymentStatus || bookingData.payment_status || 'unpaid',
    payment_method: bookingData.paymentMethod || bookingData.payment_method || 'cash',
    status: bookingData.status || 'Dispatched',
    created_at: bookingData.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Always update local cache & broadcast immediately for offline/cross-tab speed
  saveLocalBookingCache(newRecord);
  broadcastSyncEvent('INSERT_BOOKING', newRecord);

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.info('Supabase not configured. Saved locally and broadcasted to tabs/app.');
    return { success: true, offline: true, data: newRecord };
  }

  try {
    // Attempt full insert including patient_email & payment_status
    let insertObj = {
      invoice_number: newRecord.invoice_number,
      hub_id: newRecord.hub_id,
      hub_name: newRecord.hub_name,
      origin_name: newRecord.origin_name,
      destination_name: newRecord.destination_name,
      distance_km: newRecord.distance_km,
      trip_type: newRecord.trip_type,
      base_fare: newRecord.base_fare,
      extra_km_cost: newRecord.extra_km_cost,
      assistance_package: newRecord.assistance_package,
      assistance_cost: newRecord.assistance_cost,
      equipment_items: newRecord.equipment_items,
      equipment_cost: newRecord.equipment_cost,
      misc_fee: newRecord.misc_fee,
      total_fare: newRecord.total_fare,
      is_diesel_surge: newRecord.is_diesel_surge,
      plate_number: newRecord.plate_number,
      driver_name: newRecord.driver_name,
      contact_phone: newRecord.contact_phone,
      patient_name: newRecord.patient_name,
      patient_phone: newRecord.patient_phone,
      patient_email: newRecord.patient_email,
      payment_status: newRecord.payment_status,
      payment_method: newRecord.payment_method,
      status: newRecord.status,
      // lets a guest track this booking via get_guest_booking()
      guest_access_token: bookingData.guest_access_token || ensureGuestBookingToken(newRecord.invoice_number)
    };

    // No .select(): guests have no SELECT permission (RLS), and the server-side
    // trigger decides ownership/status anyway.
    const { error } = await supabase
      .from('ambulance_bookings')
      .insert([insertObj]);

    if (error) {
      // 23505 = invoice already stored (e.g. by createPatientBooking): not an error.
      if (error.code === '23505') {
        return { success: true, data: newRecord };
      }
      console.error('Supabase insert failed (saved locally only):', error.message);
      return { success: true, offlineFallback: true, error: error.message, data: newRecord };
    }

    return { success: true, data: newRecord };
  } catch (err) {
    console.warn('Supabase insert exception (saved locally):', err.message);
    return { success: true, offlineFallback: true, data: newRecord };
  }
}

// Fetch recent bookings from Supabase
export async function fetchBookingsFromSupabase(limit = 20) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    try {
      const raw = localStorage.getItem('amc_all_bookings');
      return raw ? JSON.parse(raw).slice(0, limit) : null;
    } catch {
      return null;
    }
  }

  try {
    const { data, error } = await supabase
      .from('ambulance_bookings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Supabase fetch bookings error:', error);
      const raw = localStorage.getItem('amc_all_bookings');
      return raw ? JSON.parse(raw).slice(0, limit) : null;
    }

    // Cache remote records locally
    if (Array.isArray(data)) {
      data.forEach(saveLocalBookingCache);
    }

    return data;
  } catch (err) {
    console.warn('Supabase fetch exception:', err);
    return null;
  }
}

// Fetch patient's actual ambulance bookings (synced with Supabase + Local Cache)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchPatientBookingsFromSupabase(user) {
  const supabase = getSupabaseClient();

  if (supabase) {
    const results = [];

    // 1. Signed-in patient: only rows they own (RLS enforces this too).
    if (user && UUID_PATTERN.test(user.id || '')) {
      try {
        const { data, error } = await supabase
          .from('ambulance_bookings')
          .select('*')
          .eq('patient_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!error && Array.isArray(data)) results.push(...data);
      } catch (e) {
        console.warn('Fetch own bookings notice:', e.message);
      }
    }

    // 2. Bookings made as a guest from this browser (token-based).
    const tokens = readGuestTokens();
    const seen = new Set(results.map((b) => b.invoice_number));
    for (const [invoice, token] of Object.entries(tokens)) {
      if (seen.has(invoice)) continue;
      try {
        const { data } = await supabase.rpc('get_guest_booking', { p_invoice: invoice, p_token: token });
        if (data) results.push(data);
      } catch (e) {}
    }

    results.forEach(saveLocalBookingCache);
    return results;
  }

  // ---- Offline / demo mode: filter the local cache ----
  if (!user) return [];
  const email = (user.email || '').toLowerCase().trim();
  const phone = (user.user_metadata?.phone || '').replace(/[^0-9]/g, '');
  const name = (user.user_metadata?.name || user.user_metadata?.full_name || '').toLowerCase().trim();

  // Read all records from local cache
  let all = [];
  try {
    const raw = localStorage.getItem('amc_all_bookings');
    all = raw ? JSON.parse(raw) : [];
  } catch {
    all = [];
  }

  const activeInv = localStorage.getItem('amc_active_invoice');

  return all.filter(b => {
    const bEmail = (b.patient_email || b.patientEmail || '').toLowerCase().trim();
    const bPhone = (b.patient_phone || b.patientPhone || '').replace(/[^0-9]/g, '');
    const bName = (b.patient_name || b.patientName || '').toLowerCase().trim();
    const inv = b.invoice_number || b.invoiceNumber;

    if (activeInv && inv === activeInv) return true;
    if (email && bEmail && bEmail === email) return true;
    if (phone && bPhone && phone.length >= 7 && (phone.includes(bPhone) || bPhone.includes(phone))) return true;
    if (name && bName && (name.includes(bName) || bName.includes(name))) return true;

    return false;
  });
}

// Update booking status (e.g. En Route, On Scene, In Transit, Arrived)
export async function updateBookingStatusInSupabase(invoiceNumber, newStatus, extraData = {}) {
  const updatePayload = {
    invoice_number: invoiceNumber,
    status: newStatus,
    updated_at: new Date().toISOString(),
    ...extraData
  };

  // Always update local cache & broadcast immediately
  saveLocalBookingCache(updatePayload);
  broadcastSyncEvent('UPDATE_BOOKING', updatePayload);

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true, offline: true, data: updatePayload };

  try {
    const fieldsToUpdate = { status: newStatus, updated_at: updatePayload.updated_at };
    if (extraData.payment_status) fieldsToUpdate.payment_status = extraData.payment_status;

    let { data, error } = await supabase
      .from('ambulance_bookings')
      .update(fieldsToUpdate)
      .eq('invoice_number', invoiceNumber)
      .select();

    if (error && error.message.includes('payment_status')) {
      const retry = await supabase
        .from('ambulance_bookings')
        .update({ status: newStatus, updated_at: updatePayload.updated_at })
        .eq('invoice_number', invoiceNumber)
        .select();
      data = retry.data;
      error = retry.error;
    }

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Fetch active mission for a driver
export async function fetchActiveMissionForDriver(plateNumber = 'VPQ 7606') {
  // RLS limits a driver to bookings whose plate_number is their assigned
  // ambulance, so no client-side plate filter is needed (or trusted).
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('ambulance_bookings')
        .select('*')
        .neq('status', 'Selesai')
        .neq('status', 'Cancelled')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        return data[0];
      }
      if (!error) return null; // authoritative: no mission assigned to this driver
    } catch (e) {
      console.warn('Notice fetching driver mission from Supabase:', e);
    }
    if (!DEMO_MODE) return null;
  }

  // Fallback (offline / demo only): check localStorage
  try {
    const raw = localStorage.getItem('amc_all_bookings');
    if (raw) {
      const all = JSON.parse(raw);
      const active = all.find(b => b.status !== 'Selesai' && b.status !== 'Cancelled');
      if (active) return active;
    }
  } catch (e) {}

  return null;
}

// Unified Realtime + Broadcast Channel Subscription
export function subscribeToUnifiedSync({ onNewBooking, onUpdateBooking, onStatusChange }) {
  const processedEvents = new Map();

  function handleEvent(eventType, data) {
    if (!data) return;
    const inv = data.invoice_number || data.invoiceNumber || 'unknown';
    const st = data.status || '';
    const key = `${eventType}_${inv}_${st}`;
    const now = Date.now();
    if (processedEvents.has(key) && (now - processedEvents.get(key) < 1200)) {
      return; // deduplicate
    }
    processedEvents.set(key, now);
    if (processedEvents.size > 50) {
      for (const [k, t] of processedEvents) {
        if (now - t > 10000) processedEvents.delete(k);
      }
    }

    if (eventType === 'INSERT' && onNewBooking) {
      onNewBooking(data);
    } else if (eventType === 'UPDATE' && onUpdateBooking) {
      onUpdateBooking(data);
    }
  }

  // 1. Supabase Realtime
  let supabaseChannel = null;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      supabaseChannel = subscribeToRealtimeBookings(
        (newRow) => handleEvent('INSERT', newRow),
        (updatedRow) => handleEvent('UPDATE', updatedRow)
      );
      if (onStatusChange) onStatusChange({ connected: true, mode: 'supabase_realtime' });
    } catch (e) {
      console.warn('Realtime subscription notice:', e);
      if (onStatusChange) onStatusChange({ connected: true, mode: 'broadcast_channel' });
    }
  } else {
    if (onStatusChange) onStatusChange({ connected: true, mode: 'broadcast_channel' });
  }

  // 2. BroadcastChannel
  let bc = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel('amc_sync_channel');
      bc.onmessage = (msg) => {
        if (msg.data?.type === 'INSERT_BOOKING') {
          handleEvent('INSERT', msg.data.data);
        } else if (msg.data?.type === 'UPDATE_BOOKING') {
          handleEvent('UPDATE', msg.data.data);
        }
      };
    } catch (e) {}
  }

  // 3. Storage event fallback for cross-tab in all browsers
  const storageHandler = (e) => {
    if (e.key === 'amc_last_sync_event' && e.newValue) {
      try {
        const payload = JSON.parse(e.newValue);
        if (payload?.type === 'INSERT_BOOKING') {
          handleEvent('INSERT', payload.data);
        } else if (payload?.type === 'UPDATE_BOOKING') {
          handleEvent('UPDATE', payload.data);
        }
      } catch (err) {}
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    if (supabaseChannel && typeof supabaseChannel.unsubscribe === 'function') {
      supabaseChannel.unsubscribe();
    }
    if (bc && typeof bc.close === 'function') {
      bc.close();
    }
    window.removeEventListener('storage', storageHandler);
  };
}

// Realtime subscription for live bookings
export function subscribeToRealtimeBookings(onNewBooking, onUpdateBooking) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const channel = supabase
      .channel('ambulance-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ambulance_bookings' },
        (payload) => {
          if (onNewBooking) onNewBooking(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ambulance_bookings' },
        (payload) => {
          if (onUpdateBooking) onUpdateBooking(payload.new);
        }
      )
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('Failed to subscribe to realtime Supabase changes:', err);
    return null;
  }
}

/* =========================================================================
   Authentication Services (Supabase Auth & Session Management)
   ========================================================================= */

export async function signUpUser(email, password, metadata = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const mockUser = {
      id: 'local_' + Date.now(),
      email: email.trim(),
      user_metadata: metadata
    };
    saveStoredUserProfile(mockUser);
    return { success: true, user: mockUser, isLocal: true };
  }

  // Roles are granted by HQ (staff_roles / driver invitations), never chosen
  // at sign-up. Strip any role hints so nothing downstream is tempted to trust them.
  const { role, role_label, account_status, ...safeMetadata } = metadata || {};

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: safeMetadata
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.user) {
      saveStoredUserProfile(data.user);
    }
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =========================================================================
// DEMONSTRATION DUMMY GMAIL ACCOUNTS (FOR MULTI-ROLE TESTING & DEMO)
// =========================================================================
export const DEMO_GMAIL_ACCOUNTS = {
  'pesakit.demo@gmail.com': {
    email: 'pesakit.demo@gmail.com',
    full_name: 'Nik Farhan (Waris Pesakit)',
    phone: '012-345 6789',
    role: 'patient',
    role_label: 'Pengguna Awam / Waris Pesakit',
    branch: 'kok_lanas',
    account_status: 'Aktif'
  },
  'pemandu.demo@gmail.com': {
    email: 'pemandu.demo@gmail.com',
    full_name: 'Abe Di (Pemandu Bertugas EMT)',
    phone: '013-914 7606',
    role: 'driver',
    role_label: 'Pemandu EMT Bertugas',
    ambulance_plate: 'VPQ 7606',
    branch: 'kok_lanas',
    account_status: 'Aktif'
  },
  'pemandu.pending@gmail.com': {
    email: 'pemandu.pending@gmail.com',
    full_name: 'Mohd Faizul bin Che Man',
    phone: '017-889 4432',
    role: 'driver',
    role_label: 'Pemandu EMT (Menunggu Kelulusan)',
    ambulance_plate: 'VPP 9901',
    branch: 'jeli',
    account_status: 'Menunggu Kelulusan'
  },
  'pemandu.pembetulan@gmail.com': {
    email: 'pemandu.pembetulan@gmail.com',
    full_name: 'Wan Kamarudin bin Wan Ismail',
    phone: '019-912 3345',
    role: 'driver',
    role_label: 'Pemandu EMT (Perlu Pembetulan)',
    ambulance_plate: '',
    branch: 'gua_musang',
    account_status: 'Perlu Pembetulan',
    correction_notes: 'Sila muat naik semula lesen GDL yang sah dan terkini.'
  },
  'admin.hq.alfarhain@gmail.com': {
    email: 'admin.hq.alfarhain@gmail.com',
    full_name: 'Abe Di (Pegawai Operasi HQ)',
    phone: '013-914 7606',
    role: 'hq_admin',
    role_label: 'Pentadbir Utama HQ',
    branch: 'all',
    account_status: 'Aktif'
  },
  'pengurus.raub@gmail.com': {
    email: 'pengurus.raub@gmail.com',
    full_name: 'Abe Din Estimos Sukrosa',
    phone: '013-914 7606',
    role: 'branch_manager',
    role_label: 'Pengurus Cawangan Raub',
    branch: 'raub',
    account_status: 'Aktif'
  },
  'admin.medicare@gmail.com': {
    email: 'admin.medicare@gmail.com',
    full_name: 'En. Wan Kamarul Ariffin',
    phone: '019-988 4412',
    role: 'partner_admin',
    role_label: 'Pentadbir Rakan Ambulans (MediCare)',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    branch: 'kelantan',
    account_status: 'Aktif'
  },
  'pemandu.medicare@gmail.com': {
    email: 'pemandu.medicare@gmail.com',
    full_name: 'Mohd Hafizuddin bin Razak',
    phone: '014-821 9033',
    role: 'partner_driver',
    role_label: 'Pemandu Rakan Ambulans (MediCare)',
    company_id: 'comp-medicare-kb',
    company_name: 'MediCare Ambulance Services Sdn. Bhd.',
    ambulance_plate: 'DDU 8892',
    branch: 'kelantan',
    account_status: 'Aktif'
  }
};

export async function signInUser(email, password) {
  const cleanEmail = (email || '').trim().toLowerCase();

  // 1. Direct Demo Account Match (demo/dev builds ONLY - no password check)
  if (DEMO_MODE && DEMO_GMAIL_ACCOUNTS[cleanEmail]) {
    const demo = DEMO_GMAIL_ACCOUNTS[cleanEmail];
    const mockUser = {
      id: 'demo_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'),
      email: demo.email,
      user_metadata: {
        full_name: demo.full_name,
        role: demo.role,
        role_label: demo.role_label,
        phone: demo.phone,
        branch: demo.branch,
        ambulance_plate: demo.ambulance_plate || '',
        company_id: demo.company_id || null,
        company_name: demo.company_name || null,
        account_status: demo.account_status,
        correction_notes: demo.correction_notes || ''
      }
    };
    mockUser.app_access = {
      role: demo.role,
      app_role: demo.role === 'hq_admin' || demo.role === 'branch_manager' ? 'hq'
        : (demo.role === 'partner_admin' ? 'partner' : (demo.role.includes('driver') ? 'driver' : 'patient')),
      full_name: demo.full_name,
      branch_id: demo.branch,
      ambulance_plate: demo.ambulance_plate || '',
      company_id: demo.company_id || null,
      account_status: demo.account_status
    };
    saveStoredUserProfile(mockUser);
    return { success: true, user: mockUser, isDemo: true };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    if (!DEMO_MODE) {
      return { success: false, error: 'Perkhidmatan log masuk tidak tersedia. Sila cuba sebentar lagi.' };
    }
    const mockUser = {
      id: 'local_user',
      email: cleanEmail,
      user_metadata: {
        full_name: cleanEmail.split('@')[0],
        role: cleanEmail.includes('driver') || cleanEmail.includes('pemandu') ? 'driver' : 'patient'
      }
    };
    saveStoredUserProfile(mockUser);
    return { success: true, user: mockUser, isLocal: true };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const user = data?.user ? await attachAccess(data.user) : null;
    if (user) {
      saveStoredUserProfile(user);
    }
    return { success: true, user, session: data.session };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function signInWithGoogleOAuth(roleHint = 'patient') {
  const supabase = getSupabaseClient();
  const targetPage = roleHint === 'driver' ? '/driver.html' : '/index.html';
  const redirectTo = window.location.origin + targetPage;

  if (!supabase) {
    // Local / Offline demo user simulation
    const mockEmail = roleHint === 'driver' ? 'diniy-driver@gmail.com' : 'pesakit@gmail.com';
    const mockUser = {
      id: 'local_google_' + Date.now(),
      email: mockEmail,
      user_metadata: {
        full_name: roleHint === 'driver' ? 'Abe Di (Pemandu EMT)' : 'Pesakit Al-Farhain',
        role: roleHint,
        ambulance_plate: 'VPQ 7606',
        branch: 'Kok Lanas HQ'
      }
    };
    saveStoredUserProfile(mockUser);
    return { success: true, user: mockUser, isLocal: true, redirect: targetPage };
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function signOutUser() {
  const supabase = getSupabaseClient();
  try {
    if (supabase) {
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.warn('Sign out error:', err);
  }
  localStorage.removeItem('amc_auth_user');
  // Patient data cached on this device belongs to the signed-out user.
  localStorage.removeItem('amc_all_bookings');
  localStorage.removeItem('amc_local_bookings');
  localStorage.removeItem('amc_notifications');
  localStorage.removeItem('amc_active_invoice');
  localStorage.removeItem('amc_last_sync_event');
  return { success: true };
}

/**
 * Server-resolved role for the signed-in user (RPC get_my_access).
 * Shape: { role, app_role, full_name, branch_id, ambulance_plate, company_id, account_status }
 */
export async function fetchMyAccess() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('get_my_access');
    if (error) {
      console.warn('get_my_access failed:', error.message);
      return null;
    }
    return data || null;
  } catch (err) {
    console.warn('get_my_access exception:', err.message);
    return null;
  }
}

async function attachAccess(user) {
  if (!user) return user;
  const access = await fetchMyAccess();
  return { ...user, app_access: access || { role: 'patient', app_role: 'patient' } };
}

export async function getCurrentAuthUser() {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const withAccess = await attachAccess(user);
        saveStoredUserProfile(withAccess);
        return withAccess;
      }
    } catch (err) {
      console.warn('Get current user error:', err);
    }
    // A real backend is configured: a cached profile is NOT a session.
    if (!DEMO_MODE) {
      localStorage.removeItem('amc_auth_user');
      return null;
    }
  }
  return getStoredUserProfile();
}

export function getStoredUserProfile() {
  try {
    const raw = localStorage.getItem('amc_auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStoredUserProfile(user) {
  try {
    localStorage.setItem('amc_auth_user', JSON.stringify(user));
  } catch (e) {
    console.warn('Failed to save auth profile to local storage:', e);
  }
}

/**
 * Determine the UI role ('hq' | 'driver' | 'partner_admin' | 'partner_driver' | 'patient').
 *
 * Production: ONLY the server-resolved `access` (from get_my_access) counts.
 * user_metadata is editable by the user themself, so it is never trusted.
 * Demo/offline builds fall back to the old metadata/email heuristics.
 *
 * This only drives routing/UI. Data access is enforced by RLS and the APIs.
 */
export function resolveUserRole(email = '', userMetadata = {}, access = null) {
  if (access && access.role) {
    if (['hq_admin', 'branch_manager', 'dispatcher', 'hq_finance'].includes(access.role)) return 'hq';
    if (access.role === 'partner_admin' || access.role === 'partner_driver') return access.role;
    if (access.role === 'driver') return 'driver';
    return 'patient';
  }

  if (!DEMO_MODE && isSupabaseConfigured()) {
    return 'patient';
  }

  // ---- Demo / offline heuristics ----
  if (userMetadata?.role) {
    if (['hq_admin', 'branch_manager', 'dispatcher', 'hq_finance'].includes(userMetadata.role)) return 'hq';
    return userMetadata.role;
  }
  const clean = (email || '').toLowerCase().trim();
  if (clean.includes('-driver@') || clean.includes('.driver@') || clean.includes('_driver@') || clean.includes('driver')) {
    return 'driver';
  }
  if (clean.includes('hq@') || clean.includes('admin@') || clean.includes('dispatcher')) {
    return 'hq';
  }
  return 'patient';
}

export function getRoleDestination(role) {
  if (role === 'driver') return '/driver.html';
  if (role === 'hq') return '/portal.html';
  return '/index.html';
}

export function redirectBasedOnRole(user, options = {}) {
  if (!user) return;
  const role = resolveUserRole(user.email, user.user_metadata, user.app_access);
  const currentPath = window.location.pathname;

  if (role === 'driver' && !currentPath.includes('driver.html')) {
    window.location.href = '/driver.html';
  } else if (role === 'hq' && !currentPath.includes('portal.html')) {
    window.location.href = '/portal.html';
  } else if (role === 'patient' && (currentPath.includes('driver.html') || currentPath.includes('portal.html'))) {
    if (!options.allowAdminBypass) {
      window.location.href = '/index.html';
    }
  }
}

/**
 * Removes 1-click demo login buttons from the page in production builds.
 * Safe to call on any page; no-op in demo/dev builds.
 */
export function hideDemoLoginUi(root = (typeof document !== 'undefined' ? document : null)) {
  if (DEMO_MODE || !root) return;
  root.querySelectorAll(
    '.auth-demo-picker-card, .btn-demo-quick-mobile, .btn-demo-quick-auth-mobile, .btn-demo-quick-auth, [data-demo-only]'
  ).forEach((el) => el.remove());
}
