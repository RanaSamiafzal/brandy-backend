import { jest } from '@jest/globals';
import mongoose from 'mongoose';

jest.unstable_mockModule('../src/utils/notificationUtils.js', () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined)
}));

jest.unstable_mockModule('../src/utils/activityUtils.js', () => ({
  emitActivity: jest.fn().mockResolvedValue(undefined)
}));

jest.unstable_mockModule('../src/config/socketManager.js', () => ({
  socketManager: { emitToUsers: jest.fn(), emitToUser: jest.fn() }
}));

jest.unstable_mockModule('../src/modules/message/message.service.js', () => ({
  messageService: { createConversation: jest.fn() }
}));

jest.unstable_mockModule('../src/modules/payment/stripe.service.js', () => ({
  stripe: { paymentIntents: { retrieve: jest.fn() } },
  stripeService: { handlePaymentIntentSucceeded: jest.fn() }
}));

let campaignService, Campaign, Collaboration;

beforeAll(async () => {
  Campaign = (await import('../src/modules/campaign/campaign.model.js')).default;
  Collaboration = (await import('../src/modules/collaboration/collaboration.model.js')).default;
  const svc = await import('../src/modules/campaign/campaign.service.js');
  campaignService = svc.campaignService;
});

const BRAND_ID = '507f1f77bcf86cd799439011';
const INF_ID = '507f1f77bcf86cd799439012';
const CAMP_ID = '507f1f77bcf86cd799439014';

