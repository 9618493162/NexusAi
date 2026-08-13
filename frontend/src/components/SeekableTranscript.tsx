import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/utils/cn";

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  isFinal: boolean;
}

interface SeekableTranscriptProps {
  words: TranscriptWord[];
  /** Playable audio for seeking (recorded mic session or the uploaded file). */
  audioUrl?: string | null;
  /** While live-listening (no audio yet), drive the highlight from elapsed stream ms. */
  liveMs?: number | null;
  placeholder?: string;
  className?: string;
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Index of the last word whose start time is at or before t (karaoke cursor). */
function activeIndexFor(words: TranscriptWord[], t: number): number {
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= t) idx = i;
    else break;
  }
  return idx;
}

/**
 * Word-level transcript backed by Deepgram's real timestamps. Highlights the
 * word currently being spoken — from elapsed mic time while live-listening,
 * or from the audio's timeupdate while playing — and lets the user click any
 * word to jump the audio to that moment.
 */
export function SeekableTranscript({
  words,
  audioUrl,
  liveMs,
  placeholder = "Your words will appear here…",
  className,
}: SeekableTranscriptProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wordsRef = useRef(words);
  wordsRef.current = words;

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [active, setActive] = useState(-1);
  const [selected, setSelected] = useState(-1);

  const syncActive = (t: number) => {
    const idx = activeIndexFor(wordsRef.current, t);
    setActive(idx);
  };

  // Playback mode: the audio element's native events drive time + highlight.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audioUrl || !audio) {
      setPlaying(false);
      setTime(0);
      return;
    }
    const onMeta = () => setDuration(audio.duration || 0);
    const onTime = () => {
      setTime(audio.currentTime);
      syncActive(audio.currentTime);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

  // Live mode: highlight follows elapsed stream time (Deepgram word times are
  // relative to the start of the stream, matching the mic-open moment).
  useEffect(() => {
    if (audioUrl || liveMs == null) return;
    syncActive(liveMs / 1000);
  }, [liveMs, audioUrl]);

  // Keep the active word in view (karaoke follow).
  useEffect(() => {
    if (active < 0) return;
    containerRef.current
      ?.querySelector(`[data-widx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // Restart if the clip already finished, otherwise resume from the last
      // clicked word when it's still ahead of the cursor.
      if (audio.duration && audio.currentTime >= audio.duration - 0.1) {
        audio.currentTime = 0;
      } else if (selected >= 0 && audio.currentTime < wordsRef.current[selected]?.start) {
        audio.currentTime = Math.max(0, wordsRef.current[selected].start - 0.05);
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const seekTo = (i: number) => {
    setSelected(i);
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    audio.currentTime = Math.max(0, words[i].start - 0.05);
    audio.play().catch(() => {});
  };

  return (
    <div className={cn("rounded-xl border border-border bg-muted/40 p-3.5", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {audioUrl ? "Transcript · click a word to jump" : "Live transcript · per-word timestamps"}
        </p>
        {audioUrl && (
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              aria-label={playing ? "Pause transcript audio" : "Play transcript audio"}
              title={playing ? "Pause" : "Play"}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary transition-colors hover:bg-primary/25"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {fmtTime(time)} / {fmtTime(duration)}
            </span>
          </div>
        )}
      </div>
      <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" className="hidden" />
      {words.length === 0 ? (
        <p className="text-sm text-muted-foreground/70">{placeholder}</p>
      ) : (
        <div ref={containerRef} className="max-h-40 overflow-y-auto text-sm leading-relaxed">
          {words.map((w, i) => (
            <span
              key={i}
              data-widx={i}
              title={`${w.word} · ${w.start.toFixed(2)}s – ${w.end.toFixed(2)}s`}
              onClick={() => seekTo(i)}
              className={cn(
                "cursor-pointer rounded px-0.5 transition-colors duration-150",
                i === active
                  ? "bg-primary/30 text-foreground"
                  : i === selected
                    ? "ring-1 ring-primary/50 bg-primary/10 text-foreground"
                    : "text-foreground",
                !w.isFinal && "italic text-muted-foreground/75"
              )}
            >
              {w.word}{" "}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
