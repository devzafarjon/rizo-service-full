import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { InfoTip } from "./InfoTip";

// RizoPost form controls: 48px, #CBD0DD border, 6px corners, purple focus glow.
export const inputClass =
  "h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-[13px] font-semibold text-gray-800 outline-none transition placeholder:font-normal placeholder:text-gray-400 focus:border-[#7B00E0]/40 focus:ring-[3px] focus:ring-[#7B00E0]/25 disabled:bg-gray-50";

export const textareaClass =
  "min-h-24 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-[13px] font-semibold text-gray-800 outline-none transition placeholder:font-normal placeholder:text-gray-400 focus:border-[#7B00E0]/40 focus:ring-[3px] focus:ring-[#7B00E0]/25";

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
  const generatedId = useId();

  // A tooltip button inside <label> would become the label's control, so tooltip
  // fields link the label to the input by id instead of by nesting.
  if (tooltip && isValidElement(children)) {
    const child = children as ReactElement<{ id?: string }>;
    const id = child.props.id ?? generatedId;
    return (
      <div className="block">
        <span className="mb-1.5 flex items-center gap-1 text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">
          <label htmlFor={id}>{label}</label>
          <InfoTip text={tooltip} />
        </span>
        {cloneElement(child, { id })}
        {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
      </div>
    );
  }

  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">
        {label}
        {tooltip ? <InfoTip text={tooltip} /> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}
