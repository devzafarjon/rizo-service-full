import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { StatusBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDate, formatDateTime, formatMoney, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { Named, RequestStatus, ServiceType, WarrantyStatus } from "../../lib/types";

type SerialPayload = {
  serial: string;
  sales: Array<{
    id: string;
    invoiceNumber: string;
    saleDate: string;
    installationDate: string | null;
    warrantyExpiry: string;
    warrantyStatus: WarrantyStatus;
    warrantyMonths: number;
    voided: boolean;
    voidReason: string | null;
    isVerified: boolean;
    source: string;
    pricePaid: number;
    customer: { id: string; name: string; phone: string };
    product: Named & { id: string; sku: string };
  }>;
  requests: Array<{ id: string; displayId: string; type: ServiceType; status: RequestStatus; createdAt: string; completedAt: string | null; isRepeat: boolean; issueDescription: string; finalCost: number | null; customer: { id: string; name: string }; product: Named & { id: string } }>;
  summary: { repairs: number; repeats: number };
};

/** One page per physical unit: owner, warranty, and every visit to the service. */
export function SerialCardPage() {
  const { t } = useTranslation();
  const { serial } = useParams();
  const { token } = useStaffAuth();
  const card = useQuery({
    queryKey: ["staff", "serial", serial],
    enabled: Boolean(token && serial),
    queryFn: () => api<SerialPayload>(`/api/staff/serials/${encodeURIComponent(serial ?? "")}`, { token }),
    retry: false,
  });

  if (card.isLoading) return <PageSkeleton />;
  const data = card.data;
  if (!data) return <EmptyState title={t("serial.notFoundTitle")} body={t("serial.notFoundBody")} />;

  return (
    <div>
      <Link to="/app/requests" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-[#7B00E0]">
        <ArrowLeft size={16} />
        {t("common.allRequests")}
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">
        {t("serial.card")} <span className="font-mono">{data.serial}</span>
      </h1>
      <p className="mt-1 text-sm text-neutral-500">{t("serial.summary", { repairs: data.summary.repairs, repeats: data.summary.repeats })}</p>

      {data.sales.length === 0 ? <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{t("serial.noSale")}</p> : null}
      {data.sales.map((sale) => (
        <section key={sale.id} className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold">{localizedName(sale.product)}</h2>
              <p className="text-sm text-neutral-500">
                {sale.product.sku} · {sale.invoiceNumber} · <Link to={`/app/customers/${sale.customer.id}`} className="font-semibold text-[#7B00E0] hover:underline">{sale.customer.name}</Link>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <WarrantyBadge status={sale.warrantyStatus} />
              {sale.voided ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{t("sales.voided")}</span> : null}
              {!sale.isVerified ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{t("sales.unverified")}</span> : null}
              <Link to={`/app/sales/${sale.id}/warranty-card`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-100 px-3 text-sm font-bold text-[#7B00E0]">
                <Printer size={14} />
                {t("sales.warrantyCard")}
              </Link>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              [t("sales.saleDate"), formatDate(sale.saleDate)],
              [t("sales.installedOn"), sale.installationDate ? formatDate(sale.installationDate) : t("common.dash")],
              [t("sales.warrantyMonths"), String(sale.warrantyMonths)],
              [t("sales.warrantyUntil"), formatDate(sale.warrantyExpiry)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-neutral-50 px-3 py-2">
                <dt className="text-[11px] font-bold tracking-wide text-neutral-500 uppercase">{label}</dt>
                <dd className="font-bold">{value}</dd>
              </div>
            ))}
          </dl>
          {sale.voidReason ? <p className="mt-3 text-sm font-semibold text-red-700">{t("sales.voidedBecause", { reason: sale.voidReason })}</p> : null}
        </section>
      ))}

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("serial.history")}</h2>
        {data.requests.length === 0 ? <p className="mt-3 text-sm text-neutral-500">{t("serial.noVisits")}</p> : null}
        <ul className="mt-3 divide-y divide-neutral-100">
          {data.requests.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div className="min-w-0">
                <Link to={`/app/requests/${request.id}`} className="font-mono text-xs font-bold text-[#7B00E0] hover:underline">
                  {formatRequestId(request.displayId)}
                </Link>
                <p className="truncate text-neutral-700">{request.issueDescription}</p>
                <p className="text-xs text-neutral-500">{formatDateTime(request.createdAt)}{request.finalCost != null ? ` · ${formatMoney(request.finalCost)}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={request.type} />
                <StatusBadge status={request.status} />
                {request.isRepeat ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{t("detail.repeat")}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
