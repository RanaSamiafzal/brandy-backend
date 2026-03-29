import { Router } from "express";
import { activityController } from "./activity.controller.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";

const router = Router();

router.use(verifyJwt);

router.get("/", activityController.getActivities);
router.patch("/read-all", activityController.markAllAsRead);
router.patch("/:activityId/read", activityController.markAsRead);
router.delete("/:activityId", activityController.deleteActivity);

export default router;
