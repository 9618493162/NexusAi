import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  FileText,
  Plus,
  Loader2,
  ArrowRight,
  Trash2,
  FileType,
  Presentation,
  Newspaper,
  Briefcase,
  StickyNote,
  AlertTriangle,
} from "lucide-react";
import { NexusCore } from "@/components/ui/nexus-core";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/utils/cn";
import {
  listDocuments,
  createDocument,
  deleteDocument,
  getSources,
  DocumentItem,
  DocumentSources,
} from "@/services/documents.service";

const TYPES = [
  { id: "report", label: "Report", icon: FileType, hint: "Structured analysis" },
  { id: "presentation", label: "Presentation", icon: Presentation, hint: "Slide-ready structure" },
  { id: "article", label: "Article", icon: Newspaper, hint: "Long-form writing" },
  { id: "proposal", label: "Proposal", icon: Briefcase, hint: "Problem → plan" },
  { id: "notes", label: "Notes", icon: StickyNote, hint: "Scannable summary" },
];

const SOURCE_LABEL: Record<string, string> = {
  research: "Research session",
  meeting: "Meeting",
  dataset: "Dataset",
  file: "File",
  conversation: "Conversation",
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "";
  }
}

export function Documents() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("report");
  const [sourceType, setSourceType] = useState<string>("");
  const [sourceId, setSourceId] = useState<string>("");
  const [sources, setSources] = useState<DocumentSources | null>(null);
  const [creating, setCreating] = useState(false);
  const reduced = useReducedMotion();

  const load = useCallback(async () => {
    try {
      const items = await listDocuments();
      setDocs(items);
    } catch (e: any) {
      setError(e?.message || "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(async () => {
    setError("");
    setCreateOpen(true);
    setTitle("");
    setType("report");
    setSourceType("");
    setSourceId("");
    if (!sources) {
      try {
        setSources(await getSources());
      } catch {
        /* non-blocking */
      }
    }
  }, [sources]);

  const sourceList = sources
    ? [
        ...(sourceType === "research" ? sources.research : []),
        ...(sourceType === "meeting" ? sources.meetings : []),
        ...(sourceType === "file" ? sources.files : []),
        ...(sourceType === "conversation" ? sources.conversations : []),
      ]
    : [];

  const submit = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const chosen = sourceId ? sourceList.find((s) => s.id === sourceId) : null;
      const doc = await createDocument({
        title: title.trim(),
        type,
        sourceType: chosen ? sourceType : null,
        sourceId: chosen ? chosen.id : null,
        sourceName: chosen ? chosen.name : null,
      });
      setCreateOpen(false);
      navigate(`/documents/${doc.id}`);
    } catch (e: any) {
      setError(e?.message || "Could not create the document.");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteDocument(id);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not delete the document.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SpatialEnvironment />
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6 pb-8 text-center">
          <NexusCore size={150} state={docs.length ? "success" : "idle"} />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Nexus <span className="text-primary">Documents</span>
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Turn ideas into professional reports and presentations — from a prompt, your research, meetings, datasets or files. Real exports, real content.
            </p>
          </div>
          <button
            onClick={() => void openCreate()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Create document
          </button>
        </div>

        {error && (
          <div className="mx-auto mb-6 flex max-w-3xl items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Library */}
        {loading ? (
          <div className="mx-auto max-w-4xl space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Create a report, presentation or article — the AI drafts it from your topic and any real sources you pick."
          />
        ) : (
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Your documents ({docs.length})
            </h2>
            <div className="space-y-2">
              {docs.map((d) => (
                <motion.div
                  key={d.id}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card-surface card-hover group flex items-center gap-3 rounded-xl p-4"
                >
                  <button onClick={() => navigate(`/documents/${d.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="uppercase">{d.type}</span>
                        <span>· {fmtDate(d.updatedAt)}</span>
                        {d.sourceName && (
                          <span className="text-primary">
                            · from {SOURCE_LABEL[d.sourceType || ""] || d.sourceType}: {String(d.sourceName).slice(0, 40)}
                          </span>
                        )}
                        <span>· {d.content.trim() ? `${d.content.split(/\s+/).length.toLocaleString()} words` : "draft"}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => void remove(d.id)}
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                    aria-label={`Delete ${d.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Create modal */}
        {createOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !creating && setCreateOpen(false)}>
            <div
              className="card-surface w-full max-w-lg rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Create document"
            >
              <h2 className="mb-4 text-lg font-semibold">Create a document</h2>

              <label className="mb-1 block text-xs font-medium text-muted-foreground">Title / topic</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AI in Education: A 2026 Overview"
                className="mb-4 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary/50"
                autoFocus
              />

              <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-colors",
                      type === t.id ? "border-primary bg-primary/10 text-primary" : "border-muted hover:border-primary/40"
                    )}
                  >
                    <t.icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground">{t.hint}</span>
                  </button>
                ))}
              </div>

              <label className="mb-1 block text-xs font-medium text-muted-foreground">Source (optional — real backend resources)</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    setSourceType("");
                    setSourceId("");
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs",
                    sourceType === "" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  None — from topic only
                </button>
                {["research", "meeting", "file", "conversation"].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSourceType(s);
                      setSourceId("");
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs",
                      sourceType === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {SOURCE_LABEL[s]}
                  </button>
                ))}
              </div>
              {sourceType && (
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="mb-4 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary/50"
                >
                  <option value="">Select {SOURCE_LABEL[sourceType]}…</option>
                  {sourceList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setCreateOpen(false)}
                  disabled={creating}
                  className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void submit()}
                  disabled={!title.trim() || creating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {creating ? "Creating…" : "Create & open"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
