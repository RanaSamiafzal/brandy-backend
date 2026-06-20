import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockVerifyJwt = jest.fn((req, res, next) => {
  req.user = {
    _id: '507f1f77bcf86cd799439011',
    role: 'brand',
    email: 'brand@test.com',
    fullname: 'Test Brand'
  };
  next();
});

// Shared validator that tests can override — evaluated at REQUEST time
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

// Mock all collaborationService methods
const mockSendRequest = jest.fn();
const mockGetRequests = jest.fn();
const mockAcceptRequest = jest.fn();
const mockUpdateRequestStatus = jest.fn();
const mockCounterOffer = jest.fn();
const mockGetCollaborations = jest.fn();
const mockGetCollaborationDetails = jest.fn();
const mockGetLatestCollaborationWithUser = jest.fn();
const mockUpdateCollaborationStatus = jest.fn();
const mockSubmitActionRequest = jest.fn();
const mockHandleActionRequest = jest.fn();
const mockCompleteCollaboration = jest.fn();
const mockAddDeliverable = jest.fn();
const mockUpdateDeliverable = jest.fn();
const mockSubmitDeliverable = jest.fn();
const mockReviewDeliverable = jest.fn();
const mockDeleteDeliverable = jest.fn();
const mockSubmitInfluencerReview = jest.fn();
const mockConfirmAgreement = jest.fn();

jest.unstable_mockModule('../src/modules/collaboration/collaboration.service.js', () => ({
  collaborationService: {
    sendRequest: mockSendRequest,
    getRequests: mockGetRequests,
    acceptRequest: mockAcceptRequest,
    updateRequestStatus: mockUpdateRequestStatus,
    counterOffer: mockCounterOffer,
    getCollaborations: mockGetCollaborations,
    getCollaborationDetails: mockGetCollaborationDetails,
    getLatestCollaborationWithUser: mockGetLatestCollaborationWithUser,
    updateCollaborationStatus: mockUpdateCollaborationStatus,
    submitActionRequest: mockSubmitActionRequest,
    handleActionRequest: mockHandleActionRequest,
    completeCollaboration: mockCompleteCollaboration,
    addDeliverable: mockAddDeliverable,
    updateDeliverable: mockUpdateDeliverable,
    submitDeliverable: mockSubmitDeliverable,
    reviewDeliverable: mockReviewDeliverable,
    deleteDeliverable: mockDeleteDeliverable,
    submitInfluencerReview: mockSubmitInfluencerReview,
    confirmAgreement: mockConfirmAgreement
  }
}));

let collaborationRouter, collaborationService;

beforeAll(async () => {
  collaborationRouter = (await import('../src/modules/collaboration/collaboration.routes.js')).default;
  const svc = await import('../src/modules/collaboration/collaboration.service.js');
  collaborationService = svc.collaborationService;
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/collaborations', collaborationRouter);
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Internal Server Error'
    });
  });
  return app;
}

const BRAND_ID = '507f1f77bcf86cd799439011';
const INF_ID = '507f1f77bcf86cd799439012';
const REQ_ID = '507f1f77bcf86cd799439015';
const COLLAB_ID = '507f1f77bcf86cd799439016';
const DELIV_ID = '507f1f77bcf86cd799439017';
const CAMP_ID = '507f1f77bcf86cd799439014';

