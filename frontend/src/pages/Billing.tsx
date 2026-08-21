import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CreditCard, BarChart3, MessageSquare, FileText, Image as ImageIcon,
  Video, Mic, RefreshCw, Sparkles, Shield, Zap, Clock, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexusCore } from "@/components/ui/nexus-core";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { cn } from "@/utils/cn";

interface UsageData {
  totalTokens: number;
  totalRequests: number;
  byModel: Record<string, { requests: number; tokens: number }>;
  byType: Record<string, { requests: number; tokens: number }>;
  recentActivity: Array<{ timestamp: string; model: string; tokens: number; type: string }>;
}

const PLAN_FEATURES = [
  { label: "AI Chat", icon: MessageSquare, free: "Unlimited", pro: "Unlimited" },
  { label: "File Analysis", icon: FileText, free: "Unlimited", pro: "Unlimited" },
  { label: "Research", icon: Sparkles, free: "Unlimited", pro: "Unlimited + Deep" },
  { label: "Image Generation", icon: ImageIcon, free: "Unlimited (BYOK)", pro: "Built-in FLUX" },
  { label: "Voice & Translation", icon: Mic, free: "Unlimited (BYOK)", pro: "Built-in Deepgram" },
  { label: "AI Agents", icon: Zap, free: "Unlimited", pro: "Unlimited" },
  { label: "Workflows", icon: Sparkles, free: "Unlimited", pro: "Unlimited" },
  { label: "Projects", icon: Sparkles, free: "Unlimited", pro: "Unlimited" },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function Billing() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const token = (await import("@/store/auth.store")).useAuthStore.getState().accessToken;
      const res = await fetch(`${API_URL}/api/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load usage");
      const data = await res.json();
      setUsage(data);
    } catch (err: any) {
      setError(err.message || "Could not load usage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  const typeLabels: Record<string, { label: string; icon: typeof MessageSquare; color: string }> = {
    chat: { label: "Chat", icon: MessageSquare, color: "text-primary bg-primary/10" },
    image: { label: "Image Gen", icon: ImageIcon, color: "text-pink-500 bg-pink-500/10" },
    video: { label: "Video Gen", icon: Video, color: "text-purple-500 bg-purple-500/10" },
    research: { label: "Research", icon: Sparkles, color: "text-emerald-500 bg-emerald-500/10" },
    voice: { label: "Voice", icon: Mic, color: "text-blue-500 bg-blue-500/10" },
    files: { label: "Files", icon: FileText, color: "text-amber-500 bg-amber-500/10" },
  };

  return (
    <div className="relative min-h-full">
      <SpatialEnvironment />
      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20">
              <CreditCard className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Billing & Usage</h1>
              <p className="text-sm text-muted-foreground">Your plan, usage, and account details.</p>
            </div>
          </div>
        </motion.div>

        {/* Current Plan */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }} className="mt-8">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <NexusCore size={64} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold tracking-tight">Free Plan</h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-0.5 text-[11px] font-medium text-success">
                      <Check className="h-3 w-3" /> Active
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    NexusAI is free to use. Bring your own AI provider keys for full access.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-center">
                <p className="text-xs font-medium text-primary">Premium plans</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Coming soon</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Usage Dashboard */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }} className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <BarChart3 className="h-4 w-4 text-primary" /> Usage
            </h2>
            <button
              onClick={loadUsage}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive">
              {error}
              <button onClick={loadUsage} className="ml-2 font-medium underline">Retry</button>
            </div>
          ) : usage ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="card-surface p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" /> Total Requests
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{formatNumber(usage.totalRequests)}</p>
              </div>
              <div className="card-surface p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BarChart3 className="h-3.5 w-3.5 text-emerald-500" /> Total Tokens
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{formatNumber(usage.totalTokens)}</p>
              </div>
              <div className="card-surface p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Models Used
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{Object.keys(usage.byModel).length}</p>
              </div>
              <div className="card-surface p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 text-amber-500" /> Activity Types
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{Object.keys(usage.byType).length}</p>
              </div>
            </div>
          ) : null}
        </motion.div>

        {/* Usage by Type */}
        {usage && Object.keys(usage.byType).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }} className="mt-6">
            <h3 className="mb-3 text-sm font-semibold tracking-tight">Usage by Type</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(usage.byType).map(([type, data]) => {
                const meta = typeLabels[type] || { label: type, icon: MessageSquare, color: "text-muted-foreground bg-muted/40" };
                const Icon = meta.icon;
                const pct = usage.totalRequests > 0 ? (data.requests / usage.totalRequests) * 100 : 0;
                return (
                  <div key={type} className="card-surface p-4">
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.color)}>
                        <Icon className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{meta.label}</p>
                        <p className="text-xs text-muted-foreground">{data.requests} requests</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums">{formatNumber(data.tokens)}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/40">
                      <div className="h-full rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Usage by Model */}
        {usage && Object.keys(usage.byModel).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }} className="mt-6">
            <h3 className="mb-3 text-sm font-semibold tracking-tight">Usage by Model</h3>
            <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm">
              <div className="divide-y divide-border/40">
                {Object.entries(usage.byModel)
                  .sort(([, a], [, b]) => b.tokens - a.tokens)
                  .map(([model, data]) => (
                    <div key={model} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">
                        {model.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{model}</span>
                      <span className="text-xs text-muted-foreground">{data.requests} req</span>
                      <span className="text-sm font-bold tabular-nums">{formatNumber(data.tokens)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Recent Activity */}
        {usage && usage.recentActivity.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.25 }} className="mt-6">
            <h3 className="mb-3 text-sm font-semibold tracking-tight">Recent Activity</h3>
            <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm">
              <div className="divide-y divide-border/40">
                {usage.recentActivity.slice(0, 10).map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xs text-muted-foreground">{timeAgo(item.timestamp)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{item.model}</span>
                    <span className="text-xs text-muted-foreground">{item.type}</span>
                    <span className="text-xs font-medium tabular-nums">{item.tokens.toLocaleString()} tokens</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Plan Comparison */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.3 }} className="mt-10">
          <h2 className="mb-1 text-sm font-semibold tracking-tight">Plan Comparison</h2>
          <p className="mb-4 text-xs text-muted-foreground">NexusAI is free — bring your own AI provider keys for full access</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Free Plan */}
            <div className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">Free</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold text-success">Current</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Full access with your own API keys</p>
              <div className="mt-4 space-y-2.5">
                {PLAN_FEATURES.map((f) => (
                  <div key={f.label} className="flex items-center gap-2.5 text-sm">
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                    <span className="min-w-0 flex-1">{f.label}</span>
                    <span className="text-xs text-muted-foreground">{f.free}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pro Plan (Coming Soon) */}
            <div className="relative rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/8 via-card/60 to-card/60 p-5 backdrop-blur-xl">
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">Pro</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">Coming Soon</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Built-in AI providers, no BYOK needed</p>
              <div className="mt-4 space-y-2.5">
                {PLAN_FEATURES.map((f) => (
                  <div key={f.label} className="flex items-center gap-2.5 text-sm">
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">{f.label}</span>
                    <span className="text-xs text-muted-foreground">{f.pro}</span>
                  </div>
                ))}
              </div>
              <div className="relative mt-5">
                <Button disabled className="w-full gap-2 opacity-60">
                  <Sparkles className="h-4 w-4" /> Upgrade (Coming Soon)
                </Button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">Premium plans are in development</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Security Note */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.35 }} className="mt-8">
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">Your data, your keys</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  NexusAI never stores payment information. When premium plans launch, payment will be handled
                  by a secure third-party provider (Stripe). Your AI provider keys are encrypted server-side
                  with AES-256 and never exposed to the browser.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
