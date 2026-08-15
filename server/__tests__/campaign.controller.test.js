import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

// ── Mocks for campaign model (used directly by applyToCampaign controller) ──
const mockCampaignFindOne = jest.fn();
const mockCampaignFindById = jest.fn();
const mockCampaignFindByIdAndUpdate = jest.fn();
const mockCampaignAggregate = jest.fn();
const mockCampaignCreate = jest.fn();

jest.unstable_mockModule('../src/modules/campaign/campaign.model.js', () => ({
  default: {
    findOne: mockCampaignFindOne,
    findById: mockCampaignFindById,
    findByIdAndUpdate: mockCampaignFindByIdAndUpdate,
    aggregate: mockCampaignAggregate,
    create: mockCampaignCreate
  }
}));

// ── Mocks for collaboration model (used directly by applyToCampaign controller) ──
const mockCollabFindOne = jest.fn();
const mockCollabCreate = jest.fn();
const mockCollabFind = jest.fn();
const mockCollabUpdateMany = jest.fn();
const mockCollabCountDocuments = jest.fn();

jest.unstable_mockModule('../src/modules/collaboration/collaboration.model.js', () => ({
  default: {
    findOne: mockCollabFindOne,
    create: mockCollabCreate,
    find: mockCollabFind,
    updateMany: mockCollabUpdateMany,
    countDocuments: mockCollabCountDocuments
  }
}));

// ── Auth & middleware mocks ──
function defaultBrandUser(req, res, next) {
  req.user = {
    _id: '507f1f77bcf86cd799439011',
    role: 'brand',
    email: 'brand@test.com',
    fullname: 'Test Brand',
    profileComplete: true,
  };
  next();
}

const mockVerifyJwt = jest.fn(defaultBrandUser);

let currentValidator = (req, res, next) => next();
const mockValidate = jest.fn(() => (req, res, next) => currentValidator(req, res, next));

jest.unstable_mockModule('../src/middleware/authMiddleware.js', () => ({
  verifyJwt: mockVerifyJwt
}));

jest.unstable_mockModule('../src/middleware/validationMiddleware.js', () => ({
  validate: mockValidate
}));

jest.unstable_mockModule('../src/utils/activityUtils.js', () => ({
  emitActivity: jest.fn().mockResolvedValue(undefined)
}));

jest.unstable_mockModule('../src/config/cloudinary.js', () => ({
  uploadOnCloudinary: jest.fn().mockResolvedValue({ secure_url: 'https://res.cloudinary.com/test.jpg' })
}));

const mockCreateCampaign = jest.fn();
const mockGetAllCampaigns = jest.fn();
const mockGetCampaignById = jest.fn();
const mockUpdateCampaign = jest.fn();
const mockDeleteCampaign = jest.fn();
const mockCancelCampaign = jest.fn();
const mockApplyToCampaign = jest.fn();
const mockExtendCampaignDuration = jest.fn();

jest.unstable_mockModule('../src/modules/campaign/campaign.service.js', () => ({
  campaignService: {
    createCampaign: mockCreateCampaign,
    getAllCampaigns: mockGetAllCampaigns,
    getCampaignById: mockGetCampaignById,
    updateCampaign: mockUpdateCampaign,
    deleteCampaign: mockDeleteCampaign,
    cancelCampaign: mockCancelCampaign,
    applyToCampaign: mockApplyToCampaign,
    extendCampaignDuration: mockExtendCampaignDuration
  }
}));

jest.unstable_mockModule('../src/middleware/multerMiddleware.js', () => ({
  upload: {
    fields: jest.fn(() => (req, res, next) => {
      req.files = {};
      next();
    }),
    single: jest.fn(() => (req, res, next) => next())
  }
}));

let campaignRouter;

beforeAll(async () => {
  campaignRouter = (await import('../src/modules/campaign/campaign.routes.js')).default;
});

afterEach(() => {
  // Restore the default brand user implementation for verifyJwt
  mockVerifyJwt.mockReset();
  mockVerifyJwt.mockImplementation(defaultBrandUser);
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/v1/campaigns', campaignRouter);
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Internal Server Error'
    });
  });
  return app;
}

const CAMP_ID = '507f1f77bcf86cd799439014';

