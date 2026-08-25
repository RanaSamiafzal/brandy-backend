import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authValidation } from "./auth.validation.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";
import passport from "../../config/passport.js";
import { oauthController } from "../oauth/oauth.controller.js";

const router = Router();

router.post(
    "/register",
    upload.fields([
        { name: "profilePic", maxCount: 1 },
        { name: "coverPic", maxCount: 1 }
    ]),
    validate(authValidation.registerSchema),
    authController.register
);

router.post("/login", validate(authValidation.loginSchema), authController.login);

router.post("/logout", verifyJwt, authController.logout);

router.post("/refresh-token", validate(authValidation.refreshSchema), authController.refresh);

router.post("/forgot-password", validate(authValidation.forgotPasswordSchema), authController.forgotPassword);

router.post("/verify-reset-otp", validate(authValidation.verifyResetOtpSchema), authController.verifyResetOtp);

router.post("/reset-password", validate(authValidation.resetPasswordSchema), authController.resetPassword);

router.post("/change-password", verifyJwt, validate(authValidation.changePasswordSchema), authController.changePassword);
router.post("/send-otp", verifyJwt, authController.sendOTP);
router.post("/verify-otp", verifyJwt, authController.verifyOTP);

/**
 * YouTube callback path registered in Google Console.
 * Maps to the specialized oauth module handler.
 */
router.get("/youtube/callback", (req, res, next) => {
    req.params.platform = 'youtube';
    oauthController.callback(req, res, next);
});

router.get("/facebook", authController.facebookConnect);
router.get("/facebook/callback", authController.facebookCallback);

// API Key Management Routes
router.post("/api-keys", verifyJwt, authController.createApiKey);
router.get("/api-keys", verifyJwt, authController.listApiKeys);
router.delete("/api-keys/:keyId", verifyJwt, authController.revokeApiKey);

export default router;

