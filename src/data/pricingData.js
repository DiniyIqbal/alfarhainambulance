// Al-Farhain Medical Center (AMC) Ambulance Official Pricing & Operational Data
// Converted directly from Google Drive Spreadsheets and AMC Operational Specs

export const HUBS = {
  KOK_LANAS: {
    id: 'kok_lanas',
    name: 'HQ Pusat Rawatan Al-Farhain (Kok Lanas, Kelantan)',
    shortName: 'Kok Lanas HQ',
    state: 'Kelantan',
    coords: [5.9176965, 102.2446687],
    ambulancePlate: 'VPQ 7606',
    primaryDriver: 'Abe Di / Syalihan',
    contactNumber: '013-914 7606',
    operatingHours: '24 Jam (24 Hours Emergency)',
    address: 'Pt 5075-5077, Kompleks Perniagaan Saidina Ali Ketereh, 16450 Kota Bharu, Kelantan',
    coverage: 'Kota Bharu, Machang, Pasir Mas, Kuala Krai, Tumpat, Jeli, Bachok & Seluruh Semenanjung',
    mapLink: 'https://shorturl.at/e8deM'
  },
  RAUB: {
    id: 'raub',
    name: 'Al-Farhain Medical Center (Cawangan Raub, Pahang)',
    shortName: 'Raub Branch Hub',
    state: 'Pahang',
    coords: [3.7899, 101.8570],
    ambulancePlate: 'DFG 7606',
    primaryDriver: 'Abe Din Estimos Sukrosa',
    contactNumber: '013-914 7606',
    operatingHours: '24 Jam (24 Hours Emergency)',
    address: 'Bandar Raub, 27600 Raub, Pahang Darul Makmur',
    coverage: 'Raub, Kuala Lipis, Cameron Highlands, Bentong, Temerloh & Seluruh Pahang',
    mapLink: 'https://shorturl.at/jNNJU'
  }
};

export const OTHER_BRANCHES = [
  { id: 'jeli', name: 'Al-Farhain Medical Center (Cawangan Jeli)', coords: [5.6987, 101.8427], state: 'Kelantan' },
  { id: 'machang', name: 'Al-Farhain Medical Center (Cawangan Machang)', coords: [5.7661, 102.2163], state: 'Kelantan' },
  { id: 'tumpat', name: 'Al-Farhain Medical Center (Cawangan Tumpat)', coords: [6.1983, 102.1673], state: 'Kelantan' },
  { id: 'tunjung', name: 'Al-Farhain Medical Center (Cawangan Tunjung)', coords: [6.0718, 102.2536], state: 'Kelantan' },
  { id: 'kuala_krai', name: 'Al-Farhain Medical Center (Cawangan Kuala Krai)', coords: [5.5317, 102.2023], state: 'Kelantan' },
  { id: 'cameron', name: 'Al-Farhain Medical Center (Cawangan Cameron Highlands)', coords: [4.4705, 101.3785], state: 'Pahang' },
  { id: 'kuala_lipis', name: 'Al-Farhain Medical Center (Cawangan Kuala Lipis)', coords: [4.1843, 102.0468], state: 'Pahang' }
];

