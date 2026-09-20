import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatStamp } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { notificationText } from "../../lib/notifications";
import type { SparePart, StaffAlert } from "../../lib/types";

export function useStaffAlerts() {
  const { token } = useStaffAuth();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["staff", "alerts"],
    enabled: Boolean(token),
    queryFn: () =>
      api<{ notifications: StaffAlert[]; unreadCount: number; lowStock: SparePart[] }>("/api/staff/alerts", { token }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => api(`/api/staff/alerts/${id}/read`, { method: "PATCH", token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "alerts"] }),
  });

  const markAll = useMutation({
    mutationFn: () => api("/api/staff/alerts/read-all", { method: "PATCH", token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "alerts"] }),
  });

  return {
    list,
    notifications: list.data?.notifications ?? [],
    unread: list.data?.unreadCount ?? 0,
    lowStock: list.data?.lowStock ?? [],
    markOne,
    markAll,
  };
}

export function StaffAlertsInbox({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const { list, notifications, unread, lowStock, markOne, markAll } = useStaffAlerts();

  if (list.isLoading) {
    return compact ? <p className="px-4 py-8 text-center text-sm text-neutral-500">{t("common.loading")}</p> : <PageSkeleton cards={2} />;
  }
  if (list.isError) {
    return <EmptyState tone="error" title={t("alerts.loadFailed")} body={t("alerts.loadFailedBody")} />;
  }

  return (
    <div>
      {unread > 0 ? (
        <div className={compact ? "flex justify-end border-b border-neutral-100 px-4 py-2" : "mb-4 flex justify-end"}>
          <button type="button" onClick={() => markAll.mutate()} className="text-xs font-bold text-[#B439FD]">
            {t("notifications.markAll")}
          </button>
        </div>
      ) : null}
      {lowStock.length > 0 ? (
        <div className={compact ? "border-b border-neutral-100 px-4 py-3" : "mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"}>
          <p className="text-xs font-bold tracking-wide text-amber-700 uppercase">{t("alerts.lowStock")}</p>
          <ul className="mt-2 space-y-1">
            {lowStock.slice(0, compact ? 5 : 20).map((part) => (
              <li key={part.id} className="text-xs font-semibold text-neutral-700">
                {localizedName(part)} · {part.stockQuantity}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {notifications.length === 0 && lowStock.length === 0 ? (
        compact ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">{t("alerts.empty")}</p>
        ) : (
          <EmptyState title={t("alerts.empty")} body={t("alerts.emptyBody")} />
        )
      ) : (
        <ul className={compact ? "" : "overflow-hidden rounded-2xl border border-neutral-200 bg-white"}>
          {notifications.map((item) => (
            <li key={item.id} className={item.isRead ? "bg-white" : "bg-[#F3E8FF]"}>
              <Link
                to={item.serviceRequestId ? `/app/requests/${item.serviceRequestId}` : "/app/catalog"}
                onClick={() => {
                  if (!item.isRead) markOne.mutate(item.id);
                }}
                className="block px-4 py-3 text-left hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-neutral-900">{notificationText(item, t, i18n.language)}</p>
                <p className="mt-1 text-xs text-neutral-500">{formatStamp(item.createdAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
