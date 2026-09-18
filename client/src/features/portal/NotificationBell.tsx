import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api } from "../../lib/api";
import { formatStamp } from "../../lib/format";
import { notificationText } from "../../lib/notifications";
import type { PortalNotification } from "../../lib/types";

export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const { token } = useCustomerAuth();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["customer", "notifications"],
    enabled: Boolean(token),
    queryFn: () =>
      api<{ notifications: PortalNotification[]; unreadCount: number }>("/api/customer/notifications", { token }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => api(`/api/customer/notifications/${id}/read`, { method: "PATCH", token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer", "notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: () => api("/api/customer/notifications/read-all", { method: "PATCH", token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer", "notifications"] }),
  });

  const notifications = list.data?.notifications ?? [];
  const unread = list.data?.unreadCount ?? 0;

  return (
    <Popover className="relative">
      <PopoverButton
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100"
        aria-label={t("notifications.aria")}
      >
        <Bell size={20} />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[#B439FD] px-1 text-[10px] font-extrabold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </PopoverButton>
      <PopoverPanel className="absolute right-0 z-50 mt-2 w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <p className="text-sm font-extrabold">{t("notifications.title")}</p>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              className="text-xs font-bold text-[#B439FD]"
            >
              {t("notifications.markAll")}
            </button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">{t("notifications.empty")}</p>
          ) : (
            <ul>
              {notifications.map((item) => (
                <li key={item.id} className={item.isRead ? "bg-white" : "bg-[#F3E8FF]"}>
                  <Link
                    to={`/portal/requests/${item.serviceRequestId}`}
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
      </PopoverPanel>
    </Popover>
  );
}
