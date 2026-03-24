import { AsyncHandler } from "../utils/Asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { validationStatus } from "../utils/ValidationStatusCode.js";
import Brand from './../models/brandModel.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import Campaign from "../models/campaignModel.js";
import CollaborationRequest from './../models/collaborationRequestModel.js';
import mongoose from 'mongoose';
import Activity from "../models/activityModel.js";
import Influencer from "../models/influencerModel.js";
import User from "../models/userModel.js";
import { uploadOnCloudinary } from "../config/cloudinary.js";

// brand dashboard endpoints

const getBrandDashboard = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(validationStatus.notFound, "user not found");
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(validationStatus.badRequest, 'Invalid userId')
    }

    if (req.user.role !== "brand") {
        throw new ApiError(validationStatus.forbidden, "Access Denied");
    }
    // Get brand profile
    const brand = await Brand.findOne({ user: userId }).select("_id").lean();
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }
    const brandId = brand._id;
    // =============Campaign stats Aggregation
    const campaignStats = await Campaign.aggregate([
        {
            $match: { brand: brandId },
        },
        {
            $group: {
                _id: null,
                totalCampaigns: { $sum: 1 },
                activeCampaigns: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "active"] }, 1, 0],
                    },
                },
                completedCampaigns: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "completed"] }, 1, 0]
                    },
                },
            },
        },
    ]);

    // collaboration Stats===============//

    const collaborationStats = await CollaborationRequest.aggregate([
        {
            $match: { sender: userId },
        },
        {
            $group: {
                _id: null,
                totalRequests: { $sum: 1 },
                acceptedRequests: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "accepted"] }, 1, 0],
                    },
                },
                pendingRequests: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
                    },
                },
                totalInfluencersContacted: {
                    $addToSet: "$receiver",
                },
            },
        },
        {
            $project: {
                totalRequests: 1,
                acceptedRequests: 1,
                pendingRequests: 1,
                totalInfluencersContacted: {
                    $size: "$totalInfluencersContacted",
                },
            },
        },
    ]);
    // Recent Campaigns =========================//
    // [MODIFIED to use aggregation pipeline as requested]
    const recentCampaigns = await Campaign.aggregate([
        { $match: { brand: brandId } },
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
        { $project: { title: 1, status: 1, createdAt: 1 } }
    ]);


    // safe default 
    const campaignData = campaignStats[0] || {
        totalRequests: 0,
        acceptedRequests: 0,
        pendingRequests: 0,
        totalInfluencersContacted: 0,
    };

    const collaborationData = collaborationStats[0] || {
        totalRequests: 0,
        activeCampaigns: 0,
        completedCampaigns: 0,
    };

    // final Response //
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            ...campaignData,
            ...collaborationData,
            recentCampaigns,
        },
            "Brand dashboard fetched successfully")
    );
});


const getBrandActivity = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;

    // validation user
    if (!userId) {
        throw new ApiError(validationStatus.notFound, "user not found");
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(validationStatus.badRequest, 'Invalid userId')
    }

    if (req.user.role !== "brand") {
        throw new ApiError(validationStatus.forbidden, "Access Denied");
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Aggregation pipeline to get activities with pagination and total count
    // if don't use aggregation we need to run two separate queries one for data and other
    //  for count which is not efficient so we are using aggregation with facet to get
    //  data and count in single query
    const activities = await Activity.aggregate([
        {
            $match: {
                user: userId,
                isDeleted: false,
            }
        },
        // used to sort data by createdAt in descending order to get latest activities first
        // if dont use sort their first it will return data in random order which is not good for user experience
        {
            $sort: { createdAt: -1 }
        },
        // facet is used to get data and total count in single query
        // without facet we need to run two separate queries one for 
        // data and other for count which is not efficient
        {
            $facet: {
                data: [
                    { $skip: skip },
                    { $limit: limit },
                ],
                totalCount: [
                    { $count: "count" }
                ],
                unreadCount: [
                    {
                        $match: { isRead: false },
                    },
                    {
                        $count: "count",
                    },
                ],
            }
        }
    ])

    // result will be in array form because of aggregation and facet so we need to 
    // get first element of array if data is present otherwise we will return default value
    //  which is empty array and count as 0

    const result = activities[0] || {
        data: [],
        totalCount: [{ count: 0 }],
        unreadCount: [{ count: 0 }],
    };

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            activities: result.data,
            total: result.totalCount[0]?.count || 0,
            unreadCount: result.unreadCount[0]?.count || 0,
            page: Number(page),
            pages: Math.ceil((result.totalCount[0]?.count || 0) / limit)
        },
            "Brand activities fetched successfully")
    );


})

// profile settings
const getBrandProfile = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    // [MODIFIED to use aggregation pipeline as requested]
    const brandProfiles = await Brand.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $limit: 1 },
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $project: { "user.password": 0, "user.refreshToken": 0 } }
    ]);

    if (!brandProfiles.length) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { brand: brandProfiles[0] }, "Brand profile fetched successfully")
    );
})

const updateBrandProfile = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const updateFields = { ...req.body };
    if (req.files?.logo) {
        const logoUpload = await uploadOnCloudinary(req.files.logo[0].path);
        if (logoUpload) updateFields.logo = logoUpload.url;
    }
    // [MODIFIED to use aggregation pipeline for return as requested]
    const brand = await Brand.findOneAndUpdate({ user: userId }, { $set: updateFields }, { new: true });
    
    const brandProfiles = await Brand.aggregate([
        { $match: { _id: brand._id } },
        { $limit: 1 },
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $project: { "user.password": 0, "user.refreshToken": 0 } }
    ]);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { brand: brandProfiles[0] }, "Brand profile updated successfully")
    );
})

const changeBrandPassword = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { currentPassword, newPassword } = req.body;
    const userInstance = await User.findById(userId);
    if (!userInstance) {
        throw new ApiError(validationStatus.notFound, "User not found");
    }

    if (!await userInstance.isPasswordCorrect(currentPassword)) {
        throw new ApiError(validationStatus.badRequest, "Current password incorrect");
    }
    userInstance.password = newPassword;
    await userInstance.save();
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Password changed successfully")
    );
})

const markActivityStatus = AsyncHandler(async (req, res) => {
    const { activityId } = req.params;
    await Activity.findByIdAndUpdate(activityId, { isRead: true });
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Activity marked as read")
    );
})

const deleteNotification = AsyncHandler(async (req, res) => {
    const { activityId } = req.params;
    await Activity.findByIdAndUpdate(activityId, { isDeleted: true, deletedAt: new Date() });
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Notification deleted successfully")
    );
})

// influencer search 
export {
    getBrandDashboard,
    getBrandProfile,
    updateBrandProfile,
    changeBrandPassword,
    getBrandActivity,
    markActivityStatus,
    deleteNotification
}