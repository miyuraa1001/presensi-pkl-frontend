/**
 * =======================================================================
 * GOOGLE APPS SCRIPT - BACKEND SISTEM PRESENSI & DATABASE PKL
 * Astra Daihatsu Ahmad Yani, Bandar Lampung
 * =======================================================================
 * 
 * PANDUAN RINGKAS PENYIAPAN:
 * 1. Buat 1 Google Spreadsheet baru di Google Drive Anda.
 * 2. Buat 2 Folder di Google Drive Anda:
 *    - Folder 1: "Foto_Presensi_PKL" (untuk menampung foto kehadiran & watermark)
 *    - Folder 2: "Foto_Profil_PKL"   (untuk menampung foto profil peserta magang)
 * 3. Salin ID Spreadsheet dan kedua ID Folder Drive ke variabel di bawah (baris 23-25).
 * 4. Buka menu Extensions > Apps Script pada Spreadsheet Anda, lalu tempel kode ini.
 * 5. Jalankan fungsi `setupDatabaseSheets` (klik tombol 'Run' / 'Jalankan')
 *    -> Spreadsheet Anda akan otomatis dibuatkan semua sheet dan nama kolom secara rapi!
 * 6. Klik menu 'Deploy' > 'New deployment' (Penerapan baru):
 *    - Tipe: 'Web app'
 *    - Execute as: 'Me' (Email akun Anda)
 *    - Who has access: 'Anyone' (Siapa saja, bahkan anonim)
 * 7. Salin URL Web App yang dihasilkan ke menu Pengaturan di aplikasi Presensi PKL.
 */

// =======================================================================
// KONFIGURASI ID GOOGLE DRIVE & SPREADSHEET (SESUAIKAN DENGAN MILIK ANDA)
// =======================================================================
const SPREADSHEET_ID     = "MASUKKAN_SPREADSHEET_ID_DISINI";
const FOLDER_PRESENSI_ID = "MASUKKAN_ID_FOLDER_FOTO_ABSENSI_DISINI";
const FOLDER_PROFIL_ID   = "MASUKKAN_ID_FOLDER_FOTO_PROFIL_DISINI";

