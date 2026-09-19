import { Dialog, DialogPanel } from "@headlessui/react";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useStaffAuth } from "../../features/auth/StaffAuthContext";
import { formatPhone, technicianTypeLabel } from "../../lib/format";
import { useStaffRealtime } from "../../lib/useStaffRealtime";
import { AccountMenu } from "../AccountMenu";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { QuickSearch } from "../QuickSearch";
import { RizoLogo } from "../RizoLogo";
import { ShellLogoutProvider } from "../ShellLogoutContext";
import { StaffNavLinks } from "./nav";

export function StaffShell() {
  const { t } = useTranslation();
  const { user, logout, setAvailability } = useStaffAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useStaffRealtime();

  if (!user) {
    return null;
  }

  function onLogout() {
    logout();
    navigate("/login");
  }

  const fullBleed = location.pathname === "/app/kanban" || location.pathname === "/app/my-jobs";

  return (
    <ShellLogoutProvider onLogout={onLogout}>
    <div className="min-h-dvh bg-white print:bg-white">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-gray-100 bg-white print:hidden lg:flex lg:flex-col">
        <Link to="/app" className="flex flex-col items-start gap-2 px-5 py-5">
          <RizoLogo className="h-8 w-auto" />
          <p className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{t("brand.staff")}</p>
        </Link>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <StaffNavLinks role={user.role} variant="sidebar" />
        </div>
        <StaffUserCard
          name={user.name}
          role={user.role}
          phone={user.phone}
          technicianType={user.technicianType}
          isAvailable={user.isAvailable}
          onToggleAvailability={
            user.role === "technician" ? () => setAvailability(!user.isAvailable) : undefined
          }
          onLogout={onLogout}
        />
      </aside>

      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-[70] border-b border-gray-100 bg-white/90 backdrop-blur print:hidden">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <RizoLogo className="h-8 w-auto" />
            </div>
            {user.role === "admin" ? <QuickSearch /> : <div className="flex-1" />}
            <LanguageSwitcher />
            <AccountMenu
              name={user.name}
              detail={
                user.role === "admin"
                  ? `${t("shell.adminRole")} · ${formatPhone(user.phone)}`
                  : `${technicianTypeLabel(user.technicianType) ?? t("role.technician")} · ${formatPhone(user.phone)}`
              }
              onLogout={onLogout}
            >
              {user.role === "technician" ? (
                <button
                  type="button"
                  onClick={() => setAvailability(!user.isAvailable)}
                  className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <span className={`h-2 w-2 rounded-full ${user.isAvailable ? "bg-emerald-500" : "bg-gray-400"}`} />
                  {user.isAvailable ? t("shell.available") : t("shell.busy")}
                </button>
              ) : null}
            </AccountMenu>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label={t("common.openMenu")}
            >
              <Menu size={22} />
            </button>
          </div>
        </header>

        <Dialog open={open} onClose={setOpen} className="relative z-50 print:hidden lg:hidden">
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <DialogPanel className="fixed inset-y-0 left-0 flex w-[min(100%,18rem)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <RizoLogo className="h-8 w-auto" />
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100"
                onClick={() => setOpen(false)}
                aria-label={t("common.closeMenu")}
              >
                <X size={20} />
              </button>
            </div>
            <StaffNavLinks role={user.role} variant="mobile" onNavigate={() => setOpen(false)} />
            <StaffUserCard
              name={user.name}
              role={user.role}
              phone={user.phone}
              technicianType={user.technicianType}
              isAvailable={user.isAvailable}
              onToggleAvailability={
                user.role === "technician" ? () => setAvailability(!user.isAvailable) : undefined
              }
              onLogout={onLogout}
            />
          </DialogPanel>
        </Dialog>

        <main
          className={
            fullBleed
              ? "w-full px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 lg:py-5 print:p-0"
              : "mx-auto w-full max-w-6xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:py-8 print:max-w-none print:p-0"
          }
        >
          <Outlet />
        </main>
      </div>
    </div>
    </ShellLogoutProvider>
  );
}

function StaffUserCard({
  name,
  role,
  phone,
  technicianType,
  isAvailable,
  onToggleAvailability,
  onLogout,
}: {
  name: string;
  role: "admin" | "technician";
  phone: string;
  technicianType: "service_center" | "mobile" | null;
  isAvailable: boolean;
  onToggleAvailability?: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-gray-100 p-4">
      <p className="truncate text-sm font-bold text-black">{name}</p>
      <p className="truncate text-xs text-gray-500">
        {role === "admin" ? t("shell.adminRole") : technicianTypeLabel(technicianType) ?? t("role.technician")}
        {" · "}
        {formatPhone(phone)}
      </p>
      {onToggleAvailability ? (
        <button
          type="button"
          onClick={onToggleAvailability}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold"
        >
          <span className={`h-2 w-2 rounded-full ${isAvailable ? "bg-emerald-500" : "bg-gray-400"}`} />
          {isAvailable ? t("shell.available") : t("shell.busy")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onLogout}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-100 text-sm font-bold text-[#B439FD] hover:bg-gray-200"
      >
        <LogOut size={16} />
        {t("common.signOut")}
      </button>
    </div>
  );
}
