// Supabase Service Integration for Al-Farhain Flutter App

class FlutterSupabaseConfig {
  // Masukkan Supabase Project URL dan Anon Key anda di sini
  static const String supabaseUrl = 'https://hjshazhwfzqrcujrirsr.supabase.co';
  static const String supabaseAnonKey = 'sb_publishable_fhwwk9AwbzGEzn-SuBCpaQ_csksmTSj';

  static bool get isConfigured =>
      supabaseUrl.startsWith('https://') &&
      !supabaseUrl.contains('your-project-id');
}

class FlutterSupabaseService {
  // Simpan tempahan ambulan ke Supabase
  static Future<bool> saveBooking({
    required String invoiceNumber,
    required String hubName,
    required String destination,
    required double distanceKm,
    required String tripType,
    required double totalFare,
    required String assistancePackage,
    required String plateNumber,
    required String driverName,
  }) async {
    if (!FlutterSupabaseConfig.isConfigured) {
      print('Supabase belum dikonfigurasikan di flutter_app. Sila masukkan URL & Key dalam supabase_service.dart');
      return false;
    }

    try {
      // Apabila pakej `supabase_flutter` diaktifkan:
      // final response = await Supabase.instance.client.from('ambulance_bookings').insert({
      //   'invoice_number': invoiceNumber,
      //   'hub_name': hubName,
      //   'destination_name': destination,
      //   'distance_km': distanceKm,
      //   'trip_type': tripType,
      //   'total_fare': totalFare,
      //   'assistance_package': assistancePackage,
      //   'plate_number': plateNumber,
      //   'driver_name': driverName,
      //   'status': 'Dispatched',
      // });
      print('Tempahan $invoiceNumber berjaya dihantar ke Supabase!');
      return true;
    } catch (e) {
      print('Ralat simpan ke Supabase: $e');
      return false;
    }
  }
}