/**
 * Endpoint HTTP GET (Untuk Test Ping & Pengecekan Status Koneksi)
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Google Apps Script Backend Presensi PKL Astra Daihatsu Ahmad Yani Siap Menerima Data.",
    timestamp: new Date().toISOString(),
    spreadsheetIdConfigured: SPREADSHEET_ID !== "MASUKKAN_SPREADSHEET_ID_DISINI"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Endpoint HTTP POST (Pusat Penerima Transaksi dari Web App Presensi)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "error", 
        message: "Payload kosong (No POST contents received)" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // ===================================================================
    // 1. ACTION: PRESENSI (Clock IN & Clock OUT)
    // ===================================================================
    if (data.action === "presensi") {
      let photoUrl = "-";
      
      // Simpan Foto Base64 Presensi ke Google Drive (Folder Presensi)
      if (data.fotoBase64) {
        try {
          const folderPresensi = DriveApp.getFolderById(FOLDER_PRESENSI_ID);
          const cleanBase64 = data.fotoBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
          const timeStampStr = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");
          const fileName = `ABSEN_${data.tipe}_${data.nim}_${timeStampStr}.jpg`;
          
          const decodedBlob = Utilities.newBlob(
            Utilities.base64Decode(cleanBase64), 
            "image/jpeg", 
            fileName
          );
          const file = folderPresensi.createFile(decodedBlob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          photoUrl = file.getUrl();
        } catch (driveErr) {
          photoUrl = "Error upload foto: " + driveErr.toString();
        }
      }

      // Pastikan Sheet Log_Presensi Tersedia
      let sheetPresensi = ss.getSheetByName("Log_Presensi");
      if (!sheetPresensi) {
        sheetPresensi = createLogPresensiSheet(ss);
      }

      const now = new Date();
      const tanggalStr = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd");
      const jamStr = Utilities.formatDate(now, "GMT+7", "HH:mm:ss") + " WIB";
      const logId = `ABS-${Utilities.formatDate(now, "GMT+7", "yyyyMMdd")}-${data.nim}-${data.tipe}`;
      const koordinatStr = (data.latitude && data.longitude) ? `${data.latitude}, ${data.longitude}` : "-";

      // Append Transaksi ke Log_Presensi
      sheetPresensi.appendRow([
        logId,
        now,
        tanggalStr,
        jamStr,
        data.nim || "-",
        data.nama || "-",
        data.instansi || "-",
        data.tipe || "-",
        koordinatStr,
        data.jarak || 0,
        data.statusRadius || "-",
        photoUrl
      ]);

      // Update / Increment Rekap Kehadiran
      updateRekapBulanan(ss, data.nim, data.nama, data.tipe === "IN" ? "hadir" : "pulang");

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: `Presensi ${data.tipe} untuk ${data.nama} berhasil dicatat.`,
        logId: logId,
        fileUrl: photoUrl 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // ===================================================================
    // 2. ACTION: UPDATE PROFIL & FOTO PROFIL SISWA
    // ===================================================================
    if (data.action === "update_profil") {
      let avatarUrl = "-";

      // Jika ada foto profil baru dalam format base64
      if (data.fotoBase64 && data.fotoBase64.startsWith("data:image")) {
        try {
          const folderProfil = DriveApp.getFolderById(FOLDER_PROFIL_ID);
          const cleanBase64 = data.fotoBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
          const fileName = `PROFIL_${data.nim}_${Date.now()}.jpg`;

          const decodedBlob = Utilities.newBlob(
            Utilities.base64Decode(cleanBase64),
            "image/jpeg",
            fileName
          );
          const file = folderProfil.createFile(decodedBlob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          avatarUrl = file.getUrl();
        } catch (avatarErr) {
          avatarUrl = "Error upload avatar: " + avatarErr.toString();
        }
      }

      let sheetMaster = ss.getSheetByName("Master_PKL");
      if (!sheetMaster) {
        sheetMaster = createMasterPKLSheet(ss);
      }

      // Cek apakah NIM siswa sudah terdaftar di Master_PKL (Upsert)
      const dataRows = sheetMaster.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < dataRows.length; i++) {
        if (dataRows[i][0] && dataRows[i][0].toString() === data.nim.toString()) {
          rowIndex = i + 1; // 1-based index
          break;
        }
      }

      const now = new Date();
      if (rowIndex > 1) {
        // Update baris yang sudah ada
        sheetMaster.getRange(rowIndex, 2).setValue(data.nama || "-");
        sheetMaster.getRange(rowIndex, 3).setValue(data.instansi || "-");
        sheetMaster.getRange(rowIndex, 4).setValue(data.jurusan || "-");
        if (avatarUrl !== "-") {
          sheetMaster.getRange(rowIndex, 5).setValue(avatarUrl);
        }
        sheetMaster.getRange(rowIndex, 7).setValue(now);
      } else {
        // Siswa baru -> Tambah baris baru
        sheetMaster.appendRow([
          data.nim || "-",
          data.nama || "-",
          data.instansi || "-",
          data.jurusan || "-",
          avatarUrl,
          "Aktif",
          now
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: `Profil siswa ${data.nama} berhasil diperbarui di Master_PKL.`,
        avatarUrl: avatarUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ===================================================================
    // 3. ACTION: PENGAJUAN PERIZINAN / SAKIT
    // ===================================================================
    if (data.action === "izin_sakit") {
      let docUrl = "-";

      // Upload Bukti Surat Dokter / Dokumen ke Drive
      if (data.fileBase64) {
        try {
          const folderPresensi = DriveApp.getFolderById(FOLDER_PRESENSI_ID);
          const cleanDoc = data.fileBase64.replace(/^data:.*?;base64,/, "");
          const mime = data.fileBase64.indexOf("data:application/pdf") !== -1 ? "application/pdf" : "image/jpeg";
          const ext = mime === "application/pdf" ? "pdf" : "jpg";
          const fileName = `BUKTI_${data.jenis}_${data.nim}_${Date.now()}.${ext}`;

          const docBlob = Utilities.newBlob(
            Utilities.base64Decode(cleanDoc), 
            mime, 
            fileName
          );
          const docFile = folderPresensi.createFile(docBlob);
          docFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          docUrl = docFile.getUrl();
        } catch (driveErr) {
          docUrl = "Error upload bukti: " + driveErr.toString();
        }
      }

      let sheetIzin = ss.getSheetByName("Log_Perizinan");
      if (!sheetIzin) {
        sheetIzin = createLogPerizinanSheet(ss);
      }

      const now = new Date();
      const izinId = `IZN-${Utilities.formatDate(now, "GMT+7", "yyyyMMdd")}-${data.nim}`;
      
      sheetIzin.appendRow([
        izinId,
        now,
        data.tanggal || Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd"),
        data.nim || "-",
        data.nama || "-",
        data.jenis || "-",
        data.alasan || "-",
        docUrl,
        "Pending"
      ]);

      // Update Rekap
      if (data.jenis === "Sakit") {
        updateRekapBulanan(ss, data.nim, data.nama, "sakit");
      } else {
        updateRekapBulanan(ss, data.nim, data.nama, "izin");
      }

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: `Pengajuan ${data.jenis} berhasil dicatat.`,
        izinId: izinId,
        fileUrl: docUrl 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Action tidak dikenali: " + data.action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// =======================================================================
// FUNGSI BANTU UPDATE REKAPITULASI BULANAN OTOMATIS
// =======================================================================
function updateRekapBulanan(ss, nim, nama, tipe) {
  let sheetRekap = ss.getSheetByName("Rekap_Bulanan");
  if (!sheetRekap) {
    sheetRekap = createRekapBulananSheet(ss);
  }

  const rows = sheetRekap.getDataRange().getValues();
  let foundIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].toString() === nim.toString()) {
      foundIndex = i + 1;
      break;
    }
  }

  if (foundIndex > 1) {
    let curHadir = rows[foundIndex - 1][2] || 0;
    let curSakit = rows[foundIndex - 1][3] || 0;
    let curIzin  = rows[foundIndex - 1][4] || 0;

    if (tipe === "hadir") curHadir++;
    if (tipe === "sakit") curSakit++;
    if (tipe === "izin")  curIzin++;

    const totalHari = curHadir + curSakit + curIzin;
    const persentase = totalHari > 0 ? Math.round((curHadir / totalHari) * 100) + "%" : "100%";

    sheetRekap.getRange(foundIndex, 3).setValue(curHadir);
    sheetRekap.getRange(foundIndex, 4).setValue(curSakit);
    sheetRekap.getRange(foundIndex, 5).setValue(curIzin);
    sheetRekap.getRange(foundIndex, 6).setValue(persentase);
    sheetRekap.getRange(foundIndex, 7).setValue(new Date());
  } else {
    let hadir = (tipe === "hadir") ? 1 : 0;
    let sakit = (tipe === "sakit") ? 1 : 0;
    let izin  = (tipe === "izin")  ? 1 : 0;
    sheetRekap.appendRow([
      nim,
      nama,
      hadir,
      sakit,
      izin,
      "100%",
      new Date()
    ]);
  }
}

// =======================================================================
// FUNGSI OTOMATIS GENERATE DATABASE & TABEL (CUKUP JALANKAN 1 KALI)
// =======================================================================
/**
 * Jalankan fungsi ini langsung dari editor Apps Script untuk membuat semua sheet
 * dan nama kolom secara otomatis dengan styling resmi Astra Daihatsu!
 */