export const PRESET_DESTINATIONS = [
  {
    id: 'hrpz',
    name: 'Hospital Raja Perempuan Zainab II (HRPZ II), Kota Bharu',
    shortName: 'HRPZ II Kota Bharu',
    category: 'Hospital Kerajaan (Tertiary)',
    distanceFromKokLanas: 27.2, // Verified in Excel documentation
    coords: [6.1256, 102.2482],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'husm',
    name: 'Hospital Universiti Sains Malaysia (Hospital USM), Kubang Kerian',
    shortName: 'HUSM Kubang Kerian',
    category: 'Hospital Universiti / Trauma Center',
    distanceFromKokLanas: 25.5,
    coords: [6.0988, 102.2858],
    estDurationMin: 30,
    state: 'Kelantan'
  },
  {
    id: 'h_kuala_krai',
    name: 'Hospital Sultan Ismail Petra (Hospital Kuala Krai)',
    shortName: 'Hospital Kuala Krai',
    category: 'Hospital Kerajaan Berpakar',
    distanceFromKokLanas: 45.0,
    coords: [5.5325, 102.2045],
    estDurationMin: 48,
    state: 'Kelantan'
  },
  {
    id: 'h_machang',
    name: 'Hospital Machang',
    shortName: 'Hospital Machang',
    category: 'Hospital Daerah',
    distanceFromKokLanas: 18.0,
    coords: [5.7668, 102.2185],
    estDurationMin: 22,
    state: 'Kelantan'
  },
  {
    id: 'h_pasir_mas',
    name: 'Hospital Pasir Mas',
    shortName: 'Hospital Pasir Mas',
    category: 'Hospital Daerah',
    distanceFromKokLanas: 26.4,
    coords: [6.0425, 102.1432],
    estDurationMin: 34,
    state: 'Kelantan'
  },
  {
    id: 'h_tanah_merah',
    name: 'Hospital Tanah Merah',
    shortName: 'Hospital Tanah Merah',
    category: 'Hospital Daerah Berpakar',
    distanceFromKokLanas: 31.0,
    coords: [5.8085, 102.1472],
    estDurationMin: 38,
    state: 'Kelantan'
  },
  {
    id: 'h_tumpat',
    name: 'Hospital Tumpat',
    shortName: 'Hospital Tumpat',
    category: 'Hospital Daerah',
    distanceFromKokLanas: 38.2,
    coords: [6.1965, 102.1695],
    estDurationMin: 45,
    state: 'Kelantan'
  },
  {
    id: 'h_jeli',
    name: 'Hospital Jeli',
    shortName: 'Hospital Jeli',
    category: 'Hospital Daerah',
    distanceFromKokLanas: 86.0,
    coords: [5.6995, 101.8445],
    estDurationMin: 90,
    state: 'Kelantan'
  },
  {
    id: 'kpz_kb',
    name: 'KPJ Perdana Specialist Hospital, Kota Bharu',
    shortName: 'KPJ Perdana Kota Bharu',
    category: 'Hospital Swasta',
    distanceFromKokLanas: 28.0,
    coords: [6.1205, 102.2530],
    estDurationMin: 33,
    state: 'Kelantan'
  },
  {
    id: 'kota_bharu_med',
    name: 'Kota Bharu Medical Centre (KBMC)',
    shortName: 'KBMC Kota Bharu',
    category: 'Hospital Swasta',
    distanceFromKokLanas: 27.5,
    coords: [6.1280, 102.2415],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'h_raub',
    name: 'Hospital Raub',
    shortName: 'Hospital Raub',
    category: 'Hospital Daerah Pahang',
    distanceFromKokLanas: 365.0,
    coords: [3.7915, 101.8590],
    estDurationMin: 330,
    state: 'Pahang'
  },
  {
    id: 'h_kuala_lipis',
    name: 'Hospital Kuala Lipis',
    shortName: 'Hospital Kuala Lipis',
    category: 'Hospital Daerah Berpakar Pahang',
    distanceFromKokLanas: 315.0,
    coords: [4.1855, 102.0490],
    estDurationMin: 285,
    state: 'Pahang'
  },
  {
    id: 'htaa_kuantan',
    name: 'Hospital Tengku Ampuan Afzan (HTAA), Kuantan',
    shortName: 'HTAA Kuantan',
    category: 'Hospital Tertier Negeri Pahang',
    distanceFromKokLanas: 340.0,
    coords: [3.8168, 103.3255],
    estDurationMin: 310,
    state: 'Pahang'
  }
];

