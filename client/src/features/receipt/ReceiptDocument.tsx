import { useTranslation } from "react-i18next";
import { RizoLogo } from "../../components/RizoLogo";
import { TypeBadge, WarrantyBadge } from "../../components/Badges";
import { formatMoney, formatPhone, formatRequestId, formatStamp } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { statusLabel } from "../../lib/status";
import type { JobCost, JobExtraExpense, JobPartLine, JobServiceLine, ServiceRequest } from "../../lib/types";

export function ReceiptDocument({
  request,
  serviceLines,
  partLines,
  extraExpenses,
  cost,
  issuedBy,
  disclaimer,
}: {
  request: ServiceRequest;
  serviceLines: JobServiceLine[];
  partLines: JobPartLine[];
  extraExpenses: JobExtraExpense[];
  cost: JobCost;
  issuedBy: string;
  disclaimer: string;
}) {
  const { t } = useTranslation();
  const receiptNo = formatRequestId(request.displayId);
  const serviceDate = request.completedAt ?? request.createdAt;
  const hasLines = serviceLines.length + partLines.length + extraExpenses.length > 0;

  return (
    <article className="receipt-sheet mx-auto w-full max-w-[44rem] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
      <header className="relative bg-[#B439FD] px-6 py-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white px-2 py-1">
              <RizoLogo className="h-8 w-auto" />
            </div>
            <div>
              <p className="font-display text-lg font-extrabold tracking-tight">{t("brand.service")}</p>
              <p className="text-xs font-semibold tracking-wide text-white/80 uppercase">{t("receipt.afterSales")}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold tracking-wide text-white/70 uppercase">{t("receipt.kicker")}</p>
            <p className="font-display text-xl font-extrabold tabular-nums">{receiptNo}</p>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#F6921E]" />
      </header>

      <div className="px-6 py-5">
        <div className="flex flex-wrap gap-2">
          <TypeBadge type={request.type} />
          <WarrantyBadge status={request.warrantyStatus} />
          <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-700">
            {statusLabel(request.status)}
          </span>
        </div>

        <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Meta label={t("common.requestId")} value={formatRequestId(request.displayId)} mono />
          <Meta label={t("receipt.serviceDate")} value={formatStamp(serviceDate)} />
          <Meta label={t("receipt.issuedBy")} value={issuedBy} />
          <Meta label={t("common.technician")} value={request.assignedTechnician?.name ?? t("common.unassigned")} />
          <Meta label={t("common.customer")} value={`${request.customer.name} · ${formatPhone(request.customer.phone)}`} />
          <Meta label={t("common.product")} value={`${localizedName(request.product)} · ${request.product.sku}`} />
        </dl>
      </div>

      <div className="px-6 pb-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-neutral-200 bg-[#FAFAFA] text-left text-[11px] font-bold tracking-wide text-neutral-500 uppercase">
              <th className="px-3 py-2 font-bold">{t("common.item")}</th>
              <th className="px-3 py-2 font-bold">{t("common.qty")}</th>
              <th className="px-3 py-2 text-right font-bold">{t("common.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {serviceLines.map((line) => (
              <LineRow key={line.id} name={localizedName(line)} qty={1} amount={line.priceAtTime} tag={t("receipt.serviceTag")} />
            ))}
            {partLines.map((line) => (
              <LineRow key={line.id} name={localizedName(line)} qty={line.quantity} amount={line.lineTotal} tag={t("receipt.partTag")} />
            ))}
            {extraExpenses.map((line) => (
              <LineRow key={line.id} name={line.description} qty={1} amount={line.price} tag={t("receipt.extraTag")} />
            ))}
            {!hasLines ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-neutral-500">
                  {t("receipt.emptyLines")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="mt-4 flex flex-col items-end gap-1">
          {cost.coveredByWarranty ? (
            <p className="text-xs font-semibold text-neutral-500">
              {t("receipt.workValueCovered", { amount: formatMoney(cost.workTotal) })}
            </p>
          ) : null}
          <p
            className={`rounded-xl px-4 py-3 text-right font-display text-xl font-extrabold ${
              cost.coveredByWarranty ? "bg-emerald-50 text-emerald-800" : "bg-[#FFF4E5] text-[#C56A00]"
            }`}
          >
            {t("receipt.totalDue", { amount: formatMoney(cost.chargedTotal) })}
          </p>
        </div>
      </div>

      <footer className="border-t border-neutral-200 px-6 py-5">
        <p className="text-[11px] font-bold tracking-wide text-[#B439FD] uppercase">{t("receipt.disclaimer")}</p>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-600">{disclaimer}</p>
        <p className="mt-4 text-xs font-semibold text-neutral-400">{t("receipt.thanks")}</p>
      </footer>
    </article>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{label}</dt>
      <dd className={`mt-0.5 font-semibold text-neutral-900 ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function LineRow({ name, qty, amount, tag }: { name: string; qty: number; amount: number; tag: string }) {
  return (
    <tr className="border-b border-neutral-100">
      <td className="px-3 py-2.5">
        <span className="mr-2 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-neutral-500 uppercase">
          {tag}
        </span>
        {name}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-neutral-600">{qty}</td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatMoney(amount)}</td>
    </tr>
  );
}