function setupDatabaseSheets() {
  if (SPREADSHEET_ID === "MASUKKAN_SPREADSHEET_ID_DISINI") {
    throw new Error("Silakan masukkan SPREADSHEET_ID Anda di baris 23 sebelum menjalankan fungsi ini!");
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  createMasterPKLSheet(ss);
  createLogPresensiSheet(ss);
  createLogPerizinanSheet(ss);
  createRekapBulananSheet(ss);

  Logger.log("Selamat! Seluruh database presensi Astra Daihatsu Ahmad Yani berhasil dibuat secara otomatis.");
}

function createMasterPKLSheet(ss) {
  let sheet = ss.getSheetByName("Master_PKL");
  if (!sheet) sheet = ss.insertSheet("Master_PKL");
  
  sheet.clear();
  const headers = [
    "NIM / NISN", 
    "Nama Lengkap Siswa", 
    "Asal Sekolah / Kampus", 
    "Jurusan / Keahlian", 
    "URL Foto Profil (Drive)", 
    "Status Magang", 
    "Waktu Update Terakhir"
  ];
  sheet.appendRow(headers);
  formatHeaderRow(sheet, headers.length, "#0d1a3a"); // Navy Daihatsu
  return sheet;
}

function createLogPresensiSheet(ss) {
  let sheet = ss.getSheetByName("Log_Presensi");
  if (!sheet) sheet = ss.insertSheet("Log_Presensi");

  sheet.clear();
  const headers = [
    "Log ID",
    "Server Timestamp",
    "Tanggal",
    "Waktu (WIB)",
    "NIM / NISN",
    "Nama Lengkap",
    "Asal Sekolah",
    "Tipe Presensi (IN / OUT)",
    "Koordinat GPS",
    "Jarak ke Bengkel (Meter)",
    "Status Geofence Radius",
    "URL Bukti Foto (Drive)"
  ];
  sheet.appendRow(headers);
  formatHeaderRow(sheet, headers.length, "#dc2626"); // Red Daihatsu
  return sheet;
}

function createLogPerizinanSheet(ss) {
  let sheet = ss.getSheetByName("Log_Perizinan");
  if (!sheet) sheet = ss.insertSheet("Log_Perizinan");

  sheet.clear();
  const headers = [
    "Izin ID",
    "Timestamp Pengajuan",
    "Tanggal Izin",
    "NIM / NISN",
    "Nama Lengkap",
    "Kategori (Sakit / Izin)",
    "Alasan / Keterangan",
    "URL Dokumen SKD (Drive)",
    "Status Persetujuan"
  ];
  sheet.appendRow(headers);
  formatHeaderRow(sheet, headers.length, "#0d1a3a");
  return sheet;
}

function createRekapBulananSheet(ss) {
  let sheet = ss.getSheetByName("Rekap_Bulanan");
  if (!sheet) sheet = ss.insertSheet("Rekap_Bulanan");

  sheet.clear();
  const headers = [
    "NIM / NISN",
    "Nama Siswa",
    "Total Hadir (Hari)",
    "Total Sakit (Hari)",
    "Total Izin (Hari)",
    "Persentase Kehadiran",
    "Terakhir Presensi"
  ];
  sheet.appendRow(headers);
  formatHeaderRow(sheet, headers.length, "#16a34a"); // Green Success
  return sheet;
}

function formatHeaderRow(sheet, numCols, bgColorHex) {
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setFontWeight("bold");
  headerRange.setFontColor("#FFFFFF");
  headerRange.setBackground(bgColorHex);
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  for (let c = 1; c <= numCols; c++) {
    sheet.autoResizeColumn(c);
  }
}
