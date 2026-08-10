import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/auth.service";
import { supabase, supabaseConfigured } from "@/services/supabase.client";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (supabaseConfigured && supabase) {
        // Supabase sends the recovery email (no app SMTP keys needed).
        const { error: sbErr } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (sbErr) throw new Error(sbErr.message);
      } else {
        await authService.requestPasswordReset(email);
      }
      setSent(true);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Could not send reset email";
      if (/rate.?limit/i.test(msg)) {
        setError("Too many reset emails — please wait a few minutes and try again. If the first email hasn't arrived, check your spam folder.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Reset password</h1>
          <p className="text-muted-foreground mt-2">Enter your email and we'll send you a reset link</p>
        </div>
        {sent ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/50 text-green-500 text-sm">
              If an account exists for <strong>{email}</strong>, a password reset link is on its way. Check your inbox (and spam folder).
            </div>
            <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-primary hover:underline">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-500 text-sm">{error}</div>}
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-muted text-foreground caret-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !email}>
              {loading ? "Sending..." : "Send reset link"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="text-primary hover:underline">Back to sign in</Link>
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
