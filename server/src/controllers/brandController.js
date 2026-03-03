import { AsyncHandler } from "../utils/Asynchandler.js";
import { ApiError } from "../utils/ApiError.js"
import { validationStatus } from "../utils/ValidationStatusCode.js";
import Brand from './../models/brandModel.js';
import { ApiResponse } from '../utils/ApiResponse.js'
import Campaign from "../models/campaignModel.js";
import CollaborationRequest from './../models/collaborationRequestModel.js';
import { mongoose } from 'mongoose';
import Activity from "../models/activityModel.js";
import Influencer from "../models/influencerModel.js";

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
    const brand = await Brand.findOne({ user: userId });
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
                        $cond: [{ $eq: ["$status"] }]
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
                    $size: "totalInfluencersContacted",
                },
            },
        },
    ]);
    // Recent Campaigns =========================//
    const recentCampaigns = await Campaign.find({ brand: brandId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title status createdAt");


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
            totalCount: result.totalCount[0].count,
            unreadCount: result.unreadCount[0].count,
        },
            "Brand activities fetched successfully")
    );


})


// campaign endpoints
const createCampaign = AsyncHandler(async (req, res) => {

    const userId = req.user?._id;
    const role = req.user?.role;

    // validation user
    if (!userId) {
        throw new ApiError(validationStatus.unauthorized, "Unauthorized access");
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(validationStatus.badRequest, 'Invalid userId')
    }

    // only brand can create campaign so we need to check role of user if its not brand then we will return error
    if (role !== "brand") {
        throw new ApiError(validationStatus.forbidden, "Access Denied");
    }

    const brand = await Brand.findOne({ user: userId });

    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    // get input data from body
    const {
        title,
        description,
        budget,
        targetCategory,
        targetPlatform,
        campaignTimeline,
        campaignRequirements
    } = req.body;

    // validate required fields
    if (!title?.trim())
        if (!campaignRequirements?.deliverables?.trim())
            if (!campaignRequirements?.targetAudience?.trim())
                throw new ApiError(validationStatus.badRequest, "Title, deliverables and target audience are required");


    // validate budget range if provided
    if (budget?.min < 0 || budget?.max < 0)
        if (budget?.min > budget?.max)
            throw new ApiError(validationStatus.badRequest, "Invalid budget range");



    // check if campaign with same title already exists for the brand to avoid duplicate
    //  campaign title for same brand which can create confusion for influencer and also 
    // for brand itself
    const existingCampaign = await Campaign.findOne({
        brand: brand._id,
        title: title.trim()
    });
    if (existingCampaign) {
        throw new ApiError(validationStatus.conflict, "Campaign with the same title already exists");
    }


    // create new campaign
    const campaign = await Campaign.create({
        brand: brand._id,
        title: title.trim(),
        description: description?.trim() || "",
        budget: {
            min: budget?.min || 0,
            max: budget?.max || 0,
        },
        targetCategory: targetCategory || [],
        targetPlatform: targetPlatform || [],
        campaignTimeline: campaignTimeline || "",
        campaignRequirements: {
            deliverables: campaignRequirements.deliverables.trim(),
            targetAudience: campaignRequirements.targetAudience.trim(),
            additionalRequirements: campaignRequirements.additionalRequirements?.trim() || "",
        },
    });

    // log Activity / for notification 
    // we can create separate function for logging activity to avoid code duplication
    //  and also to make code more clean and maintainable
    await Activity.create({
        user: req.user._id,
        role: "brand",
        type: "campaign_created",
        title: "Campaign Created",
        description: `${campaign.title} campaign was created`,
        relatedId: campaign._id
    });


    // final response
    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, {
            campaign: Campaign
        },
            "Campaign created successfully")
    );


})

