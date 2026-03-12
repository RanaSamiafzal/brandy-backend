import { Router } from "express";
import {
    createCampaign,
    updateCampaign,
    deleteCampaign,
    getCampaign,
    getAllCampaigns
} from "../controllers/campaignController.js";
import { verifyJwt } from "../middleware/authMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { upload } from "../middleware/multerMiddleware.js";

const router = Router();

router.use(verifyJwt);

router.route("/")
    .get(getAllCampaigns)
    .post(roleMiddleware(["brand"]), upload.fields([{ name: "image", maxCount: 1 }]), createCampaign);

router.route("/:campaignId")
    .get(getCampaign)
    .patch(roleMiddleware(["brand"]), updateCampaign)
    .delete(roleMiddleware(["brand"]), deleteCampaign);

export default router;
