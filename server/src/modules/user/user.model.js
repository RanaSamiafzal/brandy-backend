import mongoose from "mongoose";
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

const UserSchema = new mongoose.Schema(
    {
        fullname: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        password: {
            type: String,
            required: [true, 'password is required'],
        },
        role: {
            type: String,
            enum: ["brand", "influencer", "admin"],
            required: true,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        isBlocked: {
            type: Boolean,
            default: false,
        },
        refreshToken: {
            type: String
        },
        profilePic: {
            type: String, // Cloudinary URL
            default: "",
        },

        passwordResetOTP: String,
        passwordResetExpires: Date,
        passwordResetAttempts: {
            type: Number,
            default: 0,
        },
        googleId: {
            type: String,
        },
        isGoogleUser: {
            type: Boolean,
            default: false,
        },
        coverPic: {
            type: String, 
            default: "",
        },
        emailVerificationOTP: String,
        emailVerificationOTPExpires: Date,
        lastLogin: Date,
        lastActive: {
            type: Date,
            default: Date.now,
        },
        profileComplete: {
            type: Boolean,
            default: false,
            index: true, 
        },
        profileCompletedAt: {
            type: Date,
            default: null,
        },
        status: {
            type: String,
            enum: ["active", "offline"],
            default: "active",
        },
        manualOffline: {
            type: Boolean,
            default: false,
        },
        isDeactivated: {
            type: Boolean,
            default: false,
        },
        // OAuth verified platforms — stores detailed platform info
        verifiedPlatforms: [
            {
                platform: { type: String, required: true },
                username: String,
                platformUserId: String,
                profileUrl: String,
                refreshToken: String,
                tokenExpiry: Date,
                connected: { type: Boolean, default: true },
                verified: { type: Boolean, default: true },
                lastSyncedAt: { type: Date, default: Date.now },
                updatedAt: { type: Date, default: Date.now },
            },
        ],
        // Structured platform data for analytics & frontend display
        platforms: {
            youtube: {
                channelId: String,
                title: String,
                description: String,
                customUrl: String,
                thumbnail: String,
                country: String,
                channelCreatedAt: Date,

                subscribers: { type: Number, default: 0 },
                totalViews: { type: Number, default: 0 },
                totalVideos: { type: Number, default: 0 },

                avgViews: { type: Number, default: 0 },
                engagementRate: { type: Number, default: 0 },

                lastUpdated: Date,

                videos: [
                    {
                        videoId: String,
                        title: String,
                        uploadedAt: Date,
                        views: { type: Number, default: 0 },
                        comments: { type: Number, default: 0 },
                        likes: { type: Number, default: 0 },
                    },
                ],
            },
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
)

// Virtual: true if email is verified AND 3 or more platforms are verified
UserSchema.virtual('isProfileVerified').get(function () {
    if (!this.isVerified) return false;
    const vp = this.verifiedPlatforms;
    if (!vp || vp.length === 0) return false;
    const count = vp.filter(p => p.verified).length;
    return count >= 3;
});

// Fix platforms field: ensure it is always a plain object, never an array.
// This prevents a MongoDB error when old documents have platforms stored as []
// and Mongoose tries to write platforms.youtube into it during save().
UserSchema.pre("save", function (next) {
    if (Array.isArray(this.platforms)) {
        this.platforms = {};
    }
    next();
});

// Password Hashing
UserSchema.pre("save", async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Custom methods
UserSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

UserSchema.methods.generateAccessToken = function () {
    if (!process.env.ACCESS_TOKEN_SECRET) {
        console.error("CRITICAL: ACCESS_TOKEN_SECRET is missing in process.env");
        throw new Error("ACCESS_TOKEN_SECRET is missing");
    }
    const payload = {
        _id: this._id,
        email: this.email,
        fullname: this.fullname || this.name || "User", // Fallback for legacy data
        role: this.role || "influencer", // Default fallback for invalid roles
    };

    return jwt.sign(
        payload,
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    );
};

UserSchema.methods.generateRefreshToken = function () {
    if (!process.env.REFRESH_TOKEN_SECRET) {
        console.error("CRITICAL: REFRESH_TOKEN_SECRET is missing in process.env");
        throw new Error("REFRESH_TOKEN_SECRET is missing");
    }
    return jwt.sign(
        {
            _id: this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    );
};

UserSchema.methods.generatePasswordResetOTP = function () {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.passwordResetOTP = crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
    this.passwordResetAttempts = 0;
    return otp;
};

UserSchema.methods.generateEmailVerificationOTP = function () {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.emailVerificationOTP = crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
    this.emailVerificationOTPExpires = Date.now() + 5 * 60 * 1000;
    return otp;
};

UserSchema.index({ role: 1 });
UserSchema.index({ _id: 1, "verifiedPlatforms.platform": 1 });
UserSchema.index({ "verifiedPlatforms.platform": 1, "verifiedPlatforms.platformUserId": 1 }, { 
    unique: true, 
    sparse: true,
    partialFilterExpression: { "verifiedPlatforms.verified": true }
});

const User = mongoose.model("User", UserSchema);

export default User;
