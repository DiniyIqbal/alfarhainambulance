// =========================================================================
// AL-FARHAIN MEDICAL CENTER (AMC) - VERIFIED LOCAL MEDICAL FACILITY DIRECTORY
// Master directory of verified hospitals, private clinics, health clinics,
// and dialysis centers with real coordinates, aliases, and ownership classification.
// =========================================================================

export const VERIFIED_FACILITIES = [
  // =======================================================================
  // 1. VERIFIED PRIVATE CLINICS (KLINIK SWASTA / GP / POLIKLINIK)
  // =======================================================================
  {
    id: 'fac_klinik_jega_kb',
    name: 'Klinik Jega',
    aliases: ['Klinik Dr Jega', 'Klinik Jega Kota Bharu', 'Poliklinik Jega', 'Dr Jega Clinic'],
    category: 'Klinik Swasta',
    address: '3585, Jalan Ismail, Bandar Kota Bharu, 15000 Kota Bharu, Kelantan',
    coords: [6.128789, 102.238062],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu masuk hadapan Jalan Ismail. Ruang letak ambulans di bahu jalan hadapan klinik.',
    operatingHours: 'Waktu Operasi Pesakit Luar'
  },
  {
    id: 'fac_klinik_hojaz_kl',
    name: 'Klinik Hijaz 24 Jam (Klinik Hojaz)',
    aliases: ['Klinik Hojaz', 'Klinik Hojaz Kok Lanas', 'Klinik Hijaz', 'Klinik Hijaz 24 Jam', 'Poliklinik Hijaz Kok Lanas'],
    category: 'Klinik Swasta',
    address: 'PT 2506 & PT 2507, Kampung Bukit China, Kok Lanas, 16450 Kota Bharu, Kelantan',
    coords: [5.9220, 102.2415],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu utama 24 Jam. Laluan kenderaan kecemasan di hadapan bangunan.',
    operatingHours: '24 Jam'
  },
  {
    id: 'fac_klinik_insaf_kb',
    name: 'Klinik Insaf',
    aliases: ['Klinik Insaf Kota Bharu', 'Poliklinik Insaf', 'Klinik Dr Insaf', 'Insaf Clinic'],
    category: 'Klinik Swasta',
    address: 'PT 1045A, Kampung Tanjong Mas, Jalan Rambutan Rendang, 15400 Kota Bharu, Kelantan',
    coords: [6.137149, 102.265402],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu masuk utama premis Kampung Tanjong Mas. Parkir terus di lobi hadapan.',
    operatingHours: 'Pesakit Luar & Rawatan Asas'
  },
  {
    id: 'fac_poliklinik_alfarhain_kl',
    name: 'Poliklinik Al-Farhain 24 Jam (HQ Kok Lanas)',
    aliases: ['AMC Kok Lanas', 'Pusat Rawatan Al-Farhain', 'Al Farhain Medical Center HQ', 'Klinik Al Farhain Kok Lanas'],
    category: 'Klinik Swasta',
    address: 'Pt 5075-5077, Kompleks Perniagaan Saidina Ali Ketereh, 16450 Kota Bharu, Kelantan',
    coords: [5.9176965, 102.2446687],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Bay Ambulans Utama AMC. Laluan khas kecemasan 24 jam.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_poliklinik_alfarhain_tunjung',
    name: 'Poliklinik Al-Farhain (Cawangan Bandar Baru Tunjung)',
    aliases: ['AMC Tunjung', 'Klinik Al-Farhain Tunjung', 'Poliklinik Al Farhain Kota Bharu Tunjung'],
    category: 'Klinik Swasta',
    address: 'Bandar Baru Tunjung, 15150 Kota Bharu, Kelantan',
    coords: [6.0720, 102.2350],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Lobi hadapan bangunan cawangan Tunjung.',
    operatingHours: 'Harian'
  },
  {
    id: 'fac_poliklinik_alfarhain_kubangkerian',
    name: 'Poliklinik Al-Farhain (Cawangan Kubang Kerian)',
    aliases: ['AMC Kubang Kerian', 'Klinik Al-Farhain Kubang Kerian'],
    category: 'Klinik Swasta',
    address: 'Jalan Pasir Puteh, Bandar Kubang Kerian, 16150 Kota Bharu, Kelantan',
    coords: [6.0965, 102.2815],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Lobi hadapan bersebelahan farmasi.',
    operatingHours: 'Harian'
  },
  {
    id: 'fac_poliklinik_alfarhain_machang',
    name: 'Poliklinik Al-Farhain (Cawangan Machang)',
    aliases: ['AMC Machang', 'Klinik Al-Farhain Machang'],
    category: 'Klinik Swasta',
    address: 'Pusat Perniagaan Bandar Machang, 18500 Machang, Kelantan',
    coords: [5.7660, 102.2190],
    state: 'Kelantan',
    district: 'Machang',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu masuk hadapan premis.',
    operatingHours: 'Harian'
  },
  {
    id: 'fac_poliklinik_alfarhain_jeli',
    name: 'Poliklinik Al-Farhain (Cawangan Jeli)',
    aliases: ['AMC Jeli', 'Klinik Al-Farhain Jeli'],
    category: 'Klinik Swasta',
    address: 'Bandar Baru Jeli, 17600 Jeli, Kelantan',
    coords: [5.6980, 101.8430],
    state: 'Kelantan',
    district: 'Jeli',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu utama hadapan cawangan.',
    operatingHours: 'Harian'
  },
  {
    id: 'fac_poliklinik_alfarhain_raub',
    name: 'Al-Farhain Medical Center (Cawangan Raub, Pahang)',
    aliases: ['AMC Raub', 'Klinik Al-Farhain Raub', 'Poliklinik Al Farhain Raub Pahang'],
    category: 'Klinik Swasta',
    address: 'Pusat Perniagaan Bandar Raub, 27600 Raub, Pahang',
    coords: [3.7899, 101.8570],
    state: 'Pahang',
    district: 'Raub',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Lobi pangkalan ambulans cawangan Raub.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_klinik_primer_cherang',
    name: 'Klinik Primer 24 Jam (Cherang, Kota Bharu)',
    aliases: ['Klinik Primer Cherang', 'Primer Cherang', 'Poliklinik Primer Cherang'],
    category: 'Klinik Swasta',
    address: 'Jalan Abdul Kadir Adabi, Cherang, 15200 Kota Bharu, Kelantan',
    coords: [6.1150, 102.2610],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu masuk hadapan premis 24 Jam.',
    operatingHours: '24 Jam'
  },
  {
    id: 'fac_klinik_primer_kubangkerian',
    name: 'Klinik Primer 24 Jam (Kubang Kerian)',
    aliases: ['Klinik Primer Kubang Kerian', 'Primer Kubang Kerian'],
    category: 'Klinik Swasta',
    address: 'Bandar Baru Kubang Kerian, 16150 Kota Bharu, Kelantan',
    coords: [6.0950, 102.2780],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu masuk utama berdekatan lampu isyarat Kubang Kerian.',
    operatingHours: '24 Jam'
  },
  {
    id: 'fac_klinik_primer_wakafcheyeh',
    name: 'Klinik Primer 24 Jam (Wakaf Che Yeh)',
    aliases: ['Klinik Primer Wakaf Che Yeh', 'Primer Wakaf Che Yeh'],
    category: 'Klinik Swasta',
    address: 'Pusat Komersial Wakaf Che Yeh, 15150 Kota Bharu, Kelantan',
    coords: [6.0790, 102.2410],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Hadapan deretan kedai Wakaf Che Yeh.',
    operatingHours: '24 Jam'
  },
  {
    id: 'fac_klinik_primer_pengkalanchepa',
    name: 'Klinik Primer 24 Jam (Pengkalan Chepa)',
    aliases: ['Klinik Primer Pengkalan Chepa', 'Primer Pengkalan Chepa'],
    category: 'Klinik Swasta',
    address: 'Kawasan Perindustrian Pengkalan Chepa, 16100 Kota Bharu, Kelantan',
    coords: [6.1680, 102.2890],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu utama bersebelahan bank Pengkalan Chepa.',
    operatingHours: '24 Jam'
  },

  // =======================================================================
  // 2. VERIFIED GOVERNMENT HOSPITALS (HOSPITAL KERAJAAN / KKM)
  // =======================================================================
  {
    id: 'fac_hrpz2',
    name: 'Hospital Raja Perempuan Zainab II (HRPZ II)',
    aliases: ['HRPZ', 'HRPZ II', 'Hospital Besar Kota Bharu', 'General Hospital Kota Bharu', 'Hospital Kerajaan Kota Bharu'],
    category: 'Hospital Kerajaan',
    address: 'Hospital Raja Perempuan Zainab II, 15586 Kota Bharu, Kelantan',
    coords: [6.1256, 102.2482],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Zon Kecemasan & Trauma (A&E) - Laluan Ambulans Khas di Jalan Hospital.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_husm',
    name: 'Hospital Universiti Sains Malaysia (Hospital USM)',
    aliases: ['HUSM', 'Hospital USM', 'HUSM Kubang Kerian', 'Hospital Universiti Sains Malaysia Kubang Kerian'],
    category: 'Hospital Kerajaan',
    address: 'Kampus Kesihatan USM, 16150 Kubang Kerian, Kota Bharu, Kelantan',
    coords: [6.1001, 102.2828],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Jabatan Perubatan Kecemasan & Trauma HUSM (Pintu Masuk Ambulans A&E).',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_machang',
    name: 'Hospital Machang',
    aliases: ['Hospital Daerah Machang', 'Hospital Kerajaan Machang'],
    category: 'Hospital Kerajaan',
    address: 'Jalan Pasir Puteh, 18500 Machang, Kelantan',
    coords: [5.7681, 102.2223],
    state: 'Kelantan',
    district: 'Machang',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Unit Kecemasan & Kemalangan Hospital Machang.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_kualakrai',
    name: 'Hospital Sultan Ismail Petra (Hospital Kuala Krai)',
    aliases: ['Hospital Kuala Krai', 'HSIP', 'Hospital Sultan Ismail Petra Kuala Krai'],
    category: 'Hospital Kerajaan',
    address: 'Bandar Baru Pahi, 18000 Kuala Krai, Kelantan',
    coords: [5.5050, 102.2030],
    state: 'Kelantan',
    district: 'Kuala Krai',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Ramp Kecemasan Utama Hospital Sultan Ismail Petra Pahi.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_tanahmerah',
    name: 'Hospital Tanah Merah',
    aliases: ['Hospital Daerah Tanah Merah', 'Hospital Kerajaan Tanah Merah'],
    category: 'Hospital Kerajaan',
    address: 'Pekan Tanah Merah, 17500 Tanah Merah, Kelantan',
    coords: [5.8092, 102.1481],
    state: 'Kelantan',
    district: 'Tanah Merah',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Unit Kemalangan & Kecemasan Jalan Pasir Mas - Tanah Merah.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_pasirmas',
    name: 'Hospital Pasir Mas',
    aliases: ['Hospital Daerah Pasir Mas', 'Hospital Kerajaan Pasir Mas'],
    category: 'Hospital Kerajaan',
    address: 'Bandar Pasir Mas, 17000 Pasir Mas, Kelantan',
    coords: [6.0441, 102.1419],
    state: 'Kelantan',
    district: 'Pasir Mas',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu Masuk Jabatan Kecemasan Hospital Pasir Mas.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_tumpat',
    name: 'Hospital Tumpat',
    aliases: ['Hospital Daerah Tumpat', 'Hospital Kerajaan Tumpat'],
    category: 'Hospital Kerajaan',
    address: 'Jalan Hospital, 16200 Tumpat, Kelantan',
    coords: [6.2023, 102.1691],
    state: 'Kelantan',
    district: 'Tumpat',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Unit Kecemasan Hospital Tumpat.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_tengkuanis',
    name: 'Hospital Tengku Anis (Pasir Puteh)',
    aliases: ['Hospital Pasir Puteh', 'Hospital Tengku Anis Pasir Puteh'],
    category: 'Hospital Kerajaan',
    address: '16800 Pasir Puteh, Kelantan',
    coords: [5.8361, 102.4042],
    state: 'Kelantan',
    district: 'Pasir Puteh',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Unit Kecemasan Hospital Tengku Anis.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_jeli',
    name: 'Hospital Jeli',
    aliases: ['Hospital Daerah Jeli', 'Hospital Kerajaan Jeli'],
    category: 'Hospital Kerajaan',
    address: '17600 Jeli, Kelantan',
    coords: [5.6985, 101.8442],
    state: 'Kelantan',
    district: 'Jeli',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Unit Kecemasan Hospital Jeli.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_guamusang',
    name: 'Hospital Gua Musang',
    aliases: ['Hospital Daerah Gua Musang', 'Hospital Kerajaan Gua Musang'],
    category: 'Hospital Kerajaan',
    address: 'Bandar Baru Gua Musang, 18300 Gua Musang, Kelantan',
    coords: [4.8785, 101.9660],
    state: 'Kelantan',
    district: 'Gua Musang',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Zon Kecemasan Hospital Gua Musang.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_htaa_kuantan',
    name: 'Hospital Tengku Ampuan Afzan (HTAA Kuantan)',
    aliases: ['HTAA', 'Hospital Kuantan', 'Hospital Besar Kuantan', 'Hospital Tengku Ampuan Afzan'],
    category: 'Hospital Kerajaan',
    address: 'Jalan Tanah Putih, 25100 Kuantan, Pahang',
    coords: [3.8055, 103.3240],
    state: 'Pahang',
    district: 'Kuantan',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Jabatan Kecemasan & Trauma HTAA Kuantan.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_raub',
    name: 'Hospital Raub',
    aliases: ['Hospital Daerah Raub', 'Hospital Kerajaan Raub'],
    category: 'Hospital Kerajaan',
    address: 'Jalan Hospital, 27600 Raub, Pahang',
    coords: [3.7915, 101.8590],
    state: 'Pahang',
    district: 'Raub',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Unit Kemalangan & Kecemasan Hospital Raub.',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_hosp_hkl',
    name: 'Hospital Kuala Lumpur (HKL)',
    aliases: ['HKL', 'Hospital Besar Kuala Lumpur', 'General Hospital KL'],
    category: 'Hospital Kerajaan',
    address: 'Jalan Pahang, 50586 Kuala Lumpur',
    coords: [3.1717, 101.7020],
    state: 'Kuala Lumpur',
    district: 'Kuala Lumpur',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu Masuk Jabatan Kecemasan HKL Jalan Pahang.',
    operatingHours: '24 Jam Kecemasan'
  },

  // =======================================================================
  // 3. VERIFIED PRIVATE HOSPITALS (HOSPITAL SWASTA / SPECIALIST)
  // =======================================================================
  {
    id: 'fac_kpj_perdana',
    name: 'KPJ Perdana Specialist Hospital',
    aliases: ['KPJ Perdana', 'Hospital Pakar Perdana', 'Perdana Specialist Hospital Kota Bharu', 'KPJ Kota Bharu'],
    category: 'Hospital Swasta',
    address: 'PT 37, Seksyen 14, Jalan Bayam, 15200 Kota Bharu, Kelantan',
    coords: [6.1215, 102.2530],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Unit Kemalangan & Kecemasan 24 Jam KPJ Perdana (Ramp Laluan Ambulans).',
    operatingHours: '24 Jam Kecemasan'
  },
  {
    id: 'fac_kbmc',
    name: 'Kota Bharu Medical Centre (KBMC)',
    aliases: ['KBMC', 'Kota Bharu Medical Centre', 'Pusat Perubatan Kota Bharu'],
    category: 'Hospital Swasta',
    address: 'PT 179-184, Jalan Sultan Yahya Petra, 15200 Kota Bharu, Kelantan',
    coords: [6.1235, 102.2615],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Lobi Kecemasan Utama KBMC Jalan Sultan Yahya Petra.',
    operatingHours: '24 Jam'
  },
  {
    id: 'fac_kpj_pahang',
    name: 'KPJ Pahang Specialist Hospital',
    aliases: ['KPJ Pahang', 'Hospital Pakar KPJ Pahang Kuantan'],
    category: 'Hospital Swasta',
    address: 'Jalan Tanjung Lumpur, 26060 Kuantan, Pahang',
    coords: [3.7910, 103.3325],
    state: 'Pahang',
    district: 'Kuantan',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Emergency Entrance Laluan Khas Ambulans KPJ Pahang.',
    operatingHours: '24 Jam'
  },
  {
    id: 'fac_kmc_kuantan',
    name: 'Kuantan Medical Centre (KMC)',
    aliases: ['KMC Kuantan', 'Kuantan Medical Centre'],
    category: 'Hospital Swasta',
    address: 'Bandar Indera Mahkota, 25200 Kuantan, Pahang',
    coords: [3.8290, 103.2980],
    state: 'Pahang',
    district: 'Kuantan',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Lobi Utama / Jabatan Kecemasan KMC Indera Mahkota.',
    operatingHours: '24 Jam'
  },

  // =======================================================================
  // 4. VERIFIED KLINIK KESIHATAN (KKM PUBLIC HEALTH CLINICS)
  // =======================================================================
  {
    id: 'fac_kk_ketereh',
    name: 'Klinik Kesihatan Ketereh',
    aliases: ['KK Ketereh', 'Klinik Kesihatan Ketereh Kota Bharu'],
    category: 'Klinik Kesihatan',
    address: 'Pekan Ketereh, 16450 Kota Bharu, Kelantan',
    coords: [5.9580, 102.2490],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu Masuk Unit Rawatan Kecemasan & Ibu Mengandung KK Ketereh.',
    operatingHours: 'Waktu Pejabat & Panggilan'
  },
  {
    id: 'fac_kk_bandarkb',
    name: 'Klinik Kesihatan Bandar Kota Bharu',
    aliases: ['KK Bandar Kota Bharu', 'Klinik Kesihatan Kota Bharu'],
    category: 'Klinik Kesihatan',
    address: 'Jalan Pengkalan Chepa, 15400 Kota Bharu, Kelantan',
    coords: [6.1340, 102.2470],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Zon Kecemasan & Triaj KK Bandar Kota Bharu.',
    operatingHours: 'Waktu Pejabat'
  },
  {
    id: 'fac_kk_kubangkerian',
    name: 'Klinik Kesihatan Kubang Kerian',
    aliases: ['KK Kubang Kerian'],
    category: 'Klinik Kesihatan',
    address: 'Kenali, 16150 Kubang Kerian, Kelantan',
    coords: [6.0880, 102.2790],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Pintu masuk hadapan KK Kubang Kerian.',
    operatingHours: 'Waktu Pejabat'
  },

  // =======================================================================
  // 5. VERIFIED DIALYSIS CENTERS (PUSAT HEMODIALISIS)
  // =======================================================================
  {
    id: 'fac_dialisis_amc_kl',
    name: 'Pusat Rawatan Dialisis AMC (Kok Lanas)',
    aliases: ['Dialisis Al-Farhain', 'Pusat Dialisis Kok Lanas'],
    category: 'Pusat Dialisis',
    address: 'Kompleks Saidina Ali, 16450 Kok Lanas, Kelantan',
    coords: [5.9178, 102.2445],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Ramp kerusi roda dan stretcher Dialisis AMC.',
    operatingHours: 'Sesi Berjadual'
  },
  {
    id: 'fac_dialisis_nkf_kb',
    name: 'Pusat Dialisis NKF Kota Bharu',
    aliases: ['NKF Kota Bharu', 'National Kidney Foundation Kota Bharu', 'Pusat Hemodialisis NKF'],
    category: 'Pusat Dialisis',
    address: 'Jalan Sultanah Zainab, 15050 Kota Bharu, Kelantan',
    coords: [6.1280, 102.2410],
    state: 'Kelantan',
    district: 'Kota Bharu',
    isVerified: true,
    active: true,
    verifiedAt: '2026-11-12T00:00:00Z',
    entranceNotes: 'Laluan turun naik pesakit dialisis.',
    operatingHours: 'Sesi Berjadual'
  }
];

