import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Loader2, Workflow as WorkflowIcon, Zap, ArrowRight, Trash2, Play } from "lucide-react";
import { workflowsService, WorkflowRun } from "@/services/workflows.service";
import { TEMPLATES } from "@/utils/workflowNodes";
import { NexusCore } from "@/components/ui/nexus-core";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

const STATUS_STYLE: Record<string, string> = {
  completed: "text-emerald-500 bg-emerald-500/10",
  failed: "text-red-500 bg-red-500/10",
  running: "text-blue-500 bg-blue-500/10",
  pending: "text-muted-foreground bg-muted",
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "";
  }
}

export function Workflows() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [latestRuns, setLatestRuns] = useState<Record<string, WorkflowRun>>({});

  const load = useCallback(async () => {
    try {
      const { data } = await workflowsService.list();
      setWorkflows(data.workflows);
      // Fetch each workflow's latest run (status badges) in parallel.
      const runs = await Promise.all(
        data.workflows.slice(0, 12).map(async (w) => {
          try {
            const r = await workflowsService.listRuns(w.id);
            return [w.id, r.data.runs[0]] as const;
          } catch {
            return [w.id, undefined] as const;
          }
        })
      );
      const latest: Record<string, WorkflowRun> = {};
      runs.forEach(([wid, r]) => { if (r) latest[wid] = r; });
      setLatestRuns(latest);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not load workflows.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createWorkflow = async (template?: (typeof TEMPLATES)[number]) => {
    setCreating(true);
    setError("");
    try {
      const built = template ? template.build() : { nodes: [], edges: [] };
      const { data } = await workflowsService.create({
        name: template ? template.name : name.trim() || "Untitled workflow",
        description: template ? template.description : description.trim() || undefined,
        nodes: built.nodes,
        edges: built.edges,
      });
      navigate(`/workflows/${data.workflow.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not create the workflow.");
      setCreating(false);
    }
  };

  const deleteWorkflow = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this workflow and its run history? This can't be undone.")) return;
    try {
      await workflowsService.remove(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch {
      setError("Could not delete the workflow.");
    }
  };

  return (
    <div className="relative min-h-full">
      <SpatialEnvironment />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Automation</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Nexus <span className="text-gradient">Workflows</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Build once. Let NexusAI execute — every node is a real AI capability.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" /> New workflow
              </button>
              <Link
                to="/meetings"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card/70 px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:border-primary/40"
              >
                <Zap className="h-4 w-4 text-amber-500" /> Automate a meeting
              </Link>
            </div>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, duration: 0.5 }} className="relative hidden lg:block">
            <NexusCore size={220} />
          </motion.div>
        </div>

        {/* Templates */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.35 }} className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Zap className="h-4 w-4 text-muted-foreground" /> Start from a template
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((t, i) => (
              <motion.button
                key={t.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                onClick={() => createWorkflow(t)}
                disabled={creating}
                className="card-surface card-hover group flex items-center gap-3 p-4 text-left disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg">
                  {t.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.description}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Your workflows */}
        <div className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
            <WorkflowIcon className="h-4 w-4 text-muted-foreground" /> Your workflows
          </h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
              <WorkflowIcon className="mb-3 h-8 w-8 text-muted-foreground/60" strokeWidth={1.6} />
              <p className="text-sm font-medium">No workflows yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Pick a template above or start from scratch — every node executes for real.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {workflows.map((w, index) => {
                const run = latestRuns[w.id];
                return (
                  <motion.div key={w.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                    <Link to={`/workflows/${w.id}`} className="card-surface card-hover group flex items-center gap-3 p-3.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
                        <WorkflowIcon className="h-4 w-4" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{w.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {w.description || `${Array.isArray(w.nodes) ? w.nodes.length : 0} nodes`} · updated {fmtDate(w.updatedAt)}
                        </p>
                      </div>
                      {run && (
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium", STATUS_STYLE[run.status] || STATUS_STYLE.pending)}>
                          {run.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : run.status === "completed" ? <Play className="h-3 w-3" /> : null}
                          {run.status}
                        </span>
                      )}
                      <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                        {Array.isArray(w.nodes) ? w.nodes.length : 0} nodes
                      </span>
                      <button onClick={(e) => deleteWorkflow(w.id, e)} className="rounded-lg p-2 text-destructive/60 transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${w.name}`}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                      </button>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create workflow">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="text-lg font-bold tracking-tight">New workflow</h2>
            <p className="mt-1 text-xs text-muted-foreground">Name it — then build the graph in the editor.</p>
            <form
              onSubmit={(e) => { e.preventDefault(); createWorkflow(); }}
              className="mt-4 space-y-3"
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Workflow name"
                aria-label="Workflow name"
                autoFocus
                className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary/60"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does it do? (optional)"
                aria-label="Workflow description"
                className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary/60"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
