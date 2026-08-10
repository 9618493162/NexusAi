import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-4 text-center">
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/50 text-green-500 text-sm">
            Password updated successfully!
          </div>
          <Link
            to={isAuthenticated ? "/chat" : "/login?reset=success"}
            className="inline-flex items-center justify-center w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
          >
            {isAuthenticated ? "Continue to app" : "Sign in with your new password"}
          </Link>
        </motion.div>
      </div>
    );
  }

  if (!ready) {
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="w-full max-w-md space-y-4 text-center">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-500 text-sm">{error}</div>
            <Link to="/forgot-password" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
              <ArrowLeft className="w-4 h-4" /> Request a new link
            </Link>
          </div>
        </div>
      );
    }
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Choose a new password</h1>
          <p className="text-muted-foreground mt-2">Your password will be updated immediately</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-500 text-sm">{error}</div>}
          <div className="space-y-2">
            <label className="text-sm font-medium">New password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2 rounded-lg border border-input bg-muted text-foreground caret-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Confirm new password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-muted text-foreground caret-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Updating..." : "Update password"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
