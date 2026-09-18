import i18n from "../../i18n";

export const DEFAULT_RECEIPT_DISCLAIMER_KEY = "receipt.disclaimerDefault";

export function defaultDisclaimer() {
  return i18n.t(DEFAULT_RECEIPT_DISCLAIMER_KEY);
}

export function disclaimerStorageKey(requestId: string, locale = i18n.language) {
  return `rizo_receipt_disclaimer:${requestId}:${locale.slice(0, 2)}`;
}

export function loadDisclaimer(requestId: string) {
  const stored = localStorage.getItem(disclaimerStorageKey(requestId));
  return stored && stored.trim() ? stored : defaultDisclaimer();
}

export function saveDisclaimer(requestId: string, value: string) {
  localStorage.setItem(disclaimerStorageKey(requestId), value);
}
