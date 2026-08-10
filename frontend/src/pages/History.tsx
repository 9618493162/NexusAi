import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Archive, Pin } from "lucide-react";
import { chatService } from "@/services/chat.service";
import { Conversation } from "@/types";
import { PageLoader } from "@/components/PageLoader";

export function History() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "archived">("all");

  useEffect(() => { loadConversations(); }, [filter]);

  const loadConversations = async () => {
    try {
      const { data } = await chatService.getConversations({ archived: filter === "archived" ? true : undefined });
      setConversations(data);
    } catch (error) { console.error("Failed to load conversations:", error); }
    finally { setLoading(false); }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">History</h1>
        <div className="flex gap-2">
          <button onClick={() => setFilter("all")} className={`px-3 py-1 rounded-lg text-sm ${filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>All</button>
          <button onClick={() => setFilter("archived")} className={`px-3 py-1 rounded-lg text-sm ${filter === "archived" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Archived</button>
        </div>
      </div>
      <div className="space-y-2">
        {conversations.map((conv, index) => (
          <motion.div key={conv.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
            <Link to={`/chat/${conv.id}`} className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-accent transition-colors">
              <div className="p-2 rounded-lg bg-primary/10"><Clock className="w-4 h-4 text-primary" /></div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{conv.title}</h3>
                <p className="text-sm text-muted-foreground">{conv.messages?.[0]?.content.slice(0, 100) || "No messages"}</p>
              </div>
              <div className="flex items-center gap-2">
                {conv.isPinned && <Pin className="w-4 h-4 text-primary" />}
                {conv.isArchived && <Archive className="w-4 h-4 text-muted-foreground" />}
                <span className="text-xs text-muted-foreground">{new Date(conv.updatedAt).toLocaleDateString()}</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
