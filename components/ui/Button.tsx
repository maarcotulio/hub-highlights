import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-text hover:opacity-90 disabled:bg-surface-2 disabled:text-text-2",
  secondary:
    "bg-surface border border-border text-text hover:bg-surface-2 disabled:bg-surface-2 disabled:text-text-2",
  ghost: "bg-transparent text-text-2 hover:text-text disabled:text-text-2",
  destructive:
    "bg-transparent border border-danger text-danger hover:opacity-80 disabled:border-border disabled:text-text-2",
};

type ButtonProps = { variant?: Variant } & ComponentProps<"button">;

export function Button({
  variant = "primary",
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`text-sm font-medium px-5 py-2.5 rounded-lg cursor-pointer disabled:cursor-not-allowed transition-opacity ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
