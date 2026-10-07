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
import { CalendarDays, CheckCheck, ClipboardList, GripVertical, MapPin, Navigation, Package, Pause, Play, Printer, QrCode, Store, Truck, Wallet } from "lucide-react";
import { useMemo, useState, type HTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { StatusBadge, TypeBadge } from "../../components/Badges";
import { Modal } from "../../components/Modal";
import { OverflowLink, OverflowMenu } from "../../components/OverflowMenu";
import { PauseDialog } from "../../components/PauseDialog";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatPhone, formatRequestId, formatStamp, mapsUrl } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { JobTimerChip } from "../../components/JobTimer";
import { useNow } from "../../lib/useNow";
import type { RequestStatus, TechColumn, TechJob } from "../../lib/types";

const COLUMNS: TechColumn[] = ["new", "in_progress", "paused", "completed"];

export function TechnicianKanbanPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pauseJob, setPauseJob] = useState<TechJob | null>(null);
  const now = useNow(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 12 } }),
  );

  const board = useQuery({
    queryKey: ["staff", "my-jobs"],
    enabled: Boolean(token),
    queryFn: () => api<{ jobs: TechJob[] }>("/api/staff/my-jobs", { token }),
  });

  const move = useMutation({
    mutationFn: ({
      id,
      column,
      status,
      pauseReason,
      pauseHours,
    }: {
      id: string;
      column?: Exclude<TechColumn, "new">;
      status?: RequestStatus;
      pauseReason?: string;
      pauseHours?: number;
    }) =>
      api<{ job: TechJob }>(`/api/staff/my-jobs/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ column, status, pauseReason, pauseHours }),
      }),
    onMutate: async ({ id, column }) => {
      if (!column) return {};
      await queryClient.cancelQueries({ queryKey: ["staff", "my-jobs"] });
      const previous = queryClient.getQueryData<{ jobs: TechJob[] }>(["staff", "my-jobs"]);
      queryClient.setQueryData<{ jobs: TechJob[] }>(["staff", "my-jobs"], (current) => {
        if (!current) return current;
        return {
          jobs: current.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  column,
                  timer: column === "completed" ? null : job.timer,
                  activePause: column === "paused" ? job.activePause : null,
                }
              : job,
          ),
        };
      });
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context && "previous" in context && context.previous) {
        queryClient.setQueryData(["staff", "my-jobs"], context.previous);
      }
      notify(apiErrorMessage(error, t), "error");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "my-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
    },
  });

  const arrive = useMutation({
    mutationFn: (id: string) => api(`/api/staff/my-jobs/${id}/arrived`, { method: "POST", token }),
    onSuccess: () => notify(t("tech.arrivedSaved")),
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "my-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
    },
  });

  const [etaFor, setEtaFor] = useState<TechJob | null>(null);
  const enRoute = useMutation({
    mutationFn: ({ id, etaMinutes }: { id: string; etaMinutes?: number }) => api(`/api/staff/my-jobs/${id}/en-route`, { method: "POST", token, body: JSON.stringify(etaMinutes ? { etaMinutes } : {}) }),
    onSuccess: () => {
      setEtaFor(null);
      notify(t("tech.enRouteSaved"));
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "my-jobs"] });
    },
  });

  const jobs = board.data?.jobs ?? [];
  const byColumn = useMemo(() => {
    const grouped: Record<TechColumn, TechJob[]> = {
      new: [],
      in_progress: [],
      paused: [],
      completed: [],
    };
    for (const job of jobs) grouped[job.column].push(job);
    return grouped;
  }, [jobs]);

  const activeJob = activeId ? (jobs.find((job) => job.id === activeId) ?? null) : null;

  function moveJob(job: TechJob, column: TechColumn) {
    if (column === "new") {
      notify(t("errors.cannotMoveToNew"), "error");
      return;
    }
    if (job.column === "completed" && column !== "completed") {
      notify(t("tech.stayCompleted"), "error");
      return;
    }
    if (job.column === column) return;
    if (column === "completed") {
      navigate(`/app/my-jobs/${job.id}/complete`);
      return;
    }
    if (column === "paused") {
      setPauseJob(job);
      return;
    }
    move.mutate({ id: job.id, column });
  }

  function moveStatus(job: TechJob, status: RequestStatus) {
    if (status === "paused") {
      setPauseJob(job);
      return;
    }
    move.mutate({ id: job.id, status });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const job = jobs.find((item) => item.id === String(active.id));
    if (!job) return;
    const overId = String(over.id);
    const nextColumn = overId.startsWith("column:")
      ? (overId.slice(7) as TechColumn)
      : jobs.find((item) => item.id === overId)?.column;
    if (!nextColumn) return;
    moveJob(job, nextColumn);
  }

  if (board.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("tech.title")}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t("common.live")}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">{t("tech.intro")}</p>
        </div>
        <OverflowMenu label={t("tech.moreActions")}>
          <OverflowLink to="/app/scan">
            <QrCode size={16} />
            {t("nav.scan")}
          </OverflowLink>
          <OverflowLink to="/app/my-schedule">
            <CalendarDays size={16} />
            {t("nav.mySchedule")}
          </OverflowLink>
          <OverflowLink to="/app/my-earnings">
            <Wallet size={16} />
            {t("nav.myEarnings")}
          </OverflowLink>
        </OverflowMenu>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUMNS.map((column) => (
            <TechColumnView
              key={column}
              column={column}
              jobs={byColumn[column]}
              now={now}
              busyId={move.isPending ? move.variables?.id : arrive.isPending ? arrive.variables : null}
              onMove={moveJob}
              onStatus={moveStatus}
              onArrived={(job) => arrive.mutate(job.id)}
              onEnRoute={(job) => setEtaFor(job)}
            />
          ))}
        </div>
        <DragOverlay>{activeJob ? <JobCard job={activeJob} now={now} overlay /> : null}</DragOverlay>
      </DndContext>

      <Modal open={Boolean(etaFor)} onClose={() => setEtaFor(null)} title={t("tech.etaTitle")}>
        <p className="text-sm text-neutral-600">{t("tech.etaHint", { name: etaFor?.customer.name ?? "" })}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[10, 20, 30, 45, 60, 90].map((minutes) => (
            <button key={minutes} type="button" disabled={enRoute.isPending} onClick={() => etaFor && enRoute.mutate({ id: etaFor.id, etaMinutes: minutes })} className="min-h-12 rounded-xl border border-neutral-300 text-sm font-bold hover:border-[#7B00E0] hover:bg-[#F5EBFD]">
              {t("tech.etaMinutes", { minutes })}
            </button>
          ))}
        </div>
        <button type="button" disabled={enRoute.isPending} onClick={() => etaFor && enRoute.mutate({ id: etaFor.id })} className="mt-3 w-full text-center text-sm font-semibold text-neutral-600 hover:underline">
          {t("tech.etaSkip")}
        </button>
      </Modal>

      <PauseDialog
        name={pauseJob?.customer.name ?? null}
        busy={move.isPending}
        onClose={() => setPauseJob(null)}
        onSubmit={(pauseHours, pauseReason) => {
          if (!pauseJob) return;
          move.mutate(
            { id: pauseJob.id, column: "paused", pauseHours, pauseReason },
            { onSuccess: () => setPauseJob(null) },
          );
        }}
      />
    </div>
  );
}

function TechColumnView({
  column,
  jobs,
  now,
  busyId,
  onMove,
  onStatus,
  onArrived,
  onEnRoute,
}: {
  column: TechColumn;
  jobs: TechJob[];
  now: number;
  busyId?: string | null;
  onMove: (job: TechJob, column: TechColumn) => void;
  onStatus: (job: TechJob, status: RequestStatus) => void;
  onArrived: (job: TechJob) => void;
  onEnRoute: (job: TechJob) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column}` });
  return (
    <section
      ref={setNodeRef}
      className={`flex h-[calc(100dvh-12.5rem)] w-[min(85vw,20.5rem)] shrink-0 flex-col rounded-2xl bg-neutral-200/70 ${isOver ? "ring-2 ring-[#7B00E0]" : ""}`}
    >
      <header className="flex items-center justify-between px-3 py-3">
        <h2 className="text-sm font-extrabold text-neutral-800">{t(`techColumn.${column}`)}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-neutral-500">{jobs.length}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-3">
        {jobs.length === 0 ? <p className="px-1 py-8 text-center text-sm text-neutral-400">{t("tech.noJobs")}</p> : null}
        {jobs.map((job) => (
          <DraggableJobCard key={job.id} job={job} now={now} busy={busyId === job.id} onMove={onMove} onStatus={onStatus} onArrived={onArrived} onEnRoute={onEnRoute} />
        ))}
      </div>
    </section>
  );
}

