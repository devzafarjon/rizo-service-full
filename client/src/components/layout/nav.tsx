import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Copy,
  Database,
  Kanban,
  LayoutDashboard,
  Package,
  Plus,
  QrCode,
  Receipt,
  ScrollText,
  ShoppingBag,
  Store,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { REPORT_LINKS } from "../../features/reporting/reportNav";
import type { StaffRole } from "../../lib/types";

export type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  roles: StaffRole[];
  end?: boolean;
  tour?: string;
};

export const ADMIN_DAILY: NavItem[] = [
  { to: "/app/kanban", labelKey: "nav.board", icon: Kanban, roles: ["admin"], tour: "kanban" },
  { to: "/app/requests/new", labelKey: "nav.newRequest", icon: Plus, roles: ["admin"], end: true, tour: "new-request" },
  { to: "/app/customers", labelKey: "nav.customers", icon: Users, roles: ["admin"], end: true },
  { to: "/app/alerts", labelKey: "nav.notifications", icon: Bell, roles: ["admin"], tour: "notifications" },
];

export const ADMIN_MANAGEMENT: NavItem[] = [
  { to: "/app/reports", labelKey: "nav.reports", icon: BarChart3, roles: ["admin"], tour: "reports" },
  { to: "/app?view=full", labelKey: "nav.analytics", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/app/catalog", labelKey: "nav.inventory", icon: Package, roles: ["admin"] },
  { to: "/app/schedule", labelKey: "nav.schedule", icon: CalendarDays, roles: ["admin"] },
  { to: "/app/audit", labelKey: "nav.activity", icon: ScrollText, roles: ["admin"] },
  { to: "/app/customers/duplicates", labelKey: "nav.duplicates", icon: Copy, roles: ["admin"] },
  { to: "/app/settings", labelKey: "nav.settings", icon: Database, roles: ["admin"] },
  { to: "/app/sales", labelKey: "nav.sales", icon: ShoppingBag, roles: ["admin"] },
  { to: "/app/requests", labelKey: "nav.requests", icon: ClipboardList, roles: ["admin"], end: true },
  { to: "/app/receipts", labelKey: "nav.receipts", icon: Receipt, roles: ["admin"] },
  { to: "/app/kiosk", labelKey: "nav.kiosk", icon: Store, roles: ["admin"] },
  { to: "/app/scan", labelKey: "nav.scan", icon: QrCode, roles: ["admin"] },
];

export const TECH_NAV: NavItem[] = [
  { to: "/app/my-jobs", labelKey: "nav.myJobs", icon: Wrench, roles: ["technician"] },
];

const MGMT_PATHS = [
  "/app/reports",
  "/app/catalog",
  "/app/schedule",
  "/app/audit",
  "/app/customers/duplicates",
  "/app/settings",
  "/app/sales",
  "/app/requests",
  "/app/receipts",
  "/app/kiosk",
  "/app/scan",
];

function managementOpenByPath(pathname: string, search: string) {
  if (pathname === "/app/requests/new") return false;
  if (pathname === "/app" && new URLSearchParams(search).get("view") === "full") return true;
  return MGMT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function linkClass(active: boolean) {
  return `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
    active ? "bg-[#F3E8FF] text-[#B439FD]" : "text-gray-600 hover:bg-gray-100 hover:text-black"
  }`;
}

function NavItemLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const Icon = item.icon;
  const isReports = item.to === "/app/reports";
  const reportsActive = location.pathname.startsWith("/app/reports");
  const isAnalytics = item.to === "/app?view=full";
  const analyticsActive = location.pathname === "/app" && new URLSearchParams(location.search).get("view") === "full";

  return (
    <div>
      <NavLink
        to={item.to}
        end={item.end ?? item.to === "/app"}
        onClick={onNavigate}
        data-tour={item.tour}
        className={({ isActive }) =>
          linkClass(isAnalytics ? analyticsActive : isActive || (isReports && reportsActive))
        }
      >
        <Icon className="shrink-0" size={18} />
        {t(item.labelKey)}
      </NavLink>
      {isReports ? (
        <div className="mt-1 ml-8 flex flex-col gap-0.5 border-l border-gray-100 pl-3">
          {REPORT_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-9 items-center rounded-md px-2 text-xs font-semibold transition ${
                  isActive ? "bg-[#F3E8FF] text-[#B439FD]" : "text-gray-500 hover:bg-gray-50 hover:text-black"
                }`
              }
            >
              {t(link.labelKey)}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StaffNavLinks({
  role,
  onNavigate,
  variant,
}: {
  role: StaffRole;
  onNavigate?: () => void;
  variant: "sidebar" | "mobile";
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const [mgmtOpen, setMgmtOpen] = useState(() => managementOpenByPath(location.pathname, location.search));

  useEffect(() => {
    if (managementOpenByPath(location.pathname, location.search)) {
      setMgmtOpen(true);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    function expand() {
      setMgmtOpen(true);
    }
    window.addEventListener("rizo-expand-management", expand);
    return () => window.removeEventListener("rizo-expand-management", expand);
  }, []);

  if (role === "technician") {
    return (
      <nav className={variant === "sidebar" ? "flex flex-col gap-1" : "flex flex-col gap-1 p-3"}>
        {TECH_NAV.map((item) => (
          <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
    );
  }

  return (
    <nav className={variant === "sidebar" ? "flex flex-col gap-1" : "flex flex-col gap-1 p-3"}>
      <p className="px-3 pt-1 pb-1 text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{t("nav.dailyUse")}</p>
      {ADMIN_DAILY.map((item) => (
        <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
      ))}

      <div className="mx-3 mt-3 mb-2 border-t border-neutral-100" />

      <button
        type="button"
        data-tour="management"
        onClick={() => setMgmtOpen((open) => !open)}
        className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-[11px] font-bold tracking-wide text-neutral-400 uppercase hover:bg-gray-50"
      >
        <span>{t("nav.management")}</span>
        <ChevronDown size={16} className={`transition ${mgmtOpen ? "rotate-180" : ""}`} />
      </button>
      {mgmtOpen
        ? ADMIN_MANAGEMENT.map((item) => <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />)
        : null}
    </nav>
  );
}
