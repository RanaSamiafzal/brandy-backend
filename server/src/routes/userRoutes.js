import { Router } from "express";
import {
    updateProfile,
    deleteAccount
} from "../controllers/userController.js";
import { upload } from '../middleware/multerMiddleware.js'
import { verifyJwt } from "../middleware/authMiddleware.js";

const router = Router();

router.use(verifyJwt);

router.route('/profile').patch(
    upload.fields([
        { name: "profilePic", maxCount: 1 },
        { name: "coverPic", maxCount: 1 },
        { name: "logo", maxCount: 1 }
    ]),
    updateProfile
);

router.route('/delete-account').delete(deleteAccount);

export default router;
