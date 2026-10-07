import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, ImagePlus, Minus, Plus, Printer, Trash2 } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EstimateBuilder } from "../request-panels/EstimateBuilder";
import { EstimateView } from "../request-panels/EstimateView";
import { StatusBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { RequestTimeline } from "../../components/RequestTimeline";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { withApiBase } from "../../lib/apiBase";
import { api, apiErrorMessage, apiForm } from "../../lib/api";
import { formatMoney, formatPhone, formatRequestId, formatStamp } from "../../lib/format";
import { categoryLabel, localizedName } from "../../lib/localized";
import type { ChecklistItem, JobWorkPayload } from "../../lib/types";

function ChecklistGroup({ kind, items, checked, disabled, onChange }: { kind: "diagnosis" | "completion"; items: ChecklistItem[]; checked: string[]; disabled: boolean; onChange: (checked: string[]) => void }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language.slice(0, 2) as "uz" | "ru" | "en") || "uz";
  return (
    <div>
      <p className="mb-2 text-xs font-bold tracking-wide text-neutral-500 uppercase">{t(`checklist.${kind}`)}</p>
      <ul className="space-y-2">
        {items.map((item) => {
          const on = checked.includes(item.id);
          return (
            <li key={item.id}>
              <label className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 ring-1 ${on ? "bg-emerald-50 ring-emerald-300" : "bg-neutral-50 ring-neutral-200"}`}>
                <input type="checkbox" className="h-5 w-5" checked={on} disabled={disabled} onChange={() => onChange(on ? checked.filter((id) => id !== item.id) : [...checked, item.id])} />
                <span className="flex-1 text-sm font-semibold">{item[lang] || item.uz || item.en}</span>
                {item.required ? <span className="rounded-full bg-[#F5EBFD] px-2 py-0.5 text-[10px] font-bold text-[#7B00E0] uppercase">{t("checklists.required")}</span> : null}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function JobCompletePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraDescription, setExtraDescription] = useState("");
  const [extraPrice, setExtraPrice] = useState("");

  const detail = useQuery({
    queryKey: ["staff", "my-jobs", id],
    enabled: Boolean(token && id),
    queryFn: () => api<JobWorkPayload>(`/api/staff/my-jobs/${id}`, { token }),
  });

  function replaceWork(data: JobWorkPayload) {
    queryClient.setQueryData(["staff", "my-jobs", id], data);
  }

  const serviceMut = useMutation({
    mutationFn: async (serviceCatalogItemId: string) => {
      const selected = detail.data?.serviceLines.some((line) => line.serviceCatalogItemId === serviceCatalogItemId);
      if (selected) {
        const line = detail.data!.serviceLines.find((item) => item.serviceCatalogItemId === serviceCatalogItemId)!;
        return api<JobWorkPayload>(`/api/staff/my-jobs/${id}/service-lines/${line.id}`, { method: "DELETE", token });
      }
      return api<JobWorkPayload>(`/api/staff/my-jobs/${id}/service-lines`, {
        method: "POST",
        token,
        body: JSON.stringify({ serviceCatalogItemId }),
      });
    },
    onSuccess: replaceWork,
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const partMut = useMutation({
    mutationFn: async ({ sparePartId, quantity, lineId }: { sparePartId?: string; quantity?: number; lineId?: string }) => {
      if (lineId != null && quantity != null) {
        return api<JobWorkPayload>(`/api/staff/my-jobs/${id}/part-lines/${lineId}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ quantity }),
        });
      }
      return api<JobWorkPayload>(`/api/staff/my-jobs/${id}/part-lines`, {
        method: "POST",
        token,
        body: JSON.stringify({ sparePartId, quantity: 1 }),
      });
    },
    onSuccess: replaceWork,
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const extraMut = useMutation({
    mutationFn: async (payload: { description: string; price: number } | { expenseId: string }) => {
      if ("expenseId" in payload) {
        return api<JobWorkPayload>(`/api/staff/my-jobs/${id}/extra-expenses/${payload.expenseId}`, { method: "DELETE", token });
      }
      return api<JobWorkPayload>(`/api/staff/my-jobs/${id}/extra-expenses`, {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data) => {
      replaceWork(data);
      setExtraDescription("");
      setExtraPrice("");
      setExtraOpen(false);
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const photoMut = useMutation({
    mutationFn: async (payload: { files?: FileList; photoId?: string }) => {
      if (payload.photoId) {
        return api<JobWorkPayload>(`/api/staff/my-jobs/${id}/photos/${payload.photoId}`, { method: "DELETE", token });
      }
      const formData = new FormData();
      Array.from(payload.files ?? []).forEach((file) => formData.append("photos", file));
      return apiForm<JobWorkPayload>(`/api/staff/my-jobs/${id}/photos`, { token, formData });
    },
    onSuccess: replaceWork,
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const estimateMut = useMutation({
    mutationFn: (body: { lines: unknown[]; note: string; send: boolean }) =>
      api<JobWorkPayload>(`/api/staff/my-jobs/${id}/estimates`, { method: "POST", token, body: JSON.stringify(body) }),
    onSuccess: async (data, vars) => {
      replaceWork(data);
      notify(vars.send ? t("estimate.sent") : t("estimate.saved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "my-jobs"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const diagnosisMut = useMutation({
    mutationFn: (defectCodeId: string | null) =>
      api<JobWorkPayload>(`/api/staff/my-jobs/${id}/diagnosis`, { method: "PUT", token, body: JSON.stringify({ defectCodeId }) }),
    onSuccess: replaceWork,
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const orderMut = useMutation({
    mutationFn: (body: { sparePartId: string; quantity: number }) =>
      api<JobWorkPayload>(`/api/staff/my-jobs/${id}/part-orders`, { method: "POST", token, body: JSON.stringify(body) }),
    onSuccess: async (data) => {
      replaceWork(data);
      notify(t("parts.orderSent"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "my-jobs"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const checklistMut = useMutation({
    mutationFn: (body: { kind: "diagnosis" | "completion"; checked: string[] }) => api<JobWorkPayload>(`/api/staff/my-jobs/${id}/checklist`, { method: "PUT", token, body: JSON.stringify(body) }),
    onSuccess: replaceWork,
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const statusMut = useMutation({
    mutationFn: (status: string) => api<JobWorkPayload>(`/api/staff/my-jobs/${id}`, { method: "PATCH", token, body: JSON.stringify({ status }) }),
    onSuccess: async (data) => {
      replaceWork(data);
      await queryClient.invalidateQueries({ queryKey: ["staff", "my-jobs"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const resolutionMut = useMutation({
    mutationFn: (body: { resolutionType: "repair" | "replace"; productId?: string; serialNumber?: string }) =>
      api<JobWorkPayload>(`/api/staff/my-jobs/${id}/resolution`, { method: "PUT", token, body: JSON.stringify(body) }),
    onSuccess: replaceWork,
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const completeMut = useMutation({
    mutationFn: () =>
      api<JobWorkPayload>(`/api/staff/my-jobs/${id}/complete`, {
        method: "POST",
        token,
      }),
    onSuccess: async (data) => {
      notify(data.cost.coveredByWarranty ? t("job.completedCovered") : t("job.completed"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "my-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
      navigate("/app/my-jobs", { replace: true });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (detail.isLoading) {
    return <PageSkeleton />;
  }

  const data = detail.data;
  if (!data) {
    return <EmptyState title={t("job.notFoundTitle")} body={t("job.notFoundBody")} />;
  }

  const { job, catalog, serviceLines, partLines, extraExpenses, photos, cost, canComplete, missing, timeline, settings, replacement, estimates, defectCodes, partOrders, notes } = data;
  const blockZero = settings?.blockZeroStock ?? true;
  const done = job.column === "completed";
  const repair = job.type === "repair";
  const latestEstimate = estimates[0] ?? null;
  const busy =
    serviceMut.isPending ||
    partMut.isPending ||
    extraMut.isPending ||
    photoMut.isPending ||
    resolutionMut.isPending ||
    estimateMut.isPending ||
    diagnosisMut.isPending ||
    checklistMut.isPending ||
    orderMut.isPending ||
    statusMut.isPending ||
    completeMut.isPending;
  const missingList = missing.map((code) => t(`job.gap.${code}`)).join(", ");

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files && files.length > 0) {
      photoMut.mutate({ files });
    }
    event.target.value = "";
  }

  function addExtra(event: FormEvent) {
    event.preventDefault();
    const price = Number(extraPrice);
    if (!extraDescription.trim() || !Number.isFinite(price) || price < 0) return;
    extraMut.mutate({ description: extraDescription.trim(), price });
  }

  return (
    <div className="pb-[calc(9rem+env(safe-area-inset-bottom))]">
      <Link to="/app/my-jobs" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-[#7B00E0]">
        <ArrowLeft size={16} />
        {t("tech.title")}
      </Link>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="font-mono text-xs font-bold tracking-wide text-neutral-400">{formatRequestId(job.displayId)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{job.customer.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {localizedName(job.product)} · {formatPhone(job.customer.phone)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <TypeBadge type={job.type} />
          <WarrantyBadge status={job.warrantyStatus} />
        </div>
        <p className="mt-3 text-sm text-neutral-700">{job.issueDescription}</p>
        {done ? (
          <Link
            to={`/app/my-jobs/${job.id}/receipt`}
            className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white hover:bg-[#6500BD]"
          >
            <Printer size={16} />
            {t("detail.printReceipt")}
          </Link>
        ) : null}
      </div>

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("job.timeline")}</h2>
        <p className="mt-1 text-xs text-neutral-500">{t("job.timelineHint")}</p>
        <div className="mt-4">
          <RequestTimeline events={timeline ?? []} />
        </div>
      </section>

      {repair && !done ? (
        <Section title={t("tech.workflow")} hint={t("tech.workflowHint")}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            {data.decision ? <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-700">{t(`decision.${data.decision}`)}</span> : null}
          </div>
          {job.status === "awaiting_decision" ? <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{t("tech.waitingDecision")}</p> : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {job.status === "new" ? (
              <button type="button" disabled={busy} onClick={() => statusMut.mutate("diagnosing")} className="min-h-12 rounded-xl bg-[#7B00E0] text-sm font-extrabold text-white disabled:opacity-50">
                {t("tech.startDiagnosis")}
              </button>
            ) : null}
            {job.status === "diagnosing" || job.status === "awaiting_parts" ? (
              <button type="button" disabled={busy} onClick={() => statusMut.mutate("in_progress")} className="min-h-12 rounded-xl bg-[#7B00E0] text-sm font-extrabold text-white disabled:opacity-50">
                {job.status === "awaiting_parts" ? t("tech.partsArrived") : t("tech.startRepair")}
              </button>
            ) : null}
            {job.status === "diagnosing" || job.status === "in_progress" ? (
              <button type="button" disabled={busy} onClick={() => statusMut.mutate("awaiting_parts")} className="min-h-12 rounded-xl bg-neutral-100 text-sm font-bold disabled:opacity-50">
                {t("tech.needParts")}
              </button>
            ) : null}
          </div>
        </Section>
      ) : null}

      {repair ? (
        <Section title={t("detail.defectCode")} hint={t("tech.diagnosisHint")}>
          <select className={`${inputClass} bg-white`} disabled={done || busy} value={job.defectCodeId ?? ""} onChange={(event) => diagnosisMut.mutate(event.target.value || null)}>
            <option value="">{t("common.dash")}</option>
            {defectCodes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {localizedName(item)}
              </option>
            ))}
          </select>
        </Section>
      ) : null}

      {repair ? (
        <Section title={t("estimate.title")} hint={t("estimate.techHint")}>
          <div className="space-y-4">
            {estimates.map((estimate) => (
              <EstimateView key={estimate.id} estimate={estimate} />
            ))}
            {!done && !(latestEstimate && (latestEstimate.status === "sent" || latestEstimate.status === "draft")) && ["new", "diagnosing", "awaiting_decision", "in_progress"].includes(job.status) ? (
              <details open={!latestEstimate || latestEstimate.status === "declined" || latestEstimate.status === "expired"}>
                <summary className="mb-2 cursor-pointer text-sm font-semibold text-neutral-700">{t("estimate.newEstimate")}</summary>
                <EstimateBuilder
                  services={catalog.services}
                  parts={catalog.parts}
                  busy={estimateMut.isPending}
                  allowDraft={false}
                  onSubmit={(payload) => estimateMut.mutate(payload)}
                />
              </details>
            ) : null}
          </div>
        </Section>
      ) : null}

      {notes.length > 0 ? (
        <Section title={t("notes.title")} hint={t("notes.techHint")}>
          <ul className="space-y-2">
            {notes.map((note) => (
              <li key={note.id} className={`rounded-2xl px-4 py-3 text-sm ${note.authorScope === "customer" ? "bg-[#FFF4E5]" : "bg-neutral-100"}`}>
                <p className="whitespace-pre-wrap">{note.text}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {note.authorScope === "customer" ? t("notes.customer") : (note.authorName ?? t("notes.staff"))} · {formatStamp(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {data.checklist && (data.checklist.completion.items.length > 0 || (repair && data.checklist.diagnosis.items.length > 0)) ? (
        <Section title={t("checklist.title")} hint={t("checklist.hint")}>
          <div className="space-y-4">
            {repair && data.checklist.diagnosis.items.length > 0 ? <ChecklistGroup kind="diagnosis" items={data.checklist.diagnosis.items} checked={data.checklist.diagnosis.checked} disabled={done || busy} onChange={(checked) => checklistMut.mutate({ kind: "diagnosis", checked })} /> : null}
            {data.checklist.completion.items.length > 0 ? <ChecklistGroup kind="completion" items={data.checklist.completion.items} checked={data.checklist.completion.checked} disabled={done || busy} onChange={(checked) => checklistMut.mutate({ kind: "completion", checked })} /> : null}
          </div>
        </Section>
      ) : null}

      <Section title={t("job.photos")} hint={t("job.photosHint")}>
        {photos.length > 0 ? (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((photo) => (
              <figure key={photo.id} className="relative overflow-hidden rounded-2xl bg-neutral-100">
                <img src={withApiBase(photo.photoUrl)} alt={t("common.jobPhoto")} className="h-32 w-full object-cover" />
                {done ? null : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => photoMut.mutate({ photoId: photo.id })}
                    className="absolute top-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white"
                    aria-label={t("common.removePhoto")}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </figure>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-sm text-neutral-500">{t("job.noPhotos")}</p>
        )}
        {done ? null : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#FFF4E5] text-sm font-bold text-[#C56A00]"
            >
              <Camera size={18} />
              {t("common.takePhoto")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-neutral-100 text-sm font-bold"
            >
              <ImagePlus size={18} />
              {t("job.addPhotos")}
            </button>
          </div>
        )}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFiles} />
        <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
      </Section>

      <Section
        title={t("catalog.services")}
        hint={t("job.servicesHint", { category: categoryLabel(job.product.category) })}
      >
        {catalog.services.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("job.noServices")}</p>
        ) : (
          <div className="space-y-2">
            {catalog.services.map((item) => {
              const selected = serviceLines.some((line) => line.serviceCatalogItemId === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={done || busy}
                  onClick={() => serviceMut.mutate(item.id)}
                  className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left ring-1 ${
                    selected ? "bg-[#F5EBFD] ring-[#7B00E0]" : "bg-neutral-50 ring-neutral-200"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        selected ? "bg-[#7B00E0] text-white" : "bg-white ring-1 ring-neutral-300"
                      }`}
                    >
                      {selected ? <Check size={14} /> : null}
                    </span>
                    <span className="truncate font-semibold">{localizedName(item)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-neutral-600">{formatMoney(item.price)}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={t("catalog.parts")} hint={t("job.partsHint")}>
        {catalog.parts.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("job.noParts")}</p>
        ) : (
          <div className="space-y-2">
            {catalog.parts.map((item) => {
              const line = partLines.find((entry) => entry.sparePartId === item.id);
              const out = (item.stockQuantity ?? 0) + (item.carried ?? 0) <= 0;
              const blocked = out && blockZero && !line;
              return (
                <div
                  key={item.id}
                  className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 ring-1 ${
                    line ? "bg-[#FFF4E5] ring-[#F7941E]" : "bg-neutral-50 ring-neutral-200"
                  }`}
                >
                  <button
                    type="button"
                    disabled={done || busy || blocked}
                    onClick={() => {
                      if (line) return;
                      if (out && !blockZero) notify(t("job.zeroStockWarn"), "error");
                      partMut.mutate({ sparePartId: item.id });
                    }}
                    className="min-w-0 flex-1 py-3 text-left"
                  >
                    <p className="truncate font-semibold">{localizedName(item)}</p>
                    <p className="text-xs text-neutral-500">{t("job.stockLine", { price: formatMoney(item.price), count: item.stockQuantity ?? 0 })}</p>
                    {item.carried ? <p className="text-[11px] font-bold text-[#7B00E0]">{t("job.carried", { count: item.carried })}</p> : null}
                    {out ? (
                      <p className="text-[11px] font-bold text-amber-700">{blockZero ? t("job.zeroStockBlock") : t("job.zeroStockWarn")}</p>
                    ) : item.lowStock ? (
                      <p className="text-[11px] font-bold text-amber-700">{t("catalog.lowStock")}</p>
                    ) : null}
                  </button>
                  {out && !line ? (
                    <button type="button" disabled={done || busy} onClick={() => orderMut.mutate({ sparePartId: item.id, quantity: 1 })} className="h-10 shrink-0 rounded-xl bg-white px-3 text-xs font-extrabold text-[#7B00E0] ring-1 ring-[#7B00E0]/30 disabled:opacity-50">
                      {t("parts.order")}
                    </button>
                  ) : null}
                  {line ? (
                    <div className="flex items-center gap-2">
                      <IconButton
                        label={t("common.decreaseQty")}
                        disabled={done || busy}
                        onClick={() => partMut.mutate({ lineId: line.id, quantity: line.quantity - 1 })}
                      >
                        <Minus size={16} />
                      </IconButton>
                      <span className="w-6 text-center text-sm font-extrabold">{line.quantity}</span>
                      <IconButton
                        label={t("common.increaseQty")}
                        disabled={done || busy || (out && blockZero)}
                        onClick={() => {
                          if (out && !blockZero) notify(t("job.zeroStockWarn"), "error");
                          partMut.mutate({ lineId: line.id, quantity: line.quantity + 1 });
                        }}
                      >
                        <Plus size={16} />
                      </IconButton>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {partOrders.length > 0 ? (
        <Section title={t("parts.orders")} hint={t("parts.ordersHint")}>
          <ul className="space-y-2 text-sm">
            {partOrders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-4 py-3">
                <span className="font-semibold">
                  {localizedName(order)} × {order.quantity}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-neutral-700">{t(`parts.status.${order.status}`)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={t("detail.extras")} hint={t("job.extraHint")}>
        {extraExpenses.length > 0 ? (
          <ul className="mb-3 space-y-2">
            {extraExpenses.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.description}</p>
                  <p className="text-sm text-neutral-500">{formatMoney(item.price)}</p>
                </div>
                {done ? null : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => extraMut.mutate({ expenseId: item.id })}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-neutral-500 hover:bg-white"
                    aria-label={t("common.removeNamed", { name: item.description })}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {done ? null : extraOpen ? (
          <form className="space-y-3 rounded-2xl bg-neutral-50 p-4" onSubmit={addExtra}>
            <Field label={t("job.description")}>
              <input className={inputClass} value={extraDescription} onChange={(event) => setExtraDescription(event.target.value)} required />
            </Field>
            <Field label={t("catalog.priceSom")}>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={1000}
                value={extraPrice}
                onChange={(event) => setExtraPrice(event.target.value)}
                required
              />
            </Field>
            <div className="flex gap-2">
              <button type="button" onClick={() => setExtraOpen(false)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-white text-sm font-bold ring-1 ring-neutral-200">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={busy} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-[#7B00E0] text-[12.8px] font-extrabold text-white">
                {t("job.saveExpense")}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setExtraOpen(true)}
            className="mb-2 inline-flex min-h-12 w-full scroll-mb-40 items-center justify-center gap-2 rounded-2xl bg-neutral-100 text-sm font-bold"
          >
            <Plus size={16} />
            {t("detail.extras")}
          </button>
        )}
      </Section>

      {job.type === "repair" ? (
        <ResolutionSection
          key={`${data.resolutionType ?? "none"}-${replacement?.serialNumber ?? ""}`}
          data={data}
          disabled={done || busy}
          onSave={(body) => resolutionMut.mutate(body)}
        />
      ) : null}

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("job.cost")}</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label={t("catalog.services")} value={formatMoney(cost.servicesTotal)} />
          <Row label={t("catalog.parts")} value={formatMoney(cost.partsTotal)} />
          <Row label={t("job.additional")} value={formatMoney(cost.extrasTotal)} />
        </dl>
        <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-extrabold ${cost.coveredByWarranty ? "bg-emerald-50 text-emerald-800" : "bg-[#FFF4E5] text-[#C56A00]"}`}>
          {cost.coveredByWarranty
            ? t("detail.warrantyPays", { amount: formatMoney(cost.chargedTotal) })
            : t("detail.customerPays", { amount: formatMoney(cost.chargedTotal) })}
        </p>
      </section>

      {done ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-neutral-500">{t("job.alreadyDone")}</p>
          <Link
            to={`/app/my-jobs/${job.id}/receipt`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white hover:bg-[#6500BD]"
          >
            <Printer size={16} />
            {t("detail.printReceipt")}
          </Link>
        </div>
      ) : (
        <div className="fixed right-0 bottom-0 left-0 z-20 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur lg:left-64">
          {missing.length > 0 ? (
            <p className="mb-2 text-center text-xs font-semibold text-[#C56A00]">{t("job.stillNeed", { list: missingList })}</p>
          ) : null}
          <button
            type="button"
            disabled={busy || !canComplete}
            onClick={() => completeMut.mutate()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#7B00E0] text-sm font-extrabold text-white disabled:opacity-50"
          >
            {completeMut.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("job.completeAmount", { amount: formatMoney(cost.chargedTotal) })}
          </button>
        </div>
      )}
    </div>
  );
}

function ResolutionSection({
  data,
  disabled,
  onSave,
}: {
  data: JobWorkPayload;
  disabled: boolean;
  onSave: (body: { resolutionType: "repair" | "replace"; productId?: string; serialNumber?: string }) => void;
}) {
  const { t } = useTranslation();
  const options = data.catalog.replacementProducts;
  const [mode, setMode] = useState<"repair" | "replace">(data.resolutionType === "replace" ? "replace" : "repair");
  const [productId, setProductId] = useState(data.replacement?.productId ?? options[0]?.id ?? data.job.productId);
  const [serial, setSerial] = useState(data.replacement?.serialNumber ?? "");

  function choose(next: "repair" | "replace") {
    setMode(next);
    // Switching back to a plain repair clears any recorded replacement.
    if (next === "repair" && data.resolutionType === "replace") onSave({ resolutionType: "repair" });
  }

  return (
    <Section title={t("job.resolution")} hint={t("job.resolutionHint")}>
      <div className="grid grid-cols-2 gap-2">
        {(["repair", "replace"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            aria-pressed={mode === kind}
            onClick={() => choose(kind)}
            className={`min-h-12 rounded-2xl text-sm font-extrabold ring-1 disabled:opacity-60 ${
              mode === kind ? "bg-[#F5EBFD] text-[#7B00E0] ring-[#7B00E0]" : "bg-neutral-50 text-neutral-700 ring-neutral-200"
            }`}
          >
            {t(`resolution.${kind}`)}
          </button>
        ))}
      </div>
      {mode === "replace" ? (
        <div className="mt-4 space-y-3 rounded-2xl bg-neutral-50 p-4">
          <Field label={t("job.replacementProduct")}>
            <select className={`${inputClass} bg-white`} value={productId} disabled={disabled} onChange={(event) => setProductId(event.target.value)}>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {localizedName(item)} · {item.sku}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("job.serialNumber")}>
            <input className={inputClass} value={serial} disabled={disabled} onChange={(event) => setSerial(event.target.value)} />
          </Field>
          {data.replacement ? (
            <p className="text-sm font-semibold text-emerald-700">
              {t("job.replacementSaved", { product: localizedName(data.replacement), serial: data.replacement.serialNumber })}
            </p>
          ) : null}
          <button
            type="button"
            disabled={disabled || !serial.trim() || !productId}
            onClick={() => onSave({ resolutionType: "replace", productId, serialNumber: serial.trim() })}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#7B00E0] text-[12.8px] font-extrabold text-white disabled:opacity-50"
          >
            {t("job.saveReplacement")}
          </button>
        </div>
      ) : null}
    </Section>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{title}</h2>
      <p className="mt-1 text-xs text-neutral-500">{hint}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white ring-1 ring-neutral-200 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
