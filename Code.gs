/**
 * =======================================================================
 * GOOGLE APPS SCRIPT - BACKEND SISTEM PRESENSI & DATABASE PKL
 * Astra Daihatsu Ahmad Yani, Bandar Lampung
 * =======================================================================
 * 
 * PANDUAN RINGKAS PENYIAPAN:
 * 1. Buat 1 Google Spreadsheet baru di Google Drive Anda.
 * 2. Buat 3 Folder di Google Drive Anda:
 *    - Folder 1: "Foto_Presensi_PKL" (untuk menampung foto kehadiran & watermark presensi)
 *    - Folder 2: "Foto_Profil_PKL"   (untuk menampung foto profil peserta magang)
 *    - Folder 3: "Dokumen_SKD_PKL"   (untuk menampung berkas/foto surat sakit & Surat Keterangan Dokter)
 *    (Tips: Anda juga bisa menjalankan fungsi `createDriveFoldersAutomated` di bawah untuk membuat ke-3 folder ini secara otomatis!)
 * 3. Salin ID Spreadsheet dan ketiga ID Folder Drive ke variabel di bawah (baris 28-31).
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
// KONFIGURASI ID GOOGLE DRIVE, SPREADSHEET & SECRET CODE KEAMANAN
// =======================================================================
const SPREADSHEET_ID     = "MASUKKAN_SPREADSHEET_ID_DISINI";
const FOLDER_PRESENSI_ID = "MASUKKAN_ID_FOLDER_FOTO_ABSENSI_DISINI";
const FOLDER_PROFIL_ID   = "MASUKKAN_ID_FOLDER_FOTO_PROFIL_DISINI";
const FOLDER_SKD_ID      = "MASUKKAN_ID_FOLDER_SURAT_DOKTER_SKD_DISINI";

/**
 * SECRET CODE KEAMANAN (SESUAIKAN DENGAN ENVIRONMENT VARIABLE DI VERCEL)
 * Masukkan kode rahasia yang sama pada Environment Variable Vercel (GAS_SECRET_CODE)
 * Default: "DAIHATSU_PKL_SEC_2026"
 */
const API_SECRET_TOKEN   = "DAIHATSU_PKL_SEC_2026";

/**
 * Endpoint HTTP GET (Untuk Test Ping & Pengecekan Status Koneksi)
 */
