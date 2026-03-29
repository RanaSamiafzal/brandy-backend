import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authValidation } from "./auth.validation.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";

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

router.post("/reset-password", validate(authValidation.resetPasswordSchema), authController.resetPassword);

export default router;
