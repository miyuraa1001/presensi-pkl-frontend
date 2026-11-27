// =======================================================================
// VERCEL SERVERLESS FUNCTION - PROXY BACKEND PRESENSI PKL KE GOOGLE APPS SCRIPT
// =======================================================================
// Menyediakan bridge aman antara Frontend Vercel dan Google Apps Script
// Mengatasi masalah CORS dan mengamankan Secret Code lewat Environment Variables.

export default async function handler(req, res) {
  // CORS ketat: hanya izinkan origin resmi (domain sendiri, vercel.app, localhost, atau ALLOWED_ORIGIN)
  const origin = req.headers.origin || '';
  const allowedEnv = (process.env.ALLOWED_ORIGIN || '').trim();
  const isAllowedOrigin = !origin ||
    (allowedEnv && origin === allowedEnv) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

  if (origin && isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(isAllowedOrigin ? 200 : 403).end();
    return;
  }

  // Parse body jika ada
  let payload = {};
  if (req.body) {
    payload = typeof req.body === 'object' ? { ...req.body } : JSON.parse(req.body || '{}');
  }

  // Validasi ketat whitelist domain Google Apps Script (Anti-SSRF)
  const isAllowedGasUrl = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
      const u = new URL(rawUrl.trim());
      return (
        u.protocol === 'https:' &&
        u.hostname === 'script.google.com' &&
        u.pathname.startsWith('/macros/s/') &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  };

  // Prioritaskan Environment Variable server Vercel; hanya izinkan directGasUrl jika env belum disetel & lolos whitelist GAS
  const envGasUrl = (process.env.GAS_URL || process.env.VITE_GAS_URL || '').trim();
  const clientCandidateUrl = (payload.directGasUrl || req.headers['x-gas-url'] || '').toString().trim();
  const usingTrustedEnvUrl = Boolean(envGasUrl);

  let gasUrl = envGasUrl;
  if (!usingTrustedEnvUrl && clientCandidateUrl) {
    if (!isAllowedGasUrl(clientCandidateUrl)) {
      return res.status(400).json({
        status: "error",
        code: "INVALID_TARGET_URL",
        message: "URL target tidak valid. Hanya URL resmi Google Apps Script (https://script.google.com/macros/s/...) yang diizinkan."
      });
    }
    gasUrl = clientCandidateUrl;
  }

  // Hapus directGasUrl dari payload sebelum diteruskan ke backend
  delete payload.directGasUrl;

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
      // Sisipkan Secret Code server HANYA jika meneruskan ke GAS_URL resmi dari Environment Variables Vercel
      if (usingTrustedEnvUrl && !payload.secretToken && secretCode) {
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
