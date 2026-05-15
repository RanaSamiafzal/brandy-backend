import User from '../user/user.model.js';
import Campaign from '../campaign/campaign.model.js';
import Collaboration from '../collaboration/collaboration.model.js';
import Message from '../message/message.model.js';
import { AsyncHandler } from '../../utils/Asynchandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { validationStatus } from '../../utils/ValidationStatusCode.js';

// ── Abuse keyword list ─────────────────────────────────────────────────────
const ABUSE_KEYWORDS = [
  // Harassment & threats
  'kill you', 'beat you', 'hurt you', 'stab', 'rape', 'harass',
  'i will find you', 'where do you live', 'send me your address',
  // Sexual harassment
  'send nudes', 'send pics', 'hot girl', 'sexy', 'sleep with me',
  'meet me alone', 'come to my place', 'you are mine', 'wanna hook up',
  // Derogatory
  'slut', 'whore', 'bitch', 'hoe', 'prostitute',
  // Scam patterns
  'pay me outside', 'cash app me', 'western union', 'send money first',
  'i will pay double', 'off platform',
];

/**
 * GET /api/v1/admin/stats
 * Platform-wide overview metrics
 */
const getPlatformStats = AsyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalBrands,
    totalInfluencers,
    blockedUsers,
    totalCampaigns,
    activeCampaigns,
    totalCollaborations,
    activeCollaborations,
    totalMessages,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'brand' }),
    User.countDocuments({ role: 'influencer' }),
    User.countDocuments({ isBlocked: true }),
    Campaign.countDocuments({ isDeleted: false }),
    Campaign.countDocuments({ isDeleted: false, status: 'active' }),
    Collaboration.countDocuments({ isDeleted: false }),
    Collaboration.countDocuments({ isDeleted: false, status: { $in: ['accepted', 'ongoing'] } }),
    Message.countDocuments(),
  ]);

  // Recent signups (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: weekAgo } });

  return res.status(validationStatus.ok).json(
    new ApiResponse(validationStatus.ok, {
      users: { total: totalUsers, brands: totalBrands, influencers: totalInfluencers, blocked: blockedUsers, newThisWeek: newUsersThisWeek },
      campaigns: { total: totalCampaigns, active: activeCampaigns },
      collaborations: { total: totalCollaborations, active: activeCollaborations },
      messages: { total: totalMessages },
    }, 'Platform stats fetched')
  );
});

/**
 * GET /api/v1/admin/users
 * List all users with optional filters
 */
const getAllUsers = AsyncHandler(async (req, res) => {
  const { role, isBlocked, search, page = 1, limit = 20 } = req.query;
  const query = {};
  if (role) query.role = role;
  if (isBlocked !== undefined) query.isBlocked = isBlocked === 'true';
  if (search) query.$or = [
    { fullname: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
  ];

  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find(query)
      .select('-password -refreshToken -passwordResetOTP -emailVerificationOTP')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    User.countDocuments(query),
  ]);

  return res.status(validationStatus.ok).json(
    new ApiResponse(validationStatus.ok, { users, total, page: Number(page), pages: Math.ceil(total / limit) }, 'Users fetched')
  );
});

/**
 * PATCH /api/v1/admin/users/:userId/block
 * Block or unblock a user
 */
const toggleBlockUser = AsyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { block, reason } = req.body; // block: boolean, reason: string

  const user = await User.findById(userId);
  if (!user) throw new ApiError(validationStatus.notFound, 'User not found');
  if (user.role === 'admin') throw new ApiError(validationStatus.forbidden, 'Cannot block an admin account');

  user.isBlocked = Boolean(block);
  if (block && reason) user.blockReason = reason;
  if (!block) user.blockReason = undefined;
  await user.save();

  // Integrated Moderation & Trust Engine
  const { moderationService } = await import("../moderation/moderation.service.js");
  if (block) {
    await moderationService.adjustTrust(userId, 'BLOCK', reason || 'Manual Admin Block', -50, req.user._id);
  } else {
    await moderationService.adjustTrust(userId, 'TRUST_ADJUSTMENT', 'Manual Admin Unblock', 10, req.user._id);
  }

  return res.status(validationStatus.ok).json(
    new ApiResponse(validationStatus.ok, { userId, isBlocked: user.isBlocked }, `User ${block ? 'blocked' : 'unblocked'} successfully`)
  );
});

