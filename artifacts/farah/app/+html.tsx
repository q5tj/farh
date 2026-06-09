import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Custom HTML wrapper for the web build.
 *
 * Two jobs:
 * 1. Force html/body/#root to occupy the full viewport so the bottom tab
 *    bar anchors to the bottom on tall content.
 * 2. Inject SEO + AEO metadata. Because the app is an Expo Router SPA,
 *    crawlers only see what's in this <head> on first paint — the rest is
 *    React rendering. Everything that matters for ranking and for LLM
 *    answers (title, description, OG, JSON-LD) lives here.
 */

const SITE_URL = "https://farhatukum.com";
const SITE_NAME_AR = "فرحتكم";
const SITE_NAME_EN = "Farhatukum";
const DEFAULT_TITLE =
  "فرحتكم — منصة حجز خدمات الأفراح والمناسبات في السعودية";
const DEFAULT_DESC =
  "احجز قاعات الأفراح، مصوّرين، ضيافة، تنسيق زهور، وكل ما تحتاجه لمناسباتك في السعودية. حماية مالية للطرفين عبر دفع آمن، عربون، وآلية استرداد واضحة.";
const OG_IMAGE = `${SITE_URL}/og-image.png`;
const THEME_COLOR = "#7b2cbf";

// JSON-LD: Organization (helps Google show site name + logo) +
// LocalBusiness (regional discovery) + WebSite (sitelinks search box).
// Kept as a single graph so Google parses once.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME_AR,
      alternateName: SITE_NAME_EN,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      sameAs: [],
      areaServed: { "@type": "Country", name: "Saudi Arabia" },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        availableLanguage: ["Arabic", "English"],
        areaServed: "SA",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME_AR,
      inLanguage: "ar-SA",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Service",
      "@id": `${SITE_URL}/#service`,
      serviceType: "Event & wedding services booking",
      provider: { "@id": `${SITE_URL}/#organization` },
      areaServed: { "@type": "Country", name: "Saudi Arabia" },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "خدمات الأفراح والمناسبات",
        itemListElement: [
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "قاعات أفراح وقصور" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "تصوير مناسبات" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "ضيافة وبوفيهات" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "تنسيق زهور" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "موسيقى وفرق" } },
        ],
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "كيف يعمل تطبيق فرحتكم؟",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "فرحتكم منصة وسيطة تربط العملاء بمزودي خدمات الأفراح (قاعات، تصوير، ضيافة، زهور). تختار الخدمة، تدفع عربون آمن عبر ميسر، ويستلم المزود الطلب فوراً. باقي المبلغ يُسدَّد بعد إكمال الخدمة.",
          },
        },
        {
          "@type": "Question",
          name: "هل الدفع آمن في فرحتكم؟",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "نعم. كل المدفوعات تتم عبر بوابة ميسر المرخصة من البنك المركزي السعودي (ساما)، ويتم تشفير البيانات. العربون محمي بآلية استرداد واضحة عند الإلغاء.",
          },
        },
        {
          "@type": "Question",
          name: "هل يمكنني إلغاء الحجز واسترداد العربون؟",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "نعم. تطبيق فرحتكم يطبّق سياسة استرداد متدرجة بحسب القرب من موعد المناسبة — استرداد كامل قبل المدة الكاملة المحددة، واسترداد جزئي قبل مدة أقصر، وتظهر القيمة المسترَدّة بوضوح قبل تأكيد الإلغاء.",
          },
        },
        {
          "@type": "Question",
          name: "كيف أصبح مزود خدمة في فرحتكم؟",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "من تطبيق فرحتكم: حسابي → كن مزود خدمة، عبّ بياناتك ووثائق السجل التجاري والعنوان الوطني والآيبان، وحمّل شعار متجرك. بعد مراجعة الإدارة يظهر متجرك للعملاء.",
          },
        },
        {
          "@type": "Question",
          name: "في أي مدن سعودية يعمل فرحتكم؟",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "فرحتكم متاح في كل مدن المملكة العربية السعودية. كل مزود يحدد مدن الخدمة الخاصة به، وتقدر تفلتر النتائج بحسب مدينتك.",
          },
        },
      ],
    },
  ],
};

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* Core SEO */}
        <title>{DEFAULT_TITLE}</title>
        <meta name="description" content={DEFAULT_DESC} />
        <meta
          name="keywords"
          content="قاعات أفراح, حجز قاعات أفراح, مصور أفراح, ضيافة أفراح, تنسيق زهور, خدمات مناسبات, قصور أفراح, السعودية, فرحتكم"
        />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <meta name="googlebot" content="index, follow" />
        <link rel="canonical" href={SITE_URL} />
        <meta name="theme-color" content={THEME_COLOR} />
        <meta name="application-name" content={SITE_NAME_AR} />
        <meta name="author" content={SITE_NAME_AR} />

        {/* Open Graph (Facebook, WhatsApp, LinkedIn previews) */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_NAME_AR} />
        <meta property="og:title" content={DEFAULT_TITLE} />
        <meta property="og:description" content={DEFAULT_DESC} />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={DEFAULT_TITLE} />
        <meta property="og:locale" content="ar_SA" />
        <meta property="og:locale:alternate" content="en_US" />

        {/* Twitter / X Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={DEFAULT_TITLE} />
        <meta name="twitter:description" content={DEFAULT_DESC} />
        <meta name="twitter:image" content={OG_IMAGE} />

        {/* Hreflang — both ar-SA (primary) and en (English UI inside app) */}
        <link rel="alternate" hrefLang="ar-SA" href={SITE_URL} />
        <link rel="alternate" hrefLang="en" href={SITE_URL} />
        <link rel="alternate" hrefLang="x-default" href={SITE_URL} />

        {/* Icons (icon.png is the brand mark in /assets — copied into dist) */}
        <link rel="icon" type="image/png" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />

        {/* Schema.org structured data — Organization + WebSite + Service + FAQ.
            Critical for AEO: LLM crawlers (Perplexity, Gemini, ChatGPT) read
            JSON-LD to summarise what the site does. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(STRUCTURED_DATA),
          }}
        />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: ROOT_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const ROOT_CSS = `
html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
#root {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
}
body {
  background-color: #fff;
}
`;
