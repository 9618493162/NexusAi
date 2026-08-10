import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import { sendVerificationEmail, sendPasswordResetEmail } from "../utils/email";
import { sendRecoveryEmail, registerWithSupabase, deleteSupabaseUser } from "./supabase-auth.service";
import { logger } from "../config/logger";

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
  name?: string
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
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken, user };
}

export async function login(email: string, password: string): Promise<AuthResult> {
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
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken, user: userWithoutPassword };
}

export async function refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
  const { verifyRefreshToken } = await import("../utils/jwt");
  const decoded = verifyRefreshToken(token);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!storedToken || storedToken.expiresAt < new Date()) {
    throw new Error("Invalid or expired refresh token");
  }

  await prisma.refreshToken.delete({ where: { id: storedToken.id } });

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

  await prisma.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: storedToken.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
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
