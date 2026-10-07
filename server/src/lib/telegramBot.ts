import { env } from "../config.js";
import { formatRequestId } from "./displayId.js";
import { prisma } from "./prisma.js";
import { statusLabel, OPEN_STATUSES } from "./status.js";
import { postCustomerMessage, submitFeedback } from "./customerActions.js";
import { approveEstimate, declineEstimate } from "./estimates.js";
import { confirmVisit } from "./visits.js";
import { tt } from "./telegramText.js";

/**
 * A small Telegram bot (long polling). It only starts when TELEGRAM_BOT_TOKEN is set.
 *  /start          - asks for the phone number on the RIZO account (or a shared contact) and links the chat
 *  /status         - lists the customer's open requests
 *  /status <id>    - one request by its number
 *  /message <id> … - writes to the service about a request (plain text works when there is one open request)
 * Linked chats receive every status notification through the normal outbound queue, with buttons to approve or
 * decline an estimate, confirm a visit and rate a finished job.
 */
const API = (method: string) => `https://api.telegram.org/bot${env.telegramBotToken}/${method}`;

type Caller = (method: string, body: Record<string, unknown>) => Promise<unknown>;
let caller: Caller | null = null;
/** Lets a test replace the network call. */
export function setTelegramCaller(next: Caller | null) {
  caller = next;
}

async function call(method: string, body: Record<string, unknown>) {
  if (caller) return (await caller(method, body)) as { ok: boolean; result: unknown };
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
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
};

async function customerOf(chatId: number) {
  return prisma.customer.findFirst({ where: { telegramChatId: String(chatId) } });
}

/** One of the buttons under a notification was pressed. */
async function handleButton(query: NonNullable<Update["callback_query"]>) {
  const chatId = query.message?.chat.id;
  if (!chatId || !query.data) return;
  const customer = await customerOf(chatId);
  await call("answerCallbackQuery", { callback_query_id: query.id }).catch(() => undefined);
  if (!customer) {
    await reply(chatId, "Please link your account first: send /start.");
    return;
  }
  // est:ok|no:<request>   visit:ok:<request>   rate:<request>:<1-5>
  const parts = query.data.split(":");
  const kind = parts[0];
  const action = kind === "rate" ? "rate" : parts[1];
  const requestId = kind === "rate" ? parts[1] : parts[2];
  const extra = kind === "rate" ? parts[2] : undefined;
  const request = await prisma.serviceRequest.findFirst({ where: { id: requestId, customerId: customer.id }, include: { estimates: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!request) {
    await reply(chatId, tt("nothingToDo", customer.locale));
    return;
  }
  const actor = { id: customer.id, type: "customer" as const, name: customer.name };
  try {
    if (kind === "est") {
      const estimate = request.estimates[0];
      if (!estimate || estimate.status !== "sent") throw new Error("gone");
      if (action === "ok") {
        const result = await approveEstimate({ estimateId: estimate.id, by: { kind: "customer", id: customer.id, name: customer.name }, selectedOptionalLineIds: [] });
        const { advanceAfterApproval } = await import("../routes/requests.js");
        await advanceAfterApproval(request.id, result.waitingForParts, actor);
        await reply(chatId, tt("estimateApproved", customer.locale));
      } else {
        await declineEstimate({ estimateId: estimate.id, reason: "", by: { kind: "customer", id: customer.id, name: customer.name } });
        await reply(chatId, tt("estimateDeclined", customer.locale));
      }
    } else if (kind === "visit") {
      await confirmVisit(request.id, actor);
      await reply(chatId, tt("visitConfirmed", customer.locale));
    } else if (kind === "rate") {
      await submitFeedback({ customerId: customer.id, requestId: request.id, rating: Math.min(5, Math.max(1, Number(extra) || 5)) });
      await reply(chatId, tt("thanksRating", customer.locale));
    }
  } catch {
    // Pressed twice, or the situation changed since the message was sent.
    await reply(chatId, tt("nothingToDo", customer.locale));
  }
}

async function handleMessageToService(chatId: number, text: string) {
  const customer = await customerOf(chatId);
  if (!customer) {
    await reply(chatId, "Please link your account first: send /start.");
    return;
  }
  const match = text.match(/^\/message(?:@\w+)?\s+#?(\d{6,})\s+([\s\S]+)$/);
  let requestId: string | null = null;
  let body = text.replace(/^\/message(?:@\w+)?\s*/, "").trim();
  if (match) {
    const found = await prisma.serviceRequest.findFirst({ where: { displayId: match[1], customerId: customer.id } });
    requestId = found?.id ?? null;
    body = match[2].trim();
  } else {
    const open = await prisma.serviceRequest.findMany({ where: { customerId: customer.id, status: { in: OPEN_STATUSES } }, select: { id: true }, take: 2 });
    if (open.length === 0) {
      await reply(chatId, tt("noOpen", customer.locale));
      return;
    }
    if (open.length === 1) requestId = open[0].id;
  }
  if (!requestId || !body) {
    await reply(chatId, tt("pickRequest", customer.locale));
    return;
  }
  await postCustomerMessage({ customerId: customer.id, requestId, text: body.slice(0, 1000) });
  await reply(chatId, tt("messageSent", customer.locale));
}

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

export async function handleUpdate(update: Update) {
  if (update.callback_query) {
    await handleButton(update.callback_query);
    return;
  }
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
  if (text.startsWith("/message")) {
    await handleMessageToService(chatId, text);
    return;
  }
  if (/^\+?[\d\s()-]{9,}$/.test(text)) {
    await linkByPhone(chatId, text);
    return;
  }
  // Plain text from a linked customer goes to the service when there is exactly one open request.
  if (text && !text.startsWith("/") && (await customerOf(chatId))) {
    await handleMessageToService(chatId, `/message ${text}`);
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
          await handleUpdate(update).catch((error) => console.error("[telegram]", error));
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
