import type { ReactNode } from "react";

export const inputClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-white px-3 outline-none ring-[#B439FD] focus:ring-2";

export const textareaClass =
  "min-h-24 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none ring-[#B439FD] focus:ring-2";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-neutral-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}
