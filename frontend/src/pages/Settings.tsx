import { motion } from "framer-motion";
import {
  User, Sun, Moon, LogOut, Shield, Mail, Server, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Palette, Cpu, Check, Info, Database, BarChart3, KeyRound, CalendarDays,
  Link2, ArrowRight, Loader2, BadgeCheck, Clock, Sparkles, WifiOff, Camera, Trash2,
  Monitor, Smartphone, Brain,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth.store";
import { useThemeStore, type ThemeMode } from "@/store/theme.store";
import { cn } from "@/utils/cn";
import { providersService, ProviderStatus } from "@/services/providers.service";
import { voiceService } from "@/services/voice.service";
import { usageService } from "@/services/usage.service";
import { authService } from "@/services/auth.service";
import { settingsService } from "@/services/settings.service";
import { LANG_COLORS, getLangColor, setLangColor, resetLangColor, defaultColorFor, syncLangColorsFromServer, pushLangColorsToServer } from "@/utils/languageColors";
import { getAIPreferences, setAIPreferences } from "@/utils/aiPreferences";
import { Select } from "@/components/ui/select";
import { useEffect, useState, useCallback, useRef } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { AvatarImage } from "@/components/ui/avatar-image";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

type SectionKey = "account" | "appearance" | "ai" | "integrations" | "security" | "data" | "about";

const SECTIONS: Array<{ key: SectionKey; label: string; icon: React.ElementType }> = [
  { key: "account", label: "Account", icon: User },
  { key: "appearance", label: "Appearance", icon: Sun },
  { key: "ai", label: "AI Preferences", icon: Cpu },
  { key: "integrations", label: "Integrations", icon: Server },
  { key: "security", label: "Security", icon: Shield },
  { key: "data", label: "Data & Usage", icon: Database },
  { key: "about", label: "About", icon: Info },
];

function Section({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description?: string; children: React.ReactNode }) {
  return (
    <motion.section
      key={title}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-surface overflow-hidden"
    >
      <div className="border-b border-border px-6 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </motion.section>
  );
}

function InfoRow({ label, value, icon: Icon, hint }: { label: string; value: React.ReactNode; icon?: React.ElementType; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-4 py-2.5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        {label}
      </span>
      <span className="truncate text-right text-sm font-medium" title={hint}>{value}</span>
    </div>
  );
}

function ProviderStatusBadge({ status, configured }: { status: ProviderStatus["status"]; configured: boolean }) {
  if (status === "ok") return <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</span>;
  if (status === "no_credits") return <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><AlertTriangle className="h-3.5 w-3.5" /> No credits</span>;
  if (status === "low") return <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><AlertTriangle className="h-3.5 w-3.5" /> Low</span>;
  if (status === "invalid") return <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><XCircle className="h-3.5 w-3.5" /> Invalid key</span>;
  if (configured) return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><Server className="h-3.5 w-3.5" /> Configured</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><Server className="h-3.5 w-3.5" /> Not configured</span>;
}

interface ProfileShape {
  id?: string;
  email?: string | null;
  name?: string | null;
  avatar?: string | null;
  provider?: string | null;
  isVerified?: boolean;
  hasPassword?: boolean;
  createdAt?: string | null;
}

function useProfile() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<ProfileShape | null>(null);
  useEffect(() => {
    authService
      .me()
      .then(({ data }) => setProfile(data))
      .catch(() => setProfile(null));
  }, []);
  // The /me response is the source of truth; fall back to the stored user so
  // the UI never flashes empty while it loads or if the fetch fails.
  return {
    profile: {
      id: profile?.id ?? user?.id,
      email: profile?.email !== undefined ? profile.email : user?.email,
      name: profile?.name !== undefined ? profile.name : user?.name,
      avatar: profile?.avatar !== undefined ? profile.avatar : user?.avatar,
      provider: profile?.provider ?? null,
      isVerified: profile?.isVerified ?? false,
      hasPassword: profile?.hasPassword ?? false,
      createdAt: profile?.createdAt ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Settings() {
  const { user, logout } = useAuthStore();
  const { mode, isDark, setMode } = useThemeStore();
  const navigate = useNavigate();
  const [active, setActive] = useState<SectionKey>("account");
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [languages, setLanguages] = useState<Array<{ code: string; name: string }>>([]);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [chatModelOptions, setChatModelOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [defaultModel, setDefaultModel] = useState<string>(() => getAIPreferences().defaultModel);
  const [prefSaved, setPrefSaved] = useState(false);
  const [usage, setUsage] = useState<{ totalTokens: number; totalRequests: number; byType: Record<string, number> } | null>(null);
  const { profile } = useProfile();

  // Profile editing state (real PATCH /auth/me)
  const [nameDraft, setNameDraft] = useState<string>("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Avatar upload state (real POST /auth/avatar + DELETE /auth/avatar)
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Security actions
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [signingOutAll, setSigningOutAll] = useState(false);

  // Active sessions (real refresh tokens, with device info)
  const [sessions, setSessions] = useState<Array<{
    id: string;
    createdAt: string;
    lastUsedAt: string;
    expiresAt: string;
    browser: string;
    os: string;
    device: string;
    isCurrent: boolean;
  }> | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [sessionMsg, setSessionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadSessions = useCallback(async () => {
    setSessionsError(false);
    try {
      const { data } = await authService.getSessions();
      setSessions(data.sessions);
    } catch {
      setSessionsError(true);
    }
  }, []);

  useEffect(() => {
    if (active === "security") loadSessions();
  }, [active, loadSessions]);

  const revokeSession = async (id: string) => {
    setRevokingId(id);
    setSessionMsg(null);
    try {
      await authService.revokeSession(id);
      setSessions((s) => (s ? s.filter((x) => x.id !== id) : s));
      setSessionMsg({ ok: true, text: "Session revoked — that device is signed out." });
    } catch (err: any) {
      setSessionMsg({ ok: false, text: err?.response?.data?.error || "Could not revoke that session." });
    } finally {
      setRevokingId(null);
    }
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fmtActive = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return days === 1 ? "yesterday" : `${days}d ago`;
  };
  const isMobileDevice = (d: string) => d === "Mobile" || d === "iPhone" || d === "iPad" || d === "Android";

  // Change-password (local accounts only)
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const changePassword = async () => {
    setPwMsg(null);
    if (!pwCurrent) {
      setPwMsg({ ok: false, text: "Enter your current password." });
      return;
    }
    if (pwNew.length < 8) {
      setPwMsg({ ok: false, text: "New password must be at least 8 characters." });
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwMsg({ ok: false, text: "New passwords do not match." });
      return;
    }
    setChangingPw(true);
    try {
      await authService.changePassword(pwCurrent, pwNew);
      setPwMsg({ ok: true, text: "Password changed successfully." });
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
    } catch (err: any) {
      setPwMsg({ ok: false, text: err?.response?.data?.error || "Could not change password — try again." });
    } finally {
      setChangingPw(false);
    }
  };

  // Keep the name draft in sync with the real profile once it loads.
  useEffect(() => {
    if (profile?.name) setNameDraft((current) => (current === "" && profile.name ? profile.name : current));
  }, [profile?.name]);

  useEffect(() => {
    voiceService
      .getLanguages()
      .then((list) => { if (Array.isArray(list) && list.length) setLanguages(list); })
      .catch(() => { /* badge colors still work with defaults */ });
    syncLangColorsFromServer().catch(() => {});
    usageService.getUsage().then(({ data }) => setUsage(data)).catch(() => setUsage(null));
  }, []);

  const checkProviders = useCallback(async () => {
    setChecking(true);
    try {
      const { data } = await providersService.getStatus();
      setProviders(data.providers);
    } catch {
      setProviders([]);
    } finally {
      setChecking(false);
    }
  }, []);

  // Send-test-email (real end-to-end check of the email provider)
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailMsg, setTestEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const sendTestEmail = async () => {
    setSendingTestEmail(true);
    setTestEmailMsg(null);
    try {
      const { data } = await settingsService.testEmail();
      const providerLabel = data.provider === "resend" ? "Resend" : data.provider === "smtp" ? "SMTP" : data.provider;
      setTestEmailMsg({
        ok: true,
        text:
          data.fellBackFromDomain
            ? `Test email sent to ${data.to} via ${providerLabel} — check your inbox. (Sent from ${data.from}; verify your domain in Resend to use your own sender.)`
            : `Test email sent to ${data.to} via ${providerLabel} — check your inbox.`,
      });
    } catch (err: any) {
      setTestEmailMsg({ ok: false, text: err?.response?.data?.error || "Could not send the test email — try again." });
    } finally {
      setSendingTestEmail(false);
    }
  };

  useEffect(() => { checkProviders(); }, [checkProviders]);

  useEffect(() => {
    providersService
      .getModelCatalog()
      .then(({ data }) => {
        setChatModelOptions([
          { value: "auto", label: "Auto — best for task" },
          ...data.models.chat.map((m) => ({ value: m.id, label: m.name })),
        ]);
      })
      .catch(() => { /* Auto only */ });
  }, []);

  const saveProfile = async () => {
    const name = nameDraft.trim();
    if (!name || name.length > 60) {
      setProfileMsg({ ok: false, text: "Name must be between 1 and 60 characters." });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const { data } = await authService.updateProfile({ name });
      useAuthStore.getState().updateUser({ name: data.name, avatar: data.avatar });
      setProfileMsg({ ok: true, text: "Changes saved" });
    } catch {
      setProfileMsg({ ok: false, text: "Unable to save changes — try again." });
    } finally {
      setSavingProfile(false);
    }
  };

  const requestPasswordReset = async () => {
    if (!profile?.email) return;
    setResetting(true);
    setResetMsg(null);
    try {
      await authService.requestPasswordReset(profile.email);
      setResetMsg({ ok: true, text: "Reset link sent — check your email to set a new password." });
    } catch {
      setResetMsg({ ok: false, text: "Couldn't send a reset link — try again." });
    } finally {
      setResetting(false);
    }
  };

  const signOutAll = async () => {
    setSigningOutAll(true);
    try {
      await authService.logoutAll();
    } catch {
      /* still sign out locally below */
    }
    logout();
    navigate("/login");
  };

  // Fresh /me profile wins; fall back to the stored user so the UI never
  // flashes empty while it loads (mirrors useProfile's precedence).
  const avatarUrl = profile?.avatar || user?.avatar || null;

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
      setAvatarMsg({ ok: false, text: "Avatar must be a JPG, PNG, GIF or WEBP image." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarMsg({ ok: false, text: "Avatar image too large — max 5MB." });
      return;
    }
    setUploadingAvatar(true);
    setAvatarMsg(null);
    try {
      const { data } = await authService.uploadAvatar(file);
      useAuthStore.getState().updateUser({ name: data.name, avatar: data.avatar });
      setAvatarMsg({ ok: true, text: "Profile photo updated" });
    } catch (err: any) {
      setAvatarMsg({ ok: false, text: err?.response?.data?.error || "Could not upload avatar — try again." });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    setAvatarMsg(null);
    try {
      const { data } = await authService.removeAvatar();
      useAuthStore.getState().updateUser({ avatar: data.avatar });
      setAvatarMsg({ ok: true, text: "Profile photo removed" });
    } catch {
      setAvatarMsg({ ok: false, text: "Could not remove photo — try again." });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const providerLabel = profile?.provider || "local";
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;
  const usageByType = usage?.byType || {};

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        icon={User}
        title="Account & Settings"
        description="Manage your NexusAI account, preferences and security — every value here is real and persisted."
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Section navigation — horizontal pills on mobile, vertical rail on desktop */}
        <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto pb-1 lg:w-56 lg:flex-col lg:overflow-visible lg:pb-0">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              aria-current={active === key ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active === key ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-5">
          {active === "account" && (
            <Section icon={User} title="Account" description="Your identity on NexusAI">
              <div className="mb-6 flex items-center gap-4">
                <div className="relative shrink-0">
                  <AvatarImage
                    src={avatarUrl}
                    alt="Profile"
                    className="h-16 w-16 rounded-2xl object-cover shadow-sm ring-1 ring-border"
                    fallback={
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-indigo-500 text-2xl font-bold text-primary-foreground shadow-sm">
                        {user?.name?.[0] || user?.email?.[0]?.toUpperCase() || "U"}
                      </div>
                    }
                  />
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    aria-label="Change profile photo"
                    title="Change profile photo"
                    disabled={uploadingAvatar}
                    className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                  >
                    {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarFile}
                    className="hidden"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold tracking-tight">{user?.name || "User"}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> {user?.email || "No email"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      <Camera className="h-3 w-3" /> {avatarUrl ? "Change photo" : "Upload photo"}
                    </button>
                    {avatarUrl && (
                      <button
                        onClick={handleRemoveAvatar}
                        disabled={uploadingAvatar}
                        className="inline-flex items-center gap-1 rounded-lg border border-destructive/25 bg-destructive/5 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                    {avatarMsg && (
                      <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", avatarMsg.ok ? "text-success" : "text-destructive")}>
                        {avatarMsg.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {avatarMsg.text}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Display name</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={60}
                  placeholder="Your name"
                  aria-label="Display name"
                  className="h-9 w-full max-w-xs rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                />
                <Button onClick={saveProfile} disabled={savingProfile || !nameDraft.trim() || nameDraft.trim() === (user?.name || "")}>
                  {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  {savingProfile ? "Saving…" : "Save changes"}
                </Button>
                {profileMsg && (
                  <span className={cn("inline-flex items-center gap-1 text-xs font-medium", profileMsg.ok ? "text-success" : "text-destructive")}>
                    {profileMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {profileMsg.text}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Saved to your account and synced across devices. Photos are JPG, PNG, GIF or WEBP up to 5MB.
              </p>

              <div className="mt-6 space-y-2.5">
                <InfoRow label="Email" value={user?.email || "No email"} icon={Mail} />
                <InfoRow
                  label="Email verified"
                  value={profile?.isVerified ? <span className="inline-flex items-center gap-1 text-success"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span> : "Not verified"}
                />
                <InfoRow
                  label="Sign-in method"
                  value={<span className="capitalize">{providerLabel}</span>}
                  icon={KeyRound}
                />
                {memberSince && <InfoRow label="Member since" value={memberSince} icon={CalendarDays} />}
              </div>
            </Section>
          )}

          {active === "appearance" && (
            <Section icon={Sun} title="Appearance" description="Choose how NexusAI looks — saved to your account and synced across devices">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {([
                  { m: "light" as ThemeMode, label: "Light", preview: "light" },
                  { m: "dark" as ThemeMode, label: "Dark", preview: "dark" },
                  { m: "system" as ThemeMode, label: "System", preview: "system" },
                ]).map(({ m, label, preview }) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={cn(
                      "flex flex-col items-center gap-2.5 rounded-xl border-2 p-5 transition-all",
                      mode === m ? "border-primary bg-primary/8 shadow-sm" : "border-border hover:border-primary/40"
                    )}
                  >
                    <div className="flex h-14 w-20 flex-col gap-1.5 rounded-lg border border-border p-2 shadow-sm">
                      {preview === "light" ? (
                        <>
                          <div className="h-1.5 w-8 rounded-full bg-neutral-300" />
                          <div className="h-1.5 w-10 rounded-full bg-neutral-200" />
                          <div className="h-4 w-10 rounded bg-violet-500/20" />
                        </>
                      ) : preview === "dark" ? (
                        <>
                          <div className="h-1.5 w-8 rounded-full bg-neutral-600" />
                          <div className="h-1.5 w-10 rounded-full bg-neutral-700" />
                          <div className="h-4 w-10 rounded bg-violet-500/30" />
                        </>
                      ) : (
                        <>
                          <div className="flex gap-1.5">
                            <div className="flex h-10 flex-1 flex-col gap-1.5 rounded border border-border bg-white p-1.5">
                              <div className="h-1 w-5 rounded-full bg-neutral-300" />
                              <div className="h-2 w-7 rounded bg-violet-500/20" />
                            </div>
                            <div className="flex h-10 flex-1 flex-col gap-1.5 rounded border border-[#2a2a35] bg-[#16161c] p-1.5">
                              <div className="h-1 w-5 rounded-full bg-neutral-600" />
                              <div className="h-2 w-7 rounded bg-violet-500/30" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <span className={cn("text-sm font-medium", mode === m ? "text-primary" : "text-muted-foreground")}>{label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Moon className="h-3.5 w-3.5" /> Currently {mode === "system" ? `System (${isDark ? "dark" : "light"} right now)` : mode === "dark" ? "Dark" : "Light"}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Your choice is saved to your account and applies on every device you sign in to.
              </p>
            </Section>
          )}

          {active === "ai" && (
            <Section icon={Cpu} title="AI Preferences" description="Default model used by Chat and the Command Center when none is chosen">
              <div className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Default chat model</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={defaultModel}
                      onChange={(v) => { setDefaultModel(v); setAIPreferences({ defaultModel: v }); setPrefSaved(true); window.setTimeout(() => setPrefSaved(false), 1600); }}
                      options={chatModelOptions.length ? chatModelOptions : [{ value: "auto", label: "Auto — best for task" }]}
                      ariaLabel="Default chat model"
                      searchable
                      className="w-72"
                    />
                    {prefSaved && <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><Check className="h-3.5 w-3.5" /> Saved</span>}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">Stored on this device. A conversation's own model or an explicit choice always wins.</p>
                </div>
                <Link
                  to="/models"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  <Cpu className="h-3.5 w-3.5" /> Open Model &amp; Provider Manager
                </Link>
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <Palette className="h-4 w-4 text-primary" /> Language colors
                </h3>
                <p className="mb-3 text-xs text-muted-foreground">Badge colors for translated replies, synced across your devices.</p>
                {languages.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">Loading languages…</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {languages.filter((l) => l.code !== "en").map((l) => {
                      const color = getLangColor(l.code);
                      const isCustom = color !== defaultColorFor(l.code);
                      return (
                        <div key={l.code} className="relative flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5">
                          <span className="text-sm font-medium" style={{ color }}>{l.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide" style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}40` }}>
                              {l.code}
                            </span>
                            <button
                              onClick={() => setColorPickerFor(colorPickerFor === l.code ? null : l.code)}
                              aria-label={`Color for ${l.name}`}
                              className="h-5.5 w-5.5 rounded-full border-2 border-border/70 transition-transform hover:scale-110"
                              style={{ backgroundColor: color }}
                            />
                          </div>
                          {colorPickerFor === l.code && (
                            <div className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-border bg-popover p-2.5 shadow-popover animate-scale-in">
                              <div className="grid grid-cols-6 gap-1.5">
                                {LANG_COLORS.map((c) => (
                                  <button
                                    key={c}
                                    onClick={() => { setLangColor(l.code, c); setColorPickerFor(null); pushLangColorsToServer(); }}
                                    aria-label={`Use ${c}`}
                                    className="h-5.5 w-5.5 rounded-full border border-border/50 transition-transform hover:scale-110"
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                              {isCustom && (
                                <button
                                  onClick={() => { resetLangColor(l.code); setColorPickerFor(null); pushLangColorsToServer(); }}
                                  className="mt-2 w-full text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  Reset to default
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Section>
          )}

          {active === "integrations" && (
            <Section icon={Server} title="Integrations" description="Live status of every AI provider powering NexusAI">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Keys are stored server-side in backend/.env — never in your browser.</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={sendTestEmail}
                    disabled={sendingTestEmail || !user?.email}
                    title="Send a real test email to your address"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <Mail className={cn("h-3.5 w-3.5", sendingTestEmail && "animate-pulse")} />
                    {sendingTestEmail ? "Sending…" : "Send test email"}
                  </button>
                  <button
                    onClick={checkProviders}
                    disabled={checking}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} /> Re-check
                  </button>
                </div>
              </div>
              {testEmailMsg && (
                <p className={cn("mb-3 flex items-center gap-1.5 text-xs font-medium", testEmailMsg.ok ? "text-success" : "text-destructive")}>
                  {testEmailMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                  {testEmailMsg.text}
                </p>
              )}
              {providers === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Checking provider status…</p>
              ) : providers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Couldn't load provider status.</p>
              ) : (
                <div className="space-y-1.5">
                  {providers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/60">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.usedFor}{p.detail ? ` — ${p.detail}` : ""}</p>
                      </div>
                      <ProviderStatusBadge status={p.status} configured={p.configured} />
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                If a provider shows <span className="font-medium text-warning">No credits</span>, top it up at its dashboard and hit re-check.
              </p>

              <div className="mt-6 border-t border-border pt-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <Link2 className="h-4 w-4 text-primary" /> Connected accounts
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-neutral-700 ring-1 ring-border">G</div>
                      <div>
                        <p className="text-sm font-medium">Google</p>
                        <p className="text-xs text-muted-foreground">{user?.email || "Sign-in identity"}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Connected</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  You're signed in through <span className="font-medium capitalize">{providerLabel}</span>. Managing the connection itself happens on that provider's dashboard — NexusAI keeps your keys server-side.
                </p>
              </div>
            </Section>
          )}

          {active === "security" && (
            <Section icon={Shield} title="Security" description="Password, sessions and sign-out controls">
              <div className="space-y-2.5">
                <InfoRow label="Authentication" value="JWT + refresh tokens (Supabase)" icon={KeyRound} />
                <InfoRow label="Sessions" value="Devices stay signed in via refresh tokens" icon={Clock} />
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <h3 className="mb-1 text-sm font-semibold tracking-tight">Password</h3>
                  {profile?.hasPassword === true ? (
                    <>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Change your password. You'll need your current password to confirm.
                      </p>
                      <div className="max-w-xs space-y-2.5">
                        <input
                          type={showPw ? "text" : "password"}
                          value={pwCurrent}
                          onChange={(e) => setPwCurrent(e.target.value)}
                          placeholder="Current password"
                          aria-label="Current password"
                          autoComplete="current-password"
                          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                        />
                        <input
                          type={showPw ? "text" : "password"}
                          value={pwNew}
                          onChange={(e) => setPwNew(e.target.value)}
                          placeholder="New password (min 8 characters)"
                          aria-label="New password"
                          autoComplete="new-password"
                          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                        />
                        <input
                          type={showPw ? "text" : "password"}
                          value={pwConfirm}
                          onChange={(e) => setPwConfirm(e.target.value)}
                          placeholder="Confirm new password"
                          aria-label="Confirm new password"
                          autoComplete="new-password"
                          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button onClick={changePassword} disabled={changingPw}>
                            {changingPw ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                            {changingPw ? "Changing…" : "Change password"}
                          </Button>
                          <button
                            type="button"
                            onClick={() => setShowPw((v) => !v)}
                            className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent"
                          >
                            {showPw ? "Hide" : "Show"}
                          </button>
                        </div>
                        {pwMsg && (
                          <span className={cn("flex items-center gap-1 text-xs font-medium", pwMsg.ok ? "text-success" : "text-destructive")}>
                            {pwMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                            {pwMsg.text}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Forgot your password instead? <button onClick={requestPasswordReset} className="font-medium text-primary underline-offset-2 hover:underline" disabled={resetting || !profile?.email}>{resetting ? "Sending…" : "Send a reset link"}</button>
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mb-3 text-xs text-muted-foreground">
                        This account signs in through <span className="font-medium capitalize">{providerLabel}</span>, so it has no local password. To change it, we send a secure reset link to your email.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={requestPasswordReset} disabled={resetting || !profile?.email}>
                          {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                          {resetting ? "Sending…" : "Send reset link"}
                        </Button>
                        {resetMsg && (
                          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", resetMsg.ok ? "text-success" : "text-destructive")}>
                            {resetMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                            {resetMsg.text}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <h3 className="mb-1 text-sm font-semibold tracking-tight">Sessions</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Sign out everywhere else, or on just this device.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={signOutAll} disabled={signingOutAll}>
                      {signingOutAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                      {signingOutAll ? "Signing out…" : "Sign out all devices"}
                    </Button>
                    <Button variant="outline" onClick={() => { logout(); navigate("/login"); }}>
                      <LogOut className="h-4 w-4 mr-2" /> Sign out this device
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold tracking-tight">
                    <Monitor className="h-4 w-4 text-primary" /> Active sessions
                  </h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Devices signed in to your account. Revoking a session signs that device out on its next request.
                  </p>
                  {sessions === null && !sessionsError ? (
                    <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…
                    </p>
                  ) : sessionsError ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
                      <span className="text-sm text-muted-foreground">Couldn't load your sessions.</span>
                      <Button variant="outline" size="sm" onClick={loadSessions}>Try again</Button>
                    </div>
                  ) : sessions && sessions.length === 0 ? (
                    <p className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-center text-sm text-muted-foreground">
                      No active sessions — sign in to create one.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {sessions?.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/60">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              {isMobileDevice(s.device) ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                {s.browser !== "Unknown" ? `${s.browser} on ${s.os}` : "Unknown device"}
                                {s.isCurrent && (
                                  <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                    Current
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                Signed in {fmtDate(s.createdAt)} · Active {fmtActive(s.lastUsedAt)} · Expires {fmtDate(s.expiresAt)}
                              </p>
                            </div>
                          </div>
                          {!s.isCurrent && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => revokeSession(s.id)}
                              disabled={revokingId === s.id}
                            >
                              {revokingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {sessionMsg && (
                    <span className={cn("mt-2 flex items-center gap-1 text-xs font-medium", sessionMsg.ok ? "text-success" : "text-destructive")}>
                      {sessionMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                      {sessionMsg.text}
                    </span>
                  )}
                </div>
              </div>
            </Section>
          )}

          {active === "data" && (
            <Section icon={Database} title="Data & Usage" description="Your real NexusAI usage from the backend">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><BarChart3 className="h-3.5 w-3.5" /> AI requests</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{usage ? usage.totalRequests.toLocaleString() : "—"}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Cpu className="h-3.5 w-3.5" /> Tokens</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{usage ? usage.totalTokens.toLocaleString() : "—"}</p>
                </div>
                <div className="col-span-2 rounded-xl border border-border/60 bg-muted/30 p-4 sm:col-span-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> By type</p>
                  <p className="mt-1 text-sm font-medium">
                    {Object.keys(usageByType).length
                      ? Object.entries(usageByType).map(([t, v]) => `${t}: ${v.toLocaleString()}`).join(" · ")
                      : "No usage recorded yet"}
                  </p>
                </div>
              </div>
              <Link
                to="/analytics"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                View detailed analytics <ArrowRight className="h-3.5 w-3.5" />
              </Link>

              <div className="mt-6 border-t border-border pt-5">
                <h3 className="mb-1 text-sm font-semibold tracking-tight">Your data</h3>
                <p className="text-xs text-muted-foreground">
                  Conversations, files, voice sessions and usage stats are stored in your Supabase database and belong to you.
                </p>
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3.5 text-xs text-muted-foreground">
                  <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <span>
                    Exporting or deleting your account data isn't available through NexusAI yet. For anything you can't manage in the app
                    (conversations, files, voice history), contact support and we'll help.
                  </span>
                </div>
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold tracking-tight">AI Memory</h3>
                <p className="text-xs text-muted-foreground">
                  NexusAI remembers your conversations, files, voice sessions and preferences — all your own data, always
                  inspectable and removable. There are no hidden switches: memory is on by default and you can forget anything,
                  item by item or in bulk, from the Memory center.
                </p>
                <Link
                  to="/memory"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  <Brain className="h-3.5 w-3.5 text-primary" /> Open AI Memory <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </Section>
          )}

          {active === "about" && (
            <Section icon={Info} title="About" description="NexusAI — your universal AI workspace">
              <div className="space-y-2.5">
                <InfoRow label="Application" value="NexusAI" />
                <InfoRow label="Frontend" value="React + TypeScript + Tailwind (Vite)" />
                <InfoRow label="Backend" value="Node.js + Express + Prisma" />
                <InfoRow label="Database" value="PostgreSQL (Supabase)" />
                <InfoRow label="AI providers" value="Gemini · Groq · Mistral · NVIDIA · OpenRouter · Kimi · Pixazo · TinyFish · Deepgram · Edge TTS" />
              </div>
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3.5 text-xs text-muted-foreground">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  Some preferences (theme, default model, language colors) are stored on this device and follow you here; account data and
                  usage are stored server-side and follow you everywhere.
                </span>
              </p>
            </Section>
          )}

          {/* Legacy one-tap sign out stays visible in the rail footer */}
          <div className="flex items-center justify-between rounded-2xl border border-destructive/25 bg-destructive/5 px-5 py-4">
            <p className="text-sm text-muted-foreground">Need to leave quickly?</p>
            <Button variant="destructive" onClick={() => { logout(); navigate("/login"); }}>
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
