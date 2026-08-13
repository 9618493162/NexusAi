import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { logger } from "../config/logger";
import { sendTestEmail } from "../utils/email";

// The same palette the frontend offers — only these values are stored so the
// badge styles stay valid.
const ALLOWED_COLORS = new Set([
  "#f97316",
  "#10b981",
  "#8b5cf6",
  "#0ea5e9",
  "#ef4444",
  "#eab308",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
  "#84cc16",
  "#f43f5e",
  "#06b6d4",
]);

export async function testEmail(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Fresh email from the DB (never trust the JWT claim alone).
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { email: true },
    });
    if (!user?.email) {
      res.status(400).json({ error: "Your account has no email address to send to." });
      return;
    }
    const { provider, from, fellBackFromDomain } = await sendTestEmail(user.email);
    if (provider === "none") {
      res.status(503).json({ error: "No email provider is configured. Add RESEND_API_KEY or SMTP_HOST to backend/.env." });
      return;
    }
    res.json({ ok: true, to: user.email, provider, from, fellBackFromDomain });
  } catch (error: any) {
    logger.error("Test email error:", error);
    res.status(500).json({ error: error.message || "Could not send test email" });
  }
}

export async function getLanguageColors(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const rows = await prisma.languageColor.findMany({ where: { userId: req.user!.userId } });
    const colors: Record<string, string> = {};
    rows.forEach((r) => { colors[r.language] = r.color; });
    res.json(colors);
  } catch (error: any) {
    logger.error("Get language colors error:", error);
    res.status(500).json({ error: error.message || "Failed to load language colors" });
  }
}

export async function putLanguageColors(req: AuthenticatedRequest, res: Response): Promise<void> {
  const colors = req.body?.colors;
  if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
    res.status(400).json({ error: "colors object is required" });
    return;
  }
  const entries = Object.entries(colors)
    .filter(
      ([language, color]) =>
        typeof language === "string" &&
        language.length >= 2 &&
        language.length <= 10 &&
        typeof color === "string" &&
        ALLOWED_COLORS.has(color)
    )
    .map(([language, color]) => ({ userId: req.user!.userId, language, color: color as string }));

  try {
    await prisma.$transaction([
      prisma.languageColor.deleteMany({ where: { userId: req.user!.userId } }),
      prisma.languageColor.createMany({ data: entries }),
    ]);
    res.json({ ok: true, count: entries.length });
  } catch (error: any) {
    logger.error("Put language colors error:", error);
    res.status(500).json({ error: error.message || "Failed to save language colors" });
  }
}
