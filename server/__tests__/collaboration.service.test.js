import { jest } from '@jest/globals';
import mongoose from 'mongoose';

// ── Mock modules before imports ──
jest.unstable_mockModule('../src/utils/notificationUtils.js', () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined)
}));

jest.unstable_mockModule('../src/utils/activityUtils.js', () => ({
  emitActivity: jest.fn().mockResolvedValue(undefined)
}));

jest.unstable_mockModule('../src/config/socketManager.js', () => ({
  socketManager: {
    emitToUsers: jest.fn(),
    emitToUser: jest.fn()
  }
}));

jest.unstable_mockModule('../src/modules/message/message.service.js', () => ({
  messageService: {
    createConversation: jest.fn().mockResolvedValue({ _id: 'conv_1' })
  }
}));

jest.unstable_mockModule('../src/modules/payment/stripe.service.js', () => ({
  stripe: { paymentIntents: { retrieve: jest.fn() } },
  stripeService: {
    handlePaymentIntentSucceeded: jest.fn()
  }
}));

let collaborationService, requestService;
let Collaboration, Campaign, User, Review, Brand, Influencer;

beforeAll(async () => {
  Collaboration = (await import('../src/modules/collaboration/collaboration.model.js')).default;
  Campaign = (await import('../src/modules/campaign/campaign.model.js')).default;
  User = (await import('../src/modules/user/user.model.js')).default;
  Review = (await import('../src/modules/collaboration/review.model.js')).default;
  Brand = (await import('../src/modules/brand/brand.model.js')).default;
  Influencer = (await import('../src/modules/influencer/influencer.model.js')).default;

  const svc = await import('../src/modules/collaboration/collaboration.service.js');
  collaborationService = svc.collaborationService;

  const reqSvc = await import('../src/modules/collaboration/request.service.js');
  requestService = reqSvc.requestService;
});

// ── Valid 24-char hex IDs for MongoDB ──
const BRAND_ID = '507f1f77bcf86cd799439011';
const INF_ID = '507f1f77bcf86cd799439012';
const OTHER_ID = '507f1f77bcf86cd799439013';
const CAMP_ID = '507f1f77bcf86cd799439014';
const REQ_ID = '507f1f77bcf86cd799439015';
const COLLAB_ID = '507f1f77bcf86cd799439016';

// Chainable mock: returns object with .select() / .populate() / .session() / .lean() / .sort()
function chainableMock(resolvedValue) {
  const chainable = {
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    session: jest.fn().mockResolvedValue(resolvedValue),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(resolvedValue)
  };
  // If resolvedValue is null/undefined, make session return null too
  if (resolvedValue === null || resolvedValue === undefined) {
    chainable.session = jest.fn().mockResolvedValue(null);
    chainable.lean = jest.fn().mockResolvedValue(null);
  }
  return chainable;
}

function selectableMock(resolvedValue) {
  return {
    select: jest.fn().mockResolvedValue(resolvedValue)
  };
}

// ── Helpers ──
const makeUser = (overrides = {}) => ({
  _id: overrides._id || BRAND_ID,
  email: 'brand@test.com',
  fullname: 'Test Brand',
  role: 'brand',
  stripeCustomerId: null,
  stripeAccountId: null,
  save: jest.fn().mockResolvedValue(true),
  ...overrides
});

const makeCampaign = (overrides = {}) => ({
  _id: CAMP_ID,
  name: 'Test Campaign',
  brand: BRAND_ID,
  status: 'pending',
  isDeleted: false,
  selectedInfluencer: null,
  save: jest.fn().mockResolvedValue(true),
  ...overrides
});

const makeRequest = (overrides = {}) => ({
  _id: overrides._id || REQ_ID,
  brand: BRAND_ID,
  influencer: INF_ID,
  sender: BRAND_ID,
  initiatedBy: 'brand',
  campaign: CAMP_ID,
  proposedBudget: 1000,
  agreedBudget: 0,
  note: 'Let\'s work together!',
  deliveryDays: 14,
  status: 'requested',
  isDeleted: false,
  save: jest.fn().mockResolvedValue(true),
  ...overrides
});

