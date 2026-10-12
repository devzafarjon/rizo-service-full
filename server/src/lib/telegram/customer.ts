import type { Customer } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { env } from "../../config.js";
import { HttpError } from "../httpError.js";
import { createServiceRequest } from "../createRequest.js";
import { postCustomerMessage, submitFeedback } from "../customerActions.js";
import { formatRequestId } from "../displayId.js";
import { approveEstimate, declineEstimate } from "../estimates.js";
import { customerPartWait } from "../partsControl.js";
import { paymentSummary } from "../payments.js";
import { prisma } from "../prisma.js";
import { PUSH_TEXTS } from "../pushTexts.generated.js";
import { parseLocale } from "../locale.js";
import { OPEN_STATUSES } from "../status.js";
import { confirmVisit } from "../visits.js";
import { computeWarrantyStatus, toDateOnly } from "../warranty.js";
import { call, inline, send, type Rows } from "./api.js";
import { allLocales, statusText, t, typeText, type TextKey } from "./text.js";

const actorOf = (customer: Customer) => ({ id: customer.id, type: "customer" as const, name: customer.name });
const byOf = (customer: Customer) => ({ kind: "customer" as const, id: customer.id, name: customer.name });

// ---------------------------------------------------------------------------------------------------------------------
// Chat state (the step a dialogue is at)
// ---------------------------------------------------------------------------------------------------------------------

export type ChatData = Record<string, unknown>;

export async function chatState(chatId: number) {
  const row = await prisma.telegramChat.findUnique({ where: { chatId: String(chatId) } });
  return { state: row?.state ?? null, data: (row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {}) as ChatData, locale: row?.locale ?? null };
}

export async function setChatState(chatId: number, state: string | null, data?: ChatData) {
  const id = String(chatId);
  const payload = { state, data: state && data ? (data as Prisma.InputJsonValue) : Prisma.DbNull };
  await prisma.telegramChat.upsert({ where: { chatId: id }, update: payload, create: { chatId: id, ...payload } });
}

// ---------------------------------------------------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------------------------------------------------

const MENU_KEYS = ["menuRequests", "menuNew", "menuWarranty", "menuCenters", "menuMessage", "menuLanguage", "menuApp"] as const satisfies readonly TextKey[];
export type MenuKey = (typeof MENU_KEYS)[number];

export function menuKeyboard(locale: string) {
  const labels = MENU_KEYS.map((key) => t(key, locale));
  const rows: string[][] = [];
  for (let i = 0; i < labels.length; i += 2) rows.push(labels.slice(i, i + 2));
  return { reply_markup: { keyboard: rows.map((row) => row.map((text) => ({ text }))), resize_keyboard: true } };
}

/** Which menu button a text is (in any language), if any. */
export function menuChoice(text: string): MenuKey | null {
  return MENU_KEYS.find((key) => allLocales(key).includes(text)) ?? null;
}

export async function showMenu(chatId: number, locale: string, text?: string) {
  await send(chatId, text ?? t("menuPrompt", locale), menuKeyboard(locale));
}

// ---------------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------------

