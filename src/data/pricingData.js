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

// Preset Customer Pickup Locations (Residential / Towns)
export const PRESET_PICKUP_LOCATIONS = {
  kok_lanas: [
    {
      id: 'kediaman_kb',
      name: 'Kediaman Pesakit Kota Bharu (Pusat Bandar)',
      address: 'Bandar Kota Bharu, 15000 Kota Bharu, Kelantan',
      coords: [6.1248, 102.2544],
      area: 'Kota Bharu'
    },
    {
      id: 'kediaman_koklanas',
      name: 'Kediaman Pesakit Sekitar Kok Lanas / Ketereh',
      address: 'Kok Lanas / Ketereh, 16450 Kota Bharu, Kelantan',
      coords: [5.9177, 102.2447],
      area: 'Kok Lanas'
    },
    {
      id: 'kediaman_kubangkerian',
      name: 'Kediaman Pesakit Kubang Kerian / Lundang',
      address: 'Kubang Kerian, 16150 Kota Bharu, Kelantan',
      coords: [6.0960, 102.2780],
      area: 'Kubang Kerian'
    },
    {
      id: 'kediaman_pasirmas',
      name: 'Kediaman Pesakit Pasir Mas / Salor',
      address: 'Pasir Mas, 17000 Pasir Mas, Kelantan',
      coords: [6.0425, 102.1432],
      area: 'Pasir Mas'
    },
    {
      id: 'kediaman_machang',
      name: 'Kediaman Pesakit Machang',
      address: 'Bandar Machang, 18500 Machang, Kelantan',
      coords: [5.7661, 102.2163],
      area: 'Machang'
    },
    {
      id: 'kediaman_tanahmerah',
      name: 'Kediaman Pesakit Tanah Merah',
      address: 'Tanah Merah, 17500 Tanah Merah, Kelantan',
      coords: [5.8085, 102.1472],
      area: 'Tanah Merah'
    },
    {
      id: 'kediaman_tumpat',
      name: 'Kediaman Pesakit Wakaf Bharu / Tumpat',
      address: 'Wakaf Bharu, 16200 Tumpat, Kelantan',
      coords: [6.1983, 102.1673],
      area: 'Tumpat'
    },
    {
      id: 'kediaman_kualakrai',
      name: 'Kediaman Pesakit Kuala Krai',
      address: 'Kuala Krai, 18000 Kuala Krai, Kelantan',
      coords: [5.5317, 102.2023],
      area: 'Kuala Krai'
    },
    {
      id: 'kediaman_bachok',
      name: 'Kediaman Pesakit Bachok / Beris Kubor',
      address: 'Bachok, 16300 Bachok, Kelantan',
      coords: [6.0667, 102.4000],
      area: 'Bachok'
    },
    {
      id: 'kediaman_pasirputeh',
      name: 'Kediaman Pesakit Pasir Puteh',
      address: 'Pasir Puteh, 16800 Pasir Puteh, Kelantan',
      coords: [5.8361, 102.4042],
      area: 'Pasir Puteh'
    },
    {
      id: 'kediaman_pengkalanchepa',
      name: 'Kediaman Pesakit Pengkalan Chepa / Panji',
      address: 'Pengkalan Chepa, 16100 Kota Bharu, Kelantan',
      coords: [6.1667, 102.2833],
      area: 'Pengkalan Chepa'
    },
    {
      id: 'kediaman_wakafcheyeh',
      name: 'Kediaman Pesakit Wakaf Che Yeh / Kadok / Pendek',
      address: 'Wakaf Che Yeh / Kadok, 15150 Kota Bharu, Kelantan',
      coords: [6.0520, 102.2350],
      area: 'Wakaf Che Yeh'
    },
    {
      id: 'kediaman_melor',
      name: 'Kediaman Pesakit Melor / Peringat / Padang Kala',
      address: 'Melor / Peringat, 16400 Kota Bharu, Kelantan',
      coords: [5.9810, 102.2880],
      area: 'Melor'
    },
    {
      id: 'kediaman_salor',
      name: 'Kediaman Pesakit Salor / Pasir Hor',
      address: 'Salor, 15100 Kota Bharu, Kelantan',
      coords: [6.0650, 102.2150],
      area: 'Salor'
    },
    {
      id: 'kediaman_jeli',
      name: 'Kediaman Pesakit Jeli / Bukit Bunga',
      address: 'Bandar Jeli, 17600 Jeli, Kelantan',
      coords: [5.6987, 101.8427],
      area: 'Jeli'
    }
  ],
  raub: [
    {
      id: 'kediaman_raub',
      name: 'Kediaman Pesakit Sekitar Bandar Raub',
      address: 'Bandar Raub, 27600 Raub, Pahang Darul Makmur',
      coords: [3.7899, 101.8570],
      area: 'Bandar Raub'
    },
    {
      id: 'kediaman_raubjaya',
      name: 'Kediaman Pesakit Taman Raub Jaya / Sempalit',
      address: 'Taman Raub Jaya, 27600 Raub, Pahang',
      coords: [3.7980, 101.8700],
      area: 'Raub Jaya'
    },
    {
      id: 'kediaman_cheroh',
      name: 'Kediaman Pesakit Cheroh / Sungai Ruan',
      address: 'Cheroh / Sungai Ruan, 27600 Raub, Pahang',
      coords: [3.8900, 101.8700],
      area: 'Cheroh'
    },
    {
      id: 'kediaman_tras',
      name: 'Kediaman Pesakit Tras / Batu Talam',
      address: 'Tras / Batu Talam, Raub, Pahang',
      coords: [3.7400, 101.8300],
      area: 'Tras'
    },
    {
      id: 'kediaman_dong',
      name: 'Kediaman Pesakit Dong / Bukit Fraser',
      address: 'Dong / Bukit Fraser, 27600 Raub, Pahang',
      coords: [3.8500, 101.8800],
      area: 'Dong'
    },
    {
      id: 'kediaman_bentong',
      name: 'Kediaman Pesakit Daerah Bentong / Karak',
      address: 'Bentong, 28700 Bentong, Pahang',
      coords: [3.5222, 101.9083],
      area: 'Bentong'
    },
    {
      id: 'kediaman_kualalipis',
      name: 'Kediaman Pesakit Daerah Kuala Lipis',
      address: 'Kuala Lipis, 27200 Kuala Lipis, Pahang',
      coords: [4.1843, 102.0468],
      area: 'Kuala Lipis'
    },
    {
      id: 'kediaman_cameron',
      name: 'Kediaman Pesakit Cameron Highlands (Ringlet/Tanah Rata)',
      address: 'Cameron Highlands, 39000 Tanah Rata, Pahang',
      coords: [4.4705, 101.3785],
      area: 'Cameron'
    },
    {
      id: 'kediaman_temerloh',
      name: 'Kediaman Pesakit Mentakab / Temerloh',
      address: 'Bandar Mentakab / Temerloh, 28400 Mentakab, Pahang',
      coords: [3.4800, 102.3500],
      area: 'Temerloh'
    }
  ]
};

