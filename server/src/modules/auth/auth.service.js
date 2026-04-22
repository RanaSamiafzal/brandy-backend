import User from "../user/user.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendEmail } from "../../utils/email.js";
import Brand from "../brand/brand.model.js";
import Influencer from "../influencer/influencer.model.js";

/**
 * Generate Access and Refresh Tokens
 */
const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) throw new ApiError(validationStatus.notFound, "User not found");

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(
            validationStatus.internalError,
            error.message || "Something went wrong while generating tokens"
        );
    }
};

/**
 * Register a new user
 */
const register = async (userData) => {
    const { email } = userData;
    const existingUser = await User.findOne({ email }).select("_id");
    if (existingUser) {
        throw new ApiError(validationStatus.badRequest, "Email is already registered");
    }

    const newUser = await User.create(userData);
    const safeUser = await User.findById(newUser._id).select("-password -refreshToken");

    if (!safeUser) {
        throw new ApiError(validationStatus.internalError, "Error registering the user");
    }

    // Role-specific profile initialization
    // (We use default values for required fields or expect the user to fill them on first save)
    try {
        if (userData.role === "brand") {
            await Brand.create({
                user: newUser._id,
                brandname: userData.fullname || "My Brand", // Initial placeholder
                budgetRange: { min: 0, max: 0 }           // Initial placeholder
            });
        } else if (userData.role === "influencer") {
            await Influencer.create({
                user: newUser._id,
                username: userData.fullname?.toLowerCase().replace(/\s+/g, "") || `user${newUser._id.toString().slice(-4)}`,
                about: `Hi, I'm ${userData.fullname}` // Initial placeholder
            });
        }
    } catch (err) {
        console.error("Error creating role profile on registration:", err);
        // We don't throw error here to avoid blocking registration if profile creation fails
        // The upsert on first save will act as a fallback
    }

    return safeUser;
};

/**
 * Login user
 */
const login = async (email, password) => {
    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(validationStatus.notFound, "User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError(validationStatus.unauthorized, "Invalid credentials");
    }

    // Auto-reactivate if account was deactivated
    if (user.isDeactivated) {
        user.isDeactivated = false;
        await user.save({ validateBeforeSave: false });
    }

    const tokens = await generateAccessAndRefreshTokens(user._id);
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    return { user: loggedInUser, ...tokens };
};

/**
 * Logout user
 */
const logout = async (userId) => {
    await User.findByIdAndUpdate(
        userId,
        { $unset: { refreshToken: 1 } },
        { new: true }
    );
};

/**
 * Refresh access token
 */
const refreshAccessToken = async (incomingRefreshToken) => {
    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken?._id);
        if (!user || incomingRefreshToken !== user.refreshToken) {
            throw new ApiError(validationStatus.unauthorized, "Invalid or expired refresh token");
        }

        const tokens = await generateAccessAndRefreshTokens(user._id);
        return tokens;
    } catch (error) {
        throw new ApiError(validationStatus.unauthorized, error.message || "Invalid refresh token");
    }
};

/**
 * Forgot password - send OTP
 */
const forgotPassword = async (email) => {
    const user = await User.findOne({ email });
    if (!user) return; // Silent return for security

    const otp = user.generatePasswordResetOTP();
    await user.save({ validateBeforeSave: false });

    console.log(`\n\n=== DEVELOPMENT OTP FOR ${user.email}: ${otp} ===\n\n`);

    try {
        await sendEmail({
            to: user.email,
            subject: "Password Reset OTP - Brandly",
            html: `<h2>Password Reset OTP</h2><h1>${otp}</h1><p>This OTP expires in 10 minutes.</p>`,
        });
    } catch (err) {
        console.log("Email could not be sent (SMTP may not be configured). OTP printed in console.");
    }
};

/**
 * Reset password
 */
const resetPassword = async (email, otp, newPassword) => {
    const user = await User.findOne({ email });
    if (!user || user.passwordResetExpires < Date.now()) {
        throw new ApiError(validationStatus.badRequest, "Invalid request or OTP expired");
    }

    if (user.passwordResetAttempts >= 5) {
        throw new ApiError(validationStatus.tooManyRequests, "Too many attempts. Request new OTP.");
    }

    const hashedOTP = crypto.createHash("sha256").update(otp).digest('hex');
    if (hashedOTP !== user.passwordResetOTP) {
        user.passwordResetAttempts += 1;
        await user.save({ validateBeforeSave: false });
        throw new ApiError(validationStatus.badRequest, "Invalid OTP");
    }

    user.password = newPassword;
    user.passwordResetOTP = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetAttempts = undefined;
    user.refreshToken = undefined;
    await user.save();
};

/**
 * Change Password
 */
const changePassword = async (userId, oldPassword, newPassword) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(validationStatus.notFound, "User not found");
    }

    const isPasswordValid = await user.isPasswordCorrect(oldPassword);
    if (!isPasswordValid) {
        throw new ApiError(validationStatus.badRequest, "Invalid current password");
    }

    user.password = newPassword;
    await user.save();
};

/**
 * Send Email Verification OTP
 */
const sendEmailVerificationOTP = async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(validationStatus.notFound, "User not found");

    const otp = user.generateEmailVerificationOTP();
    await user.save({ validateBeforeSave: false });

    console.log(`\n\n=== EMAIL VERIFICATION OTP FOR ${user.email}: ${otp} ===\n\n`);

    try {
        await sendEmail({
            to: user.email,
            subject: "Verify Your Email - Brandly",
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; rounded: 16px;">
                    <h2 style="color: #111827; font-weight: 800;">Verify Your Email</h2>
                    <p style="color: #4b5563;">Use the following OTP to verify your email address. This code expires in 5 minutes.</p>
                    <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: 900; letter-spacing: 5px; color: #2563eb;">${otp}</span>
                    </div>
                    <p style="color: #9ca3af; font-size: 12px;">If you didn't request this, please ignore this email.</p>
                </div>
            `,
        });
    } catch (err) {
        console.log("Email could not be sent (SMTP issues). OTP printed in console.");
    }
};

/**
 * Verify Email Verification OTP
 */
const verifyEmailVerificationOTP = async (userId, otp) => {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(validationStatus.notFound, "User not found");

    if (!user.emailVerificationOTPExpires || user.emailVerificationOTPExpires < Date.now()) {
        throw new ApiError(validationStatus.badRequest, "OTP expired. Please request a new one.");
    }

    const hashedOTP = crypto.createHash("sha256").update(otp).digest('hex');
    if (hashedOTP !== user.emailVerificationOTP) {
        throw new ApiError(validationStatus.badRequest, "Invalid OTP");
    }

    user.isVerified = true;
    user.emailVerificationOTP = undefined;
    user.emailVerificationOTPExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return user;
};

export const authService = {
    register,
    login,
    logout,
    refreshAccessToken,
    forgotPassword,
    resetPassword,
    changePassword,
    sendEmailVerificationOTP,
    verifyEmailVerificationOTP,
};
