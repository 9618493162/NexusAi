import { Request, Response, NextFunction, Router } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.middleware";
import { verifyAccessToken, isJwtError } from "../utils/jwt";
import {
  list,
  create,
  get,
  update,
  remove,
  listRuns,
  run,
  streamRunAudio,
  createValidators,
  updateValidators,
} from "../controllers/workflow.controller";

const router = Router();

/**
 * Auth for the audio stream endpoint. `<audio>` tags can't send an
 * Authorization header, so this accepts the JWT from the header OR a
 * `?token=` query param (only this media route — the global authMiddleware
 * is untouched). Ownership is still enforced per-run in the controller.
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
    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch (error) {
    if (isJwtError(error)) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    next(error);
  }
}

router.get("/", authMiddleware, list);
router.post("/", authMiddleware, createValidators, create);
router.get("/:id", authMiddleware, get);
router.patch("/:id", authMiddleware, updateValidators, update);
router.delete("/:id", authMiddleware, remove);
router.get("/:id/runs", authMiddleware, listRuns);
router.post("/:id/run", authMiddleware, run);
router.get("/runs/:runId/audio/:nodeId", streamAuth, streamRunAudio);

export default router;
