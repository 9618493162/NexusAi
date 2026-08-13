import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Loader2,
  Save,
  Download,
  Eye,
  Pencil,
  Sparkles,
  ArrowLeft,
  AlertTriangle,
  History,
  FileText,
  Presentation,
} from "lucide-react";
import { NexusCore } from "@/components/ui/nexus-core";
import { cn } from "@/utils/cn";
import {
  getDocument,
  saveDocument,
  listRevisions,
  streamOutline,
  streamGenerate,
  streamMagicSlides,
  exportUrl,
  DocumentItem,
  DocumentRevision,
} from "@/services/documents.service";

const SOURCE_LABEL: Record<string, string> = {
  research: "Research session",
  meeting: "Meeting",
  dataset: "Dataset",
  file: "File",
  conversation: "Conversation",
};

/* Minimal markdown preview renderer (mirrors the backend export). */
function renderMarkdown(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  const lines = md.split("\n");
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push("<ul>" + list.map((li) => `<li>${li}</li>`).join("") + "</ul>");
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flush();
      continue;
    }
    const h1 = line.match(/^# (.*)$/);
    const h2 = line.match(/^## (.*)$/);
    const h3 = line.match(/^### (.*)$/);
    const li = line.match(/^[-*] (.*)$/);
    if (h1) {
      flush();
      out.push(`<h1>${inline(h1[1])}</h1>`);
    } else if (h2) {
      flush();
      out.push(`<h2>${inline(h2[1])}</h2>`);
    } else if (h3) {
      flush();
      out.push(`<h3>${inline(h3[1])}</h3>`);
    } else if (li) {
      list.push(inline(li[1]));
    } else {
      flush();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return out.join("\n");
}

export function DocumentEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "failed">("saved");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outline, setOutline] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStage, setGenStage] = useState("");
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);
  const [showRevisions, setShowRevisions] = useState(false);
  const [msGenerating, setMsGenerating] = useState(false);
  const [msResult, setMsResult] = useState<{ url: string; pdfUrl: string } | null>(null);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getDocument(id);
        if (cancelled) return;
        setDoc(d);
        setTitle(d.title);
        setContent(d.content);
        setOutline(d.outline || "");
      } catch (e: any) {
        setError(e?.message || "Could not load the document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [id]);

  // Debounced autosave.
  useEffect(() => {
    if (!doc || loading) return;
    setSaveState("dirty");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveDocument(doc.id, content);
        setSaveState("saved");
      } catch {
        setSaveState("failed");
      }
    }, 1200);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [content, doc, loading]);

  const loadRevisions = useCallback(async () => {
    try {
      const revs = await listRevisions(id);
      setRevisions(revs);
      setShowRevisions(true);
    } catch {
      /* ignore */
    }
  }, [id]);

  const restore = useCallback(
    async (rev: DocumentRevision) => {
      if (!doc) return;
      setContent(rev.content);
      setShowRevisions(false);
      setError("");
    },
    [doc]
  );

  const genOutline = useCallback(() => {
    if (!doc || generating) return;
    setGenerating(true);
    setGenStage("outline");
    setError("");
    void streamOutline(doc.title, doc.type, {
      onStatus: (s) => setGenStage(s),
      onDone: (data) => {
        setOutline(data.outline || "");
        setOutlineOpen(true);
        setGenerating(false);
        void saveDocument(doc.id, content, title).then(() => undefined);
      },
      onError: (m) => {
        setError(m);
        setGenerating(false);
      },
    }).then((s) => {
      abortRef.current = s;
    });
  }, [doc, generating, content, title]);

  const generate = useCallback(() => {
    if (!doc || generating) return;
    setGenerating(true);
    setGenStage("context");
    setError("");
    void streamGenerate(doc.id, outline, {
      onStatus: (s) => setGenStage(s),
      onChunk: (t) => setContent((prev) => prev + t),
      onDone: (data) => {
        if (data.content) setContent(data.content);
        setGenerating(false);
        setOutlineOpen(false);
        setSaveState("saved");
      },
      onError: (m) => {
        setError(m);
        setGenerating(false);
      },
    }).then((s) => {
      abortRef.current = s;
    });
  }, [doc, generating, outline]);

  const wordCount = useMemo(() => (content.trim() ? content.trim().split(/\s+/).length : 0), [content]);
  const isPresentation = doc?.type === "presentation";
  const previewHtml = useMemo(() => renderMarkdown(content), [content]);

  const genMagicSlides = useCallback(() => {
    if (!doc || msGenerating) return;
    setMsGenerating(true);
    setMsResult(null);
    setError("");
    void streamMagicSlides(doc.id, {
      onStatus: () => undefined,
      onDone: (data) => {
        setMsResult({ url: data.url, pdfUrl: data.pdfUrl || "" });
        setMsGenerating(false);
      },
      onError: (m) => {
        setError(m);
        setMsGenerating(false);
      },
    }).then((s) => {
      abortRef.current = s;
    });
  }, [doc, msGenerating]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="text-muted-foreground">{error || "Document not found."}</p>
        <button onClick={() => navigate("/documents")} className="text-sm text-primary">
          ← Back to documents
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-muted/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate("/documents")}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
            aria-label="Back to documents"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <NexusCore size={34} state={generating ? "thinking" : error ? "error" : "idle"} active={generating} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => doc && saveDocument(doc.id, content, title).catch(() => undefined)}
              className="w-full bg-transparent text-base font-semibold outline-none"
              aria-label="Document title"
            />
            <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
              <span className="uppercase">{doc.type}</span>
              {doc.sourceName && <span>· from {SOURCE_LABEL[doc.sourceType || ""] || doc.sourceType}: {doc.sourceName}</span>}
              <span>
                · {saveState === "saved" ? "Saved" : saveState === "dirty" ? "Unsaved changes…" : saveState === "saving" ? "Saving…" : "Save failed"}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={loadRevisions}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/70"
              title="Version history"
            >
              <History className="h-3.5 w-3.5" /> History
            </button>
            <button
              onClick={() => doc && saveDocument(doc.id, content, title).then(() => setSaveState("saved")).catch(() => setSaveState("failed"))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/70"
            >
              <Save className="h-3.5 w-3.5" /> Save
            </button>
            <a
              href={exportUrl(doc.id, "md")}
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
            >
              <Download className="h-3.5 w-3.5" /> .md
            </a>
            <a
              href={exportUrl(doc.id, "html")}
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
              title="Print-ready HTML (open to save as PDF)"
            >
              <Download className="h-3.5 w-3.5" /> HTML
            </a>
            {isPresentation && (
              <a
                href={exportUrl(doc.id, "pptx")}
                download
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                title="Real PowerPoint file, generated server-side"
              >
                <Presentation className="h-3.5 w-3.5" /> PPTX
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Revisions panel */}
      {showRevisions && (
        <div className="mx-auto mt-4 max-w-6xl px-4">
          <div className="card-surface rounded-xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Version history ({revisions.length})</h3>
              <button onClick={() => setShowRevisions(false)} className="text-xs text-muted-foreground hover:text-foreground">
                Close
              </button>
            </div>
            {revisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No previous versions yet — every save snapshots the prior content.</p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {revisions.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => void restore(r)}
                    className="flex w-full items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-left text-xs hover:bg-muted/60"
                  >
                    <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                    <span className="text-primary">Restore</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI toolbar */}
      <div className="mx-auto mt-4 max-w-6xl px-4">
        <div className="card-surface flex flex-wrap items-center gap-2 rounded-xl p-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> AI
          </span>
          <button
            onClick={genOutline}
            disabled={generating}
            className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/70 disabled:opacity-50"
          >
            Generate outline
          </button>
          <button
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? (genStage === "outline" ? "Drafting outline…" : "Writing…") : "Generate full document"}
          </button>
          <button
            onClick={genMagicSlides}
            disabled={msGenerating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 px-3 py-1.5 text-xs font-medium text-violet-500 hover:bg-violet-500/10 disabled:opacity-50"
            title="Generate a professional deck with MagicSlides (real PPTX + PDF)"
          >
            {msGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Presentation className="h-3.5 w-3.5" />}
            {msGenerating ? "MagicSlides is generating…" : "Generate with MagicSlides"}
          </button>
          {doc.sourceName && (
            <span className="text-[11px] text-muted-foreground">
              Sources from {SOURCE_LABEL[doc.sourceType || ""] || doc.sourceType} are included as real context.
            </span>
          )}
          {msResult && (
            <span className="inline-flex items-center gap-2 text-[11px] text-emerald-500">
              <a href={msResult.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-400">
                Download .pptx
              </a>
              {msResult.pdfUrl && (
                <a href={msResult.pdfUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-400">
                  Download .pdf
                </a>
              )}
            </span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">{wordCount.toLocaleString()} words</span>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {outlineOpen && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-surface mt-3 rounded-xl p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Editable outline</h3>
              <button onClick={() => setOutlineOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
                Close
              </button>
            </div>
            <textarea
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              rows={8}
              className="w-full rounded-lg border bg-background p-3 font-mono text-xs outline-none focus:border-primary/50"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Edit freely, then click "Generate full document" — the AI follows this structure exactly.
            </p>
          </motion.div>
        )}
      </div>

      {/* Editor / preview */}
      <div className="mx-auto mt-4 max-w-6xl px-4">
        <div className="card-surface overflow-hidden rounded-2xl">
          <div className="flex items-center gap-1 border-b border-muted/60 px-3 py-2">
            <button
              onClick={() => setView("edit")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                view === "edit" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={() => setView("preview")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                view === "preview" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            {isPresentation && (
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3" /> # title · ## section · ### slide
              </span>
            )}
          </div>
          {view === "edit" ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Document title&#10;&#10;Start writing markdown, or use the AI toolbar to draft the full document…"
              className="h-[60vh] w-full resize-none bg-transparent p-5 font-mono text-sm leading-relaxed outline-none"
              aria-label="Document content (markdown)"
            />
          ) : (
            <div
              className="prose-doc h-[60vh] overflow-y-auto p-6 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: previewHtml || "<p class='text-muted-foreground'>Nothing to preview yet.</p>" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
