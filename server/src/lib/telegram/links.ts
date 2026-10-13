import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { botUsername } from "./api.js";

const TTL_MS = 15 * 60 * 1000;
export type LinkKind = "customer" | "staff";
const PREFIX: Record<LinkKind, string> = { customer: "c_", staff: "s_" };

/** A one-time https://t.me/<bot>?start=… link that connects the chat to this account. `url` is null while the bot's name is unknown. */
export async function createLinkToken(kind: LinkKind, subjectId: string) {
  await prisma.telegramLinkToken.deleteMany({ where: { OR: [{ subjectId }, { expiresAt: { lt: new Date() } }] } });
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.telegramLinkToken.create({ data: { token, kind, subjectId, expiresAt } });
  const username = await botUsername();
  return { token, expiresAt, url: username ? `https://t.me/${username}?start=${PREFIX[kind]}${token}` : null };
}

/** Takes the `start` payload of a /start command; the token works once. */
export async function consumeLinkPayload(payload: string) {
  const kind: LinkKind | null = payload.startsWith("c_") ? "customer" : payload.startsWith("s_") ? "staff" : null;
  if (!kind) return null;
  const token = payload.slice(2);
  const row = await prisma.telegramLinkToken.findUnique({ where: { token } });
  if (!row || row.kind !== kind) return null;
  await prisma.telegramLinkToken.delete({ where: { token } }).catch(() => undefined);
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { kind, subjectId: row.subjectId };
}

/** One chat belongs to one account: linking it anywhere frees it from where it was. */
export async function linkCustomerChat(chatId: string, customerId: string) {
  await prisma.customer.updateMany({ where: { telegramChatId: chatId, id: { not: customerId } }, data: { telegramChatId: null } });
  await prisma.staffUser.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } });
  await prisma.customer.update({ where: { id: customerId }, data: { telegramChatId: chatId } });
}

export async function linkStaffChat(chatId: string, staffId: string) {
  await prisma.customer.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } });
  await prisma.staffUser.updateMany({ where: { telegramChatId: chatId, id: { not: staffId } }, data: { telegramChatId: null } });
  await prisma.staffUser.update({ where: { id: staffId }, data: { telegramChatId: chatId, telegramNotify: true } });
}

export async function unlinkChat(chatId: string) {
  await prisma.customer.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } });
  await prisma.staffUser.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } });
  await prisma.telegramChat.updateMany({ where: { chatId }, data: { state: null, data: Prisma.DbNull } });
}
