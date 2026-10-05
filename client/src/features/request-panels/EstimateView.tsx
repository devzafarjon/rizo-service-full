import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney, formatStamp } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { Estimate, EstimateStatus } from "../../lib/types";
import { inputClass } from "../../components/Field";

const STATUS_TONE: Record<EstimateStatus, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sent: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  expired: "bg-neutral-100 text-neutral-500",
};

export function EstimateStatusChip({ status }: { status: EstimateStatus }) {
  const { t } = useTranslation();
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[status]}`}>{t(`estimate.status.${status}`)}</span>;
}

/** Read-only estimate with the office actions (record approval given in person, or a refusal). */
export function EstimateView({
  estimate,
  busy,
  onApproveForCustomer,
  onDecline,
}: {
  estimate: Estimate;
  busy?: boolean;
  onApproveForCustomer?: () => void;
  onDecline?: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const pending = estimate.status === "sent" || estimate.status === "draft";

  return (
    <div className="rounded-2xl border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EstimateStatusChip status={estimate.status} />
        <p className="text-xs text-neutral-500">
          {estimate.sentAt ? `${t("estimate.sentAt")} ${formatStamp(estimate.sentAt)} · ` : ""}
          {t("estimate.validUntil")} {formatStamp(estimate.validUntil)}
        </p>
      </div>
      <ul className="mt-3 divide-y divide-neutral-100 text-sm">
        {estimate.lines.map((line) => (
          <li key={line.id} className={`flex items-center justify-between gap-3 py-2 ${!line.isSelected && estimate.status === "approved" ? "text-neutral-400 line-through" : ""}`}>
            <span>
              {line.names ? localizedName(line.names) : line.name}
              {line.quantity > 1 ? <span className="text-neutral-400"> × {line.quantity}</span> : null}
              {line.isOptional ? <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600 uppercase">{t("estimate.optional")}</span> : null}
              {line.kind === "part" && estimate.status === "approved" && line.isSelected && !line.isFulfilled ? (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">{t("estimate.onOrder")}</span>
              ) : null}
            </span>
            <span className="shrink-0 font-semibold">{formatMoney(line.quantity * line.unitPrice)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex justify-between text-sm font-extrabold">
        <span>{t("estimate.total")}</span>
        <span>{formatMoney(estimate.total)}</span>
      </p>
      {estimate.note ? <p className="mt-2 text-sm text-neutral-600">{estimate.note}</p> : null}
      {estimate.approvedAt ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">
          {t("estimate.approvedAt", { when: formatStamp(estimate.approvedAt), by: estimate.approvedBy?.split(":")[1] ?? "" })}
        </p>
      ) : null}
      {estimate.declineReason ? <p className="mt-2 text-xs font-semibold text-red-700">{t("estimate.declinedBecause", { reason: estimate.declineReason })}</p> : null}

      {pending && (onApproveForCustomer || onDecline) ? (
        <div className="mt-4 space-y-2">
          {declining ? (
            <div className="flex gap-2">
              <input className={`${inputClass} min-w-0 flex-1`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("estimate.declineReason")} />
              <button type="button" disabled={busy} onClick={() => onDecline?.(reason)} className="h-12 rounded-lg bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-50">
                {t("estimate.decline")}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {onApproveForCustomer ? (
                <button type="button" disabled={busy} onClick={onApproveForCustomer} className="h-11 rounded-lg bg-[#7B00E0] px-4 text-sm font-bold text-white disabled:opacity-50">
                  {t("estimate.approveForCustomer")}
                </button>
              ) : null}
              {onDecline ? (
                <button type="button" onClick={() => setDeclining(true)} className="h-11 rounded-lg bg-red-50 px-4 text-sm font-bold text-red-700">
                  {t("estimate.declineForCustomer")}
                </button>
              ) : null}
            </div>
          )}
          <p className="text-xs text-neutral-500">{t("estimate.approveHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
