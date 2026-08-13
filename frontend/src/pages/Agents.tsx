import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Plus,
  Trash2,
  Loader2,
  Globe,
  FolderOpen,
  Sparkles,
  Cpu,
  Zap,
  ShieldCheck,
  ArrowRight,
  Play,
  History,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import { NexusCore } from "@/components/ui/nexus-core";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/utils/cn";
import { chatService } from "@/services/chat.service";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  listAgentRuns,
  runAgent,
  Agent,
  AgentRun,
} from "@/services/agents.service";

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context: string;
}

const PROVIDER_STYLES: Record<string, { badge: string; dot: string; ring: string }> = {
  groq: { badge: "bg-orange-500/15 text-orange-500", dot: "bg-orange-500", ring: "hover:border-orange-500/40" },
  gemini: { badge: "bg-blue-500/15 text-blue-500", dot: "bg-blue-500", ring: "hover:border-blue-500/40" },
  openrouter: { badge: "bg-emerald-500/15 text-emerald-500", dot: "bg-emerald-500", ring: "hover:border-emerald-500/40" },
  mistral: { badge: "bg-amber-500/15 text-amber-500", dot: "bg-amber-500", ring: "hover:border-amber-500/40" },
  nvidia: { badge: "bg-green-500/15 text-green-500", dot: "bg-green-500", ring: "hover:border-green-500/40" },
  kimi: { badge: "bg-fuchsia-500/15 text-fuchsia-500", dot: "bg-fuchsia-500", ring: "hover:border-fuchsia-500/40" },
};

const TOOL_LABEL: Record<string, string> = {
  web: "Web search",
  files: "Your files",
};

const TEMPLATES: Array<{ name: string; description: string; prompt: string; tools: string[] }> = [
  {
    name: "Research analyst",
    description: "Web + your files, cited findings",
    prompt:
      "You are a rigorous research analyst. Investigate the user's question using your web and file tools, summarize the most important findings with source citations, and clearly separate facts from speculation. Never invent sources or URLs.",
    tools: ["web", "files"],
  },
  {
    name: "Personal file assistant",
    description: "Answers grounded in your files",
    prompt:
      "You are a helpful assistant grounded in the user's own uploaded documents. Use the files tool to answer questions about their files, quoting or referencing what you find. If the files don't contain the answer, say so plainly.",
    tools: ["files"],
  },
  {
    name: "Translator & editor",
    description: "Rewrite / translate with web help",
    prompt:
      "You are a precise translator and editor. Rewrite or translate the user's text clearly while preserving meaning and tone. Use web context only for terminology or verification, and say when you're unsure.",
    tools: ["web"],
  },
];

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

const EMPTY_FORM = { name: "", description: "", systemPrompt: "", model: "", tools: ["web", "files"] as string[] };

