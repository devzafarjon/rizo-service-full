import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import type { ReactNode } from "react";

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
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto p-4">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel className={`w-full rounded-2xl bg-white p-5 shadow-xl sm:p-6 ${wide ? "max-w-2xl" : "max-w-lg"}`}>
            <DialogTitle className="text-lg font-extrabold tracking-tight text-neutral-900">{title}</DialogTitle>
            <div className="mt-4">{children}</div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
