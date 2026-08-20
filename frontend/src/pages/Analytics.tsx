import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, Coins, Activity, MessageSquare, Sparkles } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { usageService } from "@/services/usage.service";
import { UsageResponse } from "@/types";
import { NexusCore } from "@/components/ui/nexus-core";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const PIE_COLORS = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
const BAR_COLORS = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

const TYPE_LABELS: Record<string, string> = { chat: "Chat", image: "Image", video: "Video" };

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
  boxShadow: "var(--shadow-popover)",
};

export function Analytics() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    usageService
      .getUsage()
      .then(({ data }) => setUsage(data))
      .catch((err: any) => setError(err.response?.data?.error || "Failed to load usage data"))
      .finally(() => setLoading(false));
  }, []);

  const byTypeData = usage ? Object.entries(usage.byType).map(([name, value]) => ({ name: TYPE_LABELS[name] || name, value })) : [];
  const byModelData = usage
    ? Object.entries(usage.byModel)
        .map(([name, value]) => ({ name: name.length > 20 ? `${name.slice(0, 18)}…` : name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    : [];

  const reduced = useReducedMotion();
  const transition = reduced ? { duration: 0 } : { duration: 0.25, ease: "easeOut" as const };

  return (
    <div className="relative min-h-full">
      <SpatialEnvironment />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {/* ── Hero: Analytics Core ─────────────────────────────────── */}
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5 text-primary" /> NexusAI
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                AI <span className="text-gradient">Analytics</span>
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Your usage across NexusAI — tokens, requests, and model breakdowns.
                Every metric comes from the real backend.
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.15, duration: 0.45, ease: "easeOut" }}
            className="relative hidden lg:block"
          >
            <NexusCore size={230} state={loading ? "thinking" : usage && usage.totalRequests > 0 ? "success" : "idle"} />
          </motion.div>
        </div>

        {error && (
          <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        ) : usage && usage.totalRequests === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No usage data yet"
            description="Start chatting or generating images and videos to see your stats here."
          />
        ) : usage ? (
          <>
            {/* ── KPI cards ──────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduced ? { duration: 0 } : { delay: 0.2, duration: 0.35 }}
              className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3"
            >
              <StatCard icon={Coins} label="Total tokens" value={usage.totalTokens} color="text-emerald-500 bg-emerald-500/10" index={0} />
              <StatCard icon={Activity} label="Total requests" value={usage.totalRequests} color="text-blue-500 bg-blue-500/10" index={1} />
              <StatCard
                icon={MessageSquare}
                label="Requests by type"
                value={Object.keys(usage.byType).length || "—"}
                color="text-primary bg-primary/10"
                index={2}
              />
            </motion.div>

            {/* ── Charts ─────────────────────────────────────────────── */}
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* By type donut */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { delay: 0.1, duration: 0.3 }}
                className="card-surface rounded-2xl p-6"
              >
                <h2 className="mb-1 text-sm font-semibold tracking-tight">By Type</h2>
                <p className="mb-4 text-xs text-muted-foreground">Requests split across chat, image and video</p>
                {byTypeData.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No breakdown yet</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={byTypeData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} strokeWidth={0}>
                          {byTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </motion.div>

              {/* By model bars */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { delay: 0.15, duration: 0.3 }}
                className="card-surface rounded-2xl p-6"
              >
                <h2 className="mb-1 text-sm font-semibold tracking-tight">Tokens by Model</h2>
                <p className="mb-4 text-xs text-muted-foreground">Where your tokens are being spent</p>
                {byModelData.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No model data yet</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byModelData} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={130} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                          {byModelData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </motion.div>
            </div>

            {/* ── Recent activity ─────────────────────────────────────── */}
            {usage.recent.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { delay: 0.2, duration: 0.3 }}
                className="card-surface mt-6 rounded-2xl p-6"
              >
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <Sparkles className="h-4 w-4 text-primary" /> Recent Activity
                </h2>
                <div className="space-y-1">
                  {usage.recent.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-accent/60">
                      <span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{item.model}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.tokens.toLocaleString()} tokens</span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
