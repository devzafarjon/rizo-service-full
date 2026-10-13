import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";

export type InboxItem = { key: string; count: number; tone: "red" | "orange" | "blue"; to: string };

const TONES: Record<InboxItem["tone"], string> = {
  red: "bg-red-50 text-red-700",
  orange: "bg-[#FFF4E5] text-[#C56A00]",
  blue: "bg-sky-50 text-sky-800",
};

/** "My work": what waits for the admin right now. Counted live, so a row goes away by itself when it is dealt with. */
export function useAdminInbox(enabled = true) {
  const { token } = useStaffAuth();
  return useQuery({
    // under "alerts" so a new alert or a request change refreshes it with the bell
    queryKey: ["staff", "alerts", "inbox"],
    enabled: Boolean(token) && enabled,
    refetchInterval: 60_000,
    queryFn: () => api<{ items: InboxItem[]; total: number }>("/api/staff/inbox", { token }),
  });
}

export function AdminInbox() {
  const { t } = useTranslation();
  const inbox = useAdminInbox();
  if (inbox.isLoading || !inbox.data) return null;
  const { items, total } = inbox.data;

  return (
    <section className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5" aria-label={t("inbox.title")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-neutral-900">{t("inbox.title")}</h2>
          <p className="text-sm text-neutral-500">{items.length === 0 ? t("inbox.allClear") : t("inbox.subtitle", { count: total })}</p>
        </div>
        {items.length > 0 ? <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[#7B00E0] px-2 text-sm font-extrabold text-white">{total}</span> : <CheckCircle2 className="text-emerald-600" size={28} />}
      </div>
      {items.length > 0 ? (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.key} className="min-w-0">
              <Link to={item.to} className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2 transition hover:border-[#7B00E0]/40 hover:bg-[#F5EBFD]/40">
                <span className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-extrabold tabular-nums ${TONES[item.tone]}`}>{item.count}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-neutral-900">{t(`inbox.rows.${item.key}.title`)}</span>
                  <span className="block truncate text-xs text-neutral-500">{t(`inbox.rows.${item.key}.hint`)}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-neutral-400" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
