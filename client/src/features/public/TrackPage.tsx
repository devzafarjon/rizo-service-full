import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { StatusBadge } from "../../components/Badges";
import { BrandChrome } from "../../components/BrandChrome";
import { RequestTimeline } from "../../components/RequestTimeline";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatMoney, formatRequestId, formatStamp } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { EstimateLine, EstimateStatus, Named, PayLinks, RequestStatus, TimelineEvent, WarrantyStatus } from "../../lib/types";
import { portalInputClass } from "../portal/fields";

type Track = {
  displayId: string;
  type: "installation" | "repair";
  status: RequestStatus;
  locationType: "in_shop" | "on_site";
  createdAt: string;
  completedAt: string | null;
  dueBy: string | null;
  scheduledAt: string | null;
  visit: { slot: string | null; confirmed: boolean; canConfirm: boolean };
  eta: { minutes: number; setAt: string } | null;
  product: Named & { sku: string };
  technicianFirstName: string | null;
  rejectionReason: string | null;
  warrantyStatus: WarrantyStatus;
  warrantyUntil: string | null;
  repairWarrantyUntil: string | null;
  serviceCenter: { name: string; address: string; phone: string | null; workingHours: string | null } | null;
  canConfirmPickup: boolean;
  isDone: boolean;
  payment: { due: number; paid: number; refunded: number; balance: number };
  estimate: { id: string; status: EstimateStatus; validUntil: string; note: string | null; total: number; canRespond: boolean; lines: Array<Pick<EstimateLine, "id" | "kind" | "name" | "names" | "quantity" | "unitPrice" | "isOptional" | "isSelected">> } | null;
  timeline: Array<Pick<TimelineEvent, "key" | "kind" | "at" | "titleKey" | "params">>;
};

