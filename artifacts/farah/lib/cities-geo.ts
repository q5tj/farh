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
  "الظهران": [26.2885, 50.1145],
  "الطائف": [21.2854, 40.4193],
  "تبوك": [28.3998, 36.5715],
  "أبها": [18.2164, 42.5053],
  "بريدة": [26.326, 43.975],
  "حائل": [27.5219, 41.6907],
  "نجران": [17.4928, 44.1277],
  "جازان": [16.8892, 42.5611],
  "ينبع": [24.0894, 38.0618],
  "الجبيل": [27.0046, 49.6566],
  "الأحساء": [25.3826, 49.5867],
  "الهفوف": [25.385, 49.5878],
  "خميس مشيط": [18.3079, 42.7287],
  "عرعر": [30.9753, 41.0381],
  "سكاكا": [29.9697, 40.2064],
  "القطيف": [26.5196, 49.997],
  "الباحة": [20.0129, 41.4677],
  "القصيم": [26.2078, 43.4837],
  "عنيزة": [26.0843, 43.9936],
  "الرس": [25.8714, 43.4949],
  "حفر الباطن": [28.4337, 45.9601],
  "الخرج": [24.155, 47.3122],
  "المجمعة": [25.9091, 45.3637],
  "الزلفي": [26.2944, 44.8147],
  "شقراء": [25.2438, 45.2535],
  "الدوادمي": [24.5067, 44.3937],
  "وادي الدواسر": [20.4644, 44.8809],
  "بيشة": [20.0, 42.6],
  "محايل عسير": [18.5489, 42.0507],
  "تنومة": [18.9, 42.16],
  "النماص": [19.1, 42.13],
  "ضباء": [27.3505, 35.6939],
  "أملج": [25.0612, 37.2658],
  "العلا": [26.6086, 37.9233],
  "بدر": [23.7795, 38.7905],
  "رابغ": [22.7989, 39.0349],
  "خيبر": [25.6996, 39.292],
  "تيماء": [27.6314, 38.5436],
  "الوجه": [26.2469, 36.4527],
  "رفحاء": [29.6373, 43.4982],
  "طريف": [31.6779, 38.6633],
  "القريات": [31.3309, 37.353],
  "صبيا": [17.1492, 42.6261],
  "أبو عريش": [16.9696, 42.832],
  "صامطة": [16.5969, 42.9485],
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

export interface LocationCheck {
  /** City inferred from the map URL coordinates (if extractable). */
  detectedCity: string | null;
  /** True when the customer's selected city matches the URL's city. */
  cityMatchesUrl: boolean;
  /** True when the selected city is part of the provider's service areas. */
  cityInServiceAreas: boolean;
  /** Convenience: any blocking issue at all. */
  ok: boolean;
}

/**
 * Validate a booking location against:
 *   • the city the customer picked from the dropdown
 *   • the city we infer from the map URL (if any)
 *   • the provider's primary city + extra service-area cities
 *
 * The result is consumed by booking-form to show a clear warning when
 * the customer is about to book a venue that's outside the provider's
 * coverage, or when the dropdown city contradicts the map pin.
 */
export function checkBookingLocation(input: {
  selectedCity: string;
  mapCoords?: { lat: number; lng: number } | null;
  providerCity: string;
  providerServiceAreas?: string[];
}): LocationCheck {
  const detected = input.mapCoords ? nearestCity(input.mapCoords) : null;
  const cityMatchesUrl =
    detected == null ? true : detected === input.selectedCity;
  const areas = new Set<string>([
    input.providerCity,
    ...(input.providerServiceAreas ?? []),
  ]);
  const cityInServiceAreas = areas.has(input.selectedCity);
  return {
    detectedCity: detected,
    cityMatchesUrl,
    cityInServiceAreas,
    ok: cityMatchesUrl && cityInServiceAreas,
  };
}
