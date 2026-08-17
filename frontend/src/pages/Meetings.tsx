import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Video, Loader2, Trash2, Clock, FileText, Sparkles, Mic, CalendarClock } from "lucide-react";
import { meetingsService, Meeting } from "@/services/meetings.service";
import { loadLanguages, LanguageOption } from "@/utils/languageCatalog";
import { NexusCore } from "@/components/ui/nexus-core";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function truncate(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean || "No transcript";
}

export function Meetings() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState({ title: "", sourceLang: "en", targetLang: "te" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    meetingsService.list().then(({ data }) => setMeetings(data.meetings)).catch(() => setError("Failed to load meetings — try again.")).finally(() => setLoading(false));
    loadLanguages().then(setLanguages).catch(() => {});
  }, []);

  const totals = useMemo(() => {
    const list = meetings || [];
    return {
      count: list.length,
      minutes: Math.floor(list.reduce((a, m) => a + m.durationSec, 0) / 60),
      summarized: list.filter((m) => m.summary).length,
    };
  }, [meetings]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || starting) return;
    setStarting(true);
    setError("");
    try {
      const { data } = await meetingsService.create(form);
      navigate(`/meetings/${data.meeting.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Couldn't start the meeting.");
      setStarting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await meetingsService.remove(id);
      setMeetings((list) => (list || []).filter((m) => m.id !== id));
      setConfirmDelete(null);
    } catch {
      setError("Couldn't delete the meeting.");
    }
  };

  const transition = reduced ? { duration: 0 } : { duration: 0.25, ease: "easeOut" as const };

  return (
    <div className="relative min-h-full">
      <SpatialEnvironment />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {/* ── Hero: Meeting Core ───────────────────────────────────────── */}
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <Mic className="h-3.5 w-3.5 text-primary" /> NexusAI
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                AI <span className="text-gradient">Meetings</span>
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Meet. Understand. Remember. Real microphone capture, live transcription and translation, and AI
                summaries — every word grounded in what was actually said.
              </p>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.15, duration: 0.45, ease: "easeOut" }}
            className="relative hidden lg:block"
          >
            <NexusCore size={230} state="idle" />
          </motion.div>
        </div>

        {/* ── Start a meeting ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { delay: 0.1, duration: 0.3, ease: "easeOut" }}
          className="card-surface mt-8 p-4 sm:p-5"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <CalendarClock className="h-4 w-4 text-primary" /> Start a meeting
          </h2>
          <form onSubmit={start} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Meeting title, e.g. Sprint planning"
              aria-label="Meeting title"
              className="surface-glow h-11 w-full rounded-xl border border-border bg-card/80 px-3.5 text-sm outline-none backdrop-blur-sm transition-colors focus:border-primary/60"
            />
            <select
              value={form.sourceLang}
              onChange={(e) => setForm({ ...form, sourceLang: e.target.value })}
              aria-label="Speech language"
              className="surface-glow h-11 rounded-xl border border-border bg-card/80 px-3 text-sm outline-none backdrop-blur-sm transition-colors focus:border-primary/60"
            >
              {languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            <select
              value={form.targetLang}
              onChange={(e) => setForm({ ...form, targetLang: e.target.value })}
              aria-label="Translate to language"
              className="surface-glow h-11 rounded-xl border border-border bg-card/80 px-3 text-sm outline-none backdrop-blur-sm transition-colors focus:border-primary/60"
            >
              {languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            <button
              type="submit"
              disabled={!form.title.trim() || starting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 px-5 text-sm font-medium text-primary-foreground shadow-glow-primary transition-all hover:opacity-90 disabled:opacity-40"
            >
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              Start meeting
            </button>
          </form>
          <p className="mt-2.5 text-[11px] text-muted-foreground">
            Your microphone opens in the meeting room. The live transcript is real speech-to-text through NexusAI's
            transcription service — nothing is simulated.
          </p>
        </motion.div>

        {error && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
            <span>{error}</span>
          </div>
        )}

        {/* ── History ──────────────────────────────────────────────────── */}
        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Clock className="h-4 w-4 text-muted-foreground" /> Meeting history
            </h2>
            {!loading && totals.count > 0 && (
              <span className="text-xs text-muted-foreground">
                {totals.count} meeting{totals.count === 1 ? "" : "s"} · {totals.minutes} min captured · {totals.summarized} summarized
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : (meetings || []).length === 0 ? (
            <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center backdrop-blur-sm">
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(60%_100%_at_50%_0%,hsl(var(--primary)/0.08),transparent)]" />
              <Mic className="relative mb-3 h-8 w-8 text-muted-foreground/60" strokeWidth={1.6} />
              <p className="relative text-sm font-medium">No meetings yet</p>
              <p className="relative mt-1 max-w-sm text-xs text-muted-foreground">
                Start your first meeting above — speak, and NexusAI transcribes, translates and summarizes it for you.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {(meetings || []).map((m) => (
                <div key={m.id} className="card-surface card-hover group flex items-center gap-3 p-3.5">
                  <span className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    m.status === "live" ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary"
                  )}>
                    <Video className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/meetings/${m.id}`} className="block">
                      <span className="flex items-center gap-2 truncate text-sm font-semibold hover:text-primary">
                        {m.title}
                        {m.status === "live" && (
                          <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-500">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live
                          </span>
                        )}
                        {m.summary && <Sparkles className="h-3 w-3 shrink-0 text-violet-500" />}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {truncate(m.transcript)}
                      </span>
                    </Link>
                  </div>
                  <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
                    {fmtDate(m.createdAt)} · {fmtDuration(m.durationSec)}
                  </span>
                  <Link
                    to={`/meetings/${m.id}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <FileText className="h-3 w-3" /> Open
                  </Link>
                  {confirmDelete === m.id ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => remove(m.id)}
                        className="rounded-lg bg-destructive px-2.5 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(m.id)}
                      aria-label={`Delete ${m.title}`}
                      className="shrink-0 rounded-lg p-1.5 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Honesty note ──────────────────────────────────────────────── */}
        <div className="surface-glow mt-10 rounded-2xl border border-border/70 bg-card/50 p-5 backdrop-blur-md">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Sparkles className="h-4 w-4 text-primary" /> What's real here
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            NexusAI has no video-call backend, so meetings are honest single-participant intelligence sessions: your
            real microphone feed goes through the live transcription service, translations and summaries come from the
            AI pipeline, and everything is stored under your account. There are no fake participants, recordings, or
            timestamps.
          </p>
        </div>
      </div>
    </div>
  );
}
