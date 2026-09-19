import { useTranslation } from "react-i18next";
import { inputClass } from "../../components/Field";
import { defaultGrain, type ReportQuery } from "../../lib/reportQuery";
import type { ReportPreset, TrendGrain } from "../../lib/types";

const PRESETS: ReportPreset[] = ["week", "month", "quarter", "year", "all", "custom"];
const GRAINS: TrendGrain[] = ["day", "week", "month"];

export function DateRangeBar({
  query,
  onChange,
  grain,
}: {
  query: ReportQuery;
  onChange: (query: ReportQuery) => void;
  grain?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange({ ...query, preset, grain: grain ? defaultGrain(preset) : query.grain })}
            className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-bold ${
              query.preset === preset ? "bg-[#B439FD] text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"
            }`}
          >
            {t(`reports.preset.${preset}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {query.preset === "custom" ? (
          <>
            <label className="text-xs font-bold text-neutral-500">
              {t("reports.from")}
              <input
                type="date"
                className={`${inputClass} mt-1 w-40`}
                value={query.from}
                onChange={(event) => onChange({ ...query, from: event.target.value })}
              />
            </label>
            <label className="text-xs font-bold text-neutral-500">
              {t("reports.to")}
              <input
                type="date"
                className={`${inputClass} mt-1 w-40`}
                value={query.to}
                onChange={(event) => onChange({ ...query, to: event.target.value })}
              />
            </label>
          </>
        ) : null}
        {grain ? (
          <div className="flex gap-1 rounded-full bg-neutral-100 p-1">
            {GRAINS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onChange({ ...query, grain: item })}
                className={`h-8 rounded-full px-3 text-xs font-bold ${
                  (query.grain ?? "day") === item ? "bg-white text-[#B439FD] shadow-sm" : "text-neutral-500"
                }`}
              >
                {t(`reports.grain.${item}`)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
