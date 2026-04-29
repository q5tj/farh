/**
 * Approximate centers for the cities used in the app. Used to map a user's
 * GPS coordinates to the nearest serviceable city for auto-filtering.
 *
 * Coordinates are decimal degrees (lat, lng) of the city center. The cutoff
 * radius is ~120km to be lenient with users in nearby suburbs.
 */
const CITY_CENTERS: Record<string, [number, number]> = {
  "الرياض": [24.7136, 46.6753],
  "جدة": [21.4858, 39.1925],
  "مكة المكرمة": [21.4225, 39.8262],
  "المدينة المنورة": [24.5247, 39.5692],
  "الدمام": [26.4207, 50.0888],
  "الخبر": [26.2172, 50.1971],
  "الطائف": [21.2854, 40.4193],
  "تبوك": [28.3998, 36.5715],
  "أبها": [18.2164, 42.5053],
  "بريدة": [26.326, 43.975],
};

const MATCH_RADIUS_KM = 120;

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Returns the nearest CITIES entry within MATCH_RADIUS_KM, or null. */
export function nearestCity(coords: {
  lat: number;
  lng: number;
}): string | null {
  let best: { city: string; km: number } | null = null;
  for (const [city, [lat, lng]] of Object.entries(CITY_CENTERS)) {
    const km = haversineKm(coords, { lat, lng });
    if (best == null || km < best.km) best = { city, km };
  }
  if (!best) return null;
  return best.km <= MATCH_RADIUS_KM ? best.city : null;
}
