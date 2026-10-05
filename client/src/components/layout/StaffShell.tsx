import { Dialog, DialogPanel } from "@headlessui/react";
import { CalendarDays, LogOut, Menu, QrCode, X, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useStaffAuth } from "../../features/auth/StaffAuthContext";
import { formatPhone, technicianTypeLabel } from "../../lib/format";
import type { StaffUser } from "../../lib/types";
import { useStaffRealtime } from "../../lib/useStaffRealtime";
import { StaffAlertBell } from "../../features/alerts/StaffAlertBell";
import { AccountMenu } from "../AccountMenu";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { QuickSearch } from "../QuickSearch";
import { RizoServiceLockup } from "../RizoLogo";
import { StaffTour } from "../../features/onboarding/StaffTour";
import { StaffNavLinks } from "./nav";

const FULL_BLEED_PATHS = ["/app/kanban", "/app/my-jobs"];

const MENU_ITEM_CLASS =
  "flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50";

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

  const isAdmin = user.role === "admin";
  const onToggleAvailability = isAdmin ? undefined : () => setAvailability(!user.isAvailable);
  const fullBleed = FULL_BLEED_PATHS.includes(location.pathname);
  const userCard = <StaffUserCard user={user} onToggleAvailability={onToggleAvailability} onLogout={onLogout} />;

  return (
    <div className="min-h-dvh bg-[#F5F7FA] print:bg-white">
      <header className="sticky top-0 z-[70] border-b border-gray-200 bg-white print:hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:flex-nowrap sm:gap-3 lg:h-16 lg:py-0 lg:pr-6 lg:pl-0">
          <Link to="/app" className="mr-auto flex shrink-0 items-center sm:mr-0 lg:w-64 lg:justify-center" aria-label={t("brand.staff")}>
            <RizoServiceLockup />
          </Link>
          {/* On phones the admin search wraps onto a second row, next to the menu button. */}
          {isAdmin ? (
            <div className="order-last flex min-w-0 flex-1 basis-48 sm:order-none sm:basis-0">
              <QuickSearch />
            </div>
          ) : null}
          {isAdmin ? null : <div className="flex-1" />}
          {isAdmin ? <StaffAlertBell /> : null}
          <LanguageSwitcher />
          <AccountMenu name={user.name} detail={staffUserDetail(user, t)} onLogout={onLogout}>
            {onToggleAvailability ? (
              <>
                <MenuLink to="/app/scan" icon={QrCode} label={t("nav.scan")} />
                <MenuLink to="/app/my-schedule" icon={CalendarDays} label={t("nav.mySchedule")} />
                <button type="button" onClick={onToggleAvailability} className={MENU_ITEM_CLASS}>
                  <AvailabilityLabel isAvailable={user.isAvailable} />
                </button>
              </>
            ) : null}
          </AccountMenu>
          <button
            type="button"
            className="order-last inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={t("common.openMenu")}
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      <aside className="fixed top-16 bottom-0 left-0 z-30 hidden w-64 border-r border-gray-200 bg-white print:hidden lg:flex lg:flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <StaffNavLinks role={user.role} variant="sidebar" />
        </div>
        {userCard}
      </aside>

      <div className="lg:pl-64 print:pl-0">
        <Dialog open={open} onClose={setOpen} className="relative z-[80] print:hidden lg:hidden">
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <DialogPanel className="fixed inset-y-0 left-0 flex w-[min(100%,18rem)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <RizoServiceLockup />
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
            {userCard}
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
      {isAdmin ? <StaffTour userId={user.id} /> : null}
    </div>
  );
}

function staffUserDetail(user: StaffUser, t: (key: string) => string) {
  const role =
    user.role === "admin" ? t("shell.adminRole") : technicianTypeLabel(user.technicianType) ?? t("role.technician");
  return `${role} · ${formatPhone(user.phone)}`;
}

function MenuLink({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link to={to} className={MENU_ITEM_CLASS}>
      <Icon size={16} />
      {label}
    </Link>
  );
}

function AvailabilityLabel({ isAvailable }: { isAvailable: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <span className={`h-2 w-2 rounded-full ${isAvailable ? "bg-emerald-500" : "bg-gray-400"}`} />
      {isAvailable ? t("shell.available") : t("shell.busy")}
    </>
  );
}

function StaffUserCard({
  user,
  onToggleAvailability,
  onLogout,
}: {
  user: StaffUser;
  onToggleAvailability?: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-gray-200 p-4">
      <p className="truncate text-sm font-bold text-black">{user.name}</p>
      <p className="truncate text-xs text-gray-500">{staffUserDetail(user, t)}</p>
      {onToggleAvailability ? (
        <button
          type="button"
          onClick={onToggleAvailability}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold"
        >
          <AvailabilityLabel isAvailable={user.isAvailable} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onLogout}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-100 text-sm font-bold text-[#7B00E0] hover:bg-gray-200"
      >
        <LogOut size={16} />
        {t("common.signOut")}
      </button>
    </div>
  );
}
