import { useTranslation } from "react-i18next";
import { formatDurationHours, formatDurationMs, formatStamp } from "../lib/format";
import type { TimelineEvent } from "../lib/types";

const DOT: Record<TimelineEvent["kind"], string> = {
  created: "bg-[#B439FD]",
  received: "bg-[#B439FD]",
  accepted: "bg-[#B439FD]",
  arrived: "bg-[#F6921E]",
  paused: "bg-[#F6921E]",
  resumed: "bg-[#B439FD]",
  completed: "bg-emerald-500",
};

export function RequestTimeline({ events }: { events: TimelineEvent[] }) {
  const { t } = useTranslation();
  if (events.length === 0) {
    return <p className="text-sm text-neutral-500">{t("timeline.empty")}</p>;
  }

  return (
    <ol className="space-y-0">
      {events.map((event, index) => {
        const planned = event.params?.hours != null ? formatDurationHours(Number(event.params.hours)) : "";
        const lasted = event.params?.durationMs != null ? formatDurationMs(Number(event.params.durationMs)) : "";
        const title = t(event.titleKey ?? `timeline.${event.kind}`, { defaultValue: event.title });
        const detail = event.detailKey
          ? t(event.detailKey, {
              reason: event.params?.reason,
              planned,
              lasted,
              defaultValue: event.detail ?? "",
            })
          : event.detail;
        return (
          <li key={event.key} className="flex gap-3">
            <div className="flex w-3 flex-col items-center">
              <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${DOT[event.kind]}`} />
              {index < events.length - 1 ? <span className="mt-1 w-px flex-1 bg-neutral-200" /> : null}
            </div>
            <div className={index < events.length - 1 ? "pb-5" : "pb-0"}>
              <p className="text-sm font-bold text-neutral-900">{title}</p>
              <p className="text-xs font-semibold text-neutral-500">{formatStamp(event.at)}</p>
              {detail ? <p className="mt-1 text-sm text-neutral-600">{detail}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
