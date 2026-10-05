import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

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

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[80]">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto p-4">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel className={`w-full rounded-2xl bg-white p-5 shadow-xl sm:p-6 ${wide ? "max-w-2xl" : "max-w-lg"}`}>
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="text-lg font-extrabold tracking-tight text-neutral-900">{title}</DialogTitle>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-black"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mt-4">{children}</div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
