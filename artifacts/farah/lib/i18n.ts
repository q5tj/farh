import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { I18nManager, Platform } from "react-native";

import { ar, type Strings } from "@/locales/ar";
import { en } from "@/locales/en";

export type AppLang = "ar" | "en";

export const SUPPORTED_LANGS: AppLang[] = ["ar", "en"];
export const DEFAULT_LANG: AppLang = "ar";

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        ar: { translation: ar },
        en: { translation: en },
      },
      lng: DEFAULT_LANG,
      fallbackLng: DEFAULT_LANG,
      interpolation: { escapeValue: false },
      returnNull: false,
      compatibilityJSON: "v4",
    });
}

/** Apply RTL/LTR for the chosen language. On web this updates document.dir live;
 * on native it queues a change that requires app reload to take effect. */
export function applyDirection(lang: AppLang): { needsReload: boolean } {
  const isRtl = lang === "ar";

  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");
      document.documentElement.setAttribute("lang", lang);
    }
    return { needsReload: false };
  }

  // Native: I18nManager only takes effect after a full app reload.
  if (I18nManager.isRTL !== isRtl) {
    try {
      I18nManager.allowRTL(isRtl);
      I18nManager.forceRTL(isRtl);
    } catch {
      // ignore
    }
    return { needsReload: true };
  }
  return { needsReload: false };
}

/** Switch the active language and apply direction side-effects. */
export async function setAppLanguage(lang: AppLang): Promise<{ needsReload: boolean }> {
  await i18n.changeLanguage(lang);
  return applyDirection(lang);
}

export default i18n;

/** Typed hook returning a translation function and current language.
 * Usage: `const { t, lang } = useT(); <Text>{t('welcome')}</Text>` */
export function useT() {
  const { t, i18n: i } = useTranslation();
  return {
    t: (key: keyof Strings, vars?: Record<string, string | number>) =>
      vars ? (t(key, vars) as string) : (t(key) as string),
    lang: (i.language as AppLang) ?? DEFAULT_LANG,
    isRtl: ((i.language as AppLang) ?? DEFAULT_LANG) === "ar",
  };
}
