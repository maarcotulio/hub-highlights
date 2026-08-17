import { Check } from "lucide-react";

export function Toast({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm px-4 py-2.5 rounded-lg bg-surface-2 border border-border">
      <Check aria-hidden="true" className="w-4 h-4 shrink-0 text-koreader" />
      {message}
    </div>
  );
}