export const PRESET_DESTINATIONS = [
  // ==========================================
  // 1. RANGKAIAN POLIKLINIK AL-FARHAIN (AMC CLINICS)
  // ==========================================
  {
    id: 'poliklinik_alfarhain_kl',
    name: 'Poliklinik Al-Farhain 24 Jam (HQ Kok Lanas)',
    shortName: 'Poliklinik Al-Farhain Kok Lanas',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 0.1,
    coords: [5.9177, 102.2447],
    estDurationMin: 1,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_alfarhain_raub',
    name: 'Poliklinik Al-Farhain (Cawangan Bandar Raub)',
    shortName: 'Poliklinik Al-Farhain Raub',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 365.0,
    coords: [3.7899, 101.8570],
    estDurationMin: 2,
    state: 'Pahang'
  },
  {
    id: 'poliklinik_alfarhain_tunjung',
    name: 'Poliklinik Al-Farhain (Cawangan Bandar Baru Tunjung, Kota Bharu)',
    shortName: 'Poliklinik Al-Farhain Tunjung',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 20.4,
    coords: [6.0720, 102.2350],
    estDurationMin: 22,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_alfarhain_kubangkerian',
    name: 'Poliklinik Al-Farhain (Cawangan Kubang Kerian)',
    shortName: 'Poliklinik Al-Farhain Kubang Kerian',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 24.8,
    coords: [6.0965, 102.2815],
    estDurationMin: 28,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_alfarhain_machang',
    name: 'Poliklinik Al-Farhain (Cawangan Machang)',
    shortName: 'Poliklinik Al-Farhain Machang',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 17.5,
    coords: [5.7660, 102.2190],
    estDurationMin: 20,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_alfarhain_jeli',
    name: 'Poliklinik Al-Farhain (Cawangan Jeli)',
    shortName: 'Poliklinik Al-Farhain Jeli',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 84.5,
    coords: [5.6980, 101.8430],
    estDurationMin: 85,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_alfarhain_kualakrai',
    name: 'Poliklinik Al-Farhain (Cawangan Kuala Krai)',
    shortName: 'Poliklinik Al-Farhain Kuala Krai',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 44.0,
    coords: [5.5340, 102.2030],
    estDurationMin: 45,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_alfarhain_tanahmerah',
    name: 'Poliklinik Al-Farhain (Cawangan Tanah Merah)',
    shortName: 'Poliklinik Al-Farhain Tanah Merah',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 30.5,
    coords: [5.8090, 102.1460],
    estDurationMin: 36,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_alfarhain_pasirputeh',
    name: 'Poliklinik Al-Farhain (Cawangan Pasir Puteh)',
    shortName: 'Poliklinik Al-Farhain Pasir Puteh',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 32.0,
    coords: [5.8360, 102.4040],
    estDurationMin: 38,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_alfarhain_wakafbharu',
    name: 'Poliklinik Al-Farhain (Cawangan Wakaf Bharu / Tumpat)',
    shortName: 'Poliklinik Al-Farhain Wakaf Bharu',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 30.0,
    coords: [6.1205, 102.2055],
    estDurationMin: 34,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_alfarhain_bentong',
    name: 'Poliklinik Al-Farhain (Cawangan Bentong)',
    shortName: 'Poliklinik Al-Farhain Bentong',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 392.0,
    coords: [3.5210, 101.9065],
    estDurationMin: 42,
    state: 'Pahang'
  },
  {
    id: 'poliklinik_alfarhain_lipis',
    name: 'Poliklinik Al-Farhain (Cawangan Kuala Lipis)',
    shortName: 'Poliklinik Al-Farhain Lipis',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 318.0,
    coords: [4.1840, 102.0480],
    estDurationMin: 46,
    state: 'Pahang'
  },

  // ==========================================
  // 2. KELANTAN - KLINIK SWASTA & POLIKLINIK 24 JAM
  // ==========================================
  {
    id: 'klinik_hijaz_kl',
    name: 'Klinik Hijaz 24 Jam (Kok Lanas, Kota Bharu)',
    shortName: 'Klinik Hijaz Kok Lanas',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 1.2,
    coords: [5.9220, 102.2415],
    estDurationMin: 3,
    state: 'Kelantan'
  },
  {
    id: 'klinik_jega_kb',
    name: 'Klinik Jega, Bandar Kota Bharu',
    shortName: 'Klinik Jega Kota Bharu',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 26.8,
    coords: [6.1268, 102.2395],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'klinik_primer_cherang',
    name: 'Klinik Primer 24 Jam (Cherang, Kota Bharu)',
    shortName: 'Klinik Primer Cherang',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 27.0,
    coords: [6.1150, 102.2610],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'klinik_primer_kubangkerian',
    name: 'Klinik Primer 24 Jam (Kubang Kerian)',
    shortName: 'Klinik Primer Kubang Kerian',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 25.2,
    coords: [6.0950, 102.2780],
    estDurationMin: 30,
    state: 'Kelantan'
  },
  {
    id: 'klinik_primer_wakafcheyeh',
    name: 'Klinik Primer 24 Jam (Wakaf Che Yeh)',
    shortName: 'Klinik Primer Wakaf Che Yeh',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 19.5,
    coords: [6.0790, 102.2410],
    estDurationMin: 24,
    state: 'Kelantan'
  },
  {
    id: 'klinik_primer_pengkalanchepa',
    name: 'Klinik Primer 24 Jam (Pengkalan Chepa)',
    shortName: 'Klinik Primer Pengkalan Chepa',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 31.5,
    coords: [6.1680, 102.2890],
    estDurationMin: 36,
    state: 'Kelantan'
  },
  {
    id: 'klinik_perdana_kb',
    name: 'Klinik Perdana 24 Jam (Jalan Pengkalan Chepa, Kota Bharu)',
    shortName: 'Klinik Perdana Kota Bharu',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 27.5,
    coords: [6.1320, 102.2510],
    estDurationMin: 33,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_penawar_kb',
    name: 'Poliklinik Penawar 24 Jam (Kota Bharu)',
    shortName: 'Poliklinik Penawar KB',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 26.8,
    coords: [6.1240, 102.2460],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'klinik_syifa_pasirtumboh',
    name: 'Klinik Syifa 24 Jam (Pasir Tumboh)',
    shortName: 'Klinik Syifa Pasir Tumboh',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 21.0,
    coords: [6.0650, 102.2780],
    estDurationMin: 25,
    state: 'Kelantan'
  },
  {
    id: 'klinik_syifa_peringat',
    name: 'Klinik Syifa 24 Jam (Peringat)',
    shortName: 'Klinik Syifa Peringat',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 16.5,
    coords: [6.0250, 102.2750],
    estDurationMin: 20,
    state: 'Kelantan'
  },
  {
    id: 'klinik_taqwa_lundang',
    name: 'Klinik Taqwa 24 Jam (Lundang, Kota Bharu)',
    shortName: 'Klinik Taqwa Lundang',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 24.5,
    coords: [6.1080, 102.2580],
    estDurationMin: 29,
    state: 'Kelantan'
  },
  {
    id: 'klinik_famili_dr_wan',
    name: 'Klinik Famili Dr. Wan (Ketereh)',
    shortName: 'Klinik Famili Dr. Wan Ketereh',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 5.2,
    coords: [5.9590, 102.2520],
    estDurationMin: 8,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_dr_murni_machang',
    name: 'Poliklinik Dr. Murni (Bandar Machang)',
    shortName: 'Poliklinik Dr. Murni Machang',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 18.2,
    coords: [5.7675, 102.2170],
    estDurationMin: 22,
    state: 'Kelantan'
  },
  {
    id: 'poliklinik_alhikmah_pasirmas',
    name: 'Poliklinik Al-Hikmah 24 Jam (Pasir Mas)',
    shortName: 'Poliklinik Al-Hikmah Pasir Mas',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 25.8,
    coords: [6.0410, 102.1420],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'klinik_harmoni_tanahmerah',
    name: 'Klinik Harmoni 24 Jam (Tanah Merah)',
    shortName: 'Klinik Harmoni Tanah Merah',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 30.2,
    coords: [5.8075, 102.1480],
    estDurationMin: 36,
    state: 'Kelantan'
  },
  {
    id: 'klinik_amal_kualakrai',
    name: 'Klinik Amal 24 Jam (Kuala Krai)',
    shortName: 'Klinik Amal Kuala Krai',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 44.5,
    coords: [5.5310, 102.2010],
    estDurationMin: 46,
    state: 'Kelantan'
  },
  {
    id: 'klinik_dr_najwa_kb',
    name: 'Klinik Dr. Najwa 24 Jam (Kubang Kerian)',
    shortName: 'Klinik Dr. Najwa Kubang Kerian',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 25.0,
    coords: [6.0940, 102.2820],
    estDurationMin: 29,
    state: 'Kelantan'
  },
  {
    id: 'klinik_mesra_guamusang',
    name: 'Klinik Mesra 24 Jam (Gua Musang)',
    shortName: 'Klinik Mesra Gua Musang',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 134.0,
    coords: [4.8760, 101.9630],
    estDurationMin: 118,
    state: 'Kelantan'
  },

  // ==========================================
  // 3. PAHANG - KLINIK SWASTA & POLIKLINIK 24 JAM
  // ==========================================
  {
    id: 'klinik_dr_azhar_raub',
    name: 'Poliklinik & Surgeri Dr. Azhar 24 Jam (Bandar Raub)',
    shortName: 'Klinik Dr. Azhar Raub',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 365.2,
    coords: [3.7910, 101.8560],
    estDurationMin: 3,
    state: 'Pahang'
  },
  {
    id: 'klinik_keluarga_raub',
    name: 'Klinik Keluarga Raub (Pusat Bandar Raub)',
    shortName: 'Klinik Keluarga Raub',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 364.8,
    coords: [3.7885, 101.8575],
    estDurationMin: 3,
    state: 'Pahang'
  },
  {
    id: 'poliklinik_bentong_24jam',
    name: 'Poliklinik Bentong 24 Jam (Bandar Bentong)',
    shortName: 'Poliklinik Bentong 24 Jam',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 391.0,
    coords: [3.5225, 101.9070],
    estDurationMin: 40,
    state: 'Pahang'
  },
  {
    id: 'klinik_mediviron_mentakab',
    name: 'Klinik Mediviron 24 Jam (Mentakab / Temerloh)',
    shortName: 'Klinik Mediviron Mentakab',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 412.0,
    coords: [3.4860, 102.3520],
    estDurationMin: 65,
    state: 'Pahang'
  },
  {
    id: 'poliklinik_temerloh_24jam',
    name: 'Poliklinik Temerloh 24 Jam (Bandar Temerloh)',
    shortName: 'Poliklinik Temerloh 24 Jam',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 415.0,
    coords: [3.4490, 102.4170],
    estDurationMin: 68,
    state: 'Pahang'
  },
  {
    id: 'klinik_kuantan_24jam',
    name: 'Klinik Kuantan 24 Jam (Jalan Beserah, Kuantan)',
    shortName: 'Klinik Kuantan 24 Jam',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 342.0,
    coords: [3.8210, 103.3310],
    estDurationMin: 152,
    state: 'Pahang'
  },
  {
    id: 'klinik_utama_lipis',
    name: 'Klinik Utama 24 Jam (Kuala Lipis)',
    shortName: 'Klinik Utama Kuala Lipis',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 316.0,
    coords: [4.1830, 102.0460],
    estDurationMin: 44,
    state: 'Pahang'
  },
  {
    id: 'klinik_highlands_cameron',
    name: 'Klinik Highlands (Tanah Rata, Cameron Highlands)',
    shortName: 'Klinik Highlands Tanah Rata',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 278.0,
    coords: [4.4710, 101.3780],
    estDurationMin: 92,
    state: 'Pahang'
  },
  {
    id: 'klinik_jerantut_24jam',
    name: 'Poliklinik Jerantut 24 Jam (Pusat Bandar Jerantut)',
    shortName: 'Poliklinik Jerantut 24 Jam',
    category: 'Klinik Swasta / Poliklinik',
    hubAffinity: 'raub',
    distanceFromKokLanas: 375.0,
    coords: [3.9360, 102.3620],
    estDurationMin: 80,
    state: 'Pahang'
  },

  // ==========================================
  // 4. KELANTAN & PAHANG - HOSPITAL SWASTA & PAKAR
  // ==========================================
  {
    id: 'kpz_kb',
    name: 'KPJ Perdana Specialist Hospital, Kota Bharu',
    shortName: 'KPJ Perdana Kota Bharu',
    category: 'Hospital Swasta',
    hubAffinity: 'kok_lanas',
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
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 27.5,
    coords: [6.1280, 102.2415],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'putra_spec_kb',
    name: 'Putra Specialist Hospital, Kota Bharu',
    shortName: 'Putra Specialist KB',
    category: 'Hospital Swasta',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 27.0,
    coords: [6.1210, 102.2470],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'annisa_spec_kb',
    name: 'Hospital Pakar Perubatan An-Nisa, Kota Bharu',
    shortName: 'Hospital Pakar An-Nisa',
    category: 'Hospital Swasta',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 27.2,
    coords: [6.1265, 102.2425],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'kmc_kuantan',
    name: 'Kuantan Medical Centre (KMC), Kuantan',
    shortName: 'KMC Kuantan',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 345.0,
    coords: [3.8260, 103.3370],
    estDurationMin: 155,
    state: 'Pahang'
  },
  {
    id: 'kpj_pahang',
    name: 'KPJ Pahang Specialist Hospital, Tanjung Lumpur',
    shortName: 'KPJ Pahang Kuantan',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 348.0,
    coords: [3.7980, 103.3440],
    estDurationMin: 160,
    state: 'Pahang'
  },
  {
    id: 'prkmuip_kuantan',
    name: 'Pusat Rawatan Keluarga MUIP (PRKMUIP), Kuantan',
    shortName: 'Pusat Rawatan MUIP Kuantan',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 344.0,
    coords: [3.8190, 103.3280],
    estDurationMin: 153,
    state: 'Pahang'
  },

  // ==========================================
  // 5. PUSAT DIALISIS & RAWATAN HEMODIALISIS
  // ==========================================
  {
    id: 'dialisis_alfarhain',
    name: 'Pusat Hemodialisis Panel Al-Farhain AMC, Kok Lanas',
    shortName: 'Hemodialisis Al-Farhain AMC Kok Lanas',
    category: 'Pusat Dialisis',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 0.2,
    coords: [5.9177, 102.2447],
    estDurationMin: 2,
    state: 'Kelantan'
  },
  {
    id: 'dialisis_alfarhain_raub',
    name: 'Pusat Hemodialisis Panel Al-Farhain AMC, Cawangan Raub',
    shortName: 'Hemodialisis Al-Farhain AMC Raub',
    category: 'Pusat Dialisis',
    hubAffinity: 'raub',
    distanceFromKokLanas: 365.1,
    coords: [3.7905, 101.8565],
    estDurationMin: 2,
    state: 'Pahang'
  },
  {
    id: 'dialisis_maik',
    name: 'Pusat Hemodialisis MAIK (Majlis Agama Islam Kelantan)',
    shortName: 'Hemodialisis MAIK Kota Bharu',
    category: 'Pusat Dialisis',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 26.5,
    coords: [6.1180, 102.2490],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'dialisis_annur_kb',
    name: 'Pusat Dialisis Waqaf An-Nur, Kubang Kerian',
    shortName: 'Dialisis Waqaf An-Nur Kubang Kerian',
    category: 'Pusat Dialisis',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 25.0,
    coords: [6.0950, 102.2810],
    estDurationMin: 30,
    state: 'Kelantan'
  },
  {
    id: 'dialisis_nkf_kb',
    name: 'Pusat Dialisis NKF (National Kidney Foundation), Kota Bharu',
    shortName: 'Dialisis NKF Kota Bharu',
    category: 'Pusat Dialisis',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 26.2,
    coords: [6.1215, 102.2450],
    estDurationMin: 31,
    state: 'Kelantan'
  },
  {
    id: 'dialisis_raub',
    name: 'Pusat Hemodialisis Majlis Perbandaran Raub',
    shortName: 'Pusat Dialisis MP Raub',
    category: 'Pusat Dialisis',
    hubAffinity: 'raub',
    distanceFromKokLanas: 366.0,
    coords: [3.7920, 101.8580],
    estDurationMin: 5,
    state: 'Pahang'
  },
  {
    id: 'dialisis_nkf_mentakab',
    name: 'Pusat Dialisis NKF Mentakab (Pahang)',
    shortName: 'Dialisis NKF Mentakab',
    category: 'Pusat Dialisis',
    hubAffinity: 'raub',
    distanceFromKokLanas: 411.0,
    coords: [3.4840, 102.3490],
    estDurationMin: 66,
    state: 'Pahang'
  },
  {
    id: 'dialisis_rotari_kuantan',
    name: 'Pusat Hemodialisis Rotari Kuantan',
    shortName: 'Pusat Dialisis Rotari Kuantan',
    category: 'Pusat Dialisis',
    hubAffinity: 'raub',
    distanceFromKokLanas: 343.0,
    coords: [3.8180, 103.3260],
    estDurationMin: 151,
    state: 'Pahang'
  },

  // ==========================================
  // 6. PUSAT BERSALIN & PAKAR WANITA / KANAK-KANAK
  // ==========================================
  {
    id: 'bersalin_annisa_kb',
    name: 'Rumah Bersalin & Pakar Wanita An-Nisa (Kota Bharu)',
    shortName: 'Rumah Bersalin An-Nisa',
    category: 'Pusat Bersalin & Pakar',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 27.2,
    coords: [6.1265, 102.2425],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'bersalin_siti_kb',
    name: 'Pusat Bersalin & Rawatan Wanita Siti (Kota Bharu)',
    shortName: 'Pusat Bersalin Siti Kota Bharu',
    category: 'Pusat Bersalin & Pakar',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 26.0,
    coords: [6.1190, 102.2465],
    estDurationMin: 31,
    state: 'Kelantan'
  },
  {
    id: 'bersalin_sukhdev_kuantan',
    name: 'Klinik Pakar Wanita & Rumah Bersalin Sukhdev (Kuantan)',
    shortName: 'Klinik Bersalin Sukhdev Kuantan',
    category: 'Pusat Bersalin & Pakar',
    hubAffinity: 'raub',
    distanceFromKokLanas: 343.5,
    coords: [3.8160, 103.3290],
    estDurationMin: 152,
    state: 'Pahang'
  },

  // ==========================================
  // 7. KLINIK KESIHATAN KERAJAAN (KKM)
  // ==========================================
  {
    id: 'kk_koklanas',
    name: 'Klinik Kesihatan Kok Lanas',
    shortName: 'KK Kok Lanas',
    category: 'Klinik Kesihatan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 1.5,
    coords: [5.9180, 102.2420],
    estDurationMin: 5,
    state: 'Kelantan'
  },
  {
    id: 'kk_ketereh',
    name: 'Klinik Kesihatan Ketereh',
    shortName: 'KK Ketereh',
    category: 'Klinik Kesihatan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 4.8,
    coords: [5.9580, 102.2510],
    estDurationMin: 8,
    state: 'Kelantan'
  },
  {
    id: 'kk_bandar_kb',
    name: 'Klinik Kesihatan Bandar Kota Bharu',
    shortName: 'KK Bandar Kota Bharu',
    category: 'Klinik Kesihatan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 26.0,
    coords: [6.1290, 102.2430],
    estDurationMin: 30,
    state: 'Kelantan'
  },
  {
    id: 'kk_kubangkerian',
    name: 'Klinik Kesihatan Kubang Kerian',
    shortName: 'KK Kubang Kerian',
    category: 'Klinik Kesihatan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 24.5,
    coords: [6.0920, 102.2740],
    estDurationMin: 28,
    state: 'Kelantan'
  },
  {
    id: 'kk_wakafcheyeh',
    name: 'Klinik Kesihatan Wakaf Che Yeh / Kadok',
    shortName: 'KK Wakaf Che Yeh',
    category: 'Klinik Kesihatan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 18.0,
    coords: [6.0680, 102.2420],
    estDurationMin: 22,
    state: 'Kelantan'
  },
  {
    id: 'kk_pengkalanchepa',
    name: 'Klinik Kesihatan Pengkalan Chepa',
    shortName: 'KK Pengkalan Chepa',
    category: 'Klinik Kesihatan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 32.0,
    coords: [6.1750, 102.2920],
    estDurationMin: 38,
    state: 'Kelantan'
  },
  {
    id: 'kk_bandar_raub',
    name: 'Klinik Kesihatan Bandar Raub',
    shortName: 'KK Bandar Raub',
    category: 'Klinik Kesihatan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 366.0,
    coords: [3.7950, 101.8620],
    estDurationMin: 6,
    state: 'Pahang'
  },
  {
    id: 'kk_dong_raub',
    name: 'Klinik Kesihatan Dong, Raub',
    shortName: 'KK Dong Raub',
    category: 'Klinik Kesihatan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 350.0,
    coords: [3.8500, 101.8800],
    estDurationMin: 15,
    state: 'Pahang'
  },
  {
    id: 'kk_cheroh_raub',
    name: 'Klinik Kesihatan Cheroh, Raub',
    shortName: 'KK Cheroh Raub',
    category: 'Klinik Kesihatan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 358.0,
    coords: [3.8950, 101.8480],
    estDurationMin: 22,
    state: 'Pahang'
  },
  {
    id: 'kk_bandar_bentong',
    name: 'Klinik Kesihatan Bandar Bentong',
    shortName: 'KK Bandar Bentong',
    category: 'Klinik Kesihatan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 390.0,
    coords: [3.5200, 101.9080],
    estDurationMin: 41,
    state: 'Pahang'
  },

  // ==========================================
  // 8. KELANTAN - HOSPITAL KERAJAAN
  // ==========================================
  {
    id: 'hrpz',
    name: 'Hospital Raja Perempuan Zainab II (HRPZ II), Kota Bharu',
    shortName: 'HRPZ II Kota Bharu',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 27.2,
    coords: [6.1256, 102.2482],
    estDurationMin: 32,
    state: 'Kelantan'
  },
  {
    id: 'husm',
    name: 'Hospital Universiti Sains Malaysia (Hospital USM), Kubang Kerian',
    shortName: 'HUSM Kubang Kerian',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 25.5,
    coords: [6.0988, 102.2858],
    estDurationMin: 30,
    state: 'Kelantan'
  },
  {
    id: 'h_kuala_krai',
    name: 'Hospital Sultan Ismail Petra (Hospital Kuala Krai)',
    shortName: 'Hospital Kuala Krai',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 45.0,
    coords: [5.5325, 102.2045],
    estDurationMin: 48,
    state: 'Kelantan'
  },
  {
    id: 'h_machang',
    name: 'Hospital Machang',
    shortName: 'Hospital Machang',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 18.0,
    coords: [5.7668, 102.2185],
    estDurationMin: 22,
    state: 'Kelantan'
  },
  {
    id: 'h_pasir_mas',
    name: 'Hospital Pasir Mas',
    shortName: 'Hospital Pasir Mas',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 26.4,
    coords: [6.0425, 102.1432],
    estDurationMin: 34,
    state: 'Kelantan'
  },
  {
    id: 'h_tanah_merah',
    name: 'Hospital Tanah Merah',
    shortName: 'Hospital Tanah Merah',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 31.0,
    coords: [5.8085, 102.1472],
    estDurationMin: 38,
    state: 'Kelantan'
  },
  {
    id: 'h_tumpat',
    name: 'Hospital Tumpat',
    shortName: 'Hospital Tumpat',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 38.2,
    coords: [6.1965, 102.1695],
    estDurationMin: 45,
    state: 'Kelantan'
  },
  {
    id: 'h_tengku_anis',
    name: 'Hospital Tengku Anis, Pasir Puteh',
    shortName: 'Hospital Tengku Anis',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 33.0,
    coords: [5.8340, 102.4080],
    estDurationMin: 39,
    state: 'Kelantan'
  },
  {
    id: 'h_jeli',
    name: 'Hospital Jeli',
    shortName: 'Hospital Jeli',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 86.0,
    coords: [5.6995, 101.8445],
    estDurationMin: 90,
    state: 'Kelantan'
  },
  {
    id: 'h_gua_musang',
    name: 'Hospital Gua Musang',
    shortName: 'Hospital Gua Musang',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 135.0,
    coords: [4.8785, 101.9610],
    estDurationMin: 120,
    state: 'Kelantan'
  },

  // ==========================================
  // 9. PAHANG - HOSPITAL KERAJAAN
  // ==========================================
  {
    id: 'h_raub',
    name: 'Hospital Raub',
    shortName: 'Hospital Raub',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 365.0,
    coords: [3.7915, 101.8590],
    estDurationMin: 15,
    state: 'Pahang'
  },
  {
    id: 'h_kuala_lipis',
    name: 'Hospital Kuala Lipis',
    shortName: 'Hospital Kuala Lipis',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 315.0,
    coords: [4.1855, 102.0490],
    estDurationMin: 45,
    state: 'Pahang'
  },
  {
    id: 'h_bentong',
    name: 'Hospital Bentong',
    shortName: 'Hospital Bentong',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 390.0,
    coords: [3.5186, 101.9054],
    estDurationMin: 40,
    state: 'Pahang'
  },
  {
    id: 'hoshas_temerloh',
    name: 'Hospital Sultan Haji Ahmad Shah (HOSHAS), Temerloh',
    shortName: 'HOSHAS Temerloh',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 410.0,
    coords: [3.4560, 102.4180],
    estDurationMin: 70,
    state: 'Pahang'
  },
  {
    id: 'h_cameron',
    name: 'Hospital Sultanah Hajjah Kalsom (Cameron Highlands)',
    shortName: 'Hospital Cameron Highlands',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 280.0,
    coords: [4.4789, 101.3850],
    estDurationMin: 95,
    state: 'Pahang'
  },
  {
    id: 'htaa_kuantan',
    name: 'Hospital Tengku Ampuan Afzan (HTAA), Kuantan',
    shortName: 'HTAA Kuantan',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 340.0,
    coords: [3.8168, 103.3255],
    estDurationMin: 150,
    state: 'Pahang'
  },
  {
    id: 'h_pekan',
    name: 'Hospital Pekan, Pahang',
    shortName: 'Hospital Pekan',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 380.0,
    coords: [3.4930, 103.3980],
    estDurationMin: 180,
    state: 'Pahang'
  },
  {
    id: 'h_jengka',
    name: 'Hospital Jengka, Bandar Tun Abdul Razak',
    shortName: 'Hospital Jengka',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 385.0,
    coords: [3.7710, 102.5480],
    estDurationMin: 90,
    state: 'Pahang'
  },
  {
    id: 'h_jerantut',
    name: 'Hospital Jerantut, Pahang',
    shortName: 'Hospital Jerantut',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 376.0,
    coords: [3.9380, 102.3680],
    estDurationMin: 82,
    state: 'Pahang'
  },

  // ==========================================
  // 10. TERENGGANU - HOSPITAL RUJUKAN
  // ==========================================
  {
    id: 'h_besut',
    name: 'Hospital Besut, Terengganu',
    shortName: 'Hospital Besut',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 58.0,
    coords: [5.7620, 102.5530],
    estDurationMin: 55,
    state: 'Terengganu'
  },
  {
    id: 'hsnz_trg',
    name: 'Hospital Sultanah Nur Zahirah (HSNZ), Kuala Terengganu',
    shortName: 'HSNZ Kuala Terengganu',
    category: 'Hospital Kerajaan',
    hubAffinity: 'kok_lanas',
    distanceFromKokLanas: 145.0,
    coords: [5.3350, 103.1480],
    estDurationMin: 130,
    state: 'Terengganu'
  },

  // ==========================================
  // 11. LEMBAH KLANG & SELANGOR - HOSPITAL SWASTA TERKEMUKA
  // ==========================================
  {
    id: 'sunway_med_centre',
    name: 'Sunway Medical Centre, Bandar Sunway (Subang)',
    shortName: 'Sunway Medical Centre',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 452.0,
    coords: [3.0670, 101.6105],
    estDurationMin: 105,
    state: 'Selangor'
  },
  {
    id: 'sjmc_subang',
    name: 'Subang Jaya Medical Centre (SJMC), Subang Jaya',
    shortName: 'SJMC Subang Jaya',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 450.0,
    coords: [3.0805, 101.5930],
    estDurationMin: 102,
    state: 'Selangor'
  },
  {
    id: 'gleneagles_kl',
    name: 'Gleneagles Hospital Kuala Lumpur, Jalan Ampang',
    shortName: 'Gleneagles Hospital KL',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 442.0,
    coords: [3.1590, 101.7370],
    estDurationMin: 92,
    state: 'Kuala Lumpur'
  },
  {
    id: 'pantai_bangsar',
    name: 'Pantai Hospital Kuala Lumpur, Bangsar',
    shortName: 'Pantai Hospital Bangsar',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 448.0,
    coords: [3.1220, 101.6690],
    estDurationMin: 98,
    state: 'Kuala Lumpur'
  },
  {
    id: 'prince_court_kl',
    name: 'Prince Court Medical Centre, Kia Peng Kuala Lumpur',
    shortName: 'Prince Court Medical Centre',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 443.0,
    coords: [3.1490, 101.7215],
    estDurationMin: 95,
    state: 'Kuala Lumpur'
  },
  {
    id: 'thomson_hospital',
    name: 'Thomson Hospital Kota Damansara (TMC)',
    shortName: 'Thomson Hospital Damansara',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 435.0,
    coords: [3.1530, 101.5790],
    estDurationMin: 90,
    state: 'Selangor'
  },
  {
    id: 'kpj_damansara',
    name: 'KPJ Damansara Specialist Hospital, Petaling Jaya',
    shortName: 'KPJ Damansara Specialist',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 438.0,
    coords: [3.1360, 101.6280],
    estDurationMin: 92,
    state: 'Selangor'
  },
  {
    id: 'kpj_ampang_puteri',
    name: 'KPJ Ampang Puteri Specialist Hospital, Ampang',
    shortName: 'KPJ Ampang Puteri',
    category: 'Hospital Swasta',
    hubAffinity: 'raub',
    distanceFromKokLanas: 442.0,
    coords: [3.1610, 101.7520],
    estDurationMin: 94,
    state: 'Selangor'
  },

  // ==========================================
  // 12. LEMBAH KLANG - HOSPITAL KERAJAAN & RUJUKAN KEBANGSAAN
  // ==========================================
  {
    id: 'hkl',
    name: 'Hospital Kuala Lumpur (HKL)',
    shortName: 'HKL Kuala Lumpur',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 440.0,
    coords: [3.1706, 101.7028],
    estDurationMin: 90,
    state: 'Kuala Lumpur'
  },
  {
    id: 'ijn',
    name: 'Institut Jantung Negara (IJN), Kuala Lumpur',
    shortName: 'IJN Kuala Lumpur',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 441.0,
    coords: [3.1712, 101.7105],
    estDurationMin: 90,
    state: 'Kuala Lumpur'
  },
  {
    id: 'ppum',
    name: 'Pusat Perubatan Universiti Malaya (PPUM), Petaling Jaya',
    shortName: 'PPUM Petaling Jaya',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 450.0,
    coords: [3.1120, 101.6540],
    estDurationMin: 100,
    state: 'Selangor'
  },
  {
    id: 'h_selayang',
    name: 'Hospital Selayang (Selangor / KL)',
    shortName: 'Hospital Selayang',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 430.0,
    coords: [3.2435, 101.6468],
    estDurationMin: 85,
    state: 'Selangor'
  },
  {
    id: 'h_putrajaya',
    name: 'Hospital Putrajaya (Presint 7)',
    shortName: 'Hospital Putrajaya',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 465.0,
    coords: [2.9295, 101.6740],
    estDurationMin: 110,
    state: 'Putrajaya'
  },
  {
    id: 'h_serdang',
    name: 'Hospital Sultan Idris Shah (Hospital Serdang)',
    shortName: 'Hospital Serdang',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 462.0,
    coords: [2.9770, 101.7210],
    estDurationMin: 108,
    state: 'Selangor'
  },
  {
    id: 'h_sungai_buloh',
    name: 'Hospital Sungai Buloh (Pusat Trauma & Rawatan Khas)',
    shortName: 'Hospital Sungai Buloh',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 428.0,
    coords: [3.2200, 101.5830],
    estDurationMin: 84,
    state: 'Selangor'
  },
  {
    id: 'htar_klang',
    name: 'Hospital Tengku Ampuan Rahimah (HTAR Klang)',
    shortName: 'HTAR Klang',
    category: 'Hospital Kerajaan',
    hubAffinity: 'raub',
    distanceFromKokLanas: 460.0,
    coords: [3.0190, 101.4420],
    estDurationMin: 115,
    state: 'Selangor'
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
