import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { logger } from "../config/logger";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error("Unhandled error:", err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "File too large (max 50MB)" });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }

  // Multer fileFilter rejections are plain Errors — surface the real reason (e.g. unsupported type)
  if (err.message?.startsWith("Unsupported file type")) {
    res.status(400).json({ error: err.message });
    return;
  }

  res.status(500).json({ 
    error: process.env.NODE_ENV === "production" 
      ? "Internal server error" 
      : err.message 
  });
}