function DraggableJobCard({
  job,
  now,
  busy,
  onMove,
  onStatus,
  onArrived,
  onEnRoute,
}: {
  job: TechJob;
  now: number;
  busy: boolean;
  onMove: (job: TechJob, column: TechColumn) => void;
  onStatus: (job: TechJob, status: RequestStatus) => void;
  onArrived: (job: TechJob) => void;
  onEnRoute: (job: TechJob) => void;
}) {
  const disabled = job.column === "completed";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    data: { column: job.column },
    disabled,
  });
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : ""}>
      <JobCard
        job={job}
        now={now}
        busy={busy}
        onMove={onMove}
        onStatus={onStatus}
        onArrived={onArrived}
        onEnRoute={onEnRoute}
        handleProps={disabled ? undefined : { ...listeners, ...attributes }}
      />
    </div>
  );
}

function JobCard({
  job,
  now,
  overlay = false,
  busy = false,
  onMove,
  onStatus,
  onArrived,
  onEnRoute,
  handleProps,
}: {
  job: TechJob;
  now: number;
  overlay?: boolean;
  busy?: boolean;
  onMove?: (job: TechJob, column: TechColumn) => void;
  onStatus?: (job: TechJob, status: RequestStatus) => void;
  onArrived?: (job: TechJob) => void;
  onEnRoute?: (job: TechJob) => void;
  handleProps?: HTMLAttributes<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const location = job.customerLocation;

  return (
    <article className={`rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm ${overlay ? "rotate-1 shadow-lg" : ""}`}>
      <div className="flex items-start gap-2">
        {handleProps ? (
          <button
            type="button"
            aria-label={t("tech.drag", { name: job.customer.name })}
            className="mt-0.5 inline-flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 active:cursor-grabbing"
            {...handleProps}
          >
            <GripVertical size={20} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-base font-extrabold text-neutral-900">{job.customer.name}</p>
            <div className="flex shrink-0 items-center gap-0.5">
              {job.locationType === "on_site" ? (
                <MapPin size={18} className="text-[#F7941E]" aria-label={t("location.on_site")} />
              ) : (
                <Store size={18} className="text-[#7B00E0]" aria-label={t("location.in_shop")} />
              )}
              {!overlay ? (
                <OverflowMenu label={t("tech.moreActions")}>
                  <OverflowLink to="/app/scan">
                    <QrCode size={16} />
                    {t("nav.scan")}
                  </OverflowLink>
                  {job.column === "completed" ? (
                    <OverflowLink to={`/app/my-jobs/${job.id}/receipt`}>
                      <Printer size={16} />
                      {t("detail.printReceipt")}
                    </OverflowLink>
                  ) : null}
                </OverflowMenu>
              ) : null}
            </div>
          </div>
          <p className="mt-0.5 truncate text-sm text-neutral-500">{localizedName(job.product)}</p>
          <p className="mt-0.5 font-mono text-xs font-semibold text-neutral-400">{formatRequestId(job.displayId)}</p>
          <a href={`tel:+${job.customer.phone.replace(/\D/g, "")}`} className="mt-1 inline-block text-sm font-semibold text-[#7B00E0]">
            {formatPhone(job.customer.phone)}
          </a>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <TypeBadge type={job.type} />
            <StatusBadge status={job.status} />
            {job.isRepeat ? <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{t("detail.repeat")}</span> : null}
          </div>
          {job.scheduledAt ? <p className="mt-2 text-xs font-bold text-[#C56A00]">{t("tech.scheduledFor", { time: formatStamp(job.scheduledAt) })}</p> : null}
        </div>
      </div>

      {job.timer ? (
        <div className="mt-3">
          <JobTimerChip timer={job.timer} now={now} />
        </div>
      ) : null}

      {job.activePause ? (
        <p className="mt-2 line-clamp-2 text-xs font-semibold text-neutral-600">{t("tech.pausedReason", { reason: job.activePause.reason })}</p>
      ) : null}

      {job.locationType === "on_site" && location ? (
        <a
          href={mapsUrl(location)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FFF4E5] text-sm font-bold text-[#C56A00]"
        >
          <Navigation size={16} />
          {t("maps.directions")}
        </a>
      ) : null}

      {!overlay && onEnRoute && job.locationType === "on_site" && job.column !== "completed" && !job.arrivedAt ? (
        job.enRouteAt ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#C56A00]">
            <Truck size={14} />
            {t("tech.enRouteSince", { time: formatStamp(job.enRouteAt) })}
          </p>
        ) : (
          <button type="button" onClick={() => onEnRoute(job)} disabled={busy} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FFF4E5] text-sm font-bold text-[#C56A00] disabled:opacity-50">
            <Truck size={16} />
            {t("tech.enRoute")}
          </button>
        )
      ) : null}

      {!overlay && onArrived && job.locationType === "on_site" && job.column !== "completed" ? (
        job.arrivedAt ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
            <CheckCheck size={14} />
            {t("tech.arrivedAt", { time: formatStamp(job.arrivedAt) })}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => onArrived(job)}
            disabled={busy}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-neutral-100 text-sm font-bold text-neutral-800 hover:bg-neutral-200 disabled:opacity-50"
          >
            <CheckCheck size={16} />
            {t("tech.arrived")}
          </button>
        )
      ) : null}

      {!overlay && job.column === "completed" ? (
        <Link
          to={`/app/my-jobs/${job.id}/receipt`}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#F5EBFD] text-sm font-bold text-[#7B00E0]"
        >
          <Printer size={16} />
          {t("detail.printReceipt")}
        </Link>
      ) : null}

      {!overlay && onMove && onStatus && job.column !== "completed" ? <JobActions job={job} busy={busy} onMove={onMove} onStatus={onStatus} /> : null}
    </article>
  );
}

function JobActions({
  job,
  busy,
  onMove,
  onStatus,
}: {
  job: TechJob;
  busy: boolean;
  onMove: (job: TechJob, column: TechColumn) => void;
  onStatus: (job: TechJob, status: RequestStatus) => void;
}) {
  const { t } = useTranslation();
  const open = `/app/my-jobs/${job.id}/complete`;
  const repair = job.type === "repair";

  const openLink = (label: string, icon: ReactNode, primary = false) => (
    <Link
      to={open}
      className={`col-span-2 inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl text-sm font-extrabold ${primary ? "bg-[#7B00E0] text-white hover:bg-[#6500BD]" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"}`}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {job.status === "new" ? (
        <ActionButton label={repair ? t("tech.startDiagnosis") : t("tech.start")} icon={<Play size={16} />} primary wide onClick={() => onMove(job, "in_progress")} disabled={busy} />
      ) : null}
      {job.status === "diagnosing" ? (
        <>
          {openLink(t("tech.estimateAction"), <ClipboardList size={16} />, true)}
          <ActionButton label={t("tech.startRepair")} icon={<Play size={16} />} onClick={() => onStatus(job, "in_progress")} disabled={busy} />
          {openLink(t("tech.needParts"), <Package size={16} />)}
        </>
      ) : null}
      {job.status === "awaiting_decision" ? <p className="col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-sm font-bold text-amber-800">{t("tech.waitingDecision")}</p> : null}
      {job.status === "awaiting_parts" ? (
        <>
          <ActionButton label={t("tech.partsArrived")} icon={<Play size={16} />} primary wide onClick={() => onStatus(job, "in_progress")} disabled={busy} />
        </>
      ) : null}
      {job.status === "paused" ? <ActionButton label={t("tech.resume")} icon={<Play size={16} />} primary wide onClick={() => onStatus(job, "in_progress")} disabled={busy} /> : null}
      {job.status === "in_progress" ? (
        <>
          {repair ? openLink(t("tech.needParts"), <Package size={16} />) : null}
          <ActionButton label={t("tech.complete")} primary wide={!repair} onClick={() => onMove(job, "completed")} disabled={busy} />
        </>
      ) : null}
      {job.status !== "paused" && job.status !== "awaiting_decision" ? (
        <ActionButton label={t("tech.pause")} icon={<Pause size={16} />} wide onClick={() => onMove(job, "paused")} disabled={busy} />
      ) : null}
      <Link to={open} className="col-span-2 text-center text-xs font-bold text-[#7B00E0] hover:underline">
        {t("tech.openJob")}
      </Link>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  primary = false,
  disabled = false,
  wide = false,
}: {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl text-sm font-extrabold disabled:opacity-50 ${
        wide ? "col-span-2" : ""
      } ${primary ? "bg-[#7B00E0] text-white hover:bg-[#6500BD]" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"}`}
    >
      {icon}
      {label}
    </button>
  );
}
