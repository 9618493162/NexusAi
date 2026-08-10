import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
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

export async function register(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return;
  }

  try {
    const { email, password, name } = req.body;
    const result = await authService.register(email, password, name);
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
    const result = await authService.login(email, password);
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
    const result = await exchangeSupabaseSession(accessToken);
    res.json(result);
  } catch (error: any) {
    logger.error("Supabase session exchange error:", error);
    const status = error.message?.includes("not configured") ? 503 : 401;
    res.status(status).json({ error: error.message || "Supabase authentication failed" });
  }
}

export async function me(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    res.json({
      id: req.user?.userId,
      email: req.user?.email,
      name: req.user?.name,
      avatar: req.user?.avatar,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      res.status(400).json({ error: "Refresh token required" });
      return;
    }

    const result = await authService.refreshToken(token);
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
