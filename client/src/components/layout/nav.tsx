import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  ClipboardList,
  Kanban,
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingBag,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { StaffRole } from "../../lib/types";

export type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  roles: StaffRole[];
};

export const STAFF_NAV: NavItem[] = [
  { to: "/app", labelKey: "nav.dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/app/kanban", labelKey: "nav.board", icon: Kanban, roles: ["admin"] },
  { to: "/app/customers", labelKey: "nav.customers", icon: Users, roles: ["admin"] },
  { to: "/app/catalog", labelKey: "nav.catalog", icon: Package, roles: ["admin"] },
  { to: "/app/sales", labelKey: "nav.sales", icon: ShoppingBag, roles: ["admin"] },
  { to: "/app/requests", labelKey: "nav.requests", icon: ClipboardList, roles: ["admin"] },
  { to: "/app/receipts", labelKey: "nav.receipts", icon: Receipt, roles: ["admin"] },
  { to: "/app/reports", labelKey: "nav.reports", icon: BarChart3, roles: ["admin"] },
  { to: "/app/my-jobs", labelKey: "nav.myJobs", icon: Wrench, roles: ["technician"] },
];

export function navForRole(role: StaffRole) {
  return STAFF_NAV.filter((item) => item.roles.includes(role));
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
  const items = navForRole(role);
  return (
    <nav className={variant === "sidebar" ? "flex flex-col gap-1" : "flex flex-col gap-1 p-3"}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/app"}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                isActive
                  ? "bg-[#F3E8FF] text-[#B439FD]"
                  : "text-gray-600 hover:bg-gray-100 hover:text-black"
              }`
            }
          >
            <Icon className="shrink-0" size={18} />
            {t(item.labelKey)}
          </NavLink>
        );
      })}
    </nav>
  );
}
