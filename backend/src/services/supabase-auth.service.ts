import { createClient } from "@supabase/supabase-js";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import { logger } from "../config/logger";

export interface SupabaseAuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatar: string | null;
  };
}

let adminClient: ReturnType<typeof createClient> | null = null;

function getAdminClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}

/**
 * Exchange a Supabase Auth access token for a NexusAI session.
 * Supabase verifies who the user is; we find-or-create the matching local
 * user (by email) and issue the app's own JWT pair, so every existing
 * feature (middleware, chat, files, media) keeps working unchanged.
 */
export interface SupabaseRegistrationResult {
  supabaseId: string;
  email: string;
  name: string;
}

/**
 * Register a new user through Supabase Auth.
 *
 * `admin.generateLink({ type: "signup", ... })` creates the Auth user
 * (unconfirmed) AND triggers the real confirmation email through Supabase, so
 * new registrations get a working confirmation link without needing app-level
 * SMTP/Resend keys.
 */
export async function registerWithSupabase(
  email: string,
  password: string,
  name: string | undefined,
  redirectTo: string
): Promise<SupabaseRegistrationResult> {
  const client = getAdminClient();
  if (!client) {
    throw new Error("Supabase Auth is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");
  }

  const { data, error } = await client.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      redirectTo,
      data: name ? { name } : undefined,
    },
  });

  if (error) {
    // Map GoTrue's duplicate-signup error to the same message the legacy path uses.
    const message = /already registered|already been registered/i.test(error.message)
      ? "Email already registered"
      : error.message;
    throw new Error(message);
  }

  return { supabaseId: data.user.id, email, name: name || email.split("@")[0] };
}

/**
 * Remove a Supabase Auth user (used to roll back a registration when creating
 * the matching local row fails).
 */
export async function deleteSupabaseUser(userId: string): Promise<void> {
  const client = getAdminClient();
  if (!client) return;
  await client.auth.admin.deleteUser(userId);
}

/**
 * Send a password-recovery email through Supabase Auth.
 * Returns false only when Supabase isn't configured (caller falls back to the
 * legacy path). If Supabase IS configured but the send fails, it throws so the
 * real reason surfaces instead of silently dropping into the legacy SMTP stub.
 */
export async function sendRecoveryEmail(email: string, redirectTo: string): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    logger.error("Supabase recovery email failed:", error.message);
    throw new Error(`Password reset email failed (${error.message}). Make sure ${redirectTo} is in Supabase Auth redirect URLs.`);
  }
  return true;
}

export async function exchangeSupabaseSession(accessToken: string): Promise<SupabaseAuthResult> {
  const client = getAdminClient();
  if (!client) {
    throw new Error("Supabase Auth is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");
  }

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    logger.warn("Supabase token verification failed:", error?.message ?? "no user");
    throw new Error("Invalid or expired Supabase session");
  }

  const sbUser = data.user;
  const email = sbUser.email?.toLowerCase() || null;
  const metadata = sbUser.user_metadata ?? {};
  const name =
    metadata.name || metadata.full_name || metadata.user_name || email?.split("@")[0] || "Supabase user";

  type LocalUser = { id: string; email: string | null; name: string | null; avatar: string | null };

  const found = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, avatar: true },
      })
    : null;

  let user: LocalUser | null = found;

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        avatar: metadata.avatar_url || metadata.picture || null,
        provider: "supabase",
        isVerified: !!sbUser.email_confirmed_at,
      },
      select: { id: true, email: true, name: true, avatar: true },
    });
  }
  // Existing account (created via legacy local auth or another provider): keep
  // its data, but sync the verification flag from Supabase's email confirmation
  // state so a user who confirms their email becomes verified here too.
  await prisma.user.update({
    where: { id: user.id },
    data: { isVerified: !!sbUser.email_confirmed_at },
  });

  const accessTokenApp = generateAccessToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
  });

  const refreshToken = generateRefreshToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
  });

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken: accessTokenApp, refreshToken, user };
}
