import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { api, apiErrorMessage } from "../../lib/api";
import type { ServiceRequest } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";

/** What a second-tier job (another maker, paid) shows on the request page: that it waits, why, and the admin's way to move it up. */
export function QueueNotice({ request, queue, isAdmin, onChanged }: { request: ServiceRequest; queue: { waiting: boolean; backlog: number }; isAdmin: boolean; onChanged: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (request.tier !== 2) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/staff/requests/${request.id}/queue-override`, { method: "POST", token, body: JSON.stringify({ reason }) });
      notify(t("directory.overrideDone"));
      setOpen(false);
      setReason("");
      await onChanged();
    } catch (err) {
      notify(apiErrorMessage(err, t), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 max-w-xl rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <p className="font-semibold">{t("directory.tierNote")}</p>
      {request.queueOverride ? (
        <p className="mt-1">{t("directory.overridden", { by: request.queueOverride.by ?? "—", reason: request.queueOverride.reason ?? "" })}</p>
      ) : queue.waiting ? (
        <p className="mt-1">{t("directory.waitingNote", { count: queue.backlog })}</p>
      ) : null}
      {isAdmin && queue.waiting && !request.queueOverride ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex h-9 items-center rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white">
          {t("directory.moveToFront")}
        </button>
      ) : null}
      <Modal open={open} onClose={() => setOpen(false)} title={t("directory.moveToFront")}>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-neutral-500">{t("directory.overrideBody")}</p>
          <Field label={t("directory.overrideReason")}>
            <input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={300} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">{t("common.cancel")}</button>
            <button type="submit" disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#7B00E0] px-5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? <Spinner /> : null}
              {t("directory.moveToFront")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