describe('collaboration.controller.js (Integration)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    currentValidator = (req, res, next) => next();
    mockVerifyJwt.mockImplementation((req, res, next) => {
      req.user = { _id: BRAND_ID, role: 'brand', email: 'brand@test.com', fullname: 'Test Brand' };
      next();
    });
  });

  // ──────────────────────────────────────────────
  // Auth
  // ──────────────────────────────────────────────
  describe('Authentication', () => {
    it('should return 401 when no user is set by verifyJwt', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        return res.status(401).json({ success: false, message: 'unauthorized request' });
      });

      const res = await request(buildApp()).get('/api/v1/collaborations/');
      expect(res.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────
  // Send Request
  // ──────────────────────────────────────────────
  describe('POST /api/v1/collaborations/request', () => {
    it('should return 201 on successful send', async () => {
      const mockRequest = { _id: REQ_ID, status: 'requested' };
      mockSendRequest.mockResolvedValue(mockRequest);

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/collaborations/request')
        .send({ receiverId: INF_ID, campaignId: CAMP_ID, proposedBudget: 1000 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(REQ_ID);
      expect(mockSendRequest).toHaveBeenCalledWith(BRAND_ID, {
        receiverId: INF_ID,
        campaignId: CAMP_ID,
        proposedBudget: 1000,
        initiatedBy: 'brand'
      });
    });

    it('should return 400 when validation fails', async () => {
      currentValidator = (req, res, next) => {
        return res.status(400).json({ success: false, message: 'Validation failed' });
      };

      const res = await request(buildApp())
        .post('/api/v1/collaborations/request')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ──────────────────────────────────────────────
  // Get Requests
  // ──────────────────────────────────────────────
  describe('GET /api/v1/collaborations/request', () => {
    it('should return 200 with requests list', async () => {
      mockGetRequests.mockResolvedValue({ requests: [{ _id: REQ_ID }], total: 1, page: 1, pages: 1 });

      const res = await request(buildApp()).get('/api/v1/collaborations/request');
      expect(res.status).toBe(200);
      expect(res.body.data.requests).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────
  // Accept / Reject / Cancel Request
  // ──────────────────────────────────────────────
  describe('POST /api/v1/collaborations/request/:requestId/accept', () => {
    it('should return 200 on accept', async () => {
      mockAcceptRequest.mockResolvedValue({ request: { _id: REQ_ID }, collaboration: { _id: COLLAB_ID } });

      const res = await request(buildApp()).post(`/api/v1/collaborations/request/${REQ_ID}/accept`);
      expect(res.status).toBe(200);
      expect(mockAcceptRequest).toHaveBeenCalledWith(REQ_ID, BRAND_ID);
    });
  });

  describe('POST /api/v1/collaborations/request/:requestId/reject', () => {
    it('should return 200 on reject', async () => {
      mockUpdateRequestStatus.mockResolvedValue({ _id: REQ_ID, status: 'rejected' });

      const res = await request(buildApp()).post(`/api/v1/collaborations/request/${REQ_ID}/reject`);
      expect(res.status).toBe(200);
      expect(mockUpdateRequestStatus).toHaveBeenCalledWith(REQ_ID, BRAND_ID, 'rejected');
    });
  });

  describe('POST /api/v1/collaborations/request/:requestId/cancel', () => {
    it('should return 200 on cancel', async () => {
      mockUpdateRequestStatus.mockResolvedValue({ _id: REQ_ID, status: 'cancelled' });

      const res = await request(buildApp()).post(`/api/v1/collaborations/request/${REQ_ID}/cancel`);
      expect(res.status).toBe(200);
      expect(mockUpdateRequestStatus).toHaveBeenCalledWith(REQ_ID, BRAND_ID, 'cancelled');
    });
  });

  // ──────────────────────────────────────────────
  // Counter Offer
  // ──────────────────────────────────────────────
  describe('POST /api/v1/collaborations/request/:requestId/counter-offer', () => {
    it('should return 200 on counter offer', async () => {
      mockCounterOffer.mockResolvedValue({ _id: REQ_ID, agreedBudget: 1500 });

      const res = await request(buildApp())
        .post(`/api/v1/collaborations/request/${REQ_ID}/counter-offer`)
        .send({ newBudget: 1500, note: 'Counter offer' });
      expect(res.status).toBe(200);
      expect(mockCounterOffer).toHaveBeenCalledWith(REQ_ID, BRAND_ID, { newBudget: 1500, note: 'Counter offer' });
    });
  });

  // ──────────────────────────────────────────────
  // Get Collaborations
  // ──────────────────────────────────────────────
  describe('GET /api/v1/collaborations/', () => {
    it('should return 200 with collaborations', async () => {
      mockGetCollaborations.mockResolvedValue({ collaborations: [{ _id: COLLAB_ID }], total: 1, page: 1, pages: 1 });

      const res = await request(buildApp()).get('/api/v1/collaborations/');
      expect(res.status).toBe(200);
    });
  });

  // ──────────────────────────────────────────────
  // Get Collaboration Details
  // ──────────────────────────────────────────────
  describe('GET /api/v1/collaborations/:id', () => {
    it('should return 200 with details', async () => {
      mockGetCollaborationDetails.mockResolvedValue({ _id: COLLAB_ID, status: 'active' });

      const res = await request(buildApp()).get(`/api/v1/collaborations/${COLLAB_ID}`);
      expect(res.status).toBe(200);
      expect(mockGetCollaborationDetails).toHaveBeenCalledWith(COLLAB_ID, BRAND_ID);
    });
  });

  // ──────────────────────────────────────────────
  // Get Latest
  // ──────────────────────────────────────────────
  describe('GET /api/v1/collaborations/latest/:otherUserId', () => {
    it('should return 200 with latest collaboration', async () => {
      mockGetLatestCollaborationWithUser.mockResolvedValue({ _id: COLLAB_ID });

      const res = await request(buildApp()).get(`/api/v1/collaborations/latest/${INF_ID}`);
      expect(res.status).toBe(200);
      expect(mockGetLatestCollaborationWithUser).toHaveBeenCalledWith(BRAND_ID, INF_ID);
    });

    it('should return 200 with null when no active collaboration', async () => {
      mockGetLatestCollaborationWithUser.mockResolvedValue(null);

      const res = await request(buildApp()).get(`/api/v1/collaborations/latest/${INF_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });
  });

  // ──────────────────────────────────────────────
  // Cancel / Complete / Suspend
  // ──────────────────────────────────────────────
  describe('PATCH /api/v1/collaborations/:id/cancel', () => {
    it('should return 200 on cancel', async () => {
      mockUpdateCollaborationStatus.mockResolvedValue({ _id: COLLAB_ID, status: 'cancelled' });

      const res = await request(buildApp())
        .patch(`/api/v1/collaborations/${COLLAB_ID}/cancel`)
        .send({ reason: 'No longer needed' });
      expect(res.status).toBe(200);
      expect(mockUpdateCollaborationStatus).toHaveBeenCalledWith(COLLAB_ID, BRAND_ID, 'cancelled', 'No longer needed');
    });
  });

  describe('PATCH /api/v1/collaborations/:id/complete', () => {
    it('should return 200 on complete', async () => {
      mockCompleteCollaboration.mockResolvedValue({ _id: COLLAB_ID, status: 'completed' });

      const res = await request(buildApp())
        .patch(`/api/v1/collaborations/${COLLAB_ID}/complete`)
        .send({ reviewData: { rating: 5, comment: 'Great!' } });
      expect(res.status).toBe(200);
      expect(mockCompleteCollaboration).toHaveBeenCalledWith(COLLAB_ID, BRAND_ID, { rating: 5, comment: 'Great!' });
    });
  });

  describe('PATCH /api/v1/collaborations/:id/suspend', () => {
    it('should return 200 on suspend', async () => {
      mockUpdateCollaborationStatus.mockResolvedValue({ _id: COLLAB_ID, status: 'suspended' });

      const res = await request(buildApp()).patch(`/api/v1/collaborations/${COLLAB_ID}/suspend`);
      expect(res.status).toBe(200);
    });
  });

  // ──────────────────────────────────────────────
  // Action Request
  // ──────────────────────────────────────────────
  describe('POST /api/v1/collaborations/:id/request-action', () => {
    it('should return 200 on action request', async () => {
      mockSubmitActionRequest.mockResolvedValue({ _id: COLLAB_ID });

      const res = await request(buildApp())
        .post(`/api/v1/collaborations/${COLLAB_ID}/request-action`)
        .send({ type: 'CANCEL', reason: 'Project scope changed' });
      expect(res.status).toBe(200);
      expect(mockSubmitActionRequest).toHaveBeenCalledWith(COLLAB_ID, BRAND_ID, { type: 'CANCEL', reason: 'Project scope changed' });
    });
  });

  describe('POST /api/v1/collaborations/:id/handle-action', () => {
    it('should return 200 on handling action', async () => {
      mockHandleActionRequest.mockResolvedValue({ _id: COLLAB_ID });

      const res = await request(buildApp())
        .post(`/api/v1/collaborations/${COLLAB_ID}/handle-action`)
        .send({ action: 'APPROVE' });
      expect(res.status).toBe(200);
      expect(mockHandleActionRequest).toHaveBeenCalledWith(COLLAB_ID, BRAND_ID, { action: 'APPROVE' });
    });
  });

  // ──────────────────────────────────────────────
  // Deliverables
  // ──────────────────────────────────────────────
  describe('POST /api/v1/collaborations/:id/deliverables', () => {
    it('should return 201 on add deliverable', async () => {
      const delivData = { title: 'Post', platform: 'instagram', dueDate: '2026-07-01', allocatedBudget: 500 };
      mockAddDeliverable.mockResolvedValue({ _id: COLLAB_ID, deliverables: [{ ...delivData, _id: DELIV_ID }] });

      const res = await request(buildApp())
        .post(`/api/v1/collaborations/${COLLAB_ID}/deliverables`)
        .send(delivData);
      expect(res.status).toBe(201);
      expect(mockAddDeliverable).toHaveBeenCalledWith(COLLAB_ID, BRAND_ID, delivData);
    });
  });

  describe('PATCH /api/v1/collaborations/:id/deliverables/:deliverableId', () => {
    it('should return 200 on update deliverable', async () => {
      mockUpdateDeliverable.mockResolvedValue({ _id: COLLAB_ID });

      const res = await request(buildApp())
        .patch(`/api/v1/collaborations/${COLLAB_ID}/deliverables/${DELIV_ID}`)
        .send({ title: 'Updated Post' });
      expect(res.status).toBe(200);
      expect(mockUpdateDeliverable).toHaveBeenCalledWith(COLLAB_ID, DELIV_ID, BRAND_ID, { title: 'Updated Post' });
    });
  });

  describe('DELETE /api/v1/collaborations/:id/deliverables/:deliverableId', () => {
    it('should return 200 on delete deliverable', async () => {
      mockDeleteDeliverable.mockResolvedValue({ _id: COLLAB_ID });

      const res = await request(buildApp()).delete(`/api/v1/collaborations/${COLLAB_ID}/deliverables/${DELIV_ID}`);
      expect(res.status).toBe(200);
      expect(mockDeleteDeliverable).toHaveBeenCalledWith(COLLAB_ID, DELIV_ID, BRAND_ID);
    });
  });

  describe('POST /api/v1/collaborations/:id/deliverables/:deliverableId/submit', () => {
    it('should return 200 on submit deliverable', async () => {
      mockSubmitDeliverable.mockResolvedValue({ _id: COLLAB_ID });

      const res = await request(buildApp())
        .post(`/api/v1/collaborations/${COLLAB_ID}/deliverables/${DELIV_ID}/submit`)
        .send({ submissionFiles: ['https://example.com/file.mp4'] });
      expect(res.status).toBe(200);
      expect(mockSubmitDeliverable).toHaveBeenCalledWith(COLLAB_ID, DELIV_ID, BRAND_ID, {
        submissionFiles: ['https://example.com/file.mp4']
      });
    });
  });

  describe('PATCH /api/v1/collaborations/:id/deliverables/:deliverableId/review', () => {
    it('should return 200 on review deliverable', async () => {
      mockReviewDeliverable.mockResolvedValue({ _id: COLLAB_ID });

      const res = await request(buildApp())
        .patch(`/api/v1/collaborations/${COLLAB_ID}/deliverables/${DELIV_ID}/review`)
        .send({ status: 'APPROVED' });
      expect(res.status).toBe(200);
      expect(mockReviewDeliverable).toHaveBeenCalledWith(COLLAB_ID, DELIV_ID, BRAND_ID, { status: 'APPROVED' });
    });
  });

  // ──────────────────────────────────────────────
  // Influencer Review
  // ──────────────────────────────────────────────
  describe('POST /api/v1/collaborations/:id/influencer-review', () => {
    it('should return 200 on influencer review', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = { _id: INF_ID, role: 'influencer', email: 'inf@test.com' };
        next();
      });
      mockSubmitInfluencerReview.mockResolvedValue({ _id: COLLAB_ID, influencerReview: { rating: 4 } });

      const res = await request(buildApp())
        .post(`/api/v1/collaborations/${COLLAB_ID}/influencer-review`)
        .send({ rating: 4, comment: 'Great brand!' });
      expect(res.status).toBe(200);
      expect(mockSubmitInfluencerReview).toHaveBeenCalledWith(COLLAB_ID, INF_ID, { rating: 4, comment: 'Great brand!' });
    });
  });

  // ──────────────────────────────────────────────
  // Confirm Agreement
  // ──────────────────────────────────────────────
  describe('POST /api/v1/collaborations/:id/confirm-agreement', () => {
    it('should return 200 on confirm agreement', async () => {
      mockConfirmAgreement.mockResolvedValue({ _id: COLLAB_ID, brandAgreed: true, influencerAgreed: true });

      const res = await request(buildApp()).post(`/api/v1/collaborations/${COLLAB_ID}/confirm-agreement`);
      expect(res.status).toBe(200);
      expect(mockConfirmAgreement).toHaveBeenCalledWith(COLLAB_ID, BRAND_ID);
    });
  });
});
