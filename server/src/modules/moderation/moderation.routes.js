import { Router } from "express";
import { moderationController } from "./moderation.controller.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { roleMiddleware } from "../../middleware/roleMiddleware.js";

const router = Router();

// Only Admins can access moderation tools
router.use(verifyJwt, roleMiddleware(['admin']));

router.get("/history/:userId", moderationController.getUserHistory);
router.post("/adjust-trust", moderationController.adjustUserTrust);

export default router;
