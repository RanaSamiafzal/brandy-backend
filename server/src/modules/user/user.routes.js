import { Router } from "express";
import { userController } from "./user.controller.js";
import { userValidation } from "./user.validation.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";

const router = Router();

router.use(verifyJwt);

router.get("/profile", userController.getProfile);

router.patch("/update-profile", validate(userValidation.updateProfileSchema), userController.updateProfile);

export default router;