function ddmmyyyy(date: Date | string) {
  const value = typeof date === "string" ? date : date.toISOString().slice(0, 10);
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function tashkentStamp(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace(",", "");
}

const money = (value: number) => `${Math.round(value).toLocaleString("en-US").replace(/,/g, " ")} so'm`;

function productName(product: { name: string; nameUz?: string | null; nameRu?: string | null; nameEn?: string | null }, locale: string) {
  const l = parseLocale(locale);
  return (l === "uz" ? product.nameUz : l === "ru" ? product.nameRu : product.nameEn) || product.name;
}

function regionName(code: string, locale: string) {
  const group = PUSH_TEXTS[parseLocale(locale)].regions as Record<string, string>;
  return group[code] ?? code;
}

export async function customerByChat(chatId: number) {
  return prisma.customer.findFirst({ where: { telegramChatId: String(chatId), anonymizedAt: null } });
}

// ---------------------------------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------------------------------

export async function listRequests(chatId: number, customer: Customer, onlyOpen = false) {
  const locale = customer.locale;
  const [open, recent] = await Promise.all([
    prisma.serviceRequest.findMany({ where: { customerId: customer.id, status: { in: OPEN_STATUSES } }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    onlyOpen ? Promise.resolve([]) : prisma.serviceRequest.findMany({ where: { customerId: customer.id, status: { notIn: OPEN_STATUSES } }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);
  const rows = [...open, ...recent];
  if (rows.length === 0) {
    await send(chatId, t(onlyOpen ? "noOpen" : "noRequests", locale));
    return;
  }
  const buttons: Rows = rows.map((request) => [{ text: `${formatRequestId(request.displayId)} · ${productName(request.product, locale)} · ${statusText(request.status, locale)}`.slice(0, 60), callback_data: `req:${request.id}` }]);
  await send(chatId, t("requestsTitle", locale), inline(buttons));
}

/** One request as a card with the buttons that make sense in its state. */
export async function showRequest(chatId: number, customer: Customer, requestId: string) {
  const locale = customer.locale;
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, customerId: customer.id },
    include: { product: true, assignedTechnician: { select: { name: true } }, estimates: { orderBy: { createdAt: "desc" }, take: 1, include: { lines: true } } },
  });
  if (!request) {
    await send(chatId, t("noSuchRequest", locale));
    return;
  }
  const lines = [`${formatRequestId(request.displayId)} · ${typeText(request.type, locale)} · ${productName(request.product, locale)}`, `${t("cardStatus", locale)}: ${statusText(request.status, locale)}`];
  if (request.assignedTechnician) lines.push(`${t("cardTechnician", locale)}: ${request.assignedTechnician.name}`);
  lines.push(`${t("cardCreated", locale)}: ${ddmmyyyy(request.createdAt)}`);
  if (request.scheduledAt && OPEN_STATUSES.includes(request.status)) lines.push(`${t("cardVisit", locale)}: ${tashkentStamp(request.scheduledAt)}${request.visitConfirmedAt ? " ✅" : ""}`);
  const estimate = request.estimates[0];
  if (estimate && estimate.status === "sent") {
    const total = estimate.lines.filter((line) => !line.isOptional || line.isSelected).reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0);
    lines.push(`${t("cardEstimate", locale)}: ${money(total)}`);
  }
  if (request.status === "awaiting_parts") {
    const wait = await customerPartWait(request.id);
    const date = wait.expectedAt ? t("expectedBy", locale, { date: ddmmyyyy(wait.expectedAt) }) : "";
    lines.push(wait.ordered ? `${t("partOrdered", locale, { date })}${wait.late ? ` · ${t("partLate", locale)}` : ""}` : t("partWaiting", locale));
  }
  const pay = await paymentSummary(request.id);
  if (pay.balance > 0 && request.finalCost != null) lines.push(`${t("cardBalance", locale)}: ${money(pay.balance)}`);

  const rows: Rows = [];
  if (estimate && estimate.status === "sent") rows.push([{ text: t("approve", locale), callback_data: `est:ok:${request.id}` }, { text: t("decline", locale), callback_data: `est:no:${request.id}` }]);
  if (request.scheduledAt && !request.visitConfirmedAt && OPEN_STATUSES.includes(request.status)) rows.push([{ text: t("confirmVisit", locale), callback_data: `visit:ok:${request.id}` }]);
  if (!["cancelled", "rejected", "refunded"].includes(request.status)) rows.push([{ text: t("writeToService", locale), callback_data: `msg:${request.id}` }]);
  if (env.clientOrigin.startsWith("https://")) rows.push([{ text: t("track", locale), url: `${env.clientOrigin}/t/${request.trackingToken}` }]);
  await send(chatId, lines.join("\n"), rows.length ? inline(rows) : {});
}

/** A button under a notification or a card. */
export async function customerButton(chatId: number, customer: Customer, data: string) {
  const locale = customer.locale;
  const parts = data.split(":");
  const kind = parts[0];
  if (kind === "req") return showRequest(chatId, customer, parts[1]);
  if (kind === "msg") return startMessage(chatId, customer, parts[1]);
  if (kind === "nr") return newRequestStep(chatId, customer, parts.slice(1), "button");
  if (kind === "cen") return showCenters(chatId, customer, parts[1]);
  // est:ok|no:<request>   visit:ok:<request>   rate:<request>:<1-5>
  const action = kind === "rate" ? "rate" : parts[1];
  const requestId = kind === "rate" ? parts[1] : parts[2];
  const extra = kind === "rate" ? parts[2] : undefined;
  const request = await prisma.serviceRequest.findFirst({ where: { id: requestId, customerId: customer.id }, include: { estimates: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!request) return send(chatId, t("nothingToDo", locale));
  try {
    if (kind === "est") {
      const estimate = request.estimates[0];
      if (!estimate || estimate.status !== "sent") throw new Error("gone");
      if (action === "ok") {
        const result = await approveEstimate({ estimateId: estimate.id, by: byOf(customer), selectedOptionalLineIds: [] });
        const { advanceAfterApproval } = await import("../../routes/requests.js");
        await advanceAfterApproval(request.id, result.waitingForParts, actorOf(customer));
        await send(chatId, t("estimateApproved", locale));
      } else {
        await declineEstimate({ estimateId: estimate.id, reason: "", by: byOf(customer) });
        await send(chatId, t("estimateDeclined", locale));
      }
    } else if (kind === "visit") {
      await confirmVisit(request.id, actorOf(customer));
      await send(chatId, t("visitConfirmed", locale));
    } else if (kind === "rate") {
      await submitFeedback({ customerId: customer.id, requestId: request.id, rating: Math.min(5, Math.max(1, Number(extra) || 5)) });
      await send(chatId, t("thanksRating", locale));
    }
  } catch {
    // Pressed twice, or the situation changed since the message was sent.
    await send(chatId, t("nothingToDo", locale));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Writing to the service
// ---------------------------------------------------------------------------------------------------------------------

/** The menu button / command: pick the request when there are several, then take the next text as the message. */
export async function startMessage(chatId: number, customer: Customer, requestId?: string) {
  const locale = customer.locale;
  let id = requestId ?? null;
  if (!id) {
    const open = await prisma.serviceRequest.findMany({ where: { customerId: customer.id, status: { in: OPEN_STATUSES } }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 8 });
    if (open.length === 0) return send(chatId, t("noOpen", locale));
    if (open.length > 1) {
      return send(chatId, t("pickRequest", locale), inline(open.map((request) => [{ text: `${formatRequestId(request.displayId)} · ${productName(request.product, locale)}`.slice(0, 60), callback_data: `msg:${request.id}` }])));
    }
    id = open[0].id;
  }
  const request = await prisma.serviceRequest.findFirst({ where: { id, customerId: customer.id } });
  if (!request) return send(chatId, t("noSuchRequest", locale));
  await setChatState(chatId, "msg", { requestId: request.id });
  await send(chatId, t("writeNow", locale, { id: formatRequestId(request.displayId) }));
}

export async function sendMessageToService(chatId: number, customer: Customer, requestId: string, text: string) {
  try {
    await postCustomerMessage({ customerId: customer.id, requestId, text: text.slice(0, 1000) });
    await send(chatId, t("messageSent", customer.locale), menuKeyboard(customer.locale));
  } catch (error) {
    await send(chatId, error instanceof HttpError ? error.message : t("nothingToDo", customer.locale));
  }
}

/** Plain text outside any dialogue: it goes to the service when exactly one request is open. */
export async function plainText(chatId: number, customer: Customer, text: string) {
  const open = await prisma.serviceRequest.findMany({ where: { customerId: customer.id, status: { in: OPEN_STATUSES } }, select: { id: true }, take: 2 });
  if (open.length === 1) return sendMessageToService(chatId, customer, open[0].id, text);
  if (open.length === 0) return send(chatId, t("noOpen", customer.locale), menuKeyboard(customer.locale));
  return startMessage(chatId, customer);
}

// ---------------------------------------------------------------------------------------------------------------------
// New request: type -> purchase -> problem -> where -> address / centre -> confirm
// ---------------------------------------------------------------------------------------------------------------------

type Draft = { type?: "repair" | "installation"; saleId?: string; issue?: string; locationType?: "in_shop" | "on_site"; address?: string; lat?: number | null; lng?: number | null; centerId?: string };

export async function startNewRequest(chatId: number, customer: Customer) {
  await setChatState(chatId, "nr:type", {});
  await send(chatId, t("nrType", customer.locale), inline([[{ text: t("nrRepair", customer.locale), callback_data: "nr:type:repair" }, { text: t("nrInstall", customer.locale), callback_data: "nr:type:installation" }], [{ text: t("cancel", customer.locale), callback_data: "nr:cancel" }]]));
}

async function draftOf(chatId: number) {
  const { state, data } = await chatState(chatId);
  return { state, draft: data as Draft };
}

async function askLocation(chatId: number, customer: Customer) {
  const locale = customer.locale;
  await send(chatId, t("nrWhere", locale), inline([[{ text: t("nrInShop", locale), callback_data: "nr:loc:in_shop" }, { text: t("nrOnSite", locale), callback_data: "nr:loc:on_site" }], [{ text: t("cancel", locale), callback_data: "nr:cancel" }]]));
}

async function askAddress(chatId: number, customer: Customer) {
  const locale = customer.locale;
  const rows: Rows = [];
  if (customer.address) rows.push([{ text: t("nrUseMyAddress", locale, { address: customer.address }).slice(0, 60), callback_data: "nr:addr:profile" }]);
  rows.push([{ text: t("cancel", locale), callback_data: "nr:cancel" }]);
  await send(chatId, t("nrAddress", locale), { reply_markup: { keyboard: [[{ text: t("nrSendLocation", locale), request_location: true }]], resize_keyboard: true, one_time_keyboard: true } });
  await send(chatId, "↓", inline(rows));
}

async function askCenter(chatId: number, customer: Customer) {
  const locale = customer.locale;
  const centers = await prisma.serviceCenter.findMany({ where: { isActive: true }, orderBy: [{ regionCode: "asc" }, { name: "asc" }] });
  // The customer's own region first.
  const sorted = [...centers.filter((c) => c.regionCode === customer.regionCode), ...centers.filter((c) => c.regionCode !== customer.regionCode)].slice(0, 12);
  if (sorted.length === 0) {
    await send(chatId, t("centersNone", locale));
    return;
  }
  await send(chatId, t("nrCenter", locale), inline([...sorted.map((c) => [{ text: `${c.name} · ${regionName(c.regionCode, locale)}`.slice(0, 60), callback_data: `nr:center:${c.id}` }]), [{ text: t("cancel", locale), callback_data: "nr:cancel" }]]));
}

async function askConfirm(chatId: number, customer: Customer) {
  const locale = customer.locale;
  const { draft } = await draftOf(chatId);
  const sale = draft.saleId ? await prisma.sale.findUnique({ where: { id: draft.saleId }, include: { product: true } }) : null;
  let where = "";
  if (draft.locationType === "in_shop" && draft.centerId) {
    const center = await prisma.serviceCenter.findUnique({ where: { id: draft.centerId } });
    where = t("nrWhereShop", locale, { name: center?.name ?? "" });
  } else {
    where = t("nrWhereSite", locale, { address: draft.address ?? "" });
  }
  await setChatState(chatId, "nr:confirm", draft);
  await send(
    chatId,
    t("nrSummary", locale, { type: typeText(draft.type ?? "repair", locale), product: sale ? productName(sale.product, locale) : "", issue: draft.issue ?? "", where }),
    inline([[{ text: t("nrConfirm", locale), callback_data: "nr:ok" }, { text: t("cancel", locale), callback_data: "nr:cancel" }]]),
  );
}

/** A button (`nr:…`) or a text / location typed during the dialogue. */
export async function newRequestStep(chatId: number, customer: Customer, parts: string[], source: "button" | "text", text = "", location?: { latitude: number; longitude: number }) {
  const locale = customer.locale;
  const { state, draft } = await draftOf(chatId);
  const action = parts[0];
  if (source === "button" && action === "cancel") {
    await setChatState(chatId, null);
    return showMenu(chatId, locale, t("cancelled", locale));
  }
  if (!state || !state.startsWith("nr")) return send(chatId, t("nrExpired", locale));

  if (source === "button") {
    if (action === "type" && (parts[1] === "repair" || parts[1] === "installation")) {
      const sales = await prisma.sale.findMany({ where: { customerId: customer.id, voidedAt: null }, include: { product: true }, orderBy: { saleDate: "desc" }, take: 10 });
      if (sales.length === 0) {
        await setChatState(chatId, null);
        return showMenu(chatId, locale, t("nrNoPurchases", locale));
      }
      await setChatState(chatId, "nr:sale", { type: parts[1] });
      return send(chatId, t("nrProduct", locale), inline([...sales.map((sale) => [{ text: `${productName(sale.product, locale)}${sale.serialNumber ? ` · ${sale.serialNumber}` : ""}`.slice(0, 60), callback_data: `nr:sale:${sale.id}` }]), [{ text: t("cancel", locale), callback_data: "nr:cancel" }]]));
    }
    if (action === "sale" && state === "nr:sale") {
      const sale = await prisma.sale.findFirst({ where: { id: parts[1], customerId: customer.id } });
      if (!sale) return send(chatId, t("nrExpired", locale));
      await setChatState(chatId, "nr:issue", { ...draft, saleId: sale.id });
      return send(chatId, t(draft.type === "installation" ? "nrInstallNote" : "nrIssue", locale));
    }
    if (action === "loc" && state === "nr:where") {
      if (parts[1] === "on_site") {
        await setChatState(chatId, "nr:addr", { ...draft, locationType: "on_site" });
        return askAddress(chatId, customer);
      }
      await setChatState(chatId, "nr:center", { ...draft, locationType: "in_shop" });
      return askCenter(chatId, customer);
    }
    if (action === "addr" && parts[1] === "profile" && state === "nr:addr" && customer.address) {
      await setChatState(chatId, "nr:addr", { ...draft, address: customer.address, lat: null, lng: null });
      await send(chatId, "✔", { reply_markup: { remove_keyboard: true } });
      return askConfirm(chatId, customer);
    }
    if (action === "center" && state === "nr:center") {
      const center = await prisma.serviceCenter.findFirst({ where: { id: parts[1], isActive: true } });
      if (!center) return send(chatId, t("nrExpired", locale));
      await setChatState(chatId, "nr:center", { ...draft, centerId: center.id });
      return askConfirm(chatId, customer);
    }
    if (action === "ok" && state === "nr:confirm") return createFromDraft(chatId, customer, draft);
    return send(chatId, t("nrExpired", locale));
  }

  // typed text or a shared location
  if (state === "nr:issue" && text) {
    const next: Draft = { ...draft, issue: text.slice(0, 500) };
    if (draft.type === "installation") {
      await setChatState(chatId, "nr:addr", { ...next, locationType: "on_site" });
      return askAddress(chatId, customer);
    }
    await setChatState(chatId, "nr:where", next);
    return askLocation(chatId, customer);
  }
  if (state === "nr:addr" && (text || location)) {
    const address = location ? t("nrLocationLabel", locale) : text.slice(0, 200);
    await setChatState(chatId, "nr:addr", { ...draft, address, lat: location?.latitude ?? null, lng: location?.longitude ?? null });
    await send(chatId, "✔", { reply_markup: { remove_keyboard: true } });
    return askConfirm(chatId, customer);
  }
  return send(chatId, t("nrExpired", locale));
}

async function createFromDraft(chatId: number, customer: Customer, draft: Draft) {
  const locale = customer.locale;
  if (!draft.type || !draft.saleId || !draft.issue || !draft.locationType) return send(chatId, t("nrExpired", locale));
  try {
    const result = await createServiceRequest({
      type: draft.type,
      customerId: customer.id,
      saleId: draft.saleId,
      issueDescription: draft.issue,
      locationType: draft.locationType,
      customerLocation: draft.locationType === "on_site" ? { address: draft.address ?? "", lat: draft.lat ?? null, lng: draft.lng ?? null } : null,
      serviceCenterId: draft.locationType === "in_shop" ? (draft.centerId ?? null) : null,
      submittedByCustomer: true,
      source: "rizo_service",
    });
    await setChatState(chatId, null);
    await showMenu(chatId, locale, t("nrCreated", locale, { id: formatRequestId(result.request.displayId) }));
  } catch (error) {
    await setChatState(chatId, null);
    if (error instanceof HttpError && error.code === "duplicateRequest") {
      const id = (error.details as { displayId?: string } | undefined)?.displayId ?? "";
      return showMenu(chatId, locale, t("nrDuplicate", locale, { id: id ? formatRequestId(id) : "" }));
    }
    await showMenu(chatId, locale, t("nrFailed", locale, { reason: error instanceof HttpError ? error.message : "error" }));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Warranty, centres, language, app
// ---------------------------------------------------------------------------------------------------------------------

export async function showWarranty(chatId: number, customer: Customer) {
  const locale = customer.locale;
  const sales = await prisma.sale.findMany({ where: { customerId: customer.id, voidedAt: null }, include: { product: true }, orderBy: { saleDate: "desc" }, take: 10 });
  if (sales.length === 0) return send(chatId, t("noPurchases", locale));
  const lines = sales.map((sale) => {
    const status = computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry);
    const date = ddmmyyyy(toDateOnly(sale.warrantyExpiry));
    const text = status === "in_warranty" ? t("warrantyActive", locale, { date }) : status === "expired" ? t("warrantyExpired", locale, { date }) : t("warrantyNone", locale);
    return `• ${productName(sale.product, locale)}${sale.serialNumber ? ` (${sale.serialNumber})` : ""} — ${text}`;
  });
  await send(chatId, `${t("warrantyTitle", locale)}\n${lines.join("\n")}`);
}

/** No region: the regions that have a centre. With a region: its centres (and the first ones' locations on the map). */
export async function showCenters(chatId: number, customer: Customer, region?: string) {
  const locale = customer.locale;
  const centers = await prisma.serviceCenter.findMany({ where: { isActive: true, ...(region ? { regionCode: region } : {}) }, orderBy: { name: "asc" } });
  if (centers.length === 0) return send(chatId, t("centersNone", locale));
  if (!region) {
    const codes = [...new Set(centers.map((c) => c.regionCode))].sort((a, b) => (a === customer.regionCode ? -1 : b === customer.regionCode ? 1 : a.localeCompare(b)));
    return send(chatId, t("centersPick", locale), inline(codes.map((code) => [{ text: regionName(code, locale), callback_data: `cen:${code}` }])));
  }
  const text = centers.map((c) => [`📍 ${c.name}`, c.address, c.phone ? `📞 ${c.phone}` : "", c.workingHours ? `🕘 ${c.workingHours}` : ""].filter(Boolean).join("\n")).join("\n\n");
  await send(chatId, text);
  for (const center of centers.slice(0, 3)) {
    if (center.lat != null && center.lng != null) await call("sendLocation", { chat_id: chatId, latitude: center.lat, longitude: center.lng });
  }
}

export async function askLanguage(chatId: number) {
  await send(chatId, allLocales("chooseLanguage")[0], inline([[{ text: "O'zbekcha", callback_data: "lang:uz" }, { text: "Русский", callback_data: "lang:ru" }, { text: "English", callback_data: "lang:en" }]]));
}

export async function showApp(chatId: number, customer: Customer) {
  const locale = customer.locale;
  const rows: Rows = [];
  if (env.clientOrigin.startsWith("https://")) rows.push([{ text: t("openSite", locale), url: `${env.clientOrigin}/portal` }]);
  if (env.appDownloadUrl.startsWith("https://")) rows.push([{ text: t("getApp", locale), url: env.appDownloadUrl }]);
  await send(chatId, t("appText", locale), rows.length ? inline(rows) : {});
}
