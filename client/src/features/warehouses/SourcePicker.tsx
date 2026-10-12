import { useTranslation } from "react-i18next";
import { formatDate } from "../../lib/format";
import { regionLabel } from "../../lib/regions";
import type { SourceOption } from "../../lib/types";

export const optionKey = (option: SourceOption) => (option.type === "warehouse" ? `wh:${option.warehouse.id}` : "supplier");

/** Where the part can come from, fastest first. The best one carries a badge; a warehouse that holds too few cannot be chosen. */
export function SourcePicker({ options, value, onChange }: { options: SourceOption[]; value: string; onChange: (key: string, option: SourceOption) => void }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-2">
      {options.map((option) => {
        const key = optionKey(option);
        const disabled = option.type === "warehouse" && !option.enough;
        const selected = value === key;
        return (
          <li key={key}>
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selected ? "border-[#7B00E0] bg-[#F5EBFD]" : "border-neutral-200 bg-white"} ${disabled ? "cursor-not-allowed opacity-55" : "hover:border-[#7B00E0]"}`}>
              <input type="radio" name="part-source" className="mt-1" checked={selected} disabled={disabled} onChange={() => onChange(key, option)} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
                  {option.type === "warehouse" ? option.warehouse.name : t("warehouse.source.supplier")}
                  {option.type === "warehouse" ? <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">{t(`warehouse.kind.${option.warehouse.kind}`)}</span> : option.supplier ? <span className="text-xs font-semibold text-neutral-500">{option.supplier.name}</span> : null}
                  {option.recommended ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">{t("warehouse.source.fastest")}</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-neutral-600">
                  {option.type === "warehouse" ? `${regionLabel(option.warehouse.regionCode)} · ${t("warehouse.source.available", { count: option.available })}${option.enough ? "" : ` · ${t("warehouse.source.notEnough")}`} · ` : ""}
                  {t("warehouse.source.eta", { count: option.etaDays })} ({formatDate(option.etaDate)})
                </p>
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
