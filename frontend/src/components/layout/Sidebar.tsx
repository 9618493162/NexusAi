import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuthStore } from "@/store/auth.store";
import {
  LayoutDashboard, MessageSquare, Bot, Image, Video, Mic, FileText, Brain,
  History, Star, BarChart3, Settings, LogOut, ChevronLeft, Sparkles, X, Cpu, FolderKanban, Video as VideoIcon, Workflow as WorkflowIcon, Database, Compass, FileText as DocIcon, TrendingUp,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { Tooltip } from "./Tooltip";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  match?: (pathname: string) => boolean;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", match: (p) => p === "/dashboard" },
      { icon: Sparkles, label: "Command Center", path: "/command", match: (p) => p === "/command" },
      { icon: MessageSquare, label: "Chats", path: "/chat", match: (p) => p.startsWith("/chat") },
      { icon: Bot, label: "Agents", path: "/agents", match: (p) => p === "/agents" },
      { icon: Cpu, label: "AI Models", path: "/models", match: (p) => p === "/models" },
    ],
  },
  {
    label: "Create",
    items: [
      { icon: Image, label: "Image Studio", path: "/image-studio", match: (p) => p === "/image-studio" },
      { icon: Video, label: "Video Studio", path: "/video-studio", match: (p) => p === "/video-studio" },
      { icon: Mic, label: "Voice", path: "/voice", match: (p) => p === "/voice" },
      { icon: VideoIcon, label: "Meetings", path: "/meetings", match: (p) => p.startsWith("/meetings") },
      { icon: WorkflowIcon, label: "Workflows", path: "/workflows", match: (p) => p.startsWith("/workflows") },
      { icon: Database, label: "Data Lab", path: "/data-lab", match: (p) => p.startsWith("/data-lab") },
      { icon: Compass, label: "Research", path: "/research", match: (p) => p.startsWith("/research") },
      { icon: TrendingUp, label: "Markets", path: "/markets", match: (p) => p.startsWith("/markets") },
      { icon: DocIcon, label: "Documents", path: "/documents", match: (p) => p.startsWith("/documents") },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { icon: Brain, label: "Memory", path: "/memory", match: (p) => p === "/memory" },
      { icon: FolderKanban, label: "Projects", path: "/projects", match: (p) => p.startsWith("/projects") },
      { icon: FileText, label: "Files", path: "/files", match: (p) => p === "/files" },
      { icon: History, label: "History", path: "/history", match: (p) => p === "/history" },
      { icon: Star, label: "Favorites", path: "/favorites", match: (p) => p === "/favorites" },
    ],
  },
  {
    label: "Insights",
    items: [
      { icon: BarChart3, label: "Analytics", path: "/analytics", match: (p) => p === "/analytics" },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  const reducedMotion = useReducedMotion();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const isActive = (item: NavItem) => item.match?.(location.pathname) ?? location.pathname === item.path;

  const content = (
    <>
      {/* Brand */}
      <div className={cn("flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-4", collapsed && "justify-center px-2")}>
        <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="NexusAI home">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-indigo-500 text-primary-foreground shadow-sm">
            <Sparkles className="h-4.5 w-4.5" strokeWidth={2} />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
          </div>
          {!collapsed && (
            <AnimatePresence initial={false}>
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
                className="truncate text-lg font-bold tracking-tight"
              >
                Nexus<span className="text-gradient">AI</span>
              </motion.span>
            </AnimatePresence>
          )}
        </Link>
        <button
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground lg:hidden"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {navGroups.map((group) => (
          <div key={group.label || "main"}>
            {group.label && !collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item);
                const link = (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onCloseMobile}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={active ? 2.2 : 1.8} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
                return collapsed ? (
                  <Tooltip key={item.path} content={item.label} side="right">
                    {link}
                  </Tooltip>
                ) : (
                  <div key={item.path}>{link}</div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 space-y-2 border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-1 flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-500 text-sm font-semibold text-primary-foreground">
              {user?.name?.[0] || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{user?.name || "User"}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email || "Signed in"}</p>
            </div>
          </div>
        )}
        <div className={cn("flex gap-1", collapsed && "flex-col")}>
          <Link
            to="/settings"
            className={cn(
              "flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              collapsed && "justify-center px-0"
            )}
            title={collapsed ? "Settings" : undefined}
          >
            <Settings className="h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.8} />
            {!collapsed && <span>Settings</span>}
          </Link>
          <button
            onClick={logout}
            className={cn(
              "flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive",
              collapsed && "justify-center px-0"
            )}
            title={collapsed ? "Logout" : undefined}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground lg:flex"
        >
          <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative z-10 hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out-quart lg:flex",
          collapsed ? "w-[68px]" : "w-60"
        )}
      >
        {content}
      </aside>

      {/* Mobile drawer — conditional render with an entrance-only animation.
          AnimatePresence + exit animation here gets interrupted by route
          changes (same bug as CommandPalette/Select): the drawer stays mounted
          while mobileOpen is already false, so the X/overlay become no-ops.
          Closing is instant and reliable without the exit pass. */}
      {mobileOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            onClick={onCloseMobile}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            aria-hidden="true"
          />
          {/* Reduced motion: render at the resting position with no animation
              so the drawer is always usable (and never stuck off-screen if rAF
              is suspended). */}
          <motion.aside
            initial={{ x: reducedMotion ? 0 : -280 }}
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar lg:hidden"
            role="dialog"
            aria-label="Navigation"
          >
            {content}
          </motion.aside>
        </>
      )}
    </>
  );
}
