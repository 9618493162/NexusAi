import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Archive, Pin, Search, MessageSquare, ArrowUpRight } from "lucide-react";
import { chatService } from "@/services/chat.service";
import { Conversation } from "@/types";
import { cn } from "@/utils/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export function History() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "archived">("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { loadConversations(); }, [filter, debounced]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const { data } = await chatService.getConversations({
        archived: filter === "archived" ? true : undefined,
        search: debounced || undefined,
      });
      setConversations(data);
    } catch (error) { console.error("Failed to load conversations:", error); }
    finally { setLoading(false); }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        icon={Clock}
        title="History"
        description="Every conversation, searchable and archived"
        actions={
          <div className="flex gap-1.5 rounded-xl border border-border bg-card p-1 shadow-sm">
            {(["all", "archived"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-sm font-medium capitalize transition-colors",
                  filter === f ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        }
      />

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations…"
          aria-label="Search conversations"
          className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-4 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={debounced ? `No results for “${debounced}”` : filter === "archived" ? "No archived conversations" : "No conversations yet"}
          description={debounced ? "Try a different search term." : "Start a chat and it will show up here."}
          action={<Link to="/chat" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover">Start a chat</Link>}
        />
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {conversations.map((conv, index) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.3) }}
              >
                <Link
                  to={`/chat/${conv.id}`}
                  className="card-surface card-hover group flex items-center gap-4 p-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MessageSquare className="h-4.5 w-4.5" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{conv.title}</h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {conv.messages?.[0]?.content.slice(0, 100) || "No messages"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {conv.isPinned && <Pin className="h-4 w-4 text-yellow-500" />}
                    {conv.isArchived && <Archive className="h-4 w-4 text-muted-foreground" />}
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