const getAllCampaigns = AsyncHandler(async (req, res) => {

    const userId = req.user?._id;

    // find brand
    const brand = await Brand.findOne({ user: userId });
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    // query parameter
    const {
        page = 1,
        limit = 10,
        status,
        search,
        sort = "newest",
        minBudget,
        maxBudget,
    } = req.query;

    const Skip = (page - 1) * limit;

    // build dynamic match filter  for to only show that brand campaign and also filter based on status
    //  if provided and also search filter for title and budget filter for min and max budget if provided
    const matchStage = {
        brand: new mongoose.Types.ObjectId(brand._id)

    }


    if (status) {
        matchStage.status = status
    }

    //  search filter to filter campaign based on title using regex for partial match
    //  and case insensitive search if search query is provided if search query is no
    // t provided then it will return all campaigns of brand without any filter
    if (search) {
        matchStage.title = { $regex: search, $options: "i" }
    }

    // if minBudget or maxBudget is provided then we will add budget filter to match stage
    //  to filter campaigns based on budget range
    if (minBudget || maxBudget) {
        matchStage["budget.min"] = {};
        if (minBudget) matchStage["budget.min"].$gte = Number(minBudget);
        if (maxBudget) matchStage["budget.max"] = { $lte: Number(maxBudget) };
    }

    // sorting logic 
    const sortStage =
        sort === "oldest"
            ? { createdAt: 1 }
            : { createdAt: -1 };

    // aggregation pipeline
    const result = await Campaign.aggregate([
        // match stage to filter data based on query parameters
        { $match: { ...matchStage, isDeleted: false } },
        { $sort: sortStage },
        {
            // facet is used to get data and total count in single query without facet we need
            //  to run two separate queries one for data and other for count which is not efficient
            $facet: {
                campaigns: [
                    { $skip: Number(Skip) },
                    { $limit: Number(limit) },
                ],
                totalCount: [
                    { $count: "count" },
                ],
                // stats stage to get campaign stats like total campaigns, active, completed,
                //  closed and total budget of campaigns for the brand
                stats: [
                    {
                        // group stage to group data and get stats for the brand campaigns we are using 
                        // conditional sum to get count of active, completed and closed campaigns
                        // used to grouped all in one object 
                        $group: {
                            _id: null,
                            totalCampaigns: { $sum: 1 },
                            // it counts active, completed and closed campaigns by checking status field and using
                            //  conditional sum to get count for each status
                            active: {
                                $sum: {
                                    $cond: [{ $eq: ["$status", "active"] }, 1, 0],
                                },
                            },
                            completed: {
                                $sum: {
                                    $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
                                },
                            },
                            closed: {
                                $sum: {
                                    $cond: [{ $eq: ["$status", "closed"] }, 1, 0],
                                },
                            },
                            totalBudget: {
                                $sum: "$budget.max",
                            },
                        },
                    },
                ],
            },
        },
    ]);

    // final fields 
    const campaigns = result[0].campaigns || [];
    const totalCount = result[0].totalCount[0]?.count || 0;
    const stats = result[0].stats[0] || {
        totalCampaigns: 0,
        active: 0,
        completed: 0,
        closed: 0,
        totalBudget: 0,
    };

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            campaigns,
            totalCount,
            stats,
        },
            "Campaigns fetched successfully")
    );


})

const getCampaign = AsyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { campaignId } = req.params;

    // validate campaignId
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid campaignId");
    }

    // find brand
    const brand = await Brand.findOne({ user: userId });
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    // aggregate pipeline to get campaign details along with stats like total
    //  collaboration requests, accepted requests, pending requests and also 
    // get influencer details who sent collaboration request for the campaign
    const campaign = await Campaign.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(campaignId),
                brand: brand._id, // ownership protection
            },
        },
        // lookup stage to get collaboration requests for the campaign and also
        //  get influencer details who sent the request
        {
            $lookup: {
                from: "brands",
                localField: "brand",
                foreignField: "_id",
                as: "brand",
            },
        },
        // lookup gave us an array object so  used unwind to convert it into single object
        //  for easy access in frontend and also to avoid confusion
        {
            $unwind: "$brand",
        },
        // project stage to select required fields and also to calculate stats for the
        //  campaign like total 
        {
            $project: {
                title: 1,
                description: 1,
                budget: 1,
                targetCategory: 1,
                targetPlatform: 1,
                campaignTimeline: 1,
                campaignRequirements: 1,
                status: 1,
                createdAt: 1,
                updatedAt: 1,
                "brand._id": 1,
                "brand.brandname": 1,
                "brand.logo": 1,
                "brand.industry": 1,
            },
        },
    ]);

    if (campaign.length === 0 || !campaign[0]) {
        throw new ApiError(validationStatus.notFound, "Campaign not found");
    }

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            campaign: campaign[0],
        },
            "Campaign details fetched successfully")
    );


})

