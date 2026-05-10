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
} else {
  // HMR / Fast Refresh: re-merge bundles so new keys added to ar.ts/en.ts
  // become visible without a full app reload. `deep=true, overwrite=true`
  // ensures changed values replace the cached ones.
  i18n.addResourceBundle("ar", "translation", ar, true, true);
  i18n.addResourceBundle("en", "translation", en, true, true);
}

/**
 * Apply RTL/LTR for the chosen language.
 *
 * Important: this app handles RTL UI **manually** via explicit
 * `flexDirection: 'row-reverse'` and `textAlign: 'right'` everywhere.
 * We deliberately do NOT enable `I18nManager.forceRTL(true)` (or
 * `document.dir='rtl'` on web), because doing so makes the platform
 * silently flip every flex container — turning every `row-reverse`
 * into `row`, which mirrors the entire UI on Android (where
 * forceRTL takes effect) while iOS (where it doesn't) stays correct.
 *
 * Forcing the layout direction to LTR makes `flexDirection: row-reverse`
 * mean physical right-to-left identically on iOS, Android, and Web.
 * Arabic text glyphs themselves still render right-to-left thanks to
 * Unicode's bidi algorithm — that's independent of `direction`.
 */
export function applyDirection(_lang: AppLang): { needsReload: boolean } {
  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      // Always 'ltr' — see header comment. Setting `lang` is still
      // useful for screen readers / spellcheck.
      document.documentElement.setAttribute("dir", "ltr");
      document.documentElement.setAttribute("lang", _lang);
    }
    return { needsReload: false };
  }

  // Native: undo any previously-applied forceRTL. If a previous build
  // toggled `I18nManager.isRTL=true`, take effect on next launch. We
  // also disable the left/right swap so styles using `left`/`right`
  // aren't mirrored.
  let queued = false;
  try {
    if (I18nManager.isRTL) {
      I18nManager.allowRTL(false);
      I18nManager.forceRTL(false);
      queued = true;
    }
    I18nManager.swapLeftAndRightInRTL(false);
  } catch {
    // ignore — only thrown when the bridge isn't ready, and we'll
    // retry on the next mount anyway.
  }
  return { needsReload: queued };
}

/** Switch the active language and apply direction side-effects.
 *
 * Also persists the choice to `users.language` so server-side triggers
 * (booking notifications, completion, etc.) emit copy in the right
 * language. Best-effort — if the user is signed out or Supabase is
 * unreachable we still flip the local UI language.
 */
export async function setAppLanguage(lang: AppLang): Promise<{ needsReload: boolean }> {
  await i18n.changeLanguage(lang);
  // Fire-and-forget DB update so the UI doesn't wait on it.
  void persistLanguagePreference(lang);
  return applyDirection(lang);
}

async function persistLanguagePreference(lang: AppLang): Promise<void> {
  try {
    // Lazy-import to avoid a circular dep (supabase.ts imports nothing
    // from i18n, but i18n shouldn't pull supabase at module load).
    const { isSupabaseConfigured, supabase } = await import("@/lib/supabase");
    if (!isSupabaseConfigured || !supabase) return;
    const { data } = await supabase.auth.getUser();
    const authUserId = data?.user?.id;
    if (!authUserId) return;
    await supabase
      .from("users")
      .update({ language: lang })
      .eq("auth_user_id", authUserId);
  } catch {
    // Network / RLS errors are non-fatal — the UI language is already
    // switched, and the next sign-in will pick up the persisted value.
  }
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
