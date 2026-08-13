import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Sparkles, MessageSquare, FileText, Image as ImageIcon, Clapperboard, Mic,
  Bot, BarChart3, Code2, Check, Sun, Moon, Monitor, ChevronRight, Loader2,
  ArrowRight,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useThemeStore, ThemeMode } from "@/store/theme.store";
import { authService } from "@/services/auth.service";
import { chatService } from "@/services/chat.service";
import { getAIPreferences, setAIPreferences } from "@/utils/aiPreferences";
import { completeOnboarding } from "@/utils/onboarding";
import { NexusCore } from "@/components/ui/nexus-core";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { cn } from "@/utils/cn";

const INTERESTS = [
  { id: "chat", label: "Chat with AI", desc: "Ask anything, get answers", icon: MessageSquare },
  { id: "files", label: "Analyze Files", desc: "Documents, PDFs, spreadsheets", icon: FileText },
  { id: "images", label: "Create Images", desc: "Generate art & designs", icon: ImageIcon },
  { id: "videos", label: "Create Videos", desc: "Cinematic clips", icon: Clapperboard },
  { id: "voice", label: "Voice & Translation", desc: "Speak, transcribe, translate", icon: Mic },
  { id: "agents", label: "Build AI Agents", desc: "Automate workflows", icon: Bot },
  { id: "data", label: "Analyze Data", desc: "Insights from numbers", icon: BarChart3 },
  { id: "code", label: "Code", desc: "Write & debug software", icon: Code2 },
] as const;

type InterestId = (typeof INTERESTS)[number]["id"];

const THEMES: { id: ThemeMode; label: string; desc: string; icon: typeof Sun }[] = [
  { id: "dark", label: "Dark", desc: "Deep, focused workspace", icon: Moon },
  { id: "light", label: "Light", desc: "Clean, bright workspace", icon: Sun },
  { id: "system", label: "System", desc: "Follow your device", icon: Monitor },
];

const stepVariants = {
  enter: { opacity: 0, y: 18, scale: 0.985 },
  center: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -14, scale: 0.985 },
};