export const TRIP_TYPES = [
  {
    id: 'emergency',
    name: 'Kecemasan Standard (Emergency)',
    baseFare: 250.00,
    description: 'Kes kecemasan umum, kemalangan, serangan akut, trauma ringan/sederhana',
    badge: 'Code Yellow / Red',
    color: '#EF4444'
  },
  {
    id: 'non_emergency',
    name: 'Bukan Kecemasan (Non-Emergency)',
    baseFare: 250.00,
    description: 'Rujukan berjadual, pesakit discaj ke rumah, dialisis, temujanji hospital',
    badge: 'Code Green',
    color: '#10B981'
  },
  {
    id: 'emergency_inhouse',
    name: 'Kecemasan In-House (Emergency In House)',
    baseFare: 350.00,
    description: 'Stabilisasi segera dari fasiliti pesakit luar / rawatan intensif di AMC',
    badge: 'In-House Rapid',
    color: '#F59E0B'
  },
  {
    id: 'aed_critical',
    name: 'Kecemasan Kritikal + AED (Cardiac / Resuscitation)',
    baseFare: 500.00,
    description: 'Serangan jantung, henti nafas, pesakit kritikal memerlukan Defibrillator AED siap sedia',
    badge: 'Code Red Resus',
    color: '#DC2626'
  }
];

export const ASSISTANCE_PACKAGES = [
  {
    id: 'none',
    name: 'Tiada Pakej Tambahan (Krew EMT Standard Termasuk)',
    roleTitle: 'Pemandu Terlatih + Pembantu EMT',
    price: 0.00,
    description: 'Termasuk pemandu berpengalaman dan kru paramedik asas perkhidmatan ambulan AMC',
    skills: ['Bantuan CPR/BLS Asas', 'Stretcher Handling', 'Navigasi Kecemasan'],
    recommendedFor: 'Pesakit stabil, discaj hospital, pengangkutan rutin'
  },
  {
    id: 'ca',
    name: 'AMBULANS - PAKEJ C.A (Care / Clinical Assistant)',
    roleTitle: 'Pembantu Klinikal / Clinical Assistant',
    price: 100.00,
    description: 'Pembantu klinikal bertugas mengiringi pesakit, memantau keselesaan dan tanda vital asas',
    skills: ['Pemantauan Tekanan Darah', 'SPO2 Pulse Oximetry', 'Bantuan Oksigen'],
    recommendedFor: 'Pesakit warga emas, mobiliti terhad, perlukan sokongan berterusan'
  },
  {
    id: 'ma',
    name: 'AMBULANS - PAKEJ M.A (Medical Assistant / Penolong Pegawai Perubatan PPP)',
    roleTitle: 'Penolong Pegawai Perubatan (PPP)',
    price: 200.00,
    description: 'Paramedik berdaftar berpengalaman (PPP/AMO) untuk rawatan akut, prosedur IV & ubat transit',
    skills: ['Airway Management', 'IV Cannula & Infusi', 'Trauma Stabilization', 'ECG Monitoring'],
    recommendedFor: 'Kes semi-kritikal, trauma kemalangan, pesakit memerlukan oksigen tinggi / IV drip'
  },
  {
    id: 'dr',
    name: 'AMBULANS - PAKEJ DR (Pegawai Perubatan / Doctor Escort)',
    roleTitle: 'Doktor Perubatan Bertauliah (Medical Officer)',
    price: 400.00,
    description: 'Pegawai perubatan Al-Farhain mengiringi sepanjang perjalanan untuk intervensi dan preskripsi',
    skills: ['Resusitasi Lengkap (ACLS)', 'Intubasi & Ventilasi', 'Preskripsi Ubat Kecemasan', 'Keputusan Klinikal'],
    recommendedFor: 'Pesakit kritikal (ICU/CCU transfer), serangan jantung akut, bayi baru lahir berisiko'
  }
];

