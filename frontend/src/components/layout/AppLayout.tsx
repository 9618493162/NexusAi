import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuthStore } from "@/store/auth.store";

export function AppLayout() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Outlet />;
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto"><Outlet /></main>
    </div>
  );
}
