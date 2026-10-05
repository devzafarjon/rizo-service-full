import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Copy,
  Database,
  Kanban,
  LayoutDashboard,
  Map as MapIcon,
  Package,
  PackageCheck,
  Plus,
  QrCode,
  Receipt,
  ScrollText,
  ShoppingBag,
  Store,
  UserCog,
  Users,
  Wallet,
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

const ANALYTICS_PATH = "/app?view=full";

const OFFICE: StaffRole[] = ["admin", "receptionist"];

export const ADMIN_DAILY: NavItem[] = [
  { to: "/app/kanban", labelKey: "nav.board", icon: Kanban, roles: OFFICE, tour: "kanban" },
  { to: "/app/requests/new", labelKey: "nav.newRequest", icon: Plus, roles: OFFICE, end: true, tour: "new-request" },
  { to: "/app/customers", labelKey: "nav.customers", icon: Users, roles: OFFICE, end: true },
  { to: "/app/alerts", labelKey: "nav.notifications", icon: Bell, roles: ["admin"], tour: "notifications" },
];

export const ADMIN_MANAGEMENT: NavItem[] = [
  { to: "/app/reports", labelKey: "nav.reports", icon: BarChart3, roles: ["admin"], tour: "reports" },
  { to: ANALYTICS_PATH, labelKey: "nav.analytics", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/app/requests", labelKey: "nav.requests", icon: ClipboardList, roles: OFFICE, end: true },
  { to: "/app/calendar", labelKey: "nav.calendar", icon: CalendarClock, roles: OFFICE },
  { to: "/app/map", labelKey: "nav.map", icon: MapIcon, roles: OFFICE },
  { to: "/app/catalog", labelKey: "nav.inventory", icon: Package, roles: ["admin"] },
  { to: "/app/part-orders", labelKey: "nav.partOrders", icon: PackageCheck, roles: OFFICE },
  { to: "/app/sales", labelKey: "nav.sales", icon: ShoppingBag, roles: OFFICE },
  { to: "/app/receipts", labelKey: "nav.receipts", icon: Receipt, roles: OFFICE },
  { to: "/app/kiosk", labelKey: "nav.kiosk", icon: Store, roles: OFFICE },
  { to: "/app/scan", labelKey: "nav.scan", icon: QrCode, roles: OFFICE },
  { to: "/app/schedule", labelKey: "nav.schedule", icon: CalendarDays, roles: ["admin"] },
  { to: "/app/centers", labelKey: "nav.centers", icon: Building2, roles: OFFICE },
  { to: "/app/staff", labelKey: "nav.staff", icon: UserCog, roles: ["admin"] },
  { to: "/app/audit", labelKey: "nav.activity", icon: ScrollText, roles: ["admin"] },
  { to: "/app/customers/duplicates", labelKey: "nav.duplicates", icon: Copy, roles: ["admin"] },
  { to: "/app/settings", labelKey: "nav.settings", icon: Database, roles: ["admin"] },
];

export const TECH_NAV: NavItem[] = [
  { to: "/app/my-jobs", labelKey: "nav.myJobs", icon: Wrench, roles: ["technician"] },
  { to: "/app/my-earnings", labelKey: "nav.myEarnings", icon: Wallet, roles: ["technician"] },
];

// Every management link except analytics, which lives on /app behind a query param.
const MGMT_PATHS = ADMIN_MANAGEMENT.map((item) => item.to).filter((to) => to !== ANALYTICS_PATH);

function isAnalyticsActive(pathname: string, search: string) {
  return pathname === "/app" && new URLSearchParams(search).get("view") === "full";
}

function managementOpenByPath(pathname: string, search: string) {
  if (pathname === "/app/requests/new") return false;
  if (isAnalyticsActive(pathname, search)) return true;
  return MGMT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// RizoPost sidebar: plain rows, the active one is brand-purple text and icon (no fill).
function linkClass(active: boolean) {
  return `flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-semibold transition lg:min-h-[33px] ${
    active ? "text-[#7B00E0]" : "text-gray-700 hover:text-[#7B00E0]"
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

  if (item.to === ANALYTICS_PATH) {
    const analyticsActive = isAnalyticsActive(location.pathname, location.search);
    return (
      <Link
        to={item.to}
        onClick={onNavigate}
        data-tour={item.tour}
        className={linkClass(analyticsActive)}
        aria-current={analyticsActive ? "page" : undefined}
      >
        <Icon className="shrink-0" size={18} strokeWidth={1.75} />
        {t(item.labelKey)}
      </Link>
    );
  }

  return (
    <div>
      <NavLink
        to={item.to}
        end={item.end ?? item.to === "/app"}
        onClick={onNavigate}
        data-tour={item.tour}
        className={({ isActive }) =>
          linkClass(isActive || (isReports && reportsActive))
        }
      >
        <Icon className="shrink-0" size={18} strokeWidth={1.75} />
        {t(item.labelKey)}
      </NavLink>
      {isReports ? (
        <div className="mt-0.5 mb-1 ml-[1.1rem] flex flex-col border-l border-gray-200 pl-4">
          {REPORT_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-8 items-center rounded-md px-2 text-[13px] font-medium transition ${
                  isActive ? "text-[#7B00E0]" : "text-gray-600 hover:text-[#7B00E0]"
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

  const navClass = variant === "sidebar" ? "flex flex-col gap-1" : "flex flex-col gap-1 p-3";

  if (role === "technician") {
    return (
      <nav className={navClass}>
        {TECH_NAV.map((item) => (
          <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
    );
  }

  return (
    <nav className={navClass}>
      <p className="px-2 pt-1 pb-1 text-[11px] font-bold tracking-wide text-gray-500 uppercase">{t("nav.dailyUse")}</p>
      {ADMIN_DAILY.filter((item) => item.roles.includes(role)).map((item) => (
        <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
      ))}

      <div className="mx-2 mt-3 mb-2 border-t border-gray-200" />

      <button
        type="button"
        data-tour="management"
        onClick={() => setMgmtOpen((open) => !open)}
        className="flex min-h-9 w-full items-center justify-between rounded-lg px-2 text-[11px] font-bold tracking-wide text-gray-500 uppercase hover:bg-gray-50"
      >
        <span>{t("nav.management")}</span>
        <ChevronDown size={16} className={`transition ${mgmtOpen ? "rotate-180" : ""}`} />
      </button>
      {mgmtOpen
        ? ADMIN_MANAGEMENT.filter((item) => item.roles.includes(role)).map((item) => <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />)
        : null}
    </nav>
  );
}
