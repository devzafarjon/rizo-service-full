import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../../config.js";
import { parseLocale } from "../locale.js";
import { prisma } from "../prisma.js";
import { botIsLive, call, send, botUsername } from "./api.js";
import { askLanguage, chatState, customerByChat, listRequests, menuChoice, menuKeyboard, newRequestStep, plainText, sendMessageToService, setChatState, showApp, showCenters, showMenu, showRequest, showWarranty, startMessage, startNewRequest, customerButton } from "./customer.js";
import { consumeLinkPayload, linkCustomerChat, linkStaffChat, unlinkChat } from "./links.js";
import { checkPhoneCode, looksLikePhone, startPhoneCheck } from "./otp.js";
import { greetStaff, setStaffNotify, showStaffAlerts, showStaffJobs, showStaffOverview, staffByChat, staffChoice } from "./staff.js";
import { t } from "./text.js";

export { setTelegramCaller } from "./api.js";

/**
 * The Telegram bot. It starts when TELEGRAM_BOT_TOKEN is set (and the provider is not `console`): by webhook when
 * TELEGRAM_WEBHOOK_URL + TELEGRAM_WEBHOOK_SECRET are set (works on a host that sleeps), otherwise by long polling.
 *
 * Customers: connect with the phone number they share with the bot button (it must be their own contact) or with the one-time link
 * from the website / app; then a menu: requests (cards with estimate / visit / message buttons), new request, warranty, service
 * centres, message to the service, language, app and site. Staff connect only with the one-time link from the website / app; they get
 * the same alerts as in the bell and can look at alerts and jobs.
 */

type TgMessage = {
  chat: { id: number };
  from?: { id: number };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
  location?: { latitude: number; longitude: number };
  photo?: unknown[];
};
export type Update = {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; data?: string; from?: { id: number }; message?: { chat: { id: number } } };
};

async function chatLocale(chatId: number) {
  return parseLocale((await chatState(chatId)).locale);
}

