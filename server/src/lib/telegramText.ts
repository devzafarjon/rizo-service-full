import { isDoneStatus } from "./status.js";
import type { RequestStatus } from "@prisma/client";
import type { TelegramButtons } from "./notifyDispatch.js";

type Locale = "uz" | "ru" | "en";

const TEXT = {
  approve: { uz: "✅ Tasdiqlayman", ru: "✅ Согласен", en: "✅ Approve" },
  decline: { uz: "❌ Rad etaman", ru: "❌ Отклонить", en: "❌ Decline" },
  confirmVisit: { uz: "✅ Tashrifni tasdiqlayman", ru: "✅ Подтверждаю визит", en: "✅ Confirm the visit" },
  rate: { uz: "Xizmatni baholang:", ru: "Оцените сервис:", en: "Rate the service:" },
  estimateApproved: { uz: "Smeta tasdiqlandi. Ixtiyoriy qatorlar kiritilmadi: ularni saytda tanlash mumkin.", ru: "Смета согласована. Необязательные пункты не включены: их можно выбрать на сайте.", en: "The estimate is approved. Optional lines were left out; you can choose them on the website." },
  estimateDeclined: { uz: "Smeta rad etildi.", ru: "Смета отклонена.", en: "The estimate was declined." },
  visitConfirmed: { uz: "Tashrif tasdiqlandi. Rahmat!", ru: "Визит подтверждён. Спасибо!", en: "The visit is confirmed. Thank you!" },
  thanksRating: { uz: "Bahoyingiz uchun rahmat!", ru: "Спасибо за оценку!", en: "Thank you for your rating!" },
  nothingToDo: { uz: "Bu amal endi mavjud emas.", ru: "Это действие больше недоступно.", en: "This action is no longer available." },
  messageSent: { uz: "Xabaringiz servisga yuborildi.", ru: "Ваше сообщение отправлено в сервис.", en: "Your message was sent to the service." },
  pickRequest: { uz: "Qaysi so'rov haqida? Raqamini yozing, masalan: /message 0510260100", ru: "По какой заявке? Укажите номер: /message 0510260100", en: "Which request? Send its number, for example: /message 0510260100" },
  noOpen: { uz: "Ochiq so'rovingiz yo'q.", ru: "У вас нет открытых заявок.", en: "You have no open requests." },
} as const;

export function tt(key: keyof typeof TEXT, locale?: string | null) {
  const code: Locale = locale === "ru" || locale === "en" ? locale : "uz";
  return TEXT[key][code];
}

/** Buttons that go under a Telegram message so the customer can answer without opening the website. */
export function telegramButtonsFor(input: { code?: string; params?: Record<string, unknown>; requestId: string; locale?: string | null }): TelegramButtons | undefined {
  const { code, params, requestId, locale } = input;
  if (code === "estimateSent") {
    return [[{ text: tt("approve", locale), callback_data: `est:ok:${requestId}` }, { text: tt("decline", locale), callback_data: `est:no:${requestId}` }]];
  }
  if (code === "visitScheduled" || code === "visitReminder") {
    return [[{ text: tt("confirmVisit", locale), callback_data: `visit:ok:${requestId}` }]];
  }
  if (code === "status" && typeof params?.status === "string" && isDoneStatus(params.status as RequestStatus)) {
    return [[1, 2, 3, 4, 5].map((n) => ({ text: `${"⭐".repeat(n)}`, callback_data: `rate:${requestId}:${n}` }))];
  }
  return undefined;
}
