import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Mic, MicOff, Loader2, ArrowLeft, Sparkles, FileText, StickyNote, CheckSquare,
  Play, Square, Save, Globe,
} from "lucide-react";
import { useLiveVoice } from "@/hooks/useLiveVoice";
import { meetingsService, Meeting } from "@/services/meetings.service";
import { chatService } from "@/services/chat.service";
import { getDefaultChatModel } from "@/utils/aiPreferences";
import { recommendModel } from "@/utils/modelRecommendations";
import { loadLanguages, languageName, LanguageOption } from "@/utils/languageCatalog";
import { NexusCore } from "@/components/ui/nexus-core";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function MeetingRoom() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const reduced = useReducedMotion();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [languages, setLanguages] = useState<LanguageOption[]>([]);

  // Live state
  const [liveTranscript, setLiveTranscript] = useState("");
  const [settledTranscript, setSettledTranscript] = useState("");
  const [liveTranslation, setLiveTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);

  // Post-meeting state
  const [summarizing, setSummarizing] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  // Deep-link from the Dashboard's "Recent summary" card (?view=summary):
  // scroll the AI Summary card into view and briefly highlight it.
  const focusSummary = searchParams.get("view") === "summary";
  const [summaryHighlight, setSummaryHighlight] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const liveTranslatedLenRef = useRef(0);
  const translateInFlightRef = useRef(false);
  const settledRef = useRef("");
  const modelRef = useRef<string>(getDefaultChatModel());
  const [lastWordEnd, setLastWordEnd] = useState(0);

  const load = useCallback(async () => {
    try {
      const { data } = await meetingsService.get(id);
      setMeeting(data.meeting);
      setNotes(data.meeting.notes || "");
      if (data.meeting.status === "live") {
        startedAtRef.current = data.meeting.startedAt ? new Date(data.meeting.startedAt).getTime() : Date.now();
        setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Meeting not found.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadLanguages().then(setLanguages).catch(() => {}); }, []);

  const isLive = meeting?.status === "live";

  // Elapsed timer — real wall-clock time since the meeting started.
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [isLive]);

  // ── Live translation: translate only newly settled transcript, one real
  //    chat call per finished sentence (save=false — pure pass-through). ──
  const streamChatText = useCallback(async (text: string): Promise<string> => {
    const target = meeting?.targetLang || "te";
    const targetName = languageName(languages, target);
    const model = modelRef.current === "auto" ? recommendModel(text) : modelRef.current;
    const response = await chatService.streamChat(text, undefined, model, targetName, target, undefined, false);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let out = "";
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const d = JSON.parse(line.slice(6));
          if (d.content) out += d.content;
        } catch { /* skip partial */ }
      }
    }
    return out;
  }, [meeting?.targetLang, languages]);

  const translateDelta = useCallback(async (source: string) => {
    const delta = source.slice(liveTranslatedLenRef.current).trim();
    if (!delta || translateInFlightRef.current) return;
    translateInFlightRef.current = true;
    setTranslating(true);
    try {
      const translated = await streamChatText(delta);
      if (translated) {
        liveTranslatedLenRef.current = source.length;
        setLiveTranslation((prev) => (prev ? prev + " " : "") + translated.trim());
      }
    } catch {
      /* keep the last good translation; retry on the next final frame */
    } finally {
      translateInFlightRef.current = false;
      setTranslating(false);
    }
  }, [streamChatText]);

  const { listening, start, stop, cancel } = useLiveVoice({
    onInterim: (text) => setLiveTranscript(text),
    onFinal: (text, words) => {
      settledRef.current = text;
      setSettledTranscript(text);
      setLiveTranscript(text);
      // Real word timestamps can light up the speaker indicator — the final
      // words carry real start/end times from the speech engine.
      if (words.length) setLastWordEnd(words[words.length - 1].end);
      void translateDelta(text);
    },
    onError: (message) => setError(message),
    onStream: (stream) => {
      // Real mic stream → analyser for the waveform.
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch { /* waveform degrades gracefully */ }
    },
  });

  // ── Real waveform: analyser on the actual mic stream ─────────────────
  useEffect(() => {
    if (!listening) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const analyser = analyserRef.current;
      if (!analyser) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      ctx.strokeStyle = "rgb(124 58 237 / 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < w; i += 2) {
        const v = data[Math.floor((i / w) * data.length)];
        const y = (v / 255) * h;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();
    };
    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [listening]);

  const toggleListening = async () => {
    setError("");
    if (listening) {
      stop();
    } else {
      setLiveTranscript("");
      setLiveTranslation("");
      liveTranslatedLenRef.current = 0;
      setLastWordEnd(0);
      await start(meeting?.sourceLang || "en");
    }
  };

  // Persist the transcript periodically while live (every 6s, debounced) so
  // an accidental close never loses captured speech.
  useEffect(() => {
    if (!isLive || !settledTranscript) return;
    const t = setInterval(() => {
      void meetingsService.update(id, {
        transcript: settledTranscript,
        translation: liveTranslation || null,
        durationSec: Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)),
      }).catch(() => {});
    }, 6000);
    return () => clearInterval(t);
  }, [isLive, settledTranscript, liveTranslation, id]);

  const endMeeting = async () => {
    if (ending) return;
    setEnding(true);
    setError("");
    try {
      if (listening) stop();
      await meetingsService.update(id, {
        status: "ended",
        transcript: settledRef.current || settledTranscript,
        translation: liveTranslation || null,
        durationSec: Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)),
        endedAt: new Date().toISOString(),
      });
      // Real AI summary from the real transcript.
      await runSummary();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Couldn't end the meeting cleanly.");
    } finally {
      setEnding(false);
    }
  };

  const runSummary = async () => {
    setSummarizing(true);
    setError("");
    try {
      const response = await meetingsService.summarize(id);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("Summary stream unavailable");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.error) throw new Error(typeof d.error === "string" ? d.error : "Summary failed");
          } catch { /* ignore */ }
        }
      }
    } catch (err: any) {
      setError(err?.message || "Summary failed — you can retry from the meeting page.");
    } finally {
      setSummarizing(false);
      await load();
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      await meetingsService.update(id, { notes });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } catch {
      setError("Couldn't save notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  useEffect(() => () => { cancel(); }, [cancel]);

  // Honor ?view=summary: once the summary is loaded, land on it and flash a
  // highlight so the deep-link visibly arrives at the summary view.
  useEffect(() => {
    if (!focusSummary || !meeting?.summary) return;
    const t = setTimeout(() => {
      const el = document.getElementById("meeting-summary");
      el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      setSummaryHighlight(true);
      const clear = setTimeout(() => setSummaryHighlight(false), 2600);
      return () => clearTimeout(clear);
    }, 250);
    return () => clearTimeout(t);
  }, [focusSummary, meeting?.summary, reduced]);

  const transition = reduced ? { duration: 0 } : { duration: 0.25, ease: "easeOut" as const };

  if (loading) {
    return (
      <div className="relative min-h-full">
        <SpatialEnvironment />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <Skeleton className="h-8 w-64" />
          <div className="mt-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center px-4 text-center">
        <SpatialEnvironment />
        <p className="text-sm font-medium">{error || "Meeting not found"}</p>
        <Link to="/meetings" className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent">
          <ArrowLeft className="h-4 w-4" /> Back to meetings
        </Link>
      </div>
    );
  }

  const summary = meeting.summary || "";

  return (
    <div className="relative min-h-full">
      <SpatialEnvironment />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/meetings"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Back to meetings"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{meeting.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {meeting.sourceLang.toUpperCase()} → {meeting.targetLang.toUpperCase()} · {fmtDuration(meeting.durationSec)} captured
              {isLive && <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isLive && (
              <>
                <span className="rounded-xl border border-border bg-card/70 px-3 py-1.5 font-mono text-sm tabular-nums">{fmtClock(elapsed)}</span>
                <button
                  type="button"
                  onClick={endMeeting}
                  disabled={ending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 disabled:opacity-50"
                >
                  {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                  End meeting
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
            <span>{error}</span>
          </div>
        )}

        {/* ── LIVE ROOM ────────────────────────────────────────────────── */}
        {isLive && (
          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Self surface — real mic stream → real waveform */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="card-surface relative flex min-h-[260px] flex-col items-center justify-center p-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <NexusCore size={150} state={listening ? "thinking" : "idle"} />
                  <span className="absolute -bottom-1 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-card bg-gradient-to-br from-primary/80 to-indigo-500 text-[10px] font-bold text-primary-foreground">
                    {"Y"}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">You</p>
                  <p className="text-xs text-muted-foreground">
                    {listening ? "Listening — real-time transcription active" : "Tap the mic to start"}
                  </p>
                  {listening && lastWordEnd > 0 && (
                    <p className="mt-1 text-[11px] text-primary">Speaking…</p>
                  )}
                </div>
              </div>
              <canvas ref={canvasRef} className="mt-5 h-16 w-full max-w-sm" width={560} height={64} aria-label="Live microphone waveform" />
              <button
                type="button"
                onClick={toggleListening}
                className={cn(
                  "mt-5 inline-flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all",
                  listening ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary-hover"
                )}
                aria-label={listening ? "Stop listening" : "Start listening"}
              >
                {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            </motion.div>

            {/* Live transcript + translation */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : { delay: 0.08, ...transition }} className="card-surface flex min-h-[260px] flex-col p-5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <FileText className="h-4 w-4 text-primary" /> Live transcript
                </h2>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {translating && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                  {translating ? "Translating…" : meeting.targetLang.toUpperCase()}
                </span>
              </div>
              <div className="mt-3 grid flex-1 grid-rows-2 gap-3 overflow-hidden">
                <div className="overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {liveTranscript || <span className="text-muted-foreground/60">Transcript appears here as you speak — real speech-to-text.</span>}
                  </p>
                </div>
                <div className="overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Globe className="h-3 w-3" /> {languageName(languages, meeting.targetLang)}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {liveTranslation || <span className="text-muted-foreground/60">Translation appears after each finished sentence.</span>}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* ── ENDED: Meeting intelligence ──────────────────────────────── */}
        {!isLive && (
          <div className="mt-6 space-y-4">
            {!meeting.summary && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={transition} className="card-surface flex flex-wrap items-center gap-3 p-4">
                <Sparkles className="h-5 w-5 shrink-0 text-violet-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Meeting intelligence is ready</p>
                  <p className="text-xs text-muted-foreground">
                    Generate a real summary and action items from {meeting.transcript.trim() ? "the captured transcript" : "— no speech was captured, so the summary will note that"}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runSummary}
                  disabled={summarizing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {summarizing ? "Analyzing meeting…" : "Generate summary"}
                </button>
              </motion.div>
            )}

            {meeting.summary && (
              <div className="grid gap-4 lg:grid-cols-2">
                <motion.div
                  id="meeting-summary"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={transition}
                  className={cn("card-surface scroll-mt-24 p-5 transition-shadow duration-500", summaryHighlight && "ring-2 ring-primary/60 shadow-float")}
                >
                  <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                    <Sparkles className="h-4 w-4 text-violet-500" /> AI Summary
                  </h2>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
                  {meeting.actionItems && (
                    <div className="mt-5 rounded-xl border border-border/60 bg-muted/20 p-3.5">
                      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <CheckSquare className="h-3.5 w-3.5 text-emerald-500" /> Action items
                      </h3>
                      <ul className="space-y-1.5">
                        {meeting.actionItems.split("\n").filter(Boolean).map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : { delay: 0.06, ...transition }} className="card-surface p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                      <FileText className="h-4 w-4 text-primary" /> Transcript
                    </h2>
                    <span className="text-[11px] text-muted-foreground">{meeting.transcript.trim() ? `${meeting.transcript.trim().split(/\s+/).length} words` : "No speech captured"}</span>
                  </div>
                  <p className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {meeting.transcript.trim() || <span className="italic">No speech was captured in this meeting.</span>}
                  </p>
                  {meeting.translation && (
                    <>
                      <h3 className="mb-1.5 mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Globe className="h-3.5 w-3.5" /> Translation · {languageName(languages, meeting.targetLang)}
                      </h3>
                      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{meeting.translation}</p>
                    </>
                  )}
                </motion.div>
              </div>
            )}

            {/* Notes — real persistence */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : { delay: 0.1, ...transition }} className="card-surface p-5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <StickyNote className="h-4 w-4 text-amber-500" /> Meeting notes
                </h2>
                <div className="flex items-center gap-2">
                  {notesSaved && <span className="text-xs font-medium text-emerald-500">Saved ✓</span>}
                  <button
                    type="button"
                    onClick={saveNotes}
                    disabled={savingNotes}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                  >
                    {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save notes
                  </button>
                </div>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write notes about this meeting — they're saved to the meeting record…"
                aria-label="Meeting notes"
                rows={5}
                className="mt-3 w-full resize-y rounded-xl border border-border bg-muted/20 px-3.5 py-3 text-sm leading-relaxed outline-none transition-colors focus:border-primary/60"
              />
            </motion.div>

            {/* Recording (transcript) replay */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : { delay: 0.12, ...transition }} className="rounded-2xl border border-border/70 bg-card/50 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <Play className="h-4 w-4 text-muted-foreground" /> About this meeting
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Held {new Date(meeting.createdAt).toLocaleString()} · {fmtDuration(meeting.durationSec)} of real microphone capture ·{" "}
                {meeting.summary ? "AI summary generated" : "no summary yet"}. No audio/video recording is stored — NexusAI
                has no recording backend, so only the real transcript and AI output are kept.
              </p>
            </motion.div>
          </div>
        )}

        {/* ── Transcript timeline for ended meetings (real captured text) ── */}
        {!isLive && meeting.transcript.trim() && !meeting.summary && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={reduced ? { duration: 0 } : { delay: 0.08, ...transition }} className="card-surface mt-4 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <FileText className="h-4 w-4 text-primary" /> Transcript
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{meeting.transcript}</p>
            {meeting.translation && (
              <>
                <h3 className="mb-1.5 mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" /> Translation · {languageName(languages, meeting.targetLang)}
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{meeting.translation}</p>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
