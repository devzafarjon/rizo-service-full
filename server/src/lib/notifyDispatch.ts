import { env } from "../config.js";
import { sendEskizSms } from "./eskiz.js";
import { prisma } from "./prisma.js";

/** Admin alerts that also go to the admin Telegram chat. */
const ADMIN_TELEGRAM_CODES = new Set(["overdue", "lowStock", "lowRating", "escalation", "weeklyDigest", "deletionRequest"]);

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
  if (!env.telegramBotToken) {
    if (env.telegramProvider === "console") {
      console.log(`[telegram:console] chat=${chatId} ${body}${buttons?.length ? ` [${buttons.flat().map((button) => button.text).join(" | ")}]` : ""}`);
      return;
    }
    throw new Error("Telegram bot is not configured");
  }
  const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: body, ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}) }),
  });
  if (!res.ok) {
    throw new Error(`Telegram returned ${res.status}`);
  }
}

export async function dispatchOutbound(input: {
  target: DispatchTarget;
  body: string;
  code?: string;
  entityId?: string;
  /** Inline buttons under the Telegram message (approve, rate, confirm). */
  telegramButtons?: TelegramButtons;
}) {
  const jobs: Array<{ channel: string; to: string; send: () => Promise<void> }> = [];
  if (input.target.phone) {
    jobs.push({ channel: "sms", to: input.target.phone, send: () => sendSms(input.target.phone!, input.body) });
  }
  const telegramTo = input.target.telegramChatId || env.telegramAdminChatId;
  if (telegramTo && (input.target.telegramChatId || (input.code && ADMIN_TELEGRAM_CODES.has(input.code)))) {
    jobs.push({ channel: "telegram", to: telegramTo, send: () => sendTelegram(telegramTo, input.body, input.telegramButtons) });
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
