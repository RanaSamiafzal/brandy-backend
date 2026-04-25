import { userService } from "./user.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { getCompletionStatus, checkAndMarkComplete } from "../../utils/profileCompletion.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";
import Influencer from "../influencer/influencer.model.js";
import Brand from "../brand/brand.model.js";
import User from "./user.model.js";




/**
 * GET /users/me
 * Returns: User + role profile (Influencer or Brand) + completion status
 * Used by the ProfileSettings page to load everything in one request
 */
const getMe = AsyncHandler(async (req, res) => {
    const userId = req.user._id;
    const role = req.user.role;

    // Force status to "active" when logging in or reloading the page
    await User.findByIdAndUpdate(userId, { status: "active", manualOffline: false });
    const user = await userService.getUserById(userId);

    let roleProfile = null;
    if (role === "influencer") {
        roleProfile = await Influencer.findOne({ user: userId }).lean();
        if (!roleProfile) {
            console.log(`[UserController] Influencer profile missing for user ${userId}. Auto-creating...`);
            roleProfile = await Influencer.create({
                user: userId,
                username: user?.fullname?.toLowerCase().replace(/\s+/g, "") || `user${userId.toString().slice(-4)}`,
                about: `Hi, I'm ${user?.fullname || 'an influencer'}`
            });
            roleProfile = roleProfile.toObject();
        }
    }
    if (role === "brand") {
        roleProfile = await Brand.findOne({ user: userId }).lean();
        if (!roleProfile) {
            console.log(`[UserController] Brand profile missing for user ${userId}. Auto-creating...`);
            roleProfile = await Brand.create({
                user: userId,
                brandname: user?.fullname || "My Brand",
                budgetRange: { min: 0, max: 0 }
            });
            roleProfile = roleProfile.toObject();
        }
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

/**
 * PATCH /users/status
 * Updates the user's activity status (active, offline)
 */
const updateStatus = AsyncHandler(async (req, res) => {
    const { status } = req.body;
    let updateObj = { status };
    if (status === "offline") {
       updateObj.lastActive = new Date();
       updateObj.manualOffline = true;
    } else {
       updateObj.lastActive = new Date();
       updateObj.manualOffline = false;
    }
    const user = await userService.updateUserProfile(req.user._id, updateObj);
    
    const io = req.app.get('socketio');
    if (io) {
        io.emit("user_status_changed", { 
            userId: req.user._id, 
            status: status, 
            lastActive: updateObj.lastActive 
        });
    }

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, user, "Status updated successfully")
    );
});

/**
 * Permanent Delete Account
 */
const deleteAccount = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    await userService.deleteAccount(userId);

    // Clear cookies if logged in
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Account deleted successfully")
    );
});

/**
 * Deactivate Account
 */
const deactivateAccount = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    await userService.deactivateAccount(userId);

    // Clear cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Account deactivated successfully")
    );
});

export const userController = {
    getMe,
    getProfile,
    updateProfile,
    updateStatus,
    deleteAccount,
    deactivateAccount,
};
