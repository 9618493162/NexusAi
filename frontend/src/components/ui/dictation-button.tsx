import { useCallback, useEffect, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { useLiveVoice } from "@/hooks/useLiveVoice";
import { cn } from "@/utils/cn";

interface DictationButtonProps {
  /** Current value of the field dictation fills (base text is captured on start). */
  value: string;
  /** Called with the live text (base + interim, then the final transcript on stop). */
  onChange: (value: string) => void;
  /** Optional speech-recognition language code (defaults to the backend default). */
  language?: string;
  disabled?: boolean;
  /** Surfaces mic/transcription errors to the parent (e.g. its error area). */
  onError?: (message: string) => void;
  className?: string;
}

/**
 * Small inline mic widget for hands-free dictation into a text field, powered
 * by the shared useLiveVoice pipeline (WebSocket → backend → Deepgram). Interim
 * words fill the field live as you speak; stopping commits the final
 * transcript. Tap to start, tap again to stop.
 */
export function DictationButton({ value, onChange, language, disabled, onError, className }: DictationButtonProps) {
  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== "undefined" &&
    typeof WebSocket !== "undefined";
  // Text already in the field when dictation starts — live text appends to it.
  const baseRef = useRef("");

  const handleInterim = useCallback((text: string) => {
    onChange(baseRef.current + text);
  }, [onChange]);

  const handleFinal = useCallback((text: string) => {
    onChange(baseRef.current + text);
  }, [onChange]);

  const handleError = useCallback((message: string) => {
    onError?.(message);
  }, [onError]);

  const { listening, start, stop, cancel } = useLiveVoice({
    onInterim: handleInterim,
    onFinal: handleFinal,
    onError: handleError,
  });

  // Tear down the socket + mic when the widget unmounts.
  useEffect(() => () => cancel(), [cancel]);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      stop();
      return;
    }
    baseRef.current = value;
    start(language);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={listening ? "Stop dictation" : "Dictate the prompt"}
      aria-label={listening ? "Stop dictation" : "Dictate the prompt"}
      aria-pressed={listening}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
        listening
          ? "border-red-500/40 bg-red-500/10 text-red-500"
          : "border-border bg-card text-muted-foreground shadow-sm hover:text-foreground",
        className
      )}
    >
      {listening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
      {listening ? "Listening" : "Dictate"}
    </button>
  );
}
