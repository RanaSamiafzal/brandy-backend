import { Router } from "express";
import {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    forgotPassword,
    resetPassword,
    myProfile
} from "../controllers/authController.js";
import { upload } from '../middleware/multerMiddleware.js'
import { verifyJwt } from "../middleware/authMiddleware.js";
import passport from "passport";

const router = Router();

router.route('/register').post(
    upload.fields([
        { name: "profilePic", maxCount: 1 },
        { name: "coverPic", maxCount: 1 },
        { name: "logo", maxCount: 1 }
    ]),
    registerUser
)

router.route('/login').post(loginUser)
router.route('/logout').post(verifyJwt, logoutUser)
router.route('/refresh-token').post(refreshAccessToken)
router.route('/profile').get(verifyJwt, myProfile)
router.route('/forgot-password').post(forgotPassword)
router.route('/reset-password').post(resetPassword)

// Google OAuth
router.route('/google').get(passport.authenticate("google", { scope: ["profile", "email"] }));
router.route('/google/callback').get(passport.authenticate("google", { session: false }));

export default router;
