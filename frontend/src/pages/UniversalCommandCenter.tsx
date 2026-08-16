import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles, Paperclip, Mic, Globe, Send, MessageSquare, FileText, Image as ImageIcon,
  Video, BarChart3, Clock, ArrowRight, CornerDownLeft, Zap, Wand2,
} from "lucide-react";
import {
  detectIntent, suggestCommands, addRecentCommand, getRecentCommands,
} from "@/utils/intentRouter";
import { chatService } from "@/services/chat.service";
import { Select } from "@/components/ui/select";
import { NexusCore } from "@/components/ui/nexus-core";
import { cn } from "@/utils/cn";
import { getDefaultChatModel } from "@/utils/aiPreferences";

const QUICK_ACTIONS = [
  { icon: MessageSquare, label: "Chat", path: "/chat", desc: "Ask anything", color: "text-primary bg-primary/10" },
  { icon: FileText, label: "Analyze File", path: "/files", desc: "Documents & data", color: "text-emerald-500 bg-emerald-500/10" },
  { icon: ImageIcon, label: "Image", path: "/image-studio", desc: "Generate images", color: "text-pink-500 bg-pink-500/10" },
  { icon: Video, label: "Video", path: "/video-studio", desc: "Generate videos", color: "text-blue-500 bg-blue-500/10" },
  { icon: Mic, label: "Voice", path: "/voice", desc: "Transcribe & speak", color: "text-amber-500 bg-amber-500/10" },
  { icon: BarChart3, label: "Analytics", path: "/analytics", desc: "Usage & stats", color: "text-violet-500 bg-violet-500/10" },
];

