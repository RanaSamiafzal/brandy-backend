import { Router } from "express";
import { userController } from "./user.controller.js";
import { userValidation } from "./user.validation.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";

const router = Router();

router.use(verifyJwt);

// GET /users/me — merged user + role profile + completion status
router.get("/me", userController.getMe);

// GET /users/profile — only user profile (no role profile)
router.get("/profile", userController.getProfile);

// PATCH /users/update-profile — fullname, profilePic, coverPic
router.patch(
  "/update-profile",    
  upload.fields([
    { name: "profilePic", maxCount: 1 },
    { name: "coverPic",   maxCount: 1 },
  ]),
  validate(userValidation.updateProfileSchema),
  userController.updateProfile
);

// PATCH /users/status — update active/offline status
router.patch("/status", userController.updateStatus);

// DELETE /users — permanent account delete
router.delete("/", userController.deleteAccount);

// PATCH /users/deactivate — temporary account deactivation
router.patch("/deactivate", userController.deactivateAccount);

export default router;
