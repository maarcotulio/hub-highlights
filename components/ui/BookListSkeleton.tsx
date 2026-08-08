export function BookListSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-44 rounded bg-surface-2 mb-8" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-5 py-5 border-b border-border"
        >
          <div className="w-11 h-11 rounded-lg bg-surface-2" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-3.5 w-72 max-w-full rounded bg-surface-2" />
            <div className="h-3 w-40 rounded bg-surface-2" />
          </div>
          <div className="h-5 w-20 rounded-full bg-surface-2" />
          <div className="h-3.5 w-16 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
