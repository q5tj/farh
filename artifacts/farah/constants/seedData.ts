// Static assets shared between screens. Real provider/service data lives in
// Supabase — see lib/data.ts and contexts/AppContext.tsx.

export const CITIES = [
  "الرياض",
  "جدة",
  "مكة المكرمة",
  "المدينة المنورة",
  "الدمام",
  "الخبر",
  "الطائف",
  "تبوك",
  "أبها",
  "بريدة",
];

const COVER = {
  halls: require("../assets/images/hero-hall.png"),
  music: require("../assets/images/cat-music.png"),
  food: require("../assets/images/cat-food.png"),
  photo: require("../assets/images/cat-photo.png"),
  flowers: require("../assets/images/cat-flowers.png"),
};

// Fallback cover image for a provider, keyed by category slug.
export const COVER_BY_CATEGORY: Record<string, number> = {
  halls: COVER.halls,
  munshideen: COVER.music,
  poets: COVER.music,
  "ardha-poets": COVER.music,
  "dama-shilat": COVER.music,
  drums: COVER.music,
  audio: COVER.music,
  qahwaji: COVER.food,
  restaurants: COVER.food,
  cafes: COVER.food,
  "popular-food": COVER.food,
  sweets: COVER.food,
  photo: COVER.photo,
  video: COVER.photo,
  "female-photo": COVER.photo,
  flowers: COVER.flowers,
  "wedding-prep": COVER.flowers,
  furniture: COVER.flowers,
  "women-section": COVER.flowers,
  organizers: COVER.halls,
};

export const DEFAULT_COVER = COVER.halls;
