import { motion } from "framer-motion";
import { User, Moon, Sun, LogOut, Shield, Mail, Server, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth.store";
import { useThemeStore } from "@/store/theme.store";
import { cn } from "@/utils/cn";
import { providersService, ProviderStatus } from "@/services/providers.service";
import { voiceService } from "@/services/voice.service";
import { LANG_COLORS, getLangColor, setLangColor, resetLangColor, defaultColorFor, syncLangColorsFromServer, pushLangColorsToServer } from "@/utils/languageColors";
import { useEffect, useState, useCallback } from "react";

function ProviderStatusBadge({ status, configured }: { status: ProviderStatus["status"]; configured: boolean }) {
  if (status === "ok") {
    return <span className="inline-flex items-center gap-1 text-emerald-500 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>;
  }
  if (status === "no_credits") {
    return <span className="inline-flex items-center gap-1 text-amber-500 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> No credits</span>;
  }
  if (status === "low") {
    return <span className="inline-flex items-center gap-1 text-amber-500 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> Low</span>;
  }
  if (status === "invalid") {
    return <span className="inline-flex items-center gap-1 text-red-500 text-xs"><XCircle className="w-3.5 h-3.5" /> Invalid key</span>;
  }
  if (configured) {
    return <span className="inline-flex items-center gap-1 text-muted-foreground text-xs"><Server className="w-3.5 h-3.5" /> Configured</span>;
  }
  return <span className="inline-flex items-center gap-1 text-muted-foreground text-xs"><Server className="w-3.5 h-3.5" /> Not configured</span>;
}

export function Settings() {
  const { user, logout } = useAuthStore();
  const { isDark, toggle } = useThemeStore();
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [languages, setLanguages] = useState<Array<{ code: string; name: string }>>([]);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);

  useEffect(() => {
    voiceService
      .getLanguages()
      .then((list) => {
        if (Array.isArray(list) && list.length) setLanguages(list);
      })
      .catch(() => { /* badge colors still work with defaults */ });
    // Pull colors saved on other devices so the picker shows the latest.
    syncLangColorsFromServer().catch(() => {});
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

  useEffect(() => {
    checkProviders();
  }, [checkProviders]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        {/* Profile */}
        <div className="rounded-xl border border-border bg-card p-6 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Profile</h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
              {user?.name?.[0] || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold truncate">{user?.name || "User"}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1 truncate"><Mail className="w-3.5 h-3.5" /> {user?.email || "No email"}</p>
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="rounded-xl border border-border bg-card p-6 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Sun className="w-4 h-4 text-primary" /> Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Theme</p>
              <p className="text-sm text-muted-foreground">Toggle between dark and light mode</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => !isDark && toggle()}
                className={cn("px-3 py-1.5 rounded-lg text-sm border transition-colors", !isDark ? "bg-primary text-primary-foreground border-primary" : "border-border bg-muted")}
              >
                <Sun className="w-4 h-4 inline mr-1" /> Light
              </button>
              <button
                onClick={() => isDark && toggle()}
                className={cn("px-3 py-1.5 rounded-lg text-sm border transition-colors", isDark ? "bg-primary text-primary-foreground border-primary" : "border-border bg-muted")}
              >
                <Moon className="w-4 h-4 inline mr-1" /> Dark
              </button>
            </div>
          </div>
        </div>

        {/* AI Providers */}
        <div className="rounded-xl border border-border bg-card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><Server className="w-4 h-4 text-primary" /> AI Providers</h2>
            <button
              onClick={checkProviders}
              disabled={checking}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", checking && "animate-spin")} /> Re-check
            </button>
          </div>
          {providers === null ? (
            <p className="text-sm text-muted-foreground">Checking provider status...</p>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Couldn't load provider status.</p>
          ) : (
            <div className="space-y-2">
              {providers.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.usedFor}{p.detail ? ` — ${p.detail}` : ""}</p>
                  </div>
                  <ProviderStatusBadge status={p.status} configured={p.configured} />
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Keys are stored server-side. If a provider shows <span className="text-amber-500">No credits</span>, top it up at its dashboard and hit re-check.
          </p>
        </div>

        {/* Language colors */}
        <div className="rounded-xl border border-border bg-card p-6 mb-6">
          <h2 className="font-semibold mb-1 flex items-center gap-2"><Palette className="w-4 h-4 text-primary" /> Language colors</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Pick a badge color per language so translated replies are easy to spot at a glance in chat.
          </p>
          {languages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading languages...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {languages.filter((l) => l.code !== "en").map((l) => {
                const color = getLangColor(l.code);
                const isCustom = color !== defaultColorFor(l.code);
                return (
                  <div key={l.code} className="relative flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                    <span className="text-xs font-medium" style={{ color }}>{l.name}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full font-medium"
                        style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}40` }}
                      >
                        {l.code}
                      </span>
                      <button
                        onClick={() => setColorPickerFor(colorPickerFor === l.code ? null : l.code)}
                        aria-label={`Color for ${l.name}`}
                        className="w-5 h-5 rounded-full border-2 border-border/70 transition-transform hover:scale-110"
                        style={{ backgroundColor: color }}
                      />
                    </div>
                    {colorPickerFor === l.code && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-border bg-popover shadow-lg p-2">
                        <div className="grid grid-cols-6 gap-1.5">
                          {LANG_COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={() => { setLangColor(l.code, c); setColorPickerFor(null); pushLangColorsToServer(); }}
                              aria-label={`Use ${c}`}
                              className="w-5 h-5 rounded-full border border-border/50 transition-transform hover:scale-110"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        {isCustom && (
                          <button
                            onClick={() => { resetLangColor(l.code); setColorPickerFor(null); pushLangColorsToServer(); }}
                            className="mt-2 w-full text-center text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
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

        {/* Account */}
        <div className="rounded-xl border border-border bg-card p-6 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> Account</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="text-emerald-500">Active</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Authentication</span><span>JWT + refresh tokens</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Data storage</span><span>PostgreSQL (Supabase)</span></div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <h2 className="font-semibold mb-2 text-destructive">Danger Zone</h2>
          <p className="text-sm text-muted-foreground mb-4">Sign out of your account on this device.</p>
          <Button variant="destructive" onClick={logout}><LogOut className="w-4 h-4 mr-2" /> Logout</Button>
        </div>
      </motion.div>
    </div>
  );
}
