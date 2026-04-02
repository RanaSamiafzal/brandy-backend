import User from "./user.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { emitActivity } from "../../utils/activityUtils.js";

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

    // Emit activity
    await emitActivity({
        user: userId,
        role: user.role,
        type: 'profile_updated',
        title: 'Profile Updated',
        description: 'You have successfully updated your profile information.',
        category: 'system'
    });

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
