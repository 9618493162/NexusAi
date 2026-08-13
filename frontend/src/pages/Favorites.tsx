import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Star, ArrowUpRight } from "lucide-react";
import { chatService } from "@/services/chat.service";
import { Conversation } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        icon={Star}
        title="Favorites"
        description="Your pinned conversations, always one click away"
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No pinned conversations yet"
          description="Pin a conversation from the chat page and it will show up here."
          action={<Link to="/chat" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover">Start a chat</Link>}
        />
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {conversations.map((conv, index) => (
              <motion.div key={conv.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }}>
                <Link to={`/chat/${conv.id}`} className="card-surface card-hover group flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-500/10 text-yellow-500">
                    <Star className="h-4.5 w-4.5" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{conv.title}</h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {conv.messages?.[0]?.content.slice(0, 100) || "No messages"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-xs text-muted-foreground sm:block">{new Date(conv.updatedAt).toLocaleDateString()}</span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
