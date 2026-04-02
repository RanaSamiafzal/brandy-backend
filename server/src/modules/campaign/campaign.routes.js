import { Router } from "express";
import { campaignController } from "./campaign.controller.js";
import { campaignValidation } from "./campaign.validation.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { roleMiddleware } from "../../middleware/roleMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";
import { validate } from "../../middleware/validationMiddleware.js";

const router = Router();

// All routes require authentication
router.use(verifyJwt);

router.route("/")
    .get(
        validate(campaignValidation.campaignQuerySchema, 'query'),
        campaignController.getAllCampaigns
    )
    .post(
        roleMiddleware(["brand"]),
        upload.fields([{ name: "image", maxCount: 1 }]),
        validate(campaignValidation.campaignCreateSchema),
        campaignController.createCampaign
    );

router.route("/:campaignId")
    .get(campaignController.getCampaign)
    .patch(
        roleMiddleware(["brand"]),
        upload.fields([{ name: "image", maxCount: 1 }]),
        validate(campaignValidation.campaignUpdateSchema),
        campaignController.updateCampaign
    )
    .delete(
        roleMiddleware(["brand"]),
        campaignController.deleteCampaign
    );

router.post(
    "/:campaignId/apply",
    roleMiddleware(["influencer"]),
    upload.fields([{ name: "portfolio", maxCount: 1 }]),
    validate(campaignValidation.applyToCampaignSchema),
    campaignController.applyToCampaign
);

export default router;
