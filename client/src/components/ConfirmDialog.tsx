import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-neutral-600">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="inline-flex h-11 items-center rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-70"
        >
          {confirmLabel ?? t("common.delete")}
        </button>
      </div>
    </Modal>
  );
}