const updateCampaign = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { campaignId } = req.params;

    // validate user and campaignId
    if (!userId)
        throw new ApiError(validationStatus.unauthorized, "Unauthorized");

    if (req.user.role !== "brand")
        throw new ApiError(validationStatus.forbidden, "Access denied");

    if (!mongoose.Types.ObjectId.isValid(campaignId))
        throw new ApiError(validationStatus.badRequest, "Invalid campaignId");

    // find brand for ownership protection and also to get brandId for querying campaign
    const brand = await Brand.findOne({ user: userId });
    if (!brand)
        throw new ApiError(validationStatus.notFound, "Brand not found");

    // find campaign and also check if campaign belongs to the brand for ownership protection
    const existingCampaign = await Campaign.findOne({
        _id: campaignId,
        brand: brand._id,
    });

    if (!existingCampaign)
        throw new ApiError(validationStatus.notFound, "Campaign not found");

    if (existingCampaign.status === "completed")
        throw new ApiError(validationStatus.badRequest, "Cannot update completed campaign");

    // build update fields object dynamically based on provided fields in request body
    const updateFields = {};
    const {
        title,
        description,
        budget,
        targetCategory,
        targetPlatform,
        campaignTimeline,
        campaignRequirements,
        status,
    } = req.body;

    // only update fields which are provided in request body to avoid overwriting existing 
    // data with undefined
    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;

    if (budget !== undefined) {
        if (budget.min < 0 || budget.max < budget.min)
            throw new ApiError(validationStatus.badRequest, "Invalid budget");
        updateFields.budget = budget;
    }

    if (targetCategory !== undefined)
        updateFields.targetCategory = targetCategory;

    if (targetPlatform !== undefined)
        updateFields.targetPlatform = targetPlatform;

    if (campaignTimeline !== undefined)
        updateFields.campaignTimeline = campaignTimeline;

    if (campaignRequirements !== undefined)
        updateFields.campaignRequirements = campaignRequirements;

    if (status !== undefined)
        updateFields.status = status;

    // update campaign with new fields and also get updated campaign details in
    //  response by setting new: true
    const updatedCampaign = await Campaign.findByIdAndUpdate(
        campaignId,
        { $set: updateFields },
        { new: true }
    );

    // log Activity / for notification
    await Activity.create({
        user: userId,
        role: "brand",
        type: "campaign_updated",
        title: "Campaign Updated",
        description: `Campaign "${updatedCampaign.title}" updated`,
        relatedId: updatedCampaign._id,
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(
            validationStatus.ok,
            updatedCampaign,
            "Campaign updated successfully"
        )
    );
});

const deleteCampaign = AsyncHandler(async (req, res) => {

    // validate  user
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(validationStatus.unauthorized, "Unauthorized access");
    }

    if (req.user.role !== "brand") {
        throw new ApiError(validationStatus.forbidden, "Access denied");
    }

    // validate campaignId
    const { campaignId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid campaignId");
    }

    // find brand profile
    const brand = await Brand.findOne({ user: userId });

    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    // find campaign with ownership protection to make sure that brand can only 
    // delete its own campaign    

    const campaign = await Campaign.findOne({
        _id: campaignId,
        brand: brand._id,
        isDeleted: false,
    });

    if (!campaign) {
        throw new ApiError(
            validationStatus.notFound,
            "Campaign not found or already deleted"
        );
    }

    // check completed campaign
    if (campaign.status === "completed") {
        throw new ApiError(
            validationStatus.badRequest,
            "Completed campaigns cannot be deleted"
        );
    }

    // soft delete
    campaign.isDeleted = true;
    campaign.deletedAt = new Date();
    await campaign.save();

    // activity log for campaign deletion
    await Activity.create({
        user: userId,
        role: "brand",
        type: "campaign_deleted",
        title: "Campaign Deleted",
        description: `Campaign "${campaign.title}" was deleted`,
        relatedId: campaign._id,
    });

    // 8️⃣ Response
    return res.status(validationStatus.ok).json(
        new ApiResponse(
            validationStatus.ok,
            {},
            "Campaign deleted successfully"
        )
    );


})

