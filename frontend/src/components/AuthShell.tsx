import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Sparkles, MessageSquare, Brain, Zap } from "lucide-react";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { NexusCore } from "@/components/ui/nexus-core";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      {/* Spatial environment — the same depth plane as the app shell */}
      <SpatialEnvironment />

      {/* ── Left panel: 3D brand showcase (hidden on mobile) ── */}
      <div className="relative hidden w-1/2 items-center justify-center lg:flex">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[120px]" />
          <div className="absolute bottom-20 left-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-[80px]" />
          <div className="absolute right-20 top-20 h-48 w-48 rounded-full bg-cyan-500/8 blur-[60px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative z-10 flex flex-col items-center"
        >
          <NexusCore size={200} />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-10 text-center"
          >
            <h2 className="display-tight text-3xl font-bold tracking-tight">NexusAI</h2>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground text-balance">
              Your intelligent workspace for chat, creation, analysis and research — all in one place.
            </p>
          </motion.div>

          {/* Floating capability pills */}
          <div className="relative mt-8 h-24 w-80">
            {[
              { icon: MessageSquare, label: "Chat", delay: 0, x: 0, y: 0 },
              { icon: Brain, label: "Research", delay: 0.1, x: 140, y: -10 },
              { icon: Zap, label: "Create", delay: 0.2, x: 280, y: 0 },
            ].map((item) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + item.delay, duration: 0.4 }}
                className="absolute"
                style={{ left: item.x, top: item.y }}
              >
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 4 + item.delay, repeat: Infinity, ease: "easeInOut" }}
                  className="flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-4 py-2 text-sm font-medium shadow-popover backdrop-blur"
                >
                  <item.icon className="h-4 w-4 text-primary" strokeWidth={2} />
                  {item.label}
                </motion.div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Right panel: authentication form ── */}
      <div className="relative flex w-full items-center justify-center p-4 sm:p-6 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Brand — mobile only */}
          <div className="mb-8 text-center lg:hidden">
            <Link to="/" className="mb-6 inline-flex items-center gap-2.5" aria-label="NexusAI home">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-indigo-500 text-primary-foreground shadow-sm">
                <Sparkles className="h-5 w-5" strokeWidth={2} />
              </div>
              <span className="text-xl font-bold tracking-tight">
                Nexus<span className="text-gradient">AI</span>
              </span>
            </Link>
          </div>

          {/* Desktop heading */}
          <div className="mb-8 hidden text-left lg:block">
            <Link to="/" className="mb-6 inline-flex items-center gap-2.5" aria-label="NexusAI home">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-indigo-500 text-primary-foreground shadow-sm">
                <Sparkles className="h-4.5 w-4.5" strokeWidth={2} />
              </div>
              <span className="text-lg font-bold tracking-tight">
                Nexus<span className="text-gradient">AI</span>
              </span>
            </Link>
            <h1 className="display-tight mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {/* Mobile heading */}
          <div className="mb-6 text-center lg:hidden">
            <h1 className="display-tight text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {/* Glass card — the auth form surface */}
          <div className="glass-strong relative overflow-hidden rounded-2xl p-6 shadow-popover sm:p-7">
            <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative">{children}</div>
          </div>

          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </motion.div>
      </div>
    </div>
  );
}