/** Public tracking page: opened from the SMS / receipt link or QR, no sign-in. The customer can also answer an estimate here. */
export function TrackPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const data = useQuery({
    queryKey: ["public", "track", token],
    enabled: Boolean(token),
    refetchInterval: 30_000,
    retry: false,
    queryFn: () => api<{ request: Track }>(`/api/public/track/${token}`),
  });
  const respond = useMutation({
    mutationFn: ({ action, estimateId, optional }: { action: "approve" | "decline"; estimateId: string; optional: string[] }) =>
      api<{ request: Track }>(`/api/public/track/${token}/estimate/${estimateId}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "approve" ? { selectedOptionalLineIds: optional } : { reason }),
      }),
    onSuccess: (result, vars) => {
      queryClient.setQueryData(["public", "track", token], result);
      notify(vars.action === "approve" ? t("portal.estimateApproved") : t("portal.estimateDeclined"));
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const confirmVisit = useMutation({
    mutationFn: () => api<{ request: Track }>(`/api/public/track/${token}/visit/confirm`, { method: "POST" }),
    onSuccess: (result) => {
      queryClient.setQueryData(["public", "track", token], result);
      notify(t("visit.confirmedNote"));
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const payLinks = useQuery({
    queryKey: ["public", "pay-links", token, data.data?.request.payment.balance],
    enabled: Boolean(token && (data.data?.request.payment.balance ?? 0) > 0),
    queryFn: () => api<PayLinks>(`/api/public/track/${token}/pay-links`),
  });

  const request = data.data?.request;
  const estimate = request?.estimate ?? null;
  const optionalIds = estimate?.lines.filter((line) => line.isOptional).map((line) => line.id) ?? [];
  const picked = chosen ?? estimate?.lines.filter((line) => line.isOptional && line.isSelected).map((line) => line.id) ?? [];
  const total = estimate ? estimate.lines.filter((line) => !line.isOptional || picked.includes(line.id)).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) : 0;

  return (
    <BrandChrome action={<Link to="/track" className="btn-rizo-ghost h-11">{t("track.another")}</Link>}>
      <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-16">
        {data.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner className="h-6 w-6" />
          </div>
        ) : !request ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
            <h1 className="text-xl font-extrabold">{t("track.notFoundTitle")}</h1>
            <p className="mt-2 text-sm text-neutral-500">{t("track.notFoundBody")}</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="font-mono text-xs font-bold tracking-wide text-neutral-400">{formatRequestId(request.displayId)}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1E293B]">{localizedName(request.product)}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={request.status} friendly />
                <span className="text-xs text-neutral-500">{t(`type.${request.type}`)} · {t(`location.${request.locationType}`)}</span>
              </div>
              {request.status === "rejected" && request.rejectionReason ? <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{t("portal.rejectedBecause", { reason: request.rejectionReason })}</p> : null}
              {request.eta ? <p className="mt-3 rounded-xl bg-[#FFF4E5] px-4 py-3 text-sm font-bold text-[#8A4B00]">{t("visit.eta", { minutes: request.eta.minutes })}</p> : null}
              {request.visit.canConfirm ? (
                <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">{t("visit.confirmAsk", { when: request.scheduledAt ? formatStamp(request.scheduledAt) : "" })}</p>
                  <button type="button" className="btn-rizo mt-2 h-11" disabled={confirmVisit.isPending} onClick={() => confirmVisit.mutate()}>
                    {confirmVisit.isPending ? <Spinner className="h-4 w-4" /> : null}
                    {t("visit.confirmButton")}
                  </button>
                </div>
              ) : null}
              {payLinks.data?.enabled ? (
                <div className="mt-3 rounded-xl bg-neutral-50 px-4 py-3">
                  <p className="text-sm font-semibold text-neutral-800">{t("pay.body", { amount: formatMoney(payLinks.data.amount) })}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {payLinks.data.payme ? <a href={payLinks.data.payme} target="_blank" rel="noreferrer" className="btn-rizo h-10">Payme</a> : null}
                    {payLinks.data.click ? <a href={payLinks.data.click} target="_blank" rel="noreferrer" className="btn-rizo-ghost h-10">Click</a> : null}
                  </div>
                </div>
              ) : null}
              {request.canConfirmPickup ? <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{t("track.readyForPickup")}</p> : null}
              <dl className="mt-4 grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2 text-sm">
                <dt className="text-neutral-500">{t("common.opened")}</dt>
                <dd className="font-semibold">{formatStamp(request.createdAt)}</dd>
                {request.scheduledAt ? (
                  <>
                    <dt className="text-neutral-500">{t("portal.visitTime")}</dt>
                    <dd className="font-semibold">{formatStamp(request.scheduledAt)}</dd>
                  </>
                ) : null}
                {request.dueBy ? (
                  <>
                    <dt className="text-neutral-500">{t("portal.dueBy")}</dt>
                    <dd className="font-semibold">{formatDate(request.dueBy.slice(0, 10))}</dd>
                  </>
                ) : null}
                {request.technicianFirstName ? (
                  <>
                    <dt className="text-neutral-500">{t("common.technician")}</dt>
                    <dd className="font-semibold">{request.technicianFirstName}</dd>
                  </>
                ) : null}
                {request.serviceCenter ? (
                  <>
                    <dt className="text-neutral-500">{t("centers.center")}</dt>
                    <dd className="font-semibold">
                      {request.serviceCenter.name}
                      <span className="block text-xs font-normal text-neutral-500">
                        {request.serviceCenter.address}
                        {request.serviceCenter.workingHours ? ` · ${request.serviceCenter.workingHours}` : ""}
                        {request.serviceCenter.phone ? ` · ${request.serviceCenter.phone}` : ""}
                      </span>
                    </dd>
                  </>
                ) : null}
                {request.warrantyUntil ? (
                  <>
                    <dt className="text-neutral-500">{t("sales.warrantyUntil")}</dt>
                    <dd className="font-semibold">{formatDate(request.warrantyUntil)}</dd>
                  </>
                ) : null}
                {request.repairWarrantyUntil ? (
                  <>
                    <dt className="text-neutral-500">{t("portal.repairWarranty")}</dt>
                    <dd className="font-semibold">{formatDate(request.repairWarrantyUntil)}</dd>
                  </>
                ) : null}
                {request.payment.due > 0 ? (
                  <>
                    <dt className="text-neutral-500">{t("portal.toPay")}</dt>
                    <dd className="font-semibold">
                      {formatMoney(request.payment.due)}
                      {request.payment.balance > 0 && request.payment.paid > 0 ? <span className="ml-1 text-red-700">· {t("payments.balance")}: {formatMoney(request.payment.balance)}</span> : null}
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>

            {estimate ? (
              <section className={`mt-4 rounded-2xl border p-5 ${estimate.canRespond ? "border-[#F7941E] bg-[#FFF4E5]/60" : "border-neutral-200 bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-extrabold tracking-wide text-neutral-800 uppercase">{t("portal.estimateTitle")}</h2>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold ring-1 ring-neutral-200">{t(`estimate.status.${estimate.status}`)}</span>
                </div>
                {estimate.canRespond ? <p className="mt-2 text-sm font-semibold text-[#8A4B00]">{t("portal.estimateAsk", { date: formatStamp(estimate.validUntil) })}</p> : null}
                {estimate.note ? <p className="mt-2 text-sm text-neutral-700">{estimate.note}</p> : null}
                <ul className="mt-3 divide-y divide-neutral-200/70 text-sm">
                  {estimate.lines.map((line) => (
                    <li key={line.id} className={`flex items-center justify-between gap-3 py-2 ${estimate.status === "approved" && !line.isSelected ? "text-neutral-400 line-through" : ""}`}>
                      <label className="flex min-w-0 items-center gap-2">
                        {line.isOptional && estimate.canRespond ? (
                          <input type="checkbox" checked={picked.includes(line.id)} onChange={(event) => setChosen(event.target.checked ? [...picked, line.id] : picked.filter((id) => id !== line.id))} />
                        ) : null}
                        <span>
                          {line.names ? localizedName(line.names) : line.name}
                          {line.quantity > 1 ? <span className="text-neutral-500"> × {line.quantity}</span> : null}
                          {line.isOptional ? <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-600 uppercase">{t("estimate.optional")}</span> : null}
                        </span>
                      </label>
                      <span className="shrink-0 font-semibold tabular-nums">{formatMoney(line.quantity * line.unitPrice)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex justify-between text-base font-extrabold">
                  <span>{t("estimate.total")}</span>
                  <span>{formatMoney(estimate.canRespond ? total : estimate.total)}</span>
                </p>
                {estimate.canRespond ? (
                  <div className="mt-4 space-y-2">
                    {declining ? (
                      <>
                        <input className={portalInputClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("portal.declineReason")} />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setDeclining(false)} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-white text-sm font-bold ring-1 ring-neutral-200">
                            {t("common.cancel")}
                          </button>
                          <button type="button" disabled={respond.isPending} onClick={() => respond.mutate({ action: "decline", estimateId: estimate.id, optional: optionalIds })} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-red-600 text-sm font-extrabold text-white disabled:opacity-50">
                            {t("portal.decline")}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setDeclining(true)} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-white text-sm font-bold text-red-700 ring-1 ring-red-200">
                          {t("portal.decline")}
                        </button>
                        <button type="button" disabled={respond.isPending} onClick={() => respond.mutate({ action: "approve", estimateId: estimate.id, optional: picked })} className="inline-flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-[#7B00E0] text-sm font-extrabold text-white disabled:opacity-50">
                          {respond.isPending ? <Spinner className="h-4 w-4" /> : null}
                          {t("portal.approve", { amount: formatMoney(total) })}
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-neutral-500">{t("portal.estimateFine")}</p>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
              <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("detail.timeline")}</h2>
              <div className="mt-4">
                <RequestTimeline events={request.timeline.map((event) => ({ ...event, title: event.key, detail: null, params: event.params ?? undefined })) as TimelineEvent[]} />
              </div>
            </section>
            <p className="mt-4 text-center text-xs text-neutral-400">{t("track.footer")}</p>
          </>
        )}
      </div>
    </BrandChrome>
  );
}
