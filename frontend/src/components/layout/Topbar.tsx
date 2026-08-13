import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Menu, Search, LogOut, Settings, User as UserIcon, Cpu, Sun, Moon } from "lucide-react";
import { cn } from "@/utils/cn";
import { useThemeStore } from "@/store/theme.store";
import { useAuthStore } from "@/store/auth.store";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AvatarImage } from "@/components/ui/avatar-image";

const TITLES: Array<{ match: (pathname: string) => boolean; title: string }> = [
  { match: (p) => p === "/dashboard", title: "Dashboard" },
  { match: (p) => p === "/chat", title: "Chats" },
  { match: (p) => p.startsWith("/chat/"), title: "Conversation" },
  { match: (p) => p === "/agents", title: "Agents" },
  { match: (p) => p === "/files", title: "Files" },
  { match: (p) => p === "/image-studio", title: "Image Studio" },
  { match: (p) => p === "/video-studio", title: "Video Studio" },
  { match: (p) => p === "/voice", title: "Voice" },
  { match: (p) => p === "/analytics", title: "Analytics" },
  { match: (p) => p === "/history", title: "History" },
  { match: (p) => p === "/favorites", title: "Favorites" },
  { match: (p) => p === "/settings", title: "Settings" },
];

interface TopbarProps {
  onOpenMobile: () => void;
  onOpenPalette: () => void;
}

export function Topbar({ onOpenMobile, onOpenPalette }: TopbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, logout } = useAuthStore();
  const isDark = useThemeStore((s) => s.isDark);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  // Close the user menu on navigation.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const focusMenuItem = (index: number) => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>("button");
    items?.[index]?.focus();
  };

  // On open, move focus to the first item; on close, return focus to the trigger.
  useEffect(() => {
    if (menuOpen) {
      wasOpenRef.current = true;
      focusMenuItem(0);
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusMenuItem((current + 1) % items.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusMenuItem((current - 1 + items.length) % items.length);
        break;
      case "Home":
        e.preventDefault();
        focusMenuItem(0);
        break;
      case "End":
        e.preventDefault();
        focusMenuItem(items.length - 1);
        break;
      case "Escape":
      case "Tab":
        e.preventDefault();
        closeMenu();
        break;
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!menuOpen) setMenuOpen(true);
    } else if (e.key === "Escape") {
      if (menuOpen) closeMenu();
    } else if (e.key === "Tab") {
      if (menuOpen) closeMenu();
    }
  };

  const title = TITLES.find((t) => t.match(location.pathname))?.title ?? "NexusAI";

  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <button
        onClick={onOpenMobile}
        aria-label="Open navigation"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>
        {id && <p className="hidden text-xs text-muted-foreground sm:block">Resuming a saved conversation</p>}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Global search / command palette trigger */}
        <button
          onClick={onOpenPalette}
          aria-label="Search (Ctrl+K)"
          title="Search (Ctrl+K)"
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent sm:w-56"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden flex-1 text-left sm:block">Search…</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:block">⌘K</kbd>
        </button>

        <ThemeToggle />

        {/* User menu */}
        <div className="relative">
          <button
            ref={triggerRef}
            onClick={() => setMenuOpen((v) => !v)}
            onKeyDown={onTriggerKeyDown}
            aria-label="Account menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/80 to-indigo-500 text-sm font-semibold text-primary-foreground ring-1 ring-border transition-transform hover:scale-105"
          >
            <AvatarImage
              src={user?.avatar}
              alt=""
              className="h-full w-full object-cover"
              fallback={user?.name?.[0] || "U"}
            />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={closeMenu} aria-hidden="true" />
              <div
                ref={menuRef}
                role="menu"
                aria-label="Account menu"
                onKeyDown={onMenuKeyDown}
                className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-popover shadow-popover animate-scale-in"
              >
                <div className="border-b border-border px-4 py-3">
                  <p className="truncate text-sm font-semibold">{user?.name || "User"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email || "Signed in"}</p>
                </div>
                <div className="p-1.5">
                  <button
                    role="menuitem"
                    onClick={() => { closeMenu(); navigate("/search"); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    <Search className="h-4 w-4 text-muted-foreground" /> Search
                    <kbd className={cn("ml-auto rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]")}>⌘K</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { closeMenu(); navigate("/profile"); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    <UserIcon className="h-4 w-4 text-muted-foreground" /> Profile
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { closeMenu(); navigate("/settings"); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    <Settings className="h-4 w-4 text-muted-foreground" /> Settings
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { closeMenu(); navigate("/models"); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    <Cpu className="h-4 w-4 text-muted-foreground" /> AI Models
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    role="menuitem"
                    onClick={toggleTheme}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    {isDark ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
                    Switch to {isDark ? "light" : "dark"} mode
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    role="menuitem"
                    onClick={logout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
