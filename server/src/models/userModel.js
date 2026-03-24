import mongoose from "mongoose";
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
const UserSchema = new mongoose.Schema(
    {
        fullname: {
            type: String,
            required: true,
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
            type: String, // Cloudinary URL
            default: "",
        },



        lastLogin: Date,
    },
    {
        timestamps: true,
    }
)

// this is the built In pre hook we can use it for just before the during the execution as an middleware \
// like we want to hash the password before  saving into the  database 

UserSchema.pre("save", async function () {

    if (!this.isModified('password')) return;

    this.password = await bcrypt.hash(this.password, 10)

})
// we can also use methods here on this UserScheme and also built custom method as well
// like below we use create custom method of checking password
UserSchema.methods.isPasswordCorrect = async function name(password) {
    return await bcrypt.compare(password, this.password)
}
// bcrypt.compare(password, this.password)  
// this.password is the hashed password 
// which is stored in the database and password is the plain text
//  password which is coming from the user when he is trying to login


// JWT

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

    )
}
UserSchema.methods.generatePasswordResetOTP = function () {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    this.passwordResetOTP = crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
    this.passwordResetAttempts = 0;
    return otp

}


UserSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            _id: this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }

    )
}
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });

const User = mongoose.model("User", UserSchema);

export default User;