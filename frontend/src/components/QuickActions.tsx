import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Code, Image, FileText, Music, Globe, Zap, BarChart3 } from "lucide-react";
import { cn } from "@/utils/cn";

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: typeof Sparkles;
  gradient: string;
  /** Chat task key (starts a chat with the best model + starter prompt). */
  task?: string;
  /** Dedicated page to redirect to instead of a chat (image/audio tools). */
  redirect?: string;
}

const actions: QuickAction[] = [
  { id: "1", title: "Creative Writing", description: "Generate stories, poems, and more", icon: Sparkles, gradient: "from-pink-500 to-rose-500", task: "creative" },
  { id: "2", title: "Code Assistant", description: "Write and debug code", icon: Code, gradient: "from-blue-500 to-cyan-500", task: "code" },
  { id: "3", title: "Image Gen", description: "Create AI images", icon: Image, gradient: "from-purple-500 to-violet-500", redirect: "/image-studio" },
  { id: "4", title: "Document", description: "Summarize and analyze docs", icon: FileText, gradient: "from-green-500 to-emerald-500", task: "document" },
  { id: "5", title: "Audio", description: "Transcribe and generate audio", icon: Music, gradient: "from-orange-500 to-amber-500", redirect: "/voice" },
  { id: "6", title: "Research", description: "Web search and research", icon: Globe, gradient: "from-indigo-500 to-blue-500", task: "research" },
  { id: "7", title: "Quick Tasks", description: "Emails, lists, and more", icon: Zap, gradient: "from-yellow-500 to-orange-500", task: "quick-tasks" },
  { id: "8", title: "Analytics", description: "Data analysis and charts", icon: BarChart3, gradient: "from-teal-500 to-green-500", task: "analytics" },
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
      {actions.map((action, index) => (
        <motion.button
          key={action.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          onClick={() => handleClick(action)}
          className={cn("relative overflow-hidden rounded-xl p-4 text-left transition-transform hover:scale-105 bg-gradient-to-br", action.gradient)}
        >
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative z-10">
            <action.icon className="w-6 h-6 text-white mb-2" />
            <h3 className="text-white font-semibold text-sm">{action.title}</h3>
            <p className="text-white/80 text-xs mt-1">{action.description}</p>
          </div>
        </motion.button>
      ))}
    </div>
  );
}
