import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, MapPin, Plus, Search, Store } from "lucide-react";
import { useMemo, useState, type HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PriorityBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatRequestId, technicianTypeLabel } from "../../lib/format";
import { localizedName, nameSearchText } from "../../lib/localized";
import { columnsForType, isAllowedStatus, statusLabel } from "../../lib/status";
import type { Priority, RequestStatus, ServiceRequest, ServiceType, TechnicianSummary, WarrantyStatus } from "../../lib/types";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

const TYPE_TABS: Array<"" | ServiceType> = ["", "installation", "repair"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const WARRANTY_FILTERS: WarrantyStatus[] = ["in_warranty", "expired", "not_applicable"];

export function AdminKanbanPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | ServiceType>("");
  const [technicianId, setTechnicianId] = useState("");
  const [priority, setPriority] = useState<"" | Priority>("");
  const [warranty, setWarranty] = useState<"" | WarrantyStatus>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const debounced = useDebouncedValue(q, 250);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const board = useQuery({
    queryKey: ["staff", "requests", "board"],
    enabled: Boolean(token),
    queryFn: () => api<{ requests: ServiceRequest[] }>("/api/staff/requests", { token }),
  });
  const techniciansQuery = useQuery({
    queryKey: ["staff", "technicians"],
    enabled: Boolean(token),
    queryFn: () => api<{ technicians: TechnicianSummary[] }>("/api/staff/technicians", { token }),
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RequestStatus }) =>
      api<{ request: ServiceRequest }>(`/api/staff/requests/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ status }),
      }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["staff", "requests", "board"] });
      const previous = queryClient.getQueryData<{ requests: ServiceRequest[] }>(["staff", "requests", "board"]);
      queryClient.setQueryData<{ requests: ServiceRequest[] }>(["staff", "requests", "board"], (current) => {
        if (!current) return current;
        return {
          requests: current.requests.map((request) => (request.id === id ? { ...request, status } : request)),
        };
      });
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["staff", "requests", "board"], context.previous);
      }
      notify(apiErrorMessage(error, t), "error");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "technicians"] });
    },
  });

  const requests = board.data?.requests ?? [];
  const technicians = techniciansQuery.data?.technicians ?? [];
  const columns = columnsForType(type);

  const visible = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    return requests.filter((request) => {
      if (type && request.type !== type) return false;
      if (technicianId === "unassigned" && request.assignedTechnicianId) return false;
      if (technicianId && technicianId !== "unassigned" && request.assignedTechnicianId !== technicianId) return false;
      if (priority && request.priority !== priority) return false;
      if (warranty && request.warrantyStatus !== warranty) return false;
      if (overdueOnly && !request.isOverdue) return false;
      if (needle) {
        const haystack = `${request.customer.name} ${request.displayId} ${formatRequestId(request.displayId)} ${request.id} ${nameSearchText(request.product)}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [debounced, overdueOnly, priority, requests, technicianId, type, warranty]);

  const byStatus = useMemo(() => {
    const grouped: Record<string, ServiceRequest[]> = {};
    for (const column of columns) grouped[column] = [];
    for (const request of visible) {
      if (!grouped[request.status]) grouped[request.status] = [];
      grouped[request.status].push(request);
    }
    return grouped;
  }, [columns, visible]);

  const overdue = useMemo(
    () =>
      requests
        .filter((request) => request.isOverdue)
        .sort((a, b) => (a.overdueAt ?? "").localeCompare(b.overdueAt ?? "")),
    [requests],
  );

  const activeRequest = activeId ? requests.find((request) => request.id === activeId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const request = requests.find((item) => item.id === String(active.id));
    if (!request) return;
    const overId = String(over.id);
    const nextStatus = overId.startsWith("column:")
      ? (overId.slice(7) as RequestStatus)
      : requests.find((item) => item.id === overId)?.status;
    if (!nextStatus || nextStatus === request.status) return;
    if (!isAllowedStatus(request.type, nextStatus)) {
      notify(t("errors.statusNotInFlow", { type: t(`type.${request.type}`) }), "error");
      return;
    }
    move.mutate({ id: request.id, status: nextStatus });
  }

  if (board.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight">{t("kanban.title")}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t("common.live")}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">{t("kanban.intro")}</p>
        </div>
        <Link
          to="/app/requests/new"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF]"
        >
          <Plus size={16} />
          {t("nav.newRequest")}
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab || "all"}
            type="button"
            onClick={() => setType(tab)}
            className={`h-10 rounded-full px-4 text-sm font-bold ${
              type === tab ? "bg-[#B439FD] text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"
            }`}
          >
            {tab ? t(`type.${tab}`) : t("requests.allTypes")}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 xl:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input className={`${inputClass} bg-white pl-10`} value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("kanban.searchPlaceholder")} />
        </div>
        <select className={`${inputClass} bg-white xl:w-52`} value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>
          <option value="">{t("kanban.allTechnicians")}</option>
          <option value="unassigned">{t("common.unassigned")}</option>
          {technicians.map((tech) => (
            <option key={tech.id} value={tech.id}>
              {tech.name}
            </option>
          ))}
        </select>
        <select className={`${inputClass} bg-white xl:w-40`} value={priority} onChange={(event) => setPriority(event.target.value as "" | Priority)}>
          <option value="">{t("kanban.allPriorities")}</option>
          {PRIORITIES.map((item) => (
            <option key={item} value={item}>
              {t(`priority.${item}`)}
            </option>
          ))}
        </select>
        <select className={`${inputClass} bg-white xl:w-48`} value={warranty} onChange={(event) => setWarranty(event.target.value as "" | WarrantyStatus)}>
          <option value="">{t("kanban.allWarranty")}</option>
          {WARRANTY_FILTERS.map((item) => (
            <option key={item} value={item}>
              {t(`warranty.${item}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setOverdueOnly((value) => !value)}
          className={`h-11 rounded-xl px-4 text-sm font-bold ${overdueOnly ? "bg-rose-600 text-white" : "bg-white text-rose-700 ring-1 ring-rose-200"}`}
        >
          {t("kanban.overdue")} ({overdue.length})
        </button>
      </div>

      {overdue.length > 0 && !overdueOnly ? (
        <section className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <p className="mb-2 px-1 text-xs font-bold tracking-wide text-rose-700 uppercase">{t("kanban.overdueList")}</p>
          <div className="flex gap-2 overflow-x-auto">
            {overdue.map((request) => (
              <Link
                key={request.id}
                to={`/app/requests/${request.id}`}
                className="min-w-52 rounded-xl bg-white px-3 py-2 ring-1 ring-rose-100"
              >
                <p className="truncate text-sm font-bold">{request.customer.name}</p>
                <p className="text-xs text-rose-700">{formatRequestId(request.displayId)}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <AvailabilityPanel technicians={technicians} />

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((status) => (
            <KanbanColumn key={status} status={status} requests={byStatus[status] ?? []} />
          ))}
        </div>
        <DragOverlay>{activeRequest ? <RequestCard request={activeRequest} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function AvailabilityPanel({ technicians }: { technicians: TechnicianSummary[] }) {
  const { t } = useTranslation();
  return (
    <section className="mb-4 rounded-2xl border border-neutral-200 bg-white p-3">
      <p className="mb-2 px-1 text-xs font-bold tracking-wide text-neutral-500 uppercase">{t("kanban.technicians")}</p>
      <div className="flex gap-2 overflow-x-auto">
        {technicians.length === 0 ? <p className="px-1 text-sm text-neutral-500">{t("kanban.noTechnicians")}</p> : null}
        {technicians.map((tech) => (
          <div key={tech.id} className="flex min-w-52 items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tech.isAvailable ? "bg-emerald-500" : "bg-neutral-400"}`} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{tech.name}</p>
              <p className="text-xs text-neutral-500">
                {technicianTypeLabel(tech.technicianType)} · {tech.isAvailable ? t("common.free") : t("shell.busy")} · {t("kanban.openJobs", { count: tech.openJobCount })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function KanbanColumn({ status, requests }: { status: RequestStatus; requests: ServiceRequest[] }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  return (
    <section
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-2xl bg-neutral-100 ${isOver ? "ring-2 ring-[#B439FD]" : ""}`}
    >
      <header className="flex items-center justify-between px-3 py-3">
        <h2 className="text-sm font-extrabold text-neutral-800">{statusLabel(status)}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-neutral-500">{requests.length}</span>
      </header>
      <div className="flex max-h-[calc(100dvh-22rem)] flex-col gap-2 overflow-y-auto px-2 pb-3">
        {requests.length === 0 ? <p className="px-1 py-6 text-center text-xs text-neutral-400">{t("kanban.dropHere")}</p> : null}
        {requests.map((request) => (
          <DraggableCard key={request.id} request={request} />
        ))}
      </div>
    </section>
  );
}

function DraggableCard({ request }: { request: ServiceRequest }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: request.id,
    data: { status: request.status },
  });
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : ""}>
      <RequestCard request={request} handleProps={{ ...listeners, ...attributes }} />
    </div>
  );
}

function RequestCard({
  request,
  overlay = false,
  handleProps,
}: {
  request: ServiceRequest;
  overlay?: boolean;
  handleProps?: HTMLAttributes<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  return (
    <article className={`rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm ${overlay ? "rotate-1 shadow-lg" : ""}`}>
      <div className="flex items-start gap-2">
        {handleProps ? (
          <button
            type="button"
            aria-label={t("kanban.drag", { name: request.customer.name })}
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 active:cursor-grabbing"
            {...handleProps}
          >
            <GripVertical size={16} />
          </button>
        ) : null}
        <Link to={overlay ? "#" : `/app/requests/${request.id}`} className="min-w-0 flex-1" tabIndex={overlay ? -1 : 0}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-neutral-900">{request.customer.name}</p>
            {request.locationType === "on_site" ? (
              <MapPin size={16} className="shrink-0 text-[#F6921E]" aria-label={t("location.on_site")} />
            ) : (
              <Store size={16} className="shrink-0 text-[#B439FD]" aria-label={t("location.in_shop")} />
            )}
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {localizedName(request.product)} · {formatRequestId(request.displayId)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <TypeBadge type={request.type} />
            <PriorityBadge priority={request.priority} />
            <WarrantyBadge status={request.warrantyStatus} />
            {request.isOverdue ? (
              <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">{t("kanban.overdue")}</span>
            ) : null}
            {request.submittedByCustomer ? (
              <span className="inline-flex rounded-full bg-[#FFF4E5] px-2.5 py-1 text-xs font-bold text-[#C56A00]">{t("requests.customerChip")}</span>
            ) : null}
          </div>
          <p className="mt-2 truncate text-xs font-semibold text-neutral-600">{request.assignedTechnician?.name ?? t("common.unassigned")}</p>
        </Link>
      </div>
    </article>
  );
}
