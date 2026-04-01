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
        lastLogin: Date,
        profileComplete: {
            type: Boolean,
            default: false,
            index: true, 
        },
        profileCompletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
)

// Passwaord Hashing
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
        throw new Error("ACCESS_TOKEN_SECRET is missing");
    }
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            fullname: this.fullname,
            role: this.role,
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    );
};

UserSchema.methods.generateRefreshToken = function () {
    if (!process.env.REFRESH_TOKEN_SECRET) {
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

UserSchema.index({ role: 1 });

const User = mongoose.model("User", UserSchema);

export default User;
