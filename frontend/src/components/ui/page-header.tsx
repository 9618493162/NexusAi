import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface PageHeaderProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ icon: Icon, title, description, actions, className }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}
    >
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="relative mt-0.5 shrink-0">
            <div aria-hidden className="absolute -inset-1.5 rounded-2xl bg-primary/15 blur-xl" />
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-primary/5 text-primary ring-1 ring-primary/25">
              <Icon className="h-5.5 w-5.5" strokeWidth={1.8} />
            </div>
          </div>
        )}
        <div>
          <h1 className="display-tight text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground text-balance">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </motion.div>
  );
}
