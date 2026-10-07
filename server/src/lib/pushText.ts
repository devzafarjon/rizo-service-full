import { PUSH_TEXTS } from "./pushTexts.generated.js";
import { parseLocale, type AppLocale } from "./locale.js";

type Params = Record<string, unknown> | null | undefined;
type Dictionary = Record<string, unknown>;

// Only for pushes that have no in-app notification row (the website's `notify.*` group has no entry for them).
const EXTRA_NOTIFY: Record<AppLocale, Record<string, string>> = {
  uz: { jobAssigned: "Sizga yangi ish tayinlandi: {{id}}" },
  ru: { jobAssigned: "Вам назначена новая заявка: {{id}}" },
  en: { jobAssigned: "A new job was assigned to you: {{id}}" },
};

const LEGACY_STATUS: Record<string, string> = {
  scheduled: "new",
  received: "new",
  repairing: "in_progress",
  ready_for_pickup: "ready",
  closed: "completed",
};

function lookup(dictionary: unknown, key: string): string {
  const value = (dictionary as Dictionary | undefined)?.[key];
  return typeof value === "string" ? value : "";
}

/** The same "#DDMMYYRRNNNN" the apps show. */
function requestId(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return text ? `#${text}` : "";
}

function productName(params: NonNullable<Params>, locale: AppLocale) {
  const byLocale = { uz: params.nameUz, ru: params.nameRu, en: params.nameEn }[locale];
  const fallback = params.productName ?? params.product ?? "";
  return String(byLocale || fallback || "");
}

/** Renders a notification in the device's language; falls back to the English message the server stored. */
export function pushBody(input: { code?: string | null; params?: Params; message: string; locale?: string | null }): string {
  const locale = parseLocale(input.locale);
  const code = input.code ?? "";
  const template = (code && (lookup(PUSH_TEXTS[locale].notify, code) || EXTRA_NOTIFY[locale][code])) || "";
  if (!template) return input.message;
  const params = (input.params ?? {}) as NonNullable<Params>;
  const status = typeof params.status === "string" ? lookup(PUSH_TEXTS[locale].customerStatus, LEGACY_STATUS[params.status] ?? params.status) : "";
  const type = typeof params.type === "string" ? lookup(PUSH_TEXTS[locale].type, params.type) : "";
  const values: Record<string, string> = {
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, value == null ? "" : String(value)])),
    type,
    status,
    product: productName(params, locale),
    id: requestId(params.displayId),
    count: String(params.stockQuantity ?? params.count ?? ""),
  };
  let missing = false;
  const text = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (!value) missing = true;
    return value ?? "";
  });
  return missing ? input.message : text;
}
