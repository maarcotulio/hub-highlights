import type { ComponentProps } from "react";

type TextFieldProps = { label: string; invalid?: boolean } & ComponentProps<"input">;

export function TextField({
  label,
  invalid = false,
  id,
  className = "",
  ...props
}: TextFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm text-text-2">
        {label}
      </label>
      <input
        id={id}
        className={`text-[15px] px-3.5 py-3 rounded-lg border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60 ${
          invalid ? "border-danger" : "border-border"
        } ${className}`}
        {...props}
      />
    </div>
  );
}
