# Product Requirement Document (PRD)
## Project: Sistem Presensi Geofencing & Rekapitulasi Mekanik PKL
**Lokasi Implementasi:** Astra Daihatsu Ahmad Yani, Lampung  
**Arsitektur:** Frontend GitHub Pages (PWA) + Backend Google Apps Script (REST Web App) + Database Google Sheets & Drive Storage

---

## 1. Overview & Core Objectives

Aplikasi ini bertujuan untuk mendigitalkan dan mengamankan alur absensi serta pelaporan kehadiran siswa/mahasiswa PKL (teknisi mekanik) di Astra Daihatsu Ahmad Yani.

### Kunci Solusi:
1. **Anti-Fake Attendance:** Tidak ada fitur upload file dari galeri untuk presensi; wajib menggunakan live camera stream.
2. **Geofencing Presisi:** Validasi radius kantor menggunakan formula Haversine ($\le 70\text{ meter}$ untuk Masuk/IN).
3. **Automated Geotag Watermark:** Menempelkan metadata identitas, koordinat GPS, timestamp, dan lokasi bengkel langsung ke foto via HTML5 Canvas sebelum transmisi data.
4. **Logika Dual Clock (IN & OUT):**
   - **Clock IN:** Wajib berada di **dalam** radius workshop ($\le 70\text{ m}$).
   - **Clock OUT:** Dilakukan saat selesai kerja / meninggalkan perimeter workshop ($> 70\text{ m}$) atau selesai shift.
5. **Manajemen Izin & Sakit:** Wajib mengunggah bukti Surat Keterangan Dokter (SKD) untuk sakit atau bukti dispensasi untuk izin keperluan.
6. **Zero-Cost Serverless Backend:** Menggunakan Google Apps Script untuk menerima JSON payload, menyimpan foto ke Google Drive, dan mencatat baris data ke Google Sheets secara real-time.

---

## 2. Parameter Geofencing (Astra Daihatsu Ahmad Yani)

- **Alamat:** Jl. Jenderal Ahmad Yani No.1, Palapa, Tanjung Karang Pusat, Kota Bandar Lampung
- **Latitude Resmi:** `-5.4217` *(Catatan: Nilai lama `-5.3932` berada di Rajabasa/Kedaton berjarak 3.26 km, telah dikoreksi ke titik resmi Jl. Ahmad Yani)*
- **Longitude Resmi:** `105.2528`
- **Maksimum Radius Toleransi:** `150 meter` (mencakup showroom depan, area stall service/workshop pit, ruang istirahat, hingga pagar perimeter belakang). Dilengkapi fitur kalibrasi 1-klik di aplikasi.