const campaignStatus = AsyncHandler(async (req, res) => {

    //  Auth check
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(validationStatus.unauthorized, "Unauthorized access");
    }

    if (req.user.role !== "brand") {
        throw new ApiError(validationStatus.forbidden, "Access denied");
    }

    //  Validate campaignId
    const { campaignId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid campaignId");
    }

    //  Validate status
    const allowedStatuses = ["active", "closed", "completed"];

    if (!status || !allowedStatuses.includes(status)) {
        throw new ApiError(validationStatus.badRequest, "Invalid status value");
    }

    //  Get brand
    const brand = await Brand.findOne({ user: userId });

    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    //  Find campaign with ownership protection
    const campaign = await Campaign.findOne({
        _id: campaignId,
        brand: brand._id,
        isDeleted: false,
    });

    if (!campaign) {
        throw new ApiError(
            validationStatus.notFound,
            "Campaign not found or access denied"
        );
    }

    //  Prevent invalid transitions
    if (campaign.status === "completed") {
        throw new ApiError(
            validationStatus.badRequest,
            "Completed campaign status cannot be changed"
        );
    }

    if (campaign.status === status) {
        throw new ApiError(
            validationStatus.badRequest,
            "Campaign already has this status"
        );
    }

    //  Update status
    campaign.status = status;
    await campaign.save();

    //  Log Activity
    await Activity.create({
        user: userId,
        role: "brand",
        type: "campaign_updated",
        title: "Campaign Status Updated",
        description: `Campaign "${campaign.title}" status changed to "${status}"`,
        relatedId: campaign._id,
    });

    //  Response
    return res.status(validationStatus.ok).json(
        new ApiResponse(
            validationStatus.ok,
            { campaign },
            "Campaign status updated successfully"
        )
    );
})


// influencer search 
const getAllInfluencer = AsyncHandler(async (req, res) => {
    //search influencer filter  
    // This endpoint powers:

    //  Search influencer
    //  Filter by category
    //  Filter by platform
    //  Filter by price range
    //  Filter by rating
    //  Filter by location
    //  Pagination
    //  Sorting

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

    // pagination
    const skip = (page - 1) * limit;

    // 
    const matchStage = {
        isAvailable: true, // only show available influencer   
    };

    //  Search by username
    if (search) {
        matchStage.username = { $regex: search, $options: "i" };
    }

    // Filter by category
    if (category) {
        matchStage.category = category;
    }

    // filter location
    if (location) {
        matchStage.location = { $regex: location, $options: "i" };
    }

    // filter by average rating greater than or equal to provided rating
    if (rating) {
        matchStage.averageRating = { $gte: Number(rating) };
    }

    const result = await Influencer.aggregate([

        {
            $match: matchStage,
        },
        {
            // unwind platforms array to filter influencer based on platform and also to sort by price for specific platform
            $unwind: "$platforms",
        },


        // !NOTE : Used spread operator to conditionally add match stages for platform, 
        //         followers and price range filters based on provided query parameters . 
        //         Dynamically adding aggregation stages only if filter exists.

        // filter by Only documents with platform name matching the provided platform will be included in the results.
        // If no platform selected → this stage is skipped.
        // This is dynamic stage.

        // its platform filter
        ...(platform ? [{
            $match: { "platforms.name": platform }
        }] : []),

        // Followers filter
        ...(minFollowers ? [{
            $match: { "platforms.followers": { $gte: Number(minFollowers) } }
        }] : []),

        // unwind services 
        {
            $unwind: "$platforms.services",
        },

        // price filter for specific platform
        ...(minPrice || maxPrice ? [{
            $match: {
                "platforms.services.price": {
                    ...(minPrice ? { $gte: Number(minPrice) } : {}),
                    ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
                }
            }
        }] : []),

        // group back to influencer level after filtering and also calculate min price for sorting
        // What this does:
        //         Group all split documents back by influencer id.
        //         $first → take first value
        //         $push → collect platforms into array
        //         So we rebuild influencer object.
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

        // sorting logic based on sort query parameter if sort is rating_desc then sort by averageRating
        //  in descending order if sort is latest then sort by createdAt in descending order 
        // if no sort provided then default sorting will be by latest
        ...(sort === "rating_desc" ? [{ $sort: { averageRating: -1 } }] : []),
        ...(sort === "latest" ? [{ $sort: { createdAt: -1 } }] : []),


        // facet stage to get data and total count in single query for pagination
        //  if we use separate query for count then it will be inefficient because 
        // we need to run two queries one for data and other for count but with facet
        //  we can get both in single query
        {
            $facet: {
                data: [
                    { $skip: skip },
                    { $limit: Number(limit) },
                ],
                // counts total documents
                totalCount: [
                    { $count: "count" }
                ],
            }
        },
    ])

    // final response fields with safe default values if data is not present in result
    const influencer = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            influencer,
            totalCount,
            page: Number(page),
            totalPages: Math.ceil(totalCount / limit),  // calculate total pages based on total count and limit
        },
            "Influencer fetched successfully")
    );


})


