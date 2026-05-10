import * as Location from "expo-location";
import { Platform } from "react-native";

export interface ParsedLocation {
  city: string;
  mapUrl?: string;
  raw: string;
}

const SEP = "|||";

export function buildLocation(city: string, mapUrl?: string): string {
  if (!mapUrl) return city;
  return `${city}${SEP}${mapUrl}`;
}

export function parseLocation(value: string): ParsedLocation {
  if (!value) return { city: "", raw: value };
  if (value.includes(SEP)) {
    const [city, mapUrl] = value.split(SEP);
    return { city: city ?? "", mapUrl: mapUrl?.trim() || undefined, raw: value };
  }
  // backward compat: legacy free-text
  return { city: value, raw: value };
}

export function isMapUrl(url: string): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  return (
    u.startsWith("http://") ||
    u.startsWith("https://") ||
    u.startsWith("geo:")
  );
}

export function buildMapUrlFromCoords(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Try to extract latitude/longitude from a Google Maps URL.
 *
 * Supports the common shapes we encounter:
 *   1. `?q=24.7136,46.6753`        — long/short share format we generate
 *   2. `/@24.7136,46.6753,15z`     — when the user copies the URL bar
 *   3. `/place/.../@24.7,46.7,..`  — place pages
 *   4. `?ll=24.7136,46.6753`       — older mobile share
 *
 * Returns null when the URL doesn't include explicit coordinates (e.g.
 * shortened `maps.app.goo.gl` redirect URLs we can't follow client-side).
 */
export function extractCoordsFromMapUrl(
  url: string,
): { lat: number; lng: number } | null {
  if (!url) return null;
  const candidates: RegExp[] = [
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/i,
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/i,
    /[?&]destination=(-?\d+\.\d+),(-?\d+\.\d+)/i,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];
  for (const re of candidates) {
    const m = url.match(re);
    if (m) {
      const lat = Number.parseFloat(m[1]);
      const lng = Number.parseFloat(m[2]);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
      ) {
        return { lat, lng };
      }
    }
  }
  return null;
}

export async function getCurrentMapUrl(): Promise<{
  url: string;
  lat: number;
  lng: number;
}> {
  if (Platform.OS === "web") {
    return await new Promise((resolve, reject) => {
      if (
        typeof navigator === "undefined" ||
        !navigator.geolocation
      ) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          resolve({ url: buildMapUrlFromCoords(lat, lng), lat, lng });
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("permission denied");
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const { latitude, longitude } = pos.coords;
  return {
    url: buildMapUrlFromCoords(latitude, longitude),
    lat: latitude,
    lng: longitude,
  };
}
