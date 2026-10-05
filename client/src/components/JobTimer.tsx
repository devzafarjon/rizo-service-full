import { TIMER_TONE_CLASS, formatCountdown, timerTone } from "../lib/timer";
import type { TechJobTimer } from "../lib/types";

/** Green -> yellow (last quarter) -> red (expired) countdown. */
export function JobTimerChip({ timer, now, size = "md" }: { timer: TechJobTimer | null; now: number; size?: "sm" | "md" }) {
  if (!timer) return null;
  const tone = timerTone(timer.startsAt, timer.durationMs, now);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl font-extrabold tabular-nums ${TIMER_TONE_CLASS[tone]} ${
        size === "sm" ? "px-2 py-1 text-xs" : "w-full px-3 py-2 text-sm"
      }`}
    >
      {formatCountdown(timer.startsAt, timer.durationMs, now)}
    </span>
  );
}
