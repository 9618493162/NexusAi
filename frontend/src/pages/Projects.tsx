import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Plus, Users, FolderKanban, FileText, MessageSquare, StickyNote, CheckSquare, Sparkles, Loader2, X, ArrowUpRight, Mail, Eye } from "lucide-react";
import { projectsService, ProjectSummary, ProjectInvitation } from "@/services/projects.service";
import { NexusCore } from "@/components/ui/nexus-core";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function Projects() {
  const reduced = useReducedMotion();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", icon: "" });
  const [saving, setSaving] = useState(false);
  const [actionState, setActionState] = useState<{ id: string; busy: boolean } | null>(null);
  const [actionError, setActionError] = useState("");

  const load = async () => {
    try {
      const { data } = await projectsService.list();
      setProjects(data.projects);
      setInvitations(data.invitations);
      setError("");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load projects — try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setActionError("");
    try {
      await projectsService.create({ name: form.name, description: form.description, icon: form.icon || undefined });
      await load(); // re-fetch so counts/roles come back fully-shaped from the backend
      setForm({ name: "", description: "", icon: "" });
      setCreating(false);
    } catch (err: any) {
      setActionError(err?.response?.data?.error || "Couldn't create the project.");
    } finally {
      setSaving(false);
    }
  };

  const respond = async (inv: ProjectInvitation, accept: boolean) => {
    setActionState({ id: inv.id, busy: true });
    setActionError("");
    try {
      await projectsService.respondInvitation(inv.id, accept);
      setInvitations((list) => list.filter((i) => i.id !== inv.id));
      if (accept) load(); // membership changed — refresh the project list
    } catch (err: any) {
      setActionError(err?.response?.data?.error || "Couldn't respond to the invitation.");
    } finally {
      setActionState(null);
    }
  };

  const transition = reduced ? { duration: 0 } : { duration: 0.25, ease: "easeOut" as const };

  const totals = useMemo(() => {
    const list = projects || [];
    return {
      projects: list.length,
      members: list.reduce((a, p) => a + (p._count?.members ?? 0), 0),
      notes: list.reduce((a, p) => a + (p._count?.notes ?? 0), 0),
      tasks: list.reduce((a, p) => a + (p._count?.tasks ?? 0), 0),
    };
  }, [projects]);

  return (
    <div className="relative min-h-full">
      <SpatialEnvironment />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {/* ── Hero: Collaboration Core ─────────────────────────────────── */}
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <Users className="h-3.5 w-3.5 text-primary" /> NexusAI
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Project <span className="text-gradient">Workspaces</span>
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Build together with AI. Shared projects, notes, tasks, files, conversations and an activity timeline —
                every action goes through the backend's membership and role checks.
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.15, duration: 0.45, ease: "easeOut" }}
            className="relative hidden lg:block"
          >
            <NexusCore size={230} state="idle" />
          </motion.div>
        </div>

        {loading ? (
          <div className="mt-8 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : (
          <>
            {/* ── Real counts strip ─────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduced ? { duration: 0 } : { delay: 0.2, duration: 0.35 }}
              className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-5 text-sm"
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <FolderKanban className="h-4 w-4 text-primary" /> <span className="font-semibold tabular-nums text-foreground">{totals.projects}</span> projects
              </span>
              <span className="h-4 w-px bg-border" aria-hidden />
              <span className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 text-blue-500" /> <span className="font-semibold tabular-nums text-foreground">{totals.members}</span> members
              </span>
              <span className="h-4 w-px bg-border" aria-hidden />
              <span className="flex items-center gap-2 text-muted-foreground">
                <StickyNote className="h-4 w-4 text-amber-500" /> <span className="font-semibold tabular-nums text-foreground">{totals.notes}</span> notes
              </span>
              <span className="h-4 w-px bg-border" aria-hidden />
              <span className="flex items-center gap-2 text-muted-foreground">
                <CheckSquare className="h-4 w-4 text-emerald-500" /> <span className="font-semibold tabular-nums text-foreground">{totals.tasks}</span> tasks
              </span>
            </motion.div>

            {/* ── Pending invitations ───────────────────────────────────── */}
            {invitations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { delay: 0.1, duration: 0.3 }}
                className="mt-8 rounded-2xl border border-primary/25 bg-primary/5 p-5"
              >
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <Mail className="h-4 w-4 text-primary" /> Pending invitations
                </h2>
                <div className="mt-3 space-y-2">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card/70 px-4 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <FolderKanban className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{inv.project?.name || "Project"}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.project?.description || "You've been invited to collaborate"} · role: <span className="font-medium capitalize">{inv.role}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={actionState?.id === inv.id}
                          onClick={() => respond(inv, true)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
                        >
                          {actionState?.id === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={actionState?.id === inv.id}
                          onClick={() => respond(inv, false)}
                          className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {error && (
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
                <span>{error}</span>
              </div>
            )}
            {actionError && (
              <p role="alert" className="mt-3 text-xs text-destructive">{actionError}</p>
            )}

            {/* ── New project ───────────────────────────────────────────── */}
            <div className="mt-8">
              {creating ? (
                <form onSubmit={create} className="card-surface space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                      <Plus className="h-4 w-4 text-primary" /> New project
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCreating(false)}
                      aria-label="Cancel creating project"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                    <input
                      value={form.icon}
                      onChange={(e) => setForm({ ...form, icon: e.target.value })}
                      placeholder="🚀"
                      aria-label="Project icon (emoji)"
                      maxLength={4}
                      className="h-10 w-16 rounded-lg border border-border bg-muted/40 px-2 text-center text-lg outline-none transition-colors focus:border-primary/60"
                    />
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Project name"
                      aria-label="Project name"
                      autoFocus
                      className="h-10 w-full rounded-lg border border-border bg-muted/40 px-3 text-sm outline-none transition-colors focus:border-primary/60"
                    />
                  </div>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="What is this project about? (optional)"
                    aria-label="Project description"
                    rows={2}
                    className="w-full resize-y rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-primary/60"
                  />
                  {actionError && <p role="alert" className="text-xs text-destructive">{actionError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!form.name.trim() || saving}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-40"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Create project
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreating(false)}
                      disabled={saving}
                      className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4" /> New project
                </button>
              )}
            </div>

            {/* ── Project grid ──────────────────────────────────────────── */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(projects || []).length === 0 ? (
                <div className="sm:col-span-2 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
                  <Sparkles className="mb-3 h-8 w-8 text-muted-foreground/60" strokeWidth={1.6} />
                  <p className="text-sm font-medium">No projects yet</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Create a project to bring files, conversations, notes, tasks and teammates into one shared workspace.
                  </p>
                </div>
              ) : (
                (projects || []).map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduced ? { duration: 0 } : { delay: 0.05 * i, duration: 0.3, ease: "easeOut" }}
                  >
                    <Link
                      to={`/projects/${p.id}`}
                      className="card-surface card-hover group flex h-full flex-col p-4"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-indigo-500/10 text-xl">
                          {p.icon || "📁"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold group-hover:text-primary">{p.name}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {p.description || "No description"}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {p._count.members}</span>
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {p._count.files}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {p._count.conversations}</span>
                        <span className="flex items-center gap-1"><StickyNote className="h-3 w-3" /> {p._count.notes}</span>
                        <span className="flex items-center gap-1"><CheckSquare className="h-3 w-3" /> {p._count.tasks}</span>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                        <div className="flex -space-x-2">
                          {p.members.slice(0, 4).map((m) => (
                            <span
                              key={m.user.id}
                              title={m.user.name || m.user.email || "Member"}
                              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-gradient-to-br from-primary/80 to-indigo-500 text-[10px] font-semibold text-primary-foreground"
                            >
                              {(m.user.name || "U")[0]}
                            </span>
                          ))}
                          {p.members.length > 4 && (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-medium text-muted-foreground">
                              +{p.members.length - 4}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">Updated {formatDate(p.updatedAt)}</span>
                      </div>
                    </Link>
                  </motion.div>
                ))
              )}
            </div>

            {/* ── Collaboration note ────────────────────────────────────── */}
            <div className="mt-10 rounded-2xl border border-border/70 bg-card/50 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <Sparkles className="h-4 w-4 text-primary" /> How sharing works
              </h2>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Owners manage members and roles. Editors create notes, tasks, and link files and conversations.
                Viewers read and can ask the project AI. Invitations are real: they must be accepted before someone
                becomes a member, and every request is verified server-side — you can never see a project you
                don't belong to.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
