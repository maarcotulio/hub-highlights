export function BookDetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-20 rounded bg-surface-2 mb-5" />
      <div className="flex justify-between items-start gap-6 mb-2">
        <div>
          <div className="h-8 w-64 rounded bg-surface-2 mb-2.5" />
          <div className="h-4 w-40 rounded bg-surface-2" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-surface-2" />
      </div>
      <div className="h-3.5 w-24 rounded bg-surface-2 mt-6 mb-7" />
      <div className="h-11 w-full rounded-lg bg-surface-2 mb-7" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="py-5 border-b border-border flex flex-col gap-2.5">
          <div className="h-5 w-full max-w-xl rounded bg-surface-2" />
          <div className="h-3 w-32 rounded bg-surface-2 ml-4" />
        </div>
      ))}
    </div>
  );
}
