import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
// PrismLight registers only the languages below (instead of the full prism
// bundle, ~700 kB of language grammars). Unknown fenced languages fall back
// to plain text via react-syntax-highlighter's built-in try/catch.
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import graphql from "react-syntax-highlighter/dist/esm/languages/prism/graphql";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";

// markup, css, clike, javascript come pre-registered in refractor/core.
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("c", c);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("csharp", csharp);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("php", php);
SyntaxHighlighter.registerLanguage("ruby", ruby);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("docker", docker);
SyntaxHighlighter.registerLanguage("graphql", graphql);
SyntaxHighlighter.registerLanguage("kotlin", kotlin);
SyntaxHighlighter.registerLanguage("swift", swift);

// Common aliases used in fenced-code blocks.
SyntaxHighlighter.alias("javascript", ["js"]);
SyntaxHighlighter.alias("typescript", ["ts"]);
SyntaxHighlighter.alias("python", ["py"]);
SyntaxHighlighter.alias("bash", ["sh", "shell"]);
SyntaxHighlighter.alias("yaml", ["yml"]);
SyntaxHighlighter.alias("markup", ["html", "xml"]);
SyntaxHighlighter.alias("cpp", ["c++"]);
SyntaxHighlighter.alias("csharp", ["cs"]);
SyntaxHighlighter.alias("markdown", ["md"]);
import { Volume2, Loader2, Square, ChevronUp, Copy, Check, User } from "lucide-react";
import { NexusCore } from "@/components/ui/nexus-core";
import { cn } from "@/utils/cn";
import { getLangColor } from "@/utils/languageColors";
import { playSpeech, stopCurrentSpeech } from "@/utils/speech";
import { voiceService } from "@/services/voice.service";
import { Message } from "@/types";

interface ChatMessageProps {
  message: Message;
  /** Language to speak the reply in when the replay button is pressed. */
  replayLang?: string;
  /** Optional element rendered under the bubble (e.g. an attachment chip). */
  meta?: React.ReactNode;
  /** Deep-reasoning phase: the model is thinking before answering (e.g. NVIDIA Inkling). */
  thinking?: boolean;
  /** Streamed reasoning text during the thinking phase (transient, never persisted). */
  reasoning?: string;
}

interface VoiceOption {
  id: string;
  label: string;
}

