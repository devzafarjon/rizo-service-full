import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { AuditLogEntry, OutboundMessage } from "../../lib/types";

function valueText(value: Record<string, unknown> | null) {
  if (!value) return "";
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`)
    .join(", ");
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
      <h1 className="text-2xl font-extrabold tracking-tight">{t("audit.title")}</h1>
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
          {items.map((row) => (
            <li key={row.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-sm font-extrabold">{t(`audit.action.${row.action}`, { defaultValue: row.action })}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {row.userName ?? row.userId} · {row.userType} · {formatDateTime(row.createdAt)}
              </p>
              <p className="mt-2 text-xs text-neutral-600">
                {row.entityType} {row.entityId}
              </p>
              {row.oldValue || row.newValue ? (
                <p className="mt-2 text-xs text-neutral-500">
                  {valueText(row.oldValue)} {row.oldValue && row.newValue ? "→" : ""} {valueText(row.newValue)}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <h2 className="mt-10 text-lg font-extrabold">{t("audit.outbound")}</h2>
      <ul className="mt-3 space-y-2">
        {(outbound.data?.messages ?? []).map((row) => (
          <li key={row.id} className="rounded-xl bg-neutral-50 px-4 py-3 text-sm">
            <span className="font-bold uppercase">{row.channel}</span> · {row.to} · {row.status}
            <p className="mt-1 text-neutral-600">{row.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
