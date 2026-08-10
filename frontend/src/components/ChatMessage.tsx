import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Volume2, Loader2, Square, ChevronUp } from "lucide-react";
import { cn } from "@/utils/cn";
import { getLangColor } from "@/utils/languageColors";
import { playSpeech, stopCurrentSpeech } from "@/utils/speech";
import { voiceService } from "@/services/voice.service";
import { Message } from "@/types";

interface ChatMessageProps {
  message: Message;
  /** Language to speak the reply in when the replay button is pressed. */
  replayLang?: string;
}

interface VoiceOption {
  id: string;
  label: string;
}



export function ChatMessage({ message, replayLang }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [fetching, setFetching] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 while playing
  const [voice, setVoice] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
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
  }, [replayLang, voiceOptions.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex items-end gap-1.5", isUser ? "flex-row-reverse" : "flex-row")}>
        <div className={cn("max-w-[80%] rounded-2xl px-4 py-3", isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
          {isUser ? (
            <p className="text-sm">{message.content}</p>
          ) : (
            <ReactMarkdown
              className="prose prose-sm dark:prose-invert max-w-none"
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
          )}
          {!isUser && playing && (
            <div className="mt-2 h-1 w-full rounded-full bg-muted-foreground/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-linear"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}
        </div>
        {!isUser && replayLang && message.content && (
          <div className="relative flex flex-col items-center gap-1">
            {replayLang !== "en" && (
              <span
                title={`This reply is in ${langNames[replayLang] || replayLang}`}
                className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full whitespace-nowrap font-medium"
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
                "p-1.5 rounded-lg transition-colors disabled:opacity-50",
                playing ? "bg-primary/15 text-primary hover:bg-primary/25" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            {menuOpen && (
              <div
                className="absolute bottom-full left-0 mb-2 z-50 w-48 rounded-lg border border-border bg-popover shadow-lg p-1.5"
                role="menu"
              >
                <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <ChevronUp className="w-3 h-3" /> Voices · {replayLang === "en" ? "English" : replayLang}
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
                        "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors",
                        v.id === voice ? "bg-primary/15 text-primary font-medium" : "text-foreground hover:bg-accent"
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
    </div>
  );
}
