// Al-Farhain Ambulance Pricing & Calculation Engine for Flutter

import '../models/trip_model.dart';

class PricingService {
  static const double standardBaseKm = 25.0;
  static const double standardBaseFare = 250.00;
  static const double normalKmRate = 3.00;
  static const double dieselSurgeKmRate = 4.50; // Excel dummy 1.5x diesel multiplier
  static const double defaultMiscFee = 50.00;

  static const AmbulanceHub kokLanasHub = AmbulanceHub(
    id: 'kok_lanas',
    name: 'HQ Pusat Rawatan Al-Farhain (Kok Lanas, Kelantan)',
    shortName: 'Kok Lanas HQ',
    state: 'Kelantan',
    lat: 5.9176965,
    lng: 102.2446687,
    plateNumber: 'VPQ 7606',
    driverName: 'Abe Di / Syalihan',
    hotline: '013-914 7606',
    operatingHours: '24 Jam (24 Hours Emergency)',
    address: 'Pt 5075-5077 Tingkat Bawah, Kompleks Perniagaan Saidina Ali Ketereh, Kota Bharu',
  );

  static const AmbulanceHub raubHub = AmbulanceHub(
    id: 'raub',
    name: 'Al-Farhain Medical Center (Cawangan Raub, Pahang)',
    shortName: 'Raub Branch Hub',
    state: 'Pahang',
    lat: 3.7899,
    lng: 101.8570,
    plateNumber: 'DFG 7606',
    driverName: 'Abe Din Estimos Sukrosa',
    hotline: '013-914 7606',
    operatingHours: '24 Jam (24 Hours Emergency)',
    address: 'Bandar Raub, 27600 Raub, Pahang Darul Makmur',
  );

  static const List<PresetHospital> presetHospitals = [
    PresetHospital(
      id: 'hrpz',
      name: 'Hospital Raja Perempuan Zainab II (HRPZ II), Kota Bharu',
      shortName: 'HRPZ II Kota Bharu',
      category: 'Hospital Kerajaan (Tertiary)',
      distanceFromHQ: 27.2, // Verified in AMC Excel
      lat: 6.1256,
      lng: 102.2482,
      estMinutes: 32,
    ),
    PresetHospital(
      id: 'husm',
      name: 'Hospital Universiti Sains Malaysia (Hospital USM), Kubang Kerian',
      shortName: 'HUSM Kubang Kerian',
      category: 'Hospital Universiti / Trauma Center',
      distanceFromHQ: 25.5,
      lat: 6.0988,
      lng: 102.2858,
      estMinutes: 30,
    ),
    PresetHospital(
      id: 'h_kuala_krai',
      name: 'Hospital Sultan Ismail Petra (Hospital Kuala Krai)',
      shortName: 'Hospital Kuala Krai',
      category: 'Hospital Kerajaan Berpakar',
      distanceFromHQ: 45.0,
      lat: 5.5325,
      lng: 102.2045,
      estMinutes: 48,
    ),
    PresetHospital(
      id: 'h_machang',
      name: 'Hospital Machang',
      shortName: 'Hospital Machang',
      category: 'Hospital Daerah',
      distanceFromHQ: 18.0,
      lat: 5.7668,
      lng: 102.2185,
      estMinutes: 22,
    ),
    PresetHospital(
      id: 'h_pasir_mas',
      name: 'Hospital Pasir Mas',
      shortName: 'Hospital Pasir Mas',
      category: 'Hospital Daerah',
      distanceFromHQ: 26.4,
      lat: 6.0425,
      lng: 102.1432,
      estMinutes: 34,
    ),
    PresetHospital(
      id: 'h_tanah_merah',
      name: 'Hospital Tanah Merah',
      shortName: 'Hospital Tanah Merah',
      category: 'Hospital Daerah Berpakar',
      distanceFromHQ: 31.0,
      lat: 5.8085,
      lng: 102.1472,
      estMinutes: 38,
    ),
    PresetHospital(
      id: 'h_tumpat',
      name: 'Hospital Tumpat',
      shortName: 'Hospital Tumpat',
      category: 'Hospital Daerah',
      distanceFromHQ: 38.2,
      lat: 6.1965,
      lng: 102.1695,
      estMinutes: 45,
    ),
    PresetHospital(
      id: 'h_jeli',
      name: 'Hospital Jeli',
      shortName: 'Hospital Jeli',
      category: 'Hospital Daerah',
      distanceFromHQ: 86.0,
      lat: 5.6995,
      lng: 101.8445,
      estMinutes: 90,
    ),
    PresetHospital(
      id: 'htaa_kuantan',
      name: 'Hospital Tengku Ampuan Afzan (HTAA), Kuantan',
      shortName: 'HTAA Kuantan',
      category: 'Hospital Tertier Negeri Pahang',
      distanceFromHQ: 340.0,
      lat: 3.8168,
      lng: 103.3255,
      estMinutes: 310,
    ),
    PresetHospital(
      id: 'h_raub',
      name: 'Hospital Raub',
      shortName: 'Hospital Raub',
      category: 'Hospital Daerah Pahang',
      distanceFromHQ: 365.0,
      lat: 3.7915,
      lng: 101.8590,
      estMinutes: 330,
    ),
  ];

