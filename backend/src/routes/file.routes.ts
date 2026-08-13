import { Request, Response, NextFunction, Router } from "express";
import * as fileController from "../controllers/file.controller";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.middleware";
import { upload } from "../middleware/upload.middleware";
import { verifyAccessToken, isJwtError } from "../utils/jwt";
import { prisma } from "../config/database";
import { logger } from "../config/logger";

const router = Router();

/**
 * Auth for the stream endpoint. `<img>/<audio>/<video>` tags can't send an
 * Authorization header, so this accepts the JWT from the header OR a
 * `?token=` query param (used only by this media route — the global
 * authMiddleware is untouched). Ownership is still enforced per-file in the
 * controller.
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
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    (req as AuthenticatedRequest).user = {
      userId: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    };
    next();
  } catch (error) {
    if (isJwtError(error)) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    logger.error("Stream auth error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

router.post("/upload", authMiddleware, upload.single("file"), fileController.uploadFile);
router.get("/supported-types", authMiddleware, fileController.getSupportedTypes);
router.get("/", authMiddleware, fileController.getFiles);
// Ownership-checked file streaming: real previews (image/audio/video) and
// download (?download=1) of the stored file.
router.get("/:id/stream", streamAuth, fileController.streamFile);
router.delete("/:id", authMiddleware, fileController.deleteFile);

export default router;
