export function Toast({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm px-4 py-2.5 rounded-lg bg-surface-2 border border-border">
      <span className="text-koreader">✓</span>
      {message}
    </div>
  );
}