  static const List<TripCategory> tripCategories = [
    TripCategory(
      id: 'emergency',
      name: 'Kecemasan Standard (Emergency)',
      baseFare: 250.00,
      description: 'Kes kecemasan umum, kemalangan akut, trauma fizikal',
      badge: 'Code Red/Yellow',
    ),
    TripCategory(
      id: 'non_emergency',
      name: 'Bukan Kecemasan (Non-Emergency)',
      baseFare: 250.00,
      description: 'Rujukan berjadual, pesakit discaj ke rumah, dialisis',
      badge: 'Code Green',
    ),
    TripCategory(
      id: 'emergency_inhouse',
      name: 'Kecemasan In-House (Emergency In House)',
      baseFare: 350.00,
      description: 'Stabilisasi segera dari fasiliti pesakit luar AMC',
      badge: 'In-House Rapid',
    ),
    TripCategory(
      id: 'aed_critical',
      name: 'Kecemasan Kritikal + AED (Cardiac / Resuscitation)',
      baseFare: 500.00,
      description: 'Henti nafas, serangan jantung perlukan Defibrillator AED',
      badge: 'Cardiac Resus',
    ),
  ];

  static const List<AssistancePackage> assistancePackages = [
    AssistancePackage(
      id: 'none',
      name: 'Tiada Pakej Tambahan (Krew EMT Standard Termasuk)',
      roleTitle: 'Pemandu Terlatih + Pembantu EMT',
      price: 0.00,
      description: 'Termasuk pemandu berpengalaman dan kru paramedik asas AMC',
      skills: ['CPR Asas', 'Stretcher Handling', 'Navigasi Pantas'],
    ),
    AssistancePackage(
      id: 'ca',
      name: 'AMBULANS - PAKEJ C.A (Care / Clinical Assistant)',
      roleTitle: 'Pembantu Klinikal (C.A)',
      price: 100.00,
      description: 'Pembantu klinikal bertugas mengiringi dan memantau tanda vital',
      skills: ['Tekanan Darah', 'SPO2 Pulse Oximetry', 'Bantuan Oksigen'],
    ),
    AssistancePackage(
      id: 'ma',
      name: 'AMBULANS - PAKEJ M.A (Medical Assistant / PPP)',
      roleTitle: 'Penolong Pegawai Perubatan (PPP)',
      price: 200.00,
      description: 'Paramedik berdaftar berpengalaman untuk rawatan IV & sokongan akut',
      skills: ['Airway Management', 'IV Cannula & Drips', 'Trauma Care'],
    ),
    AssistancePackage(
      id: 'dr',
      name: 'AMBULANS - PAKEJ DR (Pegawai Perubatan / Doctor Escort)',
      roleTitle: 'Doktor Perubatan Bertauliah (M.O)',
      price: 400.00,
      description: 'Doktor Al-Farhain mengiringi untuk intervensi kritikal dan preskripsi',
      skills: ['Resusitasi Lengkap ACLS', 'Intubasi & Ventilasi', 'Keputusan Klinikal'],
    ),
  ];