export const ADDITIONAL_EQUIPMENTS = [
  {
    id: 'oxygen_supply',
    name: 'Bekalan Tangki Oksigen (Oxygen Tank Supply)',
    category: 'Sokongan Pernafasan',
    price: 50.00,
    priceRange: 'RM30 - RM70',
    unit: 'Per Silinder / Trip',
    icon: '💨',
    defaultQty: 0,
    maxQty: 3,
    description: 'Silinder oksigen perubatan gred tinggi lengkap dengan regulator, flowmeter dan nasal prongs / high flow mask'
  },
  {
    id: 'med_kit',
    name: 'Kit Ubat & Pertolongan Cemas (Med Kit)',
    category: 'Ubatan & Konsumabel',
    price: 20.00,
    priceRange: 'RM20',
    unit: 'Per Set',
    icon: '🩹',
    defaultQty: 0,
    maxQty: 2,
    description: 'Pek lengkap pembalut steril, cecair antiseptik, swab alkohol, kapas, dan rawatan luka kecemasan'
  },
  {
    id: 'transport_incubator',
    name: 'Inkubator Pengangkutan Bayi (Transport Incubator)',
    category: 'Neonatal & Pediatrik',
    price: 250.00,
    priceRange: 'RM100 – RM500',
    unit: 'Per Unit / Trip',
    icon: '👶',
    defaultQty: 0,
    maxQty: 1,
    description: 'Unit inkubator mudah alih kawalan suhu dan oksigen khas untuk bayi pramatang atau baru lahir berisiko'
  },
  {
    id: 'infusion_pump_ventilator',
    name: 'Pam Infusi & Ventilator Mudah Alih (Infusion Pumps & Ventilator)',
    category: 'Peralatan Kritikal',
    price: 150.00,
    priceRange: 'RM70 – RM250',
    unit: 'Per Unit / Trip',
    icon: '🫁',
    defaultQty: 0,
    maxQty: 2,
    description: 'Alat bantuan pernafasan mekanikal automatik dan pam suntikan berketepatan tinggi untuk ubat berterusan'
  },
  {
    id: 'maternity_kit',
    name: 'Kit Bersalin Kecemasan (Obstetric / Maternity Kit)',
    category: 'Maternity',
    price: 80.00,
    priceRange: 'RM50 – RM120',
    unit: 'Per Set',
    icon: '🤰',
    defaultQty: 0,
    maxQty: 1,
    description: 'Peralatan steril pemotongan tali pusat, suction bulb bayi, kain pembalut pemanas, dan drapes steril'
  },
  {
    id: 'suction_unit',
    name: 'Mesin Sedut Kahak / Cecair (Portable Suction Unit)',
    category: 'Sokongan Pernafasan',
    price: 30.00,
    priceRange: 'RM30',
    unit: 'Per Unit / Trip',
    icon: '🧪',
    defaultQty: 0,
    maxQty: 1,
    description: 'Mesin sedutan elektrik mudah alih dengan suction catheter untuk membersihkan salur pernafasan pesakit'
  },
  {
    id: 'aed_unit',
    name: 'Unit AED Defibrillator Tambahan (Automated External Defibrillator)',
    category: 'Kardiak & Resusitasi',
    price: 500.00,
    priceRange: 'RM500',
    unit: 'Per Unit / Trip',
    icon: '⚡',
    defaultQty: 0,
    maxQty: 1,
    description: 'Alat renjatan jantung automatik dengan pad elektrod dewasa/pediatrik untuk kes serangan jantung akut'
  },
  {
    id: 'spine_board',
    name: 'Papan Tulang Belakang & Cervical Collar (Spinal Board Set)',
    category: 'Imobilisasi Trauma',
    price: 40.00,
    priceRange: 'RM40',
    unit: 'Per Set',
    icon: '🩼',
    defaultQty: 0,
    maxQty: 1,
    description: 'Papan imobilisasi tulang belakang lengkap dengan head immobilizer dan tali strapping keselamatan'
  },
  {
    id: 'iv_drip_set',
    name: 'Pek Infusi Cecair IV & Drip (Normal Saline / Hartmans)',
    category: 'Ubatan & Konsumabel',
    price: 25.00,
    priceRange: 'RM25',
    unit: 'Per Pek',
    icon: '💧',
    defaultQty: 0,
    maxQty: 4,
    description: 'Beg cecair IV 500ml steril, branula / cannula pelbagai saiz, tiub infusi titisan dan pelekat tegaderm'
  }
];

