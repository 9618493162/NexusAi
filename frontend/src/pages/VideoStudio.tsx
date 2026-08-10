import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video as VideoIcon, Loader2, Download, Clapperboard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { videoService } from "@/services/video.service";
import { providersService, ProviderStatus } from "@/services/providers.service";
import { cn } from "@/utils/cn";

const FALLBACK_MODELS = [
  { id: "kling-2.6", name: "Kling 2.6" },
  { id: "veo-3.1", name: "Veo 3.1" },
  { id: "sora-2", name: "Sora 2" },
];

interface GeneratedVideo {
  url: string;
  prompt: string;
  model: string;
  createdAt: number;
}

export function VideoStudio() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(FALLBACK_MODELS[0].id);
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);

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
      setVideos((prev) => [{ url: data.url, prompt: prompt.trim(), model, createdAt: Date.now() }, ...prev]);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Video generation failed. Check your provider API key and credits.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><VideoIcon className="w-6 h-6 text-primary" /> Video Studio</h1>
        <p className="text-muted-foreground mt-1">Generate short AI videos from a text description</p>
      </div>

      {creditWarnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-600 dark:text-amber-400">AI video providers are out of credits</p>
            <ul className="text-muted-foreground mt-1 space-y-0.5">
              {creditWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              Generations will fall back to <span className="text-foreground">JSON2Video (text render)</span> for now.
              Top up at <a className="underline text-amber-600 dark:text-amber-400" href="https://apiframe.ai/dashboard/billing" target="_blank" rel="noreferrer">apiframe.ai</a>
              {" or check your Google AI Studio quota (Veo) "}
              to get AI-generated footage instead.
            </p>
          </div>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-4 space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
          placeholder="Describe the video... e.g. A drone shot flying over a misty mountain range at sunrise"
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
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Clapperboard className="w-4 h-4 mr-2" />}
            {loading ? "Generating..." : "Generate Video"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/50 rounded-lg p-3">{error}</p>}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Rendering your video — this can take a few minutes...
          </div>
        )}
      </motion.div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Your Videos {videos.length > 0 && <span className="text-muted-foreground text-sm font-normal">({videos.length})</span>}</h2>
        {videos.length === 0 && !loading ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <VideoIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No videos yet</p>
            <p className="text-sm">Describe a scene above and hit Generate Video</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence>
              {videos.map((video, index) => (
                <motion.div
                  key={video.createdAt + index}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="rounded-xl overflow-hidden border border-border bg-card"
                >
                  <video src={video.url} controls preload="metadata" className="w-full aspect-video bg-black" />
                  <div className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{video.prompt}</p>
                      <p className="text-xs text-muted-foreground">{video.model.split("/").pop()}</p>
                    </div>
                    <a href={video.url} target="_blank" rel="noreferrer" download aria-label="Download video" className="p-2 rounded-lg bg-muted hover:bg-accent transition-colors shrink-0">
                      <Download className="w-4 h-4" />
                    </a>
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
