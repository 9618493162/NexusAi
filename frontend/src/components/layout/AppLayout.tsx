import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Mic } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { PageTransition } from "@/components/ui/page-transition";
import { useAuthStore } from "@/store/auth.store";

// The last conversation opened in Chat (recorded there on load / first
// message), so the dictation shortcut can resume it from History or Search
// results instead of always forcing a fresh chat.
function lastConversationId(): string | null {
  try { return localStorage.getItem("nexusai-last-conversation") || null; } catch { return null; }
}

export function AppLayout() {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("nexusai-sidebar-collapsed") === "1"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Brief toast when the global dictation shortcut navigates to Chat — the
  // mic state is obvious even mid-navigation (Chat's own recording button
  // takes over once the page loads).
  const [dictationToast, setDictationToast] = useState(false);
  const dictationToastTimer = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  // Persist collapse preference.
  useEffect(() => {
    try { localStorage.setItem("nexusai-sidebar-collapsed", collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  // Close the mobile drawer and command palette on route change.
  useEffect(() => {
    setMobileOpen(false);
    setPaletteOpen(false);
  }, [location.pathname]);

  // Clear the dictation toast timer when the layout unmounts.
  useEffect(() => () => {
    if (dictationToastTimer.current !== null) window.clearTimeout(dictationToastTimer.current);
  }, []);

  // Ctrl/Cmd+K opens the command palette (also when not on a chat page).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // App-wide shortcuts: Ctrl/Cmd+N starts a new chat from any page (Chat's
  // own handler owns it on /chat), and Ctrl/Cmd+Shift+M toggles live
  // dictation when already on a chat page (Chat's handler does the toggle) or
  // navigates to a fresh chat and starts dictating immediately in the saved
  // language (Chat consumes the ?dictate=1 param on mount).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      // Ctrl/Cmd+N — new chat from anywhere.
      if (key === "n" && !e.shiftKey) {
        if (!isAuthenticated || location.pathname.startsWith("/chat")) return;
        e.preventDefault();
        navigate("/chat");
        return;
      }
      // Ctrl/Cmd+Shift+M — live dictation.
      if (!e.shiftKey) return;
      if (key !== "m") return;
      if (!isAuthenticated) return;
      if (location.pathname.startsWith("/chat")) return; // Chat's handler toggles
      const voiceOk =
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof AudioContext !== "undefined" &&
        typeof WebSocket !== "undefined";
      if (!voiceOk) return;
      e.preventDefault();
      // From History or Search results, resume the last opened conversation so
      // dictation lands in that context; elsewhere start a fresh chat.
      const fromHistoryOrSearch =
        location.pathname.startsWith("/history") || location.pathname.startsWith("/search");
      const resume = fromHistoryOrSearch ? lastConversationId() : null;
      navigate(resume ? `/chat/${resume}?dictate=1` : "/chat?dictate=1");
      // Toast bridges the navigation so dictation's start is obvious.
      setDictationToast(true);
      if (dictationToastTimer.current !== null) window.clearTimeout(dictationToastTimer.current);
      dictationToastTimer.current = window.setTimeout(() => setDictationToast(false), 2600);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAuthenticated, location.pathname, navigate]);

  if (!isAuthenticated) return <Outlet />;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Spatial environment — the fixed depth plane behind every page */}
      <SpatialEnvironment />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobile={() => setMobileOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
        <main className="relative flex-1 overflow-y-auto">
          <div className="relative">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <AnimatePresence>
        {dictationToast &&
          (reducedMotion ? (
            <div role="status" className="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2">
              <DictationToastBody />
            </div>
          ) : (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: -14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2"
            >
              <DictationToastBody />
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}

function DictationToastBody() {
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border bg-background/85 px-4 py-2 shadow-xl shadow-black/20 backdrop-blur-xl">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      <Mic className="h-3.5 w-3.5 text-red-400" />
      <span className="text-sm font-medium">Dictation starting — speak now</span>
    </div>
  );
}