export const BASE_SETTINGS = {
  standardBaseKm: 25.0,
  basePriceNormal: 250.00,
  extraKmRateNormal: 3.00,
  extraKmRateDiesel: 4.50, // Sheet: "After Diesel Increse (Dummy) (RM0.50)" -> 3 * 1.5 = 4.50
  defaultLainLainCaj: 50.00
};

// Top 10 Verified FAQs from AMBULANS_FAQ_100
export const FAQ_DATABASE = [
  {
    q: 'Berapakah kos asas perkhidmatan ambulan Al-Farhain?',
    a: 'Kadar asas bagi perjalanan sehingga 25 KM pertama adalah RM 250.00 untuk perjalanan standard (Emergency mahupun Non-Emergency). Jika melebihi 25 KM, setiap KM tambahan dikenakan caj RM 3.00/KM (atau RM 4.50/KM jika kadar diesel meningkat).',
    category: 'Harga & Kiraan'
  },
  {
    q: 'Bagaimanakah kiraan jarak perjalanan dihitung?',
    a: 'Kiraan jarak diukur dari pusat operasi ambulan Al-Farhain (contohnya HQ Kok Lanas) terus ke lokasi destinasi (seperti HRPZ Kota Bharu yang berjarak 27.2 KM) mengikut laluan Google Maps terpantas.',
    category: 'Kiraan Jarak'
  },
  {
    q: 'Apakah beza Pakej M.A, Pakej C.A dan Pakej Doktor?',
    a: 'Krew asas EMT standard adalah percuma (RM 0). Tambahan Pakej C.A (+RM 100) membawa Pembantu Klinikal. Pakej M.A (+RM 200) membawa Penolong Pegawai Perubatan (PPP/Paramedik) berdaftar untuk kes perlukan IV/oksigen. Pakej Dr (+RM 400) mengiringi Doktor Perubatan Al-Farhain untuk kes kritikal ICU/resusitasi.',
    category: 'Bantuan Paramedik'
  },
  {
    q: 'Bolehkah saya menempah ambulan untuk pesakit keluar hospital (discaj)?',
    a: 'Boleh, sila pilih mod Bukan Kecemasan (Non-Emergency). Ambulan kami dilengkapi stretcher hidraulik empuk dan kelengkapan sokongan untuk keselesaan pesakit pulang ke kediaman.',
    category: 'Jenis Trip'
  },
  {
    q: 'Adakah bekalan oksigen disediakan dalam ambulan?',
    a: 'Ya, tangki oksigen perubatan gred tinggi sentiasa sedia ada di dalam ambulan Al-Farhain dan boleh ditambah dalam pesanan dengan caj berpatutan (RM 50) merangkumi topeng oksigen dan pemantauan aliran berterusan.',
    category: 'Peralatan'
  },
  {
    q: 'Berapa nombor hotline kecemasan ambulan Al-Farhain?',
    a: 'Hotline kecemasan 24 jam ambulan kami ialah 013-914 7606. Talian sentiasa aktif setiap masa untuk sebarang kecemasan di Kelantan mahupun cawangan Raub Pahang.',
    category: 'Hubungi'
  },
  {
    q: 'Apakah nombor plat kenderaan ambulan Al-Farhain?',
    a: 'Ambulan HQ Kok Lanas (Kelantan) menggunakan nombor plat VPQ 7606 (dipandu oleh Abe Di / Syalihan). Manakala ambulan Cawangan Raub (Pahang) menggunakan plat DFG 7606 (dipandu oleh Abe Din Estimos Sukrosa).',
    category: 'Operasi Armada'
  },
  {
    q: 'Bolehkah bayaran dibuat melalui pemindahan online (FPX) atau tunai?',
    a: 'Ya, kami menerima Bayaran Tunai kepada pemandu, Pemindahan DuitNow / FPX atas talian, serta Surat Jaminan (Guarantee Letter - GL) daripada panel atau agensi yang diluluskan.',
    category: 'Bayaran'
  }
];