### Rumus Geodesik Haversine (Implementasi Client & Server):
$$d = 2R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \varphi}{2}\right) + \cos(\varphi_1)\cos(\varphi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
*di mana $R = 6371000\text{ m}$ (radius bumi).*

---

## 3. Database Schema (Google Sheets)

Satu workbook Google Spreadsheet terdiri dari 4 tab sheet:

### Sheet 1: `Master_PKL`
Menyimpan referensi siswa PKL yang berwenang.
| Header Kolom | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `nim_nisn` | String (PK) | Nomor Induk Siswa/Mahasiswa |
| `nama_lengkap` | String | Nama lengkap peserta |
| `instansi` | String | Asal sekolah / kampus (contoh: SMKN 2 Bandar Lampung) |
| `jurusan` | String | Teknik Kendaraan Ringan (TKR) / Otomotif |
| `status_aktif` | Boolean | `TRUE` / `FALSE` |

### Sheet 2: `Log_Presensi`
Menyimpan data transaksi clock-in dan clock-out harian.
| Header Kolom | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `log_id` | String | Format: `ABS-YYYYMMDD-[NIM]-[TIPE]` |
| `server_timestamp`| DateTime | Waktu saat Google Apps Script memproses request |
| `tanggal` | Date | `YYYY-MM-DD` |
| `nim_nisn` | String | Foreign Key ke `Master_PKL` |
| `nama` | String | Nama siswa |
| `tipe` | Enum | `IN` atau `OUT` |
| `device_time` | String | Jam lokal dari HP siswa (`HH:mm:ss`) |
| `lat_long` | String | Contoh: `-5.393200, 105.261900` |
| `jarak_meter` | Number | Jarak kalkulasi dari titik workshop |
| `status_radius` | Enum | `VALID_IN`, `INVALID_IN`, `VALID_OUT`, `FLAG_OUT_RADIUS` |
| `drive_photo_url` | String | Direct link preview foto watermark di Google Drive |

### Sheet 3: `Log_Perizinan`
Menyimpan permohonan izin tidak masuk atau sakit.
| Header Kolom | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `izin_id` | String | Format: `IZN-YYYYMMDD-[NIM]` |
| `timestamp` | DateTime | Waktu pengajuan formulir |
| `tanggal_izin` | Date | Tanggal tidak hadir |
| `nim_nisn` | String | NIM/NISN siswa |
| `nama` | String | Nama siswa |
| `kategori` | Enum | `Sakit` atau `Izin` |
| `alasan` | Text | Penjelasan detail |
| `drive_dokumen_url` | String | URL file foto surat dokter / surat izin di Google Drive |
| `status_approval`| Enum | `Pending`, `Approved`, `Rejected` |

### Sheet 4: `Rekap_Bulanan`
Tabel matriks monitoring kehadiran untuk mentor bengkel dan laporan kampus (Tanggal 01–31, Total Hadir, Total Sakit, Total Izin, Total Jam Kerja).

---

## 4. Spesifikasi Modul & Flow Fungsional

### 4.1. Modul Geolocation & Radar Engine
1. Saat user membuka aplikasi, trigger `navigator.geolocation.getCurrentPosition` dengan opsi `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }`.
2. Hitung jarak pengguna terhadap koordinat bengkel Daihatsu Ahmad Yani.
3. Update UI state:
   - Jika $\text{Jarak} \le 70\text{ m}$: Status hijau *"Dalam Area Bengkel"*, izinkan Clock IN.
   - Jika $\text{Jarak} > 70\text{ m}$: Status merah *"Di Luar Radius Bengkel"*, cegah aksi Clock IN dan tampilkan peringatan dialog.

### 4.2. Modul Kamera & Canvas Watermarking
1. Inisialisasi video feed via `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } })`.
2. Saat tombol "Ambil Foto Presensi" ditekan:
   - Ambil frame video ke elemen `<canvas>`.
   - Gambar background transparan hitam pada area bawah foto ($20\%\text{ tinggi canvas}$).
   - Tulis teks watermark:
     - **Baris 1 (Cyan):** `[CLOCK IN/OUT] {NIM} - {NAMA}`
     - **Baris 2 (Putih):** `WAKTU : {DD-MM-YYYY, HH:mm:ss WIB}`
     - **Baris 3 (Abu-abu terang):** `LOKASI: Workshop Astra Daihatsu Ahmad Yani (Jarak: {X} m)`
     - **Baris 4 (Abu-abu):** `GPS   : Lat {lat}, Long {lng} | Akurasi: ±{acc}m`
   - Konversi canvas menjadi Base64 JPEG dengan kompresi kualitas $0.70$ (target payload $\le 200\text{ KB}$).

### 4.3. Modul Pengajuan Izin/Sakit
1. Radio button toggle: `Sakit` atau `Izin`.
2. Input date picker tanggal izin.
3. Text input alasan keperluan.
4. Input file lampiran bukti:
   - Jika `Sakit`: File SKD (Surat Keterangan Dokter) berstatus **wajib**.
   - Konversi file bukti ke Base64 sebelum dikirim ke backend.

---

## 5. Spesifikasi Kontrak API (Google Apps Script)

Backend Apps Script harus dideploy sebagai **Web App** dengan konfigurasi:
- *Execute as:* **Me (pemilik Google Account)**
- *Who has access:* **Anyone**

Endpoint menerima HTTP POST dengan payload JSON di `e.postData.contents`.

### A. Endpoint Request: Presensi
```json
{
  "action": "presensi",
  "tipe": "IN", // atau "OUT"
  "nim": "12345678",
  "nama": "Andi Pratama",
  "instansi": "SMKN 2 Bandar Lampung",
  "latitude": -5.3932,
  "longitude": 105.2619,
  "jarak": 12,
  "statusRadius": "VALID_IN",
  "deviceTimestamp": "2026-11-11T08:15:32.000Z",
  "fotoBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

### B. Endpoint Request: Pengajuan Izin/Sakit
```json
{
  "action": "izin_sakit",
  "nim": "12345678",
  "nama": "Andi Pratama",
  "jenis": "Sakit", // atau "Izin"
  "tanggal": "2026-11-12",
  "alasan": "Demam berdarah dan rawat inap",
  "fileBase64": "data:image/jpeg;base64,...",
  "fileName": "skd_andi.jpg"
}
```

### C. Respons Server
```json
{
  "status": "success",
  "message": "Presensi IN berhasil dicatat.",
  "fileUrl": "https://drive.google.com/file/d/xxxxx/view"
}
```

---

## 6. Logic Backend Google Apps Script (Snippet Referensi)

File `Code.gs` di Google Apps Script harus mengimplementasikan alur berikut:

```javascript
const SPREADSHEET_ID = "MASUKKAN_SPREADSHEET_ID_DISINI";
const FOLDER_PRESENSI_ID = "MASUKKAN_FOLDER_DRIVE_PRESENSI_ID";
const FOLDER_IZIN_ID = "MASUKKAN_FOLDER_DRIVE_IZIN_ID";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    if (data.action === "presensi") {
      // 1. Simpan Foto Base64 ke Google Drive
      const folder = DriveApp.getFolderById(FOLDER_PRESENSI_ID);
      const cleanBase64 = data.fotoBase64.replace(/^data:image\/(png|jpeg);base64,/, "");
      const decodedBlob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), "image/jpeg", `${data.tipe}_${data.nim}_${Date.now()}.jpg`);
      const file = folder.createFile(decodedBlob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const fileUrl = file.getUrl();

      // 2. Tulis baris ke sheet Log_Presensi
      const sheet = ss.getSheetByName("Log_Presensi");
      const logId = `ABS-${Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd")}-${data.nim}-${data.tipe}`;
      
      sheet.appendRow([
        logId,
        new Date(),
        Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd"),
        data.nim,
        data.nama,
        data.tipe,
        Utilities.formatDate(new Date(), "GMT+7", "HH:mm:ss"),
        `${data.latitude}, ${data.longitude}`,
        data.jarak,
        data.statusRadius,
        fileUrl
      ]);

      return ContentService.createTextOutput(JSON.stringify({ status: "success", fileUrl: fileUrl }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (data.action === "izin_sakit") {
      // Simpan file bukti izin/SKD ke folder izin
      const folder = DriveApp.getFolderById(FOLDER_IZIN_ID);
      let docUrl = "-";
      if (data.fileBase64) {
        const cleanDoc = data.fileBase64.replace(/^data:.*?;base64,/, "");
        const docBlob = Utilities.newBlob(Utilities.base64Decode(cleanDoc), "image/jpeg", `DOC_${data.jenis}_${data.nim}_${Date.now()}.jpg`);
        const docFile = folder.createFile(docBlob);
        docFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        docUrl = docFile.getUrl();
      }

      const sheet = ss.getSheetByName("Log_Perizinan");
      const izinId = `IZN-${Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd")}-${data.nim}`;
      
      sheet.appendRow([
        izinId,
        new Date(),
        data.tanggal,
        data.nim,
        data.nama,
        data.jenis,
        data.alasan,
        docUrl,
        "Pending"
      ]);

      return ContentService.createTextOutput(JSON.stringify({ status: "success", fileUrl: docUrl }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

## 7. Instruksi Konfigurasi PWA (Add to Homescreen)

Untuk memungkinkan instalasi PWA di smartphone:
1. Pastikan project memiliki file `manifest.json` di root direktori dengan field `"display": "standalone"`.
2. Repositori wajib di-host melalui HTTPS (GitHub Pages secara default sudah memenuhi kriteria ini).
3. Pastikan viewport meta-tag terpasang:
   `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`.

---

## 8. Panduan Eksekusi AI Coding Engine (Instruction for Antigravity)

Saat memodifikasi atau menambah fitur pada codebase ini:
1. **Pertahankan Single-File Mandate:** Seluruh antarmuka, komponen Tailwind, skrip geofencing, dan modul kamera harus tetap berada di dalam `index.html` tanpa memecah ke berkas JS/CSS terpisah.
2. **Kepatuhan Geofencing:** Jangan bypass kalkulasi jarak Haversine di client-side. Validasi jarak $\le 70\text{ m}$ harus tetap menjadi pemblokir utama sebelum `submitAttendance` dijalankan.
3. **Pemberian Nama ID & State:** Pertahankan sinkronisasi ID elemen HTML dan key JSON payload agar kompatibel langsung dengan backend Google Apps Script.