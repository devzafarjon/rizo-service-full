import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import uz from "./locales/uz.json";

export const APP_LOCALES = ["uz", "ru", "en"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const LOCALE_STORAGE_KEY = "rizo_locale";
export const DEFAULT_LOCALE: AppLocale = "uz";

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "uz" || value === "ru" || value === "en";
}

export function parseLocale(value: unknown, fallback: AppLocale = DEFAULT_LOCALE): AppLocale {
  if (typeof value !== "string") return fallback;
  const short = value.slice(0, 2).toLowerCase();
  return isAppLocale(short) ? short : fallback;
}

export function intlLocale(language = i18n.language): string {
  const locale = parseLocale(language);
  if (locale === "ru") return "ru-RU";
  if (locale === "en") return "en-GB";
  return "uz-UZ";
}

export async function applyLocale(locale: AppLocale) {
  const next = parseLocale(locale);
  if (i18n.language !== next) {
    await i18n.changeLanguage(next);
  }
  localStorage.setItem(LOCALE_STORAGE_KEY, next);
  document.documentElement.lang = next;
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      uz: { translation: uz },
      ru: { translation: ru },
      en: { translation: en },
    },
    supportedLngs: [...APP_LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = parseLocale(lng);
});

document.documentElement.lang = parseLocale(i18n.resolvedLanguage ?? i18n.language);

export default i18n;
