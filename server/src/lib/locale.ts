export const APP_LOCALES = ["uz", "ru", "en"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "uz" || value === "ru" || value === "en";
}

export function parseLocale(value: unknown, fallback: AppLocale = "uz"): AppLocale {
  return isAppLocale(value) ? value : fallback;
}
