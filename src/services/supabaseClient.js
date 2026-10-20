// Supabase Client & Database Services for Al-Farhain AMC Ambulance System
import { createClient } from '@supabase/supabase-js';

// Default / Stored Credentials
let clientInstance = null;

export function getStoredSupabaseConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY ||
                 import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

  const localUrl = localStorage.getItem('amc_supabase_url') || '';
  const localKey = localStorage.getItem('amc_supabase_anon_key') || '';

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

// Insert a new ambulance booking to Supabase
export async function insertBookingToSupabase(bookingData) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('Supabase not configured. Saved locally only.');
    return { success: false, offline: true };
  }

  try {
    const { data, error } = await supabase
      .from('ambulance_bookings')
      .insert([
        {
          invoice_number: bookingData.invoiceNumber,
          hub_id: bookingData.hubId,
          hub_name: bookingData.hubName,
          origin_name: bookingData.originName,
          destination_name: bookingData.destinationName,
          distance_km: bookingData.distanceKm,
          trip_type: bookingData.tripType,
          base_fare: bookingData.baseFare,
          extra_km_cost: bookingData.extraKmCost,
          assistance_package: bookingData.assistancePackage,
          assistance_cost: bookingData.assistanceCost,
          equipment_items: bookingData.equipmentItems,
          equipment_cost: bookingData.equipmentCost,
          misc_fee: bookingData.miscFee,
          total_fare: bookingData.totalFare,
          is_diesel_surge: bookingData.isDieselSurge,
          plate_number: bookingData.plateNumber,
          driver_name: bookingData.driverName,
          contact_phone: bookingData.contactPhone,
          status: bookingData.status || 'Dispatched'
        }
      ])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Supabase insert exception:', err);
    return { success: false, error: err.message };
  }
}

// Fetch recent bookings from Supabase
export async function fetchBookingsFromSupabase(limit = 20) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('ambulance_bookings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Supabase fetch bookings error:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.warn('Supabase fetch exception:', err);
    return null;
  }
}

// Update booking status (e.g. En Route, On Scene, In Transit, Arrived)
export async function updateBookingStatusInSupabase(invoiceNumber, newStatus) {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false };

  try {
    const { data, error } = await supabase
      .from('ambulance_bookings')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('invoice_number', invoiceNumber)
      .select();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
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

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: metadata
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

export async function signInUser(email, password) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const mockUser = {
      id: 'local_user',
      email: email.trim(),
      user_metadata: {
        full_name: email.split('@')[0],
        role: 'branch_manager'
      }
    };
    saveStoredUserProfile(mockUser);
    return { success: true, user: mockUser, isLocal: true };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.user) {
      saveStoredUserProfile(data.user);
    }
    return { success: true, user: data.user, session: data.session };
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
  return { success: true };
}

export async function getCurrentAuthUser() {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        saveStoredUserProfile(user);
        return user;
      }
    } catch (err) {
      console.warn('Get current user error:', err);
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
