# Product Requirement Document (PRD) & Panduan Teknis Pembuatan Sistem
## Sistem Presensi PKL Geofencing & Monitoring Multi-Cabang — Astra Daihatsu DSO Lampung

- **Nama Proyek:** Sistem Presensi PKL – Daihatsu DSO LAMPUNG
- **Lokasi Implementasi:** PT. Astra International Tbk – Daihatsu Sales Operation (DSO) Lampung (5 Cabang Resmi)
- **Tipe Aplikasi:** Progressive Web App (PWA) Mobile-First & Responsive Desktop
- **Arsitektur:** Frontend SPA (Vercel) + Serverless API Proxy (Vercel Functions) + Backend REST API (Google Apps Script) + Database (Google Sheets 6-Sheet) & Cloud Storage (Google Drive)
- **Versi Dokumen:** 2.0 (Final Production Release)
- **Status Sistem:** Production-Ready (Teruji Fungsional, UI/UX, dan Keamanan 10/10)

> **Catatan Penggunaan Dokumen Ini:** Dokumen ini dirancang sebagai *Single Source of Truth* untuk penyusunan **Laporan PKL**, **Laporan PRD**, maupun referensi konteks lengkap bagi asisten AI lain agar memahami seluruh arsitektur, alur fitur, skema database, keamanan, dan langkah pembuatan sistem dari nol hingga produksi.

---

## 1. Latar Belakang, Tujuan & Ruang Lingkup

### 1.1. Latar Belakang
Proses pencatatan kehadiran peserta Praktik Kerja Lapangan (PKL) di lingkungan bengkel/dealer Astra Daihatsu sebelumnya masih bergantung pada absensi manual (kertas/tanda tangan) yang rentan terhadap:
1. Titip absen atau manipulasi jam kehadiran.
2. Kesulitan HRD / Pembimbing dalam memantau kehadiran peserta lintas 5 cabang di Lampung secara *real-time*.
3. Rekapitulasi bulanan dan pengarsipan surat izin/sakit yang memakan waktu lama saat pembuatan laporan penilaian sekolah/kampus.

### 1.2. Tujuan Utama
1. **Digitalisasi Presensi Berbasis Geofencing GPS:** Memastikan siswa PKL benar-benar hadir di area workshop saat melakukan Presensi Masuk (`IN`) menggunakan validasi radius Haversine di sisi **client dan server**.
2. **Monitoring Terpusat Multi-Cabang (5 Cabang Lampung):** Memudahkan Admin/HRD memantau kehadiran, menyetujui/menolak izin, mencatat presensi manual, dan mengatur titik pusat serta radius geofencing dari satu dashboard.
3. **Zero-Cost Serverless Infrastructure:** Memanfaatkan Vercel (Hobby/Free) + Google Apps Script + Google Sheets + Google Drive tanpa biaya sewa server/VPS bulanan.
4. **Pengalaman Native App (PWA):** Dapat diinstal langsung ke *homescreen* HP Android/iOS melalui browser tanpa perlu Play Store/App Store.

---

## 2. Arsitektur Sistem & Tech Stack

### 2.1. Diagram Arsitektur Alur Data
```
[Browser / PWA Siswa & Admin]
       │
       │ HTTPS POST/GET (JSON, same-origin, cache: no-store)
       ▼
[Vercel Serverless Proxy]
  ├── /api/presensi.js  ──► Validasi CORS ketat, Anti-SSRF whitelist GAS,
  │                         injeksi GAS_SECRET_CODE dari Env Var Vercel
  └── /api/geocode.js   ──► Reverse Geocoding (OpenStreetMap Nominatim +
                            BigDataCloud fallback) + Google Plus Code
       │
       │ HTTPS POST (JSON + secretToken + HMAC sessionToken)
       ▼
[Google Apps Script Web App (Code.gs)]
  ├── Autentikasi (Salted SHA-256 + Rate Limit 5x/5 menit)
  ├── Otorisasi RBAC (HMAC-SHA256 Signed Session Token)
  ├── Validasi Geofencing Haversine Server-Side
  └── CRUD Data & File Upload
       │
       ├──► [Google Sheets — 6 Sheet Database]
       └──► [Google Drive — 3 Folder Media & Dokumen]
```

