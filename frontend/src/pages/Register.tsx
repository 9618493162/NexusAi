import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/auth.service";
import { supabase, supabaseConfigured, SUPABASE_REDIRECT_URL } from "@/services/supabase.client";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/utils/cn";

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

  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const strength = getPasswordStrength(password);
  const strengthLabels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];
  const strengthColor = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-green-500"][strength - 1] || "bg-gray-600";
  const strengthTextColor = ["text-red-400", "text-orange-400", "text-yellow-400", "text-blue-400", "text-green-400"][strength - 1] || "text-gray-500";

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Create account</h1>
          <p className="text-muted-foreground mt-2">Get started with NexusAI</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-500 text-sm">{error}</div>}
          {success && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/50 text-green-500 text-sm space-y-2">
              <div>{success}</div>
              {supabaseConfigured && supabase && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="text-xs underline underline-offset-2 hover:text-green-400 disabled:opacity-60 transition-colors"
                >
                  {resending ? "Resending…" : "Resend confirmation email"}
                </button>
              )}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-muted text-foreground caret-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="John Doe" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-muted text-foreground caret-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="you@example.com" required />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-10 py-2 rounded-lg border border-input bg-muted text-foreground caret-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="••••••••" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password && (
              <div className="space-y-2 mt-2 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex gap-1 h-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className={cn("flex-1 rounded-full transition-all duration-300", i <= strength ? strengthColor : "bg-gray-700")} />
                    ))}
                  </div>
                  <span className={cn("text-xs font-medium min-w-[60px] text-right", strengthTextColor)}>
                    {strength > 0 ? strengthLabels[strength - 1] : "Too short"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {[
                    { label: "8+ characters", met: password.length >= 8 },
                    { label: "Uppercase (A-Z)", met: /[A-Z]/.test(password) },
                    { label: "Lowercase (a-z)", met: /[a-z]/.test(password) },
                    { label: "Number (0-9)", met: /[0-9]/.test(password) },
                    { label: "Special character", met: /[A-Za-z0-9]/.test(password) },
                  ].map((req) => (
                    <div key={req.label} className={cn("flex items-center gap-1.5 text-xs transition-colors", req.met ? "text-green-400" : "text-muted-foreground")}>
                      <div className={cn("w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold", req.met ? "bg-green-500 text-white" : "bg-gray-700 text-gray-500")}>
                        {req.met ? "✓" : ""}
                      </div>
                      {req.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={loading || strength < 3}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
