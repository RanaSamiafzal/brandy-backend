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
    },
    {
        timestamps: true,
    }
);

BrandSchema.index({ industry: 1 });

const Brand = mongoose.model("Brand", BrandSchema);

export default Brand;
