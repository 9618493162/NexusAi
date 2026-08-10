import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Send, AudioLines, Languages, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chatService } from "@/services/chat.service";
import { voiceService, getLiveSocketUrl } from "@/services/voice.service";
import { cn } from "@/utils/cn";

interface VoiceEntry {
  id: string;
  transcript: string;
  reply: string;
}

export function Voice() {
  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== "undefined" &&
    typeof WebSocket !== "undefined";
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState("");
  const [speakReplies, setSpeakReplies] = useState(true);
  const [voices, setVoices] = useState<Array<{ id: string; name: string; language: string }>>([]);
  const [voice, setVoice] = useState("aura-2-thalia-en");
  const [languages, setLanguages] = useState<Array<{ code: string; name: string; bcp47: string }>>([]);
  const [edgeVoices, setEdgeVoices] = useState<Array<{ id: string; language: string; name: string; gender: "Female" | "Male" }>>([]);
  const [edgeVoice, setEdgeVoice] = useState("");
  const [speechLang, setSpeechLang] = useState("en");
  const [replyLang, setReplyLang] = useState("en");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<VoiceEntry[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const finalRef = useRef("");
  const lastSpokenRef = useRef("");
  const stoppingRef = useRef(false);

  const teardownAudio = () => {
    try { processorRef.current?.disconnect(); } catch { /* ignore */ }
    try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    processorRef.current = null;
    sourceRef.current = null;
    audioCtxRef.current = null;
  };

  const cleanup = () => {
    try { socketRef.current?.close(); } catch { /* ignore */ }
    socketRef.current = null;
    teardownAudio();
  };
  useEffect(() => () => cleanup(), []);

  // Load the available TTS voices and restore the saved preference.
  useEffect(() => {
    voiceService
      .getVoices()
      .then((list) => {
        if (!Array.isArray(list) || !list.length) return;
        setVoices(list);
        const saved = localStorage.getItem("nexusai-voice");
        if (saved && list.some((v) => v.id === saved)) setVoice(saved);
      })
      .catch(() => { /* keep the default voice */ });
  }, []);

  const changeVoice = (id: string) => {
    setVoice(id);
    try { localStorage.setItem("nexusai-voice", id); } catch { /* ignore */ }
  };

  // Load the supported STT/translation languages and restore saved preferences.
  useEffect(() => {
    voiceService
      .getLanguages()
      .then((list) => {
        if (!Array.isArray(list) || !list.length) return;
        setLanguages(list);
        const savedSpeech = localStorage.getItem("nexusai-speech-lang");
        if (savedSpeech && list.some((l) => l.code === savedSpeech)) setSpeechLang(savedSpeech);
        const savedReply = localStorage.getItem("nexusai-reply-lang");
        if (savedReply && list.some((l) => l.code === savedReply)) setReplyLang(savedReply);
      })
      .catch(() => { /* keep English defaults */ });
    // Warm the browser's voice list so speakWithBrowser() finds non-English voices.
    try {
      window.speechSynthesis?.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    } catch { /* speech not available */ }
    // Load the per-language Edge neural voices (male/female where available).
    voiceService
      .getEdgeVoices()
      .then((list) => {
        if (Array.isArray(list) && list.length) setEdgeVoices(list);
      })
      .catch(() => { /* English-only mode */ });
  }, []);

  // Keep the chosen Edge voice valid for the current reply language — restore
  // the saved preference, else default to the language's first voice.
  useEffect(() => {
    if (replyLang === "en") return;
    const forLang = edgeVoices.filter((v) => v.language === replyLang);
    if (!forLang.length) {
      setEdgeVoice("");
      return;
    }
    const saved = localStorage.getItem(`nexusai-edge-voice-${replyLang}`);
    const match = saved ? forLang.find((v) => v.id === saved) : undefined;
    setEdgeVoice(match ? match.id : forLang[0].id);
  }, [replyLang, edgeVoices]);

  const changeEdgeVoice = (id: string) => {
    setEdgeVoice(id);
    try { localStorage.setItem(`nexusai-edge-voice-${replyLang}`, id); } catch { /* ignore */ }
  };

  const changeSpeechLang = (code: string) => {
    setSpeechLang(code);
    try { localStorage.setItem("nexusai-speech-lang", code); } catch { /* ignore */ }
  };

  const changeReplyLang = (code: string) => {
    setReplyLang(code);
    try { localStorage.setItem("nexusai-reply-lang", code); } catch { /* ignore */ }
  };

  const toggleListening = () => {
    if (listening) stopListening();
    else startListening();
  };

  const startListening = async () => {
    cleanup();
    setMicError("");
    finalRef.current = "";
    lastSpokenRef.current = "";
    setTranscript("");
    stoppingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const socket = new WebSocket(await getLiveSocketUrl(speechLang));
      socketRef.current = socket;

      socket.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "Results") {
            const text = data.channel?.alternatives?.[0]?.transcript || "";
            if (data.is_final) {
              if (text) {
                finalRef.current = (finalRef.current + " " + text).replace(/\s+/g, " ").trim();
                lastSpokenRef.current = finalRef.current;
              }
              // Keep the last spoken words — never blank out on empty finals.
              setTranscript(finalRef.current || lastSpokenRef.current);
            } else if (text) {
              // Live interim words appear as you speak; empty interim updates
              // are ignored so the box doesn't flash blank between utterances.
              const live = (finalRef.current + " " + text).trim();
              lastSpokenRef.current = live;
              setTranscript(live);
            }
          }
        } catch { /* ignore non-JSON frames */ }
      };
      socket.onclose = () => {
        socketRef.current = null;
        teardownAudio();
        setListening(false);
        if (!stoppingRef.current && !finalRef.current) {
          setMicError("Live transcription connection closed unexpectedly — try again.");
        }
      };
      socket.onerror = () => { /* onclose follows */ };

      socket.onopen = () => {
        // Capture raw 48kHz linear16 PCM (the only format the streaming API
        // reliably accepts) and push it up in small frames.
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
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(buf);
          }
        };
        source.connect(processor);
        processor.connect(ctx.destination); // keep the graph running
        audioCtxRef.current = ctx;
        sourceRef.current = source;
        processorRef.current = processor;
        setListening(true);
      };
    } catch (e: any) {
      setMicError(
        e?.name === "NotAllowedError"
          ? "Microphone permission denied — allow mic access in your browser."
          : `Could not access the microphone: ${e?.message || "unknown error"}`
      );
    }
  };

  const stopListening = () => {
    stoppingRef.current = true;
    try {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "CloseStream" }));
      }
    } catch { /* ignore */ }
    teardownAudio();
    // Let final results land, then close the socket cleanly.
    setTimeout(() => {
      try { socketRef.current?.close(); } catch { /* ignore */ }
      setListening(false);
      const keep = finalRef.current || lastSpokenRef.current;
      if (keep) setTranscript(keep);
      else setMicError("Couldn't hear any speech — tap the mic and try again.");
    }, 1200);
  };

  // Fallback when the backend can't synthesize (e.g. Punjabi has no Edge
  // voice): use the browser's built-in speech, matched to the language.
  const speakWithBrowser = (text: string, langCode: string) => {
    try {
      const bcp = languages.find((l) => l.code === langCode)?.bcp47 || langCode;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = bcp;
      const base = bcp.split("-")[0].toLowerCase();
      const matches = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(base));
      if (matches.length) utterance.voice = matches[matches.length - 1];
      window.speechSynthesis.speak(utterance);
    } catch { /* speech not available */ }
  };

  const fallbackSpeak = (text: string) => speakWithBrowser(text, replyLang === "en" ? "en" : replyLang);

  // Speak a reply: Deepgram aura voice for English, free Edge neural voice
  // for other languages (backend-side), browser speech as a last resort.
  const speak = async (text: string) => {
    try {
      const audioBlob = await voiceService.speak(text, replyLang === "en" ? voice : edgeVoice, replyLang);
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => { URL.revokeObjectURL(url); fallbackSpeak(text); };
      audio.play().catch(() => { URL.revokeObjectURL(url); fallbackSpeak(text); });
    } catch {
      fallbackSpeak(text);
    }
  };

  const handleSend = async () => {
    const text = transcript.trim();
    if (!text || loading) return;
    setLoading(true);
    try {
      // Use Gemini Flash — the reliable free provider with working quota (the
      // app's Groq/OpenRouter defaults currently have dead keys).
      const replyLangName = languages.find((l) => l.code === replyLang)?.name || replyLang;
      const response = await chatService.streamChat(text, undefined, "gemini-flash-latest", replyLangName, replyLang);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n\n")) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (data.content) reply += data.content;
          }
        }
      }
      setEntries((prev) => [{ id: Date.now().toString(), transcript: text, reply }, ...prev]);
      setTranscript("");
      finalRef.current = "";
      if (speakReplies && reply) speak(reply);
    } catch (error) {
      console.error("Voice chat error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><AudioLines className="w-6 h-6 text-primary" /> Voice</h1>
        <p className="text-muted-foreground mt-1">Talk to NexusAI — live Deepgram speech-to-text and spoken replies</p>
      </div>

      {!supported ? (
        <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
          <MicOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Microphone recording isn't supported in this browser</p>
          <p className="text-sm">Try Chrome or Edge for voice input</p>
        </div>
      ) : (
        <>
          {/* Voice control */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-8 text-center space-y-5">
            <button
              onClick={toggleListening}
              className={cn(
                "relative w-24 h-24 rounded-full flex items-center justify-center transition-all",
                listening ? "bg-red-500/20 text-red-500" : "bg-primary/10 text-primary hover:bg-primary/20"
              )}
              aria-label={listening ? "Stop listening" : "Start listening"}
            >
              {listening && <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />}
              {listening ? <MicOff className="w-10 h-10 relative" /> : <Mic className="w-10 h-10 relative" />}
            </button>
            <p className={cn("font-medium", listening && "text-red-500")}>
              {listening ? "Listening... tap to stop" : "Tap the mic and start talking"}
            </p>
            {micError && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/50 rounded-lg p-3">{micError}</p>}

            <div className="min-h-[56px] rounded-lg border border-border bg-muted p-3 text-left">
              {transcript || <span className="text-muted-foreground">{listening ? "Your words will appear here as you speak..." : "Your words will appear here..."}</span>}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={handleSend} disabled={!transcript.trim() || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                {loading ? "Thinking..." : "Send"}
              </Button>
              <button
                onClick={() => setSpeakReplies(!speakReplies)}
                className={cn("px-3 py-2 rounded-lg border text-sm flex items-center gap-2 transition-colors", speakReplies ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground")}
              >
                {speakReplies ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                Spoken replies
              </button>
              {voices.length > 1 && replyLang === "en" && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Volume2 className="w-4 h-4" />
                  <select
                    value={voice}
                    onChange={(e) => changeVoice(e.target.value)}
                    aria-label="Spoken voice"
                    className="bg-muted border border-input rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>{v.name} — {v.language}</option>
                    ))}
                  </select>
                </label>
              )}
              {replyLang !== "en" && edgeVoices.some((v) => v.language === replyLang) && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Volume2 className="w-4 h-4" />
                  <select
                    value={edgeVoice}
                    onChange={(e) => changeEdgeVoice(e.target.value)}
                    aria-label="Spoken voice"
                    className="bg-muted border border-input rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {edgeVoices.filter((v) => v.language === replyLang).map((v) => (
                      <option key={v.id} value={v.id}>{v.name} — {v.gender}</option>
                    ))}
                  </select>
                </label>
              )}
              {languages.length > 1 && (
                <>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Languages className="w-4 h-4" />
                    <select
                      value={speechLang}
                      onChange={(e) => changeSpeechLang(e.target.value)}
                      aria-label="You speak"
                      className="bg-muted border border-input rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {languages.map((l) => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Globe className="w-4 h-4" />
                    <select
                      value={replyLang}
                      onChange={(e) => changeReplyLang(e.target.value)}
                      aria-label="AI replies in"
                      className="bg-muted border border-input rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {languages.map((l) => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </motion.div>

          {/* Conversation log */}
          <div className="mt-8 space-y-4">
            <AnimatePresence>
              {entries.map((entry) => (
                <motion.div key={entry.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2 text-sm">{entry.transcript}</div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted px-4 py-2 text-sm">{entry.reply}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
