import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/auth.store";
import {
  MessageSquare, Bot, Image, Video, Mic, BarChart3, History, Star,
  LayoutDashboard, FileText, Settings, LogOut, Menu, X,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useState } from "react";

const navItems = [
  { icon: MessageSquare, label: "Chats", path: "/chat" },
  { icon: Bot, label: "Agents", path: "/agents" },
  { icon: FileText, label: "Files", path: "/files" },
  { icon: Image, label: "Image Studio", path: "/image-studio" },
  { icon: Video, label: "Video Studio", path: "/video-studio" },
  { icon: Mic, label: "Voice", path: "/voice" },
  { icon: BarChart3, label: "Analytics", path: "/analytics" },
  { icon: History, label: "History", path: "/history" },
  { icon: Star, label: "Favorites", path: "/favorites" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={cn("flex flex-col h-screen bg-card border-r border-border transition-all duration-300", collapsed ? "w-16" : "w-64")}>
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">N</span>
            </div>
            <span className="font-bold text-lg">NexusAI</span>
          </Link>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="p-2 rounded-lg hover:bg-accent">
          {collapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors",
              location.pathname === item.path ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <item.icon size={20} />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-semibold text-sm">{user?.name?.[0] || "U"}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email || "No email"}</p>
            </div>
          )}
        </div>
        <button onClick={logout} className="flex items-center gap-3 px-4 py-2 w-full rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
          <LogOut size={20} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