  static const List<EquipmentItem> equipmentItems = [
    EquipmentItem(
      id: 'oxygen_supply',
      name: 'Bekalan Tangki Oksigen (Oxygen Tank Supply)',
      category: 'Pernafasan',
      price: 50.00,
      priceRange: 'RM30 - RM70',
      unit: 'Per Silinder',
      icon: '💨',
      description: 'Tangki oksigen gred perubatan dengan regulator dan flowmeter',
    ),
    EquipmentItem(
      id: 'med_kit',
      name: 'Kit Pertolongan Cemas (Med Kit)',
      category: 'Ubatan',
      price: 20.00,
      priceRange: 'RM20',
      unit: 'Per Set',
      icon: '🩹',
      description: 'Pek lengkap pembalut steril, cecair antiseptik, dan luka',
    ),
    EquipmentItem(
      id: 'transport_incubator',
      name: 'Inkubator Pengangkutan Bayi (Transport Incubator)',
      category: 'Pediatrik',
      price: 250.00,
      priceRange: 'RM100 – RM500',
      unit: 'Per Unit',
      icon: '👶',
      description: 'Unit inkubator mudah alih kawalan suhu khas bayi baru lahir',
    ),
    EquipmentItem(
      id: 'infusion_pump_ventilator',
      name: 'Pam Infusi & Ventilator (Ventilator & Infusion Pumps)',
      category: 'Kritikal',
      price: 150.00,
      priceRange: 'RM70 – RM250',
      unit: 'Per Unit',
      icon: '🫁',
      description: 'Bantuan pernafasan automatik mekanikal dan pam ubat tepat',
    ),
    EquipmentItem(
      id: 'maternity_kit',
      name: 'Kit Bersalin Kecemasan (Obstetric / Maternity Kit)',
      category: 'Maternity',
      price: 80.00,
      priceRange: 'RM50 – RM120',
      unit: 'Per Set',
      icon: '🤰',
      description: 'Peralatan steril pemotongan tali pusat dan pembalut bayi',
    ),
    EquipmentItem(
      id: 'suction_unit',
      name: 'Mesin Sedut Kahak (Portable Suction Unit)',
      category: 'Pernafasan',
      price: 30.00,
      priceRange: 'RM30',
      unit: 'Per Unit',
      icon: '🧪',
      description: 'Mesin sedutan elektrik mudah alih dengan suction catheter',
    ),
    EquipmentItem(
      id: 'aed_unit',
      name: 'Unit AED Defibrillator Tambahan',
      category: 'Kardiak',
      price: 500.00,
      priceRange: 'RM500',
      unit: 'Per Unit',
      icon: '⚡',
      description: 'Alat renjatan jantung automatik dengan pad elektrod',
    ),
    EquipmentItem(
      id: 'spine_board',
      name: 'Papan Tulang Belakang & Cervical Collar',
      category: 'Trauma',
      price: 40.00,
      priceRange: 'RM40',
      unit: 'Per Set',
      icon: '🩼',
      description: 'Papan imobilisasi tulang belakang lengkap dengan head block',
    ),
  ];

  static TripCalculationResult calculate({
    required double distanceKm,
    required TripCategory tripCategory,
    required AssistancePackage assistance,
    required Map<String, int> equipmentQuantities,
    required bool isDieselSurge,
    required bool includeMiscFee,
  }) {
    final distance = distanceKm < 1.0 ? 1.0 : distanceKm;
    final extraKm = (distance - standardBaseKm) > 0 ? (distance - standardBaseKm) : 0.0;
    final ratePerKm = isDieselSurge ? dieselSurgeKmRate : normalKmRate;
    final extraKmCost = extraKm * ratePerKm;

    double equipCost = 0.0;
    equipmentQuantities.forEach((id, qty) {
      if (qty > 0) {
        final item = equipmentItems.firstWhere((e) => e.id == id, orElse: () => equipmentItems.first);
        equipCost += item.price * qty;
      }
    });

    final miscFee = includeMiscFee ? defaultMiscFee : 0.00;
    final grandTotal = tripCategory.baseFare + extraKmCost + assistance.price + equipCost + miscFee;

    return TripCalculationResult(
      distanceKm: distance,
      baseKm: standardBaseKm,
      extraKm: extraKm,
      baseFare: tripCategory.baseFare,
      extraKmRate: ratePerKm,
      extraKmCost: extraKmCost,
      assistanceCost: assistance.price,
      equipmentCost: equipCost,
      miscFee: miscFee,
      grandTotal: grandTotal,
    );
  }
}