/** Deterministic ambient particles (no Math.random in render). */
function useParticles(count: number) {
  return useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 37 + 11) % 100}%`,
        top: `${(i * 53 + 7) % 100}%`,
        delay: (i % 6) * 0.7,
        duration: 7 + (i % 4) * 2,
        size: 3 + (i % 3) * 2,
        opacity: 0.25 + (i % 4) * 0.12,
      })),
    [count]
  );
}

export function Onboarding() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user, updateUser } = useAuthStore();
  const themeMode = useThemeStore((s) => s.mode);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [interests, setInterests] = useState<InterestId[]>([]);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [model, setModel] = useState(getAIPreferences().defaultModel || "auto");
  const particles = useParticles(14);

  const totalSteps = 5; // 1 name, 2 interests, 3 model, 4 appearance, 5 ready
  const progress = step === 0 ? 0 : Math.min(step, totalSteps);

  useEffect(() => {
    // Step 3 needs the real model catalog.
    chatService
      .getModels()
      .then((res) => {
        const list = res.data;
        if (Array.isArray(list)) setModels(list);
      })
      .catch(() => {
        /* model list is optional — Auto still works */
      });
  }, []);

  const persistModel = () => {
    const current = getAIPreferences();
    if (current.defaultModel !== model) setAIPreferences({ defaultModel: model });
  };

  const finish = (finalInterests: string[]) => {
    if (!user) return;
    persistModel();
    completeOnboarding(user.id, finalInterests);
    navigate("/dashboard", { replace: true });
  };

  const skip = () => finish([]);

  const next = () => {
    if (step === 1) {
      // Name step — save to the real profile API before moving on.
      const trimmed = name.trim();
      if (!trimmed) {
        setStep(2);
        return;
      }
      setSavingName(true);
      setNameError("");
      authService
        .updateProfile({ name: trimmed })
        .then(() => {
          updateUser({ name: trimmed });
          setStep(2);
        })
        .catch(() => setNameError("Unable to save your profile."))
        .finally(() => setSavingName(false));
      return;
    }
    if (step >= totalSteps) {
      finish(interests);
      return;
    }
    if (step === 3) persistModel();
    setStep((s) => s + 1);
  };

  // Keyboard: Enter advances, Escape skips. If a focused button is pressed,
  // let the button's own click handler run (avoid double-advance).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        skip();
      } else if (e.key === "Enter" && (e.target as HTMLElement)?.tagName !== "BUTTON") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, name, savingName, interests, model, user]);

  const heading =
    step === 0
      ? { title: "NexusAI", sub: "Your intelligent workspace." }
      : step === 1
        ? { title: "What should we call you?", sub: "This personalizes your workspace." }
        : step === 2
          ? { title: "What do you want to do?", sub: "Pick what you'll use most — you can do everything later." }
          : step === 3
            ? { title: "AI Preferences", sub: "Choose the model your chats start with." }
            : step === 4
              ? { title: "Choose your workspace", sub: "You can change this anytime in Settings." }
              : { title: "You're ready.", sub: "Welcome to NexusAI. Your AI workspace is waiting." };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Spatial environment + subtle particles */}
      <SpatialEnvironment />
      {!reduced &&
        particles.map((p, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute rounded-full bg-primary/40"
            style={{ left: p.left, top: p.top, width: p.size, height: p.size, filter: "blur(1px)" }}
            animate={{ y: [0, -26, 0], opacity: [p.opacity, p.opacity * 0.45, p.opacity] }}
            transition={{ duration: p.duration, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
          />
        ))}

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">NexusAI</span>
        </div>
        <div className="flex items-center gap-4">
          {step > 0 && step <= totalSteps && (
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              STEP {String(Math.min(step, totalSteps)).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
            </span>
          )}
          {step > 0 && (
            <button
              onClick={skip}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Skip for now
            </button>
          )}
        </div>
      </header>

      {/* Progress dots */}
      {step > 0 && (
        <div className="relative z-10 flex items-center justify-center gap-2" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i < progress ? "w-6 bg-primary" : i === progress - 1 ? "w-6 bg-primary/50" : "w-1.5 bg-border"
              )}
            />
          ))}
        </div>
      )}

      {/* Steps */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduced ? 0 : 0.3, ease: "easeOut" }}
            className="w-full max-w-2xl text-center"
          >
            {/* Nexus Core on hero + ready */}
            {(step === 0 || step === totalSteps) && (
              <div className="mb-8 flex justify-center">
                <div className="scale-75 sm:scale-100">
                  <NexusCore size={240} state={step === totalSteps ? "success" : "idle"} />
                </div>
              </div>
            )}

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {step === 0 ? (
                <>
                  Nexus<span className="text-gradient">AI</span>
                </>
              ) : (
                heading.title
              )}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">{heading.sub}</p>

            {/* ── Step 0: hero ─────────────────────────────────────── */}
            {step === 0 && (
              <div className="mt-8">
                <button
                  onClick={next}
                  className="group inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-popover transition-all hover:bg-primary-hover hover:shadow-lg"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  Think · Create · Analyze · Automate
                </p>
              </div>
            )}

            {/* ── Step 1: name ─────────────────────────────────────── */}
            {step === 1 && (
              <form
                className="mx-auto mt-8 max-w-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  next();
                }}
              >
                <label htmlFor="onboarding-name" className="sr-only">
                  Your name
                </label>
                <input
                  id="onboarding-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                  className="h-13 w-full rounded-xl border border-border bg-card/80 px-4 py-3 text-center text-base shadow-sm outline-none backdrop-blur transition-all placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                />
                {nameError && (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <p className="text-sm text-destructive">{nameError}</p>
                    <button
                      type="button"
                      onClick={next}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Try Again
                    </button>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={savingName}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-60"
                >
                  {savingName ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      Continue <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ── Step 2: interests ────────────────────────────────── */}
            {step === 2 && (
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {INTERESTS.map((item) => {
                  const active = interests.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setInterests((prev) =>
                          active ? prev.filter((i) => i !== item.id) : [...prev, item.id]
                        )
                      }
                      aria-pressed={active}
                      className={cn(
                        "group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center shadow-sm transition-all duration-200",
                        active
                          ? "border-primary/60 bg-primary/10 shadow-popover"
                          : "border-border/80 bg-card/70 hover:-translate-y-0.5 hover:border-primary/35"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110",
                          active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                        )}
                      >
                        <item.icon className="h-5 w-5" strokeWidth={1.8} />
                      </span>
                      <span className="text-xs font-semibold leading-tight">{item.label}</span>
                      <span className="hidden text-[10px] leading-tight text-muted-foreground sm:block">
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Step 3: model ────────────────────────────────────── */}
            {step === 3 && (
              <div className="mx-auto mt-8 max-w-md space-y-2 text-left">
                <button
                  type="button"
                  onClick={() => setModel("auto")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all",
                    model === "auto"
                      ? "border-primary/60 bg-primary/10 shadow-popover"
                      : "border-border/80 bg-card/70 hover:border-primary/35"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">Auto</span>
                      <span className="block text-[11px] text-muted-foreground">
                        Best model for each task
                      </span>
                    </span>
                  </span>
                  {model === "auto" && <Check className="h-4 w-4 text-primary" />}
                </button>
                {models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModel(m.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all",
                      model === m.id
                        ? "border-primary/60 bg-primary/10 shadow-popover"
                        : "border-border/80 bg-card/70 hover:border-primary/35"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <MessageSquare className="h-4 w-4" />
                      </span>
                      <span className="block text-sm font-semibold">{m.name}</span>
                    </span>
                    {model === m.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            )}

            {/* ── Step 4: appearance ───────────────────────────────── */}
            {step === 4 && (
              <div className="mx-auto mt-8 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
                {THEMES.map((t) => {
                  const active = themeMode === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => useThemeStore.getState().setMode(t.id)}
                      aria-pressed={active}
                      className={cn(
                        "group rounded-2xl border p-3 text-center shadow-sm transition-all duration-200",
                        active
                          ? "border-primary/60 bg-primary/10 shadow-popover"
                          : "border-border/80 bg-card/70 hover:-translate-y-0.5 hover:border-primary/35"
                      )}
                    >
                      <span
                        className={cn(
                          "mx-auto mb-3 flex h-12 w-full items-center justify-center overflow-hidden rounded-lg border sm:h-16",
                          t.id === "dark"
                            ? "border-border bg-[#0b0b12]"
                            : t.id === "light"
                              ? "border-border bg-[#fafaf8]"
                              : "border-border"
                        )}
                      >
                        {t.id === "system" ? (
                          <span className="flex h-full w-full">
                            <span className="h-full w-1/2 bg-[#0b0b12]" />
                            <span className="h-full w-1/2 bg-[#fafaf8]" />
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "h-2.5 w-10 rounded-full",
                              t.id === "dark" ? "bg-primary/80" : "bg-primary/70"
                            )}
                          />
                        )}
                      </span>
                      <span className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                        <t.icon className="h-3.5 w-3.5" /> {t.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{t.desc}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Step 5: ready ────────────────────────────────────── */}
            {step === totalSteps && (
              <div className="mt-8">
                <button
                  onClick={() => finish(interests)}
                  className="group inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-popover transition-all hover:bg-primary-hover hover:shadow-lg"
                >
                  Enter NexusAI
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer hint */}
      {step > 0 && step < totalSteps && (
        <footer className="relative z-10 pb-5 text-center">
          <button
            onClick={next}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Continue <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </footer>
      )}
    </div>
  );
}
