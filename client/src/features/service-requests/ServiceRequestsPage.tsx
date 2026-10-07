import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "../../components/toast";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDateTime, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { ALL_STATUSES } from "../../lib/status";
import type { Priority, RequestStatus, ServiceRequest, ServiceType, TechnicianSummary } from "../../lib/types";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

const TYPE_FILTERS: Array<"" | ServiceType> = ["", "installation", "repair"];

const STATUS_FILTERS: Array<"" | RequestStatus> = ["", ...ALL_STATUSES];

export function ServiceRequestsPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [technicianId, setTechnicianId] = useState("");
  const [priority, setPriority] = useState<"" | Priority>("");
  const canBulk = user?.role === "admin" || user?.role === "receptionist";
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

  const technicians = useQuery({
    queryKey: ["staff", "technicians"],
    enabled: Boolean(token && canBulk && selected.length > 0),
    queryFn: () => api<{ technicians: TechnicianSummary[] }>("/api/staff/technicians", { token }),
  });
  const bulk = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ ok: string[]; failed: Array<{ id: string; code: string }> }>("/api/staff/requests/bulk", { method: "POST", token, body: JSON.stringify({ ids: selected, ...body }) }),
    onSuccess: async (result) => {
      notify(result.failed.length > 0 ? t("requests.bulkPartial", { ok: result.ok.length, failed: result.failed.length }) : t("requests.bulkDone", { count: result.ok.length }), result.failed.length > 0 ? "error" : "success");
      setSelected(result.failed.map((row) => row.id));
      setTechnicianId("");
      setPriority("");
      await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "technicians"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (list.isLoading) {
    return <PageSkeleton />;
  }

  const requests = list.data?.requests ?? [];
  const allSelected = requests.length > 0 && requests.every((row) => selected.includes(row.id));
  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("requests.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("requests.intro")}</p>
        </div>
        <Link
          to="/app/requests/new"
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white hover:bg-[#6500BD]"
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

      {canBulk && selected.length > 0 ? (
        <div className="sticky top-[4.5rem] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-[#E0CDF2] bg-[#F5EBFD] px-4 py-3 shadow-sm">
          <span className="text-sm font-bold text-[#4B0089]">{t("requests.selected", { count: selected.length })}</span>
          <select className={`${inputClass} h-10 w-auto min-w-40`} value={technicianId} onChange={(event) => setTechnicianId(event.target.value)} aria-label={t("common.technician")}>
            <option value="">{t("requests.pickTechnician")}</option>
            <option value="none">{t("common.unassigned")}</option>
            {(technicians.data?.technicians ?? []).map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-rizo-ghost h-10" disabled={!technicianId || bulk.isPending} onClick={() => bulk.mutate({ action: "assign", technicianId: technicianId === "none" ? null : technicianId })}>
            {t("requests.assign")}
          </button>
          <select className={`${inputClass} h-10 w-auto min-w-36`} value={priority} onChange={(event) => setPriority(event.target.value as "" | Priority)} aria-label={t("common.priority")}>
            <option value="">{t("requests.pickPriority")}</option>
            {(["low", "medium", "high", "urgent"] as const).map((item) => (
              <option key={item} value={item}>
                {t(`priority.${item}`)}
              </option>
            ))}
          </select>
          <button type="button" className="btn-rizo-ghost h-10" disabled={!priority || bulk.isPending} onClick={() => bulk.mutate({ action: "priority", priority })}>
            {t("requests.setPriority")}
          </button>
          <button type="button" className="h-10 rounded-lg px-3 text-sm font-bold text-red-700 hover:bg-red-50" disabled={bulk.isPending} onClick={() => window.confirm(t("requests.bulkCancelConfirm", { count: selected.length })) && bulk.mutate({ action: "cancel" })}>
            {t("common.cancel")}
          </button>
          <button type="button" className="ml-auto text-sm font-semibold text-neutral-600 hover:underline" onClick={() => setSelected([])}>
            {t("requests.clearSelection")}
          </button>
        </div>
      ) : null}

      {requests.length === 0 ? (
        <EmptyState
          title={t("requests.emptyTitle")}
          body={t("requests.emptyBody")}
          action={
            <Link to="/app/requests/new" className="inline-flex h-12 items-center rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
              {t("requests.new")}
            </Link>
          }
        />
      ) : (
        <SurfaceTable>
          <thead>
            <tr className="border-b border-neutral-100">
              {canBulk ? (
                <Th>
                  <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : requests.map((row) => row.id))} aria-label={t("requests.selectAll")} />
                </Th>
              ) : null}
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
                {canBulk ? (
                  <Td>
                    <input type="checkbox" checked={selected.includes(request.id)} onChange={() => toggle(request.id)} aria-label={formatRequestId(request.displayId)} />
                  </Td>
                ) : null}
                <Td>
                  <Link to={`/app/requests/${request.id}`} className="font-semibold text-[#7B00E0] hover:underline">
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
                  <Link to={`/app/customers/${request.customer.id}`} className="font-medium hover:text-[#7B00E0]">
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
