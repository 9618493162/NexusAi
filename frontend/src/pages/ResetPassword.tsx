import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/AuthShell";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { supabase, supabaseConfigured, createRecoveryClient, SupabaseClient } from "@/services/supabase.client";
import { PageLoader } from "@/components/PageLoader";

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const activeClient = useRef<SupabaseClient | null>(null);
  const recovering = useRef(false);

  useEffect(() => {
    if (recovering.current) return; // StrictMode double-effect: run recovery once
    recovering.current = true;
    (async () => {
      if (supabaseConfigured) {
        // Recovery links arrive in one of two formats and the client flow type
        // must match, or auth-js rejects the URL (PKCE client + implicit link
        // throws AuthPKCEGrantCodeExchangeError):
        // - implicit: tokens in the hash (#access_token=...), from the backend
        //   /admin recovery path (no code_challenge was sent)
        // - pkce: one-time code in the query (?code=...), from the app's own
        //   ForgotPassword flow (verifier is stored in localStorage)
        const isImplicitLink = window.location.hash.includes("access_token=");
        const client = isImplicitLink
          ? createRecoveryClient("implicit")
          : supabase;
        activeClient.current = client;
        try {
          if (!client) {
            setError("This reset link is invalid or expired. Please request a new one.");
            return;
          }
          const { data } = await client.auth.getUser();
          if (data.user) setReady(true);
          else setError("This reset link is invalid or expired. Please request a new one.");
        } catch {
          setError("This reset link is invalid or expired. Please request a new one.");
        }
      } else {
        const t = searchParams.get("token");
        if (t) {
          setToken(t);
          setReady(true);
        } else {
          setError("This reset link is invalid or expired. Please request a new one.");
        }
      }
    })();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      if (supabaseConfigured) {
        const client = activeClient.current ?? supabase;
        if (!client) {
          throw new Error("Could not connect to Supabase");
        }
        const { error: sbErr } = await client.auth.updateUser({ password });
        if (sbErr) throw new Error(sbErr.message);
      } else if (token) {
        await authService.resetPassword(token, password);
      }
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    const { isAuthenticated } = useAuthStore.getState();
    return (
      <AuthShell
        title="Password updated"
        subtitle="Your new password is active"
        footer={undefined}
      >
        <div className="flex flex-col items-center py-4 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success ring-1 ring-success/25">
            <CheckCircle2 className="h-7 w-7" strokeWidth={1.7} />
          </div>
          <Link
            to={isAuthenticated ? "/chat" : "/login?reset=success"}
            className="w-full"
          >
            <Button className="w-full" size="lg">
              {isAuthenticated ? "Continue to app" : "Sign in with your new password"}
            </Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (!ready) {
    if (error) {
      return (
        <AuthShell
          title="Reset link invalid"
          subtitle={undefined}
          footer={
            <Link to="/forgot-password" className="inline-flex items-center gap-1.5 font-medium text-primary transition-colors hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Request a new link
            </Link>
          }
        >
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</div>
        </AuthShell>
      );
    }
    return <PageLoader />;
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Your password will be updated immediately"
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-primary transition-colors hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</div>
        )}
        <div className="space-y-2">
          <label htmlFor="rp-password" className="text-sm font-medium">New password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="rp-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" placeholder="••••••••" required autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="rp-confirm" className="text-sm font-medium">Confirm new password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="rp-confirm" type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="pl-10" placeholder="••••••••" required autoComplete="new-password" />
          </div>
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
