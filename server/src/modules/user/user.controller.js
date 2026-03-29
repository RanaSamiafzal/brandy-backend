import { userService } from "./user.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";

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
 * Update the logged-in user's profile
 */
const updateProfile = AsyncHandler(async (req, res) => {
    const user = await userService.updateUserProfile(req.user._id, req.body);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, user, "User profile updated successfully")
    );
});

export const userController = {
    getProfile,
    updateProfile,
};
