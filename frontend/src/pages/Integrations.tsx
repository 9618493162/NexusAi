import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plug, CheckCircle2, RefreshCw, Loader2, Star, Shield,
  Github, Mail, Cpu, Server, Plus, Trash2, AlertCircle, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth.store";
import { providersService, ProviderStatus, ByokKeysResponse, ByokProvider } from "@/services/providers.service";
import { supabaseConfigured } from "@/services/supabase.client";
import { cn } from "@/utils/cn";

/* ── Category model ── */
interface IntegrationCategory {
  id: string;
  label: string;
  description: string;
  icon: typeof Plug;
}

const CATEGORIES: IntegrationCategory[] = [
  { id: "auth", label: "Authentication", description: "How you sign in to NexusAI", icon: Shield },
  { id: "ai", label: "AI Providers", description: "Your own API keys for AI models", icon: Cpu },
  { id: "third-party", label: "Third-Party Integrations", description: "Connect external tools and services", icon: Plug },
];

type BadgeStatus = "connected" | "server-key" | "error" | "not-configured" | ProviderStatus["status"];

function ProviderStatusBadge({ status }: { status: BadgeStatus }) {
  const map: Record<string, { label: string; cls: string }> = {
    connected: { label: "Connected", cls: "bg-success/12 text-success" },
    ok: { label: "Connected", cls: "bg-success/12 text-success" },
    "server-key": { label: "Server key", cls: "bg-info/12 text-info" },
    configured: { label: "Server key", cls: "bg-info/12 text-info" },
    error: { label: "Error", cls: "bg-destructive/12 text-destructive" },
    invalid: { label: "Invalid key", cls: "bg-destructive/12 text-destructive" },
    low: { label: "Low credits", cls: "bg-warning/12 text-warning" },
    no_credits: { label: "No credits", cls: "bg-destructive/12 text-destructive" },
    "not-configured": { label: "Not configured", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status] || map["not-configured"];
  const isError = status === "error" || status === "invalid" || status === "no_credits";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium", s.cls)}>
      {status === "connected" || status === "ok" ? <CheckCircle2 className="h-3 w-3" /> : isError ? <AlertCircle className="h-3 w-3" /> : <Server className="h-3 w-3" />}
      {s.label}
    </span>
  );
}

