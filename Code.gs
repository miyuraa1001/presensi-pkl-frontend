/**
 * =======================================================================
 * GOOGLE APPS SCRIPT - BACKEND PRESENSI & PERIZINAN PKL
 * Astra Daihatsu Ahmad Yani, Lampung
 * =======================================================================
 * 
 * PANDUAN DEPLOYMENT:
 * 1. Buka https://script.google.com dan buat project baru.
 * 2. Salin seluruh isi file ini ke file `Code.gs`.
 * 3. Isi ID Spreadsheet dan ID Folder Google Drive di bawah ini.
 * 4. Klik menu 'Deploy' > 'New deployment' (Penerapan baru).
 * 5. Pilih jenis: 'Web app' (Aplikasi web).
 * 6. Execute as: 'Me' (Email akun Anda).
 * 7. Who has access: 'Anyone' (Siapa saja, bahkan anonim).
 * 8. Klik Deploy, setujui izin akses Google, dan salin Web App URL ke aplikasi!
 */

// GANTI DENGAN ID MILIK ANDA:
const SPREADSHEET_ID = "MASUKKAN_SPREADSHEET_ID_DISINI";
const FOLDER_PRESENSI_ID = "MASUKKAN_FOLDER_DRIVE_PRESENSI_ID";
const FOLDER_IZIN_ID = "MASUKKAN_FOLDER_DRIVE_IZIN_ID";

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Google Apps Script Backend Presensi PKL Astra Daihatsu Ahmad Yani Siap Menerima Request.",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "error", 
        message: "No POST payload received" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // ==========================================
    // ACTION 1: TRANSAKSI PRESENSI (IN / OUT)
    // ==========================================
    if (data.action === "presensi") {
      // 1. Simpan Foto Base64 ke Google Drive
      let fileUrl = "-";
      if (data.fotoBase64) {
        try {
          const folder = DriveApp.getFolderById(FOLDER_PRESENSI_ID);
          const cleanBase64 = data.fotoBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
          const decodedBlob = Utilities.newBlob(
            Utilities.base64Decode(cleanBase64), 
            "image/jpeg", 
            `${data.tipe}_${data.nim}_${Date.now()}.jpg`
          );
          const file = folder.createFile(decodedBlob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fileUrl = file.getUrl();
        } catch (driveErr) {
          fileUrl = "Error saving file: " + driveErr.toString();
        }
      }

      // 2. Pastikan sheet Log_Presensi ada
      let sheet = ss.getSheetByName("Log_Presensi");
      if (!sheet) {
        sheet = ss.insertSheet("Log_Presensi");
        sheet.appendRow([
          "log_id",
          "server_timestamp",
          "tanggal",
          "nim_nisn",
          "nama",
          "tipe",
          "device_time",
          "lat_long",
          "jarak_meter",
          "status_radius",
          "drive_photo_url"
        ]);
      }

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

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: `Presensi ${data.tipe} berhasil dicatat.`,
        fileUrl: fileUrl 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // ==========================================
    // ACTION 2: PENGAJUAN PERIZINAN / SAKIT
    // ==========================================
    if (data.action === "izin_sakit") {
      let docUrl = "-";
      if (data.fileBase64) {
        try {
          const folder = DriveApp.getFolderById(FOLDER_IZIN_ID);
          const cleanDoc = data.fileBase64.replace(/^data:.*?;base64,/, "");
          const mime = data.fileBase64.indexOf("data:application/pdf") !== -1 ? "application/pdf" : "image/jpeg";
          const ext = mime === "application/pdf" ? "pdf" : "jpg";
          const docBlob = Utilities.newBlob(
            Utilities.base64Decode(cleanDoc), 
            mime, 
            `DOC_${data.jenis}_${data.nim}_${Date.now()}.${ext}`
          );
          const docFile = folder.createFile(docBlob);
          docFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          docUrl = docFile.getUrl();
        } catch (driveErr) {
          docUrl = "Error saving doc: " + driveErr.toString();
        }
      }

      let sheet = ss.getSheetByName("Log_Perizinan");
      if (!sheet) {
        sheet = ss.insertSheet("Log_Perizinan");
        sheet.appendRow([
          "izin_id",
          "timestamp",
          "tanggal_izin",
          "nim_nisn",
          "nama",
          "kategori",
          "alasan",
          "drive_dokumen_url",
          "status_approval"
        ]);
      }

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

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: `Pengajuan ${data.jenis} berhasil dicatat.`,
        fileUrl: docUrl 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Aksi tidak dikenali: " + data.action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
