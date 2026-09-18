export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-lg bg-neutral-200" />
      <div className="h-4 w-80 max-w-full rounded bg-neutral-200" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 rounded-2xl bg-white" />
        <div className="h-28 rounded-2xl bg-white" />
        <div className="h-28 rounded-2xl bg-white" />
      </div>
      <div className="h-64 rounded-2xl bg-white" />
    </div>
  );
}
