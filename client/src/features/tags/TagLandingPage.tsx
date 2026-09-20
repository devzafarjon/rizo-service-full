import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { PriorityBadge, StatusBadge, TypeBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatPhone, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { ServiceRequest } from "../../lib/types";

export function TagLandingPage() {
  const { t } = useTranslation();
  const { displayId } = useParams();
  const { token, user } = useStaffAuth();
  const detail = useQuery({
    queryKey: ["staff", "tags", displayId],
    enabled: Boolean(token && displayId),
    queryFn: () =>
      api<{ request: ServiceRequest; ownedByMe: boolean }>(`/api/staff/tags/${encodeURIComponent(displayId!)}`, { token }),
  });

  if (detail.isLoading) return <PageSkeleton />;
  const request = detail.data?.request;
  if (!request) return <EmptyState title={t("detail.notFoundTitle")} body={t("detail.notFoundBody")} />;

  const completeTo = `/app/my-jobs/${request.id}/complete`;
  const adminTo = `/app/requests/${request.id}`;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="font-mono text-xs font-bold text-neutral-400">{formatRequestId(request.displayId)}</p>
      <h1 className="mt-1 text-2xl font-extrabold">{request.customer.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {localizedName(request.product)} · {formatPhone(request.customer.phone)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <TypeBadge type={request.type} />
        <StatusBadge status={request.status} />
        <PriorityBadge priority={request.priority} />
      </div>
      <p className="mt-4 text-sm text-neutral-700">{request.issueDescription}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {user?.role === "admin" ? (
          <Link to={adminTo} className="inline-flex h-11 items-center rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white">
            {t("tag.openDetail")}
          </Link>
        ) : detail.data?.ownedByMe ? (
          <Link to={completeTo} className="inline-flex h-11 items-center rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white">
            {t("tag.openJob")}
          </Link>
        ) : (
          <p className="text-sm font-semibold text-amber-700">{t("tag.notYours")}</p>
        )}
      </div>
    </div>
  );
}
