import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { Image as ImageIcon, Loader2, Download, Sparkles, Wand2, ImagePlus, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DictationButton } from "@/components/ui/dictation-button";
import { imageService } from "@/services/image.service";
import { NexusCore } from "@/components/ui/nexus-core";
import { cn } from "@/utils/cn";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

interface GeneratedImage {
  url: string;
  prompt: string;
  model: string;
  createdAt: number;
}

const FALLBACK_MODELS = [
  { id: "fal-ai/flux/schnell", name: "FLUX Schnell" },
  { id: "fal-ai/flux/dev", name: "FLUX Dev" },
  { id: "fal-ai/stable-diffusion-xl", name: "SDXL" },
  { id: "fal-ai/flux-pro", name: "FLUX Pro" },
];

const STORAGE_KEY = "nexusai-image-gallery";

export function ImageStudio() {
  // Pre-filled prompt from the Command Center (/image-studio?prompt=...).
  const [searchParams] = useSearchParams();
  const [prompt, setPrompt] = useState(() => searchParams.get("prompt") || "");
  const [model, setModel] = useState("fal-ai/flux/schnell");
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<GeneratedImage | null>(null);

  // Subtle 3D tilt on the canvas — follows the mouse like a floating easel.
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
    rotateY.set(px * 8);
    rotateX.set(-py * 6);
  };
  const resetTilt = () => { rotateX.set(0); rotateY.set(0); };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const list = JSON.parse(saved);
        setImages(list);
        setPreview(list[0] || null);
      }
    } catch { /* ignore corrupt storage */ }
    imageService
      .getModels()
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) {
          setModels(data);
          // Keep the current pick if the API still offers it, otherwise fall
          // back to the first model the API provides (the static default may
          // not be in the live list).
          setModel((current) => (data.some((m: { id: string }) => m.id === current) ? current : data[0].id));
        }
      })
      .catch(() => { /* fall back to static list */ });
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(images.slice(0, 24))); } catch { /* ignore */ }
  }, [images]);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await imageService.generate(prompt.trim(), model);
      if (!data.url) throw new Error("No image URL returned");
      const img = { url: data.url, prompt: prompt.trim(), model, createdAt: Date.now() };
      setImages((prev) => [img, ...prev]);
      setPreview(img);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Image generation failed. Check your provider API key and credits.");
    } finally {
      setLoading(false);
    }
  };

  const currentPreview = loading ? null : preview;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        icon={ImageIcon}
        title="Image Studio"
        description="Turn your imagination into images — powered by FLUX, Gemini and more"
      />

      <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
        {/* ── Layered floating controls ─────────────────────────────── */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="h-fit lg:sticky lg:top-6">
          <div className="rounded-2xl bg-gradient-to-b from-border via-border/60 to-border/20 p-px shadow-float">
            <div className="surface-glow rounded-2xl bg-card/90 p-5 backdrop-blur-md transition-shadow duration-200">
              <div className="mb-4 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
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
                placeholder="Describe the image you want… e.g. A cyberpunk city at night, neon lights reflecting on wet streets"
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {loading ? "Creating…" : "Generate image"}
              </Button>

              {error && (
                <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-xs text-destructive">{error}</p>
              )}
              {loading && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  Creating your image — this can take up to a minute…
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Floating 3D viewport + generation history rail ────────── */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.05 }} className="relative min-w-0">
          {/* Ambient glow behind the canvas */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-8 rounded-[2.5rem] blur-3xl"
            style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.14), transparent 65%)" }}
          />

          {/* 3D easel — gentle tilt that follows the mouse */}
          <div ref={tiltRef} onMouseMove={onCanvasMove} onMouseLeave={resetTilt} style={{ perspective: 1300 }} className="relative">
            <motion.div style={{ transformStyle: "preserve-3d", rotateX: springX, rotateY: springY }}>
              <div className="rounded-2xl bg-gradient-to-b from-border via-border/60 to-border/20 p-px shadow-float">
                <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-card">
                  {/* Canvas backdrop */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{ background: "radial-gradient(circle at 50% 42%, hsl(var(--primary) / 0.06), transparent 60%), linear-gradient(hsl(var(--muted) / 0.35) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--muted) / 0.35) 1px, transparent 1px)", backgroundSize: "100% 100%, 28px 28px, 28px 28px" }}
                  />
                  {currentPreview ? (
                    <>
                      <motion.img
                        key={currentPreview.createdAt}
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35 }}
                        src={currentPreview.url}
                        alt={currentPreview.prompt}
                        className="relative h-full w-full object-contain"
                      />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4">
                        <p className="line-clamp-2 max-w-[80%] text-sm text-white">{currentPreview.prompt}</p>
                        <a
                          href={currentPreview.url}
                          target="_blank"
                          rel="noreferrer"
                          download
                          aria-label="Download image"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    </>
                  ) : loading ? (
                    <div className="relative flex flex-col items-center gap-3 text-muted-foreground">
                      <NexusCore size={72} state="thinking" />
                      <p className="text-sm">Rendering your image…</p>
                    </div>
                  ) : (
                    <EmptyState
                      icon={ImagePlus}
                      title="Your image will appear here"
                      description="Describe what you want on the left and hit Generate image."
                      className="relative border-0 bg-transparent"
                    />
                  )}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Generation history rail — real images from this device */}
          <div className="mt-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              Generation history
              {images.length > 0 && <span className="font-normal text-muted-foreground">({images.length})</span>}
            </h2>
            {images.length === 0 ? (
              <p className="text-xs text-muted-foreground">Generated images will be saved here on this device.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                <AnimatePresence initial={false}>
                  {images.map((img, index) => (
                    <motion.button
                      key={img.createdAt + index}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={() => setPreview(img)}
                      className={cn(
                        "group relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl border transition-all",
                        currentPreview?.createdAt === img.createdAt ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                      )}
                      aria-label={`View: ${img.prompt}`}
                    >
                      <img src={img.url} alt={img.prompt} loading="lazy" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <p className="line-clamp-2 text-left text-[9px] leading-tight text-white">{img.prompt}</p>
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
