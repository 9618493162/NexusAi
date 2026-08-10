import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MessageSquare, Image as ImageIcon, Video, FileText, BarChart3,
  MessagesSquare, Pin, Loader2, ArrowRight, Coins, Activity,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { chatService } from "@/services/chat.service";
import { usageService } from "@/services/usage.service";
import { Conversation, UsageResponse } from "@/types";

const QUICK_LINKS = [
  { to: "/chat", icon: MessageSquare, label: "New Chat", desc: "Start a conversation", color: "text-primary bg-primary/10" },
  { to: "/image-studio", icon: ImageIcon, label: "Image Studio", desc: "Generate images", color: "text-pink-500 bg-pink-500/10" },
  { to: "/video-studio", icon: Video, label: "Video Studio", desc: "Generate videos", color: "text-blue-500 bg-blue-500/10" },
  { to: "/files", icon: FileText, label: "Files", desc: "Upload documents", color: "text-emerald-500 bg-emerald-500/10" },
  { to: "/analytics", icon: BarChart3, label: "Analytics", desc: "View usage stats", color: "text-amber-500 bg-amber-500/10" },
];

export function Dashboard() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([chatService.getConversations(), usageService.getUsage()])
      .then(([conv, use]) => {
        setConversations(conv.data);
        setUsage(use.data);
      })
      .catch((error) => console.error("Dashboard load error:", error))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.name?.split(" ")[0] || "there";
  const pinned = conversations.filter((c) => c.isPinned).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold">{greeting}, {firstName} 👋</h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with NexusAI</p>
      </motion.div>

      {loading ? (
        <div className="text-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            {[
              { icon: MessagesSquare, label: "Conversations", value: conversations.length, color: "text-primary bg-primary/10" },
              { icon: Pin, label: "Pinned", value: pinned, color: "text-yellow-500 bg-yellow-500/10" },
              { icon: Coins, label: "Tokens used", value: usage?.totalTokens || 0, color: "text-emerald-500 bg-emerald-500/10" },
              { icon: Activity, label: "Requests", value: usage?.totalRequests || 0, color: "text-blue-500 bg-blue-500/10" },
            ].map((stat, index) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="rounded-xl border border-border bg-card p-4">
                <div className={`inline-flex p-2 rounded-lg ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                <p className="text-2xl font-bold mt-3">{stat.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-8">
            {QUICK_LINKS.map((link, index) => (
              <motion.div key={link.to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + index * 0.05 }}>
                <Link to={link.to} className="group block rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-all hover:-translate-y-0.5">
                  <div className={`inline-flex p-2 rounded-lg ${link.color} group-hover:scale-110 transition-transform`}><link.icon className="w-4 h-4" /></div>
                  <p className="font-medium text-sm mt-3">{link.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{link.desc}</p>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Recent conversations */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Recent Conversations</h2>
              <Link to="/history" className="text-sm text-primary flex items-center gap-1 hover:underline">View all <ArrowRight className="w-3 h-3" /></Link>
            </div>
            {conversations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No conversations yet — start chatting!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.slice(0, 5).map((conv) => (
                  <Link key={conv.id} to={`/chat/${conv.id}`} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary"><MessageSquare className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{conv.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{conv.messages?.[0]?.content.slice(0, 80) || "No messages"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(conv.updatedAt).toLocaleDateString()}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
