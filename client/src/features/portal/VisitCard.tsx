import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, CreditCard } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { VisitPicker, type VisitChoice } from "../../components/VisitPicker";
import { useToast } from "../../components/toast";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatMoney, formatStamp } from "../../lib/format";
import type { PayLinks, PortalRequest } from "../../lib/types";

/** The booked visit window: confirm it, move it, or withdraw the request. Also shows the technician's arrival estimate. */
export function VisitCard({ request, onChanged }: { request: PortalRequest; onChanged: () => Promise<unknown> | void }) {
  const { t } = useTranslation();
  const { token } = useCustomerAuth();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<VisitChoice | null>(null);
  const visit = request.visit;

  const save = useMutation({
    mutationFn: (value: VisitChoice) => api(`/api/customer/requests/${request.id}/visit`, { method: "POST", token, body: JSON.stringify(value) }),
    onSuccess: async () => {
      setOpen(false);
      notify(t("visit.saved"));
      await onChanged();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const confirm = useMutation({
    mutationFn: () => api(`/api/customer/requests/${request.id}/visit/confirm`, { method: "POST", token }),
    onSuccess: async () => {
      notify(t("visit.confirmedNote"));
      await onChanged();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/api/customer/requests/${request.id}/cancel`, { method: "POST", token, body: JSON.stringify({}) }),
    onSuccess: async () => {
      notify(t("visit.cancelled"));
      await onChanged();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (!visit) return null;
  const scheduled = request.scheduledAt ? new Date(request.scheduledAt) : null;
  const dayKey = scheduled ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(scheduled) : null;
  // Nothing to show or do once the job is over.
  if (!visit.canBook && !scheduled && !visit.canCancel) return null;

  return (
    <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-neutral-800 uppercase">
        <CalendarClock size={16} className="text-[#7B00E0]" />
        {t("visit.title")}
      </h2>
      {scheduled ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-base font-bold text-neutral-900">
            {dayKey ? formatDate(dayKey) : ""} {request.visit.slot ? `· ${request.visit.slot.replace("-", " – ")}` : `· ${formatStamp(request.scheduledAt!)}`}
          </p>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${visit.confirmed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{visit.confirmed ? t("visit.confirmed") : t("visit.notConfirmed")}</span>
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-600">{t("visit.noneCustomer")}</p>
      )}
      {request.eta ? <p className="mt-2 text-sm font-bold text-[#8A4B00]">{t("visit.eta", { minutes: request.eta.minutes })}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {scheduled && !visit.confirmed ? (
          <button type="button" className="btn-rizo h-11" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
            {confirm.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("visit.confirmButton")}
          </button>
        ) : null}
        {(scheduled ? visit.canReschedule : visit.canBook) ? (
          <button
            type="button"
            className="btn-rizo-ghost h-11"
            onClick={() => {
              setChoice(dayKey ? { date: dayKey, slot: "" } : null);
              setOpen(true);
            }}
          >
            {scheduled ? t("visit.move") : t("visit.book")}
          </button>
        ) : null}
        {visit.canCancel ? (
          <button type="button" className="h-11 rounded-lg px-3 text-sm font-bold text-red-700 hover:bg-red-50" disabled={cancel.isPending} onClick={() => window.confirm(t("visit.cancelConfirm")) && cancel.mutate()}>
            {t("visit.cancelRequest")}
          </button>
        ) : null}
      </div>
      {scheduled && !visit.canReschedule && visit.canBook ? <p className="mt-3 text-xs text-neutral-500">{t("visit.callToMove")}</p> : null}

      <Modal open={open} onClose={() => setOpen(false)} title={scheduled ? t("visit.move") : t("visit.book")}>
        <div className="space-y-4">
          <VisitPicker token={token} slotsUrl={(date) => `/api/customer/visit-slots?requestId=${request.id}&date=${date}`} value={choice} onChange={setChoice} />
          <button type="button" className="btn-rizo h-12 w-full" disabled={!choice?.slot || save.isPending} onClick={() => choice && save.mutate(choice)}>
            {save.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("common.save")}
          </button>
        </div>
      </Modal>
    </section>
  );
}

/** Payme / Click buttons for what is still owed, when the service has switched them on. */
export function PayCard({ request, urlBase }: { request: { id: string; payment: { balance: number } }; urlBase: string }) {
  const { t } = useTranslation();
  const { token } = useCustomerAuth();
  const links = useQuery({
    queryKey: ["customer", "pay-links", request.id, request.payment.balance],
    enabled: Boolean(token && request.payment.balance > 0),
    queryFn: () => api<PayLinks>(`${urlBase}/pay-links`, { token }),
  });
  if (!links.data?.enabled) return null;
  return (
    <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-neutral-800 uppercase">
        <CreditCard size={16} className="text-[#7B00E0]" />
        {t("pay.title")}
      </h2>
      <p className="mt-2 text-sm text-neutral-600">{t("pay.body", { amount: formatMoney(links.data.amount) })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.data.payme ? (
          <a href={links.data.payme} target="_blank" rel="noreferrer" className="btn-rizo h-11">
            Payme
          </a>
        ) : null}
        {links.data.click ? (
          <a href={links.data.click} target="_blank" rel="noreferrer" className="btn-rizo-ghost h-11">
            Click
          </a>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-neutral-500">{t("pay.note")}</p>
    </section>
  );
}
