import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import fs from "fs";
import path from "path";
import * as authService from "../services/auth.service";
import { exchangeSupabaseSession } from "../services/supabase-auth.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { logger } from "../config/logger";

export const registerValidators = [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  body("name").optional().trim().isLength({ min: 1 }),
];

export const loginValidators = [
  body("email").isEmail().normalizeEmail(),
  body("password").notEmpty(),
];

export const changePasswordValidators = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
];

export async function register(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return;
  }

  try {
    const { email, password, name } = req.body;
    const result = await authService.register(email, password, name, req.headers["user-agent"]);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error("Registration error:", error);
    res.status(400).json({ error: error.message || "Registration failed" });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return;
  }

  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password, req.headers["user-agent"]);
    res.json(result);
  } catch (error: any) {
    logger.error("Login error:", error);
    res.status(401).json({ error: error.message || "Invalid email or password" });
  }
}

export async function supabaseSession(req: Request, res: Response): Promise<void> {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      res.status(400).json({ error: "Supabase access token required" });
      return;
    }
    const result = await exchangeSupabaseSession(accessToken, req.headers["user-agent"]);
    res.json(result);
  } catch (error: any) {
    logger.error("Supabase session exchange error:", error);
    const status = error.message?.includes("not configured") ? 503 : 401;
    res.status(status).json({ error: error.message || "Supabase authentication failed" });
  }
}

export async function me(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Fresh profile from the database (includes account metadata). Falls back
    // to the JWT claims if the row is somehow missing.
    const user = await authService.getUserById(req.user!.userId);
    if (!user) {
      res.json({
        id: req.user?.userId,
        email: req.user?.email,
        name: req.user?.name,
        avatar: req.user?.avatar,
      });
      return;
    }
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

const THEMES = new Set(["light", "dark", "system"]);

// Language codes are short (e.g. "en", "te", "zh-CN") and come from the
// backend's own /voice/languages catalog, so a lenient shape check is enough.
const LANGUAGE_CODE_RE = /^[a-zA-Z-]{2,20}$/;

function validLanguageCode(value: unknown): value is string {
  return typeof value === "string" && LANGUAGE_CODE_RE.test(value);
}

export async function updateMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, avatar, theme, dictateLang, dictateTo } = req.body || {};
    if (name !== undefined && (typeof name !== "string" || !name.trim() || name.trim().length > 60)) {
      res.status(400).json({ error: "Name must be between 1 and 60 characters" });
      return;
    }
    if (avatar !== undefined && avatar !== null && (typeof avatar !== "string" || avatar.length > 500)) {
      res.status(400).json({ error: "Invalid avatar value" });
      return;
    }
    if (theme !== undefined && (typeof theme !== "string" || !THEMES.has(theme))) {
      res.status(400).json({ error: "Theme must be one of: light, dark, system" });
      return;
    }
    if (dictateLang !== undefined && dictateLang !== null && !validLanguageCode(dictateLang)) {
      res.status(400).json({ error: "Invalid dictate language" });
      return;
    }
    if (dictateTo !== undefined && dictateTo !== null && !validLanguageCode(dictateTo)) {
      res.status(400).json({ error: "Invalid dictate translation target" });
      return;
    }
    const user = await authService.updateProfile(req.user!.userId, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(avatar !== undefined ? { avatar: avatar || null } : {}),
      ...(theme !== undefined ? { theme } : {}),
      ...(dictateLang !== undefined ? { dictateLang: dictateLang || null } : {}),
      ...(dictateTo !== undefined ? { dictateTo: dictateTo || null } : {}),
    });
    res.json(user);
  } catch (error: any) {
    logger.error("Profile update error:", error);
    res.status(500).json({ error: error.message || "Could not update profile" });
  }
}

export async function logoutAllDevices(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await authService.logoutAll(req.user!.userId);
    res.json({ ok: true });
  } catch (error: any) {
    logger.error("Logout-all error:", error);
    res.status(500).json({ error: error.message || "Could not sign out all devices" });
  }
}

