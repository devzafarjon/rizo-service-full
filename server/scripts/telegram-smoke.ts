/**
 * Checks of the Telegram bot: language choice, linking (only the sender's own contact, one-time keys for customers and staff), the
 * customer menu, a new request through the dialogue (on site, at a centre, duplicate), messages to the service, staff alerts with mute,
 * localized customer notifications, unlinking, and the HTTP side (link routes, webhook secret).
 * The Telegram network is stubbed in this process. Needs the API running (SMOKE_API) on a scratch database; for the link routes start the API with
 *   TELEGRAM_BOT_TOKEN=smoke TELEGRAM_PROVIDER=live TELEGRAM_BOT_USERNAME=rizo_smoke_bot TELEGRAM_WEBHOOK_URL=https://example.invalid TELEGRAM_WEBHOOK_SECRET=smoke-secret
 *   npm run smoke:telegram -w server
 */
import { prisma } from "../src/lib/prisma.js";
import { createCustomerNotification } from "../src/lib/notifyCustomer.js";
import { notifyStaffUser } from "../src/lib/notifyStaff.js";
import { handleUpdate, setTelegramCaller, type Update } from "../src/lib/telegram/index.js";
import { createLinkToken } from "../src/lib/telegram/links.js";
import { resetTelegramCache } from "../src/lib/telegram/api.js";

const API = process.env.SMOKE_API ?? "http://localhost:4100";
let failed = 0;
function assert(condition: unknown, message: string) {
  if (condition) return console.log(`  ok  ${message}`);
  failed += 1;
  console.error(`  FAIL ${message}`);
}

type Sent = { method: string; body: any };
let sent: Sent[] = [];
setTelegramCaller(async (method, body) => {
  sent.push({ method, body });
  if (method === "getMe") return { ok: true, result: { username: "rizo_smoke_bot" } };
  return { ok: true, result: {} };
});
const texts = () => sent.filter((row) => row.method === "sendMessage").map((row) => String(row.body.text));
const lastText = () => texts().at(-1) ?? "";
const lastButtons = (): string[] => {
  const row = [...sent].reverse().find((item) => item.method === "sendMessage" && item.body.reply_markup?.inline_keyboard);
  return row ? row.body.reply_markup.inline_keyboard.flat().map((button: any) => button.callback_data ?? button.url ?? button.text) : [];
};
const keyboardLabels = (): string[] => {
  const row = [...sent].reverse().find((item) => item.method === "sendMessage" && item.body.reply_markup?.keyboard);
  return row ? row.body.reply_markup.keyboard.flat().map((button: any) => button.text) : [];
};

let updateId = 1000;
const say = async (chat: number, text: string, from = chat) => {
  sent = [];
  await handleUpdate({ update_id: updateId++, message: { chat: { id: chat }, from: { id: from }, text } } as Update);
};
const press = async (chat: number, data: string) => {
  sent = [];
  await handleUpdate({ update_id: updateId++, callback_query: { id: `cb${updateId}`, data, message: { chat: { id: chat } } } } as Update);
};
const share = async (chat: number, phone: string, userId: number, from = chat) => {
  sent = [];
  await handleUpdate({ update_id: updateId++, message: { chat: { id: chat }, from: { id: from }, contact: { phone_number: phone, user_id: userId } } } as Update);
};
const buttonFor = (prefix: string) => lastButtons().find((data) => data.startsWith(prefix));

async function main() {
  const suffix = String(Date.now()).slice(-6);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { phone: "998900000003" } });
  await prisma.customer.update({ where: { id: customer.id }, data: { telegramChatId: null, locale: "uz" } });
  const tech = await prisma.staffUser.findUniqueOrThrow({ where: { phone: "998900000002" } });
  await prisma.staffUser.update({ where: { id: tech.id }, data: { telegramChatId: null, telegramNotify: true, locale: "uz" } });
  const CHAT = 7001;
  await prisma.telegramChat.deleteMany({ where: { chatId: { in: ["7001", "7002", "7003", "8001"] } } });

  console.log("first contact and language");
  await say(CHAT, "/start");
  assert(lastButtons().includes("lang:uz") && lastButtons().includes("lang:ru") && lastButtons().includes("lang:en"), "a new chat is asked for its language");
  await press(CHAT, "lang:ru");
  assert(/номер/i.test(lastText()) && keyboardLabels().some((label) => /номер/i.test(label)), "the welcome follows the language and offers the contact button");

  console.log("linking is safe");
  await say(CHAT, "+998 90 000 00 03");
  assert((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).telegramChatId === null, "a typed phone number does not link");
  await share(CHAT, "998900000003", 99999, CHAT);
  assert((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).telegramChatId === null, "someone else's contact does not link");
  await share(CHAT, "998900000003", CHAT, CHAT);
  assert((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).telegramChatId === String(CHAT), "the sender's own contact links the account");
  assert(keyboardLabels().length === 8 || keyboardLabels().length === 7, "the menu appears after linking");
  await share(8001, "998900000099", 8001);
  assert(/not found|не найден|topilmadi/i.test(lastText()), "an unknown number gets no account");

  console.log("menu");
  await say(CHAT, "/start");
  assert(keyboardLabels().length >= 7, "/start of a linked chat shows the menu");
  await press(CHAT, "lang:uz");
  const labels = keyboardLabels();
  assert(labels.some((l) => l.includes("So'rovlarim")), "the language can be switched; the menu follows");
  assert((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).locale === "uz", "it changes the account language");
  await say(CHAT, labels.find((l) => l.includes("Kafolat"))!);
  assert(/kafolat/i.test(lastText()) && lastText().includes("•"), "warranty lists the purchases");
  await say(CHAT, labels.find((l) => l.includes("Servis markazlari"))!);
  const region = buttonFor("cen:");
  assert(Boolean(region), "service centres: regions to pick");
  if (region) {
    await press(CHAT, region);
    assert(/📍/.test(lastText()), "a region lists its centres");
  }
  await say(CHAT, labels.find((l) => l.includes("Ilova va sayt"))!);
  assert(/ilova/i.test(lastText()), "app and site answer");

  console.log("a new request through the dialogue");
  const products = await prisma.product.findMany({ take: 3, orderBy: { sku: "asc" } });
  const sales = [];
  for (const [index, product] of products.slice(0, 2).entries()) {
    sales.push(
      await prisma.sale.create({
        data: { customerId: customer.id, productId: product.id, quantity: 1, saleDate: new Date(), pricePaid: 1000000, warrantyMonths: 12, warrantyExpiry: new Date(Date.now() + 300 * 86_400_000), serialNumber: `TG${suffix}${index}`, invoiceNumber: `TG-${suffix}-${index}` },
      }),
    );
  }
  await say(CHAT, labels.find((l) => l.includes("Yangi so'rov"))!);
  assert(lastButtons().includes("nr:type:repair"), "asks what kind of request");
  await press(CHAT, "nr:type:repair");
  assert(Boolean(buttonFor(`nr:sale:${sales[0].id}`)), "lists the purchases");
  await press(CHAT, `nr:sale:${sales[0].id}`);
  await say(CHAT, "Compressor does not start");
  assert(lastButtons().includes("nr:loc:on_site") && lastButtons().includes("nr:loc:in_shop"), "asks where");
  await press(CHAT, "nr:loc:on_site");
  await say(CHAT, "12 Test Street, Tashkent");
  assert(lastButtons().includes("nr:ok") && /Compressor/.test(lastText()), "shows the summary with the confirm button");
  await press(CHAT, "nr:ok");
  const created = await prisma.serviceRequest.findFirst({ where: { customerId: customer.id, saleId: sales[0].id }, orderBy: { createdAt: "desc" } });
  assert(Boolean(created) && created!.source === "rizo_service" && created!.submittedByCustomer && created!.locationType === "on_site" && created!.issueDescription === "Compressor does not start", "the request is created like a portal request");
  assert(/qabul qilindi/i.test(lastText()), "the customer is told the number");

  await press(CHAT, "nr:type:repair");
  await say(CHAT, labels.find((l) => l.includes("Yangi so'rov"))!);
  await press(CHAT, "nr:type:repair");
  await press(CHAT, `nr:sale:${sales[0].id}`);
  await say(CHAT, "Again");
  await press(CHAT, "nr:loc:on_site");
  await say(CHAT, "Another street");
  await press(CHAT, "nr:ok");
  assert(/allaqachon/i.test(lastText()), "a second open request for the same product is refused");

  await say(CHAT, labels.find((l) => l.includes("Yangi so'rov"))!);
  await press(CHAT, "nr:type:repair");
  await press(CHAT, `nr:sale:${sales[1].id}`);
  await say(CHAT, "Does not cool");
  await press(CHAT, "nr:loc:in_shop");
  const center = buttonFor("nr:center:");
  assert(Boolean(center), "in a shop: lists the centres");
  await press(CHAT, center!);
  await press(CHAT, "nr:ok");
  const inShop = await prisma.serviceRequest.findFirst({ where: { customerId: customer.id, saleId: sales[1].id }, orderBy: { createdAt: "desc" } });
  assert(Boolean(inShop) && inShop!.locationType === "in_shop" && Boolean(inShop!.serviceCenterId), "the in-shop request carries the chosen centre");

  await say(CHAT, labels.find((l) => l.includes("Yangi so'rov"))!);
  await press(CHAT, "nr:cancel");
  assert(/bekor/i.test(lastText()), "the dialogue can be cancelled");
  await press(CHAT, "nr:ok");
  assert(/eskirgan/i.test(lastText()), "a stale button is answered, not crashed on");

  console.log("requests and messages");
  await say(CHAT, labels.find((l) => l.includes("So'rovlarim"))!);
  assert(Boolean(buttonFor(`req:${created!.id}`)), "the list shows the request");
  await press(CHAT, `req:${created!.id}`);
  assert(lastText().includes(created!.displayId) && lastButtons().includes(`msg:${created!.id}`), "the card shows the number and a message button");
  await press(CHAT, `msg:${created!.id}`);
  await say(CHAT, "When will you come?");
  const note = await prisma.requestNote.findFirst({ where: { serviceRequestId: created!.id, authorScope: "customer" }, orderBy: { createdAt: "desc" } });
  assert(note?.noteText === "When will you come?", "the message reaches the request");
  await say(CHAT, `/message #${created!.displayId} second message`);
  assert((await prisma.requestNote.count({ where: { serviceRequestId: created!.id, authorScope: "customer" } })) === 2, "/message with a number works");
  await say(CHAT, "/status 999999999999");
  assert(/yo'q|topilmadi|bunday/i.test(lastText()), "an unknown number is answered");
  sent = [];
  await handleUpdate({ update_id: updateId++, message: { chat: { id: CHAT }, from: { id: CHAT }, photo: [{}] } } as Update);
  assert(/rasm/i.test(lastText()), "a photo is pointed to the app");

  console.log("customer notifications in the customer's language");
  await prisma.customer.update({ where: { id: customer.id }, data: { locale: "ru", preferredChannel: "both" } });
  sent = [];
  await createCustomerNotification(customer.id, created!.id, `Your repair for Fridge is now Completed.`, "status", { type: "repair", status: "completed", productName: "Fridge", nameRu: "Холодильник" });
  assert(sent.some((row) => row.method === "sendMessage" && /[А-Яа-я]/.test(String(row.body.text))), "Telegram text is in Russian for a Russian customer");
  await prisma.customer.update({ where: { id: customer.id }, data: { locale: "uz" } });

  console.log("one-time keys, staff and mute");
  const staffKey = await createLinkToken("staff", tech.id);
  assert(Boolean(staffKey.url?.startsWith("https://t.me/rizo_smoke_bot?start=s_")), "a staff link names the bot");
  const STAFF = 7002;
  await say(STAFF, `/start s_${staffKey.token}`);
  assert((await prisma.staffUser.findUniqueOrThrow({ where: { id: tech.id } })).telegramChatId === String(STAFF), "the key links the staff chat");
  assert(/texnik|technician|техник/i.test(lastText()), "the staff are greeted with their role");
  await say(STAFF, `/start s_${staffKey.token}`);
  assert(/eskirgan/i.test(lastText()), "a key works once");
  sent = [];
  await notifyStaffUser(tech.id, { message: "A part has arrived", code: "jobPartReady", params: { displayId: created!.displayId }, serviceRequestId: created!.id });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert(sent.some((row) => row.method === "sendMessage" && String(row.body.chat_id) === String(STAFF)), "an alert reaches the staff chat");
  const staffLabels = keyboardLabels();
  await say(STAFF, "🔕 Xabarlarni o'chirish");
  assert((await prisma.staffUser.findUniqueOrThrow({ where: { id: tech.id } })).telegramNotify === false, "muting is saved");
  sent = [];
  await notifyStaffUser(tech.id, { message: "Another alert", code: "jobPartReady", params: { displayId: created!.displayId } });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert(!sent.some((row) => String(row.body.chat_id) === String(STAFF)), "a muted chat gets nothing");
  await say(STAFF, "🔔 Xabarlar");
  assert(texts().length >= 1, "the alerts button answers");
  await say(STAFF, "/stop");
  assert((await prisma.staffUser.findUniqueOrThrow({ where: { id: tech.id } })).telegramChatId === null, "/stop disconnects the staff chat");
  void staffLabels;

  const customerKey = await createLinkToken("customer", customer.id);
  const CHAT2 = 7003;
  await say(CHAT2, `/start c_${customerKey.token}`);
  const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  assert(after.telegramChatId === String(CHAT2), "a customer key links the new chat (the old one is replaced)");
  await say(CHAT2, "/stop");
  assert((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).telegramChatId === null, "/stop disconnects the customer");

  console.log("http: link routes and webhook");
  setTelegramCaller(null);
  resetTelegramCache();
  const login = async (scope: string, phone: string, password: string) => ((await (await fetch(`${API}/api/${scope}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password }) })).json()) as any).token as string;
  const staffToken = await login("staff", "998900000002", "tech123");
  const customerToken = await login("customer", "998900000003", "customer123");
  const call = async (path: string, token: string, method = "GET", body?: unknown) => {
    const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };
  const st = await call("/api/staff/telegram", staffToken);
  assert(st.status === 200 && typeof st.body.configured === "boolean" && st.body.linked === false, "staff can read the Telegram status");
  if (st.body.configured) {
    const link = await call("/api/staff/telegram/link", staffToken, "POST");
    assert(link.status === 200 && /^https:\/\/t\.me\/.+\?start=s_/.test(link.body.url), "staff can get a connect link");
    const clink = await call("/api/customer/telegram/link", customerToken, "POST");
    assert(clink.status === 200 && /\?start=c_/.test(clink.body.url), "customers can get a connect link");
    const mute = await call("/api/staff/telegram", staffToken, "PATCH", { notify: false });
    assert(mute.status === 200 && mute.body.notify === false, "staff can mute alerts");
    await call("/api/staff/telegram", staffToken, "PATCH", { notify: true });
  } else {
    const link = await call("/api/staff/telegram/link", staffToken, "POST");
    assert(link.status === 503 && link.body.code === "telegramNotConfigured", "without a bot, the link route says so");
  }
  const noToken = await fetch(`${API}/api/staff/telegram`);
  assert(noToken.status === 401, "the status needs a sign-in");
  const bad = await fetch(`${API}/api/telegram/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": "wrong" }, body: JSON.stringify({ update_id: 1 }) });
  assert(bad.status === 403, "the webhook refuses a wrong secret");
  if (st.body.configured && st.body.mode === "webhook") {
    const good = await fetch(`${API}/api/telegram/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET ?? "smoke-secret" }, body: JSON.stringify({ update_id: 1 }) });
    assert(good.status === 200, "the webhook accepts the right secret");
  }

  console.log(failed ? `\n${failed} check(s) failed` : "\ntelegram smoke: all passed");
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
