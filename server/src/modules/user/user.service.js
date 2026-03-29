import User from "./user.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";

/**
 * Get user by ID
 */
const getUserById = async (userId) => {
    const user = await User.findById(userId).select("-password -refreshToken");
    if (!user) {
        throw new ApiError(validationStatus.notFound, "User not found");
    }
    return user;
};

/**
 * Update user profile
 */
const updateUserProfile = async (userId, updateData) => {
    const user = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true }
    ).select("-password -refreshToken");

    if (!user) {
        throw new ApiError(validationStatus.notFound, "User not found");
    }
    return user;
};

/**
 * Soft delete or block user
 */
const blockUser = async (userId) => {
    const user = await User.findByIdAndUpdate(
        userId,
        { isBlocked: true },
        { new: true }
    );
    if (!user) {
        throw new ApiError(validationStatus.notFound, "User not found");
    }
    return user;
};

export const userService = {
    getUserById,
    updateUserProfile,
    blockUser,
};
