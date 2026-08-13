import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { Video as VideoIcon, Loader2, Download, Clapperboard, AlertTriangle, Film, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DictationButton } from "@/components/ui/dictation-button";
import { videoService } from "@/services/video.service";
import { providersService, ProviderStatus } from "@/services/providers.service";
import { cn } from "@/utils/cn";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

const FALLBACK_MODELS = [
  { id: "json2video", name: "JSON2Video (text render)" },
];

interface GeneratedVideo {
  url: string;
  prompt: string;
  model: string;
  createdAt: number;
}

export function VideoStudio() {
  // Pre-filled prompt from the Command Center (/video-studio?prompt=...).
  const [searchParams] = useSearchParams();
  const [prompt, setPrompt] = useState(() => searchParams.get("prompt") || "");
  const [model, setModel] = useState(FALLBACK_MODELS[0].id);
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [preview, setPreview] = useState<GeneratedVideo | null>(null);

  // Cinematic tilt — the preview follows the mouse like a floating monitor.
  const reduced = useReducedMotion();
  const tiltRef = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 55, damping: 18 });
  const springY = useSpring(rotateY, { stiffness: 55, damping: 18 });

  const onCanvasMove = (e: React.MouseEvent) => {
    if (reduced || !tiltRef.current) return;
    const rect = tiltRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 7);
    rotateX.set(-py * 5);
  };
  const resetTilt = () => { rotateX.set(0); rotateY.set(0); };

  useEffect(() => {
    videoService
      .getModels()
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) {
          setModels(data);
          // Default to the first model the API offers (Veo when configured).
          setModel((current) => (data.some((m: { id: string }) => m.id === current) ? current : data[0].id));
        }
      })
      .catch(() => { /* fall back to static list */ });
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creditWarnings, setCreditWarnings] = useState<string[]>([]);

  // Surface "out of credits" state up front so users know why generation may fail.
  useEffect(() => {
    providersService
      .getStatus()
      .then(({ data }) => {
        const warnings = (data.providers || [])
          .filter(
            (p: ProviderStatus) =>
              p.configured &&
              /video|veo/i.test(p.usedFor) &&
              (p.status === "no_credits" || /no credits|quota|exhausted|locked/i.test(p.detail || ""))
          )
          .map((p: ProviderStatus) => ({ name: p.name, detail: p.detail || "out of credits" }))
          .map((w: { name: string; detail: string }) => `${w.name}: ${w.detail}`);
        setCreditWarnings(warnings);
      })
      .catch(() => { /* ignore — banner is best-effort */ });
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await videoService.generate(prompt.trim(), model);
      if (!data.url) throw new Error("No video URL returned");
      const vid = { url: data.url, prompt: prompt.trim(), model, createdAt: Date.now() };
      setVideos((prev) => [vid, ...prev]);
      setPreview(vid);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Video generation failed. Check your provider API key and credits.");
    } finally {
      setLoading(false);
    }
  };

  const currentPreview = loading ? null : preview;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        icon={VideoIcon}
        title="Video Studio"
        description="Generate short AI videos from a text description"
      />

      {creditWarnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium text-warning">AI video providers are out of credits</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {creditWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs">
              Generations will fall back to <span className="font-medium text-foreground">JSON2Video (text render)</span> for now.
              Top up at <a className="font-medium text-warning underline underline-offset-2" href="https://apiframe.ai/dashboard/billing" target="_blank" rel="noreferrer">apiframe.ai</a>
              {" or check your Google AI Studio quota (Veo) "}
              to get AI-generated footage instead.
            </p>
          </div>
        </motion.div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
        {/* ── Layered floating controls ─────────────────────────────── */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="h-fit lg:sticky lg:top-6">
          <div className="rounded-2xl bg-gradient-to-b from-border via-border/60 to-border/20 p-px shadow-float">
            <div className="surface-glow rounded-2xl bg-card/90 p-5 backdrop-blur-md transition-shadow duration-200">
              <div className="mb-4 flex items-center gap-2">
                <Clapperboard className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Create</h2>
              </div>

              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">Prompt</label>
                <DictationButton value={prompt} onChange={setPrompt} disabled={loading} onError={setError} />
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                placeholder="Describe the video… e.g. A drone shot flying over a misty mountain range at sunrise"
                rows={4}
                className="w-full resize-none rounded-xl border border-input bg-muted/40 px-3.5 py-3 text-sm text-foreground caret-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />

              <label className="mb-1.5 mt-4 block text-xs font-medium text-muted-foreground">Model</label>
              <Select
                value={model}
                onChange={setModel}
                options={models.map((m) => ({ value: m.id, label: m.name }))}
                searchable
                ariaLabel="Model"
                className="w-full"
              />

              <Button onClick={handleGenerate} disabled={!prompt.trim() || loading} className="mt-5 w-full" size="lg">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clapperboard className="h-4 w-4 mr-2" />}
                {loading ? "Rendering…" : "Generate video"}
              </Button>

              {error && (
                <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-xs text-destructive">{error}</p>
              )}
              {loading && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  Rendering your video — this can take a few minutes…
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Cinematic floating viewport + generation rail ─────────── */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.05 }} className="relative min-w-0">
          {/* Ambient glow behind the monitor */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-8 rounded-[2.5rem] blur-3xl"
            style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.14), transparent 65%)" }}
          />

          {/* Floating monitor — gentle tilt following the mouse */}
          <div ref={tiltRef} onMouseMove={onCanvasMove} onMouseLeave={resetTilt} style={{ perspective: 1300 }} className="relative">
            <motion.div style={{ transformStyle: "preserve-3d", rotateX: springX, rotateY: springY }}>
              <div className="rounded-2xl bg-gradient-to-b from-border via-border/60 to-border/20 p-px shadow-float">
                <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
                  {currentPreview ? (
                    <motion.video
                      key={currentPreview.createdAt}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      src={currentPreview.url}
                      controls
                      autoPlay
                      preload="metadata"
                      className="h-full w-full object-contain"
                    />
                  ) : loading ? (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="relative h-20 w-20">
                        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
                      </div>
                      <p className="text-sm">Rendering your video…</p>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Film}
                      title="Your video will appear here"
                      description="Describe a scene on the left and hit Generate video."
                      className="border-0 bg-transparent"
                    />
                  )}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Generation rail */}
          <div className="mt-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              Your videos
              {videos.length > 0 && <span className="font-normal text-muted-foreground">({videos.length})</span>}
            </h2>
            {videos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Generated videos will appear here.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                <AnimatePresence initial={false}>
                  {videos.map((video, index) => (
                    <motion.button
                      key={video.createdAt + index}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={() => setPreview(video)}
                      className={cn(
                        "group relative w-40 shrink-0 overflow-hidden rounded-xl border transition-all",
                        currentPreview?.createdAt === video.createdAt ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                      )}
                      aria-label={`View: ${video.prompt}`}
                    >
                      <video src={video.url} preload="metadata" muted className="aspect-video w-full bg-black object-cover" />
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <p className="truncate text-[10px] text-white">{video.prompt}</p>
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noreferrer"
                          download
                          aria-label="Download video"
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25"
                        >
                          <Download className="h-3 w-3" />
                        </a>
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
