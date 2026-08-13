import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, KeyRound, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/AuthShell";
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
    <AuthShell
      title={sent ? "Check your inbox" : "Reset password"}
      subtitle={sent ? undefined : "Enter your email and we'll send you a reset link"}
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-primary transition-colors hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center py-4 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success ring-1 ring-success/25">
            <CheckCircle2 className="h-7 w-7" strokeWidth={1.7} />
          </div>
          <p className="text-sm text-muted-foreground text-balance">
            If an account exists for <strong className="text-foreground">{email}</strong>, a password reset link is on its way.
            Check your inbox (and spam folder).
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <label htmlFor="fp-email" className="text-sm font-medium">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" placeholder="you@example.com" required autoComplete="email" />
            </div>
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading || !email}>
            {loading ? "Sending…" : <><KeyRound className="h-4 w-4 mr-2" /> Send reset link</>}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
