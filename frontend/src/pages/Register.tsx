import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/AuthShell";
import { authService } from "@/services/auth.service";
import { supabase, supabaseConfigured, SUPABASE_REDIRECT_URL } from "@/services/supabase.client";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/utils/cn";

const STRENGTH_REQS = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase (A-Z)", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase (a-z)", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number (0-9)", test: (p: string) => /[0-9]/.test(p) },
  { label: "Special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function Register() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const metCount = STRENGTH_REQS.filter((r) => r.test(password)).length;
  const strength = Math.min(metCount, 4);
  const strengthLabels = ["Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["bg-destructive", "bg-warning", "bg-info", "bg-success"];
  const strengthText = ["text-destructive", "text-warning", "text-info", "text-success"];

  const handleResend = async () => {
    if (!supabase || !email) return;
    setResending(true);
    setError("");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: SUPABASE_REDIRECT_URL },
      });
      if (error) throw new Error(error.message);
      setSuccess("Confirmation email resent — check your inbox (and spam folder).");
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Could not resend the email");
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      if (supabaseConfigured && supabase) {
        // Supabase handles signup (including email confirmation & password hashing).
        const { data: sb, error: sbErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name },
            emailRedirectTo: SUPABASE_REDIRECT_URL,
          },
        });
        if (sbErr) throw new Error(sbErr.message);
        if (sb.session?.access_token) {
          const { data } = await authService.supabaseSession(sb.session.access_token);
          setAuth(data.user, data.accessToken, data.refreshToken);
          navigate("/chat");
        } else {
          // Supabase is configured with email confirmation enabled.
          setSuccess("Account created! Check your inbox to confirm your email, then sign in.");
        }
      } else {
        const { data } = await authService.register({ email, password, name });
        if (data.requiresEmailConfirmation) {
          // Supabase registration with confirmation enabled — no session yet.
          setSuccess("Account created! Check your inbox to confirm your email, then sign in.");
        } else {
          setAuth(data.user, data.accessToken, data.refreshToken);
          navigate("/chat");
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "pl-10";

  return (
    <AuthShell
      title="Create account"
      subtitle="Get started with NexusAI — free"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</div>
        )}
        {success && (
          <div className="space-y-2 rounded-lg border border-success/30 bg-success/8 px-4 py-3 text-sm text-success">
            <div>{success}</div>
            {supabaseConfigured && supabase && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-xs font-medium underline underline-offset-2 transition-colors hover:text-success disabled:opacity-60"
              >
                {resending ? "Resending…" : "Resend confirmation email"}
              </button>
            )}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="reg-name" className="text-sm font-medium">Name</label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="reg-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="John Doe" autoComplete="name" />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="reg-email" className="text-sm font-medium">Email</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" required autoComplete="email" />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="reg-password" className="text-sm font-medium">Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="reg-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" required autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password && (
            <div className="space-y-2.5 rounded-xl border border-border bg-muted/40 p-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-1.5 flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={cn("flex-1 rounded-full transition-all duration-300", i < strength ? strengthColors[strength - 1] : "bg-border")} />
                  ))}
                </div>
                <span className={cn("min-w-[52px] text-right text-xs font-medium", strength > 0 ? strengthText[strength - 1] : "text-muted-foreground")}>
                  {strength > 0 ? strengthLabels[strength - 1] : "Too short"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {STRENGTH_REQS.map((req) => {
                  const met = req.test(password);
                  return (
                    <div key={req.label} className={cn("flex items-center gap-1.5 text-xs transition-colors", met ? "text-success" : "text-muted-foreground")}>
                      {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-50" />}
                      {req.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={loading || strength < 3}>
          {loading ? "Creating account…" : "Create Account"}
        </Button>
      </form>
    </AuthShell>
  );
}