function makeCampaign(overrides = {}) {
  const now = new Date();
  const future = new Date(now.getTime() + 86400000 * 30);
  return {
    _id: overrides._id || CAMP_ID,
    name: 'Test Campaign',
    description: 'A test campaign',
    industry: 'Tech',
    platform: ['instagram', 'youtube'],
    budget: { min: 500, max: 2000 },
    campaignTimeline: { startDate: now, endDate: future },
    brand: BRAND_ID,
    status: 'active',
    isDeleted: false,
    image: '',
    selectedInfluencer: null,
    cancelReason: '',
    cancelledAt: null,
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe('campaign.service.js', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────
  // calculateStatus
  // ──────────────────────────────────────────────
  describe('calculateStatus', () => {
    it('should return pending when current date is before start', () => {
      const future = new Date(Date.now() + 86400000 * 60);
      const further = new Date(Date.now() + 86400000 * 90);
      expect(campaignService.calculateStatus(future, further)).toBe('pending');
    });

    it('should return active when current date is between start and end', () => {
      const past = new Date(Date.now() - 86400000 * 10);
      const future = new Date(Date.now() + 86400000 * 10);
      expect(campaignService.calculateStatus(past, future)).toBe('active');
    });

    it('should return completed when current date is after end', () => {
      const past = new Date(Date.now() - 86400000 * 30);
      const furtherPast = new Date(Date.now() - 86400000 * 10);
      expect(campaignService.calculateStatus(past, furtherPast)).toBe('completed');
    });
  });

  // ──────────────────────────────────────────────
  // createCampaign
  // ──────────────────────────────────────────────
  describe('createCampaign', () => {
    it('should create campaign with auto-calculated status', async () => {
      const campaignData = {
        name: 'New Campaign',
        industry: 'Fashion',
        platform: ['instagram'],
        budget: { min: 1000, max: 5000 },
        campaignTimeline: {
          startDate: new Date(Date.now() - 86400000 * 5),
          endDate: new Date(Date.now() + 86400000 * 25)
        }
      };
      Campaign.create = jest.fn().mockImplementation(data => Promise.resolve(makeCampaign(data)));

      const result = await campaignService.createCampaign(campaignData);
      expect(Campaign.create).toHaveBeenCalled();
      // Verify status was auto-calculated (not passed in)
      const createCall = Campaign.create.mock.calls[0][0];
      expect(createCall.status).toBeDefined();
    });

    it('should keep status as draft when explicitly set', async () => {
      const campaignData = {
        name: 'Draft Campaign',
        status: 'draft'
      };
      Campaign.create = jest.fn().mockImplementation(data => Promise.resolve(makeCampaign({ ...data, status: 'draft' })));

      const result = await campaignService.createCampaign(campaignData);
      expect(result.status).toBe('draft');
    });
  });

  // ──────────────────────────────────────────────
  // getAllCampaigns (brand path)
  // ──────────────────────────────────────────────
  describe('getAllCampaigns (brand path)', () => {
    it('should return brand-own campaigns with collaboration status', async () => {
      Campaign.aggregate = jest.fn().mockResolvedValue([{
        data: [{ _id: CAMP_ID, name: 'My Campaign', status: 'active', campaignTimeline: { startDate: new Date(), endDate: new Date(Date.now() + 86400000) } }],
        totalCount: [{ count: 1 }]
      }]);

      const result = await campaignService.getAllCampaigns({ role: 'brand', brand: BRAND_ID, page: 1, limit: 10 });
      expect(result.campaigns).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by status for brand', async () => {
      Campaign.aggregate = jest.fn().mockResolvedValue([{ data: [], totalCount: [{ count: 0 }] }]);

      await campaignService.getAllCampaigns({ role: 'brand', brand: BRAND_ID, status: 'draft' });
      expect(Campaign.aggregate).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // getAllCampaigns (influencer path)
  // ──────────────────────────────────────────────
  describe('getAllCampaigns (influencer path)', () => {
    it('should return active campaigns for influencers', async () => {
      Campaign.aggregate = jest.fn().mockResolvedValue([{
        data: [{ _id: CAMP_ID, name: 'Active Campaign', status: 'active', campaignTimeline: { startDate: new Date(), endDate: new Date(Date.now() + 86400000) } }],
        totalCount: [{ count: 1 }]
      }]);

      const result = await campaignService.getAllCampaigns({ role: 'influencer', page: 1, limit: 10 });
      expect(result.campaigns).toHaveLength(1);
    });

    it('should search by text when search param provided', async () => {
      Campaign.aggregate = jest.fn().mockResolvedValue([{ data: [], totalCount: [{ count: 0 }] }]);

      await campaignService.getAllCampaigns({ role: 'influencer', search: 'tech', page: 1, limit: 10 });
      expect(Campaign.aggregate).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // getCampaignById
  // ──────────────────────────────────────────────
  describe('getCampaignById', () => {
    it('should throw if campaign not found', async () => {
      Campaign.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });

      await expect(campaignService.getCampaignById(CAMP_ID)).rejects.toThrow('Campaign not found');
    });

    it('should return campaign with collaboration status', async () => {
      const camp = makeCampaign();
      Campaign.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(camp)
      });
      Collaboration.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: 'collab_1', status: 'active' })
      });
      Collaboration.countDocuments = jest.fn().mockResolvedValue(3);

      const result = await campaignService.getCampaignById(CAMP_ID);
      expect(result.ongoingCollaborationId).toBe('collab_1');
      expect(result.applicantsCount).toBe(3);
    });

    it('should calculate status when no collaboration exists', async () => {
      const camp = makeCampaign({ status: 'active' });
      Campaign.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(camp)
      });
      Collaboration.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });
      Collaboration.countDocuments = jest.fn().mockResolvedValue(0);

      const result = await campaignService.getCampaignById(CAMP_ID);
      expect(result.status).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────
  // updateCampaign
  // ──────────────────────────────────────────────
  describe('updateCampaign', () => {
    it('should update campaign and recalculate status', async () => {
      Campaign.findById = jest.fn().mockResolvedValue(makeCampaign({ status: 'active' }));
      Campaign.findByIdAndUpdate = jest.fn().mockResolvedValue(makeCampaign({ name: 'Updated', status: 'active' }));

      const result = await campaignService.updateCampaign(CAMP_ID, { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should throw if campaign not found', async () => {
      Campaign.findById = jest.fn().mockResolvedValue(makeCampaign());
      Campaign.findByIdAndUpdate = jest.fn().mockResolvedValue(null);

      await expect(campaignService.updateCampaign(CAMP_ID, { name: 'X' })).rejects.toThrow('Campaign not found');
    });
  });

  // ──────────────────────────────────────────────
  // deleteCampaign
  // ──────────────────────────────────────────────
  describe('deleteCampaign', () => {
    it('should throw if campaign not found', async () => {
      Campaign.findById = jest.fn().mockResolvedValue(null);
      await expect(campaignService.deleteCampaign(CAMP_ID)).rejects.toThrow('Campaign not found');
    });

    it('should throw if accepted collaborations exist', async () => {
      Campaign.findById = jest.fn().mockResolvedValue(makeCampaign());
      Collaboration.countDocuments = jest.fn().mockResolvedValue(1);

      await expect(campaignService.deleteCampaign(CAMP_ID)).rejects.toThrow('Cannot delete a campaign with accepted influencers');
    });

    it('should soft delete campaign and cascade to collaborations', async () => {
      const camp = makeCampaign();
      Campaign.findById = jest.fn().mockResolvedValue(camp);
      Collaboration.countDocuments = jest.fn().mockResolvedValue(0);
      Collaboration.updateMany = jest.fn().mockResolvedValue({});

      const result = await campaignService.deleteCampaign(CAMP_ID);
      expect(result.isDeleted).toBe(true);
      expect(Collaboration.updateMany).toHaveBeenCalledWith(
        { campaign: CAMP_ID },
        { isDeleted: true, deletedAt: expect.any(Date), status: 'cancelled' }
      );
    });
  });

  // ──────────────────────────────────────────────
  // cancelCampaign
  // ──────────────────────────────────────────────
  describe('cancelCampaign', () => {
    it('should throw if campaign not found or access denied', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(null);
      await expect(campaignService.cancelCampaign(CAMP_ID, BRAND_ID, 'No reason'))
        .rejects.toThrow('Campaign not found or access denied');
    });

    it('should throw if already cancelled', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(makeCampaign({ status: 'cancelled' }));
      await expect(campaignService.cancelCampaign(CAMP_ID, BRAND_ID, 'reason'))
        .rejects.toThrow('Campaign is already cancelled');
    });

    it('should cancel campaign and update all collaborations', async () => {
      const camp = makeCampaign({ status: 'active', name: 'Test' });
      Campaign.findOne = jest.fn().mockResolvedValue(camp);
      Collaboration.updateMany = jest.fn().mockResolvedValue({});
      Collaboration.find = jest.fn().mockReturnValue({ distinct: jest.fn().mockResolvedValue([INF_ID]) });

      const result = await campaignService.cancelCampaign(CAMP_ID, BRAND_ID, 'Budget issues');
      expect(result.status).toBe('cancelled');
      expect(result.cancelReason).toBe('Budget issues');
      expect(Collaboration.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  // ──────────────────────────────────────────────
  // applyToCampaign
  // ──────────────────────────────────────────────
  describe('applyToCampaign', () => {
    it('should throw if campaign not found', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(null);
      await expect(campaignService.applyToCampaign(CAMP_ID, INF_ID, { note: 'Interested' }))
        .rejects.toThrow('Campaign not found');
    });

    it('should throw if campaign is not active', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(makeCampaign({ status: 'draft' }));
      await expect(campaignService.applyToCampaign(CAMP_ID, INF_ID, { note: 'Interested' }))
        .rejects.toThrow('This campaign is not accepting applications');
    });

    it('should throw if already accepted influencer', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(makeCampaign({ status: 'active' }));
      Collaboration.findOne = jest.fn().mockResolvedValue({ _id: 'acc_1', status: 'accepted' });

      await expect(campaignService.applyToCampaign(CAMP_ID, INF_ID, { note: 'Hi' }))
        .rejects.toThrow('already selected an influencer');
    });

    it('should throw if duplicate application', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(makeCampaign({ status: 'active', brand: BRAND_ID }));
      Collaboration.findOne = jest.fn();
      Collaboration.findOne.mockResolvedValueOnce(null); // accepted check
      Collaboration.findOne.mockResolvedValueOnce({ _id: 'dup_1' }); // duplicate check

      await expect(campaignService.applyToCampaign(CAMP_ID, INF_ID, { note: 'Hi' }))
        .rejects.toThrow('already applied');
    });

    it('should create collaboration request on apply', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(makeCampaign({ status: 'active', brand: BRAND_ID }));
      Collaboration.findOne = jest.fn().mockResolvedValue(null);
      Collaboration.create = jest.fn().mockResolvedValue({
        _id: 'req_new',
        brand: BRAND_ID,
        influencer: INF_ID,
        status: 'requested'
      });

      const result = await campaignService.applyToCampaign(CAMP_ID, INF_ID, { note: 'Love this brand!', proposedBudget: 800 });
      expect(result.status).toBe('requested');
      expect(Collaboration.create).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // extendCampaignDuration
  // ──────────────────────────────────────────────
  describe('extendCampaignDuration', () => {
    it('should throw if campaign not found', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(null);
      await expect(campaignService.extendCampaignDuration(CAMP_ID, BRAND_ID, new Date(Date.now() + 86400000 * 60)))
        .rejects.toThrow('Campaign not found or access denied');
    });

    it('should throw if end date is in the past', async () => {
      Campaign.findOne = jest.fn().mockResolvedValue(makeCampaign());
      await expect(campaignService.extendCampaignDuration(CAMP_ID, BRAND_ID, new Date(Date.now() - 86400000)))
        .rejects.toThrow('New end date must be in the future');
    });

    it('should extend campaign duration and recalculate status', async () => {
      const camp = makeCampaign({ status: 'active' });
      Campaign.findOne = jest.fn().mockResolvedValue(camp);

      const newEnd = new Date(Date.now() + 86400000 * 90);
      const result = await campaignService.extendCampaignDuration(CAMP_ID, BRAND_ID, newEnd);
      expect(result.campaignTimeline.endDate).toEqual(newEnd);
    });
  });
});
