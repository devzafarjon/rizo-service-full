import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { dispatchOutbound } from "../notifyDispatch.js";
import { prisma } from "../prisma.js";
import { send } from "./api.js";
import { chatState, setChatState, showMenu } from "./customer.js";
import { linkCustomerChat } from "./links.js";
import { t } from "./text.js";

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_CODES_PER_HOUR = 3;

const hash = (code: string, chatId: number) => createHash("sha256").update(`${chatId}:${code}`).digest("hex");

export const looksLikePhone = (text: string) => /^\+?[\d\s()-]{9,}$/.test(text);

/**
 * A phone number typed in the chat is only a claim: a code is sent by SMS to the number on the account, and the chat is linked
 * when the code comes back. (The shared-contact button needs no code: Telegram vouches that the contact is the sender's own.)
 */
export async function startPhoneCheck(chatId: number, locale: string, rawPhone: string) {
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length < 9) return send(chatId, t("noAccount", locale));
  const customer = await prisma.customer.findFirst({ where: { phone: { endsWith: digits.slice(-9) }, anonymizedAt: null } });
  if (!customer) return send(chatId, t("noAccount", locale));
  // Never let the chat be used to flood somebody with SMS.
  const recent = await prisma.outboundMessage.count({ where: { channel: "sms", to: customer.phone, code: "telegramCode", createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= MAX_CODES_PER_HOUR) return send(chatId, t("otpLimit", locale));
  const code = String(randomInt(100000, 1000000));
  await setChatState(chatId, "otp", { customerId: customer.id, codeHash: hash(code, chatId), expiresAt: Date.now() + TTL_MS, attempts: 0 });
  await dispatchOutbound({ target: { phone: customer.phone }, body: t("otpSms", locale, { code }), code: "telegramCode" });
  await send(chatId, t("otpSent", locale, { tail: customer.phone.slice(-2) }), { reply_markup: { remove_keyboard: true } });
}

/** The next text of a chat that is waiting for its code. Returns false when the chat is not in that state. */
export async function checkPhoneCode(chatId: number, locale: string, text: string) {
  const { state, data } = await chatState(chatId);
  if (state !== "otp") return false;
  const customerId = String(data.customerId ?? "");
  const expected = String(data.codeHash ?? "");
  const attempts = Number(data.attempts ?? 0);
  if (Number(data.expiresAt ?? 0) < Date.now()) {
    await setChatState(chatId, null);
    await send(chatId, t("otpExpired", locale));
    return true;
  }
  const given = hash(text.replace(/\s/g, ""), chatId);
  const same = given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!same) {
    if (attempts + 1 >= MAX_ATTEMPTS) {
      await setChatState(chatId, null);
      await send(chatId, t("otpTooMany", locale));
    } else {
      await setChatState(chatId, "otp", { ...data, attempts: attempts + 1 });
      await send(chatId, t("otpWrong", locale, { left: MAX_ATTEMPTS - attempts - 1 }));
    }
    return true;
  }
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  await setChatState(chatId, null);
  if (!customer || customer.anonymizedAt) {
    await send(chatId, t("noAccount", locale));
    return true;
  }
  await linkCustomerChat(String(chatId), customer.id);
  await showMenu(chatId, customer.locale, t("linked", customer.locale, { name: customer.name.split(/\s+/)[0] }));
  return true;
}
