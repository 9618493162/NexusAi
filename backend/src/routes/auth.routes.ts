import { Router } from "express";
import passport from "passport";
import * as authController from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";

const router = Router();

router.post("/register", authRateLimit, authController.registerValidators, authController.register);
router.post("/login", authRateLimit, authController.loginValidators, authController.login);
router.post("/supabase/session", authRateLimit, authController.supabaseSession);
router.get("/me", authMiddleware, authController.me);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post("/request-password-reset", authRateLimit, authController.requestPasswordReset);
router.post("/reset-password", authController.resetPassword);
router.get("/verify-email", authController.verifyEmail);

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/google/callback", passport.authenticate("google", { session: false, failureRedirect: "/login" }), authController.oauthCallback);

router.get("/github", passport.authenticate("github", { scope: ["user:email"] }));
router.get("/github/callback", passport.authenticate("github", { session: false, failureRedirect: "/login" }), authController.oauthCallback);

export default router;
