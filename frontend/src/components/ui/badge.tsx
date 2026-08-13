import * as React from "react";
import { cn } from "@/utils/cn";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive" | "info";

const variants: Record<BadgeVariant, string> = {
  default: "bg-primary/12 text-primary border-primary/25",
  secondary: "bg-secondary text-secondary-foreground border-border",
  outline: "bg-transparent text-muted-foreground border-border",
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/12 text-warning border-warning/30",
  destructive: "bg-destructive/12 text-destructive border-destructive/25",
  info: "bg-info/12 text-info border-info/25",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
