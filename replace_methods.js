import fs from 'fs';

let content = fs.readFileSync('server/src/modules/collaboration/collaboration.service.js', 'utf8');

// Remove CollaborationRequest import
content = content.replace('import CollaborationRequest from "./collaboration-request.model.js";\n', '');

// Replace sendRequest
content = content.replace(/const sendRequest = async \(senderId, \{.*?return request;\n\};/s, `const sendRequest = async (senderId, { receiverId, campaignId, proposedBudget, note, deliveryDays, initiatedBy }) => {
    if (initiatedBy === "brand") {
        const campaign = await Campaign.findOne({ _id: campaignId, brand: senderId, isDeleted: false });
        if (!campaign) throw new ApiError(validationStatus.notFound, "Campaign not found or access denied");
    }

    let targetReceiverId = receiverId;
    const userCheck = await User.findById(receiverId).select("_id");
    if (!userCheck) {
        const Influencer = mongoose.model("Influencer");
        const inf = await Influencer.findById(receiverId).select("user");
        if (inf) targetReceiverId = inf.user;
        else {
            const Brand = mongoose.model("Brand");
            const brand = await Brand.findById(receiverId).select("user");
            if (brand) targetReceiverId = brand.user;
        }
    }

    const existingRequest = await Collaboration.findOne({
        $or: [
            { brand: senderId, influencer: targetReceiverId },
            { brand: targetReceiverId, influencer: senderId }
        ],
        campaign: campaignId,
        status: { $in: ["requested", "accepted", "awaiting_funds", "active", "in_progress", "completed"] }
    });
    
    if (existingRequest) {
        throw new ApiError(validationStatus.badRequest, "A collaboration or request already exists for this campaign");
    }

    const campaign = await Campaign.findById(campaignId);

    const request = await Collaboration.create({
        brand: initiatedBy === "brand" ? senderId : targetReceiverId,
        influencer: initiatedBy === "influencer" ? senderId : targetReceiverId,
        campaign: campaignId,
        title: campaign?.name || "New Collaboration",
        description: note || campaign?.description || "",
        agreedBudget: proposedBudget || 0,
        status: "requested"
    });

    const receiverUser = await User.findById(targetReceiverId).select('role');
    
    await emitActivity({
        user: targetReceiverId,
        role: receiverUser?.role || (initiatedBy === 'brand' ? 'influencer' : 'brand'),
        type: 'collaboration_request_sent',
        title: 'New Collaboration Request',
        description: \`You have received a new collaboration request for "\${campaign?.name || 'a campaign'}"\`,
        relatedId: request._id,
        category: 'application'
    });

    return request;
};`);

// Replace acceptRequest
content = content.replace(/const acceptRequest = async \(requestId, userId\) => \{.*?return \{ request, collaboration \};\n\};/s, `const acceptRequest = async (requestId, userId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const collaboration = await Collaboration.findById(requestId).session(session);
        if (!collaboration) throw new ApiError(validationStatus.notFound, "Request not found");
        
        const isBrand = collaboration.brand.toString() === userId.toString();
        if (!isBrand) throw new ApiError(validationStatus.forbidden, "Only the brand can accept a request");

        if (collaboration.status !== "requested") throw new ApiError(validationStatus.badRequest, \`Request is already \${collaboration.status}\`);

        const campaignId = collaboration.campaign;
        const campaign = await Campaign.findById(campaignId).session(session);
        if (campaign.selectedInfluencer) throw new ApiError(validationStatus.badRequest, "Campaign already has a selected influencer");

        // 1. Accept this request -> awaiting_funds
        collaboration.status = "awaiting_funds";
        await collaboration.save({ session });

        // 2. Reject ALL other pending requests for this campaign
        const otherRequests = await Collaboration.find({
            campaign: campaignId,
            _id: { $ne: requestId },
            status: "requested"
        }).session(session);

        if (otherRequests.length > 0) {
            await Collaboration.updateMany(
                { _id: { $in: otherRequests.map(r => r._id) } },
                { $set: { status: "rejected" } },
                { session }
            );

            for (const req of otherRequests) {
                await emitActivity({
                    user: req.influencer,
                    role: "influencer",
                    type: "request_rejected",
                    title: "Request Rejected",
                    description: \`Your application for "\${campaign?.name || 'a campaign'}" was rejected because another influencer was selected.\`,
                    relatedId: req._id,
                    category: "application"
                });
            }
        }

        // 3. Emit activities
        await emitActivity({
            user: collaboration.influencer,
            role: 'influencer',
            type: 'collaboration_accepted',
            title: 'Collaboration Request Accepted',
            description: \`Your request for "\${campaign?.name || 'a campaign'}" was accepted! Escrow payment is pending.\`,
            relatedId: collaboration._id,
            category: 'collaboration'
        });

        // 4. Update campaign status & set selectedInfluencer
        campaign.status = 'in_progress';
        campaign.selectedInfluencer = collaboration.influencer;
        await campaign.save({ session });

        await session.commitTransaction();
        return { request: collaboration, collaboration };
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};`);

// Replace updateRequestStatus
content = content.replace(/const updateRequestStatus = async \(requestId, userId, status\) => \{.*?return request;\n\};/s, `const updateRequestStatus = async (requestId, userId, status) => {
    const collaboration = await Collaboration.findById(requestId);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Request not found");

    const isInfluencer = collaboration.influencer.toString() === userId.toString();
    const isBrand = collaboration.brand.toString() === userId.toString();

    if (status === "cancelled" && !isInfluencer) throw new ApiError(validationStatus.forbidden, "Only influencer can cancel their request");
    if (status === "rejected" && !isBrand) throw new ApiError(validationStatus.forbidden, "Only brand can reject a request");

    collaboration.status = status;
    await collaboration.save();

    const targetUserId = status === "cancelled" ? collaboration.brand : collaboration.influencer;
    const targetUser = await User.findById(targetUserId).select('role');
    const campaign = await Campaign.findById(collaboration.campaign).select('name');
    
    await emitActivity({
        user: targetUserId,
        role: targetUser?.role || 'user',
        type: status === "rejected" ? 'request_rejected' : 'request_cancelled',
        title: \`Collaboration Request \${status.charAt(0).toUpperCase() + status.slice(1)}\`,
        description: \`The collaboration request for "\${campaign?.name || 'a campaign'}" has been \${status}.\`,
        relatedId: collaboration._id,
        category: 'application'
    });

    return collaboration;
};`);

// Replace getRequests (A big chunk, let's just make it simple for now or fetch requests from Collaboration)
content = content.replace(/const getRequests = async \(userId, \{.*?pages: Math.ceil\(totalCount \/ limit\),\n    \};\n\};/s, `const getRequests = async (userId, { status, type, platform, page = 1, limit = 10, search }) => {
    const skip = (page - 1) * limit;
    const objectUserId = new mongoose.Types.ObjectId(userId.toString());
    
    let matchStage = {
        isDeleted: false,
        status: "requested"
    };

    if (type === "sent") {
        matchStage.influencer = objectUserId;
    } else if (type === "received") {
        matchStage.brand = objectUserId;
    } else {
        matchStage.$or = [
            { brand: objectUserId },
            { influencer: objectUserId }
        ];
    }

    if (status && status !== "all") {
        matchStage.status = status;
    }

    const result = await Collaboration.aggregate([
        { $match: matchStage },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) }
    ]);

    const totalCount = await Collaboration.countDocuments(matchStage);

    return {
        requests: result,
        total: totalCount,
        counts: {
            sent: await Collaboration.countDocuments({ influencer: objectUserId, status: "requested" }),
            received: await Collaboration.countDocuments({ brand: objectUserId, status: "requested" })
        },
        page: Number(page),
        pages: Math.ceil(totalCount / limit),
    };
};`);

fs.writeFileSync('server/src/modules/collaboration/collaboration.service.js', content);
console.log('Done replacement');
