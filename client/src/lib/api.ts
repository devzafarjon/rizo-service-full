import { localizedName, type Named } from "./localized";

export const STAFF_TOKEN_KEY = "rizo_staff_token";
export const CUSTOMER_TOKEN_KEY = "rizo_customer_token";
export const AUTH_EXPIRED_EVENT = "rizo:auth-expired";

function expireAuth(path: string) {
  const scope = path.startsWith("/api/staff") ? "staff" : path.startsWith("/api/customer") ? "customer" : null;
  if (!scope || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { scope } }));
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, message: string, code = "generic", details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function apiErrorMessage(
  err: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (err instanceof ApiError) {
    const details: Record<string, unknown> = { ...(err.details ?? {}) };
    if (details.nameUz || details.nameRu || details.nameEn || details.name) {
      details.name = localizedName(details as Named);
    }
    if (Array.isArray(details.gaps)) {
      details.list = (details.gaps as string[])
        .map((gap) => t(`job.gap.${gap}`, { defaultValue: gap }))
        .join(", ");
    }
    return t(`errors.${err.code}`, { ...details, defaultValue: err.message });
  }
  return t("errors.generic");
}

function parseError(data: { error?: string; code?: string; details?: Record<string, unknown> }, fallback: string) {
  return new ApiError(0, data.error ?? fallback, data.code ?? "generic", data.details);
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    details?: Record<string, unknown>;
  } & T;
  if (!res.ok) {
    const err = parseError(data, "Request failed");
    err.status = res.status;
    if (token && res.status === 401 && (err.code === "invalidSession" || err.code === "accountGone" || err.code === "required")) {
      expireAuth(path);
    }
    throw err;
  }
  return data;
}

export async function apiForm<T>(
  path: string,
  options: { token?: string | null; formData: FormData; method?: string } = { formData: new FormData() },
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "POST",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.formData,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    details?: Record<string, unknown>;
  } & T;
  if (!res.ok) {
    const err = parseError(data, "Request failed");
    err.status = res.status;
    if (options.token && res.status === 401 && (err.code === "invalidSession" || err.code === "accountGone" || err.code === "required")) {
      expireAuth(path);
    }
    throw err;
  }
  return data;
}
