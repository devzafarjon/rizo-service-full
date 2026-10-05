import { useTranslation } from "react-i18next";
import { inputClass } from "../../components/Field";
import { defaultGrain, type ReportQuery } from "../../lib/reportQuery";
import type { ReportPreset, TrendGrain } from "../../lib/types";
import { segmentedGroupClass, segmentedItemClass } from "../../components/segmented";

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
      <div className={segmentedGroupClass}>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange({ ...query, preset, grain: grain ? defaultGrain(preset) : query.grain })}
            className={segmentedItemClass(query.preset === preset)}
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
          <div className={segmentedGroupClass}>
            {GRAINS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onChange({ ...query, grain: item })}
                className={segmentedItemClass((query.grain ?? "day") === item, "sm")}
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
