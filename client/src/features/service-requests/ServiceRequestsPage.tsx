import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LocationBadge, PriorityBadge, StatusBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDateTime, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { RequestStatus, ServiceRequest, ServiceType } from "../../lib/types";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

const TYPE_FILTERS: Array<"" | ServiceType> = ["", "installation", "repair"];

const STATUS_FILTERS: Array<"" | RequestStatus> = ["", "scheduled", "received", "in_progress", "completed"];

export function ServiceRequestsPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | ServiceType>("");
  const [status, setStatus] = useState<"" | RequestStatus>("");
  const debounced = useDebouncedValue(q, 250);

  const list = useQuery({
    queryKey: ["staff", "requests", debounced, type, status],
    enabled: Boolean(token),
    queryFn: () => {
      const search = new URLSearchParams();
      if (debounced.trim()) search.set("q", debounced.trim());
      if (type) search.set("type", type);
      if (status) search.set("status", status);
      const suffix = search.toString() ? `?${search}` : "";
      return api<{ requests: ServiceRequest[] }>(`/api/staff/requests${suffix}`, { token });
    },
  });

  if (list.isLoading) {
    return <PageSkeleton />;
  }

  const requests = list.data?.requests ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("requests.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("requests.intro")}</p>
        </div>
        <Link
          to="/app/requests/new"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF]"
        >
          <Plus size={16} />
          {t("requests.new")}
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            className={`${inputClass} pl-10`}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t("requests.searchPlaceholder")}
          />
        </div>
        <select className={`${inputClass} sm:w-44`} value={type} onChange={(event) => setType(event.target.value as "" | ServiceType)}>
          {TYPE_FILTERS.map((item) => (
            <option key={item || "all-types"} value={item}>
              {item ? t(`type.${item}`) : t("requests.allTypes")}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} sm:w-44`}
          value={status}
          onChange={(event) => setStatus(event.target.value as "" | RequestStatus)}
        >
          {STATUS_FILTERS.map((item) => (
            <option key={item || "all-statuses"} value={item}>
              {item ? t(`status.${item}`) : t("requests.allStatuses")}
            </option>
          ))}
        </select>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          title={t("requests.emptyTitle")}
          body={t("requests.emptyBody")}
          action={
            <Link to="/app/requests/new" className="inline-flex h-11 items-center rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white">
              {t("requests.new")}
            </Link>
          }
        />
      ) : (
        <SurfaceTable>
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>{t("common.requestId")}</Th>
              <Th>{t("common.customer")}</Th>
              <Th>{t("common.type")}</Th>
              <Th>{t("common.product")}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{t("common.warranty")}</Th>
              <Th>{t("common.technician")}</Th>
              <Th>{t("common.created")}</Th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                <Td>
                  <Link to={`/app/requests/${request.id}`} className="font-semibold text-[#B439FD] hover:underline">
                    {formatRequestId(request.displayId)}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <LocationBadge type={request.locationType} />
                    <PriorityBadge priority={request.priority} />
                    {request.submittedByCustomer ? (
                      <span className="inline-flex rounded-full bg-[#FFF4E5] px-2.5 py-1 text-xs font-bold text-[#C56A00]">
                        {t("requests.customerChip")}
                      </span>
                    ) : null}
                  </div>
                </Td>
                <Td>
                  <Link to={`/app/customers/${request.customer.id}`} className="font-medium hover:text-[#B439FD]">
                    {request.customer.name}
                  </Link>
                </Td>
                <Td>
                  <TypeBadge type={request.type} />
                </Td>
                <Td>
                  {localizedName(request.product)}
                  <p className="text-xs text-neutral-500">{request.product.sku}</p>
                </Td>
                <Td>
                  <StatusBadge status={request.status} />
                </Td>
                <Td>
                  <WarrantyBadge status={request.warrantyStatus} />
                </Td>
                <Td>{request.assignedTechnician?.name ?? t("common.unassigned")}</Td>
                <Td>{formatDateTime(request.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}
    </div>
  );
}
