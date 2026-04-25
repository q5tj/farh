export interface SeedProvider {
  id: string;
  name: string;
  categoryId: string;
  city: string;
  rating: number;
  reviews: number;
  priceFrom: number;
  description: string;
  phone: string;
  cover: string;
  gallery: string[];
  services: { id: string; title: string; price: number; duration: string }[];
}

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

export const SEED_PROVIDERS: SeedProvider[] = [
  {
    id: "p1",
    name: "قصر الأميرة للأفراح",
    categoryId: "halls",
    city: "الرياض",
    rating: 4.9,
    reviews: 184,
    priceFrom: 12000,
    description:
      "قاعة فاخرة بمساحة 800 متر مربع، تتسع لـ 500 ضيف، تشمل تنسيق الإضاءة والصوتيات وفريق الاستقبال.",
    phone: "+966500001001",
    cover: "halls",
    gallery: ["halls", "flowers", "photo"],
    services: [
      { id: "s1", title: "حجز القاعة - يوم كامل", price: 12000, duration: "8 ساعات" },
      { id: "s2", title: "حجز كامل + ضيافة فاخرة", price: 22000, duration: "8 ساعات" },
    ],
  },
  {
    id: "p2",
    name: "عدسة الزمن للتصوير",
    categoryId: "photo",
    city: "جدة",
    rating: 4.8,
    reviews: 96,
    priceFrom: 2500,
    description:
      "استوديو متخصص في تصوير حفلات الزواج والمناسبات بأحدث الكاميرات السينمائية وفريق محترف.",
    phone: "+966500001002",
    cover: "photo",
    gallery: ["photo", "halls", "flowers"],
    services: [
      { id: "s1", title: "باقة تصوير زفاف أساسية", price: 2500, duration: "4 ساعات" },
      { id: "s2", title: "باقة تصوير + فيديو سينمائي", price: 6500, duration: "8 ساعات" },
      { id: "s3", title: "ألبوم فاخر إضافي", price: 1200, duration: "تسليم خلال أسبوع" },
    ],
  },
  {
    id: "p3",
    name: "فرقة شموخ للشيلات",
    categoryId: "munshideen",
    city: "الرياض",
    rating: 4.9,
    reviews: 142,
    priceFrom: 4500,
    description:
      "فرقة احترافية تقدم أجمل الشيلات والقصائد للمناسبات الوطنية وحفلات الزواج.",
    phone: "+966500001003",
    cover: "music",
    gallery: ["music", "halls"],
    services: [
      { id: "s1", title: "حفل قصير - ساعة", price: 4500, duration: "60 دقيقة" },
      { id: "s2", title: "حفل كامل - ثلاث ساعات", price: 9500, duration: "180 دقيقة" },
    ],
  },
  {
    id: "p4",
    name: "روائع الورد",
    categoryId: "flowers",
    city: "الرياض",
    rating: 4.7,
    reviews: 73,
    priceFrom: 800,
    description:
      "تنسيق زهور فاخر للمناسبات والحفلات، نستخدم أجود أنواع الورود الطبيعية المستوردة.",
    phone: "+966500001004",
    cover: "flowers",
    gallery: ["flowers", "halls"],
    services: [
      { id: "s1", title: "تنسيق طاولة العروسين", price: 800, duration: "تسليم وتركيب" },
      { id: "s2", title: "تنسيق كامل للقاعة", price: 4500, duration: "تسليم وتركيب" },
    ],
  },
  {
    id: "p5",
    name: "ضيافة الكرم",
    categoryId: "qahwaji",
    city: "الرياض",
    rating: 4.8,
    reviews: 211,
    priceFrom: 1200,
    description:
      "خدمة قهوجية متكاملة بأزياء تراثية، نقدم القهوة العربية والشاي والتمر والمكسرات.",
    phone: "+966500001005",
    cover: "food",
    gallery: ["food", "halls"],
    services: [
      { id: "s1", title: "قهوجي + ضيافة - 100 ضيف", price: 1200, duration: "4 ساعات" },
      { id: "s2", title: "ضيافة كاملة - 300 ضيف", price: 3200, duration: "6 ساعات" },
    ],
  },
  {
    id: "p6",
    name: "لمسة فرح للتنظيم",
    categoryId: "organizers",
    city: "جدة",
    rating: 5.0,
    reviews: 58,
    priceFrom: 8500,
    description:
      "وكالة متكاملة لتنظيم وتنسيق الحفلات، نتولى كل التفاصيل من البداية للنهاية.",
    phone: "+966500001006",
    cover: "halls",
    gallery: ["halls", "flowers"],
    services: [
      { id: "s1", title: "تنظيم حفل خطوبة", price: 8500, duration: "يوم كامل" },
      { id: "s2", title: "تنظيم حفل زفاف متكامل", price: 25000, duration: "يوم كامل" },
    ],
  },
  {
    id: "p7",
    name: "صدى الصوت للصوتيات",
    categoryId: "audio",
    city: "الدمام",
    rating: 4.6,
    reviews: 47,
    priceFrom: 2200,
    description: "أنظمة صوت احترافية وإضاءة ليزر متطورة لجميع المناسبات.",
    phone: "+966500001007",
    cover: "music",
    gallery: ["music"],
    services: [
      { id: "s1", title: "نظام صوت متوسط", price: 2200, duration: "يوم كامل" },
      { id: "s2", title: "نظام صوت + إضاءة كاملة", price: 5800, duration: "يوم كامل" },
    ],
  },
  {
    id: "p8",
    name: "حلويات بلقيس",
    categoryId: "sweets",
    city: "الرياض",
    rating: 4.9,
    reviews: 312,
    priceFrom: 600,
    description: "أرقى أصناف الحلويات الشرقية والغربية لمناسباتكم الخاصة.",
    phone: "+966500001008",
    cover: "food",
    gallery: ["food"],
    services: [
      { id: "s1", title: "صينية حلويات مشكلة", price: 600, duration: "تسليم في الموعد" },
      { id: "s2", title: "بوفيه حلويات كامل", price: 3800, duration: "تسليم وتجهيز" },
    ],
  },
  {
    id: "p9",
    name: "إبداع المصورات",
    categoryId: "female-photo",
    city: "الرياض",
    rating: 4.9,
    reviews: 89,
    priceFrom: 3000,
    description: "فريق مصورات متخصصات في تصوير المناسبات النسائية بأعلى مستوى من الخصوصية.",
    phone: "+966500001009",
    cover: "photo",
    gallery: ["photo"],
    services: [
      { id: "s1", title: "تصوير حفل نسائي", price: 3000, duration: "5 ساعات" },
      { id: "s2", title: "تصوير + فيديو + ألبوم", price: 7500, duration: "8 ساعات" },
    ],
  },
];
