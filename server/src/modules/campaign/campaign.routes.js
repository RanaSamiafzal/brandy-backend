import { Router } from "express";
import { campaignController } from "./campaign.controller.js";
import { campaignValidation } from "./campaign.validation.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { roleMiddleware } from "../../middleware/roleMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";
import { validate } from "../../middleware/validationMiddleware.js";

import { verifyAuthOrApiKey } from "../../middleware/apiKeyMiddleware.js";

const router = Router();

router.route("/")
    .get(
        verifyAuthOrApiKey('campaigns:read'),
        validate(campaignValidation.campaignQuerySchema, 'query'),
        campaignController.getAllCampaigns
    )
    .post(
        verifyJwt,
        roleMiddleware(["brand"]),
        upload.fields([{ name: "image", maxCount: 1 }]),
        validate(campaignValidation.campaignCreateSchema),
        campaignController.createCampaign
    );

router.route("/:campaignId")
    .get(
        verifyAuthOrApiKey('campaigns:read'),
        campaignController.getCampaign
    )
    .patch(
        verifyJwt,
        roleMiddleware(["brand"]),

        upload.fields([{ name: "image", maxCount: 1 }]),
        validate(campaignValidation.campaignUpdateSchema),
        campaignController.updateCampaign
    )
    .delete(
        verifyJwt,
        roleMiddleware(["brand"]),
        campaignController.deleteCampaign
    );

router.patch(
    "/:campaignId/cancel",
    verifyJwt,
    roleMiddleware(["brand"]),
    campaignController.cancelCampaign
);

router.patch(
    "/:campaignId/extend",
    verifyJwt,
    roleMiddleware(["brand"]),
    campaignController.extendCampaignDuration
);

router.post(
    "/:campaignId/apply",
    verifyJwt,
    roleMiddleware(["influencer"]),
    upload.fields([{ name: "portfolio", maxCount: 1 }]),
    validate(campaignValidation.applyToCampaignSchema),
    campaignController.applyToCampaign
);


export default router;
