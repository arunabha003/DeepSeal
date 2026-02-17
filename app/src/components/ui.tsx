import { cn } from "@/lib/utils";
import { type HTMLAttributes, type ReactNode } from "react";

export function Card({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bg-surface-1 border border-surface-3 rounded-lg p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
      {children}
    </h3>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | ReactNode;
  sub?: string;
  accent?: "success" | "danger" | "warning" | "accent";
}) {
  const colorMap = {
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
    accent: "text-accent",
  };
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted mb-1">{label}</p>
      <p className={cn("text-lg font-semibold font-mono", accent && colorMap[accent])}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: "default" | "success" | "danger" | "warning" | "accent";
  className?: string;
}) {
  const styles = {
    default: "bg-surface-3 text-zinc-300",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
    warning: "bg-warning/10 text-warning",
    accent: "bg-accent/10 text-accent",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", styles[variant], className)}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent/90 disabled:bg-accent/40",
    secondary: "bg-surface-3 text-zinc-300 hover:bg-surface-4 disabled:opacity-50",
    danger: "bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-50",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-4 py-2 rounded-md text-sm font-medium disabled:cursor-not-allowed",
        styles[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse bg-surface-3 rounded", className)}
    />
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-muted">
      {message}
    </div>
  );
}

export function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full",
        active ? "bg-success" : "bg-surface-4"
      )}
    />
  );
}
