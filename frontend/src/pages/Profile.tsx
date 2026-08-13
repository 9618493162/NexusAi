import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Mail, CalendarDays, KeyRound, Settings, Cpu, BarChart3, AudioLines, ArrowRight, Loader2, BadgeCheck } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { authService } from "@/services/auth.service";
import { usageService } from "@/services/usage.service";
import { PageHeader } from "@/components/ui/page-header";
import { AvatarImage } from "@/components/ui/avatar-image";

interface ProfileInfo {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  provider: string | null;
  isVerified: boolean;
  createdAt: string;
}

export function Profile() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [usage, setUsage] = useState<{ totalTokens: number; totalRequests: number } | null>(null);

  useEffect(() => {
    authService.me().then(({ data }) => setProfile(data)).catch(() => setProfile(null));
    usageService.getUsage().then(({ data }) => setUsage(data)).catch(() => setUsage(null));
  }, []);

  const name = profile?.name || user?.name || "User";
  const email = profile?.email || user?.email || "No email";
  const avatarUrl = profile?.avatar || user?.avatar || null;
  const initials = (name[0] || email[0] || "U").toUpperCase();
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader icon={Mail} title="Profile" description="Your NexusAI identity and activity" />

      {/* Header card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="card-surface overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary/25 via-indigo-500/15 to-cyan-500/10" />
        <div className="px-6 pb-6 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <AvatarImage
                src={avatarUrl}
                alt={name}
                className="h-20 w-20 shrink-0 rounded-2xl object-cover shadow-lg ring-4 ring-card"
                fallback={
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-indigo-500 text-3xl font-bold text-primary-foreground shadow-lg ring-4 ring-card">
                    {initials}
                  </div>
                }
              />
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
                  {name}
                  {profile?.isVerified && <BadgeCheck className="h-5 w-5 shrink-0 text-primary" aria-label="Verified" />}
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{email}</span>
                </p>
              </div>
            </div>
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent"
            >
              <Settings className="h-3.5 w-3.5" /> Edit settings
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5">
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Member since</p>
                <p className="truncate text-sm font-medium">{memberSince}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5">
              <KeyRound className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sign-in method</p>
                <p className="truncate text-sm font-medium capitalize">{profile?.provider || "local"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5">
              <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">AI requests</p>
                <p className="truncate text-sm font-medium tabular-nums">{usage ? usage.totalRequests.toLocaleString() : "—"}</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Usage overview */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }} className="card-surface mt-5 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-tight">
          <BarChart3 className="h-4 w-4 text-primary" /> Usage overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">AI requests</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{usage ? usage.totalRequests.toLocaleString() : <Loader2 className="h-5 w-5 animate-spin" />}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Tokens used</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{usage ? usage.totalTokens.toLocaleString() : <Loader2 className="h-5 w-5 animate-spin" />}</p>
          </div>
          <Link
            to="/analytics"
            className="group col-span-2 flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 sm:col-span-1"
          >
            <div>
              <p className="text-xs text-muted-foreground">Detailed analytics</p>
              <p className="mt-1 text-sm text-muted-foreground">Requests, tokens &amp; models</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </motion.div>

      {/* Quick links */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { to: "/settings", icon: Settings, title: "Account & Settings", desc: "Profile, appearance, AI preferences and security" },
          { to: "/models", icon: Cpu, title: "AI Models", desc: "Browse every model and set your default" },
          { to: "/voice", icon: AudioLines, title: "Voice Studio", desc: "Transcribe, translate and analyze audio" },
          { to: "/analytics", icon: BarChart3, title: "Analytics", desc: "See your full usage breakdown" },
        ].map(({ to, icon: Icon, title, desc }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:border-primary/40 hover:bg-accent/40"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="truncate text-xs text-muted-foreground">{desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </motion.div>
    </div>
  );
}