function doGet(e) {
  const incomingToken = e && e.parameter ? (e.parameter.secretToken || e.parameter.secret) : null;
  const isAuthorized = !API_SECRET_TOKEN || API_SECRET_TOKEN === "MASUKKAN_SECRET_CODE_DISINI" || incomingToken === API_SECRET_TOKEN;

  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Google Apps Script Backend Presensi PKL Astra Daihatsu Ahmad Yani Siap Menerima Data.",
    timestamp: new Date().toISOString(),
    spreadsheetIdConfigured: SPREADSHEET_ID !== "MASUKKAN_SPREADSHEET_ID_DISINI",
    secretProtectionActive: Boolean(API_SECRET_TOKEN && API_SECRET_TOKEN !== "MASUKKAN_SECRET_CODE_DISINI"),
    authorized: isAuthorized
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

    // ===================================================================
    // 0. VALIDASI SECRET CODE (KEAMANAN DARI AKSES TIDAK RESMI)
    // ===================================================================
    if (API_SECRET_TOKEN && API_SECRET_TOKEN !== "MASUKKAN_SECRET_CODE_DISINI") {
      const incomingToken = data.secretToken || data.secretKey || data.secret || (e.parameter && e.parameter.secret);
      if (incomingToken !== API_SECRET_TOKEN) {
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "error", 
          message: "Akses Ditolak (Unauthorized): Secret Code tidak valid! Pastikan variabel GAS_SECRET_CODE di Vercel sesuai dengan Code.gs." 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

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
    // 3. ACTION: PENGAJUAN PERIZINAN / SAKIT & SURAT DOKTER (SKD)
    // ===================================================================
    if (data.action === "izin_sakit") {
      let docUrl = "-";

      // Upload Bukti Surat Dokter / Dokumen SKD ke Google Drive (Folder SKD)
      if (data.fileBase64) {
        try {
          // Gunakan FOLDER_SKD_ID jika sudah dikonfigurasi, atau fallback ke FOLDER_PRESENSI_ID
          const targetFolderId = (FOLDER_SKD_ID && FOLDER_SKD_ID !== "MASUKKAN_ID_FOLDER_SURAT_DOKTER_SKD_DISINI")
            ? FOLDER_SKD_ID
            : FOLDER_PRESENSI_ID;

          const folderSKD = DriveApp.getFolderById(targetFolderId);
          const cleanDoc = data.fileBase64.replace(/^data:.*?;base64,/, "");
          const isPdf = data.fileBase64.indexOf("data:application/pdf") !== -1 || (data.fileName && data.fileName.toLowerCase().endsWith(".pdf"));
          const mime = isPdf ? "application/pdf" : "image/jpeg";
          const ext = isPdf ? "pdf" : "jpg";
          const timeStampStr = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");
          const safeJenis = (data.jenis || "IZIN").replace(/\s+/g, "_").toUpperCase();
          const fileName = `SKD_${safeJenis}_${data.nim}_${timeStampStr}.${ext}`;

          const docBlob = Utilities.newBlob(
            Utilities.base64Decode(cleanDoc), 
            mime, 
            fileName
          );
          const docFile = folderSKD.createFile(docBlob);
          docFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          docUrl = docFile.getUrl();
        } catch (driveErr) {
          docUrl = "Error upload SKD: " + driveErr.toString();
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

    // ===================================================================
    // 4. ACTION: APPROVAL / PERSETUJUAN IZIN & SAKIT OLEH HRD / ADMIN
    // ===================================================================
    if (data.action === "approve_izin") {
      let sheetIzin = ss.getSheetByName("Log_Perizinan");
      if (!sheetIzin) {
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "error", 
          message: "Sheet Log_Perizinan belum dibuat." 
        })).setMimeType(ContentService.MimeType.JSON);
      }

      const rows = sheetIzin.getDataRange().getValues();
      let foundIndex = -1;
      const targetId = data.izinId;

      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] && rows[i][0].toString() === targetId.toString()) {
          foundIndex = i + 1; // 1-based row index
          break;
        }
      }

      if (foundIndex > 1) {
        const newStatus = data.status || "Disetujui"; // 'Disetujui' atau 'Ditolak'
        const approverName = data.adminNama || "HRD Daihatsu";
        const catatan = data.catatan || "-";

        // Kolom 9: Status
        sheetIzin.getRange(foundIndex, 9).setValue(newStatus);
        
        // Kolom 10 & 11: Catatan Approval & Waktu jika tersedia
        sheetIzin.getRange(foundIndex, 10).setValue(approverName);
        sheetIzin.getRange(foundIndex, 11).setValue(catatan);
        sheetIzin.getRange(foundIndex, 12).setValue(new Date());

        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          message: `Permohonan izin ${targetId} berhasil diubah statusnya menjadi ${newStatus}.`,
          izinId: targetId,
          newStatus: newStatus
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: `Data perizinan dengan ID ${targetId} tidak ditemukan.`
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ===================================================================
    // 5. ACTION: GET DATA ADMINISTRASI UNTUK DASHBOARD & REKAP HRD
    // ===================================================================
    if (data.action === "get_admin_data") {
      const result = {
        status: "success",
        timestamp: new Date().toISOString(),
        students: [],
        presensi: [],
        perizinan: [],
        rekap: []
      };

      // 1. Ambil Master Siswa Magang
      const sheetMaster = ss.getSheetByName("Master_PKL");
      if (sheetMaster) {
        const mRows = sheetMaster.getDataRange().getValues();
        for (let i = 1; i < mRows.length; i++) {
          if (mRows[i][0]) {
            const is9Col = mRows[i].length >= 9;
            result.students.push({
              nim: mRows[i][0],
              nama: mRows[i][1] || "-",
              instansi: mRows[i][2] || "-",
              jurusan: mRows[i][3] || "-",
              phone: is9Col ? (mRows[i][4] || "-") : "-",
              avatar: is9Col ? (mRows[i][5] || "") : (mRows[i][4] || ""),
              status: is9Col ? (mRows[i][7] || "Aktif Magang") : (mRows[i][5] || "Aktif Magang"),
              updatedAt: is9Col ? (mRows[i][8] || "") : (mRows[i][6] || "")
            });
          }
        }
      }

      // 2. Ambil Log Presensi Terkini
      const sheetPresensi = ss.getSheetByName("Log_Presensi");
      if (sheetPresensi) {
        const pRows = sheetPresensi.getDataRange().getValues();
        // Ambil data (terbaru di atas)
        for (let i = pRows.length - 1; i >= 1; i--) {
          if (pRows[i][0]) {
            result.presensi.push({
              logId: pRows[i][0],
              timestamp: pRows[i][1],
              tanggal: pRows[i][2],
              waktu: pRows[i][3],
              nim: pRows[i][4],
              nama: pRows[i][5],
              instansi: pRows[i][6],
              tipe: pRows[i][7],
              coords: pRows[i][8],
              jarak: pRows[i][9],
              statusRadius: pRows[i][10],
              photoUrl: pRows[i][11]
            });
            if (result.presensi.length >= 200) break; // Batasi 200 riwayat terkini
          }
        }
      }

      // 3. Ambil Log Perizinan (Inbox HRD)
      const sheetIzin = ss.getSheetByName("Log_Perizinan");
      if (sheetIzin) {
        const iRows = sheetIzin.getDataRange().getValues();
        for (let i = iRows.length - 1; i >= 1; i--) {
          if (iRows[i][0]) {
            result.perizinan.push({
              izinId: iRows[i][0],
              createdAt: iRows[i][1],
              tanggal: iRows[i][2],
              nim: iRows[i][3],
              nama: iRows[i][4],
              jenis: iRows[i][5],
              alasan: iRows[i][6],
              docUrl: iRows[i][7],
              status: iRows[i][8] || "Pending",
              approvedBy: iRows[i][9] || "-",
              approverNote: iRows[i][10] || "-"
            });
          }
        }
      }

      // 4. Ambil Rekap Bulanan
      const sheetRekap = ss.getSheetByName("Rekap_Bulanan");
      if (sheetRekap) {
        const rRows = sheetRekap.getDataRange().getValues();
        for (let i = 1; i < rRows.length; i++) {
          if (rRows[i][0]) {
            result.rekap.push({
              nim: rRows[i][0],
              nama: rRows[i][1],
              hadir: rRows[i][2] || 0,
              sakit: rRows[i][3] || 0,
              izin: rRows[i][4] || 0,
              persentase: rRows[i][5] || "100%"
            });
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // ===================================================================
    // 6. ACTION: PRESENSI MANUAL OLEH HRD / PEMBIMBING BENGKEL
    // ===================================================================
    if (data.action === "presensi_manual") {
      let sheetPresensi = ss.getSheetByName("Log_Presensi");
      if (!sheetPresensi) {
        sheetPresensi = createLogPresensiSheet(ss);
      }

      const now = new Date();
      const tanggalStr = data.tanggal || Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd");
      const jamStr = (data.waktu || Utilities.formatDate(now, "GMT+7", "HH:mm")) + " WIB";
      const logId = `MANUAL-${tanggalStr.replace(/-/g,'')}-${data.nim}-${data.tipe}`;
      
      sheetPresensi.appendRow([
        logId,
        now,
        tanggalStr,
        jamStr,
        data.nim || "-",
        data.nama || "-",
        data.instansi || "-",
        data.tipe || "IN",
        "Presensi Manual HRD",
        0,
        "Disetujui Manual HR",
        "-"
      ]);

      updateRekapBulanan(ss, data.nim, data.nama, data.tipe === "IN" ? "hadir" : "pulang");

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: `Presensi manual ${data.tipe} untuk ${data.nama} berhasil dicatat.`,
        logId: logId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ===================================================================
    // 7. ACTION: REGISTRASI & LENGKAPI PROFIL PESERTA MAGANG BARU
    // ===================================================================
    if (data.action === "register_siswa") {
      let avatarUrl = "-";

      // Upload Foto Profil jika dikirim via base64
      if (data.fotoBase64 && data.fotoBase64.startsWith("data:image")) {
        try {
          const folderProfil = DriveApp.getFolderById(FOLDER_PROFIL_ID);
          const cleanBase64 = data.fotoBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
          const fileName = `REG_PROFIL_${data.nim}_${Date.now()}.jpg`;

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

      // Pastikan struktur header Master_PKL lengkap
      // [NIM / NISN, Nama Lengkap Siswa, Asal Sekolah / Kampus, Jurusan / Keahlian, No. WhatsApp / HP, URL Foto Profil (Drive), Kata Sandi (Akun), Status Magang, Waktu Registrasi / Update]
      const dataRows = sheetMaster.getDataRange().getValues();
      let rowIndex = -1;
      const targetNim = (data.nim || "").toString().trim();

      for (let i = 1; i < dataRows.length; i++) {
        if (dataRows[i][0] && dataRows[i][0].toString().trim() === targetNim) {
          rowIndex = i + 1; // 1-based index
          break;
        }
      }

      const now = new Date();
      const phone = data.phone || "-";
      const pwd = data.password || "daihatsu123";

      if (rowIndex > 1) {
        // Siswa sudah ada -> Update profil lengkap
        sheetMaster.getRange(rowIndex, 2).setValue(data.nama || "-");
        sheetMaster.getRange(rowIndex, 3).setValue(data.instansi || "-");
        sheetMaster.getRange(rowIndex, 4).setValue(data.jurusan || "-");
        sheetMaster.getRange(rowIndex, 5).setValue(phone);
        if (avatarUrl !== "-") {
          sheetMaster.getRange(rowIndex, 6).setValue(avatarUrl);
        }
        sheetMaster.getRange(rowIndex, 7).setValue(pwd);
        sheetMaster.getRange(rowIndex, 8).setValue("Aktif");
        sheetMaster.getRange(rowIndex, 9).setValue(now);
      } else {
        // Pendaftaran Siswa Magang Baru
        sheetMaster.appendRow([
          data.nim || "-",
          data.nama || "-",
          data.instansi || "-",
          data.jurusan || "-",
          phone,
          avatarUrl,
          pwd,
          "Aktif",
          now
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: `Registrasi peserta magang ${data.nama} (NIM: ${data.nim}) berhasil disimpan ke database Astra Daihatsu.`,
        nim: data.nim,
        nama: data.nama,
        instansi: data.instansi,
        jurusan: data.jurusan,
        phone: phone,
        avatarUrl: avatarUrl
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
 * FUNGSI BANTU OTOMATIS: BUAT 3 FOLDER GOOGLE DRIVE DALAM 1-KLIK
 * Jalankan fungsi ini langsung dari editor Apps Script untuk membuat:
 * 1. "Foto_Presensi_PKL" -> Menampung foto selfie absensi & watermark
 * 2. "Foto_Profil_PKL"   -> Menampung foto profil peserta magang
 * 3. "Dokumen_SKD_PKL"   -> Menampung berkas/foto surat sakit & surat dokter
 * 
 * Folder ID akan otomatis ditampilkan di Execution Log (Ctrl + Enter)
 */
function createDriveFoldersAutomated() {
  const root = DriveApp.getRootFolder();
  
  const fPresensi = root.createFolder("Foto_Presensi_PKL");
  const fProfil   = root.createFolder("Foto_Profil_PKL");
  const fSKD      = root.createFolder("Dokumen_SKD_PKL");

  fPresensi.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  fProfil.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  fSKD.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  Logger.log("==================================================");
  Logger.log("BERHASIL MEMBUAT 3 FOLDER GOOGLE DRIVE:");
  Logger.log("1. FOLDER_PRESENSI_ID = \"" + fPresensi.getId() + "\";");
  Logger.log("2. FOLDER_PROFIL_ID   = \"" + fProfil.getId() + "\";");
  Logger.log("3. FOLDER_SKD_ID      = \"" + fSKD.getId() + "\";");
  Logger.log("Silakan salin ID ketiga folder di atas ke baris 29-31 Code.gs");
  Logger.log("==================================================");
}

/**
 * Jalankan fungsi ini langsung dari editor Apps Script untuk membuat semua sheet
 * dan nama kolom secara otomatis dengan styling resmi Astra Daihatsu!
 */
function setupDatabaseSheets() {
  if (SPREADSHEET_ID === "MASUKKAN_SPREADSHEET_ID_DISINI") {
    throw new Error("Silakan masukkan SPREADSHEET_ID Anda di baris 28 sebelum menjalankan fungsi ini!");
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
    "No. WhatsApp / HP",
    "URL Foto Profil (Drive)", 
    "Kata Sandi (Akun)",
    "Status Magang", 
    "Waktu Registrasi / Update"
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
