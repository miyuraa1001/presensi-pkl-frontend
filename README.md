# Presensi PKL Daihatsu — Frontend

Frontend statis berbasis HTML, CSS, dan JavaScript murni. Tidak memerlukan npm atau build step.

## Menjalankan
- Buka `index.html` untuk melihat dashboard.
- Untuk menguji kamera, GPS, dan PWA, jalankan melalui HTTPS atau localhost.
- Deploy seluruh isi folder ini ke GitHub Pages.

## Catatan integrasi
Versi ini adalah prototipe frontend. Data dashboard masih contoh. Belum ada koneksi ke Google Apps Script, Google Sheets, atau Google Drive. Hubungkan tombol `submitAttendance` dan `submitLeave` ke endpoint Web App Apps Script, dan validasi ulang timestamp, koordinat, radius, identitas, serta file di sisi server.

## Keamanan
- `localStorage` tidak digunakan untuk menyimpan PIN/password.
- Validasi GPS di browser tidak dapat dianggap anti-spoofing; backend perlu memvalidasi data dan menandai anomali.
- Jangan menyimpan PIN mentah di Google Sheets; gunakan mekanisme autentikasi yang aman.
