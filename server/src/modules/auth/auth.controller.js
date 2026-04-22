import { authService } from "./auth.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
};

/**
 * Handle user registration
 */
const register = AsyncHandler(async (req, res) => {
    let { fullname, email, password, role } = req.body;
    if (email) email = email.toLowerCase().trim();

    const userData = {
        fullname,
        email,
        password,
        role,
    };

    // Handle profile and cover photo uploads
    if (req.files?.profilePic?.[0]?.path) {
        const uploadedProfile = await uploadOnCloudinary(req.files.profilePic[0].path);
        userData.profilePic = uploadedProfile?.url || "";
    }
    if (req.files?.coverPic?.[0]?.path) {
        const uploadedCover = await uploadOnCloudinary(req.files.coverPic[0].path);
        userData.coverPic = uploadedCover?.url || "";
    }

    const user = await authService.register(userData);

    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, user, "User registered successfully")
    );
});

/**
 * Handle user login
 */
const login = AsyncHandler(async (req, res) => {
    let { email, password } = req.body;
    if (email) email = email.toLowerCase().trim();
    const { user, accessToken, refreshToken } = await authService.login(email, password);

    return res
        .status(validationStatus.ok)
        .cookie("accessToken", String(accessToken), cookieOptions)
        .cookie("refreshToken", String(refreshToken), cookieOptions)
        .json(
            new ApiResponse(
                validationStatus.ok,
                { user, accessToken, refreshToken },
                "User logged in successfully"
            )
        );
});

/**
 * Handle user logout
 */
const logout = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    await authService.logout(userId);

    return res
        .status(validationStatus.ok)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(new ApiResponse(validationStatus.ok, {}, "User logged out successfully"));
});

/**
 * Handle access token refresh
 */
const refresh = AsyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    const tokens = await authService.refreshAccessToken(incomingRefreshToken);

    return res
        .status(validationStatus.ok)
        .cookie("accessToken", tokens.accessToken, cookieOptions)
        .cookie("refreshToken", tokens.refreshToken, cookieOptions)
        .json(new ApiResponse(validationStatus.ok, tokens, "Tokens refreshed successfully"));
});

/**
 * Handle forgot password request
 */
const forgotPassword = AsyncHandler(async (req, res) => {
    let email = req.body.email;
    if (email) email = email.toLowerCase().trim();
    await authService.forgotPassword(email);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "If account exists, OTP has been sent.")
    );
});

/**
 * Handle password reset
 */
const resetPassword = AsyncHandler(async (req, res) => {
    let { email, otp, password } = req.body;
    if (email) email = email.toLowerCase().trim();
    await authService.resetPassword(email, otp, password);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Password reset successfully")
    );
});

/**
 * Change Password
 */
const changePassword = AsyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user?._id;

    await authService.changePassword(userId, oldPassword, newPassword);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Password changed successfully")
    );
});

/**
 * Send Email Verification OTP
 */
const sendOTP = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    await authService.sendEmailVerificationOTP(userId);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "OTP sent to your email.")
    );
});

/**
 * Verify Email Verification OTP
 */
const verifyOTP = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { otp } = req.body;
    
    if (!otp) throw new ApiError(validationStatus.badRequest, "OTP is required");
    
    await authService.verifyEmailVerificationOTP(userId, otp);
    
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Email verified successfully")
    );
});

export const authController = {
    register,
    login,
    logout,
    refresh,
    forgotPassword,
    resetPassword,
    changePassword,
    sendOTP,
    verifyOTP,
};
