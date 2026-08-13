import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { FileText, Loader2, Send, Sparkles, ChevronDown, AlertCircle, CheckCircle2, FileDown, Paperclip, Download, Languages, Search } from "lucide-react";
import { chatService } from "@/services/chat.service";
import { fileService, fileHasText, buildFileContext } from "@/services/file.service";
import { ChatMessage } from "@/components/ChatMessage";
import { NexusCore } from "@/components/ui/nexus-core";
import { Message } from "@/types";
import { cn } from "@/utils/cn";

interface FileAnalysisPanelProps {
  file: { id: string; originalName: string; mimeType: string; size: number; extractedText?: string };
  /** Tells the parent when a stream starts/ends so the card can show a badge. */
  onAnalyzingChange?: (active: boolean) => void;
}

const PRESETS = [
  { label: "Summary", prompt: "Give a concise summary of the document above." },
  { label: "Key Points", prompt: "List the key points from the document above as a clear bulleted list." },
  { label: "Insights", prompt: "What are the most important insights and notable details from this document?" },
];

// Per-file conversation ids (created by the backend on first analysis) so later
// questions reuse the same real conversation and keep the file's context.
const CONV_KEY = "nexusai-file-convs";

function loadConvMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CONV_KEY) || "{}"); } catch { return {}; }
}
function saveConvMap(map: Record<string, string>) {
  try { localStorage.setItem(CONV_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabelFor(mime: string): string {
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("word")) return "DOCX";
  if (mime.includes("sheet") || mime.includes("excel")) return "XLSX";
  if (mime.includes("presentation")) return "PPTX";
  if (mime.startsWith("text/")) return "TEXT";
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("video/")) return "VIDEO";
  return mime.split("/")[1]?.toUpperCase() || "FILE";
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "file";
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}
function isAudio(mime: string): boolean {
  return mime.startsWith("audio/");
}
function isVideo(mime: string): boolean {
  return mime.startsWith("video/");
}
/** Structured data files (CSV/XLSX/JSON/XML) — real table preview from text. */
function isDataFile(mime: string, name: string): boolean {
  return /(csv|tsv|excel|spreadsheet|json|xml)/i.test(mime) || /\.(csv|tsv|json|xml)$/i.test(name);
}

interface TablePreview {
  rows: string[][];
  cols: number;
  totalLines: number;
}
/** Parse the first lines of REAL extracted text into a table (CSV or TSV). */
function parseTablePreview(text: string, maxRows = 9, maxCols = 8): TablePreview {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = lines.slice(0, maxRows).map((line) => {
    const sep = line.includes("\t") ? "\t" : ",";
    return line.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()).slice(0, maxCols);
  });
  const cols = Math.max(1, ...rows.map((r) => r.length));
  return { rows, cols, totalLines: lines.length };
}

function estimateText(text: string): { chars: number; words: number; lines: number } {
  return {
    chars: text.length,
    words: text.trim().split(/\s+/).filter(Boolean).length,
    lines: text.split(/\r?\n/).length,
  };
}

function countMatches(text: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const lower = text.toLowerCase();
  let count = 0;
  let idx = lower.indexOf(q);
  while (idx >= 0) {
    count++;
    idx = lower.indexOf(q, idx + q.length);
  }
  return count;
}

/** Render extracted text with real matches highlighted (client-side search
 * over the actual backend-extracted content — nothing fabricated). */
function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let idx = lower.indexOf(ql);
  let key = 0;
  while (idx >= 0 && i < text.length) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={key++} className="rounded-sm bg-primary/30 px-0.5 text-foreground">
        {text.slice(idx, idx + ql.length)}
      </mark>
    );
    i = idx + ql.length;
    idx = lower.indexOf(ql, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}

const TRANSLATE_LANGS = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "hi", name: "Hindi" },
  { code: "te", name: "Telugu" },
  { code: "zh", name: "Chinese" },
];

/** The backend stores the first message with the embedded file text appended
 * ("\n\n[File: name]\n<text>"); strip that before displaying/exporting. */
