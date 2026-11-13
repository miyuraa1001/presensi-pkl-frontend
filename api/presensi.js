// =======================================================================
// VERCEL SERVERLESS FUNCTION - PROXY BACKEND PRESENSI PKL KE GOOGLE APPS SCRIPT
// =======================================================================
// Menyediakan bridge aman antara Frontend Vercel dan Google Apps Script
// Mengatasi masalah CORS dan mengamankan Secret Code lewat Environment Variables.

export default async function handler(req, res) {
  // CORS Headers untuk akses browser
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Parse body jika ada
  let payload = {};
  if (req.body) {
    payload = typeof req.body === 'object' ? { ...req.body } : JSON.parse(req.body || '{}');
  }

  // Baca Environment Variables dari Dashboard Vercel atau directGasUrl dari client
  const gasUrl = payload.directGasUrl || req.headers['x-gas-url'] || process.env.GAS_URL || process.env.VITE_GAS_URL;
  const secretCode = process.env.GAS_SECRET_CODE || process.env.API_SECRET_CODE || "DAIHATSU_PKL_SEC_2026";

  // Endpoint GET: Status Check & Verifikasi Konfigurasi
  if (req.method === 'GET') {
    return res.status(200).json({
      status: "online",
      proxy: "Vercel Serverless Function Presensi PKL Astra Daihatsu",
      gasConfigured: Boolean(gasUrl),
      secretConfigured: Boolean(secretCode),
      message: gasUrl 
        ? "Vercel Proxy aktif dan terhubung ke Google Apps Script."
        : "GAS_URL belum dikonfigurasi di Environment Variables Vercel. Silakan tambahkan variabel GAS_URL di Dashboard Vercel > Settings > Environment Variables atau masukkan Web App URL di menu Pengaturan aplikasi."
    });
  }

  // Endpoint POST: Forward transaksi (presensi, izin, profil) ke Google Apps Script
  if (req.method === 'POST') {
    if (!gasUrl) {
      return res.status(400).json({
        status: "error",
        message: "GAS_URL belum disetel di Vercel Environment Variables atau menu Pengaturan aplikasi. Silakan isi URL Google Apps Script Web App Anda."
      });
    }

    try {
      // Sisipkan Secret Code secara otomatis jika belum ada di payload
      if (!payload.secretToken && secretCode) {
        payload.secretToken = secretCode;
      }

      // Kirim ke Google Apps Script dengan redirect follow
      const gasResponse = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      const responseText = await gasResponse.text();
      try {
        const json = JSON.parse(responseText);
        return res.status(200).json(json);
      } catch {
        return res.status(200).send(responseText);
      }
    } catch (error) {
      console.error("Error proxying to GAS:", error);
      return res.status(500).json({
        status: "error",
        message: "Gagal menghubungkan ke Google Apps Script: " + error.message
      });
    }
  }

  return res.status(405).json({ status: "error", message: "Method Not Allowed" });
}
