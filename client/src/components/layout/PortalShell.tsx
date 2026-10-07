import { ClipboardList, LifeBuoy, MapPin, Package, Plus, UserCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useCustomerAuth } from "../../features/auth/CustomerAuthContext";
import { NotificationBell } from "../../features/portal/NotificationBell";
import { formatPhone } from "../../lib/format";
import { useCustomerRealtime } from "../../lib/useCustomerRealtime";
import { AccountMenu } from "../AccountMenu";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { RizoServiceLockup } from "../RizoLogo";

export function PortalShell() {
  const { t } = useTranslation();
  const { user, logout } = useCustomerAuth();
  const navigate = useNavigate();
  useCustomerRealtime();

  if (!user) {
    return null;
  }

  function onLogout() {
    logout();
    navigate("/portal/login");
  }

  const links = [
    { to: "/portal", label: t("nav.myRequests"), icon: ClipboardList, end: true },
    { to: "/portal/new", label: t("nav.newRequest"), icon: Plus, end: false },
    { to: "/portal/products", label: t("nav.myProducts"), icon: Package, end: false },
    { to: "/centers", label: t("nav.centers"), icon: MapPin, end: false },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-[#F5F7FA]">
      <header className="sticky top-0 z-[70] border-b-[3px] border-[#F7941E] bg-[#F5EBFD] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
          <NavLink to="/portal" end className="flex min-w-0 shrink-0 items-center" aria-label={t("brand.service")}>
            <RizoServiceLockup />
          </NavLink>
          <span className="hidden rounded-full bg-[#F7941E] px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-[#3B2000] uppercase md:inline-flex">
            {t("brand.portalBadge")}
          </span>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `inline-flex h-10 items-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${
                    isActive ? "text-[#7B00E0]" : "text-gray-700 hover:text-[#7B00E0]"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <LanguageSwitcher />
            <AccountMenu name={user.name} detail={formatPhone(user.phone)} onLogout={onLogout}>
              <Link to="/portal/help" className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <LifeBuoy size={16} />
                {t("nav.help")}
              </Link>
              <Link to="/portal/account" className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <UserCog size={16} />
                {t("nav.account")}
              </Link>
            </AccountMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-32 sm:pb-8">
        <Outlet />
        <p className="mt-8 text-center text-xs text-neutral-500">
          <Link to="/privacy" className="font-semibold hover:text-[#7B00E0]">
            {t("legal.privacy")}
          </Link>
          {" · "}
          <Link to="/terms" className="font-semibold hover:text-[#7B00E0]">
            {t("legal.terms")}
          </Link>
        </p>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="grid grid-cols-4">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                    isActive ? "text-[#7B00E0]" : "text-gray-600"
                  }`
                }
              >
                <Icon size={20} />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
