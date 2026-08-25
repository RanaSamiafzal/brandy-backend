import { Router } from "express";
import { brandController } from "./brand.controller.js";
import { brandValidation } from "./brand.validation.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { roleMiddleware } from "../../middleware/roleMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";


import { verifyAuthOrApiKey } from "../../middleware/apiKeyMiddleware.js";

const router = Router();

router.get("/public-list", verifyAuthOrApiKey('brands:read'), brandController.getPublicBrandList);
router.get("/debug-in", verifyAuthOrApiKey('brands:read'), brandController.getBrandInfluencers);
router.get("/:brandId/public", verifyAuthOrApiKey('brands:read'), brandController.getBrandPublicProfile);

router.use(verifyJwt, roleMiddleware(["brand"]));


router.get("/profile", brandController.getBrandProfile);

router.patch(
    "/update-profile",
    upload.fields([{ name: "logo", maxCount: 1 }]),
    validate(brandValidation.updateProfileSchema),
    brandController.updateBrandProfile
);

router.get("/dashboard", brandController.getBrandDashboard);
router.get("/analytics", brandController.getBrandAnalytics);
router.get("/influencers", brandController.getBrandInfluencers);
router.get("/influencers/:id", brandController.getBrandInfluencer);
router.get("/activity", brandController.getBrandActivity);
router.patch("/activity/:id/read", brandController.markActivityAsRead);
router.delete("/activity/:id", brandController.deleteActivity);


export default router;


