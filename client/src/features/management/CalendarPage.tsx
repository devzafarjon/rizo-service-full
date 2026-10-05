import { useQuery } from "@tanstack/react-query";
import { MapPin, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/Badges";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDate, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { ServiceRequest } from "../../lib/types";
import { todayIso } from "../../lib/warranty";

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayOf(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function timeOf(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** Scheduled visits and appointments for the next two weeks, day by day. */
export function CalendarPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [offset, setOffset] = useState(0);
  const from = addDays(todayIso(), offset * 14);
  const to = addDays(from, 13);
  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(from, index)), [from]);

  const list = useQuery({
    queryKey: ["staff", "requests", "calendar", from, to],
    enabled: Boolean(token),
    queryFn: () => api<{ requests: ServiceRequest[] }>(`/api/staff/requests?from=${from}&to=${to}`, { token }),
  });

  if (list.isLoading) return <PageSkeleton />;
  const byDay = new Map<string, ServiceRequest[]>();
  for (const request of list.data?.requests ?? []) {
    if (!request.scheduledAt) continue;
    const key = dayOf(request.scheduledAt);
    byDay.set(key, [...(byDay.get(key) ?? []), request]);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("calendar.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("calendar.intro")}</p>
        </div>
        <div className="inline-flex rounded-lg bg-neutral-100 p-1">
          <button type="button" onClick={() => setOffset(offset - 1)} className="h-9 rounded-md px-4 text-sm font-bold">
            ←
          </button>
          <button type="button" onClick={() => setOffset(0)} className="h-9 rounded-md bg-white px-4 text-sm font-bold shadow-sm">
            {t("calendar.today")}
          </button>
          <button type="button" onClick={() => setOffset(offset + 1)} className="h-9 rounded-md px-4 text-sm font-bold">
            →
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {days.map((day) => {
          const items = (byDay.get(day) ?? []).sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
          return (
            <section key={day} className={`rounded-2xl border bg-white p-3 ${day === todayIso() ? "border-[#7B00E0]" : "border-neutral-200"}`}>
              <h2 className="text-sm font-extrabold text-neutral-800">{formatDate(day)}</h2>
              {items.length === 0 ? <p className="mt-2 text-xs text-neutral-400">{t("calendar.free")}</p> : null}
              <ul className="mt-2 space-y-2">
                {items.map((request) => (
                  <li key={request.id}>
                    <Link to={`/app/kanban?request=${request.id}`} className="block rounded-xl bg-neutral-50 p-2.5 hover:bg-neutral-100">
                      <p className="flex items-center justify-between gap-2 text-xs font-bold text-[#7B00E0]">
                        <span>{request.scheduledAt ? timeOf(request.scheduledAt) : ""}</span>
                        {request.locationType === "on_site" ? <MapPin size={14} className="text-[#F7941E]" /> : <Store size={14} className="text-[#7B00E0]" />}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-bold">{request.customer.name}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {localizedName(request.product)} · {formatRequestId(request.displayId)}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <StatusBadge status={request.status} />
                        <span className="truncate text-xs font-semibold text-neutral-600">{request.assignedTechnician?.name ?? t("common.unassigned")}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
