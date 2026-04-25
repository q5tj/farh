import { Feather } from "@expo/vector-icons";

export type CategoryIcon = keyof typeof Feather.glyphMap;

export interface Category {
  id: string;
  name: string;
  icon: CategoryIcon;
  color: string;
}

export const CATEGORIES: Category[] = [
  { id: "poets", name: "الشعراء", icon: "feather", color: "#7b2cbf" },
  { id: "ardha-poets", name: "شعراء العرضة", icon: "mic", color: "#9d4edd" },
  { id: "munshideen", name: "المنشدين", icon: "music", color: "#5a189a" },
  { id: "dama-shilat", name: "فرق الدمة والشيلات", icon: "users", color: "#7b2cbf" },
  { id: "drums", name: "الطبول والصفوف", icon: "disc", color: "#9d4edd" },
  { id: "qahwaji", name: "القهوجية", icon: "coffee", color: "#a16207" },
  { id: "audio", name: "الصوتيات", icon: "volume-2", color: "#5a189a" },
  { id: "photo", name: "تصوير فوتوغرافي", icon: "camera", color: "#7b2cbf" },
  { id: "video", name: "تصوير فيديو", icon: "video", color: "#9d4edd" },
  { id: "female-photo", name: "المصورات", icon: "aperture", color: "#c026d3" },
  { id: "halls", name: "قاعات وقصور الأفراح", icon: "home", color: "#5a189a" },
  { id: "restaurants", name: "المطاعم", icon: "coffee", color: "#dc2626" },
  { id: "cafes", name: "الكافيهات", icon: "coffee", color: "#a16207" },
  { id: "popular-food", name: "الأكلات الشعبية", icon: "shopping-bag", color: "#ea580c" },
  { id: "flowers", name: "محلات الورود", icon: "gift", color: "#db2777" },
  { id: "sweets", name: "محلات الحلويات", icon: "gift", color: "#e11d48" },
  { id: "wedding-prep", name: "تجهيز ومداخل الزواج", icon: "star", color: "#7b2cbf" },
  { id: "furniture", name: "الفرش والمستلزمات", icon: "package", color: "#5a189a" },
  { id: "women-section", name: "القسم النسائي", icon: "heart", color: "#c026d3" },
  { id: "organizers", name: "تنسيق وتنظيم الحفلات", icon: "award", color: "#9d4edd" },
];

export const FEATURED_CATEGORY_IDS = [
  "halls",
  "photo",
  "munshideen",
  "flowers",
  "qahwaji",
  "organizers",
];
