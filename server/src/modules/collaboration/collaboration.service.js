import Collaboration from './collaboration.model.js';
import Campaign from '../campaign/campaign.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { validationStatus } from '../../utils/ValidationStatusCode.js';
import mongoose from 'mongoose';
import { emitActivity } from '../../utils/activityUtils.js';
import User from '../user/user.model.js';
import Brand from '../brand/brand.model.js';
import Influencer from '../influencer/influencer.model.js';
import { socketManager } from '../../config/socketManager.js';
import Review from './review.model.js';
import { messageService } from '../message/message.service.js';
import { stripeService } from '../payment/stripe.service.js';

import { requestService } from './request.service.js';
import { deliverableService } from './deliverable.service.js';
import { actionService } from './action.service.js';

/**
 * Get all collaborations for a user
 */
const getCollaborations = async (userId, { status, page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;
    const objectUserId = new mongoose.Types.ObjectId(userId.toString());

    const matchStage = {
        isDeleted: false,
        status: { $nin: ["requested", "rejected"] },
        $or: [
            { brand: objectUserId },
            { influencer: objectUserId }
        ]
    };

    if (status && status !== "all") {
        matchStage.status = status;
    }

    const result = await Collaboration.aggregate([
        { $match: matchStage },
        { $sort: { createdAt: -1 } },
        // Join with Brand User
        {
            $lookup: {
                from: "users",
                localField: "brand",
                foreignField: "_id",
                as: "brandUser"
            }
        },
        { $unwind: "$brandUser" },
        // Join with Influencer User
        {
            $lookup: {
                from: "users",
                localField: "influencer",
                foreignField: "_id",
                as: "influencerUser"
            }
        },
        { $unwind: "$influencerUser" },
        // Join with Campaign
        {
            $lookup: {
                from: "campaigns",
                localField: "campaign",
                foreignField: "_id",
                as: "campaignDetails"
            }
        },
        { $unwind: { path: "$campaignDetails", preserveNullAndEmptyArrays: true } },
        // Join with Review
        {
            $lookup: {
                from: "reviews",
                localField: "review",
                foreignField: "_id",
                as: "reviewDetails"
            }
        },
        { $unwind: { path: "$reviewDetails", preserveNullAndEmptyArrays: true } },
        // Join with Influencer Review (Influencer's review of Brand)
        {
            $lookup: {
                from: "reviews",
                localField: "influencerReview",
                foreignField: "_id",
                as: "influencerReviewDetails"
            }
        },
        { $unwind: { path: "$influencerReviewDetails", preserveNullAndEmptyArrays: true } },
        // Project final structure
        {
            $project: {
                _id: 1,
                title: 1,
                status: 1,
                agreedBudget: 1,
                totalPaidAmount: 1,
                escrowFunded: 1,
                stripePaymentIntentId: 1,
                createdAt: 1,
                updatedAt: 1,
                brand: {
                    id: "$brandUser._id",
                    name: "$brandUser.fullname",
                    avatar: "$brandUser.profilePic"
                },
                influencer: {
                    id: "$influencerUser._id",
                    name: "$influencerUser.fullname",
                    username: "$influencerUser.username",
                    avatar: "$influencerUser.profilePic"
                },
                campaign: {
                    id: "$campaignDetails._id",
                    name: "$campaignDetails.name",
                    image: "$campaignDetails.image"
                },
                deliverablesSummary: {
                    total: {
                        $size: { $ifNull: ["$deliverables", []] }
                    },
                    completed: {
                        $size: {
                            $filter: {
                                input: { $ifNull: ["$deliverables", []] },
                                as: "d",
                                cond: { $in: ["$$d.status", ["APPROVED", "DELIVERED"]] }
                            }
                        }
                    }
                },
                deliverables: {
                    $map: {
                        input: { $ifNull: ["$deliverables", []] },
                        as: "d",
                        in: {
                            _id: "$$d._id",
                            title: "$$d.title",
                            status: "$$d.status",
                            dueDate: "$$d.dueDate",
                            priority: "$$d.priority",
                            allocatedBudget: "$$d.allocatedBudget",
                            paymentStatus: "$$d.paymentStatus",
                            isFinal: "$$d.isFinal"
                        }
                    }
                },
                startDate: 1,
                endDate: 1,
                paymentStatus: 1,
                review: "$reviewDetails",
                influencerReview: "$influencerReviewDetails"
            }
        },
        {
            $facet: {
                data: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: "count" }],
            },
        },
    ]);

    const collaborations = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return {
        collaborations,
        total: totalCount,
        page: Number(page),
        pages: Math.ceil(totalCount / limit),
    };
};

/**
 * Get single collaboration details
 */
