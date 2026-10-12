import { env } from "../../config.js";

type Caller = (method: string, body: Record<string, unknown>) => Promise<unknown>;
let caller: Caller | null = null;

/** Lets a test replace the network call. */
export function setTelegramCaller(next: Caller | null) {
  caller = next;
}

/** True when the real Bot API is used (a token is set and the provider is not the log-only `console`). */
export function botIsLive() {
  return Boolean(env.telegramBotToken) && env.telegramProvider !== "console";
}

export async function call(method: string, body: Record<string, unknown> = {}) {
  if (caller) return (await caller(method, body)) as { ok: boolean; result: unknown };
  if (!botIsLive()) {
    console.log(`[telegram:console] ${method} ${JSON.stringify(body).slice(0, 300)}`);
    return { ok: true, result: null };
  }
  const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Telegram ${method} returned ${res.status}`);
  return (await res.json()) as { ok: boolean; result: unknown };
}

export type Button = { text: string; callback_data?: string; url?: string };
export type Rows = Button[][];
export const inline = (rows: Rows) => ({ reply_markup: { inline_keyboard: rows } });

export async function send(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  await call("sendMessage", { chat_id: chatId, text, ...extra });
}

let cachedUsername: string | null = null;

/** The bot's @username (for t.me links): from TELEGRAM_BOT_USERNAME, else asked from Telegram once. */
export async function botUsername(): Promise<string | null> {
  if (env.telegramBotUsername) return env.telegramBotUsername;
  if (cachedUsername) return cachedUsername;
  if (!botIsLive() && !caller) return null;
  try {
    const me = (await call("getMe")) as { result?: { username?: string } | null };
    cachedUsername = me.result?.username ?? null;
  } catch {
    cachedUsername = null;
  }
  return cachedUsername;
}

export function resetTelegramCache() {
  cachedUsername = null;
}
