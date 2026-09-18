import i18n from "../i18n";

export type TimerTone = "green" | "yellow" | "red";

export function remainingMs(startsAt: string, durationMs: number, now: number) {
  return new Date(startsAt).getTime() + durationMs - now;
}

export function timerTone(startsAt: string, durationMs: number, now: number): TimerTone {
  const remaining = remainingMs(startsAt, durationMs, now);
  if (remaining <= 0) return "red";
  if (remaining / durationMs <= 0.25) return "yellow";
  return "green";
}

export function formatCountdown(startsAt: string, durationMs: number, now: number) {
  const remaining = remainingMs(startsAt, durationMs, now);
  const overdue = remaining < 0;
  const totalSeconds = Math.floor(Math.abs(remaining) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const clock = days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
  if (!overdue) return clock;
  return i18n.t("timer.overdue", { clock });
}

export const TIMER_TONE_CLASS: Record<TimerTone, string> = {
  green: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  yellow: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200",
};
