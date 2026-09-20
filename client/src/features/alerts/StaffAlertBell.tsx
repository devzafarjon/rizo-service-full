import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { StaffAlertsInbox, useStaffAlerts } from "./StaffAlertsInbox";

export function StaffAlertBell() {
  const { t } = useTranslation();
  const { unread } = useStaffAlerts();

  return (
    <Popover className="relative" data-tour="notifications-bell">
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
          <p className="text-sm font-extrabold">{t("alerts.title")}</p>
          <Link to="/app/alerts" className="text-xs font-bold text-[#B439FD]">
            {t("alerts.viewAll")}
          </Link>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <StaffAlertsInbox compact />
        </div>
      </PopoverPanel>
    </Popover>
  );
}
