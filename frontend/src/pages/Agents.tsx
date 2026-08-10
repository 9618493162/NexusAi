import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Bot, Loader2, ArrowRight, Cpu, Sparkles } from "lucide-react";
import { chatService } from "@/services/chat.service";
import { cn } from "@/utils/cn";

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context: string;
}

const PROVIDER_STYLES: Record<string, { badge: string; dot: string }> = {
  groq: { badge: "bg-orange-500/15 text-orange-400", dot: "bg-orange-500" },
  gemini: { badge: "bg-blue-500/15 text-blue-400", dot: "bg-blue-500" },
  openrouter: { badge: "bg-emerald-500/15 text-emerald-400", dot: "bg-emerald-500" },
};

export function Agents() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    chatService
      .getModels()
      .then(({ data }) => { if (Array.isArray(data)) setModels(data); })
      .catch((err: any) => setError(err.response?.data?.error || "Failed to load AI models"))
      .finally(() => setLoading(false));
  }, []);

  const groups = models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    (acc[m.provider] = acc[m.provider] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Bot className="w-6 h-6 text-primary" /> AI Agents</h1>
        <p className="text-muted-foreground mt-1">The models powering NexusAI — pick one for your next conversation</p>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-6">{error}</p>}
      {loading && <div className="text-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>}

      {!loading && !error && models.length === 0 && (
        <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
          <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No models available</p>
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(groups).map(([provider, list], gi) => {
          const style = PROVIDER_STYLES[provider] || { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" };
          return (
            <div key={provider}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", style.dot)} />
                {provider}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {list.map((model, index) => (
                  <motion.div
                    key={model.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: gi * 0.1 + index * 0.05 }}
                    className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0"><Cpu className="w-4 h-4" /></div>
                      <span className={cn("px-2 py-0.5 rounded-md text-xs", style.badge)}>{model.provider}</span>
                    </div>
                    <h3 className="font-semibold mt-3 group-hover:text-primary transition-colors">{model.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 truncate" title={model.id}>{model.id}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="w-3 h-3" /> {model.context} context</span>
                      <Link to="/chat" className="text-xs text-primary flex items-center gap-1 hover:underline">Use in chat <ArrowRight className="w-3 h-3" /></Link>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
