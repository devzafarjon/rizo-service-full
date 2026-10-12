import { env } from "../config.js";
import { sendEskizSms } from "./eskiz.js";
import { prisma } from "./prisma.js";
import { call } from "./telegram/api.js";

/** Admin alerts that also go to the admin Telegram chat. */
const ADMIN_TELEGRAM_CODES = new Set(["overdue", "lowStock", "lowRating", "escalation", "weeklyDigest", "deletionRequest", "dailyReport", "payrollSummary", "deadlineSummary"]);

export type DispatchTarget = {
  phone?: string | null;
  telegramChatId?: string | null;
};

async function mark(id: string, status: "sent" | "failed", error?: string) {
  await prisma.outboundMessage.update({
    where: { id },
    data: { status, error: error ?? null, sentAt: status === "sent" ? new Date() : null },
  });
}

export async function sendSms(to: string, body: string) {
  if (env.smsProvider === "eskiz") {
    await sendEskizSms(to, body);
    return;
  }
  if (!env.smsHttpUrl) {
    if (env.smsProvider === "console") {
      console.log(`[sms:console] to=${to} ${body}`);
      return;
    }
    throw new Error("SMS provider is not configured");
  }
  const res = await fetch(env.smsHttpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.smsHttpToken ? { Authorization: `Bearer ${env.smsHttpToken}` } : {}),
    },
    body: JSON.stringify({ to, body }),
  });
  if (!res.ok) {
    throw new Error(`SMS gateway returned ${res.status}`);
  }
}

export type TelegramButtons = Array<Array<{ text: string; callback_data: string }>>;

async function sendTelegram(chatId: string, body: string, buttons?: TelegramButtons) {
  if (!env.telegramBotToken && env.telegramProvider !== "console") throw new Error("Telegram bot is not configured");
  // `call` talks to the Bot API, or only logs while the provider is `console` (and lets a test stub the network).
  await call("sendMessage", { chat_id: chatId, text: body, ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}) });
}

export async function dispatchOutbound(input: {
  target: DispatchTarget;
  body: string;
  code?: string;
  entityId?: string;
  /** Inline buttons under the Telegram message (approve, rate, confirm). */
  telegramButtons?: TelegramButtons;
  /** The text for Telegram when it differs from the SMS text (the customer's own language). */
  telegramBody?: string;
}) {
  const jobs: Array<{ channel: string; to: string; send: () => Promise<void> }> = [];
  if (input.target.phone) {
    jobs.push({ channel: "sms", to: input.target.phone, send: () => sendSms(input.target.phone!, input.body) });
  }
  const telegramTo = input.target.telegramChatId || env.telegramAdminChatId;
  if (telegramTo && (input.target.telegramChatId || (input.code && ADMIN_TELEGRAM_CODES.has(input.code)))) {
    jobs.push({ channel: "telegram", to: telegramTo, send: () => sendTelegram(telegramTo, input.telegramBody ?? input.body, input.telegramButtons) });
  }

  for (const job of jobs) {
    const row = await prisma.outboundMessage.create({
      data: {
        channel: job.channel,
        to: job.to,
        body: input.body,
        status: "pending",
        code: input.code ?? null,
        entityId: input.entityId ?? null,
      },
    });
    try {
      await job.send();
      await mark(row.id, "sent");
    } catch (error) {
      await mark(row.id, "failed", error instanceof Error ? error.message : "Send failed");
    }
  }
}
