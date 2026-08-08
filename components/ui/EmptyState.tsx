import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-16">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-2xl">
        {icon ?? "◫"}
      </div>
      <div className="text-xl font-semibold">{title}</div>
      {description && (
        <div className="text-[15px] text-text-2 max-w-md leading-relaxed">
          {description}
        </div>
      )}
      {action}
    </div>
  );
}