const getInfluencer = AsyncHandler(async (req, res) => {

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(validationStatus.unauthorized, "Unauthorized access");
    }

    if (req.user.role !== "brand") {
        throw new ApiError(validationStatus.forbidden, "Access denied");
    }


    const { influencerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(influencerId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid influencerId");
    }


    const influencer = await Influencer.findById(influencerId)
        .populate("user", "email fullname avatar")
        .lean();


    if (!influencer) {
        throw new ApiError(validationStatus.notFound, "Influencer not found");
    }

    // Calculate total followers
    const totalFollowers = influencer.platforms.reduce(
        (acc, platform) => acc + (platform.followers || 0),
        0
    );

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            influencer,
            totalFollowers
        },
            "Influencer details fetched successfully")
    );

})



// collaboration req
const sendCollaborationRequest = AsyncHandler(async (req, res) => {

    const userId = req.user._id

    if (!userId) {
        throw new ApiError(validationStatus.unauthorized, 'Unauthorized request')
    }

    if (req.user.role !== "brand") {
        throw new ApiError(validationStatus.forbidden, "Access denied")
    }

    const { influencerId, campaignId, note, proposedBudget } = req.body;

    if (
        !mongoose.Types.ObjectId.isValid(influencerId) ||
        !mongoose.Types.ObjectId.isValid(campaignId)
    ) {
        throw new ApiError(validationStatus.badRequest, "Invalid IDs provided");
    }

    // find brand
    const brand = await Brand.findOne({ user: userId });
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    // find campaign with ownership protection
    const campaign = await Campaign.findOne({
        _id: campaignId,
        brand: brand._id,
        isDeleted: false,
    });

    if (!campaign) {
        throw new ApiError(validationStatus.notFound, "Campaign not found or access denied");
    }

    // find influencer
    const influencer = await Influencer.findById(influencerId);
    if (!influencer) {
        throw new ApiError(validationStatus.notFound, "Influencer not found");
    }

    // check if collaboration request already exists for the same campaign and influencer to avoid duplicate requests
    const existingRequest = await CollaborationRequest.findOne({
        sender: userId,
        receiver: influencer.user,
        campaign: campaignId,
        status: { $in: ["pending", "accepted"] }, // check only pending and accepted requests to allow new request if previous was rejected
    });

    // used this technique if the request is already cancelled or rejected than allowed to send it again
    if (existingRequest) {

        if (existingRequest.status === "pending") {
            throw new ApiError(validationStatus.badRequest, "Request already pending");
        }

        if (existingRequest.status === "accepted") {
            throw new ApiError(validationStatus.badRequest, "Collaboration already accepted");
        }

        // If rejected or cancelled → reset request
        existingRequest.status = "pending";
        existingRequest.proposedBudget = proposedBudget || null;
        existingRequest.note = note || "";
        existingRequest.respondedAt = null;

        await existingRequest.save();

        return res.status(validationStatus.ok).json(
            new ApiResponse(validationStatus.ok, { request: existingRequest }, "Request re-sent successfully")
        );
    }

    // create collaboration request
    const collaborationRequest = await CollaborationRequest.create({
        sender: userId,
        receiver: influencer.user,
        campaign: campaignId,
        note: note?.trim() || "",
        proposedBudget: proposedBudget || 0,
    });

    // log activity for sending collaboration request
    await Activity.create({
        user: userId,
        role: "brand",
        type: "collaboration_request_sent",
        title: "Collaboration Request Sent",
        description: `Collaboration request sent to ${influencer.username} for campaign "${campaign.title}"`,
        relatedId: collaborationRequest._id,
    });

    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, {
            collaborationRequest,
        },
            "Collaboration request sent successfully")
    );

})


