import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MessageSquare, Image as ImageIcon, FileText, Video, Bot, BarChart3, Code2,
  MessagesSquare, Pin, ArrowRight, Coins, Activity, Sparkles, Paperclip,
  Mic, ArrowUpRight, Send, Clock, Brain, FolderKanban, Users, StickyNote, CheckSquare,
  CalendarClock, Bookmark, TrendingUp, Presentation, UploadCloud, AlertCircle,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { chatService } from "@/services/chat.service";
import { detectIntent } from "@/utils/intentRouter";
import { matchResourceCommand } from "@/utils/resourceRouter";
import { usageService } from "@/services/usage.service";
import { fileService, FILE_SIZE_LIMIT } from "@/services/file.service";
import { voiceService } from "@/services/voice.service";
import { projectsService } from "@/services/projects.service";
import { meetingsService, Meeting } from "@/services/meetings.service";
import { listDocuments } from "@/services/documents.service";
import { getOnboardingInterests } from "@/utils/onboarding";
import { getSavedPrompts } from "@/utils/savedPrompts";
import { Conversation, UsageResponse } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { NexusCore } from "@/components/ui/nexus-core";
import { cn } from "@/utils/cn";

/** Trim an AI summary for the card preview — cut the action-items section
 * and any markdown bold, then clamp to a readable snippet. */