/**
 * GET /api/v1/admin/messages/scan
 * Scan recent messages for abusive content
 * Returns flagged messages with user info
 */
const scanMessagesForAbuse = AsyncHandler(async (req, res) => {
  const { limit = 500 } = req.query;

  // Fetch recent messages
  const recentMessages = await Message.find({ isDeletedForEveryone: false })
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .populate('sender', 'fullname email role profilePic isBlocked')
    .lean();

  const flagged = [];

  for (const msg of recentMessages) {
    const text = (msg.text || '').toLowerCase();
    const matchedKeywords = ABUSE_KEYWORDS.filter(kw => text.includes(kw));

    if (matchedKeywords.length > 0) {
      flagged.push({
        messageId: msg._id,
        conversationId: msg.conversationId,
        text: msg.text,
        matchedKeywords,
        riskLevel: matchedKeywords.length >= 3 ? 'HIGH' : matchedKeywords.length >= 2 ? 'MEDIUM' : 'LOW',
        sender: msg.sender,
        createdAt: msg.createdAt,
      });
    }
  }

  // Sort by risk level
  const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  flagged.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

  return res.status(validationStatus.ok).json(
    new ApiResponse(validationStatus.ok, {
      scanned: recentMessages.length,
      flaggedCount: flagged.length,
      flagged,
    }, 'Message scan complete')
  );
});

/**
 * GET /api/v1/admin/influencers/score/:userId
 * Calculate the Brandy Score for an influencer
 */
const getInfluencerBrandyScore = AsyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId).lean();
  if (!user) throw new ApiError(validationStatus.notFound, 'User not found');
  if (user.role !== 'influencer') throw new ApiError(validationStatus.badRequest, 'User is not an influencer');

  const yt = user.platforms?.youtube;

  // Engagement Rate: (likes + comments) / subscribers * 100
  let engagementRate = 0;
  let fakeProbability = 'Unknown';
  let ytScore = 0;

  if (yt && yt.subscribers > 0) {
    const totalVideos = yt.totalVideos || 1;
    const avgLikes = (yt.videos || []).reduce((sum, v) => sum + (v.likes || 0), 0) / totalVideos;
    const avgComments = (yt.videos || []).reduce((sum, v) => sum + (v.comments || 0), 0) / totalVideos;
    engagementRate = ((avgLikes + avgComments) / yt.subscribers) * 100;

    // Fake follower detection logic
    if (engagementRate < 0.5 && yt.subscribers > 10000) {
      fakeProbability = 'HIGH';
    } else if (engagementRate < 1.5) {
      fakeProbability = 'MEDIUM';
    } else {
      fakeProbability = 'LOW';
    }

    // Clamp engagement to 0–10 range for scoring
    ytScore = Math.min(engagementRate * 2, 10);
  }

  // Verified platforms bonus (OAuth connected)
  const verifiedCount = (user.verifiedPlatforms || []).filter(p => p.verified).length;
  const verificationScore = Math.min(verifiedCount * 3.33, 10); // max 3 platforms = 10

  // Collaboration success (deliverables completed)
  const completedCollabs = await Collaboration.countDocuments({ influencer: userId, status: 'completed' });
  const collabScore = Math.min(completedCollabs * 2, 10); // cap at 5 completions

  // Profile completeness
  const profileScore = user.profileComplete ? 10 : 5;

  // Weighted final score: engagement 40%, verification 30%, collabs 20%, profile 10%
  const brandyScore = (
    (ytScore * 0.4) +
    (verificationScore * 0.3) +
    (collabScore * 0.2) +
    (profileScore * 0.1)
  ).toFixed(1);

  return res.status(validationStatus.ok).json(
    new ApiResponse(validationStatus.ok, {
      userId,
      fullname: user.fullname,
      brandyScore: parseFloat(brandyScore),
      breakdown: {
        engagementRate: engagementRate.toFixed(2) + '%',
        fakeProbability,
        ytScore: ytScore.toFixed(1),
        verificationScore: verificationScore.toFixed(1),
        collabScore: collabScore.toFixed(1),
        profileScore,
      },
      subscribers: yt?.subscribers || 0,
      totalVideos: yt?.totalVideos || 0,
    }, 'Brandy Score calculated')
  );
});