### 2.2. Teknologi yang Digunakan
| Lapisan | Teknologi | Fungsi |
| :--- | :--- | :--- |
| **Frontend UI** | HTML5, Vanilla JavaScript (ES6+), Tailwind CSS (CDN) | Single Page Application (SPA) ringan tanpa kompleksitas bundler |
| **Tipografi & Ikon** | Plus Jakarta Sans (Google Fonts), Lucide Icons (SVG) | Tipografi korporat modern (`tabular-nums`) & 100% ikon vektor |
| **Peta & Lokasi** | Leaflet.js 1.9.4, Google Maps Roadmap Tile, Geolocation API (WGS84) | Peta interaktif, marker cabang, lingkaran radius geofencing, kalkulasi Haversine |
| **PWA & Offline** | Web App Manifest (`manifest.json`), Service Worker (`sw.js`) | Instalasi homescreen, caching aset statis (bypass `/api/` untuk data live) |
| **API Proxy** | Vercel Serverless Functions (Node.js ESM: `api/presensi.js`, `api/geocode.js`) | Mengatasi CORS, menyembunyikan `GAS_URL` & `GAS_SECRET_CODE`, anti-SSRF |
| **Backend Logic** | Google Apps Script (`Code.gs`) | REST API endpoint (`doGet`, `doPost`), enkripsi, validasi server, integrasi Drive/Sheets |
| **Database & Storage** | Google Sheets (6 Sheet) & Google Drive (3 Folder) | Penyimpanan data terstruktur real-time & file foto profil / dokumen bukti |

### 2.3. Struktur File Repositori
```text
presensi-pkl/
├── index.html                        # Aplikasi utama SPA (UI, CSS, JS, Custom Engine)
├── sw.js                             # Service Worker PWA (caching aset + bypass /api/)
├── manifest.json                     # Konfigurasi PWA (nama, ikon, theme-color, standalone)
├── vercel.json                       # Header keamanan cache untuk sw.js & manifest.json
├── api/
│   ├── presensi.js                   # Vercel Proxy aman ke Google Apps Script
│   └── geocode.js                    # Reverse geocoding alamat & Google Plus Code
├── Image/                            # Aset logo Daihatsu, hero banner, dan ikon PWA (192/512/maskable)
├── Code.gs                           # Kode backend Google Apps Script (lokal/tidak di-commit ke Git publik)
└── spesifikasi_produk_presensi_pkl.md# Dokumen PRD & Panduan Lengkap ini
```

---

## 3. Parameter Geofencing Multi-Cabang (5 Cabang Resmi)

Aplikasi mendukung **5 cabang resmi Astra Daihatsu Lampung** dengan titik pusat dan toleransi radius (rentang slider `30m–300m`, preset `70m`, `100m`, `150m`, `200m`) yang dapat dikalibrasi oleh Admin dan tersinkronisasi real-time ke seluruh siswa:

| No | Kode ID (`Config_Cabang`) | Nama Cabang Resmi | Wilayah | Latitude | Longitude | Radius Default |
| :-: | :--- | :--- | :--- | :-: | :-: | :-: |
| 1 | `BDL_AYANI` | Astra Daihatsu Lampung - Ahmad Yani | Bandar Lampung Pusat | `-5.421220` | `105.252890` | `150 m` |
| 2 | `BDL_SOETTA` | Astra Daihatsu Lampung - Soekarno Hatta | Bypass Bandar Lampung | `-5.393713` | `105.288628` | `150 m` |
| 3 | `BDJ_PROKLAMATOR` | Astra Daihatsu Lampung - Bandar Jaya | Lampung Tengah | `-4.950139` | `105.215034` | `150 m` |
| 4 | `KTB_LAMPURA` | Astra Daihatsu Lampung Utara - Kotabumi | Kotabumi | `-4.844410` | `104.909920` | `150 m` |
| 5 | `LTM_SRIBAWONO` | Astra Daihatsu Lampung Timur - Bandar Sribawono | Bandar Sribawono | `-5.311915` | `105.750210` | `150 m` |

