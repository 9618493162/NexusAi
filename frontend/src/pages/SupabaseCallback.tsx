import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/auth.store";
import { authService } from "@/services/auth.service";
import { supabase, createRecoveryClient, SupabaseClient } from "@/services/supabase.client";
import { PageLoader } from "@/components/PageLoader";

// React StrictMode double-fires effects in dev; the exchange must run exactly once.
let exchangeStarted = false;

export function SupabaseCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      navigate("/login?error=supabase_failed", { replace: true });
      return;
    }

    // Links arrive in one of two formats and the client flowType MUST match:
    // - implicit (tokens in the URL hash: #access_token=...) — produced by
    //   admin/backend-generated links (signup/recovery via the service role).
    // - PKCE (a one-time code in the query: ?code=...) — produced by the app's
    //   own signUp / signInWithOAuth / forgot-password flows.
    const isImplicit = window.location.hash.includes("access_token=");
    // Pick the client whose flowType matches the link format (see
    // supabase.client.ts). The shared PKCE client rejects implicit links, so an
    // implicit link must use a dedicated implicit-flow client.
    const client: SupabaseClient | null = isImplicit
      ? createRecoveryClient("implicit") ?? supabase
      : supabase;
    if (!client) {
      navigate("/login?error=supabase_failed", { replace: true });
      return;
    }

    if (exchangeStarted) return; // StrictMode re-run — already handled
    exchangeStarted = true;

    (async () => {
      try {
        // getUser() awaits client initialization (which recovers the session
        // from the URL — PKCE code or implicit tokens), so getSession()
        // afterwards is race-free.
        await client.auth.getUser();
        const { data } = await client.auth.getSession();
        const session = data.session;
        if (!session?.access_token) {
          throw new Error("No Supabase session");
        }
        const { data: authData } = await authService.supabaseSession(session.access_token);
        setAuth(authData.user, authData.accessToken, authData.refreshToken);
        navigate("/chat", { replace: true });
      } catch (err) {
        console.error("Supabase callback error:", err);
        exchangeStarted = false; // allow a retry (e.g. re-clicking the link)
        navigate("/login?error=supabase_failed", { replace: true });
      }
    })();
  }, [searchParams, navigate, setAuth]);

  return <PageLoader />;
}