export function Integrations() {
  const user = useAuthStore((s) => s.user);
  const [, setProviders] = useState<ProviderStatus[] | null>(null);
  const [byok, setByok] = useState<ByokKeysResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [byokModal, setByokModal] = useState<ByokProvider | null>(null);
  const [modalKey, setModalKey] = useState("");
  const [modalLabel, setModalLabel] = useState("");
  const [modalMsg, setModalMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingProvider, setRemovingProvider] = useState<ByokProvider | null>(null);

  const checkProviders = useCallback(async () => {
    setChecking(true);
    try {
      const [statusRes, byokRes] = await Promise.all([
        providersService.getStatus(),
        providersService.getKeys(),
      ]);
      setProviders(statusRes.data.providers);
      setByok(byokRes.data);
    } catch {
      setProviders([]);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { checkProviders(); }, [checkProviders]);

  const openByokModal = (p: ByokProvider) => {
    setByokModal(p);
    setModalKey("");
    setModalLabel("");
    setModalMsg(null);
  };

  const saveByokKey = async () => {
    if (!byokModal || !modalKey.trim()) return;
    setSaving(true);
    setModalMsg(null);
    try {
      await providersService.addKey(byokModal, modalKey.trim(), modalLabel.trim() || undefined);
      setModalMsg({ type: "success", text: `Key saved for ${byokModalMeta?.name || byokModal}. It will be validated on the next request.` });
      checkProviders();
    } catch (err: any) {
      setModalMsg({ type: "error", text: err.response?.data?.error || err.message || "Failed to save key" });
    } finally {
      setSaving(false);
    }
  };

  const removeByokKey = async (p: ByokProvider) => {
    setRemovingProvider(p);
    try {
      await providersService.removeKey(p);
      checkProviders();
    } catch { /* ignore */ }
    finally { setRemovingProvider(null); }
  };

  const setDefaultByok = async (p: ByokProvider) => {
    await providersService.setDefaultProvider(p);
    checkProviders();
  };

  // The frontend User type doesn't expose OAuth provider info, so we show
  // auth methods as available rather than claiming connection status.
  const hasEmail = !!user?.email;

  const filteredProviders = (byok?.keys || []).filter((k) =>
    !search || k.name.toLowerCase().includes(search.toLowerCase()) || k.provider.toLowerCase().includes(search.toLowerCase())
  );

  const byokModalMeta = byokModal ? byok?.keys.find((k) => k.provider === byokModal) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20">
            <Plug className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
            <p className="text-sm text-muted-foreground">Connect the tools you already use.</p>
          </div>
        </div>
      </motion.div>

      {/* Category tabs */}
      <div className="mt-8 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory("all")}
          className={cn(
            "rounded-xl border px-4 py-2 text-sm font-medium transition-all",
            activeCategory === "all" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
          )}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all",
              activeCategory === cat.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
            )}
          >
            <cat.icon className="h-3.5 w-3.5" />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mt-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search integrations..."
          className="h-10 w-full rounded-xl border border-border bg-card/60 px-4 text-sm outline-none backdrop-blur transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
        />
      </div>

      {/* ── Authentication Section ── */}
      {(activeCategory === "all" || activeCategory === "auth") && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }} className="mt-8">
          <h2 className="mb-1 text-sm font-semibold tracking-tight text-foreground">Authentication</h2>
          <p className="mb-4 text-xs text-muted-foreground">How you sign in to NexusAI</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Google */}
            <div className="card-surface group relative overflow-hidden p-5 transition-transform duration-200 ease-fluid hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                    <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Google</p>
                    <p className="text-xs text-muted-foreground">Sign in with Google</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">Available</span>
              </div>
            </div>

            {/* GitHub */}
            <div className="card-surface group relative overflow-hidden p-5 transition-transform duration-200 ease-fluid hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                    <Github className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">GitHub</p>
                    <p className="text-xs text-muted-foreground">Sign in with GitHub</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">Available</span>
              </div>
            </div>

            {/* Email */}
            <div className="card-surface group relative overflow-hidden p-5 transition-transform duration-200 ease-fluid hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-xs text-muted-foreground">Sign in with email &amp; password</p>
                  </div>
                </div>
                {hasEmail ? (
                  <ProviderStatusBadge status="connected" />
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {supabaseConfigured ? "Active" : "Not configured"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.section>
      )}

      {/* ── AI Providers Section ── */}
      {(activeCategory === "all" || activeCategory === "ai") && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }} className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="mb-1 text-sm font-semibold tracking-tight text-foreground">AI Providers</h2>
              <p className="text-xs text-muted-foreground">Your own API keys — encrypted server-side, never exposed to the browser</p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/settings" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
                <Settings className="h-3.5 w-3.5" /> Advanced settings
              </Link>
              <button
                onClick={checkProviders}
                disabled={checking}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} /> Re-check
              </button>
            </div>
          </div>

          {byok === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading provider status...</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProviders.map((k) => (
                <div key={k.provider} className="card-surface group relative overflow-hidden p-4 transition-transform duration-200 ease-fluid hover:-translate-y-0.5">
                  <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/8 blur-2xl transition-opacity duration-300" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{k.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{k.usedFor}</p>
                    </div>
                    <button
                      onClick={() => setDefaultByok(k.provider)}
                      title={byok.defaultProvider === k.provider ? "Default chat provider" : "Set as default chat provider"}
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                        byok.defaultProvider === k.provider
                          ? "border-primary/40 bg-primary/12 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-primary"
                      )}
                    >
                      <Star className={cn("h-3.5 w-3.5", byok.defaultProvider === k.provider && "fill-primary")} />
                    </button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {k.hasUserKey ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-0.5 text-[11px] font-medium text-success">
                        <CheckCircle2 className="h-3 w-3" /> Your key ••••{k.keyHint}
                      </span>
                    ) : k.serverConfigured ? (
                      <ProviderStatusBadge status="server-key" />
                    ) : (
                      <ProviderStatusBadge status="not-configured" />
                    )}
                    {byok.defaultProvider === k.provider && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">Default</span>
                    )}
                  </div>
                  {k.hasUserKey && (k.usageCount != null || k.totalTokens != null || k.lastUsedAt) && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {k.usageCount != null ? `${k.usageCount} request${k.usageCount === 1 ? "" : "s"}` : ""}
                      {k.usageCount != null && k.totalTokens != null ? " · " : ""}
                      {k.totalTokens != null ? `${k.totalTokens.toLocaleString()} tokens` : ""}
                      {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : ""}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openByokModal(k.provider)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      <Plus className="h-3 w-3" /> {k.hasUserKey ? "Replace key" : "Add API key"}
                    </button>
                    {k.hasUserKey && (
                      <button
                        onClick={() => removeByokKey(k.provider)}
                        disabled={removingProvider === k.provider}
                        className="inline-flex items-center gap-1 rounded-lg border border-destructive/25 bg-destructive/5 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                      >
                        {removingProvider === k.provider ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.section>
      )}

      {/* ── Third-Party Integrations (Empty State) ── */}
      {(activeCategory === "all" || activeCategory === "third-party") && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }} className="mt-10">
          <h2 className="mb-1 text-sm font-semibold tracking-tight text-foreground">Third-Party Integrations</h2>
          <p className="mb-4 text-xs text-muted-foreground">Connect external tools and services</p>
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Plug className="h-6 w-6 text-primary/60" />
            </div>
            <p className="text-sm font-medium text-foreground">No third-party integrations available yet</p>
            <p className="mt-1 max-w-sm mx-auto text-xs text-muted-foreground">
              Third-party integrations like Google Drive, Slack, and Notion require backend support.
              These will be available when the backend connector system is implemented.
            </p>
          </div>
        </motion.section>
      )}

      {/* ── Add/Replace Key Modal ── */}
      {byokModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setByokModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="glass-strong relative w-full max-w-md overflow-hidden rounded-2xl p-6 shadow-popover">
            <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 h-36 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative">
              <h3 className="text-base font-semibold tracking-tight">Connect {byokModalMeta?.name || byokModal}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Stored encrypted on the server &mdash; used only for your requests.</p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">API key</label>
                  <input type="password" value={modalKey} onChange={(e) => { setModalKey(e.target.value); setModalMsg(null); }} placeholder="sk-..." autoFocus className="h-10 w-full rounded-xl border border-border bg-card/80 px-3.5 text-sm outline-none backdrop-blur transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Label (optional)</label>
                  <input type="text" value={modalLabel} onChange={(e) => setModalLabel(e.target.value)} placeholder="e.g. Work account" className="h-10 w-full rounded-xl border border-border bg-card/80 px-3.5 text-sm outline-none backdrop-blur transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>
              {modalMsg && (
                <div className={cn("mt-3 rounded-lg border px-3.5 py-2.5 text-xs", modalMsg.type === "success" ? "border-success/30 bg-success/8 text-success" : "border-destructive/30 bg-destructive/8 text-destructive")}>
                  {modalMsg.text}
                </div>
              )}
              <div className="mt-5 flex items-center justify-end gap-2">
                <button onClick={() => setByokModal(null)} className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Cancel</button>
                <Button onClick={saveByokKey} disabled={saving || !modalKey.trim()} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                  {saving ? "Testing..." : "Save & test"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
