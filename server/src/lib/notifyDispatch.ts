import { env } from "../config.js";
import { prisma } from "./prisma.js";

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

async function sendSms(to: string, body: string) {
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

async function sendTelegram(chatId: string, body: string) {
  if (!env.telegramBotToken) {
    if (env.telegramProvider === "console") {
      console.log(`[telegram:console] chat=${chatId} ${body}`);
      return;
    }
    throw new Error("Telegram bot is not configured");
  }
  const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: body }),
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
}) {
  const jobs: Array<{ channel: string; to: string; send: () => Promise<void> }> = [];
  if (input.target.phone) {
    jobs.push({ channel: "sms", to: input.target.phone, send: () => sendSms(input.target.phone!, input.body) });
  }
  const telegramTo = input.target.telegramChatId || env.telegramAdminChatId;
  if (telegramTo && (input.target.telegramChatId || input.code === "overdue" || input.code === "lowStock")) {
    jobs.push({ channel: "telegram", to: telegramTo, send: () => sendTelegram(telegramTo, input.body) });
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
