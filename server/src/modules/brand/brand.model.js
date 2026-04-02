import mongoose from "mongoose";

const BrandSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        brandname: {
            type: String,
            required: true,
            trim: true,
        },
        industry: {
            type: String, // e.g. "Fashion", "Tech", "Food"
            default: "",
            trim: true,
        },
        budgetRange: {
            min: { type: Number, required: true },
            max: { type: Number, required: true },
        },
        website: {
            type: String,
            default: "",
            trim: true,
        },
        address: {
            type: String,
            default: "",
            trim: true,
        },
        description: {
            type: String,
            default: "",
            trim: true,
        },
        logo: {
            type: String,
            default: "",
        },
        followersCount: {
            type: Number,
            default: 0,
        },
        rating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },
        reviewsCount: {
            type: Number,
            default: 0,
        },
        socialMedia: {
            instagram: { type: String, default: "" },
            tiktok: { type: String, default: "" },
            twitter: { type: String, default: "" },
            linkedin: { type: String, default: "" },
        },
        lookingFor: [
            {
                type: String,
                trim: true,
            }
        ],
    },
    {
        timestamps: true,
    }
);

BrandSchema.index({ industry: 1 });

const Brand = mongoose.model("Brand", BrandSchema);

export default Brand;