const getAllCollaborationRequest = AsyncHandler(async (req, res) => {

    // validate user 
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(validationStatus.unauthorized, 'Unauthorized Access')
    }

    if (req.user._id !== "brand") {
        throw new ApiError(validationStatus.forbidden, 'Access Denied')
    }

    const brand = await Brand.findOne({ user: userId });

    if (!brand) {
        throw new ApiError(validationStatus.notFound, 'Brand not found')
    }

    // get data from frontend user
    const { page = 1, limit = 10, status, search } = req.query;

    // pagination 
    const skip = (page - 1) * limit;

    // match the collaboration 
    const matchStage = {
        sender: userId
    };

    const result = await CollaborationRequest.aggregate([

        { $match: matchStage },

        //join influencer info
        {
            $lookup: {
                from: 'users',
                localField: 'receiver',
                foreignField: '_id',
                as: "influencerUser"
            }
        },

        { $unwind: 'influencerUser' },

        // join campaign info
        {
            $lookup: {
                from: 'campaigns',
                localField: 'campaignRelated',
                foreignField: '_id',
                as: 'campaign'
            }
        },

        { $unwind: 'campaign' },


        // search filter for influencer username and campaign title

        ...(search ? [{
            $match: {
                "influencerUser.fullname": { $regex: search, $options: "i" },
                "campaign.title": { $regex: search, $options: "i" }
            }
        }] : []),

        { $sort: { createdAt: -1 } },


        {
            $facet: {
                data: [
                    { $skip: skip },
                    { $limit: Number(limit) },
                ],
                totalCount: [
                    { $count: "count" }
                ],
                stats: [
                    {
                        $group: {
                            id: '$status',
                            count: { $sum: 1 }  // 
                        }
                    }
                ]
            }
        }
    ])

    const collaborationRequests = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;


    const stats = result[0].stats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
    }, {});

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            collaborationRequests,
            totalCount,
            stats,
            page: Number(page),
            totalPages: Math.ceil(totalCount / limit),
        },
            "Collaboration requests fetched successfully")
    );




})


