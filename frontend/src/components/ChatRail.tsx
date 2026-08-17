import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { MessageSquare, Pin, Plus, Search, Sparkles, ChevronLeft, X, Loader2 } from "lucide-react";
import { chatService } from "@/services/chat.service";
import { Conversation } from "@/types";
import { cn } from "@/utils/cn";

interface ChatRailProps {
  /** Currently open conversation id (undefined = fresh chat). */
  activeId?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Bumped whenever a new conversation is created so the list refreshes. */
  refreshSignal: number;
  /** Mobile slide-in drawer open state. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const thisYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], thisYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The conversation rail — a slim cinematic sidebar inside the Chat workspace
 * listing the user's REAL conversations (same API as History/Dashboard).
 *
 * Desktop: a collapsible rail (icon-only when collapsed) beside the messages.
 * Mobile: a slide-in drawer opened from the Chats button — same list, so
 * switching conversations works on phones too.
 */
export function ChatRail({ activeId, collapsed, onToggleCollapse, refreshSignal, mobileOpen, onCloseMobile }: ChatRailProps) {
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    chatService
      .getConversations()
      .then(({ data }) => setConversations(Array.isArray(data) ? data : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  // Load on mount and refresh when a conversation is created or the route changes.
  useEffect(() => {
    load();
  }, [refreshSignal, location.pathname]);

  const sorted = [...conversations].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return +new Date(b.updatedAt) - +new Date(a.updatedAt);
  });

  // The shared conversation list body (desktop expanded + mobile drawer).
  const renderList = () =>
    loading ? (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    ) : error ? (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">Couldn't load conversations</p>
    ) : sorted.length === 0 ? (
      <div className="px-3 py-8 text-center">
        <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary/60" strokeWidth={1.6} />
        <p className="text-xs text-muted-foreground">No conversations yet — start a chat and it'll show up here.</p>
      </div>
    ) : (
      <div className="space-y-0.5">
        {sorted.map((c) => (
          <Link
            key={c.id}
            to={`/chat/${c.id}`}
            onClick={onCloseMobile}
            aria-current={c.id === activeId ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors",
              c.id === activeId
                ? "bg-primary/10 text-primary"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <MessageSquare
              className={cn("h-4 w-4 shrink-0", c.id === activeId ? "text-primary" : "text-muted-foreground")}
              strokeWidth={1.8}
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.title || "Untitled chat"}</span>
            {c.isPinned && <Pin className="h-3 w-3 shrink-0 text-yellow-500/80" />}
            <span className="shrink-0 text-[10px] text-muted-foreground/70">{timeLabel(c.updatedAt)}</span>
          </Link>
        ))}
      </div>
    );

  return (
    <>
      {/* ── Desktop rail ── */}
      <div
        className={cn(
          "relative z-10 hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar/70 backdrop-blur-xl transition-[width] duration-200 ease-fluid lg:flex",
          collapsed ? "w-14" : "w-64"
        )}
      >
        {/* Header */}
        <div className={cn("flex h-16 shrink-0 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "gap-2 px-3")}>
          {!collapsed && (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent text-primary ring-1 ring-primary/20">
                <MessageSquare className="h-4 w-4" strokeWidth={1.9} />
              </div>
              <span className="truncate text-sm font-semibold tracking-tight">Conversations</span>
            </div>
          )}
          {!collapsed && (
            <Link
              to="/chat"
              aria-label="New chat"
              title="New chat"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
            </Link>
          )}
          {collapsed && (
            <Link
              to="/chat"
              aria-label="New chat"
              title="New chat"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
            </Link>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {collapsed ? (
            <div className="flex flex-col items-center gap-1">
              {sorted.slice(0, 12).map((c) => (
                <Link
                  key={c.id}
                  to={`/chat/${c.id}`}
                  title={c.title}
                  aria-label={c.title}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                    c.id === activeId ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <MessageSquare className="h-4 w-4" strokeWidth={1.8} />
                </Link>
              ))}
            </div>
          ) : (
            renderList()
          )}
        </div>

        {/* Footer — search + collapse */}
        <div className={cn("shrink-0 border-t border-sidebar-border p-2", collapsed && "flex flex-col items-center gap-1")}>
          {collapsed ? (
            <>
              <button
                type="button"
                title="Search conversations"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <Search className="h-4 w-4" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Expand conversations"
                aria-label="Expand conversations"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <Link
                to="/history"
                className="flex h-8 flex-1 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Search className="h-3.5 w-3.5" strokeWidth={1.9} />
                All history
              </Link>
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse conversations"
                aria-label="Collapse conversations"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile drawer — slide-in panel with the same real list ── */}
      {mobileOpen && (
        <>
          {/* Reduced motion: render the overlay + drawer at their resting
              positions without animation so the panel is always usable (and
              never stuck off-screen if rAF is throttled). */}
          {reducedMotion ? (
            <div
              onClick={onCloseMobile}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              onClick={onCloseMobile}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
          )}
          <motion.aside
            initial={{ x: reducedMotion ? 0 : -280 }}
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            role="dialog"
            aria-label="Conversations"
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar lg:hidden"
          >
            {/* Header */}
            <div className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent text-primary ring-1 ring-primary/20">
                  <MessageSquare className="h-4 w-4" strokeWidth={1.9} />
                </div>
                <span className="truncate text-sm font-semibold tracking-tight">Conversations</span>
              </div>
              <Link
                to="/chat"
                aria-label="New chat"
                title="New chat"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
              </Link>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close conversations"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.9} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2">{renderList()}</div>

            {/* Footer */}
            <div className="shrink-0 border-t border-sidebar-border p-2">
              <Link
                to="/history"
                onClick={onCloseMobile}
                className="flex h-8 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Search className="h-3.5 w-3.5" strokeWidth={1.9} />
                All history
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </>
  );
}
