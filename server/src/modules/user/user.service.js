import User from "./user.model.js";
import Brand from "../brand/brand.model.js";
import Influencer from "../influencer/influencer.model.js";
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

/**
 * Permanent Delete Account
 */
const deleteAccount = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(validationStatus.notFound, "User not found");
    }

    // Delete role-specific profiles
    if (user.role === "brand") {
        await Brand.deleteOne({ user: userId });
    } else if (user.role === "influencer") {
        await Influencer.deleteOne({ user: userId });
    }

    // Delete user doc
    await User.findByIdAndDelete(userId);
};

/**
 * Deactivate Account
 */
const deactivateAccount = async (userId) => {
    const user = await User.findByIdAndUpdate(
        userId,
        { isDeactivated: true },
        { new: true }
    );
    if (!user) {
        throw new ApiError(validationStatus.notFound, "User not found");
    }
    return user;
};

/**
 * Activate Account
 */
const activateAccount = async (userId) => {
    const user = await User.findByIdAndUpdate(
        userId,
        { isDeactivated: false },
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
    deleteAccount,
    deactivateAccount,
    activateAccount,
};
