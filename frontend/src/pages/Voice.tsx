import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Send, AudioLines, Languages, Globe, Sparkles, Upload, FileAudio, Copy, Check, Download, Play, Search, FileText, X, History, Trash2, ChevronDown, RefreshCw, Cpu, FileDown, Captions, FileJson } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { chatService } from "@/services/chat.service";
import { voiceService, VoiceSession } from "@/services/voice.service";
import { useLiveVoice } from "@/hooks/useLiveVoice";
import { readSavedLanguage, saveLanguage, languageName } from "@/utils/languageCatalog";
import { useLanguageCatalog } from "@/hooks/useLanguageCatalog";
import { getDefaultChatModel } from "@/utils/aiPreferences";
import { recommendModel } from "@/utils/modelRecommendations";
import { ChatMessage } from "@/components/ChatMessage";
import { SeekableTranscript, type TranscriptWord } from "@/components/SeekableTranscript";
import { VoiceOrb } from "@/components/ui/voice-orb";
import { cn } from "@/utils/cn";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

interface VoiceEntry {
  id: string;
  transcript: string;
  reply: string;
  sourceLang: string;
  targetLang: string;
  ts: number;
}

type VoiceMode = "live" | "upload";

/** Audio types Deepgram accepts (backend passes audio/* + octet-stream through). */
const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|webm|ogg|flac|aac|mp4|opus)$/i;
const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", webm: "audio/webm",
  ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac", mp4: "audio/mp4", opus: "audio/ogg",
};
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // backend limit (express.raw 25mb)

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- Transcript export ----
// The transcript text and Deepgram's real per-word timestamps serialize into
// TXT / SRT / JSON entirely client-side — every value is real backend data.