const getCollaborationDetails = async (id, userId) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(validationStatus.badRequest, "Invalid collaboration ID");
    }

    const collaboration = await Collaboration.findOne({
        _id: id,
        isDeleted: false,
        $or: [
            { brand: userId },
            { influencer: userId }
        ]
    })
        .populate("brand", "fullname email profilePic")
        .populate("influencer", "fullname username email profilePic")
        .populate("campaign", "name description image platform endDate")
        .populate({ path: "review", model: "Review" })
        .populate({ path: "influencerReview", model: "Review" })
        .lean();

    if (!collaboration) {
        throw new ApiError(validationStatus.notFound, "Collaboration not found");
    }

    // --- PRODUCTION-LEVEL SELF-HEALING SYNC ---
    // If the project is 'awaiting_funds' or has no funding flag but has a Stripe Intent, verify it now.
    // This fixes the "Awaiting Funds" badge issue if status is stuck but payment is done.
    if ((collaboration.status === "awaiting_funds" || !collaboration.escrowFunded) && collaboration.stripePaymentIntentId) {
        try {
            console.log(`🔍 Production Sync: Verifying Stripe status for collaboration ${id}`);
            const paymentIntent = await stripeService.stripe.paymentIntents.retrieve(collaboration.stripePaymentIntentId);
            
            if (paymentIntent.status === 'succeeded') {
                console.log(`✅ Sync Success: Payment confirmed. Force-updating status to ACTIVE.`);
                // Update DB: Force both flag and status to be correct
                // We also trigger the handlePaymentIntentSucceeded logic if it hasn't run
                await stripeService.handlePaymentIntentSucceeded(paymentIntent);
                
                // Update local object for immediate response
                collaboration.escrowFunded = true;
                collaboration.status = "active";
            }
        } catch (err) {
            console.error("⚠️ Background sync failed:", err.message);
        }
    }

    // Fetch influencer profile for stats
    const Influencer = mongoose.model("Influencer");
    const influencerProfile = await Influencer.findOne({ user: collaboration.influencer._id }).select("followersCount platforms");

    return collaboration;
};

/**
 * Find the latest active collaboration between two users
 */
const getLatestCollaborationWithUser = async (userId, otherUserId) => {
    const collaboration = await Collaboration.findOne({
        isDeleted: false,
        $or: [
            { brand: userId, influencer: otherUserId },
            { brand: otherUserId, influencer: userId }
        ],
        status: { $in: ["active", "in_progress", "review"] }
    })
        .sort({ createdAt: -1 })
        .populate("brand", "fullname email profilePic")
        .populate("influencer", "fullname username email profilePic")
        .populate("campaign", "name description image platform endDate")
        .lean();

    if (!collaboration) return null;

    // Fetch influencer profile for stats
    const Influencer = mongoose.model("Influencer");
    const influencerProfile = await Influencer.findOne({ user: collaboration.influencer._id }).select("followersCount platforms");

    if (influencerProfile) {
        const mainPlatform = influencerProfile.platforms?.[0];
        collaboration.influencerStats = {
            followersCount: influencerProfile.followersCount || 0,
            engagementRate: mainPlatform?.influenceRate ? (mainPlatform.influenceRate * 1.2).toFixed(1) + "%" : "4.5%"
        };
    }

    return collaboration;
};

/**
 * Submit an influencer's review of a brand (post-completion)
 * Mirrors the brand review flow in completeCollaboration
 */
const submitInfluencerReview = async (collaborationId, userId, reviewData) => {
    const collaboration = await Collaboration.findById(collaborationId).populate("brand influencer");
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    // Only the influencer can submit this review
    const isInfluencer = collaboration.influencer._id.toString() === userId.toString();
    if (!isInfluencer) {
        throw new ApiError(validationStatus.forbidden, "Only influencers can review brands");
    }

    // Only on completed collaborations
    if (collaboration.status !== "completed") {
        throw new ApiError(validationStatus.badRequest, "Can only review after collaboration is completed");
    }

    // Prevent duplicate reviews
    if (collaboration.influencerReview) {
        throw new ApiError(validationStatus.badRequest, "You have already reviewed this brand");
    }

    // Secondary check for duplicate review to avoid race conditions
    const existingReview = await Review.findOne({ collaboration: collaborationId, role: "influencer" });
    if (existingReview) {
        throw new ApiError(validationStatus.badRequest, "You have already reviewed this brand");
    }

    if (!reviewData || !reviewData.rating) {
        throw new ApiError(validationStatus.badRequest, "Rating is required");
    }

    // Create the review (mirrors brand review creation in completeCollaboration)
    const review = await Review.create({
        reviewer: userId,                       // the influencer
        reviewee: collaboration.brand._id,      // the brand
        collaboration: collaboration._id,
        rating: reviewData.rating,
        comment: reviewData.comment || "",
        role: "influencer"                       // reviewer's role
    });

    // Link review to collaboration
    collaboration.influencerReview = review._id;
    await collaboration.save();

    // Recalculate Brand rating & reviewsCount (mirrors influencer rating recalc)
    const brandProfile = await Brand.findOne({ user: collaboration.brand._id });
    if (brandProfile) {
        const allBrandReviews = await Review.find({ reviewee: collaboration.brand._id, role: "influencer" });
        const avg = allBrandReviews.reduce((acc, r) => acc + r.rating, 0) / allBrandReviews.length;
        brandProfile.rating = parseFloat(avg.toFixed(1));
        brandProfile.reviewsCount = allBrandReviews.length;
        await brandProfile.save();
    }

    // Notify the brand
    await emitActivity({
        user: collaboration.brand._id,
        role: "brand",
        type: "influencer_review_received",
        title: "New Review Received",
        description: `An influencer has left a ${reviewData.rating}-star review on your collaboration.`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    // Return updated collaboration with populated review
    return await Collaboration.findById(collaborationId)
        .populate("brand", "fullname email profilePic")
        .populate("influencer", "fullname username email profilePic")
        .populate("campaign", "name description image platform endDate")
        .populate({ path: "review", model: "Review" })
        .populate({ path: "influencerReview", model: "Review" })
        .lean();
};

export const collaborationService = {
  ...requestService,
  ...deliverableService,
  ...actionService,
  ...{ getCollaborations, getCollaborationDetails, getLatestCollaborationWithUser, submitInfluencerReview },
  deliverable_updated: (collaboration, deliverable) => {
        const data = { collaborationId: collaboration._id, deliverableId: deliverable._id, status: deliverable.status };
        socketManager.emitToUsers([collaboration.brand, collaboration.influencer], 'deliverable_updated', data);
  }
};
