import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import passport from "passport";
import * as authController from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { avatarUpload } from "../middleware/upload.middleware";

// Wrap multer so avatar-specific size/type errors surface as clean 400s.
function avatarUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  avatarUpload.single("avatar")(req, res, (err?: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "Avatar image too large — max 5MB." });
        return;
      }
      res.status(400).json({ error: err.message || "Could not upload avatar." });
      return;
    }
    next();
  });
}

const router = Router();

router.post("/register", authRateLimit, authController.registerValidators, authController.register);
router.post("/login", authRateLimit, authController.loginValidators, authController.login);
router.post("/supabase/session", authRateLimit, authController.supabaseSession);
router.get("/me", authMiddleware, authController.me);
router.patch("/me", authMiddleware, authController.updateMe);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post("/logout-all", authMiddleware, authController.logoutAllDevices);
router.get("/sessions", authMiddleware, authController.getSessions);
router.delete("/sessions/:id", authMiddleware, authController.revokeSession);
router.post("/avatar", authMiddleware, avatarUploadMiddleware, authController.uploadAvatar);
router.get("/avatar/:filename", authMiddleware, authController.getAvatar);
router.delete("/avatar", authMiddleware, authController.removeAvatar);
router.post("/change-password", authMiddleware, authRateLimit, authController.changePasswordValidators, authController.changePassword);
router.post("/request-password-reset", authRateLimit, authController.requestPasswordReset);
router.post("/reset-password", authController.resetPassword);
router.get("/verify-email", authController.verifyEmail);

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/google/callback", passport.authenticate("google", { session: false, failureRedirect: "/login" }), authController.oauthCallback);

router.get("/github", passport.authenticate("github", { scope: ["user:email"] }));
router.get("/github/callback", passport.authenticate("github", { session: false, failureRedirect: "/login" }), authController.oauthCallback);

export default router;
