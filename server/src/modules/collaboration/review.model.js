import mongoose, { Schema } from "mongoose";

const reviewSchema = new Schema(
    {
        reviewer: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        reviewee: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        collaboration: {
            type: Schema.Types.ObjectId,
            ref: "Collaboration",
            required: true,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        comment: {
            type: String,
            trim: true,
            default: "",
        },
        role: {
            type: String,
            enum: ["brand", "influencer"], // role of the reviewer
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

reviewSchema.index({ reviewee: 1, createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);
export default Review;
