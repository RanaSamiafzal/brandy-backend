import { userService } from "./user.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { getCompletionStatus, checkAndMarkComplete } from "../../utils/profileCompletion.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";
import Influencer from "../influencer/influencer.model.js";
import Brand from "../brand/brand.model.js";




/**
 * GET /users/me
 * Returns: User + role profile (Influencer or Brand) + completion status
 * Used by the ProfileSettings page to load everything in one request
 */
const getMe = AsyncHandler(async (req, res) => {
    const userId = req.user._id;
    const role = req.user.role;

    const user = await userService.getUserById(userId);

    let roleProfile = null;
    if (role === "influencer") {
        roleProfile = await Influencer.findOne({ user: userId }).lean();
    }
    if (role === "brand") {
        roleProfile = await Brand.findOne({ user: userId }).lean();
    }

    const completion = await getCompletionStatus(userId, role);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { user, roleProfile, completion }, "Profile fetched")
    );
});


/**
 * Get the logged-in user's profile
 */
const getProfile = AsyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, user, "User profile fetched successfully")
    );
});

/**
 * PATCH /users/update-profile
 * Accepts: fullname, profilePic file, coverPic file
 * Runs completion check after save so profileComplete stays in sync
 */
const updateProfile = AsyncHandler(async (req, res) => {
    const updateData = { ...req.body };

    // Handle profilePic upload
    if (req.files?.profilePic?.[0]?.path) {
        const upload = await uploadOnCloudinary(req.files.profilePic[0].path);
        if (upload?.url) updateData.profilePic = upload.url;
    }

    // Handle coverPic upload
    if (req.files?.coverPic?.[0]?.path) {
        const upload = await uploadOnCloudinary(req.files.coverPic[0].path);
        if (upload?.url) updateData.coverPic = upload.url;
    }

    const user = await userService.updateUserProfile(req.user._id, updateData);

    // Re-evaluate profile completion (profilePic counts as a required field)
    await checkAndMarkComplete(req.user._id, req.user.role);
    const completion = await getCompletionStatus(req.user._id, req.user.role);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { user, completion }, "Profile updated successfully")
    );
});

export const userController = {
    getProfile,
    updateProfile,
    getMe,
};