function summarySnippet(summary: string, max = 220): string {
  const beforeItems = summary.split(/\n?\s*\*{0,2}ACTION\s+ITEMS?\*{0,2}/i)[0].trim();
  const clean = beforeItems.replace(/\*\*/g, "").replace(/\s+/g, " ");
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

const QUICK_ACTIONS = [
  { to: "/chat", icon: MessageSquare, label: "Chat", desc: "Start a conversation", color: "text-primary bg-primary/10" },
  { to: "/files", icon: FileText, label: "Analyze", desc: "Understand a document", color: "text-emerald-500 bg-emerald-500/10" },
  { to: "/image-studio", icon: ImageIcon, label: "Create", desc: "Generate an image", color: "text-pink-500 bg-pink-500/10" },
  { to: "/voice", icon: Mic, label: "Voice", desc: "Speak & translate", color: "text-blue-500 bg-blue-500/10" },
];

// Onboarding interests → dashboard quick actions (frontend personalization;
// the backend has no per-user preference API for this, so it stays local).
const INTEREST_ACTIONS: Record<string, { to: string; icon: typeof MessageSquare; label: string; desc: string; color: string }> = {
  chat: { to: "/chat", icon: MessageSquare, label: "Chat", desc: "Start a conversation", color: "text-primary bg-primary/10" },
  files: { to: "/files", icon: FileText, label: "Analyze", desc: "Understand a document", color: "text-emerald-500 bg-emerald-500/10" },
  images: { to: "/image-studio", icon: ImageIcon, label: "Create", desc: "Generate an image", color: "text-pink-500 bg-pink-500/10" },
  videos: { to: "/video-studio", icon: Video, label: "Video", desc: "Generate a clip", color: "text-purple-500 bg-purple-500/10" },
  voice: { to: "/voice", icon: Mic, label: "Voice", desc: "Speak & translate", color: "text-blue-500 bg-blue-500/10" },
  agents: { to: "/agents", icon: Bot, label: "Agents", desc: "Browse AI agents", color: "text-amber-500 bg-amber-500/10" },
  data: { to: "/analytics", icon: BarChart3, label: "Analytics", desc: "Track your usage", color: "text-cyan-500 bg-cyan-500/10" },
  code: { to: "/chat?task=code", icon: Code2, label: "Code", desc: "Write & fix code", color: "text-violet-500 bg-violet-500/10" },
};

export function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [knowledgeCounts, setKnowledgeCounts] = useState<{ files: number; voice: number } | null>(null);
  const [projectCounts, setProjectCounts] = useState<{ projects: number; members: number; notes: number; tasks: number } | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [documents, setDocuments] = useState<Array<{ id: string; title: string; type: string; magicSlidesUrl: string | null; magicSlidesPdf: string | null; updatedAt: string }>>([]);
  const [promptsCount, setPromptsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  // ── Drop-to-analyze on the hero: real File Intelligence upload, then the
  //    Files page opens the file's analysis panel via /files?open=<id>. ──
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const dragDepthRef = useRef(0); // dragenter/leave counter (child flicker)

  const uploadToFiles = async (file: File) => {
    if (file.size > FILE_SIZE_LIMIT) {
      setUploadError("File is too large. Maximum size is 50MB.");
      return;
    }
    setUploadError("");
    setUploading(true);
    try {
      const { data } = await fileService.upload(file);
      // The Files page deep-links ?open=<id> into that file's analysis panel.
      navigate(`/files?open=${data.id}`);
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setUploadError(typeof msg === "string" && msg ? msg : "Upload failed. Please try again.");
      console.error("Dashboard drop upload failed:", err);
    } finally {
      setUploading(false);
      setDragActive(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadToFiles(file);
  };

  useEffect(() => {
    Promise.all([
      chatService.getConversations(),
      usageService.getUsage(),
      fileService.getFiles(),
      voiceService.getSessions(),
      // Best-effort: a project fetch failure must never block the dashboard.
      projectsService.list().catch(() => ({ data: { projects: [], invitations: [] } })),
      // Best-effort: same for meetings.
      meetingsService.list().catch(() => ({ data: { meetings: [] } })),
      // Best-effort: documents (needed for the MagicSlides deck card).
      listDocuments().catch(() => []),
    ])
      .then(([conv, use, fil, sess, proj, meet, docs]) => {
        const projects = proj.data.projects;
        setConversations(conv.data);
        setUsage(use.data);
        setKnowledgeCounts({ files: fil.data.length, voice: sess.length });
        setProjects(projects.map((p) => ({ id: p.id, name: p.name })));
        setProjectCounts({
          projects: projects.length,
          members: projects.reduce((a, p) => a + (p._count?.members ?? 0), 0),
          notes: projects.reduce((a, p) => a + (p._count?.notes ?? 0), 0),
          tasks: projects.reduce((a, p) => a + (p._count?.tasks ?? 0), 0),
        });
        setMeetings(meet.data.meetings);
        setDocuments(docs);
        if (user) setPromptsCount(getSavedPrompts(user.id).length);
      })
      .catch((error) => console.error("Dashboard load error:", error))
      .finally(() => setLoading(false));
  }, [user]);

  // ── Live timeline: refresh conversations + meetings every 30s (and on tab
  //    focus) so new chats and meetings appear without a manual reload. The
  //    heavier/static sections (usage, files, voice, projects) load on mount
  //    only — the timeline is the only part the poll keeps warm. ──
  const refreshingRef = useRef(false);
  const refreshTimeline = useCallback(async () => {
    if (refreshingRef.current) return; // never stack overlapping polls
    refreshingRef.current = true;
    try {
      const [conv, meet] = await Promise.all([
        chatService.getConversations(),
        meetingsService.list().catch(() => ({ data: { meetings: [] } })),
      ]);
      setConversations(conv.data);
      setMeetings(meet.data.meetings);
    } catch (error) {
      console.error("Dashboard timeline refresh error:", error);
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refreshTimeline();
    };
    const t = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshTimeline]);

  const firstName = user?.name?.split(" ")[0] || "there";
  const pinned = conversations.filter((c) => c.isPinned).length;

  // ── Unified activity timeline: chats, meetings, saved prompts — all real ──
  const activity = useMemo(() => {
    const items: Array<{
      id: string;
      kind: "chat" | "meeting" | "prompt";
      title: string;
      subtitle: string;
      date: string;
      to: string;
      icon: typeof MessageSquare;
      color: string;
    }> = [];
    for (const c of conversations) {
      items.push({ id: `chat-${c.id}`, kind: "chat", title: c.title, subtitle: "Conversation", date: c.updatedAt, to: `/chat/${c.id}`, icon: MessageSquare, color: "text-primary bg-primary/10" });
    }
    for (const m of meetings) {
      items.push({
        id: `meeting-${m.id}`,
        kind: "meeting",
        title: m.title,
        subtitle: m.status === "live" ? "Live meeting" : m.summary ? "Meeting summarized" : "Meeting ended",
        date: m.startedAt,
        to: `/meetings/${m.id}`,
        icon: CalendarClock,
        color: "text-violet-500 bg-violet-500/10",
      });
    }
    if (user) {
      for (const p of getSavedPrompts(user.id)) {
        items.push({ id: `prompt-${p.id}`, kind: "prompt", title: p.title, subtitle: "Saved prompt", date: new Date(p.updatedAt).toISOString(), to: "/memory", icon: Bookmark, color: "text-amber-500 bg-amber-500/10" });
      }
    }
    return items.sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 6);
  }, [conversations, meetings, user]);

  // ── Deterministic suggestions from real data (no fake AI reasoning) ──
  const suggestions = useMemo(() => {
    const out: Array<{ label: string; desc: string; to: string; icon: typeof MessageSquare; color: string }> = [];
    const latestMeeting = [...meetings].sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))[0];
    if (latestMeeting?.summary) out.push({ label: "Read your latest summary", desc: `"${latestMeeting.title}" summary is ready`, to: `/meetings/${latestMeeting.id}?view=summary`, icon: CalendarClock, color: "text-violet-500 bg-violet-500/10" });
    else if (latestMeeting) out.push({ label: "Summarize your meeting", desc: `"${latestMeeting.title}" ended without a summary`, to: `/meetings/${latestMeeting.id}`, icon: Sparkles, color: "text-violet-500 bg-violet-500/10" });
    const latestConv = [...conversations].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];
    if (latestConv) out.push({ label: "Continue a conversation", desc: latestConv.title, to: `/chat/${latestConv.id}`, icon: MessageSquare, color: "text-primary bg-primary/10" });
    if ((knowledgeCounts?.files ?? 0) > 0) out.push({ label: "Analyze a file", desc: `${knowledgeCounts?.files} file${(knowledgeCounts?.files ?? 0) === 1 ? "" : "s"} in your library`, to: "/files", icon: FileText, color: "text-emerald-500 bg-emerald-500/10" });
    if ((projectCounts?.projects ?? 0) > 0) out.push({ label: "Open your projects", desc: `${projectCounts?.projects} active project workspace${(projectCounts?.projects ?? 0) === 1 ? "" : "s"}`, to: "/projects", icon: FolderKanban, color: "text-cyan-500 bg-cyan-500/10" });
    if (promptsCount > 0) out.push({ label: "Use a saved prompt", desc: `${promptsCount} saved prompt${promptsCount === 1 ? "" : "s"} ready to insert`, to: "/memory", icon: Bookmark, color: "text-amber-500 bg-amber-500/10" });
    if ((knowledgeCounts?.voice ?? 0) > 0) out.push({ label: "Review voice sessions", desc: `${knowledgeCounts?.voice} recording${(knowledgeCounts?.voice ?? 0) === 1 ? "" : "s"} in your voice library`, to: "/voice", icon: Mic, color: "text-blue-500 bg-blue-500/10" });
    return out.slice(0, 4);
  }, [conversations, meetings, knowledgeCounts, projectCounts, promptsCount, user]);

  // ── Latest AI meeting summary — the single most recent summarized meeting ──
  const latestSummary = useMemo(
    () => meetings.filter((m) => m.summary).sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))[0] ?? null,
    [meetings]
  );

  // ── Latest MagicSlides deck — the most recent document with a real deck ──
  const latestDeck = useMemo(
    () =>
      documents
        .filter((d) => d.magicSlidesUrl)
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0] ?? null,
    [documents]
  );

  // ── Real usage by model (tokens, straight from the usage API) ──
  const topModels = usage ? Object.entries(usage.byModel).sort((a, b) => b[1] - a[1]).slice(0, 4) : [];
  const maxModelTokens = topModels[0]?.[1] || 1;

  // Brand-new user: everything is genuinely empty — welcome instead of cards.
  const isNewUser =
    !loading &&
    conversations.length === 0 &&
    (knowledgeCounts?.files ?? 0) === 0 &&
    (knowledgeCounts?.voice ?? 0) === 0 &&
    meetings.length === 0 &&
    (projectCounts?.projects ?? 0) === 0 &&
    (usage?.totalRequests ?? 0) === 0 &&
    promptsCount === 0;

  // Personalize quick actions with the interests chosen during onboarding;
  // fall back to the default four when the user skipped or has none.
  const interests = user ? getOnboardingInterests(user.id) : [];
  const quickActions =
    interests.length > 0
      ? interests.map((id) => INTEREST_ACTIONS[id]).filter((a): a is NonNullable<typeof a> => !!a).slice(0, 6)
      : QUICK_ACTIONS;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const startCommand = () => {
    if (!query.trim()) { navigate("/chat"); return; }
    // Deep-link into real resources first: "open project launch research"
    // or "join meeting Q4" open the specific record, not just the hub.
    const resource = matchResourceCommand(query, {
      projects,
      meetings: meetings.map((m) => ({ id: m.id, title: m.title })),
      conversations: conversations.map((c) => ({ id: c.id, title: c.title })),
    });
    if (resource) { navigate(resource.route); return; }
    // Route by intent: image/video/file commands open their own studios with
    // the prompt pre-filled; everything else becomes a chat message.
    navigate(detectIntent(query).route);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* ── Hero: command first, Nexus Core beside it. The whole hero is a
             drop target — a dropped file goes through the real File
             Intelligence upload, then opens the analysis panel. ── */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="grid items-center gap-8 lg:grid-cols-[1fr_auto]"
      >
        <div className="min-w-0">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">NexusAI</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {greeting}, <span className="text-gradient">{firstName}</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">What are you building today?</p>
          </motion.div>

          {/* Floating AI command surface */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.4, ease: "easeOut" }}
            className="mt-7"
          >
            <form
              onSubmit={(e) => { e.preventDefault(); startCommand(); }}
              className={cn(
                "group relative rounded-2xl border bg-card/90 p-2 shadow-popover backdrop-blur transition-all duration-200",
                dragActive
                  ? "border-primary/80 glow-primary"
                  : uploading
                    ? "border-primary/40"
                    : "border-border/80 focus-within:border-primary/60"
              )}
            >
              {/* Drop overlay — covers the bar while a file hovers over the hero */}
              {dragActive && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-2xl bg-card/95 backdrop-blur-sm">
                  <UploadCloud className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold">Drop to analyze with AI File Intelligence</span>
                </div>
              )}
              <div className="flex items-center gap-2 px-2">
                {uploading ? (
                  <NexusCore size={18} state="thinking" />
                ) : (
                  <Sparkles className="ml-1 h-5 w-5 shrink-0 text-primary" />
                )}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={uploading ? "Uploading through File Intelligence…" : "Ask NexusAI anything…"}
                  aria-label="Ask NexusAI anything"
                  disabled={uploading}
                  className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground disabled:cursor-wait"
                />
                <button
                  type="button"
                  onClick={() => navigate("/files")}
                  title="Attach a file"
                  aria-label="Attach a file"
                  className="hidden h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
                >
                  <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.9} />
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/voice")}
                  title="Use voice input"
                  aria-label="Use voice input"
                  className="hidden h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
                >
                  <Mic className="h-[18px] w-[18px]" strokeWidth={1.9} />
                </button>
                <button
                  type="submit"
                  disabled={!query.trim()}
                  aria-label="Send"
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all",
                    query.trim() ? "hover:bg-primary-hover" : "opacity-40"
                  )}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Write a landing page for my startup", "Explain quantum computing simply", "Create an image of a neon city", "Summarize my meeting notes"].map((s) => (
                <button
                  key={s}
                  onClick={() => navigate(detectIntent(s).route)}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
            {/* Drop status — real upload state, and a hint for discoverability */}
            {uploadError && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {uploadError}
              </p>
            )}
            {!uploadError && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <UploadCloud className="h-3.5 w-3.5" />
                {uploading ? "Uploading and extracting text through File Intelligence…" : "Drop a file anywhere on the card to analyze it"}
              </p>
            )}
          </motion.div>

          {/* Quick actions — dimensional floating tiles (perspective + lift) */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.4, ease: "easeOut" }}
            className="mt-7 flex flex-wrap gap-2.5 [perspective:800px]"
          >
            {quickActions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="group flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/70 px-3.5 py-2 shadow-sm backdrop-blur transition-all duration-200 [transform-style:preserve-3d] hover:-translate-y-1 hover:rotateX-3 hover:border-primary/35 hover:shadow-float"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg shadow-sm transition-all duration-200 [transform:translateZ(10px)] group-hover:scale-110 group-hover:[transform:translateZ(18px)]",
                    action.color
                  )}
                >
                  <action.icon className="h-4 w-4" strokeWidth={1.9} />
                </span>
                <span className="text-left [transform:translateZ(6px)]">
                  <span className="block text-sm font-semibold leading-tight">{action.label}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">{action.desc}</span>
                </span>
              </Link>
            ))}
          </motion.div>
        </div>

        {/* Nexus Core with orbiting shortcuts (desktop) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
          className="relative hidden lg:block"
        >
          <div className="relative">
            <NexusCore size={280} />              {[
                { to: "/chat", icon: MessageSquare, label: "Chat", pos: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", dur: 5, del: 0 },
                { to: "/files", icon: FileText, label: "Files", pos: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", dur: 6, del: 1.4 },
                { to: "/image-studio", icon: ImageIcon, label: "Create", pos: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", dur: 5.5, del: 0.8 },
                { to: "/voice", icon: Mic, label: "Voice", pos: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", dur: 6.5, del: 2 },
              ].map((chip) => (
                <motion.div
                  key={chip.label}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: chip.dur, repeat: Infinity, ease: "easeInOut", delay: chip.del }}
                className={cn("absolute z-10", chip.pos)}
              >
                <Link
                  to={chip.to}
                  className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/85 px-3 py-1.5 text-xs font-medium shadow-popover backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:glow-primary"
                >
                  <chip.icon className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
                  {chip.label}
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Usage strip — typography-forward, not a card grid ─────────── */}
      {loading ? (
        <div className="mt-10 flex items-center gap-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-24" />)}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-5 text-sm"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <MessagesSquare className="h-4 w-4 text-primary" /> <span className="font-semibold tabular-nums text-foreground">{conversations.length}</span> conversations
          </span>
          <span className="h-4 w-px bg-border" aria-hidden />
          <span className="flex items-center gap-2 text-muted-foreground">
            <Pin className="h-4 w-4 text-yellow-500" /> <span className="font-semibold tabular-nums text-foreground">{pinned}</span> pinned
          </span>
          <span className="h-4 w-px bg-border" aria-hidden />
          <span className="flex items-center gap-2 text-muted-foreground">
            <Coins className="h-4 w-4 text-emerald-500" /> <span className="font-semibold tabular-nums text-foreground">{(usage?.totalTokens || 0).toLocaleString()}</span> tokens
          </span>
          <span className="h-4 w-px bg-border" aria-hidden />
          <span className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4 text-blue-500" /> <span className="font-semibold tabular-nums text-foreground">{(usage?.totalRequests || 0).toLocaleString()}</span> AI requests
          </span>
          <Link to="/analytics" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline">
            View analytics <ArrowUpRight className="h-3 w-3" />
          </Link>
          {topModels.length > 0 && (
            <div className="mt-4 flex w-full flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/40 pt-3">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-primary" /> Tokens by model
              </span>
              {topModels.map(([model, tokens]) => (
                <div key={model} className="flex items-center gap-2 text-xs" title={`${tokens.toLocaleString()} tokens`}>
                  <span className="max-w-44 truncate text-muted-foreground">{model}</span>
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(4, (tokens / maxModelTokens) * 100)}%` }} />
                  </div>
                  <span className="tabular-nums font-semibold">{tokens.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Your knowledge — real counts, links into AI Memory ────────── */}
      {!isNewUser && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.35 }}
        className="mt-10"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Brain className="h-4 w-4 text-muted-foreground" />
            Your Knowledge
          </h2>
          <Link to="/memory" className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline">
            Open AI Memory <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {[
            { label: "Files", count: knowledgeCounts?.files ?? null, icon: FileText, color: "text-emerald-500 bg-emerald-500/10" },
            { label: "Voice sessions", count: knowledgeCounts?.voice ?? null, icon: Mic, color: "text-blue-500 bg-blue-500/10" },
            { label: "Conversations", count: conversations.length, icon: MessageSquare, color: "text-primary bg-primary/10" },
          ].map((k) => (
            <Link
              key={k.label}
              to={k.label === "Files" ? "/files" : k.label === "Voice sessions" ? "/voice" : "/history"}
              className="card-surface card-hover flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
            >
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", k.color)}>
                <k.icon className="h-3.5 w-3.5" strokeWidth={1.9} />
              </span>
              <span className="text-sm font-semibold tabular-nums">{k.count ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{k.label}</span>
            </Link>
          ))}
        </div>
      </motion.div>
      )}

      {/* ── Your projects — real counts, links into Project Workspaces ── */}
      {!isNewUser && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.35 }}
        className="mt-10"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
            Your Projects
          </h2>
          <Link to="/projects" className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline">
            Open Projects <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {[
            { label: "Projects", count: projectCounts?.projects ?? null, icon: FolderKanban, color: "text-primary bg-primary/10" },
            { label: "Members", count: projectCounts?.members ?? null, icon: Users, color: "text-blue-500 bg-blue-500/10" },
            { label: "Notes", count: projectCounts?.notes ?? null, icon: StickyNote, color: "text-amber-500 bg-amber-500/10" },
            { label: "Tasks", count: projectCounts?.tasks ?? null, icon: CheckSquare, color: "text-emerald-500 bg-emerald-500/10" },
          ].map((k) => (
            <Link
              key={k.label}
              to="/projects"
              className="card-surface card-hover flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
            >
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", k.color)}>
                <k.icon className="h-3.5 w-3.5" strokeWidth={1.9} />
              </span>
              <span className="text-sm font-semibold tabular-nums">{k.count ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{k.label}</span>
            </Link>
          ))}
        </div>
      </motion.div>
      )}

      {/* ── Latest AI meeting summary — real output, opens into it ───── */}
      {latestSummary && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.35 }}
          className="mt-10"
        >
          <Link
            to={`/meetings/${latestSummary.id}?view=summary`}
            className="card-surface card-hover group relative block overflow-hidden p-5"
          >
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/10 blur-2xl transition-transform duration-500 group-hover:scale-125" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
                <Sparkles className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Latest AI summary</p>
                <p className="mt-1 truncate text-base font-semibold tracking-tight">
                  {latestSummary.title}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {new Date(latestSummary.startedAt).toLocaleDateString()}
                  </span>
                </p>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {summarySnippet(latestSummary.summary || "")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {(() => {
                  const count = (latestSummary.actionItems?.split("\n").filter(Boolean).length ?? 0);
                  return count > 0 ? (
                    <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckSquare className="h-3.5 w-3.5" /> {count} action {count === 1 ? "item" : "items"}
                    </span>
                  ) : null;
                })()}
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors group-hover:bg-primary-hover">
                  Open summary <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </Link>
        </motion.div>
      )}

      {/* ── Latest MagicSlides deck — real generated presentation, one click ── */}
      {latestDeck && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.35 }}
          className="mt-10"
        >
          <div className="card-surface card-hover group relative block overflow-hidden p-5">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/10 blur-2xl transition-transform duration-500 group-hover:scale-125" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
                <Presentation className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Latest presentation deck</p>
                <p className="mt-1 truncate text-base font-semibold tracking-tight">
                  {latestDeck.title}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {new Date(latestDeck.updatedAt).toLocaleDateString()}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A real {latestDeck.type === "presentation" ? "presentation" : "deck"} generated with MagicSlides — PPTX and PDF are ready to download.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <a
                  href={latestDeck.magicSlidesUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-500/10 px-3.5 py-2 text-sm font-medium text-violet-600 transition-colors hover:bg-violet-500/20 dark:text-violet-400"
                >
                  Open deck <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
                {latestDeck.magicSlidesPdf && (
                  <a
                    href={latestDeck.magicSlidesPdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors group-hover:bg-primary-hover"
                  >
                    Download PDF <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}
                <Link
                  to={`/documents/${latestDeck.id}`}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Open document
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Unified activity — real events across the workspace ───────── */}
      {!isNewUser && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.35 }}
          className="mt-10"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </h2>
            <Link to="/history" className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-1">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
            </div>
          ) : activity.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card/30 px-4 py-5 text-center text-xs text-muted-foreground">
              Your activity will appear here as you chat, meet, and save prompts.
            </p>
          ) : (
            <div className="space-y-1">
              {activity.map((item, index) => (
                <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                  <Link to={item.to} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/60">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", item.color)}>
                      <item.icon className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString()}</span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Suggested for you — deterministic, from real data ─────────── */}
      {!isNewUser && suggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.35 }}
          className="mt-10"
        >
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">Suggested for you</h2>
            <span className="text-[11px] text-muted-foreground">based on your real activity</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {suggestions.map((s) => (
              <Link key={s.label} to={s.to} className="card-surface card-hover flex items-center gap-2.5 rounded-xl px-3.5 py-2.5">
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", s.color)}>
                  <s.icon className="h-3.5 w-3.5" strokeWidth={1.9} />
                </span>
                <span>
                  <span className="block text-sm font-semibold leading-tight">{s.label}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">{s.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Recent work ───────────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Recent Conversations
          </h2>
          <Link to="/history" className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : conversations.length === 0 ? (
          isNewUser ? (
            <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 px-6 py-12 text-center backdrop-blur">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" strokeWidth={1.6} />
              <h3 className="text-xl font-bold tracking-tight">Welcome to NexusAI</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Your personal AI operating system. Chat, analyze, create, meet, and build — everything starts here.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                {QUICK_ACTIONS.map((a) => (
                  <Link
                    key={a.to}
                    to={a.to}
                    className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <a.icon className={cn("h-4 w-4", a.color.split(" ")[0])} />
                    {a.label}
                  </Link>
                ))}
                <Link
                  to="/meetings"
                  className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <CalendarClock className="h-4 w-4 text-violet-500" /> Meet
                </Link>
                <Link
                  to="/projects"
                  className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <FolderKanban className="h-4 w-4 text-cyan-500" /> Build
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
              <MessageSquare className="mb-3 h-8 w-8 text-muted-foreground/60" strokeWidth={1.6} />
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Start chatting above and your conversations will show up here</p>
              <Link to="/chat" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover">
                <Sparkles className="h-4 w-4" /> Start a chat
              </Link>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {conversations.slice(0, 5).map((conv, index) => (
              <motion.div key={conv.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                <Link to={`/chat/${conv.id}`} className="card-surface card-hover group flex items-center gap-3 p-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MessageSquare className="h-4 w-4" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{conv.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{conv.messages?.[0]?.content.slice(0, 90) || "No messages yet"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {conv.isPinned && <Pin className="h-3.5 w-3.5 text-yellow-500" />}
                    <span className="text-xs text-muted-foreground">{new Date(conv.updatedAt).toLocaleDateString()}</span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
