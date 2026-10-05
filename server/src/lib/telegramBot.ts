import { env } from "../config.js";
import { formatRequestId } from "./displayId.js";
import { prisma } from "./prisma.js";
import { statusLabel, OPEN_STATUSES } from "./status.js";

/**
 * A small Telegram bot (long polling). It only starts when TELEGRAM_BOT_TOKEN is set.
 *  /start        - asks for the phone number on the RIZO account (or a shared contact) and links the chat
 *  /status       - lists the customer's open requests
 *  /status <id>  - one request by its number
 * Linked chats then receive every status notification through the normal outbound queue.
 */
const API = (method: string) => `https://api.telegram.org/bot${env.telegramBotToken}/${method}`;

async function call(method: string, body: Record<string, unknown>) {
  const res = await fetch(API(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Telegram ${method} returned ${res.status}`);
  return (await res.json()) as { ok: boolean; result: unknown };
}

async function reply(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  await call("sendMessage", { chat_id: chatId, text, ...extra });
}

const phoneKeyboard = {
  reply_markup: { keyboard: [[{ text: "Share my phone number", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
};

type Update = {
  update_id: number;
  message?: { chat: { id: number }; text?: string; contact?: { phone_number: string } };
};

async function linkByPhone(chatId: number, rawPhone: string) {
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length < 9) {
    await reply(chatId, "Please send the phone number registered with RIZO, for example 998901234567.");
    return;
  }
  const customer = await prisma.customer.findFirst({ where: { phone: { endsWith: digits.slice(-9) } } });
  if (!customer) {
    await reply(chatId, "We could not find an account with this number. Check the number or register at the RIZO Service website.");
    return;
  }
  await prisma.customer.update({ where: { id: customer.id }, data: { telegramChatId: String(chatId) } });
  await reply(chatId, `Hello, ${customer.name.split(/\s+/)[0]}! You will now get updates about your requests here. Send /status to see them.`, { reply_markup: { remove_keyboard: true } });
}

async function handle(update: Update) {
  const message = update.message;
  if (!message) return;
  const chatId = message.chat.id;
  if (message.contact?.phone_number) {
    await linkByPhone(chatId, message.contact.phone_number);
    return;
  }
  const text = (message.text ?? "").trim();
  if (text.startsWith("/start")) {
    await reply(chatId, "Welcome to RIZO Service. Share your phone number to link your account.", phoneKeyboard);
    return;
  }
  if (text.startsWith("/status")) {
    const customer = await prisma.customer.findFirst({ where: { telegramChatId: String(chatId) } });
    if (!customer) {
      await reply(chatId, "Please link your account first: send /start.");
      return;
    }
    const id = text.replace("/status", "").trim().replace(/^#/, "");
    const requests = await prisma.serviceRequest.findMany({
      where: { customerId: customer.id, ...(id ? { displayId: id } : { status: { in: OPEN_STATUSES } }) },
      include: { product: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (requests.length === 0) {
      await reply(chatId, id ? "No request with that number on your account." : "You have no open requests.");
      return;
    }
    await reply(chatId, requests.map((request) => `${formatRequestId(request.displayId)} · ${request.product.name} · ${statusLabel(request.status)}`).join("\n"));
    return;
  }
  if (/^\+?[\d\s()-]{9,}$/.test(text)) {
    await linkByPhone(chatId, text);
    return;
  }
  await reply(chatId, "Send /status to see your requests, or /start to link your account.");
}

export function startTelegramBot() {
  if (!env.telegramBotToken || env.telegramProvider === "console") return;
  let offset = 0;
  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      try {
        const data = (await (await fetch(API("getUpdates"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offset, timeout: 30 }) })).json()) as {
          ok: boolean;
          result?: Update[];
        };
        for (const update of data.result ?? []) {
          offset = update.update_id + 1;
          await handle(update).catch((error) => console.error("[telegram]", error));
        }
      } catch (error) {
        console.error("[telegram] polling failed", error instanceof Error ? error.message : error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  };
  console.log("[telegram] bot started");
  void loop();
  return () => {
    stopped = true;
  };
}
