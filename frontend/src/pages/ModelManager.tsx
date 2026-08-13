import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Search, Star, Check, AlertTriangle, Circle, RefreshCw, Sparkles, MessageSquare, Image as ImageIcon, Video as VideoIcon } from "lucide-react";
import { providersService, CatalogModel, ProviderStatus, NvidiaHealth } from "@/services/providers.service";
import { getAIPreferences, setAIPreferences } from "@/utils/aiPreferences";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

const HEALTH_STYLES: Record<string, { dot: string; cls: string; label: string }> = {
  ok: { dot: "bg-emerald-500", cls: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10", label: "Ready" },
  cold: { dot: "bg-amber-500", cls: "text-amber-500 border-amber-500/30 bg-amber-500/10", label: "Warming up" },
  error: { dot: "bg-red-500", cls: "text-red-500 border-red-500/30 bg-red-500/10", label: "Error" },
};

const STATUS_STYLES: Record<ProviderStatus["status"], { dot: string; cls: string }> = {
  ok: { dot: "bg-emerald-500", cls: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" },
  low: { dot: "bg-amber-500", cls: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
  no_credits: { dot: "bg-red-500", cls: "text-red-500 border-red-500/30 bg-red-500/10" },
  invalid: { dot: "bg-red-500", cls: "text-red-500 border-red-500/30 bg-red-500/10" },
  configured: { dot: "bg-zinc-500", cls: "text-muted-foreground border-border bg-muted/50" },
};

function statusLabel(status: ProviderStatus["status"], configured: boolean): string {
  switch (status) {
    case "ok": return "Available";
    case "low": return "Limited";
    case "no_credits": return "No credits";
    case "invalid": return "Invalid key";
    default: return configured ? "Configured" : "Not configured";
  }
}

const CAPABILITY_STYLES: Record<string, string> = {
  TEXT: "border-border bg-muted/60 text-muted-foreground",
  CODE: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  DOCUMENT: "border-primary/30 bg-primary/10 text-primary",
  IMAGE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  VIDEO: "border-orange-500/30 bg-orange-500/10 text-orange-500",
};

const SECTION_META = {
  chat: { icon: MessageSquare, title: "Chat & Document Analysis", description: "Used by Chat, the Command Center and the File Analyzer — TEXT, DOCUMENT and CODE" },
  image: { icon: ImageIcon, title: "Image Generation", description: "Used by Image Studio" },
  video: { icon: VideoIcon, title: "Video Generation", description: "Used by Video Studio" },
} as const;

type SectionKey = keyof typeof SECTION_META;
const CAPABILITIES = ["TEXT", "CODE", "DOCUMENT", "IMAGE", "VIDEO"] as const;

function StatusBadge({ status, configured }: { status: ProviderStatus["status"]; configured: boolean }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium", s.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
      {statusLabel(status, configured)}
    </span>
  );
}

function CapabilityBadge({ cap }: { cap: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide", CAPABILITY_STYLES[cap] || CAPABILITY_STYLES.TEXT)}>
      {cap}
    </span>
  );
}

export function ModelManager() {
  const [catalog, setCatalog] = useState<{ models: Record<SectionKey, CatalogModel[]>; providers: ProviderStatus[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [capFilter, setCapFilter] = useState<string>("All");
  const [defaultModel, setDefaultModel] = useState<string>(() => getAIPreferences().defaultModel);
  const [saved, setSaved] = useState(false);
  const [nvHealth, setNvHealth] = useState<NvidiaHealth | null>(null);
  const [nvChecking, setNvChecking] = useState(false);

  const runNvidiaChecks = () => {
    setNvChecking(true);
    providersService
      .getNvidiaHealth()
      .then(({ data }) => setNvHealth(data))
      .catch((err) => {
        console.error("NVIDIA health check failed:", err);
        setNvHealth(null);
      })
      .finally(() => setNvChecking(false));
  };

  useEffect(() => {
    providersService
      .getModelCatalog()
      .then(({ data }) => {
        setCatalog({ models: data.models, providers: data.providers || [] });
      })
      .catch((err) => {
        console.error("Model catalog failed:", err);
        setError("Could not load the model catalog. Please try again.");
      })
      .finally(() => setLoading(false));
    runNvidiaChecks();
  }, []);

  const statusById = useMemo(() => {
    const map = new Map<string, ProviderStatus>();
    catalog?.providers.forEach((p) => map.set(p.id, p));
    return map;
  }, [catalog]);

  const filtered = useMemo(() => {
    if (!catalog) return null;
    const q = query.trim().toLowerCase();
    const out = {} as Record<SectionKey, CatalogModel[]>;
    (Object.keys(SECTION_META) as SectionKey[]).forEach((key) => {
      out[key] = catalog.models[key].filter((m) => {
        if (capFilter !== "All" && !m.capabilities.includes(capFilter)) return false;
        if (q && !`${m.name} ${m.provider}`.toLowerCase().includes(q)) return false;
        return true;
      });
    });
    return out;
  }, [catalog, query, capFilter]);

  const setDefault = (id: string) => {
    setAIPreferences({ defaultModel: id });
    setDefaultModel(id);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const total = catalog ? catalog.models.chat.length + catalog.models.image.length + catalog.models.video.length : 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        icon={Cpu}
        title="AI Model & Provider Manager"
        description="Every model NexusAI can use right now — pulled from the backend, nothing invented."
        actions={
          saved ? (
            <Badge variant="success" className="shrink-0">
              <Check className="h-3 w-3" /> Default saved
            </Badge>
          ) : undefined
        }
      />

      {error && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => window.location.reload()} className="ml-auto text-xs font-medium underline-offset-2 hover:underline">Retry</button>
        </motion.div>
      )}

      {/* Provider status strip */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Circle className="h-4 w-4 text-primary" />
          Provider status
          <span className="text-xs font-normal text-muted-foreground">— server-side health &amp; credit checks</span>
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {(catalog?.providers || []).map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 shadow-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <StatusBadge status={p.status} configured={p.configured} />
                </div>
                <p className="text-[11px] text-muted-foreground">{p.usedFor}</p>
                {p.detail && <p className="truncate text-[10px] text-muted-foreground/70" title={p.detail}>{p.detail}</p>}
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* NVIDIA per-model health */}
      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Cpu className="h-4 w-4 text-primary" />
            NVIDIA model health
            <span className="text-xs font-normal text-muted-foreground">— live 1-token probes of every chat model &amp; NVCF image function</span>
          </h2>
          <button
            onClick={runNvidiaChecks}
            disabled={nvChecking}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", nvChecking && "animate-spin")} />
            {nvChecking ? "Checking…" : "Run checks"}
          </button>
        </div>
        {nvChecking && !nvHealth ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : nvHealth ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[...nvHealth.chat.map((m) => ({ ...m, kind: "chat" as const })), ...nvHealth.image.map((m) => ({ ...m, kind: "image" as const }))].map((m) => {
              const h = HEALTH_STYLES[m.status] || HEALTH_STYLES.error;
              return (
                <div key={`${m.kind}-${m.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", h.dot)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <span className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide", m.kind === "chat" ? "border-primary/30 bg-primary/10 text-primary" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500")}>
                        {m.kind === "chat" ? "CHAT" : "IMAGE"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80" title={m.detail}>{m.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {typeof m.latencyMs === "number" && <span className="text-[10px] tabular-nums text-muted-foreground">{m.latencyMs}ms</span>}
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium", h.cls)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", h.dot)} aria-hidden />
                      {h.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Could not reach the NVIDIA health check. <button onClick={runNvidiaChecks} className="text-primary underline-offset-2 hover:underline">Retry</button>
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Cold serverless models show <span className="font-medium text-amber-500">Warming up</span> until their first real request (each isolated probe has an 8s budget — a cold start takes ~1 min). Warm models answer instantly.
        </p>
      </section>

      {/* Search + capability filter */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${total} models...`}
            aria-label="Search models"
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["All", ...CAPABILITIES].map((cap) => (
            <button
              key={cap}
              onClick={() => setCapFilter(cap)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                capFilter === cap ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {cap === "All" ? "All" : <span className="flex items-center gap-1.5"><CapabilityBadge cap={cap} /> only</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Model sections */}
      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, s) => (
            <div key={s} className="space-y-2">
              <Skeleton className="h-5 w-48" />
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {(Object.keys(SECTION_META) as SectionKey[]).map((key) => {
            const meta = SECTION_META[key];
            const models = filtered?.[key] || [];
            return (
              <section key={key}>
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <meta.icon className="h-4 w-4" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold tracking-tight">{meta.title}</h2>
                    <p className="text-[11px] text-muted-foreground">{meta.description}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{models.length}</span>
                </div>
                {models.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    No models match your search.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {models.map((m, i) => {
                      const status = statusById.get(m.provider);
                      const isDefault = key === "chat" && m.id === defaultModel;
                      return (
                        <motion.div
                          key={`${key}-${m.id}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border bg-card p-3 shadow-card transition-colors",
                            isDefault ? "border-primary/50 ring-1 ring-primary/30" : "border-border"
                          )}
                        >
                          <div className={cn("h-2 w-2 shrink-0 rounded-full", status ? STATUS_STYLES[status.status].dot : "bg-zinc-600")} title={status ? `${status.name}: ${statusLabel(status.status, status.configured)}` : m.provider} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium">{m.name}</p>
                              {isDefault && (
                                <Badge variant="success" className="shrink-0">
                                  <Star className="h-3 w-3 fill-current" /> Default
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{m.provider}</span>
                              {m.context && <span className="text-[10px] text-muted-foreground/70">· {m.context} context</span>}
                              <span className="flex flex-wrap items-center gap-1">
                                {m.capabilities.map((cap) => <CapabilityBadge key={cap} cap={cap} />)}
                              </span>
                            </div>
                          </div>
                          {key === "chat" && (
                            <button
                              onClick={() => setDefault(m.id)}
                              disabled={isDefault}
                              aria-label={isDefault ? `${m.name} is the default` : `Set ${m.name} as default`}
                              title={isDefault ? "Default chat model" : "Set as default chat model"}
                              className={cn(
                                "shrink-0 rounded-lg border p-2 transition-colors",
                                isDefault
                                  ? "cursor-default border-primary/30 bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                              )}
                            >
                              <Star className={cn("h-4 w-4", isDefault && "fill-current")} strokeWidth={1.8} />
                            </button>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-card">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              The <span className="font-medium text-foreground">default</span> applies to the <span className="font-medium text-foreground">Chat</span> and{" "}
              <span className="font-medium text-foreground">Command Center</span> model pickers when no specific model is chosen — every request still goes
              through the existing backend. Image &amp; video models use their studio pickers. Provider status comes from real server-side health checks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
