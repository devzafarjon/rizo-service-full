import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
      <div className="mb-4 h-12 w-12 rounded-2xl bg-[#F3E8FF]" />
      <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-neutral-500">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