### Rumus Geodesik Haversine (Dijalankan di Client & Server)
$$d = 2R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \varphi}{2}\right) + \cos(\varphi_1)\cos(\varphi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
*dengan $R = 6.371.000\text{ meter}$ (jari-jari bumi).*

- **Presensi Masuk (`IN`):** Wajib berada di **dalam** radius resmi cabang ($d \le \text{radius}$). Divalidasi ulang di server (`Code.gs`); jika di luar radius akan ditolak dengan kode `OUT_OF_RADIUS`.
- **Presensi Selesai (`OUT`):** Dapat dilakukan di dalam radius (`VALID_OUT`) maupun saat sudah meninggalkan area (`FLAG_OUT_RADIUS`) dengan pencatatan jarak aktual dari server.

---

## 4. Skema Database (Google Sheets — 6 Sheet) & Google Drive

### 4.1. Daftar Sheet di Workbook `Database Presensi PKL`

#### 1. Sheet `Master_PKL` (Data Peserta PKL)
| Kolom | Nama Header | Tipe | Keterangan |
| :-: | :--- | :--- | :--- |
| A | `NIM / NISN` | String (PK) | ID unik peserta PKL |
| B | `Nama Lengkap` | String | Nama lengkap siswa/mahasiswa |
| C | `Asal Sekolah / Kampus` | String | Instansi pendidikan asal |
| D | `Jurusan / Program` | String | Contoh: Teknik Kendaraan Ringan (TKR) |
| E | `URL Foto Profil` | String | Link Google Drive (dinormalisasi ke thumbnail URL) |
| F | `Status PKL` | String | `Aktif` / `Selesai` |
| G | `Role` | String | `anak PKL` |
| H | `Username` | String | Username login peserta |
| I | `Password` | String | Tersimpan aman dalam format `sha256$<salt>$<hash>` |
| J | `Cabang` | String | Kode cabang (`BDL_AYANI`, `BDL_SOETTA`, dll.) |
| K | `Terakhir Diupdate` | DateTime | Timestamp pembaruan terakhir |

#### 2. Sheet `Admin` (Data Akun HRD / Pembimbing)
| Kolom | Nama Header | Keterangan |
| :-: | :--- | :--- |
| A–F | `NIP_ID`, `Nama Lengkap`, `Jabatan`, `Divisi_Bagian`, `No_WhatsApp`, `Email` | Identitas resmi HRD / Pembimbing |
| G–H | `UserName`, `Password` | Kredensial login (`sha256$<salt>$<hash>`) |
| I–K | `Role_Akses`, `Cabang_Tugas`, `Status_Akun` | Hak akses (`Super Admin`) & status aktif |
| L–N | `URL Foto Profil`, `Waktu Dibuat`, `Terakhir Login` | Avatar Drive & audit login |

#### 3. Sheet `Log_Presensi` (Transaksi Masuk & Selesai Harian)
`Log_ID` (`ABS-YYYYMMDD-NIM-TIPE`), `Server Timestamp`, `Tanggal` (`YYYY-MM-DD`), `Waktu` (`HH:mm:ss WIB`), `NIM_NISN`, `Nama Lengkap`, `Asal Sekolah`, `Tipe Absen` (`IN`/`OUT`), `Koordinat GPS`, `Jarak Ke Bengkel (m)` *(hasil kalkulasi server)*, `Status Geofencing` (`VALID_IN`, `VALID_OUT`, `FLAG_OUT_RADIUS`, `Disetujui Manual HR`), `URL Foto Bukti`.

#### 4. Sheet `Log_Perizinan` (Pengajuan Izin & Sakit)
`Izin_ID` (`IZN-YYYYMMDD-NIM`), `Timestamp`, `Tanggal Izin`, `NIM_NISN`, `Nama Lengkap`, `Kategori` (`Sakit` / `Izin`), `Alasan`, `URL Dokumen SKD (Drive)` *(opsional, `-` jika tanpa lampiran)*, `Status Approval` (`Pending` / `Disetujui` / `Ditolak`), `Disetujui Oleh`, `Catatan Approver`.

#### 5. Sheet `Rekap_Bulanan` (Ringkasan Statistik per Peserta)
`NIM_NISN`, `Nama Lengkap`, `Total Hadir`, `Total Sakit`, `Total Izin`, `Persentase Kehadiran`. Diperbarui otomatis oleh server saat presensi `IN` maupun saat Admin menyetujui (`Disetujui`) izin/sakit.

#### 6. Sheet `Config_Cabang` (Konfigurasi Geofencing 5 Cabang)
`ID_Cabang`, `Nama Cabang Workshop`, `Kota / Wilayah`, `Alamat Lengkap`, `Latitude`, `Longitude`, `Radius_Meter`, `Terakhir Diupdate`, `Diupdate Oleh`.

### 4.2. Folder Google Drive
1. `Foto_Presensi_PKL` — Penyimpanan foto bukti presensi (jika digunakan).
2. `Foto_Profil_PKL` — Penyimpanan foto profil peserta PKL & Admin.
3. `Dokumen_SKD_PKL` — Penyimpanan lampiran opsional (JPG/PNG/PDF) pengajuan Sakit/Izin.

---

## 5. Spesifikasi Fitur & Menu (Dual-Role: User vs Admin)

Aplikasi memiliki **5 Tab Utama** (Sidebar di Desktop, Bottom Navbar di Mobile) yang secara dinamis menyesuaikan konten berdasarkan peran (`student` vs `admin`):

### 5.1. Mode Siswa PKL (`student`)
1. **Beranda (`view-dashboard`):**
   - Hero Banner Astra Daihatsu.
   - 4 Kartu KPI (`Total Hadir`, `Total Sakit`, `Total Izin`, `Total Jam Kerja`) dengan `tabular-nums`.
   - Peta Interaktif **Status Geofencing Workshop** (Leaflet.js + lingkaran radius + tombol *Bengkel* & *Posisi Saya* + popup informasi cabang dinamis).
   - Kartu **Presensi Hari Ini** (status Jam Masuk & Jam Selesai + tombol pintas presensi).
2. **Presensi (`view-presensi`):**
   - **Sub-Screen 1 (Overview):** Jam digital WIB live, kartu Jam Masuk & Jam Selesai (`--:--`), status jarak GPS + tombol *Cek GPS*, dan tombol CTA utama (*Presensi Masuk* / *Presensi Selesai*). Layout 2 kolom proporsional di Desktop.
   - **Sub-Screen 2 (Konfirmasi & Peta):** Detail waktu & tanggal kerja, peta interaktif lengkap dengan **lingkaran radius geofencing** (hijau jika valid, merah jika di luar radius) & titik biru pusat bengkel, alamat reverse-geocoding + Google Plus Code, tombol *Refresh GPS*, dan tombol *Konfirmasi Presensi*.
3. **Izin & Sakit (`view-izin`):**
   - Formulir pengajuan **Sakit** atau **Izin Keperluan** dengan Custom Date Picker, input alasan detail, dan dropzone unggah dokumen pendukung (JPG/PNG/PDF maks 2 MB) yang bersifat **opsional** untuk keduanya.
   - Panel panduan pengajuan di sisi kanan (tampilan Desktop 2 kolom).
4. **Rekap Kehadiran (`view-rekap`):**
   - Filter kategori (Semua, Hadir, Sakit, Izin) via Custom Dropdown + tombol **Cetak / Export PDF** (format laporan siap cetak dengan kop resmi & kolom tanda tangan).
   - Tampilan kartu kompak di Mobile dan tabel terstruktur di Desktop (Clock In & Clock Out berdampingan dalam 1 baris + durasi kerja).
5. **Pengaturan & Profil (`view-pengaturan`):**
   - **Executive Digital ID Card** profil peserta (avatar Drive dengan fallback inisial dinamis jika foto kosong/gagal muat, badge verifikasi, identitas sekolah/jurusan/cabang/kontak).
   - Informasi penempatan cabang & radius aktif (read-only untuk siswa).
   - Sub-halaman **Edit Informasi Profil** (ubah data & unggah foto profil) dan **Ubah Kata Sandi** (verifikasi sandi lama ke server).
   - Kartu instalasi PWA & tombol **Keluar Akun**.

### 5.2. Mode Admin / HRD (`admin`)
1. **Beranda (`view-dashboard`):**
   - 4 Kartu KPI Organisasi (`Total Siswa PKL`, `Hadir Hari Ini`, `Inbox Persetujuan`, `Cabang PKL: 5 Cabang`).
   - Peta **Monitoring Geofence Cabang** + kartu **Riwayat Presensi Terkini Hari Ini**.
2. **Inbox Persetujuan (`view-izin`):**
   - Filter status (`Semua`, `Pending`, `Disetujui`, `Ditolak`) dengan badge counter live.
   - Kartu permohonan izin/sakit siswa lengkap dengan alasan, tombol preview lampiran berkas/SKD, serta tombol aksi **Setujui** / **Tolak** yang langsung menyinkronkan ke `Log_Perizinan` & `Rekap_Bulanan`.
3. **Data Siswa PKL (`view-presensi`):**
   - Statistik cepat (Total Peserta, Hadir Hari Ini, Izin/Sakit, Total Sekolah/Kampus).
   - Direktori peserta PKL (tabel Desktop & kartu Mobile) dengan status shift hari ini (*Lengkap*, *Sedang Shift*, *Izin/Sakit*, *Belum Masuk*).
   - Aksi per siswa: **Lihat Rekap**, **Input Presensi Manual HR** (Custom Dropdown + Custom Date/Time Picker), **Tambah Siswa Baru**, dan **Hapus Siswa**.
4. **Rekap Semua (`view-rekap`):**
   - Rekap kehadiran seluruh peserta PKL lintas cabang dengan filter kategori & filter per siswa, serta Export PDF.
5. **Pengaturan (`view-pengaturan`):**
   - Profil Admin tersinkron 2 arah dengan sheet `Admin`, Edit Profil, Ubah Kata Sandi.
   - Panel **Titik Pusat & Radius Bengkel (Khusus Admin)**: pilih salah satu dari 5 cabang, ubah Latitude/Longitude, atur toleransi radius via slider (`30m–300m`) atau 4 tombol preset dinamis (`70m`, `100m`, `150m`, `200m`), tombol **Gunakan Lokasi Saya Saat Ini** (Kalibrasi GPS), **Reset Default**, dan **Simpan Parameter Geofencing** (otomatis tersinkron ke `Config_Cabang` & seluruh akun siswa).

---

## 6. Kontrak API (Endpoint & Actions)

Seluruh komunikasi frontend dilakukan via `POST /api/presensi` (`Content-Type: application/json`, `cache: 'no-store'`) yang diteruskan oleh Vercel Proxy ke `Code.gs`:

| `action` | Hak Akses | Deskripsi |
| :--- | :--- | :--- |
| `login_user` | Publik | Verifikasi login Admin/Siswa (Salted SHA-256 + rate limit), mengembalikan profil user, `sessionToken`, & `branchConfigs`. |
| `register_siswa` | Publik | Mendaftarkan peserta PKL baru ke `Master_PKL` + upload avatar opsional ke Drive, mengembalikan `sessionToken` siswa. |
| `get_admin_data` | Authenticated | Mengambil data sinkronisasi. Jika `sessionToken` Admin valid → semua data (tanpa password). Jika siswa → hanya data milik NIM sendiri + `branchConfigs`. |
| `presensi` | Siswa | Mencatat Clock IN/OUT ke `Log_Presensi` + validasi Haversine server-side terhadap `Config_Cabang` + update `Rekap_Bulanan`. |
| `izin_sakit` | Siswa | Mencatat pengajuan Sakit/Izin ke `Log_Perizinan` + upload lampiran opsional (JPG/PNG/PDF) ke Drive. |
| `update_profil` | Authenticated | Memperbarui profil, foto profil Drive, atau kata sandi (wajib sesi Admin jika mengubah sheet `Admin`). |
| `approve_izin` | **Khusus Admin** | Mengubah status izin (`Disetujui`/`Ditolak`), mencatat nama approver, & memperbarui `Rekap_Bulanan`. |
| `presensi_manual` | **Khusus Admin** | Mencatat presensi manual HRD ke `Log_Presensi` & memperbarui `Rekap_Bulanan`. |
| `save_branch_config` | **Khusus Admin** | Menyimpan koordinat & radius cabang ke `Config_Cabang` agar tersinkron ke seluruh siswa. |

Endpoint tambahan:
- `GET /api/presensi` — Status kesehatan proxy & konfigurasi `GAS_URL`.
- `GET /api/geocode?lat=...&lng=...` — Reverse geocoding alamat & Google Plus Code.

---

## 7. Arsitektur Keamanan (10/10 Kontrol Terimplementasi)

1. **Zero Hardcoded Credentials & Secrets:** Tidak ada password atau token rahasia di `index.html`; `GAS_SECRET_CODE` hanya disimpan di Environment Variables Vercel dan disisipkan otomatis di sisi server (`api/presensi.js`).
2. **Penghapusan Kebocoran Password & Data Scoping:** Backend tidak pernah mengembalikan kolom `password` pada API respons, dan membatasi data siswa hanya untuk NIM yang bersangkutan.
3. **Signed Session Token (HMAC-SHA256) & Server-Side RBAC:** Setiap login menerbitkan token bertanda tangan HMAC-SHA256 (berlaku 7 hari). Aksi Admin (`approve_izin`, `presensi_manual`, `save_branch_config`, edit sheet `Admin`) diverifikasi langsung di server.
4. **Server-Side Geofencing Validation:** Jarak Haversine dihitung ulang di `Code.gs` terhadap `Config_Cabang` (anti-bypass DevTools/Inspect Element).
5. **Anti-SSRF Proxy:** `api/presensi.js` memprioritaskan `process.env.GAS_URL`, memblokir domain di luar `https://script.google.com/macros/s/...`, dan tidak pernah menyisipkan secret token server ke URL kiriman client.
6. **Proteksi Stored XSS:** Seluruh data pengguna yang dirender ke `.innerHTML` disanitasi melalui `escapeHtml()`, `escapeJsAttr()`, dan `sanitizeMediaUrl()`.
7. **Pembersihan `localStorage`:** Password dan secret token tidak pernah disimpan di `localStorage`; sesi & cache sensitif dibersihkan otomatis saat logout.
8. **CORS Ketat:** `api/presensi.js` dan `api/geocode.js` hanya mengizinkan origin resmi (`*.vercel.app`, `localhost`, atau `ALLOWED_ORIGIN`).
9. **Salted SHA-256 Password Hashing & Login Rate Limiting:** Password di-hash dengan salt acak (`sha256$<salt>$<hex>`) dengan auto-upgrade dari akun lama, serta pembatasan 5x gagal login / 5 menit via `CacheService`.
10. **Tes Koneksi Aman:** Uji koneksi backend menggunakan `GET /api/presensi` tanpa pernah menempelkan token di query string URL.

---

## 8. Sistem Desain UI/UX (Design System)

- **Palet Warna Resmi:**
  - Brand Navy: `#0d1a3a` (Sidebar, Digital ID Card, Header Aksen)
  - Primary Action Blue: `#1d4ed8` / Hover `#1e40af` (CTA, Active Tab, Focus Ring)
  - Daihatsu Accent Red: `#dc2626` (Pin Workshop, Sakit, Aksi Destruktif)
  - Semantic Status: Emerald (`#10b981` Valid/Hadir), Amber (`#d97706` Pending/Keamanan), Slate (`#0f172a`–`#64748b` Teks WCAG AA).
- **Tipografi:** `Plus Jakarta Sans` (400–800) dengan `tabular-nums` pada seluruh jam, angka KPI, jarak, dan NIM.
- **Standar Komponen:** Card `rounded-2xl`, Button/Input `rounded-xl` (tinggi sentuh minimal `40px–48px`), Badge `rounded-full`, Global Custom Dropdown Engine, Global Custom Date & Time Picker, dan Global Footer seragam (`© 2026 Sistem Presensi PKL – Daihatsu DSO LAMPUNG`).

---

## 9. Panduan Pembuatan Website Langkah demi Langkah (Step-by-Step)

Bagian ini dapat dijadikan acuan langsung untuk bab **Implementasi Sistem** pada Laporan PKL:

### Tahap 1: Persiapan Database & Cloud Storage (Google Workspace)
1. Buat **Google Spreadsheet** baru di Google Drive dengan nama `Database Presensi PKL`, lalu catat **Spreadsheet ID** dari URL-nya.
2. Buat 3 folder di Google Drive (`Foto_Presensi_PKL`, `Foto_Profil_PKL`, `Dokumen_SKD_PKL`) dengan izin *Anyone with the link → Viewer*, lalu catat masing-masing **Folder ID**.

### Tahap 2: Pembuatan Backend REST API (Google Apps Script)
1. Dari Spreadsheet, buka menu **Extensions → Apps Script**.
2. Tempelkan seluruh kode backend (`Code.gs`), isi konstanta `SPREADSHEET_ID`, 3 `FOLDER_*_ID`, dan `API_SECRET_TOKEN` (string acak minimal 32 karakter).
3. Jalankan fungsi `setupDatabaseSheets` sekali dari toolbar editor Apps Script untuk membuat dan memformat otomatis 6 sheet (`Master_PKL`, `Admin`, `Log_Presensi`, `Log_Perizinan`, `Rekap_Bulanan`, `Config_Cabang`).
4. Klik **Deploy → New deployment → Web app** (*Execute as: Me*, *Who has access: Anyone*), lalu salin **Web App URL** (`https://script.google.com/macros/s/.../exec`).

### Tahap 3: Pembangunan Frontend PWA & Vercel Proxy
1. Buat repositori GitHub dan struktur file (`index.html`, `sw.js`, `manifest.json`, `vercel.json`, `api/presensi.js`, `api/geocode.js`, dan folder `Image/`).
2. Bangun antarmuka SPA responsif di `index.html`:
   - Layout shell: Desktop Sidebar + Sticky Topbar + 5 Section Views + Global Footer + Mobile Bottom Navbar.
   - Integrasikan **Leaflet.js** untuk peta geofencing + lingkaran radius + reverse geocoding `/api/geocode`.
   - Implementasikan **Global Custom Dropdown** & **Custom Date/Time Picker** agar tampilan konsisten di Android, iOS, dan Desktop.
   - Implementasikan helper keamanan (`escapeHtml`, `escapeJsAttr`, `sanitizeMediaUrl`, `getAuthSessionToken`).
3. Konfigurasikan `manifest.json` dan Service Worker (`sw.js`) agar aset statis ter-cache dengan baik sementara endpoint `/api/` selalu mengambil data langsung dari server (`network-only`).
4. Buat `api/presensi.js` sebagai jembatan aman antara frontend dan Google Apps Script (mengatasi CORS, memvalidasi origin, mencegah SSRF, dan menyisipkan `GAS_SECRET_CODE` di sisi server).

### Tahap 4: Deployment ke Vercel & Konfigurasi Environment Variables
1. Hubungkan repositori GitHub ke **Vercel** (Framework Preset: *Other / Static*, Root Directory: `./`).
2. Masuk ke **Vercel Dashboard → Project Settings → Environment Variables**, lalu tambahkan:
   - `GAS_URL` = URL Web App Google Apps Script dari Tahap 2.
   - `GAS_SECRET_CODE` = Kode rahasia yang sama persis dengan `API_SECRET_TOKEN` di `Code.gs`.
   - `ALLOWED_ORIGIN` *(opsional)* = Domain produksi Vercel Anda.
3. Lakukan **Deploy / Redeploy** agar Vercel membangun frontend beserta Serverless Functions (`/api/presensi` & `/api/geocode`).
4. *(Catatan Keamanan Git)* Pastikan file `Code.gs` lokal yang berisi ID Spreadsheet/Drive pribadi **tidak di-commit** ke repositori GitHub publik.

### Tahap 5: Pengujian & Instalasi PWA
1. Uji alur **Siswa PKL**: Registrasi/Login → Cek GPS & Lingkaran Radius → Presensi Masuk (`IN`) & Selesai (`OUT`) → Pengajuan Sakit/Izin tanpa & dengan lampiran → Cek Rekap & Export PDF → Edit Profil & Ganti Kata Sandi.
2. Uji alur **Admin HRD**: Login Admin → Verifikasi KPI (5 Cabang) → Approve/Reject Inbox Perizinan → Tambah/Hapus Siswa & Input Presensi Manual → Ubah Radius Geofencing & verifikasi persistensi setelah reload.
3. Uji instalasi **PWA**: Buka URL Vercel di Chrome Android / Safari iOS → klik **Install App / Add to Home Screen** → pastikan aplikasi berjalan *standalone* seperti aplikasi native.

---

## 10. Rekomendasi Struktur Bab untuk Laporan PKL

Jika dokumen ini digunakan untuk menyusun **Laporan PKL**, berikut pemetaan materinya:
- **BAB I Pendahuluan:** Ambil dari **Bagian 1** (Latar Belakang, Rumusan Masalah, Tujuan, Ruang Lingkup).
- **BAB II Landasan Teori:** Ambil dari **Bagian 2.2** (PWA, Geofencing, Rumus Haversine pada **Bagian 3**, Serverless REST API, HMAC-SHA256 & Salted SHA-256).
- **BAB III Analisis & Perancangan Sistem:** Ambil dari **Bagian 2.1** (Diagram Arsitektur), **Bagian 4** (Skema 6 Tabel Database & ERD), **Bagian 5** (Use Case Siswa vs Admin), dan **Bagian 8** (Desain UI/UX).
- **BAB IV Implementasi & Pengujian:** Ambil dari **Bagian 6** (Kontrak API), **Bagian 7** (Implementasi Keamanan 10 Kontrol), dan **Bagian 9** (Langkah Pembuatan & Skenario Pengujian Black-Box).
- **BAB V Penutup:** Kesimpulan & saran pengembangan lanjutan (mis. notifikasi WhatsApp/Email otomatis, autentikasi biometrik WebAuthn/Passkey).
