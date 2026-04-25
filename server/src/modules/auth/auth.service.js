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
        console.log(`Finding user ${userId} for token generation`);
        const user = await User.findById(userId);
        if (!user) throw new ApiError(validationStatus.notFound, "User not found");

        console.log(`Generating access token for ${user.email}`);
        const accessToken = user.generateAccessToken();
        console.log(`Generating refresh token for ${user.email}`);
        const refreshToken = user.generateRefreshToken();

        // Use a targeted update instead of user.save() to avoid Mongoose casting
        // the 'platforms' field on documents that don't have it yet, which causes
        // the MongoDB error: "Cannot create field 'youtube' in element {platforms: []}"
        console.log(`Saving refresh token to database for ${user.email}`);
        await User.findByIdAndUpdate(
            userId,
            { $set: { refreshToken } },
            { new: true }
        );

        return { accessToken, refreshToken };
    } catch (error) {
        console.error("Error in generateAccessAndRefreshTokens:", error);
        
        if (error instanceof ApiError) {
            throw error;
        }

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
    try {
        console.log(`Login attempt for email: ${email}`);
        const user = await User.findOne({ email });
        if (!user) {
            console.log(`User not found: ${email}`);
            throw new ApiError(validationStatus.notFound, "User does not exist");
        }

        const isPasswordValid = await user.isPasswordCorrect(password);
        if (!isPasswordValid) {
            console.log(`Invalid password for user: ${email}`);
            throw new ApiError(validationStatus.unauthorized, "Invalid credentials");
        }

        // Auto-reactivate if account was deactivated
        if (user.isDeactivated) {
            console.log(`Reactivating account for: ${email}`);
            user.isDeactivated = false;
            await user.save({ validateBeforeSave: false });
        }

        console.log(`Generating tokens for user: ${user._id}`);
        const tokens = await generateAccessAndRefreshTokens(user._id);
        const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

        console.log(`Login successful for user: ${email}`);
        return { user: loggedInUser, ...tokens };
    } catch (error) {
        console.error("Login Error:", error);
        throw error;
    }
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

/**
 * GET Facebook Auth URL
 */
const getFacebookAuthUrl = () => {
    const params = new URLSearchParams({
        client_id: process.env.META_APP_ID,
        redirect_uri: process.env.META_CALLBACK_URL,
        scope: 'email,public_profile,pages_show_list,instagram_basic',
        response_type: 'code',
    });
    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
};

/**
 * Handle Facebook Callback
 */
const handleFacebookCallback = async (code) => {
    // 1. Exchange code for access token
    const tokenRes = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.META_APP_ID,
            client_secret: process.env.META_APP_SECRET,
            redirect_uri: process.env.META_CALLBACK_URL,
            code,
        }),
    });
    
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
        const errorMsg = tokens.error ? tokens.error.message : 'Facebook token exchange failed';
        throw new ApiError(validationStatus.badRequest, errorMsg);
    }

    const accessToken = tokens.access_token;

    // 2. Fetch User Pages
    const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
    const pagesData = await pagesRes.json();
    
    if (pagesData.error) {
        throw new ApiError(validationStatus.badRequest, `Failed to fetch Facebook pages: ${pagesData.error.message}`);
    }
    
    if (!pagesData.data || pagesData.data.length === 0) {
        throw new ApiError(validationStatus.notFound, 'No Facebook pages found for this user');
    }

    // 3. Find page with Instagram Business Account
    let igAccountId = null;

    for (const page of pagesData.data) {
        const pageId = page.id;
        const pageIgRes = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${accessToken}`);
        
        const pageIgData = await pageIgRes.json();
        
        if (pageIgData.instagram_business_account) {
            igAccountId = pageIgData.instagram_business_account.id;
            break;
        }
    }

    if (!igAccountId) {
        throw new ApiError(validationStatus.notFound, 'No connected Instagram Business account found on your Facebook pages');
    }

    // 4. Fetch Instagram Profile
    const igProfileRes = await fetch(`https://graph.facebook.com/v18.0/${igAccountId}?fields=username,followers_count,media_count&access_token=${accessToken}`);
    
    const igProfileData = await igProfileRes.json();
    if (igProfileData.error) {
        throw new ApiError(validationStatus.badRequest, `Failed to fetch Instagram profile: ${igProfileData.error.message}`);
    }

    return {
        username: igProfileData.username,
        followers: igProfileData.followers_count || 0,
        media_count: igProfileData.media_count || 0
    };
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
    getFacebookAuthUrl,
    handleFacebookCallback,
};
