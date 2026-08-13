import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { getTicker } from "../controllers/market.controller";

const router = Router();

router.get("/:ticker", authMiddleware, getTicker);

export default router;
