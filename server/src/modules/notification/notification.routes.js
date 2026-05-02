import { Router } from "express";
import { notificationController } from "./notification.controller.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";

const router = Router();

router.use(verifyJwt);

router.get("/", notificationController.getMyNotifications);
router.patch("/read-all", notificationController.markAllRead);
router.patch("/:notificationId/read", notificationController.markNotificationRead);
router.delete("/:notificationId", notificationController.removeNotification);

export default router;
