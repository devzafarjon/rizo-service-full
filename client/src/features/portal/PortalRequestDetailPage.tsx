import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { LocationBadge, StatusBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api } from "../../lib/api";
import { formatDate, formatDateTime, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { PortalRequest } from "../../lib/types";
import { FeedbackForm } from "./FeedbackForm";

export function PortalRequestDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useCustomerAuth();
  const detail = useQuery({
    queryKey: ["customer", "requests", id],
    enabled: Boolean(token && id),
    queryFn: () => api<{ request: PortalRequest }>(`/api/customer/requests/${id}`, { token }),
  });

  if (detail.isLoading) {
    return <PageSkeleton />;
  }

  const request = detail.data?.request;
  if (!request) {
    return <EmptyState title={t("portal.notFoundTitle")} body={t("portal.notFoundBody")} />;
  }

  return (
    <div>
      <Link to="/portal" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-[#B439FD]">
        <ArrowLeft size={16} />
        {t("nav.myRequests")}
      </Link>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="font-mono text-xs font-bold tracking-wide text-neutral-400">{formatRequestId(request.displayId)}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{localizedName(request.product)}</h1>
        <p className="mt-1 text-sm text-neutral-500">{request.product.sku}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <TypeBadge type={request.type} />
          <StatusBadge status={request.status} />
          <WarrantyBadge status={request.warrantyStatus} />
          <LocationBadge type={request.locationType} />
        </div>
        <p className="mt-4 text-sm text-neutral-700">{request.issueDescription}</p>
      </div>

      <dl className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 text-sm">
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-y-2">
          <dt className="text-neutral-500">{t("common.opened")}</dt>
          <dd className="font-semibold">{formatDateTime(request.createdAt)}</dd>
          <dt className="text-neutral-500">{t("common.completed")}</dt>
          <dd className="font-semibold">{request.completedAt ? formatDateTime(request.completedAt) : t("common.dash")}</dd>
          <dt className="text-neutral-500">{t("common.technician")}</dt>
          <dd className="font-semibold">{request.assignedTechnician?.name ?? t("portal.waitingAssignment")}</dd>
          {request.sale ? (
            <>
              <dt className="text-neutral-500">{t("common.invoice")}</dt>
              <dd className="font-semibold">
                {request.sale.invoiceNumber} · {request.sale.warrantyStatus === "in_warranty" ? t("portal.inWarrantyUntil") : t("portal.expired")}{" "}
                {formatDate(request.sale.warrantyExpiry)}
              </dd>
            </>
          ) : null}
        </div>
      </dl>

      <div className="mt-4">
        <FeedbackForm request={request} />
      </div>
    </div>
  );
}
