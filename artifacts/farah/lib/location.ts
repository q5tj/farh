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
