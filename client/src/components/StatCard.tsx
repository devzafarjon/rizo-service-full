import type { ReactNode } from "react";

export type StatAccent = "purple" | "green" | "red" | "orange";

const ACCENT_BORDER: Record<StatAccent, string> = {
  purple: "border-l-[#7B00E0]",
  green: "border-l-[#25B003]",
  red: "border-l-[#EC1F00]",
  orange: "border-l-[#F7941E]",
};

// RizoPost stat tile: white card, colored left edge, uppercase label, large purple value.
// It always fills its grid cell (h-full) so tiles in one row stay the same height; the label takes the free space and the
// value (and the optional footer, e.g. a change vs the previous period) sit at the bottom so the numbers line up across a row.
// `reserveFooter` keeps two footer lines of space once tiles sit side by side (the change text may wrap) on tiles without one, so a row that mixes both still lines up.
export function StatCard({
  label,
  value,
  accent = "purple",
  footer,
  reserveFooter = false,
}: {
  label: string;
  value: string;
  accent?: StatAccent;
  footer?: ReactNode;
  reserveFooter?: boolean;
}) {
  return (
    <div className={`flex h-full min-h-[104px] flex-col rounded-2xl border border-l-4 border-gray-200 bg-white px-5 py-4 shadow-sm ${ACCENT_BORDER[accent]}`}>
      <p className="flex-1 text-[13px] leading-snug font-semibold tracking-wide text-gray-600 uppercase">{label}</p>
      <p className="mt-1.5 text-2xl leading-tight font-bold tracking-tight text-[#5A0085] tabular-nums">{value}</p>
      {footer || reserveFooter ? <div className={`mt-1 text-xs leading-4 font-bold ${reserveFooter ? "sm:min-h-8" : ""}`}>{footer}</div> : null}
    </div>
  );
}
