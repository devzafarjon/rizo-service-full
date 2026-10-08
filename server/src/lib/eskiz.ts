import { env } from "../config.js";

const BASE = "https://notify.eskiz.uz/api";

// Eskiz tokens live about 30 days; the cached one is dropped on a 401 and fetched again.
let cachedToken: string | null = null;

async function login(): Promise<string> {
  if (!env.eskizEmail || !env.eskizPassword) {
    throw new Error("Eskiz is not configured (ESKIZ_EMAIL / ESKIZ_PASSWORD)");
  }
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    body: new URLSearchParams({ email: env.eskizEmail, password: env.eskizPassword }),
  });
  if (!res.ok) {
    throw new Error(`Eskiz login returned ${res.status}`);
  }
  const json = (await res.json()) as { data?: { token?: string } };
  const token = json.data?.token;
  if (!token) {
    throw new Error("Eskiz login returned no token");
  }
  cachedToken = token;
  return token;
}

async function post(token: string, to: string, body: string) {
  return fetch(`${BASE}/message/sms/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: new URLSearchParams({ mobile_phone: to, message: body, from: env.eskizSender }),
  });
}

/** Sends one SMS through Eskiz. `to` is digits only, with the country code (998901234567). */
export async function sendEskizSms(to: string, body: string) {
  let res = await post(cachedToken ?? (await login()), to, body);
  if (res.status === 401) {
    res = await post(await login(), to, body);
  }
  if (!res.ok) {
    throw new Error(`Eskiz returned ${res.status}`);
  }
}
