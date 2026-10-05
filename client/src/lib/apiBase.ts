// Empty in development (Vite proxies /api). On Netlify set VITE_API_URL to the public URL of the API,
// e.g. https://rizo-service-api.onrender.com
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/+$/, "");

/** Prefixes server-relative paths (/api/..., /uploads/...) with the API origin when one is configured. */
export function withApiBase(path: string) {
  return path.startsWith("/") ? `${API_BASE}${path}` : path;
}
