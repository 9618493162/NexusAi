import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { FileText, Upload, Trash2, File as FileIcon, Loader2, FileCode2, ChevronDown, FileSearch, Sparkles, Search, ArrowDownUp, AlertCircle } from "lucide-react";
import { NexusCore } from "@/components/ui/nexus-core";
import { fileService, fileHasText, FILE_SIZE_LIMIT } from "@/services/file.service";
import { FileItem } from "@/types";
import { cn } from "@/utils/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FileAnalysisPanel } from "@/components/files/FileAnalysisPanel";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : "FILE";
}

// Deterministic particles that react while a file is dragged over the zone.
const DRAG_PARTICLES = [
  { x: "-34%", y: "-30%", delay: 0, size: 5 },
  { x: "30%", y: "-40%", delay: 0.25, size: 4 },
  { x: "38%", y: "26%", delay: 0.1, size: 6 },
  { x: "-40%", y: "34%", delay: 0.35, size: 4 },
  { x: "6%", y: "-48%", delay: 0.5, size: 3 },
];

function fileKind(mime: string): "doc" | "code" | "media" | "other" {
  if (mime.includes("pdf") || mime.includes("word") || mime.includes("text") || mime.includes("sheet") || mime.includes("presentation")) return "doc";
  if (mime.includes("javascript") || mime.includes("json") || mime.includes("xml") || mime.includes("html") || mime.includes("python") || mime.includes("typescript")) return "code";
  if (mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/")) return "media";
  return "other";
}

const KIND_STYLES: Record<string, string> = {
  doc: "bg-primary/10 text-primary",
  code: "bg-blue-500/10 text-blue-500",
  media: "bg-emerald-500/10 text-emerald-500",
  other: "bg-muted text-muted-foreground",
};

/** Shown until the live processor list arrives (and on fetch failure). */
const DEFAULT_SUPPORTED_TYPES = [
  "PDF", "DOC", "DOCX", "XLSX", "PPTX", "CSV", "TXT", "RTF",
  "Code", "Images", "Audio", "Video", "Archives",
];

type Category = "all" | "documents" | "images" | "audio" | "video" | "data" | "code" | "archives";
const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "documents", label: "Documents" },
  { id: "images", label: "Images" },
  { id: "audio", label: "Audio" },
  { id: "video", label: "Video" },
  { id: "data", label: "Data" },
  { id: "code", label: "Code" },
  { id: "archives", label: "Archives" },
];

function matchCategory(file: FileItem, cat: Category): boolean {
  const m = file.mimeType.toLowerCase();
  switch (cat) {
    case "all": return true;
    case "documents": return m.includes("pdf") || m.includes("word") || m.includes("sheet") || m.includes("presentation") || m.startsWith("text/") || m.includes("rtf") || m.includes("opendocument") || m.includes("epub");
    case "images": return m.startsWith("image/");
    case "audio": return m.startsWith("audio/");
    case "video": return m.startsWith("video/");
    case "data": return m.includes("csv") || m.includes("json") || m.includes("xml") || m.includes("tsv");
    case "code": return m.includes("javascript") || m.includes("typescript") || m.includes("python") || m.includes("html") || m.includes("xml") || m.includes("json") || m.includes("sql") || m.includes("css");
    case "archives": return m.includes("zip") || m.includes("rar") || m.includes("7z") || m.includes("tar") || m.includes("gzip") || m.includes("compressed");
    default: return true;
  }
}

type SortKey = "newest" | "oldest" | "name";

export function Files() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [supportedTypes, setSupportedTypes] = useState<string[]>(DEFAULT_SUPPORTED_TYPES);
  const [supportedSource, setSupportedSource] = useState<"processor" | "fallback">("fallback");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const inputRef = useRef<HTMLInputElement>(null);
  // Keyboard navigation: ↑/↓ highlights a file, Enter opens its panel, Esc closes.
  const [highlight, setHighlight] = useState<number | null>(null);
  const highlightRef = useRef<number | null>(null);
  const visibleRef = useRef<FileItem[]>([]);
  const expandedRef = useRef<string | null>(null);

  const loadFiles = async () => {
    try {
      const { data } = await fileService.getFiles();
      setFiles(data);
    } catch (err) {
      console.error("Failed to load files:", err);
      setError("Could not load your files. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Deep link from global search: /files?open=<fileId> opens that file's
  // analysis panel once the list is loaded.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId && files.length && !expanded) {
      if (files.some((f) => f.id === openId)) setExpanded(openId);
      setSearchParams({}, { replace: true });
    }
  }, [files, searchParams]);

  useEffect(() => {
    loadFiles();
    // Dropzone lists exactly what the live processor supports (falls back to
    // the static list if the processor is disabled or unreachable).
    fileService
      .getSupportedTypes()
      .then(({ data }) => {
        if (Array.isArray(data?.types) && data.types.length) {
          setSupportedTypes(data.types);
          setSupportedSource(data.source === "processor" ? "processor" : "fallback");
        }
      })
      .catch((err) => {
        console.warn("Supported types unavailable, using static list:", err);
      });
  }, []);

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = files.filter((f) => {
      if (!matchCategory(f, category)) return false;
      if (q && !f.originalName.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.originalName.localeCompare(b.originalName);
      if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [files, category, query, sort]);

  const uploadFile = async (file: File) => {
    if (file.size > FILE_SIZE_LIMIT) {
      setError("File is too large. Maximum size is 50MB.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const { data } = await fileService.upload(file);
      setFiles((prev) => [
        { id: data.id, filename: data.filename, originalName: data.originalName, mimeType: data.mimeType, size: data.size, extractedText: data.extractedText, createdAt: new Date().toISOString() },
        ...prev,
      ]);
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setError(typeof msg === "string" && msg ? msg : "Upload failed. Please try again.");
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const deleteFile = async (id: string) => {
    if (!window.confirm("Delete this file permanently? This can't be undone.")) return;
    try {
      await fileService.deleteFile(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (expanded === id) setExpanded(null);
    } catch (err) {
      console.error("Delete failed:", err);
      setError("Could not delete the file. Please try again.");
    }
  };

  const togglePanel = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  // Mirror current state into refs so the window keydown listener (bound once)
  // always sees fresh values without re-binding.
  useEffect(() => { highlightRef.current = highlight; }, [highlight]);
  useEffect(() => { visibleRef.current = visibleFiles; }, [visibleFiles]);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  // Clamp the highlight when the visible list shrinks (search/filter/sort).
  useEffect(() => {
    if (highlight != null) {
      setHighlight(visibleFiles.length ? Math.min(highlight, visibleFiles.length - 1) : null);
    }
  }, [visibleFiles, highlight]);

  // Keep the highlighted card in view.
  useEffect(() => {
    if (highlight == null) return;
    const item = visibleFiles[highlight];
    if (!item) return;
    document.getElementById(`file-row-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlight, visibleFiles]);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Never hijack keys while the user is typing in the search box, the sort
      // dropdown, or the analysis composer.
      if (isTyping(e.target)) return;
      const list = visibleRef.current;
      if (!list.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((cur) => {
          const base = cur ?? (e.key === "ArrowDown" ? -1 : 0);
          return e.key === "ArrowDown" ? Math.min(base + 1, list.length - 1) : Math.max(base - 1, 0);
        });
      } else if (e.key === "Enter") {
        const idx = highlightRef.current;
        if (idx != null && list[idx]) {
          e.preventDefault();
          setExpanded((cur) => (cur === list[idx].id ? null : list[idx].id));
        }
      } else if (e.key === "Escape") {
        if (expandedRef.current) {
          setExpanded(null);
        } else {
          setHighlight(null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        icon={Sparkles}
        title="AI File Intelligence"
        description="Upload your files and let NexusAI understand, analyze and explain them."
      />

      {/* Drop zone — floating surface with ambient glow */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-6 rounded-[2rem] blur-3xl"
          style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.12), transparent 65%)" }}
        />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center shadow-popover transition-all sm:p-14",
            dragActive ? "border-primary bg-primary/8 glow-primary" : "border-border hover:border-primary/50 hover:bg-card/60 hover:shadow-float"
          )}
        >
        <input type="file" ref={inputRef} onChange={handleSelect} className="hidden" />
        {uploading ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            {/* Real processing state — the core activates while the backend
                uploads, extracts text, and classifies the file. */}
            <NexusCore size={76} state="thinking" />
            <p className="text-sm font-medium">NexusAI is understanding your file…</p>
            <p className="text-xs text-muted-foreground/70">Uploading and extracting text</p>
          </div>
        ) : (
          <>
            {/* Dimensional file object — layered page stack, lifts while dragging */}
            <div className="relative mx-auto mb-5 h-16 w-14 [perspective:520px]">
              <div
                aria-hidden
                className="absolute inset-x-1.5 top-1 h-full rounded-md border border-border/70 bg-card/80 shadow-sm [transform:rotateY(9deg)_translateZ(-12px)]"
              />
              <div
                aria-hidden
                className="absolute inset-x-0.5 top-0.5 h-full rounded-md border border-border/80 bg-card shadow-sm [transform:rotateY(4deg)_translateZ(-6px)]"
              />
              <div
                className={cn(
                  "relative flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-primary/25 transition-all duration-300 [transform-style:preserve-3d]",
                  dragActive ? "scale-110 shadow-float glow-primary [transform:translateZ(20px)]" : "shadow-card"
                )}
              >
                <Upload className="h-6 w-6" strokeWidth={1.7} />
              </div>
              {/* Particles react while a file is dragged over */}
              {dragActive && !reduced &&
                DRAG_PARTICLES.map((p, i) => (
                  <motion.span
                    key={i}
                    aria-hidden
                    className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-primary/70"
                    style={{ left: "50%", top: "50%" }}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                    animate={{
                      x: p.x,
                      y: p.y,
                      opacity: [0, 0.9, 0],
                      scale: [0.4, 1, 0.5],
                    }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut", delay: p.delay }}
                  />
                ))}
            </div>
            <p className="text-base font-semibold">Drag & drop a file here, or click to browse</p>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <FileSearch className="h-4 w-4" />
              {supportedTypes.join(" · ")}
              {supportedSource === "processor" && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  <span className="h-1 w-1 rounded-full bg-primary" aria-hidden />
                  live
                </span>
              )}
            </p>
            <p className="mt-3 text-xs text-muted-foreground/70">Text is extracted automatically — up to 50MB per file</p>
          </>
        )}
      </motion.div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-auto text-xs font-medium underline-offset-2 hover:underline" aria-label="Dismiss error">Dismiss</button>
        </motion.div>
      )}

      {/* Toolbar: search + filters + sort */}
      <div className="mt-8 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files…"
              aria-label="Search files"
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
            />
          </div>
          <div className="relative">
            <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort files"
              className="h-10 appearance-none rounded-xl border border-border bg-card pl-8 pr-7 text-sm outline-none transition-colors focus:border-primary/50"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                category === c.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* File list */}
      <div className="mt-6 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Sparkles className="h-4 w-4 text-primary" />
            Your files {files.length > 0 && <span className="font-normal text-muted-foreground">({visibleFiles.length})</span>}
          </h2>
          {files.length > 0 && (
            <p className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↑↓</kbd> select
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">Enter</kbd> open
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">Esc</kbd> close
            </p>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No files yet"
            description="Upload a document above — its text is extracted and ready for AI analysis."
          />
        ) : visibleFiles.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="No matching files"
            description="Try a different search or category filter."
          />
        ) : (
          <AnimatePresence>
            {visibleFiles.map((file, index) => {
              const kind = fileKind(file.mimeType);
              const isOpen = expanded === file.id;
              const hasText = fileHasText(file);
              const isAnalyzing = analyzingId === file.id;
              return (
                <motion.div
                  key={file.id}
                  id={`file-row-${file.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ delay: index * 0.03 }}
                  aria-current={index === highlight ? "true" : undefined}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-card shadow-card transition-all duration-200 hover:shadow-popover",
                    index === highlight ? "border-primary/70 ring-1 ring-primary/50" : "border-border"
                  )}
                >
                  <div className="flex items-center gap-3 p-3.5 transition-colors hover:bg-accent/50">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", KIND_STYLES[kind])}>
                      {kind === "code" ? <FileCode2 className="h-4.5 w-4.5" strokeWidth={1.8} /> : <FileIcon className="h-4.5 w-4.5" strokeWidth={1.8} />}
                    </div>
                    <button onClick={() => togglePanel(file.id)} className="min-w-0 flex-1 text-left" aria-label={`Open ${file.originalName}`}>
                      <p className="truncate text-sm font-medium">{file.originalName}</p>
                      <p className="text-xs text-muted-foreground">
                        {fileExtension(file.originalName)} · {formatBytes(file.size)} · {new Date(file.createdAt).toLocaleDateString()}
                      </p>
                    </button>
                    {isAnalyzing ? (
                      <Badge variant="info" className="shrink-0">
                        <Loader2 className="h-3 w-3 animate-spin" /> Analyzing
                      </Badge>
                    ) : hasText ? (
                      <Badge variant="success" className="shrink-0">Ready to analyze</Badge>
                    ) : (
                      <Badge variant="warning" className="shrink-0">No extractable text</Badge>
                    )}
                    <button onClick={() => togglePanel(file.id)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label={isOpen ? "Close analysis panel" : "Open analysis panel"}>
                      <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
                    </button>
                    <button onClick={() => deleteFile(file.id)} className="rounded-lg p-2 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label="Delete file">
                      <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                  </div>
                  {isOpen && (
                    <FileAnalysisPanel
                      file={file}
                      onAnalyzingChange={(active) => setAnalyzingId(active ? file.id : null)}
                    />
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
