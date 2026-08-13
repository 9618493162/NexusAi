import { Request, Response, NextFunction, Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { verifyAccessToken, isJwtError } from "../utils/jwt";
import * as documentController from "../controllers/document.controller";

/**
 * Auth for export downloads. `<a download>` links can't send an Authorization
 * header, so this accepts the JWT from the header OR a `?token=` query param.
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

const router = Router();

// Document & Presentation Studio — AI-generated documents stored as markdown,
// exported server-side as real .md / .html / .pptx files. Ownership-scoped.
router.get("/", authMiddleware, documentController.list);
router.post("/", authMiddleware, documentController.create);
router.get("/sources", authMiddleware, documentController.sources);
router.get("/:id", authMiddleware, documentController.get);
router.get("/:id/revisions", authMiddleware, documentController.revisions);
router.patch("/:id", authMiddleware, documentController.update);
router.post("/:id/outline", authMiddleware, documentController.outline);
router.post("/:id/generate", authMiddleware, documentController.generate);
router.post("/:id/magicslides", authMiddleware, documentController.magicSlides);
router.get("/:id/export/:format", streamAuth, documentController.exportDoc);
router.delete("/:id", authMiddleware, documentController.remove);

export default router;
