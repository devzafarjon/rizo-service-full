import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { inputClass } from "./Field";
import { api } from "../lib/api";
import type { VisitSlot } from "../lib/types";

export type VisitChoice = { date: string; slot: string };

function ymd(offsetDays: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

/**
 * Pick a day and one of the free booking windows. `slotsUrl(date)` builds the API address for a day (staff and
 * customers use different endpoints); the same widget serves the portal, the office and the new-request forms.
 */
export function VisitPicker({
  token,
  slotsUrl,
  value,
  onChange,
  disabled,
}: {
  token: string | null;
  slotsUrl: (date: string) => string;
  value: VisitChoice | null;
  onChange: (value: VisitChoice | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const date = value?.date ?? "";
  const slots = useQuery({
    queryKey: ["visit-slots", date, slotsUrl(date)],
    enabled: Boolean(token && date),
    queryFn: () => api<{ date: string; slots: VisitSlot[] }>(slotsUrl(date), { token }),
  });

  return (
    <div className="space-y-3">
      <input
        className={inputClass}
        type="date"
        min={ymd(0)}
        max={ymd(30)}
        value={date}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value ? { date: event.target.value, slot: "" } : null)}
        aria-label={t("visit.date")}
      />
      {date ? (
        slots.isLoading ? (
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        ) : slots.isError ? (
          <p className="text-sm text-red-600">{t("errors.generic")}</p>
        ) : (slots.data?.slots ?? []).some((slot) => slot.free) ? (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("visit.window")}>
            {(slots.data?.slots ?? []).map((slot) => {
              const chosen = value?.slot === slot.slot;
              return (
                <button
                  key={slot.slot}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={!slot.free || disabled}
                  onClick={() => onChange({ date, slot: slot.slot })}
                  className={`min-h-11 rounded-xl border px-4 text-sm font-bold transition ${
                    chosen ? "border-[#7B00E0] bg-[#F5EBFD] text-[#7B00E0]" : slot.free ? "border-neutral-300 text-neutral-800 hover:border-[#7B00E0]" : "border-neutral-200 text-neutral-400 line-through"
                  }`}
                >
                  {slot.slot.replace("-", " – ")}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">{t("visit.noSlots")}</p>
        )
      ) : (
        <p className="text-sm text-neutral-500">{t("visit.pickDate")}</p>
      )}
    </div>
  );
}