// Capability shortcuts orbiting the Nexus Core (desktop only).
const CORE_CHIPS = [
  { to: "/chat", icon: MessageSquare, label: "Chat", pos: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", dur: 5, del: 0 },
  { to: "/files", icon: FileText, label: "Files", pos: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", dur: 6, del: 1.2 },
  { to: "/image-studio", icon: ImageIcon, label: "Create", pos: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", dur: 5.5, del: 0.6 },
  { to: "/voice", icon: Mic, label: "Voice", pos: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", dur: 6.5, del: 1.8 },
  { to: "/analytics", icon: BarChart3, label: "Insights", pos: "right-1/4 -bottom-4 translate-x-1/2", dur: 6, del: 0.9 },
];

interface ModelOption { value: string; label: string; hint?: string }

export function UniversalCommandCenter() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [models, setModels] = useState<ModelOption[]>([{ value: "auto", label: "Auto — best for task" }]);
  // Default from the Model Manager preference when set, otherwise Auto.
  const [model, setModel] = useState(getDefaultChatModel);
  const [recent, setRecent] = useState<string[]>([]);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Real models from the backend (same endpoint the Chat page uses).
  useEffect(() => {
    chatService
      .getModels()
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) {
          // The backend model list now includes its own "auto" entry (labeled
          // with the user's default provider) — keep the hardcoded one and
          // drop the duplicate.
          setModels([
            { value: "auto", label: "Auto — best for task" },
            ...data.filter((m: { id: string }) => m.id !== "auto").map((m: { id: string; name: string }) => ({ value: m.id, label: m.name })),
          ]);
        }
      })
      .catch(() => { /* Auto only */ });
  }, []);

  useEffect(() => {
    setRecent(getRecentCommands());
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const intent = useMemo(() => detectIntent(input), [input]);
  const suggestions = useMemo(() => suggestCommands(input).slice(0, 4), [input]);

  const runCommand = (text: string) => {
    const clean = text.trim();
    if (!clean) { navigate("/chat"); return; }
    addRecentCommand(clean);
    setRecent(getRecentCommands());
    const result = detectIntent(clean);
    // The model picker only applies to chat routing (image/video/voice have
    // their own model pickers on their pages).
    const withModel = result.type === "chat" && model !== "auto"
      ? `${result.route}&model=${encodeURIComponent(model)}`
      : result.route;
    navigate(withModel);
  };

  const fillSuggestion = (text: string) => {
    setInput(text);
    setSuggestIndex(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSuggestIndex((i) => (suggestions.length ? (i + 1) % suggestions.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSuggestIndex((i) => (suggestions.length ? (i - 1 + suggestions.length) % suggestions.length : -1));
    } else if (e.key === "Enter") {
      if (suggestIndex >= 0 && suggestions[suggestIndex]) {
        e.preventDefault();
        fillSuggestion(suggestions[suggestIndex].text);
        return;
      }
      if (!e.shiftKey) {
        e.preventDefault();
        runCommand(input);
      }
    } else if (e.key === "Escape") {
      setSuggestIndex(-1);
    }
  };

  const enableWebSearch = () => {
    try { localStorage.setItem("nexusai-chat-search", "1"); } catch { /* ignore */ }
  };

  const onSearch = () => {
    enableWebSearch();
    if (input.trim()) { runCommand(input); return; }
    navigate("/chat");
  };

  const suggestionsVisible = suggestions.length > 0 && !suggestions.some((s) => s.text === input.trim());

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Ambient core glow behind the hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-0 h-96 w-[42rem] max-w-full -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.14), transparent 65%)" }}
      />

      <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_auto]">
        {/* ── Left: brand + floating command surface ─────────────────── */}
        <div className="min-w-0">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}>
            <div className="mb-4 flex items-center gap-3">
              {/* Mini Nexus Core as the brand mark */}
              <NexusCore size={52} />
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  What would you like to <span className="text-gradient">do</span>?
                </h1>
                <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                  One command for everything NexusAI can do — chat, files, images, video, voice & analytics.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Floating command surface */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.4, ease: "easeOut" }}
            className="mt-7"
          >
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 9, ease: "easeInOut", repeat: Infinity }}
            >
              {/* Gradient hairline border wrapper */}
              <div className="rounded-2xl bg-gradient-to-b from-border via-border/60 to-border/20 p-px shadow-float">
                <div className="surface-glow rounded-2xl bg-card/90 p-2 backdrop-blur-md transition-shadow duration-200">
                  <div className="flex items-end gap-2 px-2 pt-2">
                    <Wand2 className="mb-2.5 ml-1 h-5 w-5 shrink-0 text-primary" />
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => { setInput(e.target.value); setSuggestIndex(-1); }}
                      onKeyDown={onKeyDown}
                      rows={input.split("\n").length > 2 ? 3 : 1}
                      placeholder="Ask NexusAI anything… e.g. “Create an image of a neon city”"
                      aria-label="Universal command input"
                      aria-autocomplete="list"
                      aria-controls="command-suggestions"
                      className="max-h-28 min-h-[44px] w-full resize-none bg-transparent py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => runCommand(input)}
                      disabled={!input.trim()}
                      aria-label="Run command"
                      className={cn(
                        "mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all",
                        input.trim() ? "hover:bg-primary-hover" : "opacity-40"
                      )}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Toolbar: attach / voice / web search + model picker */}
                  <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2 pt-1.5">
                    <button type="button" onClick={() => navigate("/files")} aria-label="Attach a file" title="Attach a file (Files)"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <Paperclip className="h-4 w-4" strokeWidth={1.9} />
                    </button>
                    <button type="button" onClick={() => navigate("/voice")} aria-label="Use voice input" title="Voice input (Voice Studio)"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <Mic className="h-4 w-4" strokeWidth={1.9} />
                    </button>
                    <button type="button" onClick={onSearch} aria-label="Search the web" title="Search the web in chat"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <Globe className="h-4 w-4" strokeWidth={1.9} />
                    </button>
                    <div className="mx-1 h-5 w-px bg-border" />
                    <Select
                      value={model}
                      onChange={setModel}
                      options={models}
                      ariaLabel="Command model"
                      searchable
                      leadingIcon={<Zap className="h-3.5 w-3.5 text-muted-foreground" />}
                      className="h-8 rounded-lg text-xs"
                    />
                    {intent.type !== "chat" && (
                      <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary sm:flex">
                        <ArrowRight className="h-3 w-3" /> {intent.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Live intent hint */}
            {input.trim() && (
              <p className="mt-2.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                <CornerDownLeft className="h-3 w-3" />
                {intent.label} — {intent.description.toLowerCase()}
              </p>
            )}

            {/* Autocomplete suggestions */}
            {suggestionsVisible && (
              <div id="command-suggestions" role="listbox" aria-label="Command suggestions"
                className="mt-2 overflow-hidden rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-popover backdrop-blur">
                {suggestions.map((s, i) => (
                  <button
                    key={s.text}
                    role="option"
                    aria-selected={i === suggestIndex}
                    onClick={() => fillSuggestion(s.text)}
                    onMouseEnter={() => setSuggestIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      i === suggestIndex ? "bg-primary/10 text-primary" : "text-foreground"
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{s.text}</span>
                    {i === suggestIndex && <ArrowRight className="ml-auto h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* ── Right: Nexus Core with orbiting capability shortcuts (desktop) ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.18, duration: 0.5, ease: "easeOut" }}
          className="relative hidden lg:block"
        >
          <div className="relative">
            <NexusCore size={300} />
            {CORE_CHIPS.map((chip) => (
              <motion.div
                key={chip.label}
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: chip.dur, repeat: Infinity, ease: "easeInOut", delay: chip.del }}
                className={cn("absolute z-10", chip.pos)}
              >
                <button
                  onClick={() => navigate(chip.to)}
                  className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/85 px-3 py-1.5 text-xs font-medium shadow-popover backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:glow-primary"
                >
                  <chip.icon className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
                  {chip.label}
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Quick actions — spatial floating chips ───────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.35, ease: "easeOut" }} className="mt-10">
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-muted-foreground">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_ACTIONS.map((action, i) => (
            <motion.button
              key={action.path}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.04 }}
              onClick={() => navigate(action.path)}
              className="card-surface card-hover group flex items-center gap-3 p-3.5 text-left"
            >
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110", action.color)}>
                <action.icon className="h-4.5 w-4.5" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{action.label}</p>
                <p className="truncate text-xs text-muted-foreground">{action.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ── Recent commands (real local history) ─────────────────────── */}
      {recent.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.35, ease: "easeOut" }} className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight text-muted-foreground">
            <Clock className="h-4 w-4" /> Recent commands
          </h2>
          <div className="space-y-1.5">
            {recent.map((cmd, i) => (
              <button
                key={`${cmd}-${i}`}
                onClick={() => runCommand(cmd)}
                className="card-surface card-hover group flex w-full items-center gap-3 p-3 text-left"
              >
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{cmd}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
