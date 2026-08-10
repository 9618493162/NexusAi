import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Paperclip, Sparkles, Loader2, X, ArrowLeft, Plus, Mic, Volume2, VolumeX, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/ChatMessage";
import { QuickActions } from "@/components/QuickActions";
import { chatService } from "@/services/chat.service";
import { fileService } from "@/services/file.service";
import { voiceService } from "@/services/voice.service";
import { syncLangColorsFromServer } from "@/utils/languageColors";
import { TASK_MODELS, recommendModel, rememberTaskModel } from "@/utils/modelRecommendations";
import { playSpeech, stopCurrentSpeech } from "@/utils/speech";
import { cn } from "@/utils/cn";
import { Message } from "@/types";

export function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Task context from a Quick Action card (e.g. /chat?task=code). Auto model
  // uses it to pick the best model for the work.
  const task = searchParams.get("task") || undefined;
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState(id);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [model, setModel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: number; tag: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice dictation (Deepgram STT via the backend).
  const voiceSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";
  const [recording, setRecording] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Speak-translated replies: a toggle + language picker in the composer. When
  // on, replies are translated into the chosen language (Gemini/chat model)
  // and spoken aloud (Deepgram for English, free Edge neural voices otherwise).
  const [speakEnabled, setSpeakEnabled] = useState(() => {
    try { return localStorage.getItem("nexusai-chat-speak") === "1"; } catch { return false; }
  });
  const [languages, setLanguages] = useState<Array<{ code: string; name: string; bcp47: string }>>([]);
  const [speakLang, setSpeakLang] = useState(() => {
    try { return localStorage.getItem("nexusai-chat-speak-lang") || "en"; } catch { return "en"; }
  });
  const speakLangRef = useRef(speakLang);

  useEffect(() => {
    voiceService
      .getLanguages()
      .then((list) => {
        if (Array.isArray(list) && list.length) setLanguages(list);
      })
      .catch(() => { /* English only */ });
    // Pull badge colors saved on other devices so replies render correctly.
    syncLangColorsFromServer().catch(() => {});
    // Warm the browser voice list for the fallback path.
    try { window.speechSynthesis?.getVoices(); } catch { /* not available */ }
  }, []);

  const toggleSpeak = () => {
    setSpeakEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem("nexusai-chat-speak", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const changeSpeakLang = (code: string) => {
    setSpeakLang(code);
    speakLangRef.current = code;
    try { localStorage.setItem("nexusai-chat-speak-lang", code); } catch { /* ignore */ }
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
      window.speechSynthesis.speak(utterance);
    } catch { /* speech not available */ }
  };

  const speakReply = async (text: string) => {
    const lang = speakLangRef.current;
    // Respect a voice picked via the replay button's long-press menu (saved
    // per language, shared with the Voice page).
    let savedVoice: string | undefined;
    try {
      savedVoice = lang === "en" ? localStorage.getItem("nexusai-voice") || undefined : localStorage.getItem(`nexusai-edge-voice-${lang}`) || undefined;
    } catch { /* ignore */ }
    try {
      const audioBlob = await voiceService.speak(text, savedVoice, lang);
      // Shared manager: cuts off any previously playing reply (auto-spoken or
      // replay) so voices never overlap.
      playSpeech(audioBlob, { onError: () => speakWithBrowser(text, lang) });
    } catch {
      speakWithBrowser(text, lang);
    }
  };

  useEffect(() => {
    chatService
      .getModels()
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) {
          setModels(data);
          // Keep the current selection (e.g. a just-restored conversation
          // model) when it's still offered; otherwise default to Auto, which
          // picks the best model for the task at hand.
          setModel((current) => (data.some((m) => m.id === current) ? current : "auto"));
        }
      })
      .catch(() => { /* keep default model */ });
  }, []);

  // Navigating to /chat/:id (e.g. from History) loads that conversation's
  // messages. With no id, start a fresh chat.
  useEffect(() => {
    if (!id) {
      setConversationId(undefined);
      setMessages([]);
      setError("");
      return;
    }
    setConversationId(id);
    setMessages([]);
    setError("");
    chatService
      .getMessages(id)
      .then(({ data }) => {
        setMessages(data);
        // Continue with the model that was used in this conversation — take
        // the most recent message that recorded one.
        const lastWithModel = [...data].reverse().find((m: Message) => m.model);
        if (lastWithModel?.model) setModel(lastWithModel.model);
      })
      .catch((err: any) => {
        const msg = err.response?.data?.error || err.message || "Failed to load conversation";
        setError(typeof msg === "string" ? msg : "Failed to load conversation");
        setConversationId(undefined);
      });
  }, [id]);

  // Quick Action task (e.g. /chat?task=code): prefill a starter prompt once so
  // the user can edit and send it; Auto picks the best model for the task.
  const taskPromptedRef = useRef(false);
  useEffect(() => {
    if (!task || id || taskPromptedRef.current) return;
    const preset = TASK_MODELS[task];
    if (preset) {
      setInput(preset.prompt);
      taskPromptedRef.current = true;
    }
  }, [task, id]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  // Keyboard shortcuts: Cmd/Ctrl+N starts a new chat, Cmd/Ctrl+K focuses the
  // message input.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        navigate("/chat");
      } else if (key === "k") {
        e.preventDefault();
        messageInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(() => () => { try { recorderRef.current?.stop(); } catch { /* ignore */ } }, []);

  // Stop any spoken reply when leaving the chat page.
  useEffect(() => () => stopCurrentSpeech(), []);

  const transcribeVoice = async (blob: Blob) => {
    setTranscribingVoice(true);
    try {
      const text = await voiceService.transcribe(blob);
      if (text) {
        setInput((prev) => (prev.trim() ? prev.trimEnd() + " " + text : text));
        messageInputRef.current?.focus();
      } else {
        setError("Couldn't hear any speech — tap the mic and try again.");
      }
    } catch (err: any) {
      console.error("Voice transcription error:", err);
      setError(err?.response?.data?.error || "Transcription failed — check the backend / Deepgram key.");
    } finally {
      setTranscribingVoice(false);
    }
  };

  const toggleVoice = async () => {
    if (recorderRef.current) {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) await transcribeVoice(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e: any) {
      setError(
        e?.name === "NotAllowedError"
          ? "Microphone permission denied — allow mic access in your browser."
          : "Could not access the microphone."
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMessage: Message = { id: Date.now().toString(), content: input, role: "user", createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError("");
    let assistantContent = "";
    try {
      // Translate replies into the chosen language when speak-translate is on
      // and a non-English language is selected (the model replies in that
      // language, then we speak the result).
      const langName = languages.find((l) => l.code === speakLang)?.name || speakLang;
      // Auto model: pick the best model for this task (or from the message).
      const resolvedModel = model === "auto" ? recommendModel(input, task) : model;
      // Translation follows the selected language (the speak toggle only
      // controls whether the reply is spoken aloud).
      const response = await chatService.streamChat(
        input,
        conversationId,
        resolvedModel || undefined,
        speakLang !== "en" ? langName : undefined,
        speakLang
      );
      setAttachedFile(null);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const assistantId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id: assistantId, content: "", role: "assistant", createdAt: new Date().toISOString() }]);
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              setError(typeof data.error === "string" ? data.error : "Chat failed. Check your API keys.");
              break;
            }
            if (data.content) {
              assistantContent += data.content;
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: assistantContent } : m));
            }
            if (data.conversationId) setConversationId(data.conversationId);
          }
        }
      }
    } catch (err) { console.error("Chat error:", err); setError("Chat failed. Check your API keys."); }
    finally {
      setLoading(false);
      if (speakEnabled && assistantContent) {
        try { await speakReply(assistantContent); } catch { /* spoken reply is best-effort */ }
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setError("File is too large. Maximum size is 50MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const { data } = await fileService.upload(file, conversationId);
      const tag = `\n\n[File: ${data.originalName}]\n${data.extractedText || ""}`;
      setAttachedFile({ name: data.originalName, size: file.size, tag });
      setInput((prev) => prev + tag);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "File upload failed";
      console.error("File upload error:", err);
      setError(typeof msg === "string" ? msg : "File upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {id && (
          <div className="flex items-center gap-4 w-fit">
            <Link
              to="/history"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to History
            </Link>
            <Link
              to="/chat"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </Link>
          </div>
        )}
        <AnimatePresence>
          {messages.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-8">
                <h1 className="text-4xl font-bold mb-2">What can I help with?</h1>
                <p className="text-muted-foreground">Choose a quick action or type your message</p>
              </div>
              <QuickActions />
            </motion.div>
          )}
        </AnimatePresence>
        {messages.map((message) => (
          // Replay in the language the reply was actually spoken in (saved on
          // the message), falling back to the current speak-translate setting.
          <ChatMessage key={message.id} message={message} replayLang={message.language || speakLang} />
        ))}
        {loading && <div className="flex items-center gap-2 text-muted-foreground"><div className="w-2 h-2 bg-primary rounded-full animate-bounce" /><div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-100" /><div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-200" /></div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t border-border p-4">
        {error && <div className="max-w-4xl mx-auto mb-2 p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-500 text-sm">{error}</div>}
        <div className="flex items-center gap-2 max-w-4xl mx-auto mb-2 flex-wrap">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <select
            value={model}
            onChange={(e) => {
              const v = e.target.value;
              setModel(v);
              // Remember an explicit pick so Auto prefers it next time for
              // this task (or as the global default when there's no task).
              if (v !== "auto") rememberTaskModel(task || "_default", v);
            }}
            aria-label="Model"
            className="bg-muted border border-input rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring max-w-[240px]"
          >
            <option value="auto">Auto — best for task</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {model === "auto" && (
            <span className="text-xs text-primary/80 hidden sm:block">
              Auto → {recommendModel(input || " ", task)} for this task
            </span>
          )}
          <button
            type="button"
            onClick={toggleSpeak}
            title="Speak replies aloud in the selected language"
            aria-label="Speak replies"
            className={cn(
              "px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors",
              speakEnabled ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {speakEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            Speak replies
          </button>
          {languages.length > 0 && (
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <select
                value={speakLang}
                onChange={(e) => changeSpeakLang(e.target.value)}
                aria-label="Reply language"
                className="bg-muted border border-input rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring max-w-[180px]"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </label>
          )}
          <span className="text-xs text-muted-foreground hidden sm:block">Model used for this chat</span>
          {speakLang !== "en" && (
            <span className="text-xs text-primary/80">
              Replies translated to {languages.find((l) => l.code === speakLang)?.name || speakLang}{speakEnabled && " and spoken"}
            </span>
          )}
        </div>
        {attachedFile && (
          <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2 p-2 pr-3 rounded-lg border border-primary/30 bg-primary/10 text-sm">
            <Paperclip className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate flex-1">{attachedFile.name} <span className="text-muted-foreground text-xs">({attachedFile.size < 1024 ? `${attachedFile.size} B` : `${(attachedFile.size / 1024).toFixed(1)} KB`})</span></span>
            <button type="button" onClick={() => { setInput((prev) => prev.replace(attachedFile.tag, "")); setAttachedFile(null); }} className="p-0.5 rounded hover:bg-primary/20 transition-colors" aria-label="Remove attached file"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2 max-w-4xl mx-auto">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach a file" aria-label="Attach a file" className="p-2 rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}</button>
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={transcribingVoice || loading}
              title={recording ? "Stop recording" : "Dictate a message"}
              aria-label={recording ? "Stop recording" : "Dictate a message"}
              className={cn(
                "p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                recording ? "bg-red-500/20 text-red-500 animate-pulse" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {transcribingVoice ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
          <div className="flex-1 relative">
            <textarea ref={messageInputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }} placeholder={recording ? "Listening... speak now" : "Message NexusAI..."} className="w-full resize-none rounded-lg border border-input bg-background px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-ring min-h-[52px] max-h-[200px]" rows={1} />
          </div>
          <Button type="submit" size="icon" disabled={!input.trim() || loading}><Send className="w-4 h-4" /></Button>
        </form>
      </div>
    </div>
  );
}
