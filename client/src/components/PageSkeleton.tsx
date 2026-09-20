export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-lg bg-neutral-200" />
      <div className="h-4 w-80 max-w-full rounded bg-neutral-200" />
      <div className={`grid gap-4 ${cards >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}>
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="h-28 rounded-2xl bg-white" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-2xl bg-white" />
        <div className="h-64 rounded-2xl bg-white" />
      </div>
    </div>
  );
}
