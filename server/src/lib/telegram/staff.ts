import type { StaffUser } from "@prisma/client";
import { env } from "../../config.js";
import { formatRequestId } from "../displayId.js";
import { prisma } from "../prisma.js";
import { pushBody } from "../pushText.js";
import { OPEN_STATUSES } from "../status.js";
import { inline, send, type Rows } from "./api.js";
import { allLocales, roleText, statusText, t, type TextKey } from "./text.js";

const STAFF_KEYS = ["staffAlerts", "staffJobs", "staffOverview", "staffPause", "staffResume", "staffUnlink"] as const satisfies readonly TextKey[];

export async function staffByChat(chatId: number) {
  return prisma.staffUser.findFirst({ where: { telegramChatId: String(chatId), isActive: true } });
}

export function staffMenuKeyboard(staff: StaffUser) {
  const l = staff.locale;
  const rows = [
    [t("staffAlerts", l), t(staff.role === "technician" ? "staffJobs" : "staffOverview", l)],
    [t(staff.telegramNotify ? "staffPause" : "staffResume", l), t("staffUnlink", l)],
  ];
  return { reply_markup: { keyboard: rows.map((row) => row.map((text) => ({ text }))), resize_keyboard: true } };
}

export function staffChoice(text: string): (typeof STAFF_KEYS)[number] | null {
  return STAFF_KEYS.find((key) => allLocales(key).includes(text)) ?? null;
}

export async function greetStaff(chatId: number, staff: StaffUser) {
  await send(chatId, t("staffLinked", staff.locale, { name: staff.name, role: roleText(staff.role, staff.locale) }), staffMenuKeyboard(staff));
}

/** An alert as text: the same wording as the bell and the push, in the person's language. */
function alertText(row: { code: string | null; params: unknown; message: string }, locale: string) {
  return pushBody({ code: row.code, params: row.params && typeof row.params === "object" ? (row.params as Record<string, unknown>) : null, message: row.message, locale });
}

export async function showStaffAlerts(chatId: number, staff: StaffUser) {
  const rows = await prisma.notification.findMany({ where: { audience: "staff", staffUserId: staff.id, isRead: false }, orderBy: { createdAt: "desc" }, take: 8 });
  if (rows.length === 0) return send(chatId, t("staffNoAlerts", staff.locale), staffMenuKeyboard(staff));
  await send(chatId, rows.map((row) => `• ${alertText(row, staff.locale)}`).join("\n"), staffMenuKeyboard(staff));
}

export async function showStaffJobs(chatId: number, staff: StaffUser) {
  const jobs = await prisma.serviceRequest.findMany({ where: { assignedTechnicianId: staff.id, status: { in: OPEN_STATUSES } }, include: { product: true, customer: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 10 });
  if (jobs.length === 0) return send(chatId, t("staffNoJobs", staff.locale), staffMenuKeyboard(staff));
  const rows: Rows = env.clientOrigin.startsWith("https://") ? jobs.map((job) => [{ text: `${formatRequestId(job.displayId)} · ${job.product.name}`.slice(0, 60), url: `${env.clientOrigin}/app/my-jobs/${job.id}/complete` }]) : [];
  const text = jobs.map((job) => `${formatRequestId(job.displayId)} · ${job.product.name} · ${job.customer.name} · ${statusText(job.status, staff.locale)}`).join("\n");
  await send(chatId, `${t("staffJobsTitle", staff.locale)}\n${text}`, rows.length ? inline(rows) : staffMenuKeyboard(staff));
}

export async function showStaffOverview(chatId: number, staff: StaffUser) {
  const [fresh, open, overdue, parts] = await Promise.all([
    prisma.serviceRequest.count({ where: { status: "new" } }),
    prisma.serviceRequest.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.serviceRequest.count({ where: { status: { in: OPEN_STATUSES }, overdueAt: { not: null } } }),
    prisma.serviceRequest.count({ where: { status: "awaiting_parts" } }),
  ]);
  await send(chatId, t("staffOverviewText", staff.locale, { new: fresh, open, overdue, parts }), staffMenuKeyboard(staff));
}

export async function setStaffNotify(chatId: number, staff: StaffUser, on: boolean) {
  const updated = await prisma.staffUser.update({ where: { id: staff.id }, data: { telegramNotify: on } });
  await send(chatId, t(on ? "staffUnmuted" : "staffMuted", staff.locale), staffMenuKeyboard(updated));
}

/**
 * Every alert a staff member gets in the bell and as a push is also sent to their linked Telegram chat (unless they muted it).
 * Never throws: a Telegram failure must not break the work that caused the alert.
 */
export async function telegramToStaff(staffUserId: string, input: { message: string; code?: string | null; params?: Record<string, unknown> | null; serviceRequestId?: string | null }) {
  try {
    const staff = await prisma.staffUser.findUnique({ where: { id: staffUserId } });
    if (!staff || !staff.isActive || !staff.telegramChatId || !staff.telegramNotify) return;
    const text = pushBody({ code: input.code, params: input.params, message: input.message, locale: staff.locale });
    let rows: Rows = [];
    if (input.serviceRequestId && env.clientOrigin.startsWith("https://")) {
      const path = staff.role === "technician" ? `/app/my-jobs/${input.serviceRequestId}/complete` : `/app/requests/${input.serviceRequestId}`;
      rows = [[{ text: t("openInApp", staff.locale), url: `${env.clientOrigin}${path}` }]];
    }
    await send(staff.telegramChatId, text, rows.length ? inline(rows) : {});
  } catch (error) {
    console.error("[telegram] staff alert failed:", error instanceof Error ? error.message : error);
  }
}