export function ChatMessage({ message, replayLang, meta, thinking, reasoning }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [fetching, setFetching] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 while playing
  const [voice, setVoice] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dgVoices, setDgVoices] = useState<Array<{ id: string; name: string }>>([]);
  const [edgeVoices, setEdgeVoices] = useState<Array<{ id: string; language: string; name: string; gender: "Female" | "Male" }>>([]);
  const [langNames, setLangNames] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const stopPlayback = () => {
    stopCurrentSpeech();
    audioRef.current = null;
    setPlaying(false);
    setProgress(0);
  };

  // Never leave audio running if this message unmounts (e.g. switching chats) —
  // but only stop the shared playback when it's this message's own audio.
  useEffect(() => () => { if (audioRef.current) stopCurrentSpeech(); }, []);

  // Load both TTS catalogs once (Deepgram for English, Edge for other languages).
  useEffect(() => {
    let active = true;
    Promise.all([
      voiceService.getVoices().catch(() => []),
      voiceService.getEdgeVoices().catch(() => []),
    ]).then(([dg, edge]) => {
      if (!active) return;
      setDgVoices(dg);
      setEdgeVoices(edge);
    });
    // Load the language catalog into state so the badge shows the display
    // name (and re-renders once it arrives) instead of falling back to the code.
    voiceService
      .getLanguages()
      .then((list) => {
        if (!active || !Array.isArray(list) || !list.length) return;
        const map: Record<string, string> = {};
        list.forEach((l) => { map[l.code] = l.name; });
        setLangNames(map);
      })
      .catch(() => { /* badge falls back to the language code */ });
    return () => { active = false; };
  }, []);

  // Voices available for the current reply language (male/female for non-English).
  const voiceOptions: VoiceOption[] =
    replayLang === "en"
      ? dgVoices.map((v) => ({ id: v.id, label: v.name }))
      : edgeVoices
          .filter((v) => v.language === replayLang)
          .map((v) => ({ id: v.id, label: `${v.name} — ${v.gender}` }));

  // Keep the chosen voice valid for the current language — restore the saved
  // preference (shared with the Voice page), else default to the first voice.
  useEffect(() => {
    if (!voiceOptions.length) return;
    const saved = localStorage.getItem(replayLang === "en" ? "nexusai-voice" : `nexusai-edge-voice-${replayLang}`);
    const match = voiceOptions.find((v) => v.id === saved);
    setVoice(match ? match.id : voiceOptions[0].id);
  }, [replayLang, voiceOptions.length]);

  // Long-press (450ms) opens the voice picker; a short press replays.
  const startPress = () => {
    pressTimer.current = window.setTimeout(() => {
      longPressedRef.current = true;
      setMenuOpen(true);
    }, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleButtonClick = () => {
    cancelPress();
    if (longPressedRef.current) {
      // The long-press already opened the picker — swallow the click.
      longPressedRef.current = false;
      return;
    }
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (playing) {
      stopPlayback();
      return;
    }
    replay();
  };

  const playAudio = async (voiceId: string) => {
    if (!message.content || playing || fetching) return;
    setFetching(true);
    setProgress(0);
    try {
      const audioBlob = await voiceService.speak(message.content, voiceId || undefined, replayLang || "en");
      setFetching(false);
      setPlaying(true);
      // Shared manager: starting this playback cuts off any other reply that is
      // currently speaking (auto-spoken or another replay), so voices never
      // overlap. It also cleans up the object URL on end/error/interrupt.
      const audio = playSpeech(audioBlob, {
        onEnd: () => { audioRef.current = null; setPlaying(false); setProgress(0); },
        onError: () => {
          audioRef.current = null;
          // Fall back to the browser's speech synthesis (no stop control there).
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message.content);
            window.speechSynthesis.speak(utterance);
          } catch { /* speech not available */ }
          setPlaying(false);
          setProgress(0);
        },
      });
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (audio.duration && isFinite(audio.duration)) {
          setProgress(Math.min(1, audio.currentTime / audio.duration));
        }
      };
    } catch {
      setFetching(false);
      // Fall back to the browser's speech synthesis (no stop control there).
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message.content);
        window.speechSynthesis.speak(utterance);
      } catch { /* speech not available */ }
      setPlaying(false);
      setProgress(0);
    }
  };

  const replay = () => playAudio(voice);

  // Pick a voice from the long-press menu and replay with it immediately.
  const pickVoice = (id: string) => {
    setVoice(id);
    try {
      localStorage.setItem(replayLang === "en" ? "nexusai-voice" : `nexusai-edge-voice-${replayLang}`, id);
    } catch { /* ignore */ }
    setMenuOpen(false);
    playAudio(id);
  };

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  const streaming = !isUser && !message.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("group flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("flex w-full items-end gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
        {/* Avatar — glowing for the AI, clean gradient for the user */}
        <div className="relative shrink-0">
          {!isUser && (
            <div aria-hidden className="absolute -inset-1 rounded-full bg-primary/20 blur-md" />
          )}
          <div
            className={cn(
              "relative flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ring-1",
              isUser
                ? "bg-gradient-to-br from-primary to-indigo-500 text-primary-foreground ring-primary/30 shadow-sm"
                : "bg-gradient-to-br from-violet-500/25 to-indigo-500/10 text-primary ring-primary/25"
            )}
            aria-hidden="true"
          >
            {isUser ? <User className="h-3.5 w-3.5" /> : "N"}
          </div>
        </div>

        <div className={cn("flex min-w-0 flex-1 flex-col", isUser ? "items-end" : "items-start")}>
          {/* Editorial body: user replies are compact glowing chips; assistant
              replies sit on a soft ambient surface — readable, never a heavy card. */}
          <div
            className={cn(
              "text-[15px] leading-relaxed",
              isUser
                ? "max-w-[88%] rounded-2xl rounded-br-md bg-gradient-to-br from-primary to-primary-hover px-4 py-2.5 text-primary-foreground shadow-md shadow-primary/20 ring-1 ring-white/10 sm:max-w-[82%]"
                : "w-full rounded-2xl border border-border/50 bg-card/45 px-4 py-3 backdrop-blur-[2px] sm:px-5 text-[15.5px] leading-[1.8]"
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            ) : !message.content && (thinking || reasoning) ? (
              /* Deep-reasoning panel — honest thinking state: the model streams
                 its reasoning live while it works, then the answer replaces it
                 the moment content arrives. Rendered at its resting position
                 (no off-screen animation). */
              <div className="w-full">
                <div className="flex items-center gap-2">
                  <NexusCore size={16} state="thinking" />
                  <span className="text-xs font-medium text-muted-foreground">Deep reasoning — Nexus is thinking…</span>
                </div>
                {reasoning ? (
                  <div className="mt-2.5 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/30 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground/90">
                    {reasoning}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={cn("prose-nexus", streaming && "streaming-caret")}>
                <ReactMarkdown
                  components={{
                    code({ inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || "");
                      return !inline && match ? (
                        <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" {...props}>
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>{children}</code>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
            {!isUser && playing && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted-foreground/15">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-linear"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
          </div>

          {meta && <div className="mt-1.5">{meta}</div>}

          {/* Actions row */}
          {message.content && (
            <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <button
                type="button"
                onClick={copyContent}
                aria-label="Copy reply"
                title="Copy reply"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              {replayLang && (
                <div className="relative flex items-center gap-1">
                  {replayLang !== "en" && (
                    <span
                      title={`This reply is in ${langNames[replayLang] || replayLang}`}
                      className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide"
                      style={{
                        color: getLangColor(replayLang),
                        backgroundColor: `${getLangColor(replayLang)}1a`,
                        border: `1px solid ${getLangColor(replayLang)}40`,
                      }}
                    >
                      {langNames[replayLang] || replayLang}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleButtonClick}
                    onPointerDown={startPress}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onPointerCancel={cancelPress}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={fetching}
                    aria-label={playing ? "Stop playback" : "Play reply aloud"}
                    title={playing ? "Stop playback" : "Play reply aloud — long-press for voice"}
                    className={cn(
                      "rounded-lg p-1.5 transition-colors disabled:opacity-50",
                      playing ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playing ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                  {menuOpen && (
                    <div
                      className="absolute bottom-full left-0 z-50 mb-2 w-48 rounded-xl border border-border bg-popover p-1.5 shadow-popover animate-scale-in"
                      role="menu"
                    >
                      <p className="flex items-center gap-1 px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <ChevronUp className="h-3 w-3" /> Voices · {replayLang === "en" ? "English" : langNames[replayLang] || replayLang}
                      </p>
                      {voiceOptions.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">No server voices — uses browser speech</p>
                      ) : (
                        voiceOptions.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            role="menuitem"
                            onClick={() => pickVoice(v.id)}
                            className={cn(
                              "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                              v.id === voice ? "bg-primary/15 font-medium text-primary" : "text-foreground hover:bg-accent"
                            )}
                          >
                            {v.label}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