function srtTimestamp(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const f = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(f).padStart(3, "0")}`;
}

function wordsToSrt(words: TranscriptWord[]): string {
  // Prefer confirmed words (interim ones duplicate the tail of the finals).
  const final = words.filter((w) => w.isFinal);
  const list = final.length ? final : words;
  if (!list.length) return "";
  const cues: string[] = [];
  let group: TranscriptWord[] = [];
  let groupStart = list[0].start;
  const flush = () => {
    if (!group.length) return;
    const last = group[group.length - 1];
    cues.push(
      `${cues.length + 1}\n${srtTimestamp(groupStart)} --> ${srtTimestamp(last.end)}\n${group.map((w) => w.word).join(" ")}\n`
    );
    group = [];
  };
  for (const w of list) {
    if (group.length && (group.length >= 7 || w.end - groupStart > 10)) flush();
    if (!group.length) groupStart = w.start;
    group.push(w);
  }
  flush();
  return cues.join("\n");
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface TranscriptActionsProps {
  transcript: string;
  words: TranscriptWord[];
  sourceLang: string;
  targetLang: string;
  sourceName: string;
  targetName: string;
}

/** Copy + export (TXT / SRT / JSON) for the current transcript. SRT needs the
 *  real word timestamps; JSON includes the full word list with times. */
function TranscriptActions({ transcript, words, sourceLang, targetLang, sourceName, targetName }: TranscriptActionsProps) {
  const [copied, setCopied] = useState(false);
  const trimmed = transcript.trim();
  if (!trimmed) return null;
  const stamp = new Date().toISOString().slice(0, 10);
  const srt = wordsToSrt(words);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
      <span className="mr-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        Export transcript
      </span>
      <button
        onClick={copy}
        aria-label="Copy transcript"
        title="Copy transcript"
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        onClick={() => downloadBlob(`[${sourceName}]\n${trimmed}\n`, `nexusai-transcript-${stamp}.txt`, "text/plain;charset=utf-8")}
        aria-label="Download transcript as TXT"
        title="Download TXT"
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <FileDown className="h-3 w-3" /> TXT
      </button>
      <button
        onClick={() => srt && downloadBlob(srt, `nexusai-transcript-${stamp}.srt`, "application/x-subrip;charset=utf-8")}
        disabled={!srt}
        aria-label="Download transcript as SRT subtitles"
        title={srt ? "Download SRT subtitles" : "SRT export needs word timestamps — transcribe first"}
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Captions className="h-3 w-3" /> SRT
      </button>
      <button
        onClick={() =>
          downloadBlob(
            JSON.stringify(
              {
                app: "NexusAI Voice Studio",
                exportedAt: new Date().toISOString(),
                sourceLang,
                targetLang,
                sourceName,
                targetName,
                transcript: trimmed,
                words: words.map((w) => ({ word: w.word, start: w.start, end: w.end, isFinal: w.isFinal })),
              },
              null,
              2
            ),
            `nexusai-transcript-${stamp}.json`,
            "application/json;charset=utf-8"
          )
        }
        aria-label="Download transcript as JSON"
        title="Download JSON"
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <FileJson className="h-3 w-3" /> JSON
      </button>
    </div>
  );
}

export function Voice() {
  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== "undefined" &&
    typeof WebSocket !== "undefined";

  const [mode, setMode] = useState<VoiceMode>("live");
  const [micError, setMicError] = useState("");
  const [duration, setDuration] = useState(0);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [voices, setVoices] = useState<Array<{ id: string; name: string; language: string }>>([]);
  const [voice, setVoice] = useState("aura-2-thalia-en");
  const languages = useLanguageCatalog();
  const [edgeVoices, setEdgeVoices] = useState<Array<{ id: string; language: string; name: string; gender: "Female" | "Male" }>>([]);
  const [edgeVoice, setEdgeVoice] = useState("");
  const [speechLang, setSpeechLang] = useState("en");
  const [replyLang, setReplyLang] = useState("en");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<VoiceEntry[]>([]);
  const [search, setSearch] = useState("");

  // Per-word timestamps from Deepgram for the seekable/highlighted transcript.
  const [liveWords, setLiveWords] = useState<TranscriptWord[]>([]);
  const [uploadWords, setUploadWords] = useState<TranscriptWord[]>([]);

  // The mic session is recorded locally so the transcript is seekable after
  // stopping; the uploaded file's audio powers seeking in upload mode.
  const [liveRecUrl, setLiveRecUrl] = useState<string | null>(null);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const liveRecUrlRef = useRef<string | null>(null);
  const uploadUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);

  // Chat model used for translate & speak and analysis (Auto = backend's
  // best-for-task; preselects the user's default from the Model Manager).
  const [chatModels, setChatModels] = useState<Array<{ id: string; name: string }>>([]);
  const [chatModel, setChatModel] = useState<string>(getDefaultChatModel);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [analysisSource, setAnalysisSource] = useState("");
  const [analysisError, setAnalysisError] = useState("");

  // Persisted history state
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const lastSessionRef = useRef<{ transcript: string; id: string } | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Real-time translation while listening: sentence-final flushes route through
  // the same chat API as "Translate & speak", so each finished sentence is
  // translated into the reply language as you talk.
  const [liveTranslate, setLiveTranslate] = useState(false);
  const liveTranslateRef = useRef(false);
  const [liveTranslation, setLiveTranslation] = useState("");
  const [liveTranslateError, setLiveTranslateError] = useState("");
  const [liveTranslating, setLiveTranslating] = useState(false);
  const liveTranslateTimerRef = useRef<number | null>(null);
  const liveTranslateInFlightRef = useRef(false);
  const liveTranslatedLenRef = useRef(0);
  // Live reads for the async translation callbacks (no stale closures).
  const chatModelRef = useRef(chatModel);
  const replyLangRef = useRef(replyLang);
  useEffect(() => { chatModelRef.current = chatModel; }, [chatModel]);
  useEffect(() => { replyLangRef.current = replyLang; }, [replyLang]);

  // Keep the ref mirror in sync and cancel pending work when the toggle goes
  // off (the panel stays, the timer doesn't fire).
  useEffect(() => {
    liveTranslateRef.current = liveTranslate;
    if (!liveTranslate && liveTranslateTimerRef.current) {
      window.clearTimeout(liveTranslateTimerRef.current);
      liveTranslateTimerRef.current = null;
    }
  }, [liveTranslate]);

  // Real TTS playback state (backend audio or browser speech) for the status pill.
  const [speaking, setSpeaking] = useState(false);

  // Live audio refs — the transcription socket/stream/PCM pipeline is owned by
  // useLiveVoice; these only serve the local recording and the real waveform.
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveCtxRef = useRef<AudioContext | null>(null);
  const waveSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const playCanvasRef = useRef<HTMLCanvasElement>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const playAnalyserRef = useRef<AnalyserNode | null>(null);
  const playRafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  const drawWave = useCallback((canvas: HTMLCanvasElement | null, analyser: AnalyserNode | null, color: string) => {
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const bars = 32;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const gap = 2, bw = (w - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      const v = data[i] / 255;
      const bh = Math.max(3, v * h * 0.9);
      ctx.fillStyle = color;
      const x = i * (bw + gap), y = (h - bh) / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, bw / 2);
      ctx.fill();
    }
  }, []);

  const loopLiveWave = useCallback(() => {
    drawWave(waveCanvasRef.current, analyserRef.current, "rgb(167, 139, 250)");
    rafRef.current = requestAnimationFrame(loopLiveWave);
  }, [drawWave]);

  const stopLiveWave = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    try { waveSourceRef.current?.disconnect(); } catch { /* ignore */ }
    try { waveCtxRef.current?.close(); } catch { /* ignore */ }
    waveSourceRef.current = null;
    waveCtxRef.current = null;
  }, []);

  const stopPlaybackWave = () => {
    if (playRafRef.current) cancelAnimationFrame(playRafRef.current);
    playRafRef.current = null;
    try { playSourceRef.current?.disconnect(); } catch { /* ignore */ }
    try { playCtxRef.current?.close(); } catch { /* ignore */ }
    playSourceRef.current = null;
    playAnalyserRef.current = null;
    playCtxRef.current = null;
  };

  // Live transcription through the shared useLiveVoice pipeline (WebSocket →
  // backend → Deepgram). The socket + PCM streaming live inside the hook; here
  // we attach the mic session's local recording and the real waveform.
  const handleStream = useCallback((stream: MediaStream) => {
    // Record the mic session locally so the transcript stays seekable after
    // stopping (the Deepgram stream only carries text).
    try {
      const rec = new MediaRecorder(stream);
      recChunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) recChunksRef.current.push(ev.data); };
      rec.onstop = () => {
        try {
          const blob = new Blob(recChunksRef.current, { type: rec.mimeType || "audio/webm" });
          if (!blob.size) return;
          const url = URL.createObjectURL(blob);
          if (liveRecUrlRef.current) URL.revokeObjectURL(liveRecUrlRef.current);
          liveRecUrlRef.current = url;
          setLiveRecUrl(url);
        } catch { /* recording is optional */ }
      };
      rec.start();
      mediaRecorderRef.current = rec;
    } catch { /* recording unsupported — transcript still streams live */ }
    // Real waveform from the actual mic stream (Web Audio analyser).
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      waveCtxRef.current = ctx;
      waveSourceRef.current = source;
      analyserRef.current = analyser;
      loopLiveWave();
    } catch { /* waveform is optional */ }
  }, [loopLiveWave]);

  // "Auto — best for task" resolves to a real model before sending (same as
  // Chat) — the backend can't route a bare "auto" id.
  const resolveModel = (model: string, text: string) => (model === "auto" ? recommendModel(text) : model);

  // Stream a chat reply to plain text — the same SSE path as "Translate & speak".
  const streamChatText = useCallback(async (text: string): Promise<string> => {
    const langName = languageName(languages, replyLangRef.current);
    const response = await chatService.streamChat(text, undefined, resolveModel(chatModelRef.current, text), langName, replyLangRef.current);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let out = "";
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) out += data.content;
        } catch { /* skip partial frames */ }
      }
    }
    return out;
  }, [languages]);

  // Translate only the newly-settled tail of the transcript and append it to
  // the running translation — one real chat call per finished sentence.
  const doLiveTranslate = useCallback(async (source: string) => {
    const delta = source.slice(liveTranslatedLenRef.current).trim();
    if (!delta || liveTranslateInFlightRef.current) return;
    liveTranslateInFlightRef.current = true;
    setLiveTranslating(true);
    setLiveTranslateError("");
    try {
      const translated = await streamChatText(delta);
      if (translated) {
        liveTranslatedLenRef.current = source.length;
        setLiveTranslation((prev) => (prev ? prev + " " : "") + translated.trim());
      }
    } catch (err: any) {
      setLiveTranslateError(
        err?.response?.data?.error || "Live translation failed — check the target language and try again."
      );
    } finally {
      liveTranslateInFlightRef.current = false;
      setLiveTranslating(false);
    }
  }, [streamChatText]);

  // Debounce a translation after a sentence boundary so rapid flushes coalesce.
  const scheduleLiveTranslate = useCallback((source: string) => {
    if (!liveTranslateRef.current) return;
    if (source.slice(liveTranslatedLenRef.current).trim().length === 0) return;
    if (liveTranslateTimerRef.current) window.clearTimeout(liveTranslateTimerRef.current);
    liveTranslateTimerRef.current = window.setTimeout(() => {
      liveTranslateTimerRef.current = null;
      doLiveTranslate(source);
    }, 800);
  }, [doLiveTranslate]);

  // Translate immediately (used on stop — the transcript is settled).
  const flushLiveTranslate = useCallback((source: string) => {
    if (!liveTranslateRef.current) return;
    if (liveTranslateTimerRef.current) {
      window.clearTimeout(liveTranslateTimerRef.current);
      liveTranslateTimerRef.current = null;
    }
    doLiveTranslate(source);
  }, [doLiveTranslate]);

  const handleInterim = useCallback((text: string, words: TranscriptWord[]) => {
    setTranscript(text);
    setLiveWords(words);
    // Real-time translation fires only at sentence boundaries (every word in
    // the frame is final) — the settled text grew, so translate the delta.
    if (words.length && words.every((w) => w.isFinal)) scheduleLiveTranslate(text);
  }, [scheduleLiveTranslate]);

  const handleFinal = useCallback((text: string, words: TranscriptWord[]) => {
    setTranscript(text);
    setLiveWords(words);
    // Real-time translation: flush any untranslated tail after stopping.
    flushLiveTranslate(text);
  }, [flushLiveTranslate]);

  const handleMicError = useCallback((message: string) => {
    setMicError(message);
  }, []);

  const {
    listening,
    start: startLive,
    stop: stopLive,
    cancel: cancelLive,
  } = useLiveVoice({
    onInterim: handleInterim,
    onFinal: handleFinal,
    onError: handleMicError,
    onStream: handleStream,
  });

  const cleanup = () => {
    try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
    mediaRecorderRef.current = null;
    stopLiveWave();
    stopPlaybackWave();
    if (liveRecUrlRef.current) { URL.revokeObjectURL(liveRecUrlRef.current); liveRecUrlRef.current = null; }
    if (uploadUrlRef.current) { URL.revokeObjectURL(uploadUrlRef.current); uploadUrlRef.current = null; }
    setLiveRecUrl(null);
    setUploadUrl(null);
    setSpeaking(false);
  };
  // Leaving the page also tears down the hook's socket, mic and PCM context.
  useEffect(() => () => { cleanup(); cancelLive(); }, [cancelLive]);

  // Stop the waveform (and the recording tap) whenever listening ends —
  // including unexpected socket drops, which the hook surfaces via onError.
  useEffect(() => {
    if (!listening) stopLiveWave();
  }, [listening, stopLiveWave]);

  // Real recording duration while the mic is live.
  useEffect(() => {
    if (!listening) return;
    startTimeRef.current = Date.now();
    const t = window.setInterval(() => setDuration(Date.now() - startTimeRef.current), 500);
    return () => window.clearInterval(t);
  }, [listening]);

  const refreshHistory = useCallback(async () => {
    try {
      const list = await voiceService.getSessions();
      setSessions(list);
      setHistoryError("");
    } catch {
      setHistoryError("Couldn't load your voice history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Deep link from global search: /voice?session=<id> expands that history
  // session once the list loads.
  useEffect(() => {
    const sessionId = searchParams.get("session");
    if (sessionId && sessions.length && !expandedSession) {
      if (sessions.some((s) => s.id === sessionId)) setExpandedSession(sessionId);
      setSearchParams({}, { replace: true });
    }
  }, [sessions, searchParams]);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  // Load TTS voices, languages, edge voices + restore saved preferences.
  useEffect(() => {
    voiceService.getVoices().then((list) => {
      if (!Array.isArray(list) || !list.length) return;
      setVoices(list);
      const saved = localStorage.getItem("nexusai-voice");
      if (saved && list.some((v) => v.id === saved)) setVoice(saved);
    }).catch(() => { /* keep the default voice */ });
    try {
      window.speechSynthesis?.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    } catch { /* speech not available */ }
    voiceService.getEdgeVoices().then((list) => {
      if (Array.isArray(list) && list.length) setEdgeVoices(list);
    }).catch(() => { /* English-only mode */ });
  }, []);

  // Restore saved speech/reply languages once the catalog loads — only when
  // the saved code is still offered by the backend.
  useEffect(() => {
    if (!languages.length) return;
    const savedSpeech = readSavedLanguage("nexusai-speech-lang", "", languages);
    if (savedSpeech) setSpeechLang(savedSpeech);
    const savedReply = readSavedLanguage("nexusai-reply-lang", "", languages);
    if (savedReply) setReplyLang(savedReply);
  }, [languages]);

  // Load chat models for the translate & speak / analysis picker and
  // preselect the user's default (falls back to Auto).
  useEffect(() => {
    chatService
      .getModels()
      .then(({ data }) => {
        if (!Array.isArray(data) || !data.length) return;
        setChatModels(data);
        const pref = getDefaultChatModel();
        if (pref !== "auto" && data.some((m) => m.id === pref)) setChatModel(pref);
      })
      .catch(() => { /* keep Auto — the backend still routes best-for-task */ });
  }, []);

  // Keep the chosen Edge voice valid for the current reply language.
  useEffect(() => {
    if (replyLang === "en") return;
    const forLang = edgeVoices.filter((v) => v.language === replyLang);
    if (!forLang.length) { setEdgeVoice(""); return; }
    const saved = localStorage.getItem(`nexusai-edge-voice-${replyLang}`);
    const match = saved ? forLang.find((v) => v.id === saved) : undefined;
    setEdgeVoice(match ? match.id : forLang[0].id);
  }, [replyLang, edgeVoices]);

  const changeVoice = (id: string) => { setVoice(id); try { localStorage.setItem("nexusai-voice", id); } catch { /* ignore */ } };
  const changeEdgeVoice = (id: string) => { setEdgeVoice(id); try { localStorage.setItem(`nexusai-edge-voice-${replyLang}`, id); } catch { /* ignore */ } };
  const changeSpeechLang = (code: string) => { setSpeechLang(code); saveLanguage("nexusai-speech-lang", code); };
  const changeReplyLang = (code: string) => { setReplyLang(code); saveLanguage("nexusai-reply-lang", code); };

  const startListening = () => {
    cleanup();
    setMicError("");
    setLiveWords([]);
    setTranscript("");
    setDuration(0);
    if (liveTranslateTimerRef.current) { window.clearTimeout(liveTranslateTimerRef.current); liveTranslateTimerRef.current = null; }
    liveTranslatedLenRef.current = 0;
    setLiveTranslation("");
    setLiveTranslateError("");
    // The hook handles the mic, the WebSocket, and PCM streaming; it reports
    // live text + words through onInterim and the flushed final via onFinal.
    startLive(speechLang);
  };

  const stopListening = () => {
    // Stop the local recording first so its blob finalizes while the mic is
    // still live, then let the hook flush Deepgram's final transcript.
    try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
    mediaRecorderRef.current = null;
    stopLive();
  };

  const speakWithBrowser = (text: string, langCode: string) => {
    try {
      const bcp = languages.find((l) => l.code === langCode)?.bcp47 || langCode;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = bcp;
      const base = bcp.split("-")[0].toLowerCase();
      const matches = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(base));
      if (matches.length) utterance.voice = matches[matches.length - 1];
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch { /* speech not available */ }
  };

  const fallbackSpeak = (text: string) => speakWithBrowser(text, replyLang === "en" ? "en" : replyLang);

  // Speak a reply through the backend (aura-2 for English, Edge for others);
  // real audio from /voice/speak, with a real waveform while it plays.
  const speak = async (text: string) => {
    try {
      const audioBlob = await voiceService.speak(text, replyLang === "en" ? voice : edgeVoice, replyLang);
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); stopPlaybackWave(); setSpeaking(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); stopPlaybackWave(); setSpeaking(false); fallbackSpeak(text); };
      audio.play().then(() => setSpeaking(true)).catch(() => { URL.revokeObjectURL(url); stopPlaybackWave(); setSpeaking(false); fallbackSpeak(text); });
      // Live waveform from the actual synthesized audio.
      try {
        stopPlaybackWave();
        const ctx = new AudioContext();
        const src = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.8;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        playCtxRef.current = ctx;
        playSourceRef.current = src;
        playAnalyserRef.current = analyser;
        const loop = () => {
          drawWave(playCanvasRef.current, playAnalyserRef.current, "rgb(52, 211, 153)");
          playRafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch { /* waveform is optional */ }
    } catch {
      fallbackSpeak(text);
    }
  };

  // Translate the current message via the existing chat API (real reply).
  const handleSend = async (textArg?: string) => {
    const text = (textArg ?? transcript).trim();
    if (!text || loading) return;
    setLoading(true);
    try {
      const replyLangName = languageName(languages, replyLang);
      const response = await chatService.streamChat(text, undefined, resolveModel(chatModel, text), replyLangName, replyLang);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) reply += data.content;
            } catch { /* skip partial frames */ }
          }
        }
      }
      if (!reply) reply = "(no reply)";
      setEntries((prev) => [{
        id: Date.now().toString(),
        transcript: text,
        reply,
        sourceLang: speechLang,
        targetLang: replyLang,
        ts: Date.now(),
      }, ...prev]);
      setTranscript("");
      setFileInfo(null);
      // Persist the session so history follows the user across devices.
      try {
        const session = await voiceService.createSession({
          transcript: text,
          translation: reply,
          sourceLang: speechLang,
          targetLang: replyLang,
        });
        lastSessionRef.current = { transcript: text, id: session.id };
        refreshHistory();
      } catch (err) {
        console.warn("Voice session save failed:", err);
      }
      if (speakReplies && reply) speak(reply);
    } catch (error) {
      console.error("Voice chat error:", error);
      setUploadError("Could not get a reply — try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploadError("");
    setUploading(true);
    setFileInfo({ name: file.name, size: file.size });
    try {
      if (file.size > MAX_UPLOAD_BYTES) {
        setUploadError("File is too large — the backend accepts up to 25MB of audio.");
        return;
      }
      const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
      const mime = file.type || AUDIO_MIME[ext] || "audio/webm";
      const result = await voiceService.transcribeWithWords(new Blob([file], { type: mime }), speechLang === "en" ? undefined : speechLang);
      if (!result.transcript) {
        setUploadError("No speech detected in this audio — try a different file.");
        return;
      }
      setTranscript(result.transcript);
      setUploadWords(result.words.map((w) => ({ word: w.word, start: w.start, end: w.end, isFinal: true })));
      if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current);
      const url = URL.createObjectURL(file);
      uploadUrlRef.current = url;
      setUploadUrl(url);
    } catch (err: any) {
      const msg = err?.response?.data?.error;
      setUploadError(typeof msg === "string" && msg ? msg : "Unable to process this audio. Try again.");
      console.error("Upload transcribe failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!AUDIO_EXTENSIONS.test(file.name)) {
        setUploadError("Unsupported audio type — use MP3, WAV, M4A, WEBM, OGG, FLAC, AAC or OPUS.");
        return;
      }
      handleUpload(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!AUDIO_EXTENSIONS.test(file.name)) {
        setUploadError("Unsupported audio type — use MP3, WAV, M4A, WEBM, OGG, FLAC, AAC or OPUS.");
        e.target.value = "";
        return;
      }
      handleUpload(file);
    }
    e.target.value = "";
  };

  // Analyze the current transcript via the existing chat API — real summary,
  // key points and action items (same streaming path as the File Analyzer).
  const handleAnalyze = async () => {
    const text = transcript.trim();
    if (!text || analyzing) return;
    setAnalyzing(true);
    setAnalysis("");
    setAnalysisSource(text);
    setAnalysisError("");
    const prompt =
      `Analyze the following audio transcript and provide:\n\n` +
      `## Summary\n(2-3 sentences capturing the essence)\n\n` +
      `## Key Points\n- (the most important points)\n\n` +
      `## Action Items\n- (anything that needs doing, if any)\n\n` +
      `Transcript:\n"${text.slice(0, 8000)}"`;
    let reply = "";
    try {
      const response = await chatService.streamChat(prompt, undefined, resolveModel(chatModel, prompt));
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
        for (const line of chunk.split("\n\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) throw new Error(typeof data.error === "string" ? data.error : "Analysis failed");
            if (data.content) {
              reply += data.content;
              setAnalysis(reply);
            }
          } catch { /* skip partial frames */ }
        }
      }
      if (!reply) setAnalysisError("The model returned an empty analysis — try again.");
      // Persist the analysis onto its session (created by the translation, or
      // create a session when only the analysis was run).
      try {
        const match = lastSessionRef.current?.transcript === text ? lastSessionRef.current : null;
        if (match) {
          await voiceService.updateSession(match.id, { analysis: reply });
        } else {
          await voiceService.createSession({
            transcript: text,
            analysis: reply,
            sourceLang: speechLang,
            targetLang: replyLang,
          });
        }
        refreshHistory();
      } catch (err) {
        console.warn("Voice analysis save failed:", err);
      }
    } catch (err: any) {
      setAnalysisError(err?.message || "Could not analyze this audio — try again.");
      console.error("Audio analysis failed:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const copyEntry = async (entry: VoiceEntry) => {
    try {
      await navigator.clipboard.writeText(`🗣 ${entry.transcript}\n\n🌐 ${entry.reply}`);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard unavailable */ }
  };

  // Download the real synthesized audio (mp3 from /voice/speak) for a reply.
  const downloadAudio = async (text: string) => {
    try {
      const blob = await voiceService.speak(text, replyLang === "en" ? voice : edgeVoice, replyLang);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexusai-voice-${new Date().toISOString().slice(0, 10)}.mp3`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch { /* download is optional */ }
  };

  const downloadEntry = (entry: VoiceEntry) => {
    const sourceName = languageName(languages, entry.sourceLang);
    const targetName = languageName(languages, entry.targetLang);
    const body = `NexusAI Voice Studio\n${new Date(entry.ts).toLocaleString()}\n\n[${sourceName}]\n${entry.transcript}\n\n[${targetName} — translation]\n${entry.reply}\n`;
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexusai-voice-${new Date(entry.ts).toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleEntries = entries.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return e.transcript.toLowerCase().includes(q) || e.reply.toLowerCase().includes(q);
  });

  // Real studio state — each label maps to an actual in-flight operation.
  const statusLabel = listening ? "Listening" : uploading ? "Transcribing" : loading ? "Translating" : analyzing ? "Analyzing" : speaking ? "Speaking" : "Idle";
  const statusSub = listening
    ? "live transcription running"
    : uploading
      ? "processing your audio"
      : loading
        ? "AI reply in progress"
        : analyzing
          ? "extracting insights"
          : speaking
            ? "playing audio reply"
            : "ready when you are";
  const statusDot = listening ? "bg-red-500" : speaking ? "bg-emerald-500" : "bg-primary";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        icon={AudioLines}
        title="AI Voice Studio"
        description="Speak, transcribe, translate and understand audio with NexusAI — real Deepgram STT and spoken replies."
      />

      {!supported ? (
        <EmptyState
          icon={MicOff}
          title="Microphone recording isn't supported in this browser"
          description="Try Chrome or Edge for voice input — audio file upload still works."
        />
      ) : (
        <>
          {/* Mode switch: live mic / upload */}
          <div className="mb-5 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
            <button
              onClick={() => setMode("live")}
              aria-pressed={mode === "live"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                mode === "live" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Mic className="h-3.5 w-3.5" /> Live mic
            </button>
            <button
              onClick={() => setMode("upload")}
              aria-pressed={mode === "upload"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                mode === "upload" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Upload className="h-3.5 w-3.5" /> Upload audio
            </button>
          </div>

          {/* Real studio state — one pill, every label tied to real work */}
          <div role="status" className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-border bg-muted/40 px-3.5 py-1.5 text-xs">
            <span className={cn("h-2 w-2 rounded-full", statusDot, (listening || speaking) && "animate-pulse")} />
            <span className="font-medium">{statusLabel}</span>
            <span className="text-muted-foreground">· {statusSub}</span>
          </div>

          {mode === "live" ? (
            <motion.div key="live" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="card-surface p-6 text-center sm:p-8">
              {/* 3D audio orb — pulses with the REAL mic level from the
                  AnalyserNode; warm/red while recording. */}
              <div className="relative">
                <VoiceOrb analyser={analyserRef.current} active={listening} size={224}>
                  <button
                    onClick={listening ? stopListening : startListening}
                    className={cn(
                      "relative flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300",
                      listening
                        ? "bg-red-500/20 text-red-400 ring-4 ring-red-500/25"
                        : "bg-gradient-to-br from-primary/25 to-primary/10 text-primary ring-1 ring-primary/40 hover:bg-primary/30"
                    )}
                    aria-label={listening ? "Stop listening" : "Start listening"}
                  >
                    {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/25" />}
                    {listening ? <MicOff className="relative h-8 w-8" /> : <Mic className="relative h-8 w-8" />}
                  </button>
                </VoiceOrb>
                {/* Active speech language — the last choice is remembered per
                    browser and visible at a glance (red-tinted while recording). */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute bottom-1.5 left-1/2 z-20 -translate-x-1/2 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide",
                    listening
                      ? "border-red-500/40 bg-red-950/90 text-red-300"
                      : "border-border bg-background/90 text-muted-foreground"
                  )}
                >
                  {speechLang.toUpperCase()}
                </span>
              </div>

              <p className={cn("mt-4 font-medium", listening ? "text-red-500" : "text-foreground")}>
                {listening ? `Listening ${formatDuration(duration)} · tap to stop` : "Tap the mic and start talking"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {listening ? "The orb pulses with your real voice level — words appear live below" : "Speak in any supported language — replies can be translated"}
              </p>

              {/* Real waveform from the live mic stream */}
              <canvas ref={waveCanvasRef} className={cn("mt-4 h-16 w-full rounded-xl border transition-colors", listening ? "border-red-500/20 bg-red-500/5" : "border-border bg-muted/30")} aria-hidden />

              {micError && (
                <p className="mx-auto mt-4 max-w-md rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-sm text-destructive">{micError}</p>
              )}

              {/* Live transcript — word tokens with real Deepgram timestamps.
                  While listening the current word highlights; after stopping the
                  recording plays back and any word can be clicked to jump to it. */}
              <div className="mt-5 text-left">
                <SeekableTranscript
                  words={liveWords}
                  audioUrl={liveRecUrl}
                  liveMs={listening ? duration : null}
                  placeholder={listening ? "Your words will appear here as you speak…" : "Your words will appear here…"}
                  className={cn(
                    "transition-colors",
                    listening ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/40"
                  )}
                />
                {liveRecUrl && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground/70">
                    Recording saved — press play, or click any word in the transcript to jump to that moment.
                  </p>
                )}
                <TranscriptActions
                  transcript={transcript}
                  words={liveWords}
                  sourceLang={speechLang}
                  targetLang={replyLang}
                  sourceName={languageName(languages, speechLang)}
                  targetName={languageName(languages, replyLang)}
                />
              </div>

              {/* Real-time translation — original | translation as you speak.
                  Each finished sentence is translated through the real chat
                  API into the reply language (target above). */}
              {liveTranslate && (transcript.trim() || liveTranslation || liveTranslating) && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                  <div className="grid gap-px bg-border sm:grid-cols-2">
                    <div className="bg-card p-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Original · {languageName(languages, speechLang)}
                      </p>
                      <p className="text-sm leading-relaxed">{transcript || "…"}</p>
                    </div>
                    <div className="bg-card p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Translation · {languageName(languages, replyLang)}
                        </p>
                        {liveTranslating && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
                      </div>
                      {liveTranslation ? (
                        <p className="text-sm leading-relaxed">{liveTranslation}</p>
                      ) : liveTranslating ? (
                        <p className="text-sm text-muted-foreground">Translating your words…</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Your translation will appear here as you finish sentences…</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
              {liveTranslateError && (
                <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-sm text-destructive">{liveTranslateError}</p>
              )}

              {/* Controls */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Button onClick={() => handleSend()} disabled={!transcript.trim() || loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  {loading ? "Translating…" : "Translate & speak"}
                </Button>
                <Button variant="outline" onClick={handleAnalyze} disabled={!transcript.trim() || analyzing || loading}>
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                  {analyzing ? "Analyzing…" : "Analyze"}
                </Button>
                <button
                  onClick={() => setSpeakReplies(!speakReplies)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    speakReplies ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground"
                  )}
                >
                  {speakReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  Spoken replies
                </button>
                <button
                  onClick={() => setLiveTranslate(!liveTranslate)}
                  disabled={speechLang === replyLang}
                  aria-pressed={liveTranslate}
                  title={speechLang === replyLang ? "Pick a different reply language to enable live translation" : "Translate each finished sentence into the reply language while you speak"}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    liveTranslate ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground"
                  )}
                >
                  <Languages className="h-4 w-4" />
                  Live translate
                </button>
              </div>

              {/* Pickers */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                {chatModels.length > 0 && (
                  <Select
                    value={chatModel}
                    onChange={setChatModel}
                    options={[
                      { value: "auto", label: "Auto — best for task" },
                      ...chatModels.map((m) => ({ value: m.id, label: m.name })),
                    ]}
                    searchable
                    ariaLabel="Chat model for translation"
                    leadingIcon={<Cpu className="h-4 w-4 shrink-0" />}
                  />
                )}
                {voices.length > 1 && replyLang === "en" && (
                  <Select
                    value={voice}
                    onChange={changeVoice}
                    options={voices.map((v) => ({ value: v.id, label: `${v.name} — ${v.language}` }))}
                    ariaLabel="Spoken voice"
                    leadingIcon={<Volume2 className="h-4 w-4 shrink-0" />}
                  />
                )}
                {replyLang !== "en" && edgeVoices.some((v) => v.language === replyLang) && (
                  <Select
                    value={edgeVoice}
                    onChange={changeEdgeVoice}
                    options={edgeVoices.filter((v) => v.language === replyLang).map((v) => ({ value: v.id, label: `${v.name} — ${v.gender}` }))}
                    ariaLabel="Spoken voice"
                    leadingIcon={<Volume2 className="h-4 w-4 shrink-0" />}
                  />
                )}
                {languages.length > 1 && (
                  <>
                    <Select
                      value={speechLang}
                      onChange={changeSpeechLang}
                      options={languages.map((l) => ({ value: l.code, label: l.name }))}
                      searchable
                      ariaLabel="You speak"
                      leadingIcon={<Languages className="h-4 w-4 shrink-0" />}
                    />
                    {/* Language connection — source ⇄ target with a ✦ that
                        pulses while a real translation is in flight. */}
                    <div aria-hidden className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1.5">
                      <span className="text-[10px] font-bold tracking-wide text-muted-foreground">{speechLang.toUpperCase()}</span>
                      <motion.span
                        animate={loading || liveTranslating ? { scale: [1, 1.35, 1], opacity: [0.6, 1, 0.6] } : { scale: 1, opacity: 0.7 }}
                        transition={loading || liveTranslating ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                        className={cn("text-xs leading-none", loading || liveTranslating ? "text-primary" : "text-muted-foreground")}
                      >
                        ✦
                      </motion.span>
                      <span className="text-[10px] font-bold tracking-wide text-muted-foreground">{replyLang.toUpperCase()}</span>
                    </div>
                    <Select
                      value={replyLang}
                      onChange={changeReplyLang}
                      options={languages.map((l) => ({ value: l.code, label: l.name }))}
                      searchable
                      ariaLabel="AI replies in"
                      leadingIcon={<Globe className="h-4 w-4 shrink-0" />}
                    />
                  </>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="upload" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="card-surface p-6 sm:p-8">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all",
                  dragActive ? "border-primary bg-primary/8" : "border-border hover:border-primary/50 hover:bg-card/60"
                )}
              >
                <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.flac,.aac,.opus" onChange={handleFileSelect} className="hidden" />
                {uploading ? (
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Transcribing audio…</p>
                  </div>
                ) : (
                  <>
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20">
                      <FileAudio className="h-6 w-6" strokeWidth={1.6} />
                    </div>
                    <p className="text-base font-semibold">{fileInfo ? `Selected: ${fileInfo.name}` : "Drop an audio file here, or click to browse"}</p>
                    {fileInfo && <p className="mt-1 text-xs text-muted-foreground">{formatBytes(fileInfo.size)} — transcribed automatically</p>}
                    <p className="mt-2 text-xs text-muted-foreground">MP3 · WAV · M4A · WEBM · OGG · FLAC · AAC · OPUS — up to 25MB</p>
                  </>
                )}
              </div>

              {uploadError && (
                <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-sm text-destructive">{uploadError}</p>
              )}

              {/* Transcribed result from the uploaded file — word tokens with
                  timestamps; play the file or click any word to jump to it. */}
              <div className="mt-5 text-left">
                <SeekableTranscript
                  words={uploadWords}
                  audioUrl={uploadUrl}
                  placeholder="The transcript of your file will appear here…"
                />
                <TranscriptActions
                  transcript={transcript}
                  words={uploadWords}
                  sourceLang={speechLang}
                  targetLang={replyLang}
                  sourceName={languageName(languages, speechLang)}
                  targetName={languageName(languages, replyLang)}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                {chatModels.length > 0 && (
                  <Select
                    value={chatModel}
                    onChange={setChatModel}
                    options={[
                      { value: "auto", label: "Auto — best for task" },
                      ...chatModels.map((m) => ({ value: m.id, label: m.name })),
                    ]}
                    searchable
                    ariaLabel="Chat model for translation"
                    leadingIcon={<Cpu className="h-4 w-4 shrink-0" />}
                  />
                )}
                <Select
                  value={speechLang}
                  onChange={changeSpeechLang}
                  options={languages.length ? languages.map((l) => ({ value: l.code, label: l.name })) : [{ value: "en", label: "English" }]}
                  searchable
                  ariaLabel="Audio language"
                  leadingIcon={<Languages className="h-4 w-4 shrink-0" />}
                />
                <Button onClick={() => handleSend()} disabled={!transcript.trim() || loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  {loading ? "Translating…" : "Translate & speak"}
                </Button>
                <Button variant="outline" onClick={handleAnalyze} disabled={!transcript.trim() || analyzing || loading}>
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                  {analyzing ? "Analyzing…" : "Analyze"}
                </Button>
              </div>

              {/* Playback waveform (real audio from /voice/speak) */}
              <canvas ref={playCanvasRef} className="mt-4 h-12 w-full rounded-xl border border-border bg-muted/30" aria-hidden />
              <p className="mt-1 text-center text-[10px] text-muted-foreground/70">Real audio waveform — appears while a reply plays</p>
            </motion.div>
          )}

          {/* Audio analysis — real AI reply via the existing chat API */}
          {(analysis || analysisError || analyzing) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <FileText className="h-4 w-4 text-primary" />
                  Audio Analysis
                  {analyzing && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                </h2>
                <button
                  onClick={() => { setAnalysis(""); setAnalysisError(""); setAnalysisSource(""); }}
                  aria-label="Clear analysis"
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4 p-5">
                {analysisSource && !analyzing && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Analyzed transcript</p>
                    <p className="rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground">{analysisSource}</p>
                  </div>
                )}
                {analysisError && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-sm text-destructive">{analysisError}</p>
                )}
                {analyzing && !analysis && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Analyzing audio… extracting summary, key points and action items.
                  </p>
                )}
                {analysis && (
                  <ChatMessage
                    message={{ id: "audio-analysis", content: analysis, role: "assistant", createdAt: new Date().toISOString() }}
                    replayLang="en"
                  />
                )}
              </div>
            </motion.div>
          )}

          {/* Result log: original + translation */}
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <Sparkles className="h-4 w-4 text-primary" />
                Translations
                {entries.length > 0 && <span className="font-normal text-muted-foreground">({visibleEntries.length})</span>}
              </h2>
              {entries.length > 1 && (
                <div className="relative min-w-0 max-w-[180px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search…"
                    aria-label="Search translations"
                    className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                  />
                </div>
              )}
            </div>

            {visibleEntries.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                {entries.length === 0
                  ? "Your translated conversations will appear here — each one is a real AI reply."
                  : "No matches for your search."}
              </div>
            ) : (
              <AnimatePresence>
                {visibleEntries.map((entry) => {
                  const sourceName = languageName(languages, entry.sourceLang);
                  const targetName = languageName(languages, entry.targetLang);
                  return (
                    <motion.div key={entry.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                      <div className="grid gap-px bg-border sm:grid-cols-2">
                        <div className="bg-card p-4">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <Badge variant="default" className="shrink-0"><Languages className="h-3 w-3" /> {sourceName}</Badge>
                            <span className="text-[10px] text-muted-foreground">{new Date(entry.ts).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-sm">{entry.transcript}</p>
                        </div>
                        <div className="bg-card p-4">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <Badge variant="info" className="shrink-0"><Globe className="h-3 w-3" /> {targetName}</Badge>
                            <div className="flex items-center gap-1">
                              <button onClick={() => speak(entry.reply)} aria-label="Play translation" title="Play translation" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                                <Play className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => downloadAudio(entry.reply)} aria-label="Download audio" title="Download MP3 audio" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                                <FileDown className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => copyEntry(entry)} aria-label="Copy" title="Copy" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                                {copiedId === entry.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                              <button onClick={() => downloadEntry(entry)} aria-label="Download TXT" title="Download TXT" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm">{entry.reply}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Voice History — real persisted sessions from the database */}
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <History className="h-4 w-4 text-primary" />
                Voice History
                {!historyLoading && !historyError && sessions.length > 0 && (
                  <span className="font-normal text-muted-foreground">({sessions.length})</span>
                )}
              </h2>
              <button
                onClick={() => { setHistoryLoading(true); refreshHistory(); }}
                aria-label="Refresh voice history"
                title="Refresh"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", historyLoading && "animate-spin")} />
              </button>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-8 text-sm text-muted-foreground shadow-card">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Loading your voice history…
              </div>
            ) : historyError ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-8 text-sm text-destructive shadow-card">
                <p>{historyError}</p>
                <Button variant="outline" size="sm" onClick={() => { setHistoryLoading(true); refreshHistory(); }}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 py-8 text-sm text-muted-foreground shadow-card">
                <History className="h-4 w-4 text-primary" />
                No voice sessions yet — translate or analyze something and it will be saved here across devices.
              </div>
            ) : (
              <div className="space-y-2.5">
                {sessions.map((session) => {
                  const sourceName = languageName(languages, session.sourceLang);
                  const targetName = languageName(languages, session.targetLang);
                  const expanded = expandedSession === session.id;
                  const hasContent = !!(session.translation || session.analysis);
                  return (
                    <div key={session.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                      <button
                        onClick={() => setExpandedSession(expanded ? null : session.id)}
                        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                        aria-expanded={expanded}
                      >
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="default" className="shrink-0"><Languages className="h-3 w-3" /> {sourceName}</Badge>
                            {session.translation && <Badge variant="info" className="shrink-0"><Globe className="h-3 w-3" /> {targetName}</Badge>}
                            {session.analysis && <Badge variant="outline" className="shrink-0"><FileText className="h-3 w-3" /> Analysis</Badge>}
                          </div>
                          <p className="line-clamp-2 text-sm text-foreground">{session.transcript}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{new Date(session.createdAt).toLocaleDateString()}</span>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                        </div>
                      </button>

                      {expanded && (
                        <div className="space-y-3 border-t border-border px-4 py-3.5">
                          {session.translation && (
                            <div>
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Translation · {targetName}</p>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => speak(session.translation || "")} aria-label="Play translation" title="Play translation" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                                    <Play className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(session.translation || "");
                                      } catch { /* clipboard unavailable */ }
                                    }}
                                    aria-label="Copy translation"
                                    title="Copy translation"
                                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm">{session.translation}</p>
                            </div>
                          )}
                          {session.analysis && (
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Analysis</p>
                              <ChatMessage
                                message={{ id: `analysis-${session.id}`, content: session.analysis, role: "assistant", createdAt: session.createdAt }}
                                replayLang="en"
                              />
                            </div>
                          )}
                          {!hasContent && (
                            <p className="text-xs text-muted-foreground">No translation or analysis saved for this session.</p>
                          )}
                          <button
                            onClick={async () => {
                              try {
                                await voiceService.deleteSession(session.id);
                                refreshHistory();
                              } catch {
                                setHistoryError("Could not delete that session — try again.");
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/25 bg-destructive/8 px-2.5 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/15"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-card">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Each translation and analysis is a real AI reply through the existing chat API — sessions are saved to your account and follow
              you across devices. The in-session log above shows what you've done this visit.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
