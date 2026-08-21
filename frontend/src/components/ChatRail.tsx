import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MessageSquare, Pin, Plus, Search, Sparkles, ChevronLeft, X, Loader2, MoreHorizontal, Pencil, Archive, Trash2, Check } from "lucide-react";
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
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Per-conversation context menu state.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  // Close context menu on click outside.
  useEffect(() => {
    if (!menuId) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuId(null);
    };
    document.addEventListener("mousedown", onClick, { passive: true });
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuId]);

  // Focus rename input when it appears.
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const sorted = [...conversations].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return +new Date(b.updatedAt) - +new Date(a.updatedAt);
  });

  // ── Conversation actions ──
  const handlePin = async (c: Conversation) => {
    setMenuId(null);
    try {
      await chatService.updateConversation(c.id, { isPinned: !c.isPinned });
      load();
    } catch { /* ignore */ }
  };

  const handleArchive = async (c: Conversation) => {
    setMenuId(null);
    try {
      await chatService.updateConversation(c.id, { isArchived: true });
      load();
    } catch { /* ignore */ }
  };

  const startRename = (c: Conversation) => {
    setMenuId(null);
    setRenamingId(c.id);
    setRenameValue(c.title || "");
  };

  const confirmRename = async (c: Conversation) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === c.title) { setRenamingId(null); return; }
    try {
      await chatService.updateConversation(c.id, { title: trimmed });
      setRenamingId(null);
      load();
    } catch { setRenamingId(null); }
  };

  const handleDelete = async (c: Conversation) => {
    setMenuId(null);
    setDeletingId(c.id);
    try {
      await chatService.deleteConversation(c.id);
      // If the deleted conversation is currently open, navigate to fresh chat.
      if (c.id === activeId) navigate("/chat", { replace: true });
      load();
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  };

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
          <div key={c.id} className="group relative">
            {renamingId === c.id ? (
              <div className="flex items-center gap-1 px-2.5 py-1.5">
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename(c);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => confirmRename(c)}
                  className="min-w-0 flex-1 rounded-lg border border-primary/40 bg-background px-2 py-1 text-[13px] font-medium outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button onClick={() => confirmRename(c)} className="rounded p-1 text-primary hover:bg-primary/10">
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Link
                to={`/chat/${c.id}`}
                onClick={onCloseMobile}
                aria-current={c.id === activeId ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors",
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
            )}
            {/* Context menu trigger — visible on hover */}
            {renamingId !== c.id && (
              <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100" ref={menuId === c.id ? menuRef : undefined}>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuId(menuId === c.id ? null : c.id); }}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Conversation actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                <AnimatePresence>
                  {menuId === c.id && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.96 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
                    >
                      <button onClick={() => startRename(c)} className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Rename
                      </button>
                      <button onClick={() => handlePin(c)} className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent">
                        <Pin className="h-3.5 w-3.5 text-muted-foreground" /> {c.isPinned ? "Unpin" : "Pin"}
                      </button>
                      <button onClick={() => handleArchive(c)} className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent">
                        <Archive className="h-3.5 w-3.5 text-muted-foreground" /> Archive
                      </button>
                      <div className="my-0.5 border-t border-border" />
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={deletingId === c.id}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                      >
                        {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
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
              <Link
                to="/history"
                title="Search conversations"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <Search className="h-4 w-4" strokeWidth={1.8} />
              </Link>
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

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.15 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={onCloseMobile}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar shadow-xl lg:hidden"
            >
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
                <span className="text-sm font-semibold">Conversations</span>
                <button onClick={onCloseMobile} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {renderList()}
              </div>
              <div className="shrink-0 border-t border-sidebar-border p-2">
                <Link
                  to="/history"
                  onClick={onCloseMobile}
                  className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Search className="h-4 w-4" strokeWidth={1.9} />
                  Search conversations
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
