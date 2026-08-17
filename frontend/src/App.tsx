import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLoader } from "@/components/PageLoader";
import { useAuthStore } from "@/store/auth.store";
import { useThemeStore, syncThemeFromServer } from "@/store/theme.store";
import { useOnboardingStore } from "@/store/onboarding.store";
import { isOnboarded } from "@/utils/onboarding";

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
const UniversalCommandCenter = lazy(() => import("@/pages/UniversalCommandCenter").then((m) => ({ default: m.UniversalCommandCenter })));
const ModelManager = lazy(() => import("@/pages/ModelManager").then((m) => ({ default: m.ModelManager })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));
const Profile = lazy(() => import("@/pages/Profile").then((m) => ({ default: m.Profile })));
const Search = lazy(() => import("@/pages/Search").then((m) => ({ default: m.Search })));
const Onboarding = lazy(() => import("@/pages/Onboarding").then((m) => ({ default: m.Onboarding })));
const Memory = lazy(() => import("@/pages/Memory").then((m) => ({ default: m.Memory })));
const Projects = lazy(() => import("@/pages/Projects").then((m) => ({ default: m.Projects })));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail").then((m) => ({ default: m.ProjectDetail })));
const Meetings = lazy(() => import("@/pages/Meetings").then((m) => ({ default: m.Meetings })));
const MeetingRoom = lazy(() => import("@/pages/MeetingRoom").then((m) => ({ default: m.MeetingRoom })));
const Workflows = lazy(() => import("@/pages/Workflows").then((m) => ({ default: m.Workflows })));
const WorkflowBuilder = lazy(() => import("@/pages/WorkflowBuilder").then((m) => ({ default: m.WorkflowBuilder })));
const DataLab = lazy(() => import("@/pages/DataLab").then((m) => ({ default: m.DataLab })));
const Research = lazy(() => import("@/pages/Research").then((m) => ({ default: m.Research })));
const Markets = lazy(() => import("@/pages/Markets").then((m) => ({ default: m.Markets })));
const Documents = lazy(() => import("@/pages/Documents").then((m) => ({ default: m.Documents })));
const DocumentEditor = lazy(() => import("@/pages/DocumentEditor").then((m) => ({ default: m.DocumentEditor })));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return !isAuthenticated ? <>{children}</> : <Navigate to="/chat" />;
}

/**
 * First-time users see the onboarding flow instead of the app shell until
 * they complete (or skip) it — tracked per-user in localStorage, so existing
 * users and returning users pass straight through. Renders full-screen
 * (no sidebar) by replacing the entire layout route.
 */
function OnboardingGate() {
  const { isAuthenticated, user } = useAuthStore();
  // Subscribe to the version so the app shell mounts the instant onboarding
  // completes (localStorage isn't reactive on its own).
  useOnboardingStore((s) => s.version);
  if (isAuthenticated && user && !isOnboarded(user.id)) {
    return <Onboarding />;
  }
  return <Outlet />;
}

export default function App() {
  const { isDark, mode } = useThemeStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Keep the theme on <html> (not a wrapper div) so that <body> and every
  // inherited property — including form control text color — resolve the
  // correct dark/light CSS variables.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // The account's saved theme is the source of truth: pull it once signed in
  // so the choice follows the user across devices (localStorage is a cache).
  useEffect(() => {
    if (isAuthenticated) syncThemeFromServer();
  }, [isAuthenticated]);

  // In "system" mode, follow OS theme changes live (no server push — the
  // saved preference is still "system").
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => useThemeStore.getState().applyServerTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  return (
    // reducedMotion="user" makes framer-motion render transform/layout
    // animations at their final values when the user prefers reduced motion,
    // so no slide-in panel can ever freeze partway off-screen (or stay stuck
    // when rAF is suspended). Opacity-only effects still animate normally.
    <MotionConfig reducedMotion="user">
    <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<OnboardingGate />}>
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
            <Route path="/command" element={<PrivateRoute><UniversalCommandCenter /></PrivateRoute>} />
            <Route path="/models" element={<PrivateRoute><ModelManager /></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
            <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
            <Route path="/search" element={<PrivateRoute><Search /></PrivateRoute>} />
            <Route path="/memory" element={<PrivateRoute><Memory /></PrivateRoute>} />
            <Route path="/projects" element={<PrivateRoute><Projects /></PrivateRoute>} />
            <Route path="/projects/:id" element={<PrivateRoute><ProjectDetail /></PrivateRoute>} />
            <Route path="/meetings" element={<PrivateRoute><Meetings /></PrivateRoute>} />
            <Route path="/meetings/:id" element={<PrivateRoute><MeetingRoom /></PrivateRoute>} />
            <Route path="/workflows" element={<PrivateRoute><Workflows /></PrivateRoute>} />
            <Route path="/workflows/:id" element={<PrivateRoute><WorkflowBuilder /></PrivateRoute>} />
            <Route path="/data-lab" element={<PrivateRoute><DataLab /></PrivateRoute>} />
            <Route path="/research" element={<PrivateRoute><Research /></PrivateRoute>} />
            <Route path="/research/:id" element={<PrivateRoute><Research /></PrivateRoute>} />
            <Route path="/markets" element={<PrivateRoute><Markets /></PrivateRoute>} />
            <Route path="/documents" element={<PrivateRoute><Documents /></PrivateRoute>} />
            <Route path="/documents/:id" element={<PrivateRoute><DocumentEditor /></PrivateRoute>} />
            </Route>
          </Route>
          {/* Recovery links auto-sign the user in; the page must render even when
              already authenticated, so it is NOT wrapped in PublicRoute (which
              would bounce to /chat) and lives outside AppLayout (full-screen). */}
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </Suspense>
    </MotionConfig>
  );
}
