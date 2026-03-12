import { AsyncHandler } from "../utils/Asynchandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { validationStatus } from "../utils/ValidationStatusCode.js";
import CollaborationRequest from "../models/collaborationRequestModel.js";
import Campaign from "../models/campaignModel.js";
import Activity from "../models/activityModel.js";
import Influencer from "../models/influencerModel.js";
import User from "../models/userModel.js";
import { uploadOnCloudinary } from "../config/cloudinary.js";
import mongoose from "mongoose";

const getInfluencerDashboard = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(validationStatus.notFound, "user not found");
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(validationStatus.badRequest, 'Invalid userId')
    }

    if (req.user.role !== "influencer") {
        throw new ApiError(validationStatus.forbidden, "Access Denied");
    }

    // find influencer profile
    // [MODIFIED to use aggregation pipeline as requested]
    const influencers = await Influencer.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $limit: 1 }
    ]);
    const influencer = influencers[0];

    if (!influencer) {
        throw new ApiError(validationStatus.notFound, "Influencer profile not found");
    }

    // statistics
    const stats = await CollaborationRequest.aggregate([
        {
            $match: { receiver: new mongoose.Types.ObjectId(userId) }
        },
        {
            $group: {
                _id: null,
                totalRequests: { $sum: 1 },
                pendingRequests: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "pending"] }, 1, 0]
                    }
                },
                acceptedRequests: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "accepted"] }, 1, 0]
                    }
                }
            }
        }
    ]);

    // recent activities
    // [MODIFIED to use aggregation pipeline as requested]
    const recentActivities = await Activity.aggregate([
        { $match: { user: userId, isDeleted: false } },
        { $sort: { createdAt: -1 } },
        { $limit: 5 }
    ]);


    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            stats: stats[0] || { totalRequests: 0, pendingRequests: 0, acceptedRequests: 0 },
            recentActivities,
            profile: influencer
        }, "Influencer dashboard fetched successfully")
    );


});


const getInfluencerProfile = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    // [MODIFIED to use aggregation pipeline as requested]
    const profiles = await Influencer.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $limit: 1 },
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $project: { "user.password": 0, "user.refreshToken": 0 } }
    ]);

    if (!profiles.length) {
        throw new ApiError(validationStatus.notFound, "Influencer profile not found");
    }
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { influencer: profiles[0] }, "Influencer profile fetched successfully")
    );
})

const updateInfluencerProfile = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const updateFields = { ...req.body };

    if (req.files?.profilePicture) {
        const upload = await uploadOnCloudinary(req.files.profilePicture[0].path);
        if (upload) updateFields.profilePicture = upload.url;
    }

    const updatedInfluencer = await Influencer.findOneAndUpdate(
        { user: userId },
        { $set: updateFields },
        { new: true }
    );
    
    // [MODIFIED to use aggregation pipeline for safe return]
    const profiles = await Influencer.aggregate([
        { $match: { _id: updatedInfluencer._id } },
        { $limit: 1 },
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $project: { "user.password": 0, "user.refreshToken": 0 } }
    ]);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { influencer: profiles[0] }, "Influencer profile updated successfully")
    );
})

// influencer search 
const getAllInfluencer = AsyncHandler(async (req, res) => {
    // get data from query parameters
    const {
        search,
        category,
        platform,
        minPrice,
        maxPrice,
        minFollowers,
        rating,
        location,
        page = 1,
        limit = 10,
        sort = "latest"
    } = req.query;

    const skip = (page - 1) * limit;

    const matchStage = { isAvailable: true };

    if (search) matchStage.username = { $regex: search, $options: "i" };
    if (category) matchStage.category = category;
    if (location) matchStage.location = { $regex: location, $options: "i" };
    if (rating) matchStage.averageRating = { $gte: Number(rating) };

    const result = await Influencer.aggregate([
        { $match: matchStage },
        { $unwind: "$platforms" },
        ...(platform ? [{ $match: { "platforms.name": platform } }] : []),
        ...(minFollowers ? [{ $match: { "platforms.followers": { $gte: Number(minFollowers) } } }] : []),
        { $unwind: "$platforms.services" },
        ...(minPrice || maxPrice ? [{
            $match: {
                "platforms.services.price": {
                    ...(minPrice ? { $gte: Number(minPrice) } : {}),
                    ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
                }
            }
        }] : []),
        {
            $group: {
                _id: "$_id",
                username: { $first: "$username" },
                profilePicture: { $first: "$profilePicture" },
                category: { $first: "$category" },
                averageRating: { $first: "$averageRating" },
                location: { $first: "$location" },
                platforms: { $push: "$platforms" },
                minPrice: { $min: "$platforms.services.price" },
            }
        },
        ...(sort === "rating_desc" ? [{ $sort: { averageRating: -1 } }] : []),
        ...(sort === "latest" ? [{ $sort: { createdAt: -1 } }] : []),
        {
            $facet: {
                data: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: "count" }],
            }
        },
    ]);

    const influencer = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            influencer,
            totalCount,
            page: Number(page),
            totalPages: Math.ceil(totalCount / limit),
        }, "Influencer fetched successfully")
    );
});

const getInfluencer = AsyncHandler(async (req, res) => {
    const { influencerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(influencerId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid influencerId");
    }

    const influencers = await Influencer.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(influencerId) } },
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $limit: 1 }
    ]);

    if (!influencers.length) {
        throw new ApiError(validationStatus.notFound, "Influencer not found");
    }

    const influencer = influencers[0];
    const totalFollowers = influencer.platforms.reduce((acc, p) => acc + (p.followers || 0), 0);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { influencer, totalFollowers }, "Influencer details fetched successfully")
    );
});

export {
    getInfluencerDashboard,
    getInfluencerProfile,
    updateInfluencerProfile,
    getAllInfluencer,
    getInfluencer
}