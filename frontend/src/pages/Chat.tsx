import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Square, Paperclip, Sparkles, Loader2, X, ArrowLeft, Plus, Mic, Volume2, VolumeX, Globe, Search, Languages, Brain, Bookmark, Check, CornerDownLeft, MessageSquare, Image as ImageIcon, FileText } from "lucide-react";
import { Select } from "@/components/ui/select";
import { PromptPicker } from "@/components/ui/prompt-picker";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatRail } from "@/components/ChatRail";
import { QuickActions } from "@/components/QuickActions";
import { NexusCore } from "@/components/ui/nexus-core";
import { chatService } from "@/services/chat.service";
import { fileService } from "@/services/file.service";
import { voiceService } from "@/services/voice.service";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { useLiveVoice } from "@/hooks/useLiveVoice";
import { syncLangColorsFromServer } from "@/utils/languageColors";
import { TASK_MODELS, recommendModel, rememberTaskModel } from "@/utils/modelRecommendations";
import { getDefaultChatModel } from "@/utils/aiPreferences";
import { playSpeech, stopCurrentSpeech } from "@/utils/speech";
import { readSavedLanguage, saveLanguage, languageName } from "@/utils/languageCatalog";
import { savePrompt, getSavedPrompts } from "@/utils/savedPrompts";
import { useLanguageCatalog } from "@/hooks/useLanguageCatalog";
import { cn } from "@/utils/cn";
import { Message } from "@/types";

// Remember the last conversation opened in Chat (persisted per browser) so
// the app-wide dictation shortcut can resume it from History/Search results
// instead of always forcing a fresh chat.
function rememberLastConversation(cid: string): void {
  try { localStorage.setItem("nexusai-last-conversation", cid); } catch { /* ignore */ }
}

/** Suggest a prompt title from the composer text (first ~6 words). */
function autoPromptTitle(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.length > 50 ? `${words.slice(0, 47).trimEnd()}…` : words;
}

