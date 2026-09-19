import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, ImagePlus, Minus, Plus, Printer, Trash2 } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TypeBadge, WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { RequestTimeline } from "../../components/RequestTimeline";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage, apiForm } from "../../lib/api";
import { formatMoney, formatPhone, formatRequestId } from "../../lib/format";
import { categoryLabel, localizedName } from "../../lib/localized";
import type { JobWorkPayload } from "../../lib/types";

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

  const { job, catalog, serviceLines, partLines, extraExpenses, photos, cost, canComplete, missing, timeline } = data;
  const done = job.column === "completed";
  const busy = serviceMut.isPending || partMut.isPending || extraMut.isPending || photoMut.isPending || completeMut.isPending;
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
    <div className="pb-28">
      <Link to="/app/my-jobs" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-[#B439FD]">
        <ArrowLeft size={16} />
        {t("tech.title")}
      </Link>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="font-mono text-xs font-bold tracking-wide text-neutral-400">{formatRequestId(job.displayId)}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{job.customer.name}</h1>
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
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF]"
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
                    selected ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-neutral-50 ring-neutral-200"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        selected ? "bg-[#B439FD] text-white" : "bg-white ring-1 ring-neutral-300"
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
              return (
                <div
                  key={item.id}
                  className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 ring-1 ${
                    line ? "bg-[#FFF4E5] ring-[#F6921E]" : "bg-neutral-50 ring-neutral-200"
                  }`}
                >
                  <button
                    type="button"
                    disabled={done || busy || (!line && (item.stockQuantity ?? 0) <= 0)}
                    onClick={() => (line ? undefined : partMut.mutate({ sparePartId: item.id }))}
                    className="min-w-0 flex-1 py-3 text-left"
                  >
                    <p className="truncate font-semibold">{localizedName(item)}</p>
                    <p className="text-xs text-neutral-500">{t("job.stockLine", { price: formatMoney(item.price), count: item.stockQuantity ?? 0 })}</p>
                  </button>
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
                        disabled={done || busy || (item.stockQuantity ?? 0) <= 0}
                        onClick={() => partMut.mutate({ lineId: line.id, quantity: line.quantity + 1 })}
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
              <button type="submit" disabled={busy} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#B439FD] text-sm font-extrabold text-white">
                {t("job.saveExpense")}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setExtraOpen(true)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-100 text-sm font-bold"
          >
            <Plus size={16} />
            {t("detail.extras")}
          </button>
        )}
      </Section>

      <Section title={t("job.photos")} hint={t("job.photosHint")}>
        {photos.length > 0 ? (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((photo) => (
              <figure key={photo.id} className="relative overflow-hidden rounded-2xl bg-neutral-100">
                <img src={photo.photoUrl} alt={t("common.jobPhoto")} className="h-32 w-full object-cover" />
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

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("job.cost")}</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label={t("catalog.services")} value={formatMoney(cost.servicesTotal)} />
          <Row label={t("catalog.parts")} value={formatMoney(cost.partsTotal)} />
          <Row label={t("job.additional")} value={formatMoney(cost.extrasTotal)} />
        </dl>
        <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-extrabold ${cost.coveredByWarranty ? "bg-emerald-50 text-emerald-800" : "bg-[#FFF4E5] text-[#C56A00]"}`}>
          {cost.coveredByWarranty
            ? t("detail.warrantyPays", { amount: formatMoney(0) })
            : t("detail.customerPays", { amount: formatMoney(cost.chargedTotal) })}
        </p>
      </section>

      {done ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-neutral-500">{t("job.alreadyDone")}</p>
          <Link
            to={`/app/my-jobs/${job.id}/receipt`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF]"
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
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#B439FD] text-sm font-extrabold text-white disabled:opacity-50"
          >
            {completeMut.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("job.completeAmount", { amount: formatMoney(cost.chargedTotal) })}
          </button>
        </div>
      )}
    </div>
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
