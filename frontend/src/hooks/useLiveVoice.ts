import { useCallback, useRef, useState } from "react";
import { getLiveSocketUrl } from "@/services/voice.service";

// A transcribed word with its real start/end times (seconds) and whether it
// came from a final Deepgram frame (interim words render dimmed in transcripts).
export interface LiveVoiceWord {
  word: string;
  start: number;
  end: number;
  isFinal: boolean;
}

interface UseLiveVoiceOptions {
  // Called on every live update with the running transcript (final so far +
  // current interim) and the matching word list — final words carry isFinal,
  // trailing interim words don't. Fires for both interim and final frames.
  onInterim?: (text: string, words: LiveVoiceWord[]) => void;
  // Called once after stop() with the complete final transcript + words.
  // Falls back to the last interim result if Deepgram never sent a final frame.
  onFinal?: (text: string, words: LiveVoiceWord[]) => void;
  // Called on permission denial, silent audio, or a dropped connection.
  onError?: (message: string) => void;
  // Called once the mic stream is granted (before the socket opens) so callers
  // can attach their own consumers — e.g. a MediaRecorder or an analyser.
  onStream?: (stream: MediaStream) => void;
}

/**
 * Live speech-to-text through the backend's WebSocket proxy
 * (/api/voice/live → Deepgram). Mic PCM is streamed up while the socket is
 * open; interim results (text + per-word timestamps) are reported via
 * onInterim as you talk, and stop() flushes the trailing final transcript
 * through onFinal. onStream hands the live mic stream to callers that need
 * their own consumers (recording, waveform). The Deepgram key never reaches
 * the browser.
 */
export function useLiveVoice({ onInterim, onFinal, onError, onStream }: UseLiveVoiceOptions) {
  const [listening, setListening] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const finalRef = useRef("");
  const finalWordsRef = useRef<LiveVoiceWord[]>([]);
  const interimWordsRef = useRef<LiveVoiceWord[]>([]);
  const interimTextRef = useRef("");
  const stoppingRef = useRef(false);

  const resetTranscript = () => {
    finalRef.current = "";
    finalWordsRef.current = [];
    interimWordsRef.current = [];
    interimTextRef.current = "";
  };

  const teardown = useCallback(() => {
    try { processorRef.current?.disconnect(); } catch { /* ignore */ }
    try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    processorRef.current = null;
    sourceRef.current = null;
    audioCtxRef.current = null;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    streamRef.current = null;
  }, []);

  // Stop dictation: ask Deepgram to flush, then report the final transcript.
  const stop = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "CloseStream" }));
      }
    } catch { /* ignore */ }
    teardown();
    // Give Deepgram a moment to emit the trailing final transcript.
    setTimeout(() => {
      try { socketRef.current?.close(); } catch { /* ignore */ }
      socketRef.current = null;
      setListening(false);
      // Prefer the final text; keep the last interim result if Deepgram never
      // sent a final frame (e.g. the speaker stopped mid-sentence).
      const keep = finalRef.current.trim() || interimTextRef.current.trim();
      const words = finalWordsRef.current.length ? finalWordsRef.current : interimWordsRef.current;
      resetTranscript();
      if (keep) onFinal?.(keep, words);
      else onError?.("Couldn't hear any speech — tap the mic and try again.");
      stoppingRef.current = false;
    }, 1200);
  }, [onFinal, onError, teardown]);

  // Abandon dictation without reporting anything (e.g. leaving the page).
  const cancel = useCallback(() => {
    stoppingRef.current = true;
    try {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "CloseStream" }));
      }
    } catch { /* ignore */ }
    teardown();
    try { socketRef.current?.close(); } catch { /* ignore */ }
    socketRef.current = null;
    setListening(false);
    resetTranscript();
    stoppingRef.current = false;
  }, [teardown]);

  const start = useCallback(async (language?: string) => {
    if (stoppingRef.current || socketRef.current) return;
    resetTranscript();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Let callers attach their own consumers (recorder, analyser) while the
      // mic is live — before the transcription socket opens.
      onStream?.(stream);
      const socket = new WebSocket(await getLiveSocketUrl(language));
      socketRef.current = socket;

      socket.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type !== "Results") return;
          const alt = data.channel?.alternatives?.[0];
          const text = alt?.transcript || "";
          const rawWords: Array<{ word?: string; start?: number; end?: number }> = Array.isArray(alt?.words) ? alt.words : [];
          const toTokens = (isFinal: boolean): LiveVoiceWord[] =>
            rawWords
              .filter((w) => typeof w?.word === "string" && w.word.trim().length > 0)
              .map((w) => ({ word: w.word as string, start: w.start ?? 0, end: w.end ?? 0, isFinal }));
          if (data.is_final) {
            if (text) finalRef.current = (finalRef.current + " " + text).replace(/\s+/g, " ").trim();
            if (rawWords.length) {
              finalWordsRef.current = [...finalWordsRef.current, ...toTokens(true)];
              interimWordsRef.current = [];
            }
            // Don't report empty finals (Deepgram emits them at silence
            // boundaries mid-utterance) — they would clobber the running
            // interim in the composer.
            if (text || rawWords.length) {
              const t = finalRef.current;
              interimTextRef.current = t;
              onInterim?.(t, [...finalWordsRef.current]);
            }
          } else if (text || rawWords.length) {
            const live = (finalRef.current + " " + text).trim();
            interimTextRef.current = live;
            if (rawWords.length) interimWordsRef.current = toTokens(false);
            onInterim?.(live, [...finalWordsRef.current, ...interimWordsRef.current]);
          }
        } catch { /* ignore non-JSON frames */ }
      };

      socket.onclose = () => {
        socketRef.current = null;
        teardown();
        setListening(false);
        if (!stoppingRef.current && !finalRef.current) {
          onError?.("Live transcription connection closed unexpectedly — try again.");
        }
      };
      socket.onerror = () => { /* onclose follows */ };

      socket.onopen = () => {
        const ctx = new AudioContext({ sampleRate: 48000 });
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          const buf = new ArrayBuffer(input.length * 2);
          const view = new DataView(buf);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          }
          if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(buf);
        };
        source.connect(processor);
        processor.connect(ctx.destination);
        audioCtxRef.current = ctx;
        sourceRef.current = source;
        processorRef.current = processor;
        setListening(true);
      };
    } catch (e: any) {
      socketRef.current = null;
      teardown();
      onError?.(
        e?.name === "NotAllowedError"
          ? "Microphone permission denied — allow mic access in your browser."
          : `Could not access the microphone: ${e?.message || "unknown error"}`
      );
    }
  }, [onInterim, onError, onStream, teardown]);

  return { listening, start, stop, cancel };
}
