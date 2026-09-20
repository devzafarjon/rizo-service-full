import { AlertCircle, Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
  tone = "empty",
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  tone?: "empty" | "error";
}) {
  const Icon = tone === "error" ? AlertCircle : Inbox;
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
      <div
        className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${
          tone === "error" ? "bg-red-50 text-red-600" : "bg-[#F3E8FF] text-[#B439FD]"
        }`}
      >
        <Icon size={22} />
      </div>
      <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
      {body ? <p className="mt-2 max-w-md text-sm text-neutral-500">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
