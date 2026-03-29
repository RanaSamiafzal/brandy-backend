import { Router } from "express";
import { brandController } from "./brand.controller.js";
import { brandValidation } from "./brand.validation.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { roleMiddleware } from "../../middleware/roleMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";

const router = Router();

router.use(verifyJwt, roleMiddleware(["brand"]));

router.get("/dashboard", brandController.getBrandDashboard);
router.get("/profile", brandController.getBrandProfile);

router.patch(
    "/update-profile",
    upload.fields([{ name: "logo", maxCount: 1 }]),
    validate(brandValidation.updateProfileSchema),
    brandController.updateBrandProfile
);

export default router;
