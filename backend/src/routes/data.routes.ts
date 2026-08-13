import { Request, Response, NextFunction, Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { verifyAccessToken, isJwtError } from "../utils/jwt";
import {
  listFiles,
  analyze,
  ask,
  downloadCsv,
  analyzeMarket,
  askMarket,
  downloadMarketCsv,
} from "../controllers/data-analysis.controller";

const router = Router();

/**
 * Auth for the CSV download routes. `<a download>` links can't send an
 * Authorization header, so this accepts the JWT from the header OR a
 * `?token=` query param — same pattern as the file/workflow stream routes.
 */
async function streamAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    let token: string | undefined;
    if (header && header.startsWith("Bearer ")) {
      token = header.substring(7);
    } else if (typeof req.query.token === "string" && req.query.token) {
      token = req.query.token;
    }
    if (!token) {
      res.status(401).json({ error: "No token provided" });
      return;
    }
    const decoded = verifyAccessToken(token);
    (req as any).user = decoded;
    next();
  } catch (error) {
    if (isJwtError(error)) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    next(error);
  }
}

// The Data Lab works on the user's existing files — no second upload system.
router.get("/files", authMiddleware, listFiles);
router.get("/:id", authMiddleware, analyze);
router.get("/:id/ask", authMiddleware, ask);
router.get("/:id/export.csv", streamAuth, downloadCsv);

// Real Massive.com market datasets (dividend history + news sentiment) —
// analyzed exactly like uploaded files, no storage or database involved.
router.get("/market/:ticker", authMiddleware, analyzeMarket);
router.get("/market/:ticker/ask", authMiddleware, askMarket);
router.get("/market/:ticker/export.csv", streamAuth, downloadMarketCsv);

export default router;