export function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Task context from a Quick Action card (e.g. /chat?task=code). Auto model
  // uses it to pick the best model for the work.
  const task = searchParams.get("task") || undefined;
  // Pre-filled query from the Dashboard's AI command area (/chat?q=...).
  const prefilled = searchParams.get("q") || undefined;
  // Model chosen in the Command Center (/chat?model=...).
  const modelParam = searchParams.get("model") || undefined;
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Deep-reasoning phase (e.g. NVIDIA Inkling): the model streams its
  // reasoning before the answer. Shown as an honest "thinking…" panel on the
  // in-flight assistant message; never persisted into the reply.
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [assistantReasoning, setAssistantReasoning] = useState("");
  const [conversationId, setConversationId] = useState(id);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [model, setModel] = useState("");
  const [uploading, setUploading] = useState(false);
  // The uploaded file's real id — the backend retrieves its extracted text
  // as context (ownership-checked), so the browser never inlines it.
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: number; id: string; previewUrl?: string } | null>(null);
  // Drag-and-drop state for file/image drops onto the composer.
  const [dragOver, setDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  // Attachment menu dropdown.
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  // Saved-prompt insertion (Cmd/Ctrl+Shift+P): the caret position is captured
  // when the picker opens so the chosen prompt lands exactly where the user
  // was typing.
  const [promptPickerOpen, setPromptPickerOpen] = useState(false);
  const promptCaretRef = useRef<number>(0);
  const openPromptPickerRef = useRef<() => void>(() => {});
  const authUser = useAuthStore((s) => s.user);
  // Save the current composer message as a reusable prompt, right from Chat.
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [promptTitle, setPromptTitle] = useState("");
  // When the composer text is already saved, the popover edits that entry
  // (title + prompt stay in sync instead of creating a duplicate).
  const [savePromptEditId, setSavePromptEditId] = useState<string | null>(null);
  const [promptSavedFlash, setPromptSavedFlash] = useState(false);
  const promptSavedWasUpdate = useRef(false);
  const promptSavedTimer = useRef<number | null>(null);
  // Live count of saved prompts, shown as a tiny badge on the bookmark button.
  const [savedPromptCount, setSavedPromptCount] = useState(0);
  const refreshSavedPromptCount = () => {
    setSavedPromptCount(authUser?.id ? getSavedPrompts(authUser.id).length : 0);
  };
  useEffect(() => {
    refreshSavedPromptCount();
    // Refresh when the tab regains focus so edits made in AI Memory (same or
    // another tab) show up without a reload.
    const onFocus = () => refreshSavedPromptCount();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [authUser?.id]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Conversation rail: collapse preference + a refresh signal bumped when
  //    a fresh chat turns into a saved conversation (so the list updates). ──
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try { return localStorage.getItem("nexusai-chat-rail-collapsed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("nexusai-chat-rail-collapsed", railCollapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [railCollapsed]);
  const [railRefresh, setRailRefresh] = useState(0);
  const hadConversationRef = useRef(!!conversationId);
  useEffect(() => {
    // First time a fresh chat gains a real conversation id → bump the rail.
    if (conversationId && !hadConversationRef.current) {
      hadConversationRef.current = true;
      setRailRefresh((v) => v + 1);
    }
    if (!conversationId) hadConversationRef.current = false;
  }, [conversationId]);
  // Mobile slide-in drawer for the conversation rail.
  const [railMobileOpen, setRailMobileOpen] = useState(false);
  // Close the drawer when the conversation changes (navigating in the drawer
  // lands on a new chat, so it shouldn't stay covering the messages).
  useEffect(() => {
    setRailMobileOpen(false);
  }, [id]);

  // Voice dictation — live WebSocket transcription through the backend (the
  // same Deepgram pipeline as the Voice Studio): interim words fill the
  // message as you talk, and stopping auto-sends the final transcript.
  const voiceSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== "undefined" &&
    typeof WebSocket !== "undefined";
  // Text already in the composer when dictation starts — live text appends to it.
  const dictationBaseRef = useRef("");
  // Voice callbacks outlive renders, so send through a ref to the latest sendMessage.
  const sendMessageRef = useRef<(raw: string) => Promise<void>>(async () => {});
  const abortControllerRef = useRef<AbortController | null>(null);
  // Latest toggleVoice for the keyboard shortcut (kept fresh across renders).
  const toggleVoiceRef = useRef<() => void>(() => {});
  // Dictation translation: when on, the spoken text is translated into
  // dictateTo via the existing chat API after dictation stops, and the
  // translation fills the message (persisted like the other composer prefs).
  const [translateDictation, setTranslateDictation] = useState(() => {
    try { return localStorage.getItem("nexusai-chat-dictate-translate") === "1"; } catch { return false; }
  });
  const [dictateTo, setDictateTo] = useState(() => readSavedLanguage("nexusai-chat-dictate-to", "te"));
  // Live source transcript for the dictation panel + the translating state.
  const [dictationText, setDictationText] = useState("");
  const [translatingDictation, setTranslatingDictation] = useState(false);
  const toggleTranslateDictation = () => {
    setTranslateDictation((prev) => {
      const next = !prev;
      try { localStorage.setItem("nexusai-chat-dictate-translate", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };
  const changeDictateTo = (code: string) => {
    setDictateTo(code);
    dictateToRef.current = code;
    saveLanguage("nexusai-chat-dictate-to", code);
    persistDictatePrefs();
  };
  // Dictation-translation settings, read via refs by the (long-lived) voice
  // callbacks so they always see the latest selection.
  const translateDictationRef = useRef(false);
  const dictateLangRef = useRef("en");
  const dictateToRef = useRef("te");
  const languagesRef = useRef<Array<{ code: string; name: string; bcp47: string }>>([]);

  // Push the current dictation prefs to the account (PATCH /auth/me, like
  // theme) so they follow the user across devices. Skipped when signed out —
  // the local value still applies until the next change.
  function persistDictatePrefs(): void {
    if (!useAuthStore.getState().accessToken) return;
    authService
      .updateProfile({ dictateLang: dictateLangRef.current, dictateTo: dictateToRef.current })
      .catch(() => { /* keep local; retried on next change */ });
  }

  // Translate dictated speech through the existing chat API (save=false — a
  // pure pass-through: no conversation is created and nothing is persisted).
  // The backend's language directive makes the model reply in the target
  // language; the instruction keeps that reply to just the translation.
  const translateDictated = async (text: string): Promise<string> => {
    const targetCode = dictateToRef.current;
    const langName = languageName(languagesRef.current, targetCode);
    const prompt = `Translate the text below into ${langName}. Reply with only the translation — no greetings, no explanations, no preamble, no quotes.\n\nText:\n${text}`;
    const response = await chatService.streamChat(prompt, undefined, undefined, langName, targetCode, false, false);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let out = "";
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n\n")) {
        if (!line.startsWith("data: ")) continue;
        let data: any;
        try { data = JSON.parse(line.slice(6)); } catch { continue; }
        if (data.error) throw new Error(typeof data.error === "string" ? data.error : "Translation failed");
        if (data.content) out += data.content;
      }
    }
    return out.trim();
  };

  const handleVoiceInterim = useCallback((text: string) => {
    setDictationText(dictationBaseRef.current + text);
    setInput(dictationBaseRef.current + text);
  }, []);

  const handleVoiceFinal = useCallback((text: string) => {
    const full = dictationBaseRef.current + text;
    const shouldTranslate =
      translateDictationRef.current && dictateToRef.current !== dictateLangRef.current;
    if (!shouldTranslate) {
      setInput(full);
      void sendMessageRef.current?.(full);
      return;
    }
    // Real translation via the chat API — the original stays visible in the
    // dictation panel while it runs, then the translation fills the message.
    setDictationText(full);
    setTranslatingDictation(true);
    translateDictated(full)
      .then((translated) => {
        setTranslatingDictation(false);
        if (translated) {
          setInput(translated);
          void sendMessageRef.current?.(translated);
        } else {
          setInput(full);
          setError("Translation returned nothing — the original transcript is in the composer.");
        }
      })
      .catch(() => {
        setTranslatingDictation(false);
        setInput(full);
        setError("Translation failed — the original transcript is in the composer.");
      });
  }, []);
  const handleVoiceError = useCallback((message: string) => {
    setError(message);
  }, []);
  const {
    listening: recording,
    start: startVoice,
    stop: stopVoice,
    cancel: cancelVoice,
  } = useLiveVoice({
    onInterim: handleVoiceInterim,
    onFinal: handleVoiceFinal,
    onError: handleVoiceError,
  });

  // Speak-translated replies: a toggle + language picker in the composer. When
  // on, replies are translated into the chosen language (Gemini/chat model)
  // and spoken aloud (Deepgram for English, free Edge neural voices otherwise).
  const [speakEnabled, setSpeakEnabled] = useState(() => {
    try { return localStorage.getItem("nexusai-chat-speak") === "1"; } catch { return false; }
  });
  const languages = useLanguageCatalog();
  const [speakLang, setSpeakLang] = useState(() => readSavedLanguage("nexusai-chat-speak-lang", "en"));
  const speakLangRef = useRef(speakLang);

  // Live web search (TinyFish, free): when on, the backend fetches results
  // for the message and grounds the reply in them.
  const [searchEnabled, setSearchEnabled] = useState(() => {
    try { return localStorage.getItem("nexusai-chat-search") === "1"; } catch { return false; }
  });
  const toggleSearch = () => {
    setSearchEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem("nexusai-chat-search", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
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
    saveLanguage("nexusai-chat-speak-lang", code);
  };

  // Speech-recognition language for live dictation (distinct from the reply
  // language above — that one controls translated/spoken replies). Passed to
  // the backend's live proxy, which asks Deepgram to transcribe in this
  // language.
  const [dictateLang, setDictateLang] = useState(() => readSavedLanguage("nexusai-chat-dictate-lang", "en"));
  const changeDictateLang = (code: string) => {
    setDictateLang(code);
    dictateLangRef.current = code;
    saveLanguage("nexusai-chat-dictate-lang", code);
    persistDictatePrefs();
  };

  // Pull dictation prefs saved on other devices (the account is the source of
  // truth, like theme). Server values win when present; otherwise push the
  // local choice up once so the account starts following across devices.
  useEffect(() => {
    if (languages.length === 0) return;
    if (!useAuthStore.getState().accessToken) return;
    let cancelled = false;
    authService
      .me()
      .then(({ data }) => {
        if (cancelled) return;
        const inCatalog = (code: string | null | undefined): code is string =>
          !!code && languages.some((l) => l.code === code);
        const serverLang: string | null = data?.dictateLang ?? null;
        const serverTo: string | null = data?.dictateTo ?? null;
        let pushLocal = false;
        if (inCatalog(serverLang) && serverLang !== dictateLangRef.current) {
          setDictateLang(serverLang);
          saveLanguage("nexusai-chat-dictate-lang", serverLang);
        } else if (!serverLang && readSavedLanguage("nexusai-chat-dictate-lang", "en") !== "en") {
          pushLocal = true;
        }
        if (inCatalog(serverTo) && serverTo !== dictateToRef.current) {
          setDictateTo(serverTo);
          saveLanguage("nexusai-chat-dictate-to", serverTo);
        } else if (!serverTo && readSavedLanguage("nexusai-chat-dictate-to", "te") !== "te") {
          pushLocal = true;
        }
        if (pushLocal) persistDictatePrefs();
      })
      .catch(() => { /* offline/unauthenticated — keep local */ });
    return () => { cancelled = true; };
  }, [languages]);

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
          // model) when it's still offered; a ?model= param from the Command
          // Center wins if it names a real model; otherwise default to Auto,
          // which picks the best model for the task at hand.
          setModel((current) => {
            if (modelParam && data.some((m: { id: string }) => m.id === modelParam)) return modelParam;
            if (current) return data.some((m) => m.id === current) ? current : "auto";
            // No ?model=, no restored conversation: use the user's default from
            // the Model Manager (falls back to Auto).
            const pref = getDefaultChatModel();
            return data.some((m) => m.id === pref) ? pref : "auto";
          });
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
        rememberLastConversation(id);
        // Continue with the model that was used in this conversation — take
        // the most recent message that recorded one.
        const lastWithModel = [...data].reverse().find((m: Message) => m.model);
        if (lastWithModel?.model) setModel(lastWithModel.model);
      })
      .catch((err: any) => {
        const msg = err.response?.data?.error || err.message || "Failed to load conversation";
        setError(typeof msg === "string" ? msg : "Failed to load conversation");
        setConversationId(undefined);
        // A deleted conversation shouldn't keep being the resume target.
        if (err.response?.status === 404) {
          try { localStorage.removeItem("nexusai-last-conversation"); } catch { /* ignore */ }
        }
      });
  }, [id]);

  // Quick Action task (e.g. /chat?task=code): prefill a starter prompt once so
  // the user can edit and send it; Auto picks the best model for the task.
  const taskPromptedRef = useRef(false);
  useEffect(() => {
    if (id || taskPromptedRef.current) return;
    if (prefilled) {
      setInput(prefilled);
      taskPromptedRef.current = true;
      messageInputRef.current?.focus();
      return;
    }
    if (!task) return;
    const preset = TASK_MODELS[task];
    if (preset) {
      setInput(preset.prompt);
      taskPromptedRef.current = true;
    }
  }, [task, prefilled, id]);

  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  };
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
  };
  useEffect(() => {
    if (isNearBottomRef.current) scrollToBottom();
  }, [messages]);

  // Keyboard shortcuts: Cmd/Ctrl+N starts a new chat, Cmd/Ctrl+Shift+M toggles
  // live dictation (works from anywhere on the page, not just the composer),
  // and Cmd/Ctrl+K focuses the message input — the palette handles that one.
  // From other pages the app shell navigates here with ?dictate=1 instead.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        navigate("/chat");
      }
      if (key === "m" && e.shiftKey && voiceSupported) {
        e.preventDefault();
        toggleVoiceRef.current();
      }
      if (key === "p" && e.shiftKey) {
        e.preventDefault();
        openPromptPickerRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, voiceSupported]);

  // App-wide dictation shortcut (/chat?dictate=1): when triggered from another
  // page, Chat mounts with this param — begin live dictation immediately in
  // the selected language, then consume the param so refresh/back never
  // restarts it. The ref guard mirrors the app's other StrictMode pattern
  // (effects fire twice in dev — only one socket may open).
  const dictateParamHandledRef = useRef(false);
  useEffect(() => {
    if (dictateParamHandledRef.current) return;
    if (searchParams.get("dictate") !== "1") return;
    dictateParamHandledRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("dictate");
    setSearchParams(next, { replace: true });
    if (!voiceSupported) return;
    setError("");
    setDictationText("");
    setTranslatingDictation(false);
    dictationBaseRef.current = "";
    startVoice(dictateLang);
  }, [searchParams, setSearchParams, voiceSupported, startVoice, dictateLang]);

  // Tear down live dictation (socket + mic) when leaving the chat page.
  useEffect(() => () => cancelVoice(), [cancelVoice]);

  // Stop any spoken reply when leaving the chat page.
  useEffect(() => () => stopCurrentSpeech(), []);

  const toggleVoice = () => {
    if (recording) {
      // Stop: the live transcript flushes, fills the composer, and auto-sends
      // so speaking gets an immediate reply (translated when enabled).
      stopVoice();
      return;
    }
    if (translatingDictation) return; // wait for the in-flight translation
    setError("");
    setDictationText("");
    setTranslatingDictation(false);
    // Capture whatever is already in the composer — live text appends to it.
    dictationBaseRef.current = input.trim() ? `${input.trimEnd()} ` : "";
    startVoice(dictateLang);
    messageInputRef.current?.focus();
  };

  // Send a chat message — used by the composer AND by voice dictation (which
  // auto-sends so speaking gets an immediate reply).
  const stopGeneration = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  };
  const sendMessage = async (raw: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const message = raw.trim();
    if (!message || loading) return;
    const userMessage: Message = { id: Date.now().toString(), content: message, role: "user", createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError("");
    setAssistantThinking(false);
    setAssistantReasoning("");
    let assistantContent = "";
    try {
      // Translate replies into the chosen language when speak-translate is on
      // and a non-English language is selected (the model replies in that
      // language, then we speak the result).
      const langName = languageName(languages, speakLang);
      // Auto model: quick-action tasks keep their recommended model; a plain
      // "Auto" is sent through to the backend, which routes it via the user's
      // default provider / per-feature preference (BYOK) — the provider is
      // never picked in the browser.
      const resolvedModel = model === "auto" ? (task ? recommendModel(message, task) : "auto") : model;
      // Translation follows the selected language (the speak toggle only
      // controls whether the reply is spoken aloud).
      const response = await chatService.streamChat(
        message,
        conversationId,
        resolvedModel || undefined,
        speakLang !== "en" ? langName : undefined,
        speakLang,
        searchEnabled,
        undefined,
        attachedFile?.id
      );
      setAttachedFile(null);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const assistantId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id: assistantId, content: "", role: "assistant", createdAt: new Date().toISOString() }]);
      while (reader) {
        const { done, value } = await reader.read();
        if (done || controller.signal.aborted) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              setError(typeof data.error === "string" ? data.error : "Chat failed. Check your API keys.");
              break;
            }
            // Deep-reasoning phase: thinking markers frame the reasoning text
            // streamed by models like NVIDIA Inkling. The reasoning is shown
            // live on the message as an honest "thinking…" panel, and cleared
            // the moment real content starts.
            if (data.thinking === true) {
              setAssistantThinking(true);
              continue;
            }
            if (data.thinking === false) {
              setAssistantThinking(false);
              continue;
            }
            if (data.reasoning) {
              setAssistantReasoning((prev) => prev + data.reasoning);
              continue;
            }
            if (data.content) {
              setAssistantThinking(false);
              assistantContent += data.content;
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: assistantContent } : m));
            }
            if (data.conversationId) {
              setConversationId(data.conversationId);
              rememberLastConversation(data.conversationId);
            }
          }
        }
      }
    } catch (err) { console.error("Chat error:", err); setError("Chat failed. Check your API keys."); }
    finally {
      abortControllerRef.current = null;
      setLoading(false);
      setAssistantThinking(false);
      if (speakEnabled && assistantContent) {
        try { await speakReply(assistantContent); } catch { /* spoken reply is best-effort */ }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  // ── Regenerate: remove the last assistant message and re-send the last user message ──
  const handleRegenerate = async () => {
    if (loading) return;
    // Find the last user message
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    const lastUserMsg = [...messages].reverse()[lastUserIdx];
    // Remove the last assistant message if it follows the last user message
    setMessages((prev) => {
      const lastIdx = prev.length - 1;
      if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
        return prev.slice(0, lastIdx);
      }
      return prev;
    });
    // Re-send the last user message
    await sendMessage(lastUserMsg.content);
  };

  // ── Saved-prompt insertion ─────────────────────────────────────────────
  const openPromptPicker = () => {
    if (recording) return; // don't interrupt live dictation
    const ta = messageInputRef.current;
    promptCaretRef.current = ta ? ta.selectionStart ?? ta.value.length : 0;
    setPromptPickerOpen(true);
  };
  const closePromptPicker = () => {
    setPromptPickerOpen(false);
    // Return focus to the composer and restore the caret where it was.
    requestAnimationFrame(() => {
      const ta = messageInputRef.current;
      if (ta) {
        ta.focus();
        const pos = promptCaretRef.current;
        ta.setSelectionRange(pos, pos);
      }
    });
  };
  // Shared insertion: splice text at the captured caret with smart spacing,
  // then leave the caret right after the inserted text. Used by the insert
  // picker and by "Save & use" so both behave identically.
  const insertTextAtCaret = (text: string) => {
    const ta = messageInputRef.current;
    if (!ta) return;
    const caret = promptCaretRef.current;
    const before = ta.value.slice(0, caret);
    const after = ta.value.slice(caret);
    // Space out the insertion so words never get glued together.
    const needsBefore = before.length > 0 && !/\s$/.test(before);
    const needsAfter = after.length > 0 && !/^\s/.test(after);
    const toInsert = (needsBefore ? " " : "") + text + (needsAfter ? " " : "");
    const next = before + toInsert + after;
    setInput(next);
    // Caret lands right after the inserted prompt.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = (before + toInsert).length;
      ta.setSelectionRange(pos, pos);
    });
  };
  const insertPrompt = (text: string) => {
    setPromptPickerOpen(false);
    insertTextAtCaret(text);
  };

  // ── Save the current composer message as a prompt ─────────────────────
  const openSavePrompt = () => {
    const text = input.trim();
    if (!text) return;
    if (promptPickerOpen) setPromptPickerOpen(false);
    // Capture the caret so "Save & use" can insert the prompt exactly here.
    const ta = messageInputRef.current;
    promptCaretRef.current = ta ? ta.selectionStart ?? ta.value.length : 0;
    // Auto-sync: if this exact message is already saved, edit that prompt so
    // title and text stay in sync instead of creating a duplicate.
    const existing = authUser?.id
      ? getSavedPrompts(authUser.id).find((p) => p.prompt.trim() === text)
      : undefined;
    setSavePromptEditId(existing?.id ?? null);
    setPromptTitle(existing?.title ?? autoPromptTitle(text));
    setSavePromptOpen(true);
  };
  const closeSavePrompt = () => {
    setSavePromptOpen(false);
    setSavePromptEditId(null);
    requestAnimationFrame(() => messageInputRef.current?.focus());
  };
  const saveCurrentPrompt = () => {
    const title = promptTitle.trim();
    const text = input.trim();
    if (!authUser?.id || !title || !text) return;
    promptSavedWasUpdate.current = !!savePromptEditId;
    savePrompt(authUser.id, { id: savePromptEditId ?? undefined, title, prompt: text });
    refreshSavedPromptCount();
    setSavePromptOpen(false);
    setSavePromptEditId(null);
    setPromptSavedFlash(true);
    if (promptSavedTimer.current !== null) window.clearTimeout(promptSavedTimer.current);
    promptSavedTimer.current = window.setTimeout(() => setPromptSavedFlash(false), 2200);
    requestAnimationFrame(() => messageInputRef.current?.focus());
  };
  // Save the prompt AND immediately place it at the caret. Since the composer
  // usually holds exactly the text being saved, inserting it again would just
  // duplicate it — so when the composer already is that message, the text is
  // already "in use" and we only refocus it for sending.
  const saveAndUsePrompt = () => {
    const title = promptTitle.trim();
    const text = input.trim();
    if (!authUser?.id || !title || !text) return;
    promptSavedWasUpdate.current = !!savePromptEditId;
    savePrompt(authUser.id, { id: savePromptEditId ?? undefined, title, prompt: text });
    refreshSavedPromptCount();
    setSavePromptOpen(false);
    setSavePromptEditId(null);
    setPromptSavedFlash(true);
    if (promptSavedTimer.current !== null) window.clearTimeout(promptSavedTimer.current);
    promptSavedTimer.current = window.setTimeout(() => setPromptSavedFlash(false), 2200);
    const ta = messageInputRef.current;
    if (ta && ta.value.trim() === text) {
      // Already in the composer — keep it as-is, caret to the end, ready to send.
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    } else {
      insertTextAtCaret(text);
    }
  };
  // Clear the saved-flash timer when leaving the chat page.
  useEffect(() => () => { if (promptSavedTimer.current !== null) window.clearTimeout(promptSavedTimer.current); }, []);

  // Keep the latest sendMessage + toggleVoice + dictation prefs + the prompt
  // picker opener reachable from the long-lived callbacks and shortcut handler.
  useEffect(() => {
    sendMessageRef.current = sendMessage;
    toggleVoiceRef.current = toggleVoice;
    openPromptPickerRef.current = openPromptPicker;
    translateDictationRef.current = translateDictation;
    dictateLangRef.current = dictateLang;
    dictateToRef.current = dictateTo;
    languagesRef.current = languages;
  });

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
      const isImage = file.type.startsWith("image/");
      setAttachedFile({ name: data.originalName, size: file.size, id: data.id, previewUrl: isImage ? URL.createObjectURL(file) : undefined });
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "File upload failed";
      console.error("File upload error:", err);
      setError(typeof msg === "string" ? msg : "File upload failed");
    } finally {
      abortControllerRef.current = null;
      setUploading(false);
    }
  };

  // ── Drag-and-drop: highlight composer on drag-enter, upload on drop ──
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) { setDragOver(false); dragCounterRef.current = 0; }
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false); dragCounterRef.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setError("File is too large. Maximum size is 50MB."); return; }
    setUploading(true); setError("");
    fileService.upload(file, conversationId).then(({ data }) => {
      const isImage = file.type.startsWith("image/");
      setAttachedFile({ name: data.originalName, size: file.size, id: data.id, previewUrl: isImage ? URL.createObjectURL(file) : undefined });
    }).catch((err: any) => {
      setError(err.response?.data?.error || err.message || "File upload failed");
    }).finally(() => { setUploading(false); });
  };

  // ── Clipboard paste: Ctrl/Cmd+V with an image on the clipboard ──
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file || file.size > 50 * 1024 * 1024) { setError("Image too large (max 50MB)."); return; }
        setUploading(true); setError("");
        fileService.upload(file, conversationId).then(({ data }) => {
          setAttachedFile({ name: data.originalName || file.name, size: file.size, id: data.id, previewUrl: URL.createObjectURL(file) });
        }).catch((err: any) => {
          setError(err.response?.data?.error || err.message || "Image upload failed");
        }).finally(() => { setUploading(false); });
        break;
      }
    }
  }, [conversationId]);

  // ── Attachment menu: click-outside to close ──
  useEffect(() => {
    if (!attachMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) setAttachMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick, { passive: true });
    return () => document.removeEventListener("mousedown", onClick);
  }, [attachMenuOpen]);

  // ── Trigger file input with specific accept filter ──
  const triggerFileInput = (accept?: string) => {
    setAttachMenuOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept || "*/*";
      fileInputRef.current.click();
    }
  };

  return (
    <div className="flex h-full">
      {/* Conversation rail — real conversations: collapsible rail on desktop,
          slide-in drawer on mobile. */}
      <ChatRail
        activeId={id || conversationId}
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((v) => !v)}
        refreshSignal={railRefresh}
        mobileOpen={railMobileOpen}
        onCloseMobile={() => setRailMobileOpen(false)}
      />

      {/* Messages + composer */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Messages */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto">
        {/* Ambient lighting — soft depth behind the conversation */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,hsl(var(--primary)/0.09),transparent)]" />
        <div className={cn("relative mx-auto w-full px-4 sm:px-6", messages.length === 0 ? "max-w-3xl" : "max-w-3xl py-6")}>
          {/* Mobile conversation trigger — opens the slide-in rail drawer */}
          <div className="mb-3 flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setRailMobileOpen(true)}
              aria-label="Open conversations"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chats
            </button>
          </div>
          {(id || (conversationId && messages.length > 0)) && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {id && (
                <>
                  <Link
                    to="/history"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    History
                  </Link>
                  <Link
                    to="/chat"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New Chat
                  </Link>
                </>
              )}
              {/* Real memory indicator — this conversation's messages are sent
                  to the model as context, so "memory" is genuinely in use. It
                  appears for loaded conversations AND fresh ones once the first
                  exchange exists, and deep-links into AI Memory focused on this
                  conversation. */}
              {messages.length > 0 && (
                <Link
                  to={`/memory?focus=${conversationId || id}`}
                  title="This conversation's messages are used as context for every reply — open it in AI Memory"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary shadow-sm transition-colors hover:bg-primary/10"
                >
                  <Brain className="h-3.5 w-3.5" />
                  Memory used — {messages.length} message{messages.length === 1 ? "" : "s"} in context
                </Link>
              )}
            </div>
          )}

          <AnimatePresence>
            {messages.length === 0 && !loading && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-4 pt-10 sm:pt-16">
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent text-primary ring-1 ring-primary/25">
                    <Sparkles className="h-7 w-7" strokeWidth={1.8} />
                  </div>
                  <h1 className="display-tight text-3xl font-bold tracking-tight sm:text-4xl">
                    What can I help with?
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                    Ask anything, or pick a quick action to get started
                  </p>
                </div>
                <QuickActions />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-5">
            {messages.map((message) => (
              // Replay in the language the reply was actually spoken in (saved on
              // the message), falling back to the current speak-translate setting.
              <ChatMessage
                key={message.id}
                message={message}
                replayLang={message.language || speakLang}
                thinking={assistantThinking && message.id === (messages[messages.length - 1]?.id)}
                reasoning={message.id === (messages[messages.length - 1]?.id) ? assistantReasoning : ""}
                onRegenerate={!loading && message.role === "assistant" && message.id === messages[messages.length - 1]?.id ? handleRegenerate : undefined}
              />
            ))}
          </div>

          {loading && (
            <div className="flex items-center gap-3 py-3 text-muted-foreground" aria-label="NexusAI is thinking">
              <NexusCore size={22} state="thinking" />
              <span className="text-[13px] font-medium">Nexus is thinking…</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating composer — elevated surface with a gradient hairline */}
      <div className="relative shrink-0 px-4 pb-5 pt-2 sm:px-6">
        {/* Ambient glow beneath the composer */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-14 bottom-0 bg-[radial-gradient(55%_100%_at_50%_100%,hsl(var(--primary)/0.08),transparent)]" />
        <div className="relative mx-auto w-full max-w-3xl">
          <PromptPicker
            open={promptPickerOpen}
            onClose={closePromptPicker}
            onInsert={insertPrompt}
            userId={authUser?.id}
          />
          {savePromptOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              role="dialog"
              aria-label="Save message as prompt"
              className="absolute bottom-full right-0 z-50 mb-2 w-80 max-w-full overflow-hidden rounded-xl border border-border bg-popover shadow-float"
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Bookmark className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-xs font-semibold">{savePromptEditId ? "Update prompt" : "Save as prompt"}</span>
              </div>
              <div className="p-3">
                <label htmlFor="prompt-title-input" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Title
                </label>
                <input
                  id="prompt-title-input"
                  value={promptTitle}
                  onChange={(e) => setPromptTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); saveCurrentPrompt(); }
                    if (e.key === "Escape") { e.preventDefault(); closeSavePrompt(); }
                  }}
                  placeholder="e.g. Summarize a paper"
                  autoFocus
                  className="h-10 w-full rounded-lg border border-border bg-muted/40 px-3 text-sm outline-none transition-colors focus:border-primary/60"
                />
                {savePromptEditId && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-primary">
                    <Check className="h-3 w-3" /> This message is already saved — editing the existing prompt keeps it in sync.
                  </p>
                )}
                <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={input}>
                  {input.trim().slice(0, 90)}{input.trim().length > 90 ? "…" : ""}
                </p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeSavePrompt}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveCurrentPrompt}
                    disabled={!promptTitle.trim()}
                    title="Save the prompt only"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                  >
                    {savePromptEditId ? "Update prompt" : "Save prompt"}
                  </button>
                  <button
                    type="button"
                    onClick={saveAndUsePrompt}
                    disabled={!promptTitle.trim()}
                    title="Save the prompt and insert it at the caret"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-40"
                  >
                    <CornerDownLeft className="h-3 w-3" /> Save &amp; use
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          {promptSavedFlash && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              role="status"
              className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success"
            >
              <Check className="h-3.5 w-3.5" /> {promptSavedWasUpdate.current ? "Prompt updated" : "Prompt saved"}
            </motion.div>
          )}
          <div className="rounded-2xl bg-gradient-to-b from-border via-border/60 to-border/20 p-px shadow-float relative">
            <div
              className={cn("surface-glow rounded-2xl bg-card/90 p-3.5 backdrop-blur-md transition-shadow duration-200 sm:p-4 relative", dragOver && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background")}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
            {/* Drag-drop overlay */}
            <AnimatePresence>
              {dragOver && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/10 backdrop-blur-sm">
                  <Paperclip className="mb-2 h-8 w-8 text-primary/70" />
                  <p className="text-sm font-medium text-primary">Drop to attach</p>
                  <p className="mt-1 text-xs text-muted-foreground">Image or file up to 50MB</p>
                </motion.div>
              )}
            </AnimatePresence>
          {error && (
            <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
              <span>{error}</span>
            </div>
          )}

          {attachedFile && (
            <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/8 px-3.5 py-2.5 text-sm">
              {attachedFile.previewUrl ? (
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border/50">
                  <img src={attachedFile.previewUrl} alt={attachedFile.name} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{attachedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {attachedFile.size < 1024 ? `${attachedFile.size} B` : `${(attachedFile.size / 1024).toFixed(1)} KB`} · {attachedFile.previewUrl ? "image will be sent with your message" : "content will be included as context"}
                </p>
              </div>
              <button type="button" onClick={() => { if (attachedFile.previewUrl) URL.revokeObjectURL(attachedFile.previewUrl); setAttachedFile(null); }} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary" aria-label="Remove attached file">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Controls row — compact: model picker + icon toggles, single line */}
          <div className="mb-1.5 flex items-center gap-1.5 overflow-x-auto">
            <div className="relative shrink-0">
              <Select
                value={model}
                onChange={(v) => {
                  setModel(v);
                  if (v !== "auto") rememberTaskModel(task || "_default", v);
                }}
                options={
                  models.length > 0
                    ? models.map((m) => ({ value: m.id, label: m.name }))
                    : [{ value: "auto", label: "Auto — best for task" }]
                }
                searchable
                ariaLabel="Model"
                leadingIcon={
                  <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                }
              />
            </div>

            <div className="mx-0.5 h-4 w-px shrink-0 bg-border/60" />

            <button
              type="button"
              onClick={toggleSearch}
              title={searchEnabled ? "Web search ON — replies use live results" : "Web search off"}
              aria-label="Search the web for replies"
              aria-pressed={searchEnabled}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors",
                searchEnabled
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search</span>
            </button>

            <button
              type="button"
              onClick={toggleSpeak}
              title="Speak replies aloud"
              aria-label="Speak replies"
              className={cn(
                "flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors",
                speakEnabled
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {speakEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Speak</span>
            </button>

            {languages.length > 0 && (
              <Select
                value={speakLang}
                onChange={changeSpeakLang}
                options={languages.map((l) => ({ value: l.code, label: l.name }))}
                searchable
                ariaLabel="Reply language"
                leadingIcon={<Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              />
            )}

            {voiceSupported && languages.length > 0 && (
              <Select
                value={dictateLang}
                onChange={changeDictateLang}
                options={languages.map((l) => ({ value: l.code, label: l.name }))}
                searchable
                ariaLabel="Dictate language"
                leadingIcon={<Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              />
            )}

            {voiceSupported && (
              <button
                type="button"
                onClick={toggleTranslateDictation}
                title="Translate dictated speech before sending"
                aria-label="Translate dictation"
                aria-pressed={translateDictation}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors",
                  translateDictation
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Languages className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Translate</span>
              </button>
            )}

            {translateDictation && languages.length > 0 && (
              <Select
                value={dictateTo}
                onChange={changeDictateTo}
                options={languages.map((l) => ({ value: l.code, label: l.name }))}
                searchable
                ariaLabel="Dictate to language"
                leadingIcon={<Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              />
            )}
          </div>

          {/* Live dictation panel — the interim transcript streams here while
              you speak; with dictation translation on, the original stays
              visible while the real translation is computed on stop. */}
          <AnimatePresence>
            {(recording || translatingDictation) && translateDictation && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                role="status"
                className="mb-2.5 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm"
              >
                <div className="mt-0.5 shrink-0">
                  {translatingDictation ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Mic className="h-4 w-4 animate-pulse-soft text-red-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {translatingDictation
                      ? `Translating into ${languageName(languages, dictateTo)}…`
                      : `Dictating in ${languageName(languages, dictateLang)}`}
                  </p>
                  <p className={cn("mt-0.5 leading-relaxed", translatingDictation && "text-muted-foreground")}>
                    {dictationText || (recording ? "Listening…" : "")}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className={cn(
              "flex min-w-0 flex-1 items-end gap-1 rounded-xl border bg-muted/40 p-1.5 transition-all",
              recording ? "border-red-500/50 ring-2 ring-red-500/20" : "border-border/80 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15"
            )}>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <div className="relative" ref={attachMenuRef}>
                <button type="button" onClick={() => setAttachMenuOpen((v) => !v)} disabled={uploading} title="Attach a file or image" aria-label="Attach a file or image" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
                  {uploading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.9} />}
                </button>
                <AnimatePresence>
                  {attachMenuOpen && (
                    <motion.div initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.96 }} transition={{ duration: 0.15 }} className="absolute bottom-full left-0 mb-2 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-xl z-50">
                      <button type="button" onClick={() => triggerFileInput()} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-accent">
                        <FileText className="h-4 w-4 text-primary" /> <span>Upload file</span>
                      </button>
                      <button type="button" onClick={() => triggerFileInput("image/*")} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-accent">
                        <ImageIcon className="h-4 w-4 text-pink-500" /> <span>Upload image</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {voiceSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  disabled={loading || translatingDictation}
                  title={recording ? "Stop recording" : `Dictate a message in ${languageName(languages, dictateLang)}`}
                  aria-label={recording ? "Stop recording" : "Dictate a message"}
                  className={cn(
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-50",
                    recording ? "bg-red-500/15 text-red-500 animate-pulse-soft" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Mic className="h-[18px] w-[18px]" strokeWidth={1.9} />
                  {/* Active dictate language — the last choice is remembered per
                      browser (localStorage) and shown at a glance. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute -bottom-1 -right-1 rounded-md border px-1 text-[8px] font-bold leading-tight tracking-wide",
                      recording
                        ? "border-red-500/40 bg-red-950/90 text-red-300"
                        : "border-border bg-background/90 text-muted-foreground"
                    )}
                  >
                    {dictateLang.toUpperCase()}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={openSavePrompt}
                disabled={!input.trim() || uploading}
                title={savedPromptCount > 0 ? `Save this message as a prompt (${savedPromptCount} saved)` : "Save this message as a reusable prompt"}
                aria-label="Save as prompt"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                <Bookmark className="h-[18px] w-[18px]" strokeWidth={1.9} />
                {/* Live count of saved prompts — refreshes on save and on tab focus. */}
                {savedPromptCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-1 -right-1 rounded-md border border-border bg-background/90 px-1 text-[8px] font-bold leading-tight tabular-nums text-muted-foreground"
                  >
                    {savedPromptCount > 99 ? "99+" : savedPromptCount}
                  </span>
                )}
              </button>
              <textarea
                ref={messageInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
                onPaste={handlePaste}
                placeholder={recording ? "Listening... speak now" : "Message NexusAI..."}
                aria-label="Message NexusAI"
                rows={1}
                className="max-h-48 min-h-[44px] w-full resize-none bg-transparent px-2 py-2.5 text-[15px] leading-relaxed text-foreground caret-primary outline-none placeholder:text-muted-foreground"
              />
              {loading ? (
                <button type="button" onClick={stopGeneration} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive transition-colors hover:bg-destructive/25" aria-label="Stop generation">
                  <Square className="h-4 w-4" fill="currentColor" />
                </button>
              ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} className="h-9 w-9 shrink-0 rounded-xl" aria-label="Send message">
                <Send className="h-4 w-4" />
              </Button>
              )}
            </div>
          </form>
              <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
                NexusAI can make mistakes — check important info. <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Ctrl/⌘ + N</kbd> for a new chat{voiceSupported && <> · <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Ctrl/⌘ ⇧ M</kbd> for dictation</>} · <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Ctrl/⌘ ⇧ P</kbd> to insert a saved prompt
              </p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
