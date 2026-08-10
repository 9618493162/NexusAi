import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, isJwtError, AuthPayload } from "../utils/jwt";
import { prisma } from "../config/database";
import { logger } from "../config/logger";

// Align Express's global Request.user (declared by @types/passport as
// Express.User) with our AuthPayload so that handlers typed with
// AuthenticatedRequest can be passed directly to the Router.
declare global {
  namespace Express {
    interface User extends AuthPayload {}
  }
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, avatar: true },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    req.user = {
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
    logger.error("Auth middleware error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
