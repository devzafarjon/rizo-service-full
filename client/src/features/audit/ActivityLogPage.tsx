import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDate, formatDateTime, formatMoney, formatStamp } from "../../lib/format";
import type { AuditLogEntry, OutboundMessage } from "../../lib/types";

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_KEYS = new Set(["amount", "balance", "estimatedCost", "finalCost", "total"]);
const ENUM_KEYS: Record<string, string> = {
  status: "status",
  role: "staffAdmin.roles",
  method: "payments.methods",
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fieldLabel(t: Translate, key: string) {
  return t(`audit.field.${key}`, { defaultValue: key });
}

function fieldValue(t: Translate, key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return t("common.dash");
  if (typeof value === "boolean") return value ? t("audit.yes") : t("audit.no");
  if (typeof value === "number") return MONEY_KEYS.has(key) ? formatMoney(value) : String(value);
  if (typeof value === "string") {
    if (ISO_DATE_TIME.test(value)) return formatStamp(value);
    if (ISO_DATE.test(value)) return formatDate(value);
    const group = ENUM_KEYS[key];
    return group ? t(`${group}.${value}`, { defaultValue: value }) : value;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? t("common.dash") : value.map((item) => fieldValue(t, key, item)).join(", ");
  }
  return JSON.stringify(value);
}

/** One readable "label: value" line per changed field; when both sides carry a field it shows old → new. */
function changeLines(t: Translate, oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null) {
  const before = oldValue ?? {};
  const after = newValue ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const lines: string[] = [];
  for (const key of keys) {
    const inBefore = key in before;
    const inAfter = key in after;
    if (inBefore && inAfter) {
      if (sameValue(before[key], after[key])) continue;
      lines.push(`${fieldLabel(t, key)}: ${fieldValue(t, key, before[key])} → ${fieldValue(t, key, after[key])}`);
    } else {
      lines.push(`${fieldLabel(t, key)}: ${fieldValue(t, key, inAfter ? after[key] : before[key])}`);
    }
  }
  return lines;
}

export function ActivityLogPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [entityId, setEntityId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = new URLSearchParams();
  if (entityId.trim()) query.set("entityId", entityId.trim());
  if (userId.trim()) query.set("userId", userId.trim());
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  const logs = useQuery({
    queryKey: ["staff", "audit", query.toString()],
    enabled: Boolean(token),
    queryFn: () => api<{ logs: AuditLogEntry[] }>(`/api/staff/audit?${query.toString()}`, { token }),
  });
  const outbound = useQuery({
    queryKey: ["staff", "outbound"],
    enabled: Boolean(token),
    queryFn: () => api<{ messages: OutboundMessage[] }>("/api/staff/outbound", { token }),
  });

  if (logs.isLoading) return <PageSkeleton />;

  const items = logs.data?.logs ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("audit.title")}</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">{t("audit.intro")}</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("audit.requestOrEntity")}>
          <input className={inputClass} value={entityId} onChange={(event) => setEntityId(event.target.value)} />
        </Field>
        <Field label={t("audit.userId")}>
          <input className={inputClass} value={userId} onChange={(event) => setUserId(event.target.value)} />
        </Field>
        <Field label={t("audit.from")}>
          <input className={inputClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label={t("audit.to")}>
          <input className={inputClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </div>
      {items.length === 0 ? (
        <EmptyState title={t("audit.emptyTitle")} body={t("audit.emptyBody")} />
      ) : (
        <ol className="space-y-3">
          {items.map((row) => {
            const lines = changeLines(t, row.oldValue, row.newValue);
            return (
              <li key={row.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-sm font-extrabold">{t(`audit.action.${row.action}`, { defaultValue: row.action })}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {row.userName ?? row.userId} · {row.userType} · {formatDateTime(row.createdAt)}
                </p>
                <p className="mt-2 text-xs text-neutral-600">
                  {row.entityType} {row.entityId}
                </p>
                {lines.length > 0 ? (
                  <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
                    {lines.map((line, index) => (
                      <li key={`${index}-${line}`}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <h2 className="mt-10 text-lg font-extrabold">{t("audit.outbound")}</h2>
      {(outbound.data?.messages ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">{t("audit.outboundEmpty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {(outbound.data?.messages ?? []).map((row) => (
            <li key={row.id} className="rounded-xl bg-neutral-50 px-4 py-3 text-sm">
              <span className="font-bold uppercase">{row.channel}</span> · {row.to} · {row.status}
              <p className="mt-1 text-neutral-600">{row.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
