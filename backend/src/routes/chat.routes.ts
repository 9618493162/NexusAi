import { Router } from "express";
import * as chatController from "../controllers/chat.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { chatRateLimit } from "../middleware/rate-limit.middleware";

const router = Router();

router.post("/stream", authMiddleware, chatRateLimit, chatController.chatValidators, chatController.streamChat);
router.get("/models", authMiddleware, chatController.getModels);
router.get("/conversations", authMiddleware, chatController.getConversations);
router.get("/conversations/:id/messages", authMiddleware, chatController.getMessages);
router.patch("/conversations/:id", authMiddleware, chatController.updateConversation);
router.delete("/conversations/:id", authMiddleware, chatController.deleteConversation);

export default router;