/**
 * GET /api/v1/admin/campaigns/audit
 * List potentially suspicious campaigns (no budget, very short timeline, etc.)
 */
const auditCampaigns = AsyncHandler(async (req, res) => {
  const campaigns = await Campaign.find({ isDeleted: false })
    .populate('brand', 'fullname email isBlocked')
    .lean();

  const flagged = campaigns.filter(c => {
    const issues = [];
    if (!c.budget?.min && !c.budget?.max) issues.push('No budget set');
    if (c.brand?.isBlocked) issues.push('Brand account is blocked');
    const days = c.campaignTimeline?.endDate
      ? (new Date(c.campaignTimeline.endDate) - new Date(c.campaignTimeline.startDate || Date.now())) / (1000 * 60 * 60 * 24)
      : null;
    if (days !== null && days < 2) issues.push('Timeline less than 2 days');
    if (!c.description || c.description.length < 20) issues.push('Description too short');
    c._issues = issues;
    return issues.length > 0;
  });

  return res.status(validationStatus.ok).json(
    new ApiResponse(validationStatus.ok, {
      totalChecked: campaigns.length,
      flaggedCount: flagged.length,
      flagged: flagged.map(c => ({ _id: c._id, name: c.name, brand: c.brand, issues: c._issues })),
    }, 'Campaign audit complete')
  );
});

import jwt from 'jsonwebtoken';

/**
 * GET /api/v1/admin/activity
 * Latest platform-wide activity (new signups, blocked, etc.)
 */
const getRecentActivity = AsyncHandler(async (req, res) => {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [recentUsers, recentCampaigns, recentCollabs] = await Promise.all([
    User.find({ createdAt: { $gte: dayAgo } })
      .select('fullname email role createdAt isBlocked')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    Campaign.find({ createdAt: { $gte: dayAgo }, isDeleted: false })
      .select('name status createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    Collaboration.find({ createdAt: { $gte: dayAgo }, isDeleted: false })
      .select('title status createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  return res.status(validationStatus.ok).json(
    new ApiResponse(validationStatus.ok, {
      recentSignups: recentUsers,
      recentCampaigns,
      recentCollaborations: recentCollabs,
    }, 'Recent activity fetched')
  );
});

/**
 * GET /api/v1/admin/approve-action
 * Webhook for email approvals. Validates JWT and executes moderation action.
 */
const approveAction = AsyncHandler(async (req, res) => {
  const { token, action } = req.query; // action can be 'approve' or 'reject'
  if (!token) throw new ApiError(validationStatus.badRequest, 'Token is required');

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'fallback_secret');
    const { actionType, userId, reason } = decoded;

    if (action === 'reject') {
      return res.status(validationStatus.ok).send('<h1>Action Rejected</h1><p>No changes were made.</p>');
    }

    if (actionType === 'BLOCK_USER') {
      const user = await User.findById(userId);
      if (!user) throw new ApiError(validationStatus.notFound, 'User not found');
      
      user.isBlocked = true;
      user.blockReason = reason || 'AI Admin Approved Block';
      await user.save();
      
      return res.status(validationStatus.ok).send('<h1>Action Approved Successfully</h1><p>The user has been blocked.</p>');
    }

    return res.status(validationStatus.badRequest).send('<h1>Unknown Action Type</h1>');
  } catch (error) {
    return res.status(validationStatus.unauthorized).send('<h1>Invalid or Expired Token</h1>');
  }
});

export const adminController = {
  getPlatformStats,
  getAllUsers,
  toggleBlockUser,
  scanMessagesForAbuse,
  getInfluencerBrandyScore,
  auditCampaigns,
  getRecentActivity,
  approveAction,
};