const getCollaborationRequest = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(validationStatus.unauthorized, "Unauthorized access");
    }

    if (req.user.role !== "brand") {
        throw new ApiError(validationStatus.forbidden, "Access denied");
    }

    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid requestId");
    }

    // find collaboration request with ownership protection to make sure that brand can only access its own requests

    const request = await CollaborationRequest.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(requestId),
                sender: userId
            }
        },

        // Join influencer user
        {
            $lookup: {
                from: "users",
                localField: "receiver",
                foreignField: "_id",
                as: "influencerUser"
            }
        },
        { $unwind: "$influencerUser" },

        // Join influencer profile
        {
            $lookup: {
                from: "influencers",
                localField: "receiver",
                foreignField: "user",
                as: "influencerProfile"
            }
        },
        { $unwind: "$influencerProfile" },

        // Join campaign
        {
            $lookup: {
                from: "campaigns",
                localField: "campaignRelated",
                foreignField: "_id",
                as: "campaign"
            }
        },
        { $unwind: "$campaign" },

        {
            // data shaping for response to include influencer details and campaign details in single
            //  response object for easy access in frontend instead of making multiple api calls 
            // to get influencer and campaign details
            $project: {
                status: 1,
                proposedBudget: 1,
                note: 1,
                createdAt: 1,
                respondedAt: 1,

                influencer: {
                    fullname: "$influencerUser.fullname",
                    profilePic: "$influencerUser.profilePic",
                    email: "$influencerUser.email",
                    category: "$influencerProfile.category",
                    platforms: "$influencerProfile.platforms",
                    portfolio: "$influencerProfile.portfolio",
                    averageRating: "$influencerProfile.averageRating"
                },

                campaign: {
                    title: "$campaign.title",
                    description: "$campaign.description",
                    budget: "$campaign.budget",
                    status: "$campaign.status"
                }
            }
        }
    ])

    if (request.length === 0 || !request[0]) {
        throw new ApiError(validationStatus.notFound, "Collaboration request not found");
    }

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            request: request[0],
        },
            "Collaboration request details fetched successfully")
    );
})


const cancelCollaborationRequest = AsyncHandler(async (req, res) => {
    // cancel req if pending

    const { requestId } = req.params;
    const userId = req.user?._id;

    //  Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid request ID");
    }

    //  Find request
    const request = await CollaborationRequest.findById(requestId);

    if (!request) {
        throw new ApiError(validationStatus.notFound, "Request not found");
    }

    //  Authorization check
    if (
        request.sender.toString() !== userId.toString() &&
        request.receiver.toString() !== userId.toString()
    ) {
        throw new ApiError(
            validationStatus.forbidden,
            "You are not authorized to cancel this request"
        );
    }

    //  Prevent invalid state changes
    if (request.status === "cancelled") {
        throw new ApiError(
            validationStatus.badRequest,
            "Request is already cancelled"
        );
    }

    if (request.status === "rejected") {
        throw new ApiError(
            validationStatus.badRequest,
            "Rejected request cannot be cancelled"
        );
    }

    //  Update status to cancelled
    request.status = "cancelled";
    request.respondedAt = new Date();
    await request.save();

    //  Log Activity
    await Activity.create({
        user: userId,
        role: "brand",
        type: "collaboration_request_cancelled",
        title: "Collaboration Request Cancelled",
        description: `Collaboration request for campaign "${request.campaignRelated}" was cancelled`,
        relatedId: request._id,
    });

    //  Response
    return res.status(validationStatus.ok).json(
        new ApiResponse(
            validationStatus.ok,
            { request },
            "Collaboration request cancelled successfully"
        )
    );
})



// profile settings
const getBrandProfile = AsyncHandler(async (req, res) => {
})

const updateBrandProfile = AsyncHandler(async (req, res) => {
    // patch method
})
const changeBrandPassword = AsyncHandler(async (req, res) => {
})

const updateSocialLinks = AsyncHandler(async (req, res) => {
})


// Activity or Notification endpoints
const getBrandNotification = AsyncHandler(async (req, res) => {

})
const markActivityStatus = AsyncHandler(async (req, res) => {
})
const deleteNotification = AsyncHandler(async (req, res) => {
    // soft delete
})

export {
    getBrandActivity,
    getBrandDashboard,
    createCampaign,
    getAllCampaigns,
    getCampaign,
    updateCampaign,
    deleteCampaign,
    campaignStatus,
    getAllInfluencer,
    getInfluencer,
    sendCollaborationRequest,
    getAllCollaborationRequest,
    getCollaborationRequest,
    cancelCollaborationRequest,
    getBrandProfile,
    updateBrandProfile,
    changeBrandPassword,
    updateSocialLinks,
    getBrandNotification,
    markActivityStatus,
    deleteNotification,

}