function stripFileContext(content: string): string {
  const idx = content.indexOf("\n\n[File: ");
  return idx >= 0 ? content.slice(0, idx) : content;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildAnalysisMarkdown(file: { originalName: string; mimeType: string; size: number }, messages: Message[]): string {
  const out: string[] = [];
  out.push(`# File Analysis — ${file.originalName}`);
  out.push("");
  out.push(`- **File:** ${file.originalName}`);
  out.push(`- **Type:** ${mimeLabelFor(file.mimeType)} · ${formatBytes(file.size)}`);
  out.push(`- **Questions:** ${messages.filter((m) => m.role === "user").length}`);
  out.push(`- **Exported:** ${new Date().toLocaleString()}`);
  out.push("");
  out.push("---");
  out.push("");
  for (const m of messages) {
    out.push(`## ${m.role === "user" ? "You" : "NexusAI"}`);
    out.push("");
    out.push(m.content || "_No content._");
    out.push("");
  }
  return out.join("\n");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PRINT_CSS = `
  @page { margin: 18mm 16mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; line-height: 1.55; font-size: 12.5px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 22px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e2e2; }
  h3 { font-size: 13px; margin: 16px 0 4px; }
  p { margin: 6px 0; }
  .meta { color: #666; font-size: 11.5px; margin-bottom: 18px; }
  .meta p { margin: 2px 0; }
  pre { background: #f6f6f6; border: 1px solid #e5e5e5; border-radius: 6px; padding: 10px 12px; overflow-x: auto; font-size: 11px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #f4f4f4; padding: 1px 4px; border-radius: 3px; font-size: 0.92em; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 11.5px; }
  th, td { border: 1px solid #d8d8d8; padding: 5px 8px; text-align: left; }
  th { background: #f4f4f4; }
  blockquote { border-left: 3px solid #d0d0d0; margin: 8px 0; padding: 2px 12px; color: #555; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 16px 0; }
  ul, ol { padding-left: 22px; }
  a { color: #0645ad; }
`;

function buildPrintHtml(file: { originalName: string; mimeType: string; size: number }, renderedBody: string): string {
  const title = `File Analysis — ${file.originalName}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>
<h1>${escapeHtml(title)}</h1>
<div class="meta"><p>${escapeHtml(file.originalName)} · ${escapeHtml(mimeLabelFor(file.mimeType))} · ${formatBytes(file.size)}</p><p>Exported: ${new Date().toLocaleString()}</p></div>
${renderedBody}
</body></html>`;
}

export function FileAnalysisPanel({ file, onAnalyzingChange }: FileAnalysisPanelProps) {
  const hasText = fileHasText(file);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showText, setShowText] = useState(false);
  const [previewQuery, setPreviewQuery] = useState("");
  const [showData, setShowData] = useState(false);
  const [translateTo, setTranslateTo] = useState("en");
  const [lastStatus, setLastStatus] = useState<"idle" | "done" | "failed">("idle");
  const convIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const textViewRef = useRef<HTMLPreElement>(null);

  // Load this file's existing conversation id so reopening keeps the context,
  // then reload the saved Q&A so the panel (and the export) shows the full
  // conversation, not just what happened in this session.
  useEffect(() => {
    let cancelled = false;
    const map = loadConvMap();
    const saved = map[file.id];
    if (!saved) return;
    convIdRef.current = saved;
    chatService
      .getMessages(saved)
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data) || !data.length) return;
        setMessages((prev) =>
          prev.length > 0
            ? prev // user already asked something; don't clobber it
            : data.map((m: Message) => ({ ...m, content: stripFileContext(m.content || "") }))
        );
      })
      .catch(() => { /* offline/expired — keep an empty panel */ });
    return () => { cancelled = true; };
  }, [file.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const runAnalysis = async (prompt: string, opts?: { language?: string; languageCode?: string }) => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    if (!hasText) {
      setError("This file has no extractable text to analyze.");
      return;
    }
    // First message for this file carries the document text (same mechanism as
    // the Chat page's attach flow). Later questions reuse the conversation so
    // the backend's history keeps the file context for the model.
    const embed = !convIdRef.current;
    const fullMessage = embed ? `${trimmed}${buildFileContext(file)}` : trimmed;

    const userMsg: Message = { id: `u-${Date.now()}`, content: trimmed, role: "user", createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setError("");
    setLoading(true);
    setLastStatus("idle");
    onAnalyzingChange?.(true);

    const assistantId = `a-${Date.now() + 1}`;
    setMessages((prev) => [...prev, { id: assistantId, content: "", role: "assistant", createdAt: new Date().toISOString() }]);

    let assistantContent = "";
    try {
      // `language`/`languageCode` ask the model to reply in the target language
      // (the existing chat translation mechanism) — used by the Translate preset.
      const response = await chatService.streamChat(
        fullMessage,
        convIdRef.current || undefined,
        undefined,
        opts?.language,
        opts?.languageCode
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Analysis failed (${response.status})`);
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data.error) {
            throw new Error(typeof data.error === "string" ? data.error : "Analysis failed");
          }
          if (data.content) {
            assistantContent += data.content;
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: assistantContent } : m)));
          }
          if (data.conversationId && !convIdRef.current) {
            convIdRef.current = data.conversationId;
            const map = loadConvMap();
            map[file.id] = data.conversationId;
            saveConvMap(map);
          }
        }
      }
      setLastStatus(assistantContent.trim() ? "done" : "failed");
      if (!assistantContent.trim()) setError("The model returned an empty reply. Try again.");
    } catch (err: any) {
      console.error("File analysis error:", err);
      setError(err?.message?.includes("Failed to fetch") ? "Unable to connect. Check your connection and try again." : err?.message || "Analysis failed. Please try again.");
      setLastStatus("failed");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setLoading(false);
      onAnalyzingChange?.(false);
    }
  };

  const mimeLabel = useMemo(() => mimeLabelFor(file.mimeType), [file.mimeType]);

  const imageFile = isImage(file.mimeType);
  const audioFile = isAudio(file.mimeType);
  const videoFile = isVideo(file.mimeType);
  const dataFile = isDataFile(file.mimeType, file.originalName);
  const stats = hasText ? estimateText(file.extractedText || "") : null;
  const table = dataFile && hasText ? parseTablePreview(file.extractedText || "") : null;
  const matchCount = hasText ? countMatches(file.extractedText || "", previewQuery) : 0;
  const presets = dataFile
    ? [
        ...PRESETS,
        { label: "Data Insights", prompt: "Analyze the data above: list the columns, key statistics, notable values, and any anomalies or insights." },
      ]
    : PRESETS;

  // The first user message in a file's conversation is the one that carried
  // the document text — that's the message that gets the attachment chip.
  const firstUserId = messages.find((m) => m.role === "user")?.id;

  const runTranslation = () => {
    const lang = TRANSLATE_LANGS.find((l) => l.code === translateTo);
    if (!lang || !hasText || loading) return;
    const target = lang.name;
    runAnalysis(`Translate the document above into ${target}. Output only the translated document, keeping all headings, tables and structure.`, {
      language: target,
      languageCode: lang.code,
    });
  };

  const openExtractedText = () => {
    setShowText(true);
    requestAnimationFrame(() => textViewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const exportMarkdown = () => {
    if (!messages.length) return;
    const md = buildAnalysisMarkdown(file, messages);
    downloadBlob(`${baseName(file.originalName)}-analysis.md`, new Blob([md], { type: "text/markdown;charset=utf-8" }));
  };

  // PDF = print view: renders the same real conversation (via react-markdown,
  // same renderer the app uses) into a clean print stylesheet; the user saves
  // it as a PDF from the browser's print dialog. No fake generation.
  const exportPdf = () => {
    if (!messages.length || !exportRef.current) return;
    const html = buildPrintHtml(file, exportRef.current.innerHTML);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    if (!win) { iframe.remove(); return; }
    const doc = win.document;
    doc.open();
    doc.write(html);
    doc.close();
    const cleanup = () => document.body.removeChild(iframe);
    setTimeout(() => { win.focus(); win.print(); }, 60);
    // The print dialog blocks JS, so cleanup runs after the user dismisses it.
    setTimeout(cleanup, 60000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="overflow-hidden border-t border-border"
    >
      <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
        {/* File facts + quick actions — the document renders as a subtle 3D
            page stack (pure CSS depth, no heavy rendering for large files) */}
        <div className="border-b border-border bg-muted/30 p-4 lg:border-b-0 lg:border-r">
          <div className="relative [perspective:700px]">
            {/* Back pages receding in depth */}
            <div aria-hidden className="absolute inset-x-3 -top-1 h-full rounded-lg border border-border/70 bg-card/80 shadow-sm [transform:rotateX(8deg)_translateZ(-18px)]" />
            <div aria-hidden className="absolute inset-x-1.5 top-0 h-full rounded-lg border border-border/80 bg-card shadow-sm [transform:rotateX(5deg)_translateZ(-9px)]" />
            {/* Front page — the live file facts */}
            <div className="relative flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 shadow-popover [transform:translateZ(0px)]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="h-4 w-4" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{file.originalName}</p>
                <p className="text-xs text-muted-foreground">{mimeLabel} · {formatBytes(file.size)}</p>
              </div>
            </div>
          </div>

          {/* ── Real file-type previews (streamed from the backend) ── */}
          {imageFile && (
            <div className="relative mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <img
                src={fileService.streamUrl(file.id)}
                alt={file.originalName}
                loading="lazy"
                className="max-h-64 w-full object-contain"
              />
            </div>
          )}
          {audioFile && (
            <audio controls src={fileService.streamUrl(file.id)} preload="metadata" className="mt-4 w-full" />
          )}
          {videoFile && (
            <video
              controls
              src={fileService.streamUrl(file.id)}
              preload="metadata"
              className="mt-4 max-h-64 w-full rounded-xl border border-border bg-black/40"
            />
          )}
          {dataFile && hasText && table && (
            <div className="mt-4">
              <button
                onClick={() => setShowData((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-medium transition-colors hover:border-primary/40"
              >
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Table preview · first {table.rows.length} of {table.totalLines} rows · {table.cols} columns
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showData && "rotate-180")} />
              </button>
              {showData && (
                <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-border bg-card/70">
                  <table className="w-full text-left text-[10px]">
                    <tbody>
                      {table.rows.map((r, i) => (
                        <tr key={i}>
                          {Array.from({ length: table.cols }).map((_, c) => (
                            <td key={c} className="max-w-[9rem] truncate border-b border-border/60 px-2 py-1 font-mono text-muted-foreground">
                              {r[c] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Auto-understanding metadata — computed from the real extracted text */}
          {hasText && stats && (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span>{stats.chars.toLocaleString()} chars</span>
              <span>{stats.words.toLocaleString()} words</span>
              <span>{stats.lines.toLocaleString()} lines</span>
              {dataFile && table && <span>{table.totalLines.toLocaleString()} data rows</span>}
            </div>
          )}

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</p>
          <div className="mt-2 space-y-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => runAnalysis(p.prompt)}
                disabled={!hasText || loading}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {p.label}
              </button>
            ))}
          </div>

          {/* Translate preset — uses the existing chat translation mechanism */}
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Translate</p>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Languages className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={translateTo}
                  onChange={(e) => setTranslateTo(e.target.value)}
                  disabled={!hasText || loading}
                  aria-label="Target language"
                  className="h-9 w-full appearance-none rounded-lg border border-border bg-card pl-8 pr-7 text-xs outline-none transition-colors focus:border-primary/50 disabled:opacity-40"
                >
                  {TRANSLATE_LANGS.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              </div>
              <button
                onClick={runTranslation}
                disabled={!hasText || loading}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Languages className="h-3.5 w-3.5 text-primary" />
                Translate
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center gap-1.5">
              {hasText ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <AlertCircle className="h-3.5 w-3.5 text-warning" />}
              <span className="text-muted-foreground">
                {hasText ? "Text extracted — ready to analyze" : "No extractable text — analysis unavailable"}
              </span>
            </div>
            <button onClick={() => setShowText((v) => !v)} className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showText && "rotate-180")} />
              {showText ? "Hide extracted text" : "Show extracted text"}
            </button>
          </div>

          {showText && (
            <div className="mt-3 space-y-2">
              {/* In-file search over the real extracted text, with highlighting */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={previewQuery}
                  onChange={(e) => setPreviewQuery(e.target.value)}
                  placeholder="Search in file…"
                  aria-label="Search in file"
                  className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-16 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                />
                {previewQuery.trim() && (
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                    {matchCount} match{matchCount === 1 ? "" : "es"}
                  </span>
                )}
              </div>
              <pre ref={textViewRef} className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-card/70 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                <HighlightedText text={file.extractedText?.slice(0, 20000) || "No extractable text found."} query={previewQuery} />
              </pre>
            </div>
          )}
        </div>

        {/* Analysis conversation */}
        <div className="flex min-h-[260px] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Analysis {messages.length > 0 && <span className="font-normal normal-case text-muted-foreground/70">· {messages.filter((m) => m.role === "user").length} question{messages.filter((m) => m.role === "user").length === 1 ? "" : "s"}</span>}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={exportMarkdown}
                disabled={!messages.length || loading}
                title="Download as Markdown"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileDown className="h-3.5 w-3.5" />
                Markdown
              </button>
              <button
                type="button"
                onClick={exportPdf}
                disabled={!messages.length || loading}
                title="Print or save as PDF"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileText className="h-3.5 w-3.5" />
                PDF
              </button>
              <button
                type="button"
                onClick={() => fileService.download(file.id, file.originalName)}
                title="Download the original file"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                File
              </button>
            </div>
          </div>
          <div className="max-h-72 flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center">
                <Sparkles className="mb-2 h-5 w-5 text-primary" />
                <p className="text-sm font-medium">Chat with {file.originalName}</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Ask for a summary, key points, insights — or anything about this file.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m) => (
                  <ChatMessage
                    key={m.id}
                    message={m}
                    meta={
                      m.role === "user" && m.id === firstUserId && hasText ? (
                        <button
                          type="button"
                          onClick={openExtractedText}
                          title="View the extracted text from the document"
                          className="flex max-w-full items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
                        >
                          <Paperclip className="h-3 w-3 shrink-0" />
                          <span className="truncate">with {file.originalName} attached</span>
                        </button>
                      ) : undefined
                    }
                  />
                ))}
                {loading && (
                  <div className="flex items-center gap-2 py-1 pl-1 text-xs text-muted-foreground" aria-label="Analyzing">
                    {/* The core's real "thinking" state — orbits accelerate while the
                        backend streams the analysis. */}
                    <NexusCore size={20} state="thinking" />
                    Analyzing…
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {error && (
            <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {lastStatus === "done" && (
            <div className="mx-4 mb-2 flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Analysis complete
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); runAnalysis(input); }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={hasText ? "Ask about this file…" : "Analysis unavailable for this file"}
              disabled={!hasText || loading}
              aria-label="Ask about this file"
              className="h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {/* Hidden render of the same conversation, used only for the PDF
                print view (react-markdown output goes into the print window). */}
            <div className="hidden" aria-hidden="true" ref={exportRef}>
              <ReactMarkdown>{buildAnalysisMarkdown(file, messages)}</ReactMarkdown>
            </div>
            <button
              type="submit"
              disabled={!input.trim() || !hasText || loading}
              aria-label="Ask about this file"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </motion.div>
  );
}
