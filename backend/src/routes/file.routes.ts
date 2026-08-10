import { Router } from "express";
import * as fileController from "../controllers/file.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { upload } from "../middleware/upload.middleware";

const router = Router();

router.post("/upload", authMiddleware, upload.single("file"), fileController.uploadFile);
router.get("/", authMiddleware, fileController.getFiles);
router.delete("/:id", authMiddleware, fileController.deleteFile);

export default router;
