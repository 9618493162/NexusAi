import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/AuthShell";
import { authService } from "@/services/auth.service";
import { supabase, supabaseConfigured, SUPABASE_REDIRECT_URL } from "@/services/supabase.client";
import { useAuthStore } from "@/store/auth.store";

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (supabaseConfigured && supabase) {
        // Supabase verifies the credentials; we then exchange the session for app tokens.
        const { data: sb, error: sbErr } = await supabase.auth.signInWithPassword({ email, password });
        if (sbErr) {
          // Account doesn't exist in Supabase (e.g. created before the migration):
          // fall back to the legacy local auth so existing users keep working.
          if (sbErr.message === "Invalid login credentials") {
            const { data } = await authService.login({ email, password });
            setAuth(data.user, data.accessToken, data.refreshToken);
          } else if (/not confirmed|confirm your email/i.test(sbErr.message)) {
            throw new Error(
              "Your email isn't confirmed yet — click the confirmation link from your inbox to activate your account. Didn't get it? Register again to resend."
            );
          } else {
            throw new Error(sbErr.message);
          }
        } else {
          const accessToken = sb.session?.access_token;
          if (!accessToken) throw new Error("No session returned");
          const { data } = await authService.supabaseSession(accessToken);
          setAuth(data.user, data.accessToken, data.refreshToken);
        }
      } else {
        const { data } = await authService.login({ email, password });
        setAuth(data.user, data.accessToken, data.refreshToken);
      }
      navigate("/chat");
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Login failed";
      if (err.response?.status === 503) {
        setError("Supabase is set in the app but not on the server — paste SUPABASE_SERVICE_ROLE_KEY into backend/.env");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider: "google" | "github") => {
    if (supabaseConfigured && supabase) {
      supabase.auth
        .signInWithOAuth({
          provider,
          options: { redirectTo: SUPABASE_REDIRECT_URL },
        })
        .catch((err) => setError(err.message || "OAuth sign-in failed"));
    } else {
      window.location.href = `${import.meta.env.VITE_API_URL}/api/auth/${provider}`;
    }
  };

  const inputCls = "pl-10";

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your NexusAI account"
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">Sign up</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</div>
        )}
        {searchParams.get("reset") === "success" && (
          <div className="rounded-lg border border-success/30 bg-success/8 px-4 py-3 text-sm text-success">Password updated — sign in with your new password.</div>
        )}

        <div className="space-y-2">
          <label htmlFor="login-email" className="text-sm font-medium">Email</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" required autoComplete="email" />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="login-password" className="text-sm font-medium">Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="login-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" required autoComplete="current-password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary">Forgot password?</Link>
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </Button>

        {(supabaseConfigured || import.meta.env.VITE_ENABLE_OAUTH === "true") && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase tracking-wide">
                <span className="bg-card px-2.5 text-muted-foreground">Or continue with</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => handleOAuth("google")} className="flex items-center justify-center gap-2 rounded-lg border border-input bg-card py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-accent active:scale-[0.98]">
                <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                Google
              </button>
              <button type="button" onClick={() => handleOAuth("github")} className="flex items-center justify-center gap-2 rounded-lg border border-input bg-card py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-accent active:scale-[0.98]">
                <Github className="h-4 w-4" /> GitHub
              </button>
            </div>
          </>
        )}
      </form>
    </AuthShell>
  );
}
