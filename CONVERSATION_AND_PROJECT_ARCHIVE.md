# AL-FARHAIN AMC AMBULANS - DOKUMENTASI & ARKIB PERBUALAN PROJEK
**Tarikh Arkib:** 15 Oktober 2026  
**Pusat Operasi:** Al-Farhain Medical Center (HQ Kok Lanas, Kelantan & Cawangan Raub, Pahang)  
**Talian Kecemasan:** 013-914 7606  

---

## 1. Ringkasan Permintaan & Perbualan Pengguna (Chronological Log)

1. **Permintaan 1 (Google Sheets & Pembangunan Sistem Ambulans):**
   - Pengguna membekalkan pautan Google Sheets mengandungi jadual harga dan kalkulator tambang ambulan (`sheet1.xlsx`, `sheet2.xlsx`, `Stock_Services_Pricing_Ambulan.xlsx`).
   - Meminta pembangunan sistem kalkulator tambang ambulan pelbagai fungsi menggunakan sambungan Flutter, merangkumi destinasi khusus, pakej bantuan krew perubatan (M.A, C.A, Dr), peralatan tambahan, dan lain-lain.
2. **Permintaan 2 (Penyambungan Supabase):**
   - Pengguna meminta konfigurasi dan sambungan terus ke pangkalan data cloud Supabase.
3. **Permintaan 3 (Keperluan Supabase Server):**
   - Pengguna bertanya sama ada perlu memasang server Supabase sendiri atau menggunakan cloud. (Dijelaskan bahawa Supabase Cloud percuma & sedia ada tanpa perlu pasang server fizikal).
4. **Permintaan 4 (Konfigurasi `.env`):**
   - Pengguna memasukkan Project URL dan Anon Key ke dalam fail `.env`.
   - Menguji dan mengesahkan sambungan pangkalan data secara langsung serta menyediakan skrip `supabase_schema.sql` untuk mencipta jadual `ambulance_bookings`.
5. **Permintaan 5 (Integrasi Peta Sebenar & Penanda Lokasi Tepat):**
   - Pengguna meminta peta sebenar tanpa watermark yang membolehkan melihat laluan memandu sebenar dan menandakan (*pin/mark*) lokasi pesakit secara tepat.
   - Mengintegrasikan OSRM Engine (jarak pemanduan jalan raya sebenar) dan Google Maps Layer tanpa sebarang watermark.
6. **Permintaan 6 (Buka di Telefon Pintar & Fail APK):**
   - Pengguna meminta panduan membuka aplikasi di telefon pintar atau melalui fail `.apk`.
   - Disediakan modul PWA segera dengan imbasan kod QR Wi-Fi tempatan dan panduan kompilasi APK Flutter.
7. **Permintaan 7 (Simpan Perbualan Ini):**
   - Permintaan untuk mendokumentasikan dan menyimpan keseluruhan rekod perbualan dan arkib sistem ini secara kekal.

---

## 2. Struktur Formula Pengiraan Tambang Ambulans

Berdasarkan jadual operasi Al-Farhain Medical Center:

### A. Formula Tambang Asas & Jarak
$$\text{Jumlah Tambang Jarak} = \begin{cases} 
\text{RM } 250.00 & \text{jika } \text{Jarak} \le 25\text{ KM} \\
\text{RM } 250.00 + (\text{Jarak} - 25\text{ KM}) \times \text{Kadar/KM} & \text{jika } \text{Jarak} > 25\text{ KM}
\end{cases}$$

- **Kadar KM Normal:** $\text{RM } 3.00\text{ / KM}$
- **Kadar Diesel Surge:** $\text{RM } 4.50\text{ / KM}$ (Pilihan mod lonjakan bahan api)

### B. Kategori Perjalanan (Trip Type)
- **Kecemasan (Emergency):** Asas RM 250.00
- **Bukan Kecemasan (Non-Emergency / Discaj):** Asas RM 250.00
- **Kecemasan Dalaman (In-House Transfer):** Asas RM 350.00
- **Perkhidmatan Bersama Unit AED:** Asas RM 500.00

### C. Pakej Bantuan Pegawai & Krew Perubatan
- **Tiada Pakej Tambahan (Krew EMT Standard):** RM 0.00 (Termasuk)
- **Pakej C.A (Care / Clinical Assistant):** +RM 100.00
- **Pakej M.A (Medical Assistant / Penolong Pegawai Perubatan PPP):** +RM 200.00
- **Pakej DR (Pegawai Perubatan / Doctor Escort):** +RM 400.00

### D. Peralatan Perubatan Tambahan (Add-ons)
- **Tangki Oksigen (Oxygen Tank Supply):** RM 50.00
- **Kotak Ubat Kecemasan (Med Kit):** RM 20.00
- **Inkubator Pengangkutan Bayi (Transport Incubator):** RM 250.00
- **Pam Infusi & Ventilator (Infusion Pump & Ventilator):** RM 150.00
- **Kit Bersalin / Obstetrik (Obstetric / Maternity Kit):** RM 80.00
- **Pemantau Jantung Pesakit (Cardiac Monitor):** RM 120.00
- **Unit Sedutan Kahak (Portable Suction Unit):** RM 60.00
- **Lain-lain Caj Pengurusan & Operasi:** RM 50.00

---

## 3. Cawangan Hub & Bilik Gerakan

| Cawangan | Wilayah | Pemandu Utama | No. Plat Ambulans | Hubungi |
| :--- | :--- | :--- | :--- | :--- |
| **HQ Kok Lanas** | Kelantan | Abe Di / Syalihan | **VPQ 7606** | 013-914 7606 |
| **Cawangan Raub** | Pahang | Abe Din Estimos Sukrosa | **DFG 7606** | 013-914 7606 |

---

## 4. Integrasi Cloud Supabase

- **Project URL:** `https://hjshazhwfzqrcujrirsr.supabase.co`
- **Jadual Pangkalan Data:** `ambulance_bookings`
- **Skrip Skema SQL:** `supabase_schema.sql`
- **Ciri Realtime:** Setiap kali invois disahkan atau tempahan dibuat, data disegerakkan serta-merta ke dashboard pemandu dan admin secara automatik melalui Supabase WebSockets.

---

## 5. Panduan Penggunaan Mudah Alih & Pemasangan APK

### A. Kaedah 1: PWA Pantas (Imbas Kod QR)
1. Sambungkan telefon dan komputer ke Wi-Fi yang sama.
2. Buka browser telefon dan pergi ke: `http://192.168.68.103:5173/`
3. Tekan butang menu browser $\rightarrow$ pilih **"Install app"** / **"Add to Home screen"**.

### B. Kaedah 2: Kompilasi Fail APK Flutter
1. Buka folder `flutter_app/` dalam terminal:
   ```powershell
   cd "flutter_app"
   flutter create . --org com.alfarhain.ambulance
   flutter pub get
   flutter build apk --release
   ```
2. Fail APK sedia ada di:
   `flutter_app/build/app/outputs/flutter-apk/app-release.apk`

---

## 6. Indeks Fail Utama Projek

- `index.html` — Antara muka utama sistem web responsif
- `src/main.js` — Enjin pengiraan tambang, kawalan peta, dan integrasi modal
- `src/style.css` — Tema visual moden perubatan kecemasan
- `src/services/supabaseClient.js` — Modul penyambungan Supabase REST & Realtime
- `supabase_schema.sql` — Skrip jadual SQL, RLS, indeks dan realtime replication
- `manifest.json` — Konfigurasi Progressive Web App untuk peranti mudah alih
- `flutter_app/` — Kod sumber aplikasi Flutter untuk Android APK dan iOS