function contactKeyboard(locale: string) {
  return { reply_markup: { keyboard: [[{ text: t("shareContact", locale), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } };
}

async function welcome(chatId: number, locale: string) {
  await send(chatId, t("welcome", locale), contactKeyboard(locale));
}

/** Connects the chat to the customer whose phone it shares; only the sender's own contact counts. */
async function linkByContact(message: TgMessage) {
  const chatId = message.chat.id;
  const locale = await chatLocale(chatId);
  const contact = message.contact!;
  if (!message.from?.id || contact.user_id !== message.from.id) return send(chatId, t("ownContactOnly", locale), contactKeyboard(locale));
  const digits = contact.phone_number.replace(/\D/g, "");
  const customer = digits.length < 9 ? null : await prisma.customer.findFirst({ where: { phone: { endsWith: digits.slice(-9) }, anonymizedAt: null } });
  // The Telegram number is often not the one on the account: then the account number can be typed and is checked by SMS.
  if (!customer) return send(chatId, t("noAccountTryTyping", locale), { reply_markup: { remove_keyboard: true } });
  await linkCustomerChat(String(chatId), customer.id);
  await setChatState(chatId, null);
  await showMenu(chatId, customer.locale, t("linked", customer.locale, { name: customer.name.split(/\s+/)[0] }));
}

/** /start with a one-time key from the website or the app. */
async function startWithKey(chatId: number, payload: string) {
  const locale = await chatLocale(chatId);
  const link = await consumeLinkPayload(payload);
  if (!link) return send(chatId, t("linkExpired", locale));
  if (link.kind === "customer") {
    const customer = await prisma.customer.findUnique({ where: { id: link.subjectId } });
    if (!customer || customer.anonymizedAt) return send(chatId, t("linkExpired", locale));
    await linkCustomerChat(String(chatId), customer.id);
    await setChatState(chatId, null);
    return showMenu(chatId, customer.locale, t("linked", customer.locale, { name: customer.name.split(/\s+/)[0] }));
  }
  const staff = await prisma.staffUser.findUnique({ where: { id: link.subjectId } });
  if (!staff || !staff.isActive) return send(chatId, t("linkExpired", locale));
  await linkStaffChat(String(chatId), staff.id);
  await setChatState(chatId, null);
  return greetStaff(chatId, (await prisma.staffUser.findUnique({ where: { id: staff.id } }))!);
}

async function changeLanguage(chatId: number, code: string) {
  const locale = parseLocale(code);
  const customer = await customerByChat(chatId);
  const staff = customer ? null : await staffByChat(chatId);
  if (customer) await prisma.customer.update({ where: { id: customer.id }, data: { locale } });
  else if (staff) await prisma.staffUser.update({ where: { id: staff.id }, data: { locale } });
  await prisma.telegramChat.upsert({ where: { chatId: String(chatId) }, update: { locale }, create: { chatId: String(chatId), locale } });
  if (customer) return showMenu(chatId, locale, t("languageChanged", locale));
  if (staff) return greetStaff(chatId, (await prisma.staffUser.findUnique({ where: { id: staff.id } }))!);
  return welcome(chatId, locale);
}

async function handleCallback(query: NonNullable<Update["callback_query"]>) {
  const chatId = query.message?.chat.id;
  if (!chatId || !query.data) return;
  await call("answerCallbackQuery", { callback_query_id: query.id }).catch(() => undefined);
  if (query.data.startsWith("lang:")) return changeLanguage(chatId, query.data.slice(5));
  const customer = await customerByChat(chatId);
  if (!customer) return send(chatId, t("notLinked", await chatLocale(chatId)));
  return customerButton(chatId, customer, query.data);
}

async function handleText(message: TgMessage) {
  const chatId = message.chat.id;
  const text = (message.text ?? "").trim();
  const command = text.startsWith("/") ? text.split(/\s+/)[0].replace(/@\w+$/, "").toLowerCase() : "";
  const rest = text.replace(/^\/\S+\s*/, "").trim();

  // ---- /start ---------------------------------------------------------------------------------------------------
  if (command === "/start") {
    if (rest) return startWithKey(chatId, rest);
    const customer = await customerByChat(chatId);
    if (customer) return showMenu(chatId, customer.locale);
    const staff = await staffByChat(chatId);
    if (staff) return greetStaff(chatId, staff);
    const known = await prisma.telegramChat.findUnique({ where: { chatId: String(chatId) } });
    return known ? welcome(chatId, parseLocale(known.locale)) : askLanguage(chatId);
  }
  if (command === "/lang" || command === "/language") return askLanguage(chatId);

  const staff = await staffByChat(chatId);
  if (staff) return handleStaffText(chatId, staff, command, text);

  const customer = await customerByChat(chatId);
  if (!customer) {
    // A typed number is only a claim: it is checked with an SMS code. The shared contact (or a key from the site) links at once.
    const locale = await chatLocale(chatId);
    if (command === "/cancel") {
      await setChatState(chatId, null);
      return welcome(chatId, locale);
    }
    if (await checkPhoneCode(chatId, locale, text)) return;
    return looksLikePhone(text) ? startPhoneCheck(chatId, locale, text) : welcome(chatId, locale);
  }
  const locale = customer.locale;

  // ---- commands ------------------------------------------------------------------------------------------------
  if (command === "/stop") {
    await unlinkChat(String(chatId));
    return send(chatId, t("unlinked", locale), { reply_markup: { remove_keyboard: true } });
  }
  if (command === "/cancel") {
    await setChatState(chatId, null);
    return showMenu(chatId, locale, t("cancelled", locale));
  }
  if (command === "/menu") return showMenu(chatId, locale);
  if (command === "/help") return send(chatId, t("help", locale), menuKeyboard(locale));
  if (command === "/status") {
    const id = rest.replace(/^#/, "");
    if (!id) return listRequests(chatId, customer);
    const found = await prisma.serviceRequest.findFirst({ where: { displayId: id, customerId: customer.id } });
    return found ? showRequest(chatId, customer, found.id) : send(chatId, t("noSuchRequest", locale));
  }
  if (command === "/message") {
    const match = rest.match(/^#?(\d{6,})\s+([\s\S]+)$/);
    if (match) {
      const found = await prisma.serviceRequest.findFirst({ where: { displayId: match[1], customerId: customer.id } });
      return found ? sendMessageToService(chatId, customer, found.id, match[2].trim()) : send(chatId, t("noSuchRequest", locale));
    }
    return rest ? plainText(chatId, customer, rest) : startMessage(chatId, customer);
  }
  if (command === "/new") return startNewRequest(chatId, customer);

  // ---- menu buttons (they also leave any dialogue) ----------------------------------------------------------------
  const choice = menuChoice(text);
  if (choice) {
    await setChatState(chatId, null);
    if (choice === "menuRequests") return listRequests(chatId, customer);
    if (choice === "menuNew") return startNewRequest(chatId, customer);
    if (choice === "menuWarranty") return showWarranty(chatId, customer);
    if (choice === "menuCenters") return showCenters(chatId, customer);
    if (choice === "menuMessage") return startMessage(chatId, customer);
    if (choice === "menuLanguage") return askLanguage(chatId);
    return showApp(chatId, customer);
  }

  // ---- inside a dialogue --------------------------------------------------------------------------------------------
  const { state, data } = await chatState(chatId);
  if (state === "msg" && typeof data.requestId === "string") {
    await setChatState(chatId, null);
    return sendMessageToService(chatId, customer, data.requestId, text);
  }
  if (state?.startsWith("nr:")) return newRequestStep(chatId, customer, [], "text", text);
  return plainText(chatId, customer, text);
}

async function handleStaffText(chatId: number, staff: NonNullable<Awaited<ReturnType<typeof staffByChat>>>, command: string, text: string) {
  const l = staff.locale;
  if (command === "/stop") {
    await unlinkChat(String(chatId));
    return send(chatId, t("unlinked", l), { reply_markup: { remove_keyboard: true } });
  }
  if (command === "/menu" || command === "/help") return greetStaff(chatId, staff);
  const choice = staffChoice(text);
  if (choice === "staffAlerts") return showStaffAlerts(chatId, staff);
  if (choice === "staffJobs") return showStaffJobs(chatId, staff);
  if (choice === "staffOverview") return showStaffOverview(chatId, staff);
  if (choice === "staffPause") return setStaffNotify(chatId, staff, false);
  if (choice === "staffResume") return setStaffNotify(chatId, staff, true);
  if (choice === "staffUnlink") {
    await unlinkChat(String(chatId));
    return send(chatId, t("unlinked", l), { reply_markup: { remove_keyboard: true } });
  }
  return greetStaff(chatId, staff);
}

export async function handleUpdate(update: Update) {
  if (update.callback_query) return handleCallback(update.callback_query);
  const message = update.message;
  if (!message) return;
  if (message.contact?.phone_number) return linkByContact(message);
  if (message.location) {
    const customer = await customerByChat(message.chat.id);
    if (customer) return newRequestStep(message.chat.id, customer, [], "text", "", message.location);
    return;
  }
  if (message.photo) {
    const customer = await customerByChat(message.chat.id);
    return customer ? send(message.chat.id, t("photosInApp", customer.locale)) : undefined;
  }
  if (message.text) return handleText(message);
}

// ---------------------------------------------------------------------------------------------------------------------
// Running the bot
// ---------------------------------------------------------------------------------------------------------------------

const COMMANDS: Record<string, Array<[string, string]>> = {
  uz: [["menu", "Menyu"], ["status", "So'rovlarim"], ["new", "Yangi so'rov"], ["message", "Servisga yozish"], ["lang", "Til"], ["stop", "Telegramni uzish"]],
  ru: [["menu", "Меню"], ["status", "Мои заявки"], ["new", "Новая заявка"], ["message", "Написать сервису"], ["lang", "Язык"], ["stop", "Отключить Telegram"]],
  en: [["menu", "Menu"], ["status", "My requests"], ["new", "New request"], ["message", "Write to the service"], ["lang", "Language"], ["stop", "Disconnect Telegram"]],
};

async function registerCommands() {
  for (const [code, list] of Object.entries(COMMANDS)) {
    await call("setMyCommands", { commands: list.map(([command, description]) => ({ command, description })), language_code: code }).catch(() => undefined);
  }
  await call("setMyCommands", { commands: COMMANDS.en.map(([command, description]) => ({ command, description })) }).catch(() => undefined);
}

export function webhookMode() {
  return Boolean(env.telegramWebhookUrl && env.telegramWebhookSecret);
}

/** Express handler for POST /api/telegram/webhook: Telegram sends the secret in a header. */
export async function telegramWebhook(req: Request, res: Response) {
  const given = Buffer.from(req.get("x-telegram-bot-api-secret-token") ?? "");
  const wanted = Buffer.from(env.telegramWebhookSecret);
  if (!webhookMode() || given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    res.status(403).json({ ok: false });
    return;
  }
  // Answer first: Telegram retries an update that is not acknowledged quickly.
  res.json({ ok: true });
  await handleUpdate(req.body as Update).catch((error) => console.error("[telegram]", error));
}

export function startTelegramBot() {
  if (!botIsLive()) return;
  void botUsername().then((name) => console.log(`[telegram] bot ${name ? `@${name} ` : ""}started (${webhookMode() ? "webhook" : "long polling"})`));
  void registerCommands();
  if (webhookMode()) {
    void call("setWebhook", { url: `${env.telegramWebhookUrl}/api/telegram/webhook`, secret_token: env.telegramWebhookSecret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false }).catch((error) =>
      console.error("[telegram] setWebhook failed:", error instanceof Error ? error.message : error),
    );
    return;
  }
  void call("deleteWebhook").catch(() => undefined);
  let offset = 0;
  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      try {
        const data = (await call("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] })) as { ok: boolean; result?: Update[] };
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
  void loop();
  return () => {
    stopped = true;
  };
}