const makeCollaboration = (overrides = {}) => ({
  _id: overrides._id || COLLAB_ID,
  brand: { _id: BRAND_ID, fullname: 'Brand', email: 'b@t.com' },
  influencer: { _id: INF_ID, fullname: 'Inf', username: 'inf', email: 'i@t.com' },
  campaign: { _id: CAMP_ID, name: 'Camp' },
  status: 'active',
  escrowFunded: true,
  agreedBudget: 1000,
  totalFundedAmount: 1000,
  totalPaidAmount: 0,
  deliverables: [],
  review: null,
  influencerReview: null,
  stripePaymentIntentId: null,
  save: jest.fn().mockResolvedValue(true),
  ...overrides
});

// Mongoose session mock
const mockSession = () => ({
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn()
});

describe('collaboration.service.js', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock mongoose.model for models not imported directly (Influencer, Brand)
    mongoose.model = jest.fn((name) => {
      if (name === 'Influencer') {
        return {
          findById: jest.fn().mockReturnValue(selectableMock(null)),
          findOne: jest.fn().mockReturnValue(selectableMock(null))
        };
      }
      if (name === 'Brand') {
        return {
          findById: jest.fn().mockReturnValue(selectableMock(null))
        };
      }
      return undefined;
    });
  });

  // ──────────────────────────────────────────────
  // sendRequest
  // ──────────────────────────────────────────────
  describe('sendRequest', () => {
    it('should throw if campaign not found when brand initiates', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(null);

      await expect(collaborationService.sendRequest('user_brand_1', {
        receiverId: 'user_inf_1',
        campaignId: 'camp_1',
        proposedBudget: 1000,
        initiatedBy: 'brand'
      })).rejects.toThrow('Campaign not found or access denied');
    });

    it('should resolve receiver through Influencer profile if not a User', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(makeCampaign());
      User.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      mongoose.model = jest.fn((name) => {
        if (name === 'Influencer') {
          return {
            findById: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'inf_prof', user: INF_ID }) })
          };
        }
        return {};
      });
      Collaboration.findOne = jest.fn().mockResolvedValue(null);
      Collaboration.create = jest.fn().mockResolvedValue(makeRequest());
      Campaign.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeCampaign()) });

      const result = await collaborationService.sendRequest(BRAND_ID, {
        receiverId: 'inf_prof',
        campaignId: CAMP_ID,
        proposedBudget: 1000,
        initiatedBy: 'brand'
      });

      expect(result.influencer).toBe(INF_ID);
    });

    it('should throw if a collaboration already exists for this campaign', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(makeCampaign());
      User.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeUser()) });
      Collaboration.findOne = jest.fn().mockResolvedValue(makeRequest({ status: 'active' }));

      await expect(collaborationService.sendRequest(BRAND_ID, {
        receiverId: INF_ID,
        campaignId: CAMP_ID,
        proposedBudget: 1000,
        initiatedBy: 'brand'
      })).rejects.toThrow('A collaboration already exists for this campaign');
    });

    it('should create a request and emit activity', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(makeCampaign());
      User.findById = jest.fn();
      User.findById.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(makeUser({ role: 'influencer', _id: INF_ID })) });
      User.findById.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(makeUser({ role: 'influencer' })) });
      Collaboration.findOne = jest.fn().mockResolvedValue(null);
      Collaboration.create = jest.fn().mockResolvedValue(makeRequest());
      Campaign.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeCampaign()) });

      const result = await collaborationService.sendRequest(BRAND_ID, {
        receiverId: INF_ID,
        campaignId: CAMP_ID,
        proposedBudget: 1000,
        note: 'Let\'s work together!',
        deliveryDays: 14,
        initiatedBy: 'brand'
      });

      expect(result.status).toBe('requested');
    });
  });

  // ──────────────────────────────────────────────
  // getRequests (aggregation-based)
  // ──────────────────────────────────────────────
  describe('getRequests', () => {
    it('should return paginated requests from aggregation', async () => {
      const mockResult = [{
        data: [{ _id: REQ_ID, status: 'requested', sender: BRAND_ID }],
        totalCount: [{ count: 1 }]
      }];
      Collaboration.aggregate = jest.fn().mockResolvedValue(mockResult);
      Collaboration.countDocuments = jest.fn().mockResolvedValue(1);

      const result = await collaborationService.getRequests(INF_ID, 'influencer', { page: 1, limit: 10 });

      expect(result.requests).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty array when no requests', async () => {
      Collaboration.aggregate = jest.fn().mockResolvedValue([{ data: [], totalCount: [] }]);
      Collaboration.countDocuments = jest.fn().mockResolvedValue(0);

      const result = await collaborationService.getRequests(BRAND_ID, 'brand', {});

      expect(result.requests).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ──────────────────────────────────────────────
  // acceptRequest (transaction-based)
  // ──────────────────────────────────────────────
  describe('acceptRequest', () => {
    it('should throw if request not found', async () => {
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession());
      Collaboration.findById = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(null) });

      await expect(collaborationService.acceptRequest('req_1', 'user_inf_1'))
        .rejects.toThrow('Request not found');
    });

    it('should throw if sender tries to accept their own request', async () => {
      const req = makeRequest({ sender: 'user_brand_1', brand: 'user_brand_1', status: 'requested' });
      const sessionObj = mockSession();
      mongoose.startSession = jest.fn().mockResolvedValue(sessionObj);
      Collaboration.findById = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(req) });
      const otherRequests = { map: jest.fn().mockReturnValue([]) };
      Collaboration.find = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(otherRequests) });
      Collaboration.updateMany = jest.fn().mockResolvedValue({});

      await expect(collaborationService.acceptRequest('req_1', 'user_brand_1'))
        .rejects.toThrow('You cannot accept your own request');
    });

    it('should accept request and reject others for same campaign', async () => {
      const req = makeRequest({ sender: BRAND_ID, status: 'requested' });
      const campaign = makeCampaign({ status: 'pending' });
      const sessionObj = mockSession();

      mongoose.startSession = jest.fn().mockResolvedValue(sessionObj);
      // Find by ID with session
      Collaboration.findById = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(req) });
      Campaign.findById = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(campaign) });
      Collaboration.findOne = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(null) });

      const otherReq = makeRequest({ _id: OTHER_ID, sender: OTHER_ID });
      const otherReqs = [otherReq];
      otherReqs.map = jest.fn().mockReturnValue([OTHER_ID]);
      Collaboration.find = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(otherReqs) });
      Collaboration.updateMany = jest.fn().mockResolvedValue({});

      // User.findById is called after transaction for notification
      User.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeUser({ role: 'influencer', _id: INF_ID })) });

      const result = await collaborationService.acceptRequest(REQ_ID, INF_ID);

      expect(result.status).toBe('awaiting_funds');
      expect(sessionObj.commitTransaction).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // updateRequestStatus (reject/cancel)
  // ──────────────────────────────────────────────
  describe('updateRequestStatus', () => {
    it('should throw if request not found', async () => {
      Collaboration.findById = jest.fn().mockResolvedValue(null);

      await expect(collaborationService.updateRequestStatus('req_1', 'user_inf_1', 'rejected'))
        .rejects.toThrow('Request not found');
    });

    it('should allow receiver to reject', async () => {
      const req = makeRequest({ sender: BRAND_ID, brand: BRAND_ID });
      Collaboration.findById = jest.fn().mockResolvedValue(req);
      User.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeUser({ role: 'brand' })) });
      Campaign.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeCampaign()) });

      const result = await collaborationService.updateRequestStatus(REQ_ID, INF_ID, 'rejected');

      expect(result.status).toBe('rejected');
    });

    it('should allow sender to cancel', async () => {
      const req = makeRequest({ sender: BRAND_ID, brand: BRAND_ID });
      Collaboration.findById = jest.fn().mockResolvedValue(req);
      User.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeUser({ role: 'influencer' })) });
      Campaign.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeCampaign()) });

      const result = await collaborationService.updateRequestStatus(REQ_ID, BRAND_ID, 'cancelled');

      expect(result.status).toBe('cancelled');
    });

    it('should throw if non-sender tries to cancel', async () => {
      const req = makeRequest({ sender: BRAND_ID, brand: BRAND_ID });
      Collaboration.findById = jest.fn().mockResolvedValue(req);

      await expect(collaborationService.updateRequestStatus(REQ_ID, INF_ID, 'cancelled'))
        .rejects.toThrow('Only the sender can cancel their request');
    });
  });

  // ──────────────────────────────────────────────
  // counterOffer
  // ──────────────────────────────────────────────
  describe('counterOffer', () => {
    it('should throw if request not found', async () => {
      Collaboration.findById = jest.fn().mockResolvedValue(null);

      await expect(collaborationService.counterOffer('req_1', 'user_inf_1', { newBudget: 1200 }))
        .rejects.toThrow('Request not found');
    });

    it('should update agreedBudget, flip sender, and notify', async () => {
      const req = makeRequest({ sender: BRAND_ID, status: 'requested' });
      Collaboration.findById = jest.fn().mockResolvedValue(req);
      User.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeUser({ role: 'brand' })) });
      Campaign.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(makeCampaign()) });

      const result = await collaborationService.counterOffer(REQ_ID, INF_ID, { newBudget: 1500, note: 'Higher please' });

      expect(result.agreedBudget).toBe(1500);
      expect(result.proposedBudget).toBe(1500);
      expect(result.sender).toBe(INF_ID);
    });

    it('should throw if request is not in requested status', async () => {
      const req = makeRequest({ status: 'active' });
      Collaboration.findById = jest.fn().mockResolvedValue(req);

      await expect(collaborationService.counterOffer(REQ_ID, INF_ID, { newBudget: 1200 }))
        .rejects.toThrow('Counter-offers can only be made on pending requests');
    });
  });

  // ──────────────────────────────────────────────
  // getCollaborations (aggregation-based)
  // ──────────────────────────────────────────────
  describe('getCollaborations', () => {
    it('should return paginated collaborations from aggregation', async () => {
      Collaboration.aggregate = jest.fn().mockResolvedValue([{
        data: [{ _id: COLLAB_ID, status: 'active' }],
        totalCount: [{ count: 1 }]
      }]);

      const result = await collaborationService.getCollaborations(BRAND_ID, { page: 1, limit: 10 });

      expect(result.collaborations).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by status', async () => {
      Collaboration.aggregate = jest.fn().mockResolvedValue([{ data: [], totalCount: [] }]);

      await collaborationService.getCollaborations(BRAND_ID, { status: 'completed' });

      expect(Collaboration.aggregate).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // getCollaborationDetails
  // ──────────────────────────────────────────────
  describe('getCollaborationDetails', () => {
    it('should throw if collaboration ID is invalid', async () => {
      await expect(collaborationService.getCollaborationDetails('invalid', 'user_brand_1'))
        .rejects.toThrow('Invalid collaboration ID');
    });

    it('should throw if collaboration not found', async () => {
      Collaboration.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });

      await expect(collaborationService.getCollaborationDetails('507f1f77bcf86cd799439011', 'user_brand_1'))
        .rejects.toThrow('Collaboration not found');
    });

    it('should return collaboration details', async () => {
      const collab = makeCollaboration({
        _id: COLLAB_ID,
        stripePaymentIntentId: null
      });

      Collaboration.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(collab)
      });

      // Mock mongoose.model("Influencer") to return a findable object
      mongoose.model = jest.fn((name) => {
        if (name === 'Influencer') {
          return {
            findOne: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({ followersCount: 5000, platforms: [{ influenceRate: 0.05 }] })
            })
          };
        }
        return {};
      });

      const result = await collaborationService.getCollaborationDetails(COLLAB_ID, BRAND_ID);

      expect(result).not.toBeNull();
    });
  });

  // ──────────────────────────────────────────────
  // getLatestCollaborationWithUser
  // ──────────────────────────────────────────────
  describe('getLatestCollaborationWithUser', () => {
    it('should return null if no active collaboration exists', async () => {
      Collaboration.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });

      const result = await collaborationService.getLatestCollaborationWithUser('user_brand_1', 'user_inf_1');

      expect(result).toBeNull();
    });

    it('should return collaboration with influencer stats', async () => {
      const collab = makeCollaboration({ _id: COLLAB_ID });

      Collaboration.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(collab)
      });

      mongoose.model = jest.fn((name) => {
        if (name === 'Influencer') {
          return {
            findOne: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                followersCount: 10000,
                platforms: [{ influenceRate: 0.08 }]
              })
            })
          };
        }
        return {};
      });

      const result = await collaborationService.getLatestCollaborationWithUser(BRAND_ID, INF_ID);

      expect(result).not.toBeNull();
      expect(result.influencerStats.followersCount).toBe(10000);
    });
  });

  // ──────────────────────────────────────────────
  // submitInfluencerReview
  // ──────────────────────────────────────────────
  describe('submitInfluencerReview', () => {
    it('should throw if collaboration not found', async () => {
      Collaboration.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      await expect(collaborationService.submitInfluencerReview(COLLAB_ID, INF_ID, { rating: 5 }))
        .rejects.toThrow('Collaboration not found');
    });

    it('should throw if user is not the influencer', async () => {
      const collab = makeCollaboration({
        influencer: { _id: 'user_inf_1' },
        status: 'completed',
        influencerReview: null
      });
      Collaboration.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(collab)
      });

      await expect(collaborationService.submitInfluencerReview('collab_1', 'user_brand_1', { rating: 5 }))
        .rejects.toThrow('Only influencers can review brands');
    });

    it('should throw if collaboration is not completed', async () => {
      const collab = makeCollaboration({
        influencer: { _id: 'user_inf_1' },
        brand: { _id: 'user_brand_1' },
        status: 'active',
        influencerReview: null
      });
      Collaboration.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(collab)
      });

      await expect(collaborationService.submitInfluencerReview('collab_1', 'user_inf_1', { rating: 5 }))
        .rejects.toThrow('Can only review after collaboration is completed');
    });

    it('should throw if rating is missing', async () => {
      const collab = makeCollaboration({
        influencer: { _id: 'user_inf_1' },
        brand: { _id: 'user_brand_1' },
        status: 'completed',
        influencerReview: null
      });
      Collaboration.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(collab)
      });
      Review.findOne = jest.fn().mockResolvedValue(null);

      await expect(collaborationService.submitInfluencerReview('collab_1', 'user_inf_1', {}))
        .rejects.toThrow('Rating is required');
    });

    it('should create review and update brand rating', async () => {
      const collab = makeCollaboration({
        influencer: { _id: INF_ID, fullname: 'Inf' },
        brand: { _id: BRAND_ID, fullname: 'Brand' },
        status: 'completed',
        influencerReview: null
      });

      Collaboration.findById = jest.fn();
      // First call: find with populate (throws if null)
      Collaboration.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue(collab)
      });
      // Second call: return updated collaboration
      Collaboration.findById.mockReturnValueOnce({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ ...collab, influencerReview: { _id: 'rev_1', rating: 4 } })
      });

      // Mock Review.findOne to return null (no duplicate)
      Review.findOne = jest.fn();
      Review.findOne.mockResolvedValueOnce(null);  // No existing review
      Review.findOne.mockResolvedValueOnce({ rating: 4 }); // For brand rating calc

      Review.create = jest.fn().mockResolvedValue({ _id: 'rev_1' });
      Review.find = jest.fn().mockResolvedValue([{ rating: 4 }]);

      // Mock Brand.findOne for rating update
      Brand.findOne = jest.fn().mockResolvedValue({
        rating: 0,
        reviewsCount: 0,
        save: jest.fn().mockResolvedValue(true)
      });

      const result = await collaborationService.submitInfluencerReview(COLLAB_ID, INF_ID, { rating: 4, comment: 'Great!' });

      expect(result.influencerReview.rating).toBe(4);
      expect(Review.create).toHaveBeenCalledWith({
        reviewer: INF_ID,
        reviewee: BRAND_ID,
        collaboration: COLLAB_ID,
        rating: 4,
        comment: 'Great!',
        role: 'influencer'
      });
    });
  });
});
