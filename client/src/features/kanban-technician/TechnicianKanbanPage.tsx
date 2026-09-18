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
import { GripVertical, MapPin, Navigation, Pause, Play, Printer, Store } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type HTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { TypeBadge } from "../../components/Badges";
import { Field, inputClass, textareaClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatPhone, formatRequestId, mapsUrl } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { TIMER_TONE_CLASS, formatCountdown, timerTone } from "../../lib/timer";
import type { TechColumn, TechJob } from "../../lib/types";

const COLUMNS: TechColumn[] = ["new", "in_progress", "paused", "completed"];
const PAUSE_PRESETS = [1, 4, 8, 24];

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
      pauseReason,
      pauseHours,
    }: {
      id: string;
      column: Exclude<TechColumn, "new">;
      pauseReason?: string;
      pauseHours?: number;
    }) =>
      api<{ job: TechJob; nextOccurrence: TechJob | null }>(`/api/staff/my-jobs/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ column, pauseReason, pauseHours }),
      }),
    onMutate: async ({ id, column }) => {
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
      if (context?.previous) {
        queryClient.setQueryData(["staff", "my-jobs"], context.previous);
      }
      notify(apiErrorMessage(error, t), "error");
    },
    onSuccess: (data) => {
      if (data.nextOccurrence) {
        notify(t("common.nextOccurrence"));
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "my-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
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
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight">{t("tech.title")}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {t("common.live")}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">{t("tech.intro")}</p>
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
              busyId={move.isPending ? move.variables?.id : null}
              onMove={moveJob}
            />
          ))}
        </div>
        <DragOverlay>{activeJob ? <JobCard job={activeJob} now={now} overlay /> : null}</DragOverlay>
      </DndContext>

      <PauseDialog
        job={pauseJob}
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
}: {
  column: TechColumn;
  jobs: TechJob[];
  now: number;
  busyId?: string | null;
  onMove: (job: TechJob, column: TechColumn) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column}` });
  return (
    <section
      ref={setNodeRef}
      className={`flex h-[calc(100dvh-12.5rem)] w-[min(85vw,20.5rem)] shrink-0 flex-col rounded-2xl bg-neutral-200/70 ${isOver ? "ring-2 ring-[#B439FD]" : ""}`}
    >
      <header className="flex items-center justify-between px-3 py-3">
        <h2 className="text-sm font-extrabold text-neutral-800">{t(`techColumn.${column}`)}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-neutral-500">{jobs.length}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-3">
        {jobs.length === 0 ? <p className="px-1 py-8 text-center text-sm text-neutral-400">{t("tech.noJobs")}</p> : null}
        {jobs.map((job) => (
          <DraggableJobCard key={job.id} job={job} now={now} busy={busyId === job.id} onMove={onMove} />
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
}: {
  job: TechJob;
  now: number;
  busy: boolean;
  onMove: (job: TechJob, column: TechColumn) => void;
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
  handleProps,
}: {
  job: TechJob;
  now: number;
  overlay?: boolean;
  busy?: boolean;
  onMove?: (job: TechJob, column: TechColumn) => void;
  handleProps?: HTMLAttributes<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const location = job.customerLocation;
  const tone = job.timer ? timerTone(job.timer.startsAt, job.timer.durationMs, now) : null;

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
            <p className="text-base font-extrabold text-neutral-900">{job.customer.name}</p>
            {job.locationType === "on_site" ? (
              <MapPin size={18} className="shrink-0 text-[#F6921E]" aria-label={t("location.on_site")} />
            ) : (
              <Store size={18} className="shrink-0 text-[#B439FD]" aria-label={t("location.in_shop")} />
            )}
          </div>
          <p className="mt-0.5 text-sm text-neutral-500">{localizedName(job.product)}</p>
          <p className="mt-0.5 font-mono text-xs font-semibold text-neutral-400">{formatRequestId(job.displayId)}</p>
          <a href={`tel:+${job.customer.phone.replace(/\D/g, "")}`} className="mt-1 inline-block text-sm font-semibold text-[#B439FD]">
            {formatPhone(job.customer.phone)}
          </a>
          <div className="mt-2">
            <TypeBadge type={job.type} />
          </div>
        </div>
      </div>

      {job.timer && tone ? (
        <p className={`mt-3 rounded-xl px-3 py-2 text-center text-sm font-extrabold tabular-nums ${TIMER_TONE_CLASS[tone]}`}>
          {formatCountdown(job.timer.startsAt, job.timer.durationMs, now)}
        </p>
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

      {!overlay && job.column === "completed" ? (
        <Link
          to={`/app/my-jobs/${job.id}/receipt`}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#F3E8FF] text-sm font-bold text-[#B439FD]"
        >
          <Printer size={16} />
          {t("detail.printReceipt")}
        </Link>
      ) : null}

      {!overlay && onMove && job.column !== "completed" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {job.column === "new" ? (
            <ActionButton label={t("tech.start")} icon={<Play size={16} />} primary onClick={() => onMove(job, "in_progress")} disabled={busy} />
          ) : null}
          {job.column === "paused" ? (
            <ActionButton label={t("tech.resume")} icon={<Play size={16} />} primary onClick={() => onMove(job, "in_progress")} disabled={busy} />
          ) : null}
          {job.column !== "paused" ? (
            <ActionButton
              label={t("tech.pause")}
              icon={<Pause size={16} />}
              onClick={() => onMove(job, "paused")}
              disabled={busy}
              wide={job.column === "in_progress"}
            />
          ) : null}
          <ActionButton
            label={t("tech.complete")}
            primary={job.column === "in_progress"}
            onClick={() => onMove(job, "completed")}
            disabled={busy}
            wide={job.column !== "paused"}
          />
        </div>
      ) : null}
    </article>
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
      } ${primary ? "bg-[#B439FD] text-white hover:bg-[#C45FFF]" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function PauseDialog({
  job,
  busy,
  onClose,
  onSubmit,
}: {
  job: TechJob | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (hours: number, reason: string) => void;
}) {
  const { t } = useTranslation();
  const [hours, setHours] = useState("4");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (job) {
      setHours("4");
      setReason("");
    }
  }, [job]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(hours);
    const trimmed = reason.trim();
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    if (!trimmed) return;
    onSubmit(parsed, trimmed);
  }

  return (
    <Modal open={Boolean(job)} onClose={onClose} title={t("tech.pauseTitle")}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="text-sm text-neutral-500">
          {job ? t("tech.pauseHint", { name: job.customer.name }) : null}
        </p>
        <Field label={t("tech.pauseHours")} hint={t("tech.pauseHoursHint")}>
          <input
            className={inputClass}
            type="number"
            min={0.25}
            step={0.25}
            max={336}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            required
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {PAUSE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setHours(String(preset))}
              className={`h-10 rounded-full px-3 text-sm font-bold ${
                hours === String(preset) ? "bg-[#B439FD] text-white" : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {t("tech.hoursShort", { count: preset })}
            </button>
          ))}
        </div>
        <Field label={t("tech.pauseReason")} hint={t("tech.pauseReasonHint")}>
          <textarea
            className={textareaClass}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("tech.pauseReasonPlaceholder")}
            required
          />
        </Field>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-neutral-100 text-sm font-bold"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy || !reason.trim() || Number(hours) <= 0}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#B439FD] text-sm font-extrabold text-white disabled:opacity-50"
          >
            {t("tech.pauseSubmit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}
