import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type { SupabaseClient };

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          flowType: "pkce", // tokens never land in the URL hash
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const supabaseConfigured = supabase !== null;

export const SUPABASE_REDIRECT_URL = `${window.location.origin}/supabase/callback`;

/**
 * Create a one-off Supabase client for the /reset-password page.
 *
 * Recovery links arrive in one of two formats and the client flow type MUST
 * match the link format or auth-js rejects it:
 * - implicit links (tokens in the URL hash: `#access_token=...`) — produced by
 *   the backend/admin recovery path, which sends no code_challenge.
 * - PKCE links (a one-time code in the query string: `?code=...`) — produced by
 *   the app's ForgotPassword flow, which stores the code verifier locally.
 * Using the shared PKCE singleton against an implicit link throws
 * `AuthPKCEGrantCodeExchangeError`, so the reset page picks the right client.
 */
export function createRecoveryClient(flowType: "implicit" | "pkce"): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      flowType,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
