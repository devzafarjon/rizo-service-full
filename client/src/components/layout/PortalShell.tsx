import { ClipboardList, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useCustomerAuth } from "../../features/auth/CustomerAuthContext";
import { NotificationBell } from "../../features/portal/NotificationBell";
import { formatPhone } from "../../lib/format";
import { useCustomerRealtime } from "../../lib/useCustomerRealtime";
import { AccountMenu } from "../AccountMenu";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { RizoLogo } from "../RizoLogo";
import { ShellLogoutProvider } from "../ShellLogoutContext";

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
  ];

  return (
    <ShellLogoutProvider onLogout={onLogout}>
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="bg-black">
        <div className="mx-auto flex h-10 max-w-3xl items-center justify-end px-4">
          <LanguageSwitcher variant="dark" />
        </div>
      </div>
      <header className="sticky top-0 z-[70] border-b border-gray-100 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <RizoLogo className="h-8 w-auto shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-black">{t("brand.service")}</p>
              <p className="truncate text-xs text-gray-500">{user.name} · {formatPhone(user.phone)}</p>
            </div>
          </div>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `inline-flex h-10 items-center rounded-lg px-3 text-sm font-bold ${
                    isActive ? "bg-[#F3E8FF] text-[#B439FD]" : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <AccountMenu name={user.name} detail={formatPhone(user.phone)} onLogout={onLogout} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-32 sm:pb-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="grid grid-cols-2">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-bold ${
                    isActive ? "text-[#B439FD]" : "text-gray-500"
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
    </ShellLogoutProvider>
  );
}