export async function getSessions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // The client sends its own refresh token so the row belonging to THIS
    // device can be marked as the current session.
    const currentToken = req.header("x-refresh-token") || undefined;
    const sessions = await authService.listSessions(req.user!.userId, currentToken);
    res.json({ sessions });
  } catch (error: any) {
    logger.error("List sessions error:", error);
    res.status(500).json({ error: error.message || "Could not list sessions" });
  }
}

export async function revokeSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentToken = req.header("x-refresh-token") || undefined;
    await authService.revokeSession(req.user!.userId, String(req.params.id || ""), currentToken);
    res.json({ ok: true });
  } catch (error: any) {
    logger.error("Revoke session error:", error);
    res.status(400).json({ error: error.message || "Could not revoke session" });
  }
}

export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return;
  }
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    res.json({ message: "Password changed successfully" });
  } catch (error: any) {
    logger.error("Change-password error:", error);
    const status = error.message?.includes("incorrect") ? 401 : 400;
    res.status(status).json({ error: error.message || "Could not change password" });
  }
}

// ---- Avatar (profile picture) ----
// Uploads reuse the same multer storage as the file pipeline (uploads/ dir);
// avatars are served back through an auth-protected endpoint so user files
// are never exposed statically.

const AVATAR_NAME_RE = /^[a-f0-9-]{36}\.(jpg|jpeg|png|gif|webp)$/i;

function avatarFileUrl(filename: string): string {
  return `/api/auth/avatar/${filename}`;
}

async function deleteAvatarFile(avatarUrl: string | null | undefined): Promise<void> {
  if (!avatarUrl || !avatarUrl.startsWith("/api/auth/avatar/")) return;
  const filename = avatarUrl.replace("/api/auth/avatar/", "");
  if (!AVATAR_NAME_RE.test(filename)) return;
  await fs.promises.unlink(path.join("uploads", filename)).catch(() => { /* best effort */ });
}

export async function uploadAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "No image uploaded" });
      return;
    }
    const current = await authService.getUserById(req.user!.userId);
    // Replace any previous uploaded avatar (the initial from OAuth stays).
    await deleteAvatarFile(current?.avatar);
    const updated = await authService.updateProfile(req.user!.userId, {
      avatar: avatarFileUrl(file.filename),
    });
    res.json(updated);
  } catch (error: any) {
    logger.error("Avatar upload error:", error);
    res.status(500).json({ error: error.message || "Could not upload avatar" });
  }
}

export async function getAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const filename = String(req.params.filename || "");
    if (!AVATAR_NAME_RE.test(filename)) {
      res.status(400).json({ error: "Invalid avatar" });
      return;
    }
    const filePath = path.join("uploads", filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Avatar not found" });
      return;
    }
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(filePath).pipe(res);
  } catch (error: any) {
    logger.error("Avatar read error:", error);
    res.status(500).json({ error: "Could not load avatar" });
  }
}

export async function removeAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const current = await authService.getUserById(req.user!.userId);
    await deleteAvatarFile(current?.avatar);
    const updated = await authService.updateProfile(req.user!.userId, { avatar: null });
    res.json(updated);
  } catch (error: any) {
    logger.error("Avatar remove error:", error);
    res.status(500).json({ error: error.message || "Could not remove avatar" });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      res.status(400).json({ error: "Refresh token required" });
      return;
    }

    const result = await authService.refreshToken(token, req.headers["user-agent"]);
    res.json(result);
  } catch (error: any) {
    logger.error("Refresh token error:", error);
    res.status(401).json({ error: error.message || "Invalid refresh token" });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken: token } = req.body;
    if (token) {
      await authService.logout(token);
    }
    res.json({ message: "Logged out successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    await authService.requestPasswordReset(email);
    res.json({ message: "If an account exists, a reset email has been sent" });
  } catch (error: any) {
    logger.error("Password reset request error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    res.json({ message: "Password reset successfully" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.query;
    await authService.verifyEmail(token as string);
    res.json({ message: "Email verified successfully" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// OAuth callback handlers
export async function oauthCallback(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user as any;
    if (!user) {
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
      return;
    }

    const { accessToken, refreshToken } = user.tokens;
    res.redirect(
      `${process.env.FRONTEND_URL}/oauth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`
    );
  } catch (error: any) {
    logger.error("OAuth callback error:", error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
}
