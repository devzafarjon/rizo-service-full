import type { ReactNode } from "react";
import { InfoTip } from "./InfoTip";

export const inputClass =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 outline-none ring-[#B439FD] focus:ring-2";

export const textareaClass =
  "min-h-24 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 outline-none ring-[#B439FD] focus:ring-2";

export function Field({
  label,
  hint,
  tooltip,
  children,
}: {
  label: string;
  hint?: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-neutral-700">
        {label}
        {tooltip ? <InfoTip text={tooltip} /> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}
