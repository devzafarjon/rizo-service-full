import { normalizeDisplayId } from "./format";

export function encodeRequestTag(displayId: string) {
  return `RIZO:${normalizeDisplayId(displayId)}`;
}

export function parseRequestTag(raw: string) {
  const text = raw.trim();
  const tagged = text.match(/^RIZO[:/|#-]([A-Za-z0-9]+)$/i);
  if (tagged) return normalizeDisplayId(tagged[1]);
  try {
    const url = new URL(text);
    const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (last) return normalizeDisplayId(last);
  } catch {
    /* not a URL */
  }
  const digits = normalizeDisplayId(text);
  return digits.length >= 8 ? digits : null;
}
