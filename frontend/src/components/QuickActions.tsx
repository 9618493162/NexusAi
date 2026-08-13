import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Code, Image, FileText, Music, Globe, Zap, BarChart3 } from "lucide-react";
import { cn } from "@/utils/cn";

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: typeof Sparkles;
  /** Gradient classes for the icon chip. */
  gradient: string;
  /** Chat task key (starts a chat with the best model + starter prompt). */
  task?: string;
  /** Dedicated page to redirect to instead of a chat (image/audio tools). */
  redirect?: string;
}

const actions: QuickAction[] = [
  { id: "1", title: "Creative Writing", description: "Stories, poems & more", icon: Sparkles, gradient: "from-pink-500 to-rose-500", task: "creative" },
  { id: "2", title: "Code Assistant", description: "Write & debug code", icon: Code, gradient: "from-blue-500 to-cyan-500", task: "code" },
  { id: "3", title: "Image Gen", description: "Create AI images", icon: Image, gradient: "from-purple-500 to-violet-500", redirect: "/image-studio" },
  { id: "4", title: "Document", description: "Summarize & analyze docs", icon: FileText, gradient: "from-emerald-500 to-green-500", task: "document" },
  { id: "5", title: "Audio", description: "Transcribe & generate", icon: Music, gradient: "from-orange-500 to-amber-500", redirect: "/voice" },
  { id: "6", title: "Research", description: "Web search & research", icon: Globe, gradient: "from-indigo-500 to-blue-500", task: "research" },
  { id: "7", title: "Quick Tasks", description: "Emails, lists & more", icon: Zap, gradient: "from-yellow-500 to-orange-500", task: "quick-tasks" },
  { id: "8", title: "Analytics", description: "Data analysis & charts", icon: BarChart3, gradient: "from-teal-500 to-green-500", task: "analytics" },
];

export function QuickActions() {
  const navigate = useNavigate();

  const handleClick = (action: QuickAction) => {
    if (action.redirect) {
      navigate(action.redirect);
    } else if (action.task) {
      // Start a chat for this task — the Chat page reads ?task= and selects
      // the best model for the work (Auto mode picks it automatically).
      navigate(`/chat?task=${action.task}`);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {actions.map((action, index) => (
        <motion.button
          key={action.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.045, duration: 0.3, ease: "easeOut" }}
          onClick={() => handleClick(action)}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.98 }}
          className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-card transition-colors hover:border-primary/40 sm:p-5"
        >
          {/* Soft gradient wash on hover */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br opacity-[0.07] transition-opacity duration-300 group-hover:opacity-[0.16]",
              action.gradient
            )}
          />
          <div
            className={cn(
              "relative mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform duration-200 group-hover:scale-110",
              action.gradient
            )}
          >
            <action.icon className="h-5 w-5" strokeWidth={1.9} />
          </div>
          <h3 className="relative text-sm font-semibold tracking-tight">{action.title}</h3>
          <p className="relative mt-0.5 text-xs text-muted-foreground">{action.description}</p>
        </motion.button>
      ))}
    </div>
  );
}
