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
        },
        industry: {
            type: String, // e.g. "Fashion", "Tech", "Food"
            default: "",
        },

        budgetRange: {
            type: {
                min: Number,
                max: Number,
            },
            required: true,
        },
        website: {
            type: String,
            default: "",
        },
        address: {
            type: String,
            default: "",
        },
        description: {
            type: String,
            default: ""
        },
        logo: {
            type: String,
            default: ""

        },

    },
    {
        timestamps: true,
    }
)

BrandSchema.index({ user: 1 });
BrandSchema.index({ industry: 1 });

const Brand = mongoose.model("Brand", BrandSchema);
export default Brand

