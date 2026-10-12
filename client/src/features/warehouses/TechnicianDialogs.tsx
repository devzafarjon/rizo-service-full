import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { api, apiErrorMessage } from "../../lib/api";
import { localizedName } from "../../lib/localized";
import type { JobWorkPayload, SourceOption } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { optionKey, SourcePicker } from "./SourcePicker";

type SourcesPayload = { destination: { id: string; name: string }; atDestination: number; carried: number; options: SourceOption[] };

function Footer({ onClose, pending, disabled, label }: { onClose: () => void; pending: boolean; disabled: boolean; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
        {t("common.cancel")}
      </button>
      <button type="submit" disabled={pending || disabled} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-60">
        {pending ? <Spinner className="h-4 w-4" /> : null}
        {label}
      </button>
    </div>
  );
}

function Sources({ partId, quantity, jobId, choice, setChoice, showDestination = true }: { partId: string; quantity: number; jobId?: string; choice: string; setChoice: (key: string) => void; showDestination?: boolean }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const sources = useQuery({
    queryKey: ["staff", "my-jobs", "part-sources", partId, quantity, jobId ?? ""],
    enabled: Boolean(token) && Boolean(partId),
    queryFn: () => api<SourcesPayload>(`/api/staff/my-jobs/part-sources?partId=${partId}&quantity=${quantity}${jobId ? `&jobId=${jobId}` : ""}`, { token }),
  });
  useEffect(() => {
    const best = sources.data?.options.find((option) => option.recommended);
    if (best) setChoice(optionKey(best));
  }, [sources.data]);
  if (sources.isLoading) return <Spinner className="h-5 w-5" />;
  if (!sources.data) return null;
  return (
    <div>
      <p className="mb-1 text-xs text-neutral-500">
        {showDestination ? `${t("warehouse.deliverTo", { name: sources.data.destination.name })} · ${t("warehouse.thereNow", { count: sources.data.atDestination })}` : null}
        {sources.data.carried > 0 ? `${showDestination ? " · " : ""}${t("job.carried", { count: sources.data.carried })}` : ""}
      </p>
      <p className="mb-2 text-xs font-bold tracking-wide text-neutral-500 uppercase">{t("warehouse.source.title")}</p>
      <SourcePicker options={sources.data.options} value={choice} onChange={(key) => setChoice(key)} />
    </div>
  );
}

/** A part the job needs but the shelf lacks: see which warehouses have it and how soon, pick one (the fastest is preselected). */
export function PartRequestDialog({ jobId, part, onClose, onDone }: { jobId: string; part: { id: string; name: string; nameUz?: string | null; nameRu?: string | null; nameEn?: string | null } | null; onClose: () => void; onDone: (data: JobWorkPayload) => void }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState("");
  useEffect(() => {
    if (part) {
      setQuantity("1");
      setNote("");
      setChoice("");
    }
  }, [part?.id]);
  const qty = Math.max(1, Number(quantity) || 1);
  const send = useMutation({
    mutationFn: () =>
      api<JobWorkPayload>(`/api/staff/my-jobs/${jobId}/part-requests`, {
        method: "POST",
        token,
        body: JSON.stringify({ sparePartId: part!.id, quantity: qty, note: note || null, source: choice === "supplier" ? { type: "supplier" } : { type: "warehouse", warehouseId: choice.replace("wh:", "") } }),
      }),
    onSuccess: (data) => {
      notify(t("warehouse.requestSent"));
      onDone(data);
      onClose();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  return (
    <Modal open={Boolean(part)} onClose={onClose} title={t("warehouse.partRequestTitle")}>
      {part ? (
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            send.mutate();
          }}
        >
          <p className="text-sm font-bold">{localizedName(part)}</p>
          <Field label={t("common.qty")}>
            <input className={inputClass} type="number" min={1} max={99} required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </Field>
          <Sources partId={part.id} quantity={qty} jobId={jobId} choice={choice} setChoice={setChoice} />
          <Field label={t("payments.note")}>
            <input className={inputClass} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <Footer onClose={onClose} pending={send.isPending} disabled={!choice} label={t("warehouse.ask")} />
        </form>
      ) : null}
    </Modal>
  );
}

/** Top up the van: pick a part, see where it can come from, and ask for it to be sent to me. */
export function VanRequestDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const [q, setQ] = useState("");
  const [partId, setPartId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState("");
  useEffect(() => {
    if (open) {
      setQ("");
      setPartId("");
      setQuantity("1");
      setNote("");
      setChoice("");
    }
  }, [open]);
  const parts = useQuery({
    queryKey: ["staff", "my-jobs", "parts", q],
    enabled: Boolean(token) && open,
    queryFn: () => api<{ parts: Array<{ id: string; name: string; nameUz?: string | null; nameRu?: string | null; nameEn?: string | null; stockQuantity: number }> }>(`/api/staff/my-jobs/parts?q=${encodeURIComponent(q)}`, { token }),
  });
  const qty = Math.max(1, Number(quantity) || 1);
  const send = useMutation({
    mutationFn: () => api("/api/staff/my-jobs/stock/requests", { method: "POST", token, body: JSON.stringify({ sparePartId: partId, quantity: qty, fromWarehouseId: choice.replace("wh:", ""), note: note || null }) }),
    onSuccess: () => {
      notify(t("warehouse.requestSent"));
      onDone();
      onClose();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  return (
    <Modal open={open} onClose={onClose} title={t("warehouse.vanRequestTitle")}>
      <form
        className="space-y-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          send.mutate();
        }}
      >
        <Field label={t("catalog.part")}>
          <input className={inputClass} type="search" placeholder={t("common.search")} value={q} onChange={(event) => setQ(event.target.value)} />
        </Field>
        <select className={`${inputClass} bg-white`} required value={partId} onChange={(event) => setPartId(event.target.value)} aria-label={t("catalog.part")}>
          <option value="">{t("parts.selectPart")}</option>
          {(parts.data?.parts ?? []).map((part) => (
            <option key={part.id} value={part.id}>
              {localizedName(part)} · {t("common.inStock", { count: part.stockQuantity })}
            </option>
          ))}
        </select>
        <Field label={t("common.qty")}>
          <input className={inputClass} type="number" min={1} max={99} required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </Field>
        {partId ? <Sources partId={partId} quantity={qty} choice={choice} setChoice={setChoice} showDestination={false} /> : null}
        <Field label={t("payments.note")}>
          <input className={inputClass} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <p className="text-xs text-neutral-500">{t("warehouse.vanHint")}</p>
        <Footer onClose={onClose} pending={send.isPending} disabled={!partId || !choice || choice === "supplier"} label={t("warehouse.ask")} />
      </form>
    </Modal>
  );
}
