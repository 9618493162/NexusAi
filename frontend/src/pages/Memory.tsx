import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Brain, MessageSquare, FileText, Mic, Sparkles, Search, ArrowUpRight,
  Trash2, X, Pin, Globe, Palette, User, Mail, Cpu, Loader2, ShieldCheck,
  Languages, Eye, Bookmark, Plus, Pencil, Send,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { chatService } from "@/services/chat.service";
import { fileService } from "@/services/file.service";
import { voiceService, VoiceSession } from "@/services/voice.service";
import { Conversation, FileItem } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { NexusCore } from "@/components/ui/nexus-core";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { cn } from "@/utils/cn";
import {
  getSavedPrompts, savePrompt, deletePrompt, PROMPT_SUGGESTIONS,
  type SavedPrompt,
} from "@/utils/savedPrompts";

type TabKey = "overview" | "chats" | "files" | "voice" | "prefs" | "prompts";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "chats", label: "Chats" },
  { key: "files", label: "Files" },
  { key: "voice", label: "Voice" },
  { key: "prefs", label: "Preferences" },
  { key: "prompts", label: "Prompts" },
];

interface MemoryItem {
  key: string;
  category: "chat" | "file" | "voice" | "pref" | "prompt";
  kind: TabKey;
  title: string;
  snippet: string;
  body: string;
  createdAt: string | null;
  updatedAt: string | null;
  meta: Array<{ label: string; value: string }>;
  route?: string;
  deleteLabel: string;
  pinned?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function truncate(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

export function Memory() {
  const { user } = useAuthStore();
  const reduced = useReducedMotion();

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [sessions, setSessions] = useState<VoiceSession[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("overview");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MemoryItem | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [forgetError, setForgetError] = useState("");
  // Forget-all confirmation state: null | category key being confirmed.
  const [confirmClearAll, setConfirmClearAll] = useState<"chat" | "file" | "voice" | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearedCount, setClearedCount] = useState(0);
  // Saved prompts — per-user bookmarks persisted in localStorage (no backend
  // table exists, so this follows the onboarding/aiPreferences pattern).
  const userId = user?.id;
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [promptForm, setPromptForm] = useState<{ id?: string; title: string; prompt: string } | null>(null);
  const [confirmDeletePrompt, setConfirmDeletePrompt] = useState<string | null>(null);

  useEffect(() => {
    if (userId) setPrompts(getSavedPrompts(userId));
  }, [userId]);

  const listRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();


  // Escape closes the detail drawer from anywhere (including when focus is
  // inside the drawer — React's delegated onKeyDown doesn't fire for a
  // window-level dispatch, so this is a real global listener).
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setConfirmForget(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      chatService.getConversations(),
      fileService.getFiles(),
      voiceService.getSessions(),
    ])
      .then(([conv, fil, sess]) => {
        if (cancelled) return;
        setConversations(conv.data);
        setFiles(fil.data);
        setSessions(sess);
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error("Memory load error:", err);
        setError(err?.response?.data?.error || "Failed to load your memory — try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Build the flat, searchable memory items from REAL data ────────────
  const items = useMemo<MemoryItem[]>(() => {
    const list: MemoryItem[] = [];
    (conversations || []).forEach((c) => {
      const last = c.messages?.[0]?.content || "";
      list.push({
        key: `chat-${c.id}`,
        category: "chat",
        kind: "chats",
        title: c.title || "Untitled conversation",
        snippet: last ? truncate(last, 110) : "No messages yet",
        body: last ? truncate(last, 4000) : "This conversation has no messages.",
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        meta: [
          { label: "Pinned", value: c.isPinned ? "Yes" : "No" },
          { label: "Archived", value: c.isArchived ? "Yes" : "No" },
          { label: "Updated", value: formatDate(c.updatedAt) },
        ],
        route: `/chat/${c.id}`,
        deleteLabel: "Delete this conversation",
        pinned: c.isPinned,
      });
    });
    (files || []).forEach((f) => {
      const hasText = (f.extractedText || "").trim().length > 0 && f.extractedText !== "File processing disabled";
      list.push({
        key: `file-${f.id}`,
        category: "file",
        kind: "files",
        title: f.originalName,
        snippet: hasText ? truncate(f.extractedText || "", 110) : f.mimeType,
        body: hasText ? truncate(f.extractedText || "", 4000) : "No extractable text was stored for this file.",
        createdAt: f.createdAt,
        updatedAt: f.createdAt,
        meta: [
          { label: "Type", value: f.mimeType },
          { label: "Size", value: formatBytes(f.size) },
          { label: "Added", value: formatDate(f.createdAt) },
        ],
        route: `/files?open=${f.id}`,
        deleteLabel: "Delete this file",
      });
    });
    (sessions || []).forEach((s) => {
      const translated = s.translation && s.translation.trim() ? ` (${s.translation.trim().slice(0, 60)}…)` : "";
      list.push({
        key: `voice-${s.id}`,
        category: "voice",
        kind: "voice",
        title: `Voice session · ${s.sourceLang.toUpperCase()} → ${s.targetLang.toUpperCase()}`,
        snippet: truncate(s.transcript, 110),
        body: truncate(s.transcript, 4000),
        createdAt: s.createdAt,
        updatedAt: s.createdAt,
        meta: [
          { label: "Transcript", value: truncate(s.transcript, 80) + (translated || "") },
          { label: "Created", value: formatDate(s.createdAt) },
        ],
        route: `/voice?session=${s.id}`,
        deleteLabel: "Delete this voice session",
      });
    });
    // Preferences — what the account actually stores (real fields only).
    (prompts || []).forEach((p) => {
      list.push({
        key: `prompt-${p.id}`,
        category: "prompt",
        kind: "prompts",
        title: p.title,
        snippet: truncate(p.prompt, 110),
        body: p.prompt,
        createdAt: new Date(p.createdAt).toISOString(),
        updatedAt: new Date(p.updatedAt).toISOString(),
        meta: [
          { label: "Source", value: "Saved on this device" },
          { label: "Created", value: formatDate(new Date(p.createdAt).toISOString()) },
        ],
        route: `/chat?q=${encodeURIComponent(p.prompt)}`,
        deleteLabel: "Forget this prompt",
      });
    });
    const prefs: Array<{ key: string; label: string; value: string; icon: React.ElementType }> = [
      { key: "name", label: "Your name", value: user?.name || "Not set", icon: User },
      { key: "email", label: "Email", value: user?.email || "Not set", icon: Mail },
      { key: "theme", label: "Theme", value: user?.theme || "system", icon: Palette },
      { key: "dictateLang", label: "Dictate language", value: user?.dictateLang?.toUpperCase() || "EN", icon: Languages },
      { key: "dictateTo", label: "Dictate-to language", value: user?.dictateTo?.toUpperCase() || "TE", icon: Globe },
    ];
    prefs.forEach((p) => {
      list.push({
        key: `pref-${p.key}`,
        category: "pref",
        kind: "prefs",
        title: p.label,
        snippet: p.value,
        body: `${p.label}: ${p.value}`,
        createdAt: null,
        updatedAt: null,
        meta: [{ label: "Source", value: "Account settings" }],
        route: "/settings",
        deleteLabel: "",
      });
    });
    return list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [conversations, files, sessions, prompts, user]);

  // ── Deep link from Chat's memory chip (/memory?focus=<conversationId>):
  // once data is ready, open that conversation's detail drawer — the
  // remembered context itself. The param is consumed so refresh/back never
  // re-opens it (ref guard mirrors the app's StrictMode pattern).
  const focusHandledRef = useRef(false);
  useEffect(() => {
    if (focusHandledRef.current || loading) return;
    const focus = searchParams.get("focus");
    if (!focus) return;
    focusHandledRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
    const item = items.find((it) => it.key === `chat-${focus}`);
    if (item) {
      setTab("chats");
      setSelected(item);
    }
  }, [items, loading, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      `${it.title} ${it.snippet} ${it.body} ${it.meta.map((m) => m.value).join(" ")}`
        .toLowerCase()
        .includes(q)
    );
  }, [items, query]);

  const counts = useMemo(() => ({
    chats: (conversations || []).length,
    files: (files || []).length,
    voice: (sessions || []).length,
    prefs: 5,
    prompts: prompts.length,
  }), [conversations, files, sessions, prompts]);

  // ── Real forget: delete via the existing per-resource endpoints ───────
  const forgetItem = async () => {
    if (!selected) return;
    if (!confirmForget) { setConfirmForget(true); return; }
    setForgetting(true);
    setForgetError("");
    try {
      if (selected.category === "chat") await chatService.deleteConversation(selected.key.slice(5));
      if (selected.category === "file") await fileService.deleteFile(selected.key.slice(5));
      if (selected.category === "voice") await voiceService.deleteSession(selected.key.slice(6));
      if (selected.category === "prompt" && userId) setPrompts(deletePrompt(userId, selected.key.slice(7)));
      if (selected.category === "chat") setConversations((p) => (p || []).filter((c) => `chat-${c.id}` !== selected.key));
      if (selected.category === "file") setFiles((p) => (p || []).filter((f) => `file-${f.id}` !== selected.key));
      if (selected.category === "voice") setSessions((p) => (p || []).filter((s) => `voice-${s.id}` !== selected.key));
      if (selected.category === "prompt") setPrompts((p) => p.filter((pr) => `prompt-${pr.id}` !== selected.key));
      setSelected(null);
      setConfirmForget(false);
    } catch (err: any) {
      setForgetError(err?.response?.data?.error || "Unable to forget this — try again.");
    } finally {
      setForgetting(false);
    }
  };

  const clearCategory = async () => {
    if (!confirmClearAll) { setConfirmClearAll("chat"); return; }
    const category = confirmClearAll;
    setClearing(true);
    setClearedCount(0);
    const deletes: Promise<unknown>[] =
      category === "chat"
        ? (conversations || []).map((c) => chatService.deleteConversation(c.id))
        : category === "file"
          ? (files || []).map((f) => fileService.deleteFile(f.id))
          : (sessions || []).map((s) => voiceService.deleteSession(s.id));
    // Run in bounded batches; real deletes, one per resource.
    try {
      for (let i = 0; i < deletes.length; i += 5) {
        await Promise.all(deletes.slice(i, i + 5));
        setClearedCount(Math.min(i + 5, deletes.length));
      }
      if (category === "chat") setConversations([]);
      if (category === "file") setFiles([]);
      if (category === "voice") setSessions([]);
      setConfirmClearAll(null);
    } catch (err: any) {
      setForgetError(err?.response?.data?.error || "Some items could not be forgotten — try again.");
    } finally {
      setClearing(false);
    }
  };

  // ── Keyboard navigation over the list (roving focus) ──────────────────
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setSelected(null); setConfirmForget(false); return; }
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-memory-row]") || []);
    if (!rows.length) return;
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); rows[(index + 1) % rows.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); rows[(index - 1 + rows.length) % rows.length]?.focus(); }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const item = items.find((it) => it.key === rows[index]?.dataset.memoryRow);
      if (item) setSelected(item);
    }
  };

  const visibleForTab = (tabKey: TabKey) =>
    tabKey === "overview" ? filtered : filtered.filter((it) => it.kind === tabKey);

  const transition = reduced ? { duration: 0 } : { duration: 0.25, ease: "easeOut" as const };

  return (
    <div className="relative min-h-full">
      <SpatialEnvironment />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {/* ── Hero: Memory Core + real aggregate counts ─────────────────── */}
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <Brain className="h-3.5 w-3.5 text-primary" /> NexusAI
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                AI <span className="text-gradient">Memory</span>
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Everything NexusAI knows about your workspace — real conversations, files, voice sessions and preferences.
                You stay in control: inspect anything, or forget it for good.
              </p>
            </motion.div>

            {/* Search */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { delay: 0.08, duration: 0.3, ease: "easeOut" }}
              className="mt-6"
            >
              <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-card/90 px-3.5 shadow-sm backdrop-blur transition-all focus-within:border-primary/60">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your AI memory…"
                  aria-label="Search your AI memory"
                  className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
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

        {/* ── Real counts strip ─────────────────────────────────────────── */}
        {loading ? (
          <div className="mt-8 flex items-center gap-6">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-24" />)}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.2, duration: 0.35 }}
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-5 text-sm"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare className="h-4 w-4 text-primary" /> <span className="font-semibold tabular-nums text-foreground">{counts.chats}</span> conversations
            </span>
            <span className="h-4 w-px bg-border" aria-hidden />
            <span className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4 text-emerald-500" /> <span className="font-semibold tabular-nums text-foreground">{counts.files}</span> files
            </span>
            <span className="h-4 w-px bg-border" aria-hidden />
            <span className="flex items-center gap-2 text-muted-foreground">
              <Mic className="h-4 w-4 text-blue-500" /> <span className="font-semibold tabular-nums text-foreground">{counts.voice}</span> voice sessions
            </span>
            <span className="h-4 w-px bg-border" aria-hidden />
            <span className="flex items-center gap-2 text-muted-foreground">
              <Sparkles className="h-4 w-4 text-violet-500" /> <span className="font-semibold tabular-nums text-foreground">{counts.prefs}</span> preferences
            </span>
            <span className="h-4 w-px bg-border" aria-hidden />
            <span className="flex items-center gap-2 text-muted-foreground">
              <Bookmark className="h-4 w-4 text-amber-500" /> <span className="font-semibold tabular-nums text-foreground">{counts.prompts}</span> saved prompts
            </span>
          </motion.div>
        )}

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <div className="mt-8 flex flex-wrap gap-1.5" role="tablist" aria-label="Memory categories">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Overview: category cards + recent items ───────────────────── */}
        {!loading && tab === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="mt-6 grid gap-4 sm:grid-cols-2">
            {([
              { key: "chats", icon: MessageSquare, label: "Conversation memory", desc: "Chats and everything discussed", count: counts.chats, color: "text-primary bg-primary/10" },
              { key: "files", icon: FileText, label: "Saved knowledge", desc: "Files with extracted text", count: counts.files, color: "text-emerald-500 bg-emerald-500/10" },
              { key: "voice", icon: Mic, label: "Voice memory", desc: "Transcripts, translations & analyses", count: counts.voice, color: "text-blue-500 bg-blue-500/10" },
              { key: "prefs", icon: Sparkles, label: "Preferences", desc: "What NexusAI knows about you", count: counts.prefs, color: "text-violet-500 bg-violet-500/10" },
              { key: "prompts", icon: Bookmark, label: "Saved prompts", desc: "Reusable prompts you pinned", count: counts.prompts, color: "text-amber-500 bg-amber-500/10" },
            ] as const).map((card) => (
              <button
                key={card.key}
                onClick={() => setTab(card.key)}
                className="card-surface card-hover group flex items-center gap-4 p-4 text-left"
              >
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", card.color)}>
                  <card.icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{card.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{card.desc}</span>
                </span>
                <span className="text-2xl font-bold tabular-nums tracking-tight">{card.count}</span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
            <div className="sm:col-span-2">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-tight">
                <Eye className="h-4 w-4 text-muted-foreground" /> Recently remembered
              </h2>
              <MemoryList
                items={filtered.slice(0, 6)}
                loading={loading}
                onSelect={setSelected}
                onKeyDown={onListKeyDown}
                listRef={listRef}
              />
            </div>
          </motion.div>
        )}

        {/* ── Category lists (prompts has its own dedicated management UI) ── */}
        {!loading && tab !== "overview" && tab !== "prompts" && (
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="mt-6">
            {visibleForTab(tab).length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
                <Search className="mb-3 h-8 w-8 text-muted-foreground/60" strokeWidth={1.6} />
                <p className="text-sm font-medium">{query ? "No memory matches your search" : "Nothing here yet"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {query ? "Try a different search term" : tab === "chats" ? "Chat with NexusAI and conversations will be remembered here" : tab === "files" ? "Upload a file and its knowledge will appear here" : tab === "voice" ? "Use Voice Studio and sessions will be remembered here" : "Your account preferences appear here"}
                </p>
              </div>
            ) : (
              <MemoryList
                items={visibleForTab(tab)}
                loading={loading}
                onSelect={setSelected}
                onKeyDown={onListKeyDown}
                listRef={listRef}
              />
            )}
          </motion.div>
        )}

        {/* ── Saved prompts — real bookmarks, used via /chat?q= ─────────── */}
        {!loading && tab === "prompts" && (
          <motion.div key="prompts" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="mt-6 space-y-4">
            {promptForm ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!userId || !promptForm.title.trim() || !promptForm.prompt.trim()) return;
                  setPrompts(savePrompt(userId, promptForm));
                  setPromptForm(null);
                }}
                className="card-surface space-y-3 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                    <Bookmark className="h-4 w-4 text-primary" /> {promptForm.id ? "Edit prompt" : "New prompt"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPromptForm(null)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Cancel editing prompt"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  value={promptForm.title}
                  onChange={(e) => setPromptForm({ ...promptForm, title: e.target.value })}
                  placeholder="Prompt title, e.g. Summarize a paper"
                  aria-label="Prompt title"
                  className="h-10 w-full rounded-lg border border-border bg-muted/40 px-3 text-sm outline-none transition-colors focus:border-primary/60"
                />
                <textarea
                  value={promptForm.prompt}
                  onChange={(e) => setPromptForm({ ...promptForm, prompt: e.target.value })}
                  placeholder="The reusable prompt itself…"
                  aria-label="Prompt text"
                  rows={4}
                  className="w-full resize-y rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-primary/60"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!promptForm.title.trim() || !promptForm.prompt.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" /> {promptForm.id ? "Save changes" : "Save prompt"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptForm(null)}
                    className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setPromptForm({ title: "", prompt: "" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <Plus className="h-4 w-4" /> New prompt
              </button>
            )}

            {prompts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-8">
                <p className="text-sm font-medium">No saved prompts yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Pin reusable prompts so they're one click away in Chat.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PROMPT_SUGGESTIONS.map((s) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => userId && setPrompts(savePrompt(userId, { title: s.title, prompt: s.prompt }))}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" /> {s.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {prompts.map((p) => (
                  <div key={p.id} className="card-surface card-hover group flex items-center gap-3 p-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                      <Bookmark className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.prompt}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(new Date(p.updatedAt).toISOString())}</span>
                    {confirmDeletePrompt === p.id ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setPrompts(deletePrompt(userId || "", p.id)); setConfirmDeletePrompt(null); }}
                          className="inline-flex items-center gap-1 rounded-lg bg-destructive px-2.5 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                        >
                          <Trash2 className="h-3 w-3" /> Forget
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePrompt(null)}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <Link
                          to={`/chat?q=${encodeURIComponent(p.prompt)}`}
                          title="Use this prompt in Chat"
                          className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                          <Send className="h-3 w-3" /> Use
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPromptForm({ id: p.id, title: p.title, prompt: p.prompt })}
                          title="Edit prompt"
                          aria-label={`Edit ${p.title}`}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePrompt(p.id)}
                          title="Forget this prompt"
                          aria-label={`Forget ${p.title}`}
                          className="rounded-lg p-1.5 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Memory controls — real, destructive, confirmed ────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { delay: 0.1, duration: 0.3 }}
          className="mt-10 rounded-2xl border border-border/70 bg-card/50 p-5"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <ShieldCheck className="h-4 w-4 text-primary" /> Memory control & privacy
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            NexusAI stores what you create: conversations, uploaded files (with extracted text), voice sessions and your account
            preferences. Everything here is your own data — you can inspect and remove it at any time. Nothing is shared with
            other users, and forgetting deletes the real record from your account.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {([
              { key: "chat" as const, label: `Forget ${counts.chats} conversation${counts.chats === 1 ? "" : "s"}`, icon: MessageSquare },
              { key: "file" as const, label: `Forget ${counts.files} file${counts.files === 1 ? "" : "s"}`, icon: FileText },
              { key: "voice" as const, label: `Forget ${counts.voice} voice session${counts.voice === 1 ? "" : "s"}`, icon: Mic },
            ]).map((action) => (
              <div key={action.key} className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
                {confirmClearAll === action.key ? (
                  <div>
                    <p className="text-xs font-medium">Forget all {action.key === "chat" ? "conversations" : action.key === "file" ? "files" : "voice sessions"}?</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">This permanently deletes every {action.key} from your account.</p>
                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => clearCategory()}
                        disabled={clearing}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                      >
                        {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        {clearing ? `Forgetting ${clearedCount}…` : "Forget all"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearAll(null)}
                        disabled={clearing}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(action.key)}
                    disabled={action.key === "chat" ? counts.chats === 0 : action.key === "file" ? counts.files === 0 : counts.voice === 0}
                    className="inline-flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <action.icon className="h-4 w-4" strokeWidth={1.8} />
                    {action.label}
                  </button>
                )}
              </div>
            ))}
          </div>
          {forgetError && (
            <p role="alert" className="mt-3 text-xs text-destructive">{forgetError}</p>
          )}
        </motion.div>
      </div>

      {/* ── Detail drawer — spatial surface that moves forward ──────────── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.2 }}
              onClick={() => { setSelected(null); setConfirmForget(false); }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              aria-hidden="true"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={`${selected.title} — memory detail`}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 40 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    selected.category === "chat" ? "bg-primary/10 text-primary" : selected.category === "file" ? "bg-emerald-500/10 text-emerald-500" : selected.category === "voice" ? "bg-blue-500/10 text-blue-500" : selected.category === "prompt" ? "bg-amber-500/10 text-amber-500" : "bg-violet-500/10 text-violet-500"
                  )}>
                    {selected.category === "chat" ? <MessageSquare className="h-4 w-4" /> : selected.category === "file" ? <FileText className="h-4 w-4" /> : selected.category === "voice" ? <Mic className="h-4 w-4" /> : selected.category === "prompt" ? <Bookmark className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{selected.title}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{selected.category}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelected(null); setConfirmForget(false); }}
                  aria-label="Close memory detail"
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
                  {selected.meta.map((m) => (
                    <div key={m.label} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{m.label}</dt>
                      <dd className="mt-0.5 truncate font-medium">{m.value}</dd>
                    </div>
                  ))}
                </dl>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remembered content</h3>
                <p className="whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/20 p-4 text-sm leading-relaxed">
                  {selected.body}
                </p>
                {selected.deleteLabel && (
                  <div className="mt-4">
                    {confirmForget ? (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-3.5">
                        <p className="text-sm font-medium">Forget this memory?</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">This will permanently remove it from your account.</p>
                        {forgetError && <p role="alert" className="mt-2 text-xs text-destructive">{forgetError}</p>}
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={forgetItem}
                            disabled={forgetting}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                          >
                            {forgetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Forget
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmForget(false)}
                            disabled={forgetting}
                            className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmForget(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3.5 py-2 text-sm font-medium text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {selected.deleteLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {selected.route && (
                <div className="border-t border-border p-4">
                  <Link
                    to={selected.route}
                    onClick={() => { setSelected(null); setConfirmForget(false); }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
                  >
                    Open <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Memory list rows — keyboard-navigable (roving focus)                */
/* ------------------------------------------------------------------ */
function MemoryList({
  items,
  loading,
  onSelect,
  onKeyDown,
  listRef,
}: {
  items: MemoryItem[];
  loading: boolean;
  onSelect: (item: MemoryItem) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  listRef: React.RefObject<HTMLDivElement>;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }
  if (items.length === 0) return null;
  return (
    <div ref={listRef} onKeyDown={onKeyDown} role="list" aria-label="Memory items" className="space-y-2">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-memory-row={item.key}
          onClick={() => onSelect(item)}
          className="card-surface card-hover group flex w-full items-center gap-3 p-3.5 text-left"
        >
          <span className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            item.category === "chat" ? "bg-primary/10 text-primary" : item.category === "file" ? "bg-emerald-500/10 text-emerald-500" : item.category === "voice" ? "bg-blue-500/10 text-blue-500" : item.category === "prompt" ? "bg-amber-500/10 text-amber-500" : "bg-violet-500/10 text-violet-500"
          )}>
            {item.category === "chat" ? <MessageSquare className="h-4 w-4" strokeWidth={1.8} /> : item.category === "file" ? <FileText className="h-4 w-4" strokeWidth={1.8} /> : item.category === "voice" ? <Mic className="h-4 w-4" strokeWidth={1.8} /> : item.category === "prompt" ? <Bookmark className="h-4 w-4" strokeWidth={1.8} /> : <Cpu className="h-4 w-4" strokeWidth={1.8} />}
          </span>
          <span className="min-w-0 flex-1">              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{item.title}</span>
                {item.pinned && <Pin className="h-3 w-3 shrink-0 text-yellow-500" />}
              </span>
            <span className="block truncate text-xs text-muted-foreground">{item.snippet}</span>
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(item.updatedAt)}</span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ))}
    </div>
  );
}