describe('campaign.controller.js', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    currentValidator = (req, res, next) => next();
  });

  // ── Auth guard ──────────────────────────────────────────────────────
  describe('auth guard', () => {
    it('should return 401 if no token (verifyJwt rejects)', async () => {
      mockVerifyJwt.mockImplementationOnce((req, res, next) => {
        res.status(401).json({ success: false, message: 'Unauthorized' });
      });
      const app = buildApp();
      const res = await request(app).get('/api/v1/campaigns/');
      expect(res.status).toBe(401);
    });

    it('should return 403 if role middleware blocks brand-only route for influencer', async () => {
      mockVerifyJwt.mockImplementationOnce((req, res, next) => {
        req.user = { _id: 'inf_id', role: 'influencer' };
        next();
      });
      const app = buildApp();
      const res = await request(app).post('/api/v1/campaigns/').send({ name: 'X' });
      expect(res.status).toBe(403);
    });
  });

  // ── GET /api/v1/campaigns/ ──────────────────────────────────────────
  describe('GET /', () => {
    it('should return campaigns list', async () => {
      mockGetAllCampaigns.mockResolvedValue({ campaigns: [], total: 0, page: 1, pages: 1 });
      const app = buildApp();
      const res = await request(app).get('/api/v1/campaigns/');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should pass query params to service', async () => {
      mockGetAllCampaigns.mockResolvedValue({ campaigns: [], total: 0, page: 1, pages: 1 });
      const app = buildApp();
      await request(app).get('/api/v1/campaigns/?status=active&search=tech&page=2&limit=5');
      expect(mockGetAllCampaigns).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active', search: 'tech', page: '2', limit: '5' })
      );
    });
  });

  // ── POST /api/v1/campaigns/ ─────────────────────────────────────────
  describe('POST /', () => {
    it('should create a campaign', async () => {
      mockCreateCampaign.mockResolvedValue({ _id: CAMP_ID, name: 'New Campaign' });
      currentValidator = (req, res, next) => next();
      const app = buildApp();
      const res = await request(app).post('/api/v1/campaigns/').send({
        name: 'New Campaign',
        industry: 'Tech',
        platform: ['instagram'],
        budget: { min: 500, max: 2000 },
        campaignTimeline: { startDate: '2026-07-01', endDate: '2026-08-01' }
      });
      expect(res.status).toBe(201);
      expect(mockCreateCampaign).toHaveBeenCalled();
    });

    it('should normalize platform[] from multipart form data', async () => {
      mockCreateCampaign.mockResolvedValue({ _id: CAMP_ID });
      const app = buildApp();
      await request(app).post('/api/v1/campaigns/')
        .type('form')
        .send({ 'platform[]': ['instagram', 'youtube'], name: 'C', industry: 'T', 'budget[min]': '100', 'budget[max]': '500', 'campaignTimeline[startDate]': '2026-07-01', 'campaignTimeline[endDate]': '2026-08-01' });
      expect(mockCreateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ platform: ['instagram', 'youtube'] })
      );
    });

    it('should return 400 when validation fails', async () => {
      currentValidator = (req, res, next) => {
        res.status(400).json({ success: false, message: 'Validation failed', errors: [{ field: 'name', message: '"name" is required' }] });
      };
      const app = buildApp();
      const res = await request(app).post('/api/v1/campaigns/').send({});
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/v1/campaigns/:campaignId ───────────────────────────────
  describe('GET /:campaignId', () => {
    it('should return campaign by id', async () => {
      mockGetCampaignById.mockResolvedValue({ _id: CAMP_ID, name: 'Campaign' });
      const app = buildApp();
      const res = await request(app).get(`/api/v1/campaigns/${CAMP_ID}`);
      expect(res.status).toBe(200);
      expect(mockGetCampaignById).toHaveBeenCalledWith(CAMP_ID);
    });
  });

  // ── PATCH /api/v1/campaigns/:campaignId ─────────────────────────────
  describe('PATCH /:campaignId', () => {
    it('should update a campaign', async () => {
      mockUpdateCampaign.mockResolvedValue({ _id: CAMP_ID, name: 'Updated' });
      const app = buildApp();
      const res = await request(app).patch(`/api/v1/campaigns/${CAMP_ID}`).send({ name: 'Updated' });
      expect(res.status).toBe(200);
      expect(mockUpdateCampaign).toHaveBeenCalledWith(CAMP_ID, expect.objectContaining({ name: 'Updated' }));
    });
  });

  // ── DELETE /api/v1/campaigns/:campaignId ────────────────────────────
  describe('DELETE /:campaignId', () => {
    it('should delete a campaign', async () => {
      mockDeleteCampaign.mockResolvedValue({ _id: CAMP_ID, name: 'Campaign', isDeleted: true });
      const app = buildApp();
      const res = await request(app).delete(`/api/v1/campaigns/${CAMP_ID}`);
      expect(res.status).toBe(200);
      expect(mockDeleteCampaign).toHaveBeenCalledWith(CAMP_ID);
    });
  });

  // ── PATCH /api/v1/campaigns/:campaignId/cancel ──────────────────────
  describe('PATCH /:campaignId/cancel', () => {
    it('should cancel a campaign', async () => {
      mockCancelCampaign.mockResolvedValue({ _id: CAMP_ID, status: 'cancelled', cancelReason: 'No budget' });
      const app = buildApp();
      const res = await request(app).patch(`/api/v1/campaigns/${CAMP_ID}/cancel`).send({ cancelReason: 'No budget' });
      expect(res.status).toBe(200);
      expect(mockCancelCampaign).toHaveBeenCalled();
    });
  });

  // ── PATCH /api/v1/campaigns/:campaignId/extend ──────────────────────
  describe('PATCH /:campaignId/extend', () => {
    it('should extend campaign duration', async () => {
      const newEnd = '2026-09-01';
      mockExtendCampaignDuration.mockResolvedValue({ _id: CAMP_ID, campaignTimeline: { endDate: newEnd } });
      const app = buildApp();
      const res = await request(app).patch(`/api/v1/campaigns/${CAMP_ID}/extend?newEndDate=${newEnd}`);
      expect(res.status).toBe(200);
      expect(mockExtendCampaignDuration).toHaveBeenCalled();
    });

    it('should return 400 if newEndDate is missing', async () => {
      const app = buildApp();
      const res = await request(app).patch(`/api/v1/campaigns/${CAMP_ID}/extend`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/end date is required/i);
    });
  });

  // ── POST /api/v1/campaigns/:campaignId/apply ────────────────────────
  describe('POST /:campaignId/apply', () => {
    beforeEach(() => {
      mockVerifyJwt.mockReset();
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = { _id: 'inf_id', role: 'influencer', profileComplete: true };
        next();
      });
    });

    it('should apply as influencer', async () => {
      const campaign = { _id: CAMP_ID, brand: 'brand_id', status: 'active', name: 'Test', budget: { min: 100 }, description: '' };
      mockCampaignFindOne.mockResolvedValue(campaign);
      mockCollabFindOne.mockResolvedValue(null);
      mockCollabCreate.mockResolvedValue({ _id: 'req_1', brand: 'brand_id', influencer: 'inf_id', status: 'requested' });
      const app = buildApp();
      const res = await request(app).post(`/api/v1/campaigns/${CAMP_ID}/apply`).send({ note: 'Interested' });
      expect(res.status).toBe(201);
      expect(mockCollabCreate).toHaveBeenCalled();
    });

    it('should block apply when profile is incomplete', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = { _id: 'inf_id', role: 'influencer', profileComplete: false };
        next();
      });
      const app = buildApp();
      const res = await request(app).post(`/api/v1/campaigns/${CAMP_ID}/apply`).send({ note: 'Interested' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/complete your profile/i);
    });

    it('should return 400 if note is missing', async () => {
      currentValidator = (req, res, next) => {
        res.status(400).json({ success: false, message: 'Validation failed' });
      };
      const app = buildApp();
      const res = await request(app).post(`/api/v1/campaigns/${CAMP_ID}/apply`).send({});
      expect(res.status).toBe(400);
    });
  });

  // ── Service error propagation ──────────────────────────────────────
  describe('service error propagation', () => {
    it('should return 404 when campaign not found', async () => {
      mockGetCampaignById.mockRejectedValue({ statusCode: 404, message: 'Campaign not found' });
      const app = buildApp();
      const res = await request(app).get(`/api/v1/campaigns/${CAMP_ID}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Campaign not found');
    });

    it('should return 400 when service throws validation error', async () => {
      mockDeleteCampaign.mockRejectedValue({ statusCode: 400, message: 'Cannot delete a campaign with accepted influencers' });
      const app = buildApp();
      const res = await request(app).delete(`/api/v1/campaigns/${CAMP_ID}`);
      expect(res.status).toBe(400);
    });
  });
});
