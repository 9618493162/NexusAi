import { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  title: string;
  icon?: ReactNode;
  /** Slide-in side — matches the workspace's desktop rail placement. */
  side?: "left" | "right";
  /** Width/position overrides, e.g. "w-full max-w-2xl". */
  panelClassName?: string;
  /** When true (default) the drawer only shows below `lg`, leaving the desktop
   * layout untouched. Set false for panels that ARE the desktop detail view
   * (e.g. Memory's detail drawer), which should slide in on every size. */
  mobileOnly?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Mobile slide-in drawer used by the workspaces for their secondary panels.
 * Never shows on `lg+` (desktop keeps its inline/side layout); on smaller
 * screens the panel slides in over a blurred overlay.
 *
 * Reduced motion: renders the overlay + panel at their natural resting
 * positions with no animation, so the drawer is always usable and never
 * stuck off-screen when rAF is throttled.
 */
export function MobileDrawer({
  open,
  onClose,
  title,
  icon,
  side = "left",
  panelClassName,
  mobileOnly = true,
  footer,
  children,
}: MobileDrawerProps) {
  const reducedMotion = useReducedMotion();

  if (!open) return null;

  const fromLeft = side === "left";
  const sizeClass = mobileOnly ? " lg:hidden" : "";
  const overlay = (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm${sizeClass}`}
      aria-hidden="true"
    />
  );

  return (
    <>
      {reducedMotion ? (
        overlay
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm${sizeClass}`}
          aria-hidden="true"
        />
      )}
      <motion.aside
        initial={{ x: reducedMotion ? 0 : fromLeft ? -320 : 320 }}
        animate={{ x: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          `fixed inset-y-0 z-50 flex flex-col border-border bg-sidebar shadow-2xl${sizeClass}`,
          fromLeft ? "left-0 border-r" : "right-0 border-l",
          panelClassName ?? "w-72 max-w-[85vw]"
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {icon && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent text-primary ring-1 ring-primary/20">
                {icon}
              </div>
            )}
            <span className="truncate text-sm font-semibold tracking-tight">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">{children}</div>

        {footer && <div className="shrink-0 border-t border-sidebar-border p-2">{footer}</div>}
      </motion.aside>
    </>
  );
}
