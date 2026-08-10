import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image as ImageIcon, Loader2, Download, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imageService } from "@/services/image.service";
import { cn } from "@/utils/cn";

interface GeneratedImage {
  url: string;
  prompt: string;
  model: string;
  createdAt: number;
}

const FALLBACK_MODELS = [
  { id: "fal-ai/flux/schnell", name: "FLUX Schnell (Fast)" },
  { id: "fal-ai/flux/dev", name: "FLUX Dev (High Quality)" },
  { id: "fal-ai/stable-diffusion-xl", name: "Stable Diffusion XL" },
  { id: "fal-ai/flux-pro", name: "FLUX Pro (Best Quality)" },
];

const STORAGE_KEY = "nexusai-image-gallery";

export function ImageStudio() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("fal-ai/flux/schnell");
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setImages(JSON.parse(saved));
    } catch { /* ignore corrupt storage */ }
    imageService
      .getModels()
      .then(({ data }) => { if (Array.isArray(data) && data.length) setModels(data); })
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
      setImages((prev) => [{ url: data.url, prompt: prompt.trim(), model, createdAt: Date.now() }, ...prev]);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Image generation failed. Check your provider API key and credits.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ImageIcon className="w-6 h-6 text-primary" /> Image Studio</h1>
        <p className="text-muted-foreground mt-1">Turn your imagination into images with FLUX and Stable Diffusion</p>
      </div>

      {/* Generator panel */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-4 space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
          placeholder="Describe the image you want... e.g. A cyberpunk city at night, neon lights reflecting on wet streets"
          rows={3}
          className="w-full resize-none rounded-lg border border-input bg-muted px-4 py-3 text-foreground caret-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                  model === m.id ? "bg-primary text-primary-foreground border-primary" : "border-border bg-muted hover:bg-accent"
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <Button onClick={handleGenerate} disabled={!prompt.trim() || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {loading ? "Generating..." : "Generate"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/50 rounded-lg p-3">{error}</p>}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" /> Creating your image — this can take up to a minute...
          </div>
        )}
      </motion.div>

      {/* Gallery */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Your Gallery {images.length > 0 && <span className="text-muted-foreground text-sm font-normal">({images.length})</span>}</h2>
        {images.length === 0 && !loading ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No images yet</p>
            <p className="text-sm">Describe an image above and hit Generate</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {images.map((img, index) => (
                <motion.div
                  key={img.createdAt + index}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group relative rounded-xl overflow-hidden border border-border bg-card"
                >
                  <img src={img.url} alt={img.prompt} loading="lazy" className="w-full aspect-square object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    <p className="text-white text-sm line-clamp-2">{img.prompt}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-white/70">{img.model.split("/").pop()}</span>
                      <a href={img.url} target="_blank" rel="noreferrer" download aria-label="Download image" className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