export function Agents() {
  const reduced = useReducedMotion();

  /* Data */
  const [tab, setTab] = useState<"agents" | "models">("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* Create / edit modal */
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  /* Run panel */
  const [selected, setSelected] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [runInput, setRunInput] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [toolActive, setToolActive] = useState("");
  const [output, setOutput] = useState("");
  const [runError, setRunError] = useState("");

  const load = useCallback(async () => {
    try {
      setAgents(await listAgents());
    } catch (e: any) {
      setError(e?.message || "Could not load agents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    chatService
      .getModels()
      .then(({ data }) => {
        if (Array.isArray(data)) setModels(data);
      })
      .catch(() => {
        /* non-blocking */
      });
  }, [load]);

  const openCreate = useCallback(() => {
    setError("");
    setEditingId(null);
    setForm({ ...EMPTY_FORM, model: models[0]?.id || "gemini-flash-latest" });
    setFormOpen(true);
  }, [models]);

  const openEdit = useCallback((a: Agent) => {
    setError("");
    setEditingId(a.id);
    setForm({
      name: a.name,
      description: a.description || "",
      systemPrompt: a.systemPrompt,
      model: a.model,
      tools: [a.tools.web ? "web" : "", a.tools.files ? "files" : ""].filter(Boolean),
    });
    setFormOpen(true);
  }, []);

  const applyTemplate = useCallback(
    (t: (typeof TEMPLATES)[number]) => {
      setForm({ name: t.name, description: t.description, systemPrompt: t.prompt, model: models[0]?.id || "gemini-flash-latest", tools: [...t.tools] });
    },
    [models]
  );

  const submit = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        description: form.description,
        systemPrompt: form.systemPrompt,
        model: form.model || "gemini-flash-latest",
        tools: form.tools,
      };
      if (editingId) await updateAgent(editingId, payload);
      else await createAgent(payload);
      setFormOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not save the agent.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAgent(id);
      if (selected?.id === id) {
        setSelected(null);
        setRuns([]);
      }
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not delete the agent.");
    }
  };

  const selectAgent = useCallback(async (a: Agent) => {
    setSelected(a);
    setOutput("");
    setRunError("");
    setStage("");
    setToolActive("");
    setRuns([]);
    try {
      setRuns(await listAgentRuns(a.id));
    } catch {
      /* non-blocking */
    }
  }, []);

  const startRun = useCallback(async () => {
    if (!selected || !runInput.trim() || running) return;
    setRunning(true);
    setRunError("");
    setOutput("");
    setStage("starting");
    setToolActive("");
    runAgent(selected.id, runInput, {
      onStage: (s, count) => {
        setStage(s);
        if (s === "writing" && count !== undefined && count > 0) setStage(`writing (${count} sources)`);
      },
      onTool: (tool) => setToolActive(tool),
      onChunk: (text) => setOutput((prev) => prev + text),
      onDone: (_out, _sources, _runId) => {
        setStage("done");
        setToolActive("");
        setRunning(false);
        void load();
        void listAgentRuns(selected.id).then(setRuns).catch(() => {});
      },
      onError: (message) => {
        setRunError(message);
        setStage("");
        setToolActive("");
        setRunning(false);
      },
    });
  }, [selected, runInput, running, load]);

  const groups = useMemo(
    () =>
      models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
        (acc[m.provider] = acc[m.provider] || []).push(m);
        return acc;
      }, {}),
    [models]
  );

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SpatialEnvironment />
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6 pb-8 text-center">
          <NexusCore size={150} active={!!selected} state={agents.length ? "success" : "idle"} />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Nexus <span className="text-primary">Agents</span>
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Define an agent with a system prompt, grant it real tools — web search and your own files — and run it. Every answer streams from the real backend.
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/60 p-1">
            {(["agents", "models"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                  tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "agents" ? "My Agents" : "Models"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-auto mb-6 flex max-w-3xl items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {tab === "agents" ? (
          <div className="mx-auto max-w-6xl">
            {/* Templates */}
            <div className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Start from a template</h2>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => {
                      setTab("agents");
                      openCreate();
                      applyTemplate(t);
                    }}
                    className="card-surface card-hover group flex items-center gap-3 rounded-xl p-3.5 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold group-hover:text-primary">{t.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Header row */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Your agents ({agents.length})
              </h2>
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> New agent
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
            ) : agents.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="No agents yet"
                description="Create your first agent — give it a system prompt, pick a model, and grant it real tools (web search, your files)."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {agents.map((a, i) => (
                  <motion.div
                    key={a.id}
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25 }}
                    className={cn(
                      "card-surface card-hover flex flex-col p-4",
                      selected?.id === a.id && "border-primary/50 ring-1 ring-primary/30"
                    )}
                  >
                    <button onClick={() => void selectAgent(a)} className="flex min-w-0 flex-1 flex-col text-left">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Bot className="h-5 w-5" strokeWidth={1.8} />
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {(a.runs?.[0]?.status || "ready") === "ready" ? `${a._count?.runs || 0} runs` : a.runs?.[0]?.status}
                        </span>
                      </div>
                      <h3 className="mt-3 text-[15px] font-semibold tracking-tight group-hover:text-primary">{a.name}</h3>
                      {a.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <Cpu className="h-3 w-3" /> {a.model}
                        </span>
                        {a.tools.web && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-500">
                            <Globe className="h-3 w-3" /> Web
                          </span>
                        )}
                        {a.tools.files && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                            <FolderOpen className="h-3 w-3" /> Files
                          </span>
                        )}
                      </div>
                      <div className="mt-3.5 flex items-center gap-1 border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
                        <History className="h-3 w-3" /> {a.runs?.[0] ? `Last run ${fmtDate(a.runs[0].createdAt)}` : "Never run"}
                      </div>
                    </button>
                    <div className="mt-3 flex items-center gap-1.5">
                      <button
                        onClick={() => void selectAgent(a)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        <Play className="h-3 w-3" /> Run
                      </button>
                      <button
                        onClick={() => openEdit(a)}
                        className="rounded-lg border border-border/70 p-1.5 text-muted-foreground hover:text-foreground"
                        aria-label={`Edit ${a.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void remove(a.id)}
                        className="rounded-lg border border-border/70 p-1.5 text-muted-foreground hover:border-red-500/40 hover:text-red-500"
                        aria-label={`Delete ${a.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Run panel */}
            {selected && (
              <div className="card-surface mt-8 rounded-2xl p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold">
                      <Bot className="h-4.5 w-4.5 text-primary" /> {selected.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {selected.model} · {[selected.tools.web ? "web" : "", selected.tools.files ? "files" : ""].filter(Boolean).join(" + ") || "no tools"}
                    </p>
                  </div>
                  <button onClick={() => setSelected(null)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                    Close
                  </button>
                </div>

                <textarea
                  value={runInput}
                  onChange={(e) => setRunInput(e.target.value)}
                  placeholder="What should this agent do? e.g. Summarize the latest on quantum computing and check if I have files about it"
                  rows={3}
                  className="w-full rounded-xl border bg-background px-3.5 py-3 text-sm outline-none focus:border-primary/50"
                />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => void startRun()}
                    disabled={!runInput.trim() || running}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {running ? "Running…" : "Run agent"}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {stage === "starting" && "Starting…"}
                    {stage === "writing" && "AI is writing…"}
                    {toolActive === "web" && "Searching the web…"}
                    {toolActive === "files" && "Scanning your files…"}
                    {stage === "done" && "Completed"}
                  </span>
                </div>

                {runError && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {runError}
                  </div>
                )}

                {output && (
                  <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Output</span>
                      {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                    </div>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{output}</pre>
                  </div>
                )}

                {runs.length > 0 && (
                  <div className="mt-6">
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <History className="h-3.5 w-3.5" /> Run history ({runs.length})
                    </h4>
                    <div className="space-y-2">
                      {runs.slice(0, 6).map((r) => (
                        <div key={r.id} className="rounded-xl border border-border/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{r.input.slice(0, 80)}</span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                                r.status === "completed" && "bg-success/10 text-success",
                                r.status === "failed" && "bg-red-500/10 text-red-500",
                                (r.status === "running" || r.status === "pending") && "bg-muted text-muted-foreground"
                              )}
                            >
                              {r.status}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[10px] text-muted-foreground">
                            <span>{fmtDate(r.createdAt)}</span>
                            {r.durationMs !== null && r.durationMs > 0 && <span>{(r.durationMs / 1000).toFixed(1)}s</span>}
                            {r.sources && r.sources.length > 0 && <span>{r.sources.length} sources</span>}
                          </div>
                          {r.output && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{r.output}</p>}
                          {r.error && <p className="mt-1.5 text-xs text-red-500">{r.error}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ── Models tab (existing model browser) ── */
          <div className="mx-auto max-w-5xl space-y-8">
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
            ) : Object.keys(groups).length === 0 ? (
              <EmptyState
                icon={Bot}
                title="No models available"
                description="Configure an AI provider key in backend/.env to unlock agents."
              />
            ) : (
              Object.entries(groups).map(([provider, list], gi) => {
                const style = PROVIDER_STYLES[provider] || { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground", ring: "hover:border-primary/40" };
                return (
                  <div key={provider}>
                    <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <span className={cn("h-2 w-2 rounded-full", style.dot)} />
                      {provider}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal">{list.length}</span>
                    </h2>
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((model, index) => (
                        <motion.div
                          key={model.id}
                          initial={reduced ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: gi * 0.08 + index * 0.04, duration: 0.3 }}
                          className={cn("card-surface card-hover group flex flex-col p-4.5", style.ring)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Cpu className="h-5 w-5" strokeWidth={1.8} />
                            </div>
                            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", style.badge)}>{provider}</span>
                          </div>
                          <h3 className="mt-3.5 text-[15px] font-semibold tracking-tight transition-colors group-hover:text-primary">{model.name}</h3>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={model.id}>{model.id}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <Sparkles className="h-3 w-3" /> {model.context} context
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                              <Zap className="h-3 w-3" /> Ready
                            </span>
                          </div>
                          <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3.5">
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <ShieldCheck className="h-3 w-3" /> Verified
                            </span>
                            <span
                              role="link"
                              tabIndex={0}
                              onClick={() => {
                                setTab("agents");
                                openCreate();
                                setForm((f) => ({ ...f, model: model.id }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setTab("agents");
                                  openCreate();
                                  setForm((f) => ({ ...f, model: model.id }));
                                }
                              }}
                              className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                            >
                              Use for an agent <ArrowRight className="h-3 w-3" />
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Create / edit modal */}
        {formOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setFormOpen(false)}>
            <div
              className="card-surface max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={editingId ? "Edit agent" : "Create agent"}
            >
              <h2 className="mb-4 text-lg font-semibold">{editingId ? "Edit agent" : "Create an agent"}</h2>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => applyTemplate(t)}
                    className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    {t.name}
                  </button>
                ))}
              </div>

              <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Market analyst"
                className="mb-4 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary/50"
                autoFocus
              />

              <label className="mb-1 block text-xs font-medium text-muted-foreground">Description (optional)</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What is this agent for?"
                className="mb-4 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary/50"
              />

              <label className="mb-1 block text-xs font-medium text-muted-foreground">System prompt</label>
              <textarea
                value={form.systemPrompt}
                onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                rows={5}
                placeholder="You are…"
                className="mb-4 w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50"
              />

              <label className="mb-1 block text-xs font-medium text-muted-foreground">Model</label>
              <select
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                className="mb-4 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary/50"
              >
                {models.length === 0 && <option value="gemini-flash-latest">gemini-flash-latest (default)</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.provider}
                  </option>
                ))}
              </select>

              <label className="mb-1 block text-xs font-medium text-muted-foreground">Real tools</label>
              <div className="mb-4 flex flex-wrap gap-2">
                {["web", "files"].map((t) => (
                  <button
                    key={t}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        tools: f.tools.includes(t) ? f.tools.filter((x) => x !== t) : [...f.tools, t],
                      }))
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                      form.tools.includes(t)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {t === "web" ? <Globe className="h-3.5 w-3.5" /> : <FolderOpen className="h-3.5 w-3.5" />}
                    {TOOL_LABEL[t]}
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setFormOpen(false)} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
                <button
                  onClick={() => void submit()}
                  disabled={!form.name.trim() || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? "Saving…" : editingId ? "Save changes" : "Create agent"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
