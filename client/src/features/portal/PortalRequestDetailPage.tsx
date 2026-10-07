import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Link2, Truck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { LocationBadge, StatusBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { PickupConfirm } from "../../components/PickupConfirm";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatDateTime, formatMoney, formatRequestId, formatStamp } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { PortalEstimate, PortalRequest } from "../../lib/types";
import { FeedbackForm } from "./FeedbackForm";
import { PayCard, VisitCard } from "./VisitCard";
import { portalInputClass, portalTextareaClass } from "./fields";

function EstimateCard({ requestId, estimate, onDone }: { requestId: string; estimate: PortalEstimate; onDone: () => void }) {
  const { t } = useTranslation();
  const { token } = useCustomerAuth();
  const { notify } = useToast();
  const lines = estimate.lines ?? [];
  const [chosen, setChosen] = useState<string[]>(lines.filter((line) => line.isOptional && line.isSelected).map((line) => line.id));
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const total = lines.filter((line) => !line.isOptional || chosen.includes(line.id)).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  const respond = useMutation({
    mutationFn: (action: "approve" | "decline") =>
      api(`/api/customer/requests/${requestId}/estimates/${estimate.id}/${action}`, {
        method: "POST",
        token,
        body: JSON.stringify(action === "approve" ? { selectedOptionalLineIds: chosen } : { reason }),
      }),
    onSuccess: (_data, action) => {
      notify(action === "approve" ? t("portal.estimateApproved") : t("portal.estimateDeclined"));
      onDone();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  return (
    <section className={`mt-4 rounded-2xl border p-5 ${estimate.canRespond ? "border-[#F7941E] bg-[#FFF4E5]/60" : "border-neutral-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-extrabold tracking-wide text-neutral-800 uppercase">{t("portal.estimateTitle")}</h2>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-neutral-700 ring-1 ring-neutral-200">{t(`estimate.status.${estimate.status}`)}</span>
      </div>
      {estimate.canRespond ? <p className="mt-2 text-sm font-semibold text-[#8A4B00]">{t("portal.estimateAsk", { date: formatStamp(estimate.validUntil) })}</p> : null}
      {estimate.note ? <p className="mt-2 text-sm text-neutral-700">{estimate.note}</p> : null}
      <ul className="mt-3 divide-y divide-neutral-200/70 text-sm">
        {lines.map((line) => {
          const on = !line.isOptional || chosen.includes(line.id) || (estimate.status === "approved" && line.isSelected);
          return (
            <li key={line.id} className="flex items-center justify-between gap-3 py-2">
              <label className="flex min-w-0 items-center gap-2">
                {line.isOptional && estimate.canRespond ? (
                  <input type="checkbox" checked={chosen.includes(line.id)} onChange={(event) => setChosen(event.target.checked ? [...chosen, line.id] : chosen.filter((id) => id !== line.id))} />
                ) : null}
                <span className={`min-w-0 ${on ? "" : "text-neutral-400 line-through"}`}>
                  {line.names ? localizedName(line.names) : line.name}
                  {line.quantity > 1 ? <span className="text-neutral-500"> × {line.quantity}</span> : null}
                  {line.isOptional ? <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-600 uppercase">{t("estimate.optional")}</span> : null}
                </span>
              </label>
              <span className="shrink-0 font-semibold tabular-nums">{formatMoney(line.quantity * line.unitPrice)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex justify-between text-base font-extrabold">
        <span>{t("estimate.total")}</span>
        <span>{formatMoney(estimate.canRespond ? total : (estimate.total ?? total))}</span>
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
                <button type="button" disabled={respond.isPending} onClick={() => respond.mutate("decline")} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-red-600 text-sm font-extrabold text-white disabled:opacity-50">
                  {t("portal.decline")}
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeclining(true)} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-white text-sm font-bold text-red-700 ring-1 ring-red-200">
                {t("portal.decline")}
              </button>
              <button type="button" disabled={respond.isPending} onClick={() => respond.mutate("approve")} className="inline-flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-[#7B00E0] text-sm font-extrabold text-white disabled:opacity-50">
                {respond.isPending ? <Spinner className="h-4 w-4" /> : null}
                {t("portal.approve", { amount: formatMoney(total) })}
              </button>
            </div>
          )}
          <p className="text-xs text-neutral-500">{t("portal.estimateFine")}</p>
        </div>
      ) : null}
    </section>
  );
}

export function PortalRequestDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useCustomerAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const detail = useQuery({
    queryKey: ["customer", "requests", id],
    enabled: Boolean(token && id),
    queryFn: () => api<{ request: PortalRequest }>(`/api/customer/requests/${id}`, { token }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["customer"] });
  const pickup = useMutation({
    mutationFn: (signature: string | null) =>
      api(`/api/customer/requests/${id}/pickup`, { method: "POST", token, body: JSON.stringify({ signature }) }),
    onSuccess: async () => {
      notify(t("pickup.saved"));
      await refresh();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const send = useMutation({
    mutationFn: (text: string) => api(`/api/customer/requests/${id}/comments`, { method: "POST", token, body: JSON.stringify({ text }) }),
    onSuccess: async () => {
      setMessage("");
      await refresh();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (detail.isLoading) {
    return <PageSkeleton />;
  }

  const request = detail.data?.request;
  if (!request) {
    return <EmptyState title={t("portal.notFoundTitle")} body={t("portal.notFoundBody")} />;
  }
  const trackUrl = `${window.location.origin}/t/${request.trackingToken}`;

  return (
    <div>
      <Link to="/portal" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-[#7B00E0]">
        <ArrowLeft size={16} />
        {t("nav.myRequests")}
      </Link>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="font-mono text-xs font-bold tracking-wide text-neutral-400">{formatRequestId(request.displayId)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{localizedName(request.product)}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {request.product.sku}
          {request.serialNumber ? ` · ${t("serial.label")}: ${request.serialNumber}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <TypeBadge type={request.type} />
          <StatusBadge status={request.status} friendly />
          <WarrantyBadge status={request.warrantyStatus} />
          <LocationBadge type={request.locationType} />
        </div>
        <p className="mt-4 text-sm text-neutral-700">{request.issueDescription}</p>
      </div>

      {request.enRouteAt ? (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-[#FFF4E5] px-4 py-3 text-sm font-bold text-[#8A4B00]">
          <Truck size={18} />
          {t("portal.technicianOnTheWay", { name: request.assignedTechnician?.name ?? "" })}
        </p>
      ) : null}
      <VisitCard request={request} onChanged={refresh} />
      <PayCard request={request} urlBase={`/api/customer/requests/${request.id}`} />
      {request.status === "rejected" && request.rejectionReason ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{t("portal.rejectedBecause", { reason: request.rejectionReason })}</p>
      ) : null}
      {request.status === "awaiting_parts" ? <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{t("portal.waitingParts")}</p> : null}

      {request.estimate ? <EstimateCard key={`${request.estimate.id}-${request.estimate.status}`} requestId={request.id} estimate={request.estimate} onDone={refresh} /> : null}

      <dl className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 text-sm">
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2">
          <dt className="text-neutral-500">{t("common.opened")}</dt>
          <dd className="font-semibold">{formatDateTime(request.createdAt)}</dd>
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
          <dt className="text-neutral-500">{t("common.completed")}</dt>
          <dd className="font-semibold">{request.completedAt ? formatDateTime(request.completedAt) : t("common.dash")}</dd>
          <dt className="text-neutral-500">{t("common.technician")}</dt>
          <dd className="font-semibold">{request.assignedTechnician?.name ?? t("portal.waitingAssignment")}</dd>
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
          {request.sale ? (
            <>
              <dt className="text-neutral-500">{t("common.invoice")}</dt>
              <dd className="font-semibold">
                {request.sale.invoiceNumber} · {request.sale.warrantyStatus === "in_warranty" ? t("portal.inWarrantyUntil") : t("portal.expired")}{" "}
                {formatDate(request.sale.warrantyExpiry)}
              </dd>
            </>
          ) : null}
          {request.repairWarrantyUntil ? (
            <>
              <dt className="text-neutral-500">{t("portal.repairWarranty")}</dt>
              <dd className="font-semibold">{t("portal.repairWarrantyUntil", { date: formatDate(request.repairWarrantyUntil) })}</dd>
            </>
          ) : null}
          {request.payment.due > 0 ? (
            <>
              <dt className="text-neutral-500">{t("portal.toPay")}</dt>
              <dd className="font-semibold">
                {formatMoney(request.payment.due)}
                {request.payment.paid > 0 ? <span className="text-neutral-500"> · {t("payments.paid")}: {formatMoney(request.payment.paid)}</span> : null}
                {request.payment.balance > 0 ? <span className="ml-1 text-red-700">· {t("payments.balance")}: {formatMoney(request.payment.balance)}</span> : null}
              </dd>
            </>
          ) : null}
        </div>
      </dl>

      {request.canConfirmPickup ? (
        <div className="mt-4">
          <PickupConfirm audience="customer" pending={pickup.isPending} onConfirm={(signature) => pickup.mutateAsync(signature)} />
        </div>
      ) : request.pickupConfirmedAt && request.locationType === "in_shop" ? (
        <p className="mt-4 text-sm font-bold text-emerald-700">{t("pickup.already")}</p>
      ) : null}

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("portal.messages")}</h2>
        {request.messages.length === 0 ? <p className="mt-3 text-sm text-neutral-500">{t("portal.noMessages")}</p> : null}
        <ul className="mt-3 space-y-2">
          {request.messages.map((item) => (
            <li key={item.id} className={`rounded-2xl px-4 py-3 text-sm ${item.fromCustomer ? "ml-8 bg-[#F5EBFD]" : "mr-8 bg-neutral-100"}`}>
              <p className="whitespace-pre-wrap">{item.text}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {item.fromCustomer ? t("portal.you") : t("portal.service")} · {formatStamp(item.createdAt)}
              </p>
            </li>
          ))}
        </ul>
        {request.status !== "cancelled" ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (message.trim()) send.mutate(message.trim());
            }}
          >
            <textarea className={`${portalTextareaClass} min-h-20`} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} placeholder={t("portal.messagePlaceholder")} />
            <button type="submit" disabled={send.isPending || !message.trim()} className="btn-rizo-sm w-full disabled:opacity-50">
              {send.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t("portal.sendMessage")}
            </button>
          </form>
        ) : null}
      </section>

      <div className="mt-4">
        <FeedbackForm request={request} />
      </div>

      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(trackUrl).then(() => notify(t("detail.linkCopied")))}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-neutral-100 text-sm font-bold text-neutral-700"
      >
        <Link2 size={16} />
        {t("portal.shareLink")}
      </button>
    </div>
  );
}
