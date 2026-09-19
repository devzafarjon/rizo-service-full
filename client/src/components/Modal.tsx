import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useShellLogout } from "./ShellLogoutContext";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  const shell = useShellLogout();

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto p-4">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel className={`w-full rounded-2xl bg-white p-5 shadow-xl sm:p-6 ${wide ? "max-w-2xl" : "max-w-lg"}`}>
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="text-lg font-extrabold tracking-tight text-neutral-900">{title}</DialogTitle>
              {shell ? (
                <button
                  type="button"
                  onClick={shell.onLogout}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-[#B439FD] hover:bg-[#F3E8FF]"
                >
                  <LogOut size={16} />
                  {t("common.signOut")}
                </button>
              ) : null}
            </div>
            <div className="mt-4">{children}</div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