/**
 * Normalizes a string for robust matching.
 */
export function normalizeSearchTerm(str) {
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Calculates straight-line distance in km between two [lat, lng] coordinates.
 */
export function calculateDirectDistanceKm(coord1, coord2) {
  if (!coord1 || !coord2 || coord1.length < 2 || coord2.length < 2) return null;
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Searches the verified facilities directory using multi-alias matching,
 * category filtering, and proximity calculation.
 * 
 * @param {string} query - User search term
 * @param {Object} options
 * @param {string} [options.category='all'] - 'all', 'Rumah / Kediaman', 'Hospital Kerajaan', 'Hospital Swasta', 'Klinik Swasta', etc.
 * @param {Array<number>} [options.refCoords] - Reference [lat, lng] to calculate straight-line distance
 * @param {number} [options.limit=15] - Maximum matches to return
 * @returns {Array<Object>}
 */
export function searchVerifiedFacilities(query = '', { category = 'all', refCoords = null, limit = 15 } = {}) {
  const normQ = normalizeSearchTerm(query);
  const words = normQ.split(' ').filter(w => w.length > 0);

  // Normalize category mapping
  const categoryFilterMap = {
    'Hospital Kerajaan': ['Hospital Kerajaan'],
    'Hospital Swasta': ['Hospital Swasta'],
    'Klinik Swasta': ['Klinik Swasta', 'Klinik Kesihatan'],
    'Klinik Kesihatan': ['Klinik Kesihatan'],
    'Pusat Dialisis': ['Pusat Dialisis'],
    'Rumah / Kediaman': ['Rumah / Kediaman']
  };

  const allowedCategories = categoryFilterMap[category] || null;

  const matches = [];

  for (const facility of VERIFIED_FACILITIES) {
    if (!facility.active) continue;

    // Apply category filter if not 'all' or 'Lain-lain'
    if (allowedCategories && !allowedCategories.includes(facility.category)) {
      continue;
    }

    let score = 0;
    if (words.length === 0) {
      // Empty query: list facilities matching category
      score = 1;
    } else {
      const normName = normalizeSearchTerm(facility.name);
      const normAddr = normalizeSearchTerm(facility.address);
      const normDistrict = normalizeSearchTerm(facility.district);
      const normState = normalizeSearchTerm(facility.state);
      const allAliases = (facility.aliases || []).map(a => normalizeSearchTerm(a));

      // Exact name or alias match
      if (normName === normQ || allAliases.includes(normQ)) {
        score += 100;
      } else if (normName.startsWith(normQ)) {
        score += 50;
      } else {
        // Check word coverage
        let matchedWords = 0;
        for (const word of words) {
          if (normName.includes(word)) {
            matchedWords++;
            score += 20;
          } else if (allAliases.some(a => a.includes(word))) {
            matchedWords++;
            score += 15;
          } else if (normAddr.includes(word) || normDistrict.includes(word) || normState.includes(word)) {
            matchedWords++;
            score += 10;
          }
        }

        // Only include if at least one meaningful word matched
        if (matchedWords === 0) continue;
      }
    }

    const distKm = refCoords ? calculateDirectDistanceKm(refCoords, facility.coords) : null;

    matches.push({
      ...facility,
      score,
      directDistanceKm: distKm,
      isVerified: true,
      source: 'verified_directory',
      sourceLabel: '✓ Disahkan AMC'
    });
  }

  // Sort by score descending, then by distance ascending
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.directDistanceKm !== null && b.directDistanceKm !== null) {
      return a.directDistanceKm - b.directDistanceKm;
    }
    return a.name.localeCompare(b.name);
  });

  return matches.slice(0, limit);
}

/**
 * Finds a verified facility by placeId, exact name, or near coordinates.
 */
export function findVerifiedFacilityMatch({ name = '', address = '', coords = null, placeId = '' } = {}) {
  if (placeId) {
    const byId = VERIFIED_FACILITIES.find(f => f.placeId === placeId);
    if (byId) return byId;
  }

  const normName = normalizeSearchTerm(name);
  if (normName) {
    const byName = VERIFIED_FACILITIES.find(f => {
      const fName = normalizeSearchTerm(f.name);
      if (fName === normName || fName.includes(normName) || normName.includes(fName)) return true;
      return (f.aliases || []).some(a => {
        const normA = normalizeSearchTerm(a);
        return normA === normName || normA.includes(normName);
      });
    });
    if (byName) return byName;
  }

  if (coords && coords.length >= 2) {
    // Check if within 150 meters (0.15 km) of a verified facility
    const byCoord = VERIFIED_FACILITIES.find(f => {
      const d = calculateDirectDistanceKm(coords, f.coords);
      return d !== null && d <= 0.15;
    });
    if (byCoord) return byCoord;
  }

  return null;
}

