import { Router } from "express";
import {
    forgotPassword,
    loginUser,
    logoutUser,
    myProfile,
    refreshAccessToken,
    registerUser,
    resetPassword,
    updateProfile,
} from "../controllers/userController.js";
import { upload } from '../middleware/multerMiddleware.js'
import { verifyJwt } from "../middleware/authMiddleware.js";
import passport from "passport";
// import { verifyJWT } from "../middleware/authMiddleware.js";


const router = Router();

router.route('/register').post(
    upload.fields([
        {
            name: "profilePic",
            maxCount: 1
        },
        {
            name: "coverPic",
            maxCount: 1
        },
        {
            name: "logo",
            maxCount: 1
        }
    ]),
    registerUser
)

router.route('/login').post(loginUser)
router.route('/logout').post(verifyJwt, logoutUser)
router.route('/refresh-token').post(refreshAccessToken)
router.route('/profile').get(verifyJwt, myProfile)
router.route('/forgot-password').post(forgotPassword)
router.route('/reset-password').post(resetPassword)
router.route('/update-profile').patch(
    upload.fields([
        {
            name: "profilePic",
            maxCount: 1
        },
        {
            name: "coverPic",
            maxCount: 1
        },
        {
            name: "logo",
            maxCount: 1
        }
    ]),
    verifyJwt, updateProfile)



// Step 1 → Redirect to Google
router.route('/google').get(passport.authenticate("google", { scope: ["profile", "email"] }));

// Step 1 → Redirect to Google
router.route('/google/callback').get(passport.authenticate("google", { session: false })),
    async (req, res) => {
        // generate JWt token
        const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(req.user._id);
        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        };
        res
            .cookie("accessToken", accessToken, options)
            .cookie("refeshToken", refreshToken, options)
            .redirect("http://localhost:5173"); //frontend redirect


    }


export default router;