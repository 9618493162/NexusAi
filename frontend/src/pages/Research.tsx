import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Compass,
  Search,
  Loader2,
  Globe,
  FileText,
  ExternalLink,
  Sparkles,
  Trash2,
  Download,
  BookOpen,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { NexusCore } from "@/components/ui/nexus-core";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/utils/cn";
import {
  listResearch,
  getResearch,
  createResearch,
  deleteResearch,
  runResearch,
  ResearchSession,
  ResearchResult,
  ResearchSource,
  ResearchFinding,
} from "@/services/research.service";

const SUGGESTIONS = [
  "What are the main benefits and risks of AI in education?",
  "Compare the latest approaches to AI-powered education",
  "What are the main causes of climate change's economic impact?",
  "Find reliable sources about renewable energy storage",
];

const STAGE_LABEL: Record<string, string> = {
  starting: "Starting research…",
  searching: "Searching the web for real sources…",
  market: "Fetching live market data (Massive.com)…",
  files: "Scanning your files…",
  analyzing: "Reading sources…",
  writing: "Writing the synthesis…",
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "";
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SourceCard({ source, index }: { source: ResearchSource; index: number }) {
  return (
    <div className="card-surface card-hover group rounded-xl p-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
          {index}
        </span>
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {source.kind === "web" ? <Globe className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{source.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {source.kind === "web" ? (
              <>
                <span className="inline-flex items-center gap-1 text-primary">
                  {domainOf(source.url || "")} <ExternalLink className="h-3 w-3" />
                </span>
                {source.date && <span>· {source.date}</span>}
              </>
            ) : (
              <span className="text-amber-500">Your file</span>
            )}
            <span className="uppercase text-[10px] opacity-70">{source.kind}</span>
          </p>
          <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">{source.snippet}</p>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            >
              Open source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding, sources }: { finding: ResearchFinding; sources: ResearchSource[] }) {
  const cited = finding.citations
    .map((id) => sources.find((s) => s.id === id))
    .filter((s): s is ResearchSource => !!s);
  return (
    <div className="card-surface rounded-xl p-4">
      <p className="text-sm font-semibold">{finding.claim}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{finding.detail}</p>
      {cited.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sources</span>
          {cited.map((s, i) => (
            <a
              key={s.id}
              href={s.url || undefined}
              target={s.url ? "_blank" : undefined}
              rel="noopener noreferrer"
              title={s.title}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                s.kind === "web"
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
              )}
            >
              [{i + 1}] {s.kind === "web" ? domainOf(s.url || "") : s.title.slice(0, 24)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function Research() {
  const { id: routeId } = useParams();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"quick" | "deep">("quick");
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ResearchSession | null>(null);
  const [activeSources, setActiveSources] = useState<ResearchSource[]>([]);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [stage, setStage] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const reduced = useReducedMotion();
  // Mobile slide-in drawer for the history rail (the desktop rail stays beside
  // the results; on phones the same real list opens from a trigger button).
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const items = await listResearch();
      setSessions(items);
    } catch (e: any) {
      setError(e?.message || "Could not load research history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const openSession = useCallback(
    async (id: string) => {
      setError("");
      setRunning(false);
      abortRef.current?.abort();
      setHistoryOpen(false);
      try {
        const s = await getResearch(id);
        setActive(s);
        setActiveSources(s.sources || []);
        setResult(s.summary ? (JSON.parse(s.summary) as ResearchResult) : null);
      } catch (e: any) {
        setError(e?.message || "Could not load the research session.");
      }
    },
    []
  );

  // Deep-link from elsewhere (e.g. the Markets studio's "Open full report").
  useEffect(() => {
    if (routeId) void openSession(routeId);
  }, [routeId, openSession]);

  const start = useCallback(async () => {
    const q = query.trim();
    if (!q || starting) return;
    setStarting(true);
    setError("");
    try {
      const s = await createResearch(q, mode);
      setQuery("");
      await load();
      await openSession(s.id);
      // Immediately start running.
      setRunning(true);
      setStage("starting");
      setResult(null);
      setActiveSources([]);
      abortRef.current = runResearch(s.id, {
        onStage: (st) => setStage(st),
        onChunk: () => {
          /* status only — the structured result arrives on done */
        },
        onDone: (res, sources) => {
          setResult(res);
          setActiveSources(sources);
          setRunning(false);
          setStage("");
          void refreshSession(s.id);
        },
        onError: (msg) => {
          setError(msg);
          setRunning(false);
          setStage("");
          void refreshSession(s.id);
        },
      });
    } catch (e: any) {
      setError(e?.message || "Could not start research.");
      setStarting(false);
    } finally {
      setStarting(false);
    }
  }, [query, mode, starting, load, openSession]);

  const refreshSession = useCallback(async (id: string) => {
    try {
      const s = await getResearch(id);
      setActive(s);
      setActiveSources(s.sources || []);
      if (s.summary) setResult(JSON.parse(s.summary) as ResearchResult);
      if (s.status === "failed") setError(s.error || "Research failed");
    } catch {
      /* best-effort */
    }
  }, []);

  const rerun = useCallback(() => {
    if (!active || running) return;
    setRunning(true);
    setError("");
    setResult(null);
    setStage("starting");
    abortRef.current = runResearch(active.id, {
      onStage: (st) => setStage(st),
      onDone: (res, sources) => {
        setResult(res);
        setActiveSources(sources);
        setRunning(false);
        setStage("");
        void refreshSession(active.id);
      },
      onError: (msg) => {
        setError(msg);
        setRunning(false);
        setStage("");
        void refreshSession(active.id);
      },
    });
  }, [active, running, refreshSession]);

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteResearch(id);
        if (active?.id === id) {
          setActive(null);
          setResult(null);
          setActiveSources([]);
        }
        await load();
      } catch (e: any) {
        setError(e?.message || "Could not delete the research session.");
      }
    },
    [active, load]
  );

  const reportMarkdown = useMemo(() => {
    if (!result || !active) return "";
    const lines: string[] = [
      `# Research: ${active.query}`,
      "",
      `_${fmtDate(active.createdAt)} · ${active.mode === "deep" ? "Deep research" : "Quick research"} · ${activeSources.length} sources_`,
      "",
      "## Executive summary",
      "",
      result.summary,
      "",
      "## Key findings",
      "",
    ];
    result.findings.forEach((f, i) => {
      const cited = f.citations
        .map((id) => activeSources.find((s) => s.id === id))
        .filter((s): s is ResearchSource => !!s);
      lines.push(`### ${i + 1}. ${f.claim}`);
      lines.push("");
      lines.push(f.detail);
      if (cited.length) {
        lines.push("");
        lines.push(`_Sources: ${cited.map((s) => s.title).join("; ")}_`);
      }
      lines.push("");
    });
    lines.push("## Conclusion");
    lines.push("");
    lines.push(result.conclusion);
    lines.push("");
    lines.push("## Sources");
    activeSources.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.title}${s.url ? ` — ${s.url}` : ""}${s.kind === "file" ? " (your file)" : ""}`);
    });
    return lines.join("\n");
  }, [result, active, activeSources]);

  const downloadReport = () => {
    const blob = new Blob([reportMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-${(active?.query || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "report"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stageLabel = STAGE_LABEL[stage] || (stage ? `Researching…` : "");

  // The history list — rendered in the desktop rail AND the mobile drawer from
  // the same real session data (no duplication of state).
  const renderHistory = () =>
    loading ? (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    ) : sessions.length === 0 ? (
      <EmptyState
        icon={Compass}
        title="No research yet"
        description="Run your first query above — results are saved here."
        className="py-6"
      />
    ) : (
      <div className="space-y-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={cn(
              "card-surface card-hover group flex items-center gap-2 rounded-xl p-3 text-left",
              active?.id === s.id && "ring-1 ring-primary/50"
            )}
          >
            <button onClick={() => void openSession(s.id)} className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{s.query}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{fmtDate(s.createdAt)}</span>
                <span className="uppercase">{s.mode}</span>
                {s.status === "completed" && (
                  <span className="inline-flex items-center gap-1 text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {s._count?.sources ?? 0} sources
                  </span>
                )}
                {s.status === "failed" && <span className="text-red-500">failed</span>}
              </p>
            </button>
            <button
              onClick={() => void remove(s.id)}
              className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
              aria-label={`Delete ${s.query}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    );

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SpatialEnvironment />
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6 pb-8 text-center">
          <NexusCore size={150} active={running} state={running ? "thinking" : error ? "error" : active ? "success" : "idle"} />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Nexus <span className="text-primary">Research</span>
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Ask a research question — NexusAI searches the web, scans your files, and synthesizes a cited answer. Every source and citation is real.
            </p>
          </div>

          {/* Query input */}
          <div className="w-full max-w-3xl">
            <div className="card-surface rounded-2xl p-4">
              <div className="surface-glow flex items-start gap-3 rounded-xl">
                <span className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 via-primary/10 to-transparent text-primary ring-1 ring-primary/20">
                  <Compass className="h-4 w-4" />
                </span>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void start();
                    }
                  }}
                  rows={2}
                  placeholder="What do you want to research?"
                  className="min-h-12 flex-1 resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {(["quick", "deep"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium shadow-sm transition-colors",
                        mode === m
                          ? "bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground ring-1 ring-primary/40"
                          : "border border-border bg-card/70 text-muted-foreground backdrop-blur-sm hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      {m === "quick" ? "Quick search" : "Deep research"}
                    </button>
                  ))}
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    {mode === "deep" ? "More sources + longer report" : "Fast synthesis from top sources"}
                  </span>
                </div>
                <button
                  onClick={() => void start()}
                  disabled={!query.trim() || starting || running}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary via-primary/90 to-primary/80 px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow-primary transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {starting || running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {starting ? "Starting…" : running ? "Researching…" : "Start research"}
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  className="rounded-full border border-border bg-card/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-auto mb-6 flex max-w-3xl items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Running state — the real NexusCore in its thinking state */}
        {running && (
          <div className="surface-glow mx-auto mb-6 flex max-w-3xl items-center gap-4 rounded-2xl border border-primary/30 bg-card/70 p-4 backdrop-blur-md">
            <NexusCore size={44} state="thinking" active />
            <div>
              <p className="text-sm font-medium text-foreground">{stageLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Real stages from the backend — no simulated progress. Sources are found live, then synthesized with citations.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-4">
          {/* History — desktop rail */}
          <div className="hidden lg:block">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <BookOpen className="h-4 w-4" /> Research history
            </h2>
            {renderHistory()}
          </div>

          {/* Results */}
          <div className="space-y-6 lg:col-span-3">
            {/* Mobile trigger — opens the same history list as a drawer */}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="surface-glow flex w-full items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 py-2.5 text-sm font-medium text-foreground backdrop-blur-sm transition-colors lg:hidden"
            >
              <BookOpen className="h-4 w-4 text-primary" />
              Research history
              {sessions.length > 0 && (
                <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {sessions.length}
                </span>
              )}
            </button>
            {!active && !running && (
              <EmptyState
                icon={Sparkles}
                title="Your findings will appear here"
                description="Start a research query to search the web and your files, then read the synthesis with clickable citations."
                className="py-16"
              />
            )}

            {active && !running && (
              <div className="space-y-6">
                {/* Session header */}
                <div className="card-surface rounded-2xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold leading-snug">{active.query}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmtDate(active.createdAt)} · {active.mode === "deep" ? "Deep research" : "Quick research"} ·{" "}
                        {activeSources.length} real sources
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={rerun}
                        disabled={running}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Rerun
                      </button>
                      {reportMarkdown && (
                        <button
                          onClick={downloadReport}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                        >
                          <Download className="h-3.5 w-3.5" /> Export .md
                        </button>
                      )}
                    </div>
                  </div>
                  {active.status === "failed" && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-red-500">
                      <AlertTriangle className="h-4 w-4" /> {active.error || "Research failed"}
                    </p>
                  )}
                </div>

                {/* Synthesis */}
                {result && (
                  <div className="space-y-4">
                    <motion.div
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="card-surface rounded-2xl p-5"
                    >
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <Sparkles className="h-4 w-4 text-primary" /> Executive summary
                      </h3>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.summary}</p>
                    </motion.div>

                    {result.findings.length > 0 && (
                      <div className="card-surface rounded-2xl p-5">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                          <BookOpen className="h-4 w-4 text-primary" /> Key findings
                        </h3>
                        <div className="space-y-3">
                          {result.findings.map((f, i) => (
                            <FindingCard key={i} finding={f} sources={activeSources} />
                          ))}
                        </div>
                      </div>
                    )}

                    {result.conclusion && (
                      <div className="card-surface rounded-2xl p-5">
                        <h3 className="mb-2 text-sm font-semibold">Conclusion</h3>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{result.conclusion}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Sources */}
                {activeSources.length > 0 && (
                  <div className="card-surface rounded-2xl p-5">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <Globe className="h-4 w-4 text-primary" /> Sources ({activeSources.length})
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {activeSources.map((s, i) => (
                        <SourceCard key={s.id} source={s} index={i + 1} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile drawer — the same real history list, slide-in on phones */}
      <MobileDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Research history"
        icon={<BookOpen className="h-4 w-4" />}
      >
        {renderHistory()}
      </MobileDrawer>
    </div>
  );
}
