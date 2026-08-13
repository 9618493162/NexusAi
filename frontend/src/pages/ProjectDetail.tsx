import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, Users, FileText, MessageSquare, StickyNote, CheckSquare, Sparkles,
  Loader2, X, Plus, Pencil, Trash2, Send, Mail, UserMinus, Shield, Activity as ActivityIcon,
  FolderKanban, ChevronRight,
} from "lucide-react";
import { projectsService, ProjectDetail as ProjectDetailData, ProjectTask, ProjectActivity } from "@/services/projects.service";
import { chatService } from "@/services/chat.service";
import { fileService } from "@/services/file.service";
import { Conversation, FileItem } from "@/types";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

type TabKey = "overview" | "notes" | "tasks" | "files" | "chats" | "people" | "activity" | "ai";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "notes", label: "Notes" },
  { key: "tasks", label: "Tasks" },
  { key: "files", label: "Files" },
  { key: "chats", label: "Chats" },
  { key: "people", label: "People" },
  { key: "activity", label: "Activity" },
  { key: "ai", label: "AI" },
];

const TASK_COLUMNS: Array<{ key: ProjectTask["status"]; label: string; dot: string }> = [
  { key: "todo", label: "To do", dot: "bg-slate-400" },
  { key: "in_progress", label: "In progress", dot: "bg-amber-500" },
  { key: "done", label: "Done", dot: "bg-emerald-500" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ACTIVITY_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  created: { icon: FolderKanban, color: "text-primary bg-primary/10" },
  project_updated: { icon: Pencil, color: "text-primary bg-primary/10" },
  member_invited: { icon: Mail, color: "text-blue-500 bg-blue-500/10" },
  member_joined: { icon: Users, color: "text-emerald-500 bg-emerald-500/10" },
  member_removed: { icon: UserMinus, color: "text-destructive bg-destructive/10" },
  role_changed: { icon: Shield, color: "text-violet-500 bg-violet-500/10" },
  invitation_cancelled: { icon: X, color: "text-muted-foreground bg-muted" },
  file_added: { icon: FileText, color: "text-emerald-500 bg-emerald-500/10" },
  file_removed: { icon: Trash2, color: "text-destructive bg-destructive/10" },
  conversation_added: { icon: MessageSquare, color: "text-primary bg-primary/10" },
  conversation_removed: { icon: Trash2, color: "text-destructive bg-destructive/10" },
  note_added: { icon: StickyNote, color: "text-amber-500 bg-amber-500/10" },
  note_updated: { icon: Pencil, color: "text-amber-500 bg-amber-500/10" },
  note_deleted: { icon: Trash2, color: "text-destructive bg-destructive/10" },
  task_added: { icon: CheckSquare, color: "text-emerald-500 bg-emerald-500/10" },
  task_moved: { icon: ChevronRight, color: "text-blue-500 bg-blue-500/10" },
  task_deleted: { icon: Trash2, color: "text-destructive bg-destructive/10" },
  ai_asked: { icon: Sparkles, color: "text-violet-500 bg-violet-500/10" },
};

export function ProjectDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const [project, setProject] = useState<ProjectDetailData | null>(null);
  const [activity, setActivity] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("overview");

  // Link pickers
  const [myFiles, setMyFiles] = useState<FileItem[]>([]);
  const [myConversations, setMyConversations] = useState<Conversation[]>([]);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [chatPickerOpen, setChatPickerOpen] = useState(false);

  // Note editing
  const [noteForm, setNoteForm] = useState<{ id?: string; title: string; content: string } | null>(null);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<string | null>(null);

  // Task form
  const [taskForm, setTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");

  // People
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");

  // AI
  const [aiMessages, setAiMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const aiBottomRef = useRef<HTMLDivElement>(null);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const canWrite = project ? project.myRole === "owner" || project.myRole === "editor" : false;
  const isOwner = project?.myRole === "owner";

  const load = useCallback(async () => {
    try {
      const { data } = await projectsService.get(id);
      setProject(data.project);
      setActivity(data.activity);
      setError("");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Project not found or you don't have access.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fileService.getFiles().then(({ data }) => setMyFiles(data)).catch(() => {});
    chatService.getConversations().then(({ data }) => setMyConversations(data)).catch(() => {});
  }, []);

  const run = async (fn: () => Promise<unknown>, refresh = true) => {
    setBusy(true);
    setActionError("");
    try {
      await fn();
      if (refresh) await load();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  };

  const transition = reduced ? { duration: 0 } : { duration: 0.25, ease: "easeOut" as const };

  const counts = useMemo(() => project ? ({
    notes: project.notes.length,
    tasks: project.tasks.length,
    files: project.files.length,
    chats: project.conversations.length,
    members: project.members.length,
  }) : null, [project]);

  // Auto-scroll AI responses as they stream.
  useEffect(() => {
    aiBottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [aiMessages]);

  const askAI = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = aiInput.trim();
    if (!text || aiBusy) return;
    setAiInput("");
    setAiMessages((m) => [...m, { role: "user", content: text }]);
    setAiBusy(true);
    setActionError("");
    let assistantId = "";
    try {
      const response = await projectsService.askProject(id, text);
      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || "Project AI failed");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      assistantId = Date.now().toString();
      setAiMessages((m) => [...m, { role: "assistant", content: "", _id: assistantId } as any]);
      let out = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n\n")) {
          if (!line.startsWith("data: ")) continue;
          let data: any;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }
          if (data.error) throw new Error(typeof data.error === "string" ? data.error : "Project AI failed");
          if (data.content) {
            out += data.content;
            setAiMessages((m) => m.map((msg) => (msg as any)._id === assistantId ? { ...msg, content: out } : msg));
          }
        }
      }
    } catch (err: any) {
      setActionError(err?.message || "Project AI failed");
      setAiMessages((m) => m.filter((msg) => (msg as any)._id !== assistantId));
    } finally {
      setAiBusy(false);
      await load();
    }
  };

  if (loading) {
    return (
      <div className="relative min-h-full">
        <SpatialEnvironment />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <Skeleton className="h-8 w-64" />
          <div className="mt-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center px-4 text-center">
        <SpatialEnvironment />
        <FolderKanban className="mb-3 h-10 w-10 text-muted-foreground/60" strokeWidth={1.6} />
        <p className="text-sm font-medium">{error || "Project not found"}</p>
        <Link to="/projects" className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent">
          <ArrowLeft className="h-4 w-4" /> Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-full">
      <SpatialEnvironment />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-4">
          <Link
            to="/projects"
            className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Back to projects"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-indigo-500/10 text-2xl">
                {project.icon || "📁"}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{project.name}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{project.description || "No description"}</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold capitalize",
              project.myRole === "owner" ? "bg-primary/10 text-primary" : project.myRole === "editor" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
            )}>
              {project.myRole}
            </span>
            {isOwner && (
              <button
                type="button"
                onClick={() => { if (window.confirm("Delete this project? This removes it for every member.")) run(() => projectsService.remove(id)).then(() => navigate("/projects")); }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
            <span>{error}</span>
          </div>
        )}
        {actionError && <p role="alert" className="mt-3 text-xs text-destructive">{actionError}</p>}

        {/* ── Counts + tabs ────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border/60 py-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-blue-500" /> <b className="tabular-nums text-foreground">{counts!.members}</b> members</span>
          <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-emerald-500" /> <b className="tabular-nums text-foreground">{counts!.files}</b> files</span>
          <span className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4 text-primary" /> <b className="tabular-nums text-foreground">{counts!.chats}</b> chats</span>
          <span className="flex items-center gap-1.5"><StickyNote className="h-4 w-4 text-amber-500" /> <b className="tabular-nums text-foreground">{counts!.notes}</b> notes</span>
          <span className="flex items-center gap-1.5"><CheckSquare className="h-4 w-4 text-emerald-500" /> <b className="tabular-nums text-foreground">{counts!.tasks}</b> tasks</span>
          <span className="ml-auto hidden text-xs sm:block">Created {formatDate(project.createdAt)}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Project sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                tab === t.key ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {/* ── Overview ────────────────────────────────────────────────── */}
          {tab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="grid gap-4 lg:grid-cols-2">
              <button onClick={() => setTab("notes")} className="card-surface card-hover group flex items-center gap-4 p-4 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><StickyNote className="h-5 w-5" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Notes</span>
                  <span className="block truncate text-xs text-muted-foreground">Shared project knowledge</span>
                </span>
                <span className="text-2xl font-bold tabular-nums tracking-tight">{counts!.notes}</span>
              </button>
              <button onClick={() => setTab("tasks")} className="card-surface card-hover group flex items-center gap-4 p-4 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><CheckSquare className="h-5 w-5" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Tasks</span>
                  <span className="block truncate text-xs text-muted-foreground">Kanban board</span>
                </span>
                <span className="text-2xl font-bold tabular-nums tracking-tight">{counts!.tasks}</span>
              </button>
              <button onClick={() => setTab("files")} className="card-surface card-hover group flex items-center gap-4 p-4 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><FileText className="h-5 w-5" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Files</span>
                  <span className="block truncate text-xs text-muted-foreground">Linked documents feeding the project AI</span>
                </span>
                <span className="text-2xl font-bold tabular-nums tracking-tight">{counts!.files}</span>
              </button>
              <button onClick={() => setTab("chats")} className="card-surface card-hover group flex items-center gap-4 p-4 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageSquare className="h-5 w-5" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Conversations</span>
                  <span className="block truncate text-xs text-muted-foreground">Chats linked to this project</span>
                </span>
                <span className="text-2xl font-bold tabular-nums tracking-tight">{counts!.chats}</span>
              </button>
              <button onClick={() => setTab("people")} className="card-surface card-hover group flex items-center gap-4 p-4 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><Users className="h-5 w-5" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">People</span>
                  <span className="block truncate text-xs text-muted-foreground">Members, roles & invitations</span>
                </span>
                <span className="text-2xl font-bold tabular-nums tracking-tight">{counts!.members}</span>
              </button>
              <button onClick={() => setTab("ai")} className="card-surface card-hover group flex items-center gap-4 p-4 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500"><Sparkles className="h-5 w-5" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Project AI</span>
                  <span className="block truncate text-xs text-muted-foreground">Ask about notes & linked files</span>
                </span>
                <Sparkles className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>

              <div className="lg:col-span-2">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <ActivityIcon className="h-4 w-4 text-muted-foreground" /> Recent activity
                </h2>
                {activity.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-8 text-center text-xs text-muted-foreground">
                    No activity yet — create a note, add a file, or invite someone.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activity.slice(0, 6).map((a) => <ActivityRow key={a.id} a={a} />)}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Notes ───────────────────────────────────────────────────── */}
          {tab === "notes" && (
            <motion.div key="notes" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="space-y-4">
              {canWrite && (
                noteForm ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!noteForm.title.trim() || busy) return;
                      const body = noteForm.id
                        ? projectsService.updateNote(id, noteForm.id, noteForm)
                        : projectsService.createNote(id, noteForm);
                      run(() => body).then(() => setNoteForm(null));
                    }}
                    className="card-surface space-y-3 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                        <StickyNote className="h-4 w-4 text-primary" /> {noteForm.id ? "Edit note" : "New note"}
                      </h3>
                      <button type="button" onClick={() => setNoteForm(null)} aria-label="Cancel editing note" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <input
                      value={noteForm.title}
                      onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                      placeholder="Note title"
                      aria-label="Note title"
                      autoFocus
                      className="h-10 w-full rounded-lg border border-border bg-muted/40 px-3 text-sm outline-none transition-colors focus:border-primary/60"
                    />
                    <textarea
                      value={noteForm.content}
                      onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                      placeholder="Write the note…"
                      aria-label="Note content"
                      rows={6}
                      className="w-full resize-y rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-primary/60"
                    />
                    <div className="flex gap-2">
                      <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {noteForm.id ? "Save changes" : "Add note"}
                      </button>
                      <button type="button" onClick={() => setNoteForm(null)} disabled={busy} className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setNoteForm({ title: "", content: "" })} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
                    <Plus className="h-4 w-4" /> New note
                  </button>
                )
              )}
              {project.notes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
                  <p className="text-sm font-medium">No notes yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Notes are shared with the project and feed the project AI.</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {project.notes.map((note) => (
                    <div key={note.id} className="card-surface card-hover group flex flex-col p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold">{note.title}</h3>
                        {canWrite && (
                          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button type="button" onClick={() => setNoteForm({ id: note.id, title: note.title, content: note.content })} aria-label={`Edit ${note.title}`} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {confirmDeleteNote === note.id ? (
                              <button type="button" onClick={() => run(() => projectsService.deleteNote(id, note.id)).then(() => setConfirmDeleteNote(null))} className="rounded-lg bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90">
                                Delete
                              </button>
                            ) : (
                              <button type="button" onClick={() => setConfirmDeleteNote(note.id)} aria-label={`Delete ${note.title}`} className="rounded-lg p-1.5 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{note.content}</p>
                      <p className="mt-2 text-[10px] text-muted-foreground/70">Updated {timeAgo(note.updatedAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Tasks (kanban) ──────────────────────────────────────────── */}
          {tab === "tasks" && (
            <motion.div key="tasks" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
              {canWrite && (
                taskForm ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!taskTitle.trim() || busy) return;
                      run(() => projectsService.createTask(id, { title: taskTitle, assigneeId: taskAssignee || null }))
                        .then(() => { setTaskTitle(""); setTaskAssignee(""); setTaskForm(false); });
                    }}
                    className="card-surface mb-4 flex flex-wrap items-center gap-2 p-3"
                  >
                    <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" aria-label="Task title" autoFocus className="h-9 min-w-48 flex-1 rounded-lg border border-border bg-muted/40 px-3 text-sm outline-none transition-colors focus:border-primary/60" />
                    <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} aria-label="Assign to" className="h-9 rounded-lg border border-border bg-muted/40 px-2.5 text-sm outline-none transition-colors focus:border-primary/60">
                      <option value="">Unassigned</option>
                      {project.members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name || m.user.email}</option>)}
                    </select>
                    <button type="submit" disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
                    </button>
                    <button type="button" onClick={() => setTaskForm(false)} className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button type="button" onClick={() => setTaskForm(true)} className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
                    <Plus className="h-4 w-4" /> New task
                  </button>
                )
              )}
              <div className="grid gap-4 md:grid-cols-3">
                {TASK_COLUMNS.map((col) => {
                  const tasks = project.tasks.filter((t) => t.status === col.key);
                  return (
                    <div key={col.key} className="rounded-2xl border border-border/70 bg-card/40 p-3">
                      <div className="mb-2.5 flex items-center gap-2 px-1">
                        <span className={cn("h-2 w-2 rounded-full", col.dot)} />
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</p>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground/70">{tasks.length}</span>
                      </div>
                      <div className="space-y-2">
                        {tasks.length === 0 && (
                          <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-[11px] text-muted-foreground/60">
                            Empty
                          </div>
                        )}
                        {tasks.map((task) => (
                          <div key={task.id} className="card-surface card-hover p-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn("text-sm font-medium", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
                              {canWrite && (
                                <div className="flex shrink-0 items-center gap-1">
                                  {col.key !== "todo" && (
                                    <button type="button" onClick={() => run(() => projectsService.updateTask(id, task.id, { status: "todo" }))} title="Move to To do" aria-label="Move to To do" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                                      <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                                    </button>
                                  )}
                                  {col.key !== "done" && (
                                    <button type="button" onClick={() => run(() => projectsService.updateTask(id, task.id, { status: col.key === "todo" ? "in_progress" : "done" }))} title="Move forward" aria-label="Move task forward" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button type="button" onClick={() => run(() => projectsService.deleteTask(id, task.id))} title="Delete task" aria-label={`Delete ${task.title}`} className="rounded-md p-1 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {task.assignee && (
                              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Users className="h-3 w-3" /> {task.assignee.name || task.assignee.email}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Files ───────────────────────────────────────────────────── */}
          {tab === "files" && (
            <motion.div key="files" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="space-y-4">
              {canWrite && (
                filePickerOpen ? (
                  <div className="card-surface p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold tracking-tight">Link a file from your library</h3>
                      <button type="button" onClick={() => setFilePickerOpen(false)} aria-label="Close file picker" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {myFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No files in your library yet — upload one on the Files page.</p>
                    ) : (
                      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                        {myFiles.map((f) => {
                          const linked = project.files.some((pf) => pf.file.id === f.id);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              disabled={linked}
                              onClick={() => run(() => projectsService.addFile(id, f.id))}
                              className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:opacity-50"
                            >
                              <FileText className="h-4 w-4 shrink-0 text-emerald-500" />
                              <span className="min-w-0 flex-1 truncate text-sm">{f.originalName}</span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">{linked ? "Linked ✓" : "Add"}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <button type="button" onClick={() => setFilePickerOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
                    <Plus className="h-4 w-4" /> Link file
                  </button>
                )
              )}
              {project.files.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
                  <p className="text-sm font-medium">No files linked</p>
                  <p className="mt-1 text-xs text-muted-foreground">Linked files' extracted text feeds the project AI for everyone in the project.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {project.files.map((link) => (
                    <div key={link.id} className="card-surface card-hover group flex items-center gap-3 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><FileText className="h-4 w-4" strokeWidth={1.8} /></span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/files?open=${link.file.id}`} className="truncate text-sm font-medium hover:text-primary">{link.file.originalName}</Link>
                        <p className="truncate text-xs text-muted-foreground">{link.file.mimeType}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(link.file.createdAt)}</span>
                      {canWrite && (
                        <button type="button" onClick={() => run(() => projectsService.removeFile(id, link.file.id))} aria-label={`Unlink ${link.file.originalName}`} className="rounded-lg p-1.5 text-destructive/70 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Chats ───────────────────────────────────────────────────── */}
          {tab === "chats" && (
            <motion.div key="chats" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="space-y-4">
              {canWrite && (
                chatPickerOpen ? (
                  <div className="card-surface p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold tracking-tight">Link a conversation from your chats</h3>
                      <button type="button" onClick={() => setChatPickerOpen(false)} aria-label="Close conversation picker" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {myConversations.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No conversations yet — start one on the Chat page.</p>
                    ) : (
                      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                        {myConversations.map((c) => {
                          const linked = project.conversations.some((pc) => pc.conversation.id === c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              disabled={linked}
                              onClick={() => run(() => projectsService.addConversation(id, c.id))}
                              className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:opacity-50"
                            >
                              <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
                              <span className="min-w-0 flex-1 truncate text-sm">{c.title || "Untitled conversation"}</span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">{linked ? "Linked ✓" : "Add"}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <button type="button" onClick={() => setChatPickerOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
                    <Plus className="h-4 w-4" /> Link conversation
                  </button>
                )
              )}
              {project.conversations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
                  <p className="text-sm font-medium">No conversations linked</p>
                  <p className="mt-1 text-xs text-muted-foreground">Link chats so the project's work stays together.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {project.conversations.map((link) => (
                    <div key={link.id} className="card-surface card-hover group flex items-center gap-3 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageSquare className="h-4 w-4" strokeWidth={1.8} /></span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/chat/${link.conversation.id}`} className="truncate text-sm font-medium hover:text-primary">{link.conversation.title || "Untitled conversation"}</Link>
                        <p className="text-xs text-muted-foreground">Updated {formatDate(link.conversation.updatedAt)}</p>
                      </div>
                      {canWrite && (
                        <button type="button" onClick={() => run(() => projectsService.removeConversation(id, link.conversation.id))} aria-label="Unlink conversation" className="rounded-lg p-1.5 text-destructive/70 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── People ──────────────────────────────────────────────────── */}
          {tab === "people" && (
            <motion.div key="people" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="space-y-6">
              {isOwner && (
                <div className="card-surface p-4">
                  {inviteOpen ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!inviteEmail.trim() || busy) return;
                        run(() => projectsService.invite(id, inviteEmail, inviteRole)).then(() => { setInviteEmail(""); setInviteOpen(false); });
                      }}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="teammate@example.com"
                        aria-label="Email to invite"
                        autoFocus
                        className="h-9 min-w-52 flex-1 rounded-lg border border-border bg-muted/40 px-3 text-sm outline-none transition-colors focus:border-primary/60"
                      />
                      <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} aria-label="Invitation role" className="h-9 rounded-lg border border-border bg-muted/40 px-2.5 text-sm outline-none transition-colors focus:border-primary/60">
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button type="submit" disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Invite
                      </button>
                      <button type="button" onClick={() => setInviteOpen(false)} className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button type="button" onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
                      <Plus className="h-4 w-4" /> Invite member
                    </button>
                  )}
                  <p className="mt-2.5 text-[11px] text-muted-foreground">
                    Invitations are real: the invitee accepts or declines from the Projects page before becoming a member.
                  </p>
                </div>
              )}

              {project.invitations.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-tight">
                    <Mail className="h-4 w-4 text-blue-500" /> Pending invitations
                  </h3>
                  <div className="space-y-2">
                    {project.invitations.map((inv) => (
                      <div key={inv.id} className="card-surface flex items-center gap-3 p-3.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><Mail className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{inv.email}</p>
                          <p className="text-xs text-muted-foreground capitalize">role: {inv.role} · invited {timeAgo(inv.createdAt)}</p>
                        </div>
                        {isOwner && (
                          <button type="button" onClick={() => run(() => projectsService.cancelInvitation(id, inv.id))} aria-label={`Cancel invitation to ${inv.email}`} className="rounded-lg p-1.5 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <Users className="h-4 w-4 text-blue-500" /> Members ({project.members.length})
                </h3>
                <div className="space-y-2">
                  {project.members.map((m) => (
                    <div key={m.user.id} className="card-surface flex items-center gap-3 p-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-500 text-xs font-semibold text-primary-foreground">
                        {(m.user.name || m.user.email || "U")[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.user.name || "Unnamed"}{m.role === "owner" && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Owner</span>}</p>
                        <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                      </div>
                      {isOwner && m.role !== "owner" && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <select
                            value={m.role}
                            onChange={(e) => run(() => projectsService.changeRole(id, m.user.id, e.target.value))}
                            aria-label={`Role for ${m.user.name || m.user.email}`}
                            className="h-8 rounded-lg border border-border bg-muted/40 px-2 text-xs outline-none transition-colors focus:border-primary/60"
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button type="button" onClick={() => run(() => projectsService.removeMember(id, m.user.id))} aria-label={`Remove ${m.user.name || m.user.email}`} className="rounded-lg p-1.5 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive">
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Activity ────────────────────────────────────────────────── */}
          {tab === "activity" && (
            <motion.div key="activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
              {activity.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center text-xs text-muted-foreground">
                  No activity yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {activity.map((a) => <ActivityRow key={a.id} a={a} />)}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Project AI ──────────────────────────────────────────────── */}
          {tab === "ai" && (
            <motion.div key="ai" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="flex h-[60vh] flex-col rounded-2xl border border-border/70 bg-card/50">
              <div className="border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <Sparkles className="h-4 w-4 text-violet-500" /> Ask the project
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  NexusAI answers from this project's notes and linked files only — never anything outside it.
                </p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {aiMessages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <Sparkles className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                    <p className="text-sm font-medium">Ask anything about the project</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      "Summarize the notes", "What decisions were made?", "Create action items from the meeting notes."
                    </p>
                  </div>
                )}
                {aiMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "border border-border/70 bg-muted/30"
                    )}>
                      {msg.content || (aiBusy && <span className="inline-flex gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…</span>)}
                    </div>
                  </div>
                ))}
                <div ref={aiBottomRef} />
              </div>
              <form onSubmit={askAI} className="flex items-center gap-2 border-t border-border p-3">
                <input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Ask anything about this project…"
                  aria-label="Ask the project AI"
                  className="h-10 flex-1 rounded-xl border border-border bg-muted/40 px-3.5 text-sm outline-none transition-colors focus:border-primary/60"
                />
                <button
                  type="submit"
                  disabled={!aiInput.trim() || aiBusy}
                  aria-label="Send to project AI"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-40"
                >
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ a }: { a: ProjectActivity }) {
  const meta = ACTIVITY_ICONS[a.type] || { icon: ActivityIcon, color: "bg-muted text-muted-foreground" };
  const actor = a.actorName || a.user?.name || "Someone";
  return (
    <div className="card-surface card-hover flex items-center gap-3 p-3.5">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.color)}>
        <meta.icon className="h-4 w-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-medium">{actor}</span>{" "}
          <span className="text-muted-foreground">
            {a.type === "created" ? "created this project" :
             a.type === "project_updated" ? "updated the project" :
             a.type === "member_invited" ? "invited" :
             a.type === "member_joined" ? "joined the project" :
             a.type === "member_removed" ? "removed a member" :
             a.type === "role_changed" ? "changed a member's role" :
             a.type === "invitation_cancelled" ? "cancelled an invitation" :
             a.type === "file_added" ? "added a file" :
             a.type === "file_removed" ? "removed a file" :
             a.type === "conversation_added" ? "linked a conversation" :
             a.type === "conversation_removed" ? "unlinked a conversation" :
             a.type === "note_added" ? "added a note" :
             a.type === "note_updated" ? "updated a note" :
             a.type === "note_deleted" ? "deleted a note" :
             a.type === "task_added" ? "added a task" :
             a.type === "task_moved" ? "moved a task" :
             a.type === "task_deleted" ? "deleted a task" :
             a.type === "ai_asked" ? "asked the project AI" :
             "acted on the project"}
          </span>
          {a.detail && <span className="font-medium"> — {a.detail}</span>}
        </p>
        <p className="text-[11px] text-muted-foreground/70">{timeAgo(a.createdAt)}</p>
      </div>
    </div>
  );
}
