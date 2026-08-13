import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import { sendVerificationEmail, sendPasswordResetEmail } from "../utils/email";
import { sendRecoveryEmail, registerWithSupabase, deleteSupabaseUser } from "./supabase-auth.service";
import { logger } from "../config/logger";
import { parseUserAgent } from "../utils/device";

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatar: string | null;
  };
}

export async function register(
  email: string,
  password: string,
  name?: string,
  userAgent?: string
): Promise<AuthResult | { user: AuthResult["user"]; requiresEmailConfirmation: true }> {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error("Email already registered");
  }

  // Prefer Supabase Auth: it creates the account AND sends the real
  // confirmation email (no SMTP/Resend keys needed), so new registrations get
  // a working verification link. The user signs in after confirming.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const reg = await registerWithSupabase(
      email,
      password,
      name,
      `${env.FRONTEND_URL}/supabase/callback`
    );
    try {
      const user = await prisma.user.create({
        data: {
          email,
          name: reg.name,
          provider: "supabase",
          isVerified: false,
        },
        select: { id: true, email: true, name: true, avatar: true },
      });
      return { user, requiresEmailConfirmation: true };
    } catch (error) {
      // Roll back the Supabase account so no orphaned unconfirmed user lingers.
      await deleteSupabaseUser(reg.supabaseId).catch(() => {});
      throw error;
    }
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString("hex");

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: name || email.split("@")[0],
      provider: "local",
    },
    select: { id: true, email: true, name: true, avatar: true },
  });

  try {
    await sendVerificationEmail(email, verificationToken);
  } catch (error) {
    logger.error("Failed to send verification email during registration:", error);
  }

  const accessToken = generateAccessToken({
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
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken, user };
}

export async function login(email: string, password: string, userAgent?: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, avatar: true, password: true },
  });

  if (!user || !user.password) {
    throw new Error("Invalid email or password");
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new Error("Invalid email or password");
  }

  const { password: _, ...userWithoutPassword } = user;

  const accessToken = generateAccessToken({
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
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken, user: userWithoutPassword };
}

export async function refreshToken(
  token: string,
  userAgent?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const { verifyRefreshToken } = await import("../utils/jwt");
  const decoded = verifyRefreshToken(token);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!storedToken || storedToken.expiresAt < new Date()) {
    throw new Error("Invalid or expired refresh token");
  }

  // Rotate in place (rather than delete+create) so the session keeps a stable
  // id across refreshes — the sessions list can show one entry with a real
  // "last active" time instead of a new row every 15 minutes.
  const accessToken = generateAccessToken({
    userId: storedToken.user.id,
    email: storedToken.user.email,
    name: storedToken.user.name,
    avatar: storedToken.user.avatar,
  });

  const newRefreshToken = generateRefreshToken({
    userId: storedToken.user.id,
    email: storedToken.user.email,
    name: storedToken.user.name,
    avatar: storedToken.user.avatar,
  });

  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: {
      token: newRefreshToken,
      userAgent: userAgent ?? storedToken.userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastUsedAt: new Date(),
    },
  });

  return { accessToken, refreshToken: newRefreshToken };
}

// ---------------------------------------------------------------------------
// Session management (the Security → Active sessions list)
// ---------------------------------------------------------------------------

export interface SessionInfo {
  id: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  browser: string;
  os: string;
  device: string;
  isCurrent: boolean;
}

/**
 * List the user's active (non-expired) sessions, newest activity first.
 * `currentToken` (the client's refresh token) marks the row that belongs to
 * the device making the request.
 */
export async function listSessions(userId: string, currentToken?: string): Promise<SessionInfo[]> {
  const sessions = await prisma.refreshToken.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    take: 50,
    select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true, userAgent: true, token: true },
  });
  return sessions.map(({ token, userAgent, ...session }) => {
    const device = parseUserAgent(userAgent);
    return {
      ...session,
      userAgent,
      browser: device.browser,
      os: device.os,
      device: device.device,
      isCurrent: !!currentToken && token === currentToken,
    };
  });
}

/**
 * Revoke one session. The session currently in use cannot be revoked here —
 * the client signs out instead.
 */
