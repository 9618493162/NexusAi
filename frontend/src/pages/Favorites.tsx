import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { chatService } from "@/services/chat.service";
import { Conversation } from "@/types";
import { PageLoader } from "@/components/PageLoader";

export function Favorites() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadFavorites(); }, []);

  const loadFavorites = async () => {
    try {
      const { data } = await chatService.getConversations({ pinned: true });
      setConversations(data);
    } catch (error) { console.error("Failed to load favorites:", error); }
    finally { setLoading(false); }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Favorites</h1>
      <div className="space-y-2">
        {conversations.map((conv, index) => (
          <motion.div key={conv.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
            <Link to={`/chat/${conv.id}`} className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-accent transition-colors">
              <div className="p-2 rounded-lg bg-yellow-500/10"><Star className="w-4 h-4 text-yellow-500" /></div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{conv.title}</h3>
                <p className="text-sm text-muted-foreground">{conv.messages?.[0]?.content.slice(0, 100) || "No messages"}</p>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(conv.updatedAt).toLocaleDateString()}</span>
            </Link>
          </motion.div>
        ))}
        {conversations.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Star className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No pinned conversations yet</p>
            <p className="text-sm">Pin conversations to see them here</p>
          </div>
        )}
      </div>
    </div>
  );
}
