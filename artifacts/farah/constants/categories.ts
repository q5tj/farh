import { Feather } from "@expo/vector-icons";

export type CategoryIcon = keyof typeof Feather.glyphMap;

// Slugs that should appear in the "Featured" section on the home screen.
// Categories themselves are loaded from Supabase (see lib/data.ts).
export const FEATURED_CATEGORY_SLUGS = [
  "halls",
  "photo",
  "munshideen",
  "flowers",
  "qahwaji",
  "organizers",
];