export async function revokeSession(
  userId: string,
  sessionId: string,
  currentToken?: string
): Promise<void> {
  const session = await prisma.refreshToken.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, token: true },
  });
  if (!session) throw new Error("Session not found");
  if (currentToken && session.token === currentToken) {
    throw new Error("You can't revoke the session you're currently using — sign out instead");
  }
  await prisma.refreshToken.delete({ where: { id: session.id } });
}

export async function logout(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

// Profile reading/editing for the Account & Settings Center. The users table is
// the source of truth for name/avatar; every client already receives the same
// { id, email, name, avatar } shape plus account metadata (additive).
export interface ProfileInfo {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  provider: string | null;
  isVerified: boolean;
  /** light | dark | system — synced across devices via the profile API. */
  theme: string;
  /** Speech-recognition language for live dictation — synced across devices. */
  dictateLang: string | null;
  /** Translation target for dictated speech — synced across devices. */
  dictateTo: string | null;
  /** Whether the account has a local password hash (can change it in-app). */
  hasPassword: boolean;
  createdAt: Date;
}

// password is selected only to compute hasPassword — the hash itself is never
// exposed to clients.
const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  avatar: true,
  provider: true,
  isVerified: true,
  theme: true,
  dictateLang: true,
  dictateTo: true,
  password: true,
  createdAt: true,
} as const;

type ProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  provider: string | null;
  isVerified: boolean;
  theme: string;
  dictateLang: string | null;
  dictateTo: string | null;
  password: string | null;
  createdAt: Date;
};

function toProfileInfo(user: ProfileRow): ProfileInfo {
  const { password, ...rest } = user;
  return { ...rest, hasPassword: !!password };
}

export async function getUserById(userId: string): Promise<ProfileInfo | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  return user ? toProfileInfo(user) : null;
}

export async function updateProfile(
  userId: string,
  data: { name?: string; avatar?: string | null; theme?: string; dictateLang?: string | null; dictateTo?: string | null }
): Promise<ProfileInfo> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
      ...(data.theme !== undefined ? { theme: data.theme } : {}),
      ...(data.dictateLang !== undefined ? { dictateLang: data.dictateLang } : {}),
      ...(data.dictateTo !== undefined ? { dictateTo: data.dictateTo } : {}),
    },
    select: PROFILE_SELECT,
  });
  return toProfileInfo(user);
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

/**
 * Change the password for a LOCAL account (one with a stored bcrypt hash).
 * Accounts that sign in through Supabase/OAuth have no local password, so
 * they must use the reset-link flow instead.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true, provider: true },
  });
  if (!user) throw new Error("Account not found");
  if (!user.password) {
    const provider = user.provider || "external";
    throw new Error(
      `This account signs in through ${provider} and has no local password. Use the reset link instead.`
    );
  }
  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) throw new Error("Current password is incorrect");

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  // Prefer Supabase Auth: it sends the recovery email itself (no SMTP/Resend
  // key needed) and the reset link completes on the /reset-password page.
  const sentBySupabase = await sendRecoveryEmail(email, `${env.FRONTEND_URL}/reset-password`);
  if (sentBySupabase) return;

  const user = await prisma.user.findUnique({ where: { email } });

  // Timing attack protection: always wait similar time
  if (!user) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");

  try {
    await sendPasswordResetEmail(email, resetToken);
  } catch (error) {
    logger.error("Failed to send password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  // In production, verify token against stored reset tokens
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  // Update user password logic here
}

export async function verifyEmail(token: string): Promise<void> {
  // In production, verify token and mark email as verified
  // This is a simplified version
}

// OAuth functions
export async function findOrCreateOAuthUser(
  profile: {
    id: string;
    email?: string;
    name?: string;
    avatar?: string;
    provider: "google" | "github";
  }
): Promise<AuthResult> {
  const where = profile.provider === "google"
    ? { googleId: profile.id }
    : { githubId: profile.id };

  let user = await prisma.user.findFirst({
    where,
    select: { id: true, email: true, name: true, avatar: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: profile.email || null,
        name: profile.name || `${profile.provider} user`,
        avatar: profile.avatar || null,
        provider: profile.provider,
        ...(profile.provider === "google" ? { googleId: profile.id } : { githubId: profile.id }),
        isVerified: true,
      },
      select: { id: true, email: true, name: true, avatar: true },
    });
  }

  const accessToken = generateAccessToken({
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

  return { accessToken, refreshToken, user };
}
