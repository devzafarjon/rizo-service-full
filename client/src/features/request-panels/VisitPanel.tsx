import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { VisitPicker, type VisitChoice } from "../../components/VisitPicker";
import { useToast } from "../../components/toast";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatStamp } from "../../lib/format";
import type { ServiceRequest } from "../../lib/types";

/** The booked visit window of a request: who agreed to it, and a way for the office to set or move it. */
export function VisitPanel({ request, token, canEdit, onChanged }: { request: ServiceRequest; token: string | null; canEdit: boolean; onChanged: () => Promise<void> | void }) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<VisitChoice | null>(null);
  const closed = ["completed", "picked_up", "replaced", "refunded", "rejected", "cancelled"].includes(request.status);

  const save = useMutation({
    mutationFn: (value: VisitChoice) => api(`/api/staff/requests/${request.id}/visit`, { method: "POST", token, body: JSON.stringify(value) }),
    onSuccess: async () => {
      setOpen(false);
      notify(t("visit.saved"));
      await onChanged();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const confirm = useMutation({
    mutationFn: () => api(`/api/staff/requests/${request.id}/visit/confirm`, { method: "POST", token }),
    onSuccess: async () => {
      notify(t("visit.confirmedNote"));
      await onChanged();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const scheduled = request.scheduledAt ? new Date(request.scheduledAt) : null;
  const dayKey = scheduled ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(scheduled) : null;

  return (
    <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("visit.title")}</h2>
      {scheduled ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-base font-bold text-neutral-900">
            {dayKey ? formatDate(dayKey) : ""} {request.visitSlot ? `· ${request.visitSlot.replace("-", " – ")}` : `· ${formatStamp(request.scheduledAt!)}`}
          </p>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${request.visitConfirmedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            {request.visitConfirmedAt ? t("visit.confirmed") : t("visit.notConfirmed")}
          </span>
          {request.visitRescheduleCount > 0 ? <span className="text-xs text-neutral-500">{t("visit.moved", { count: request.visitRescheduleCount })}</span> : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">{t("visit.none")}</p>
      )}
      {request.etaMinutes != null && request.enRouteAt && !request.arrivedAt ? (
        <p className="mt-2 text-sm font-semibold text-[#7B00E0]">{t("visit.eta", { minutes: request.etaMinutes })}</p>
      ) : null}
      {request.escalationLevel > 0 ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{t("visit.escalated", { level: request.escalationLevel })}</p> : null}
      {canEdit && !closed ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-rizo-ghost"
            onClick={() => {
              setChoice(dayKey ? { date: dayKey, slot: "" } : null);
              setOpen(true);
            }}
          >
            {scheduled ? t("visit.move") : t("visit.book")}
          </button>
          {scheduled && !request.visitConfirmedAt ? (
            <button type="button" className="btn-rizo-ghost" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
              {confirm.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t("visit.markConfirmed")}
            </button>
          ) : null}
        </div>
      ) : null}

      <Modal open={open} onClose={() => setOpen(false)} title={scheduled ? t("visit.move") : t("visit.book")}>
        <div className="space-y-4">
          <VisitPicker token={token} slotsUrl={(date) => `/api/staff/requests/visit-slots?requestId=${request.id}&date=${date}`} value={choice} onChange={setChoice} />
          <p className="text-xs text-neutral-500">{t("visit.staffNote")}</p>
          <button type="button" className="btn-rizo h-12 w-full" disabled={!choice?.slot || save.isPending} onClick={() => choice && save.mutate(choice)}>
            {save.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("common.save")}
          </button>
        </div>
      </Modal>
    </section>
  );
}
