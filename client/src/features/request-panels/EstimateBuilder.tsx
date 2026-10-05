import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass, textareaClass } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { formatMoney } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { Named } from "../../lib/types";

export type LineDraft = {
  kind: "service" | "part" | "labor" | "other";
  serviceCatalogItemId?: string;
  sparePartId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  isOptional: boolean;
};

type CatalogRow = Named & { id: string; price: number; stockQuantity?: number };

/** Builds a price estimate: catalog services and parts, plus free-text labor or other costs. Optional lines are the customer's choice. */
export function EstimateBuilder({
  services,
  parts,
  busy,
  allowDraft = true,
  onSubmit,
}: {
  services: CatalogRow[];
  parts: CatalogRow[];
  busy: boolean;
  allowDraft?: boolean;
  onSubmit: (payload: { lines: LineDraft[]; note: string; send: boolean }) => void;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [note, setNote] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  const total = lines.filter((line) => !line.isOptional).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const optionalTotal = lines.filter((line) => line.isOptional).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  function patch(index: number, changes: Partial<LineDraft>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...changes } : line)));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className={`${inputClass} bg-white`}
          value=""
          onChange={(event) => {
            const item = services.find((row) => row.id === event.target.value);
            if (item) setLines((current) => [...current, { kind: "service", serviceCatalogItemId: item.id, name: localizedName(item), quantity: 1, unitPrice: item.price, isOptional: false }]);
          }}
        >
          <option value="">{t("estimate.addService")}</option>
          {services.map((item) => (
            <option key={item.id} value={item.id}>
              {localizedName(item)} · {formatMoney(item.price)}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} bg-white`}
          value=""
          onChange={(event) => {
            const item = parts.find((row) => row.id === event.target.value);
            if (item) setLines((current) => [...current, { kind: "part", sparePartId: item.id, name: localizedName(item), quantity: 1, unitPrice: item.price, isOptional: false }]);
          }}
        >
          <option value="">{t("estimate.addPart")}</option>
          {parts.map((item) => (
            <option key={item.id} value={item.id}>
              {localizedName(item)} · {formatMoney(item.price)}
              {item.stockQuantity != null ? ` · ${t("common.inStock", { count: item.stockQuantity })}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <input className={`${inputClass} min-w-0 flex-1`} value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder={t("estimate.customName")} />
        <input className={`${inputClass} w-32`} type="number" min={0} step={1000} value={customPrice} onChange={(event) => setCustomPrice(event.target.value)} placeholder={t("common.price")} />
        <button
          type="button"
          disabled={!customName.trim()}
          onClick={() => {
            setLines((current) => [...current, { kind: "labor", name: customName.trim(), quantity: 1, unitPrice: Number(customPrice) || 0, isOptional: false }]);
            setCustomName("");
            setCustomPrice("");
          }}
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-lg bg-neutral-100 px-4 text-sm font-bold text-neutral-800 disabled:opacity-50"
        >
          <Plus size={16} />
          {t("estimate.addLabor")}
        </button>
      </div>

      {lines.length === 0 ? <p className="rounded-xl bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">{t("estimate.empty")}</p> : null}
      <ul className="space-y-2">
        {lines.map((line, index) => (
          <li key={index} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{line.name}</p>
                <p className="text-xs text-neutral-500">{t(`estimate.kind.${line.kind}`)}</p>
              </div>
              <button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} aria-label={t("common.remove")} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {line.kind === "part" || line.kind === "labor" || line.kind === "other" ? (
                <input className="h-10 w-20 rounded-lg border border-gray-300 px-2 text-sm font-semibold" type="number" min={1} max={99} value={line.quantity} onChange={(event) => patch(index, { quantity: Math.max(1, Number(event.target.value) || 1) })} aria-label={t("common.qty")} />
              ) : null}
              <input className="h-10 w-32 rounded-lg border border-gray-300 px-2 text-sm font-semibold" type="number" min={0} step={1000} value={line.unitPrice} onChange={(event) => patch(index, { unitPrice: Math.max(0, Number(event.target.value) || 0) })} aria-label={t("common.price")} />
              <label className="ml-auto flex items-center gap-2 text-sm font-semibold text-neutral-700">
                <input type="checkbox" checked={line.isOptional} onChange={(event) => patch(index, { isOptional: event.target.checked })} />
                {t("estimate.optional")}
              </label>
            </div>
          </li>
        ))}
      </ul>

      <Field label={t("estimate.note")}>
        <textarea className={textareaClass} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
      </Field>

      <div className="rounded-xl bg-[#F5EBFD] px-4 py-3 text-sm font-bold text-[#5A0085]">
        {t("estimate.total")}: {formatMoney(total)}
        {optionalTotal > 0 ? <span className="ml-2 font-semibold text-neutral-600">+ {formatMoney(optionalTotal)} {t("estimate.ifChosen")}</span> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || lines.length === 0}
          onClick={() => onSubmit({ lines, note, send: true })}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white hover:bg-[#6500BD] disabled:opacity-50"
        >
          {busy ? <Spinner className="h-4 w-4" /> : null}
          {t("estimate.saveSend")}
        </button>
        {allowDraft ? (
          <button
            type="button"
            disabled={busy || lines.length === 0}
            onClick={() => onSubmit({ lines, note, send: false })}
            className="inline-flex h-12 items-center justify-center rounded-lg bg-neutral-100 px-6 text-[12.8px] font-bold text-neutral-800 disabled:opacity-50"
          >
            {t("estimate.saveDraft")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
