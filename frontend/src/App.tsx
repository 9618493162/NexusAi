import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLoader } from "@/components/PageLoader";
import { useAuthStore } from "@/store/auth.store";
import { useThemeStore } from "@/store/theme.store";

const Landing = lazy(() => import("@/pages/Landing").then((m) => ({ default: m.Landing })));
const Login = lazy(() => import("@/pages/Login").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("@/pages/Register").then((m) => ({ default: m.Register })));
const OAuthCallback = lazy(() => import("@/pages/OAuthCallback").then((m) => ({ default: m.OAuthCallback })));
const SupabaseCallback = lazy(() => import("@/pages/SupabaseCallback").then((m) => ({ default: m.SupabaseCallback })));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("@/pages/ResetPassword").then((m) => ({ default: m.ResetPassword })));
const Chat = lazy(() => import("@/pages/Chat").then((m) => ({ default: m.Chat })));
const Agents = lazy(() => import("@/pages/Agents").then((m) => ({ default: m.Agents })));
const Files = lazy(() => import("@/pages/Files").then((m) => ({ default: m.Files })));
const ImageStudio = lazy(() => import("@/pages/ImageStudio").then((m) => ({ default: m.ImageStudio })));
const VideoStudio = lazy(() => import("@/pages/VideoStudio").then((m) => ({ default: m.VideoStudio })));
const Voice = lazy(() => import("@/pages/Voice").then((m) => ({ default: m.Voice })));
const Analytics = lazy(() => import("@/pages/Analytics").then((m) => ({ default: m.Analytics })));
const History = lazy(() => import("@/pages/History").then((m) => ({ default: m.History })));
const Favorites = lazy(() => import("@/pages/Favorites").then((m) => ({ default: m.Favorites })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return !isAuthenticated ? <>{children}</> : <Navigate to="/chat" />;
}

export default function App() {
  const { isDark } = useThemeStore();

  // Keep the theme on <html> (not a wrapper div) so that <body> and every
  // inherited property — including form control text color — resolve the
  // correct dark/light CSS variables.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return (
    <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/supabase/callback" element={<SupabaseCallback />} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
            <Route path="/chat/:id" element={<PrivateRoute><Chat /></PrivateRoute>} />
            <Route path="/agents" element={<PrivateRoute><Agents /></PrivateRoute>} />
            <Route path="/files" element={<PrivateRoute><Files /></PrivateRoute>} />
            <Route path="/image-studio" element={<PrivateRoute><ImageStudio /></PrivateRoute>} />
            <Route path="/video-studio" element={<PrivateRoute><VideoStudio /></PrivateRoute>} />
            <Route path="/voice" element={<PrivateRoute><Voice /></PrivateRoute>} />
            <Route path="/analytics" element={<PrivateRoute><Analytics /></PrivateRoute>} />
            <Route path="/history" element={<PrivateRoute><History /></PrivateRoute>} />
            <Route path="/favorites" element={<PrivateRoute><Favorites /></PrivateRoute>} />
            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          </Route>
          {/* Recovery links auto-sign the user in; the page must render even when
              already authenticated, so it is NOT wrapped in PublicRoute (which
              would bounce to /chat) and lives outside AppLayout (full-screen). */}
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </Suspense>
  );
}
