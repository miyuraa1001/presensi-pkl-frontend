// =======================================================================
// VERCEL SERVERLESS FUNCTION - REVERSE GEOCODING API
// =======================================================================
// Menghasilkan nama kecamatan, alamat riil, dan Google Plus Code secara presisi
// untuk Watermark GPS Map Camera Presensi PKL Astra Daihatsu.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { lat, lng } = req.query;
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({ error: 'Valid lat and lng query params required' });
  }

  // Koordinat Benchmark Workshop Astra Daihatsu Ahmad Yani
  const DAIHATSU_LAT = -5.4217;
  const DAIHATSU_LNG = 105.2528;
  const dLat = Math.abs(latitude - DAIHATSU_LAT);
  const dLng = Math.abs(longitude - DAIHATSU_LNG);
  const isNearWorkshop = (dLat < 0.003 && dLng < 0.003);

  // Default values
  let title = "Kecamatan Tanjung Karang Pusat, Lampung, Indonesia";
  let address = "Jl. Ahmad Yani No. 1, Palapa, Kec. Tanjung Karang Pusat, Kota Bandar Lampung, Lampung 35119, Indonesia";
  let road = "Jl. Ahmad Yani";
  let subdistrict = "Kecamatan Tanjung Karang Pusat";
  let city = "Kota Bandar Lampung";
  let state = "Lampung";
  let postcode = "35119";

  // 1. Coba ambil dari OpenStreetMap Nominatim
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    const geoRes = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'PresensiPKL-Daihatsu/1.0 (admin@daihatsu-pkl.id)',
        'Accept-Language': 'id,en;q=0.8'
      }
    });

    if (geoRes.ok) {
      const geoData = await geoRes.json();
      const addr = geoData.address || {};
      road = addr.road || addr.street || addr.pedestrian || road;
      subdistrict = addr.suburb || addr.village || addr.municipality || addr.city_district || subdistrict;
      city = addr.city || addr.town || addr.county || city;
      state = addr.state || state;
      postcode = addr.postcode || postcode;

      title = `${subdistrict ? subdistrict + ', ' : ''}${state}, Indonesia`;
      address = geoData.display_name || address;
    }
  } catch (err) {
    console.warn("Nominatim fetch failed, trying BigDataCloud:", err.message);
    try {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=id`;
      const bdcRes = await fetch(bdcUrl);
      if (bdcRes.ok) {
        const bdcData = await bdcRes.json();
        subdistrict = bdcData.locality || subdistrict;
        city = bdcData.city || city;
        state = bdcData.principalSubdivision || state;
        title = `${subdistrict}, ${state}, Indonesia`;
        address = `${subdistrict}, ${city}, ${state}, Indonesia`;
      }
    } catch (e) {
      console.warn("BigDataCloud fetch failed:", e.message);
    }
  }

  // Jika dekat workshop, lengkapi dengan keterangan Astra Daihatsu Ahmad Yani
  if (isNearWorkshop) {
    if (!address.includes("Daihatsu")) {
      address = `Astra Daihatsu Ahmad Yani, ${road}, Palapa, Tanjung Karang Pusat, Kota Bandar Lampung 35119, Indonesia`;
    }
    title = `Kecamatan Tanjung Karang Pusat, Lampung, Indonesia`;
  }

  // Kalkulasi Google Plus Code (Open Location Code)
  function encodePlusCode(lat, lng) {
    const CODE_ALPHABET = '23456789CFGHJMPQRVWX';
    lat = Math.min(Math.max(lat, -90), 90);
    lng = lng % 360;
    if (lng < 0) lng += 360;
    let latVal = lat + 90, lngVal = lng;
    let code = '';
    let latRes = 20, lngRes = 20;
    for (let i = 0; i < 5; i++) {
      const latDigit = Math.floor(latVal / latRes);
      const lngDigit = Math.floor(lngVal / lngRes);
      latVal -= latDigit * latRes;
      lngVal -= lngDigit * lngRes;
      code += CODE_ALPHABET[latDigit] + CODE_ALPHABET[lngDigit];
      latRes /= 20;
      lngRes /= 20;
    }
    return code.slice(4, 8).toLowerCase() + '+' + code.slice(8).toLowerCase();
  }

  const plusCodeShort = encodePlusCode(latitude, longitude);

  return res.status(200).json({
    status: "success",
    title,
    address,
    plusCode: plusCodeShort,
    compoundPlusCode: `${plusCodeShort.toUpperCase()}, ${subdistrict}, ${city}`,
    road,
    subdistrict,
    city,
    state,
    postcode,
    lat: latitude,
    lng: longitude
  });
}
