import { Router } from "express";
import rateLimit from "express-rate-limit";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { geoController } from "./geo.controller.js";

const router = Router();

const geoLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many map searches. Please wait a moment." },
});

router.use(verifyJwt, geoLimiter);
router.get("/maps-config", geoController.getMapsConfig);
router.get("/search", geoController.searchPlaces);
router.get("/reverse", geoController.reversePlace);

export default router;
