import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Spatial environment — the same depth plane as the app shell */}
      <SpatialEnvironment />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-md"
      >
        {/* Brand */}
        <div className="mb-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2.5" aria-label="NexusAI home">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-indigo-500 text-primary-foreground shadow-sm">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
            </div>
            <span className="text-xl font-bold tracking-tight">
              Nexus<span className="text-gradient">AI</span>
            </span>
          </Link>
          <h1 className="display-tight text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        {/* Glass card with a soft top-light and glow — the cinematic auth surface */}
        <div className="glass-strong relative overflow-hidden rounded-2xl p-6 shadow-popover sm:p-7">
          <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">{children}</div>
        </div>

        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </motion.div>
    </div>
  );
}
