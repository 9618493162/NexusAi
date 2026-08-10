import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/database";
import { processFile } from "../services/file-processor.service";
import { logger } from "../config/logger";
import fs from "fs";
import path from "path";

export async function uploadFile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const userId = req.user!.userId;
    const { conversationId } = req.body;

    // Process file for text extraction
    const processed = await processFile(req.file.path);

    const file = await prisma.file.create({
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        extractedText: processed.text,
        userId,
        conversationId: conversationId || null,
      },
    });

    res.status(201).json({
      id: file.id,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      extractedText: processed.text?.slice(0, 20000),
    });
  } catch (error: any) {
    logger.error("File upload error:", error);
    res.status(500).json({ error: error.message || "Upload failed" });
  }
}

export async function getFiles(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const files = await prisma.file.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    res.json(files);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function deleteFile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const userId = req.user!.userId;

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Delete physical file
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    await prisma.file.delete({ where: { id } });
    res.json({ message: "File deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
