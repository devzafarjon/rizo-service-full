import { useTranslation } from "react-i18next";
import { inputClass } from "../../components/Field";
import { defaultGrain, type ReportQuery } from "../../lib/reportQuery";
import type { ReportPreset, TrendGrain } from "../../lib/types";
import { segmentedItemClass } from "../../components/segmented";

// On phones each group is a 3-column grid, so every option has the same width and the rows line up; from sm up it is one rail.
const GROUP = "grid max-w-full grid-cols-3 gap-1 rounded-lg border border-gray-200 bg-[#F1F5F9] p-1 sm:inline-flex sm:flex-wrap";
const ITEM = "w-full sm:w-auto";

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
    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div className={GROUP}>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange({ ...query, preset, grain: grain ? defaultGrain(preset) : query.grain })}
            className={`${segmentedItemClass(query.preset === preset)} ${ITEM}`}
          >
            {t(`reports.preset.${preset}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 max-sm:[&>div]:w-full">
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
          <div className={GROUP}>
            {GRAINS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onChange({ ...query, grain: item })}
                className={`${segmentedItemClass((query.grain ?? "day") === item)} ${ITEM}`}
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
