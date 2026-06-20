import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// ── Mock middleware & service before any imports ──
const mockVerifyJwt = jest.fn((req, res, next) => {
  req.user = {
    _id: 'test_brand_id',
    role: 'brand',
    email: 'brand@test.com',
    fullname: 'Test Brand',
    stripeCustomerId: 'cus_test',
    stripeAccountId: null,
    stripeOnboardingComplete: false
  };
  next();
});

const mockRoleMiddleware = jest.fn((...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
  }
  next();
});

// Mock validate to pass through by default (individual tests override)
const mockValidate = jest.fn(() => (req, res, next) => next());

jest.unstable_mockModule('../src/middleware/authMiddleware.js', () => ({
  verifyJwt: mockVerifyJwt
}));

jest.unstable_mockModule('../src/middleware/roleMiddleware.js', () => ({
  roleMiddleware: mockRoleMiddleware
}));

jest.unstable_mockModule('../src/middleware/validationMiddleware.js', () => ({
  validate: mockValidate
}));

// Mock service methods
const mockCreateEscrowPaymentIntent = jest.fn();
const mockSyncEscrowStatus = jest.fn();
const mockCreateConnectAccount = jest.fn();
const mockCreateAccountLink = jest.fn();
const mockListPaymentMethods = jest.fn();
const mockCreateSetupIntent = jest.fn();
const mockDetachPaymentMethod = jest.fn();
const mockGetPaymentHistory = jest.fn();

jest.unstable_mockModule('../src/modules/payment/stripe.service.js', () => ({
  stripe: {
    webhooks: {
      constructEvent: jest.fn()
    },
    paymentMethods: {
      retrieve: jest.fn()
    }
  },
  stripeService: {
    createEscrowPaymentIntent: mockCreateEscrowPaymentIntent,
    syncEscrowStatus: mockSyncEscrowStatus,
    transferDeliverablePayout: jest.fn(),
    createConnectAccount: mockCreateConnectAccount,
    createAccountLink: mockCreateAccountLink,
    listPaymentMethods: mockListPaymentMethods,
    createSetupIntent: mockCreateSetupIntent,
    detachPaymentMethod: mockDetachPaymentMethod,
    getPaymentHistory: mockGetPaymentHistory,
    handlePaymentIntentSucceeded: jest.fn(),
    handleAccountUpdated: jest.fn()
  }
}));

// ── Dynamic imports ──
let stripeController, stripeRouter, stripeService;

beforeAll(async () => {
  const controllerMod = await import('../src/modules/payment/stripe.controller.js');
  stripeController = controllerMod.stripeController;

  const { stripe } = await import('../src/modules/payment/stripe.service.js');
  stripeService = (await import('../src/modules/payment/stripe.service.js')).stripeService;
  stripeRouter = (await import('../src/modules/payment/stripe.routes.js')).default;
});

// ── Build test app ──
// Does not reassign mocks — tests set up mockVerifyJwt before calling buildApp
function buildApp() {
  const app = express();
  app.use(express.json());

  // Webhook route (raw body)
  app.post('/api/v1/payment/webhook', express.raw({ type: 'application/json' }), stripeController.stripeWebhook);

  app.use('/api/v1/payment', stripeRouter);
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Internal Server Error'
    });
  });
  return app;
}

// Default brand user injected by mockVerifyJwt
const defaultBrandUser = {
  _id: 'test_brand_id',
  role: 'brand',
  email: 'brand@test.com',
  fullname: 'Test Brand',
  stripeCustomerId: 'cus_test',
  stripeAccountId: null,
  stripeOnboardingComplete: false
};

const defaultInfluencerUser = {
  _id: 'test_influencer_id',
  role: 'influencer',
  email: 'inf@test.com',
  fullname: 'Test Influencer',
  stripeAccountId: 'acct_123',
  stripeOnboardingComplete: true
};

describe('stripe.controller.js (Integration)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidate.mockImplementation(() => (req, res, next) => next());
    // Default: brand user
    mockVerifyJwt.mockImplementation((req, res, next) => {
      req.user = { ...defaultBrandUser };
      next();
    });
  });

  // ──────────────────────────────────────────────
  // Webhook
  // ──────────────────────────────────────────────
  describe('POST /api/v1/payment/webhook', () => {
    it('should return 400 when stripe-signature is missing', async () => {
      const app = buildApp();

      const { stripe } = await import('../src/modules/payment/stripe.service.js');
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found');
      });

      const res = await request(app)
        .post('/api/v1/payment/webhook')
        .send({ type: 'payment_intent.succeeded', data: { object: {} } });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Webhook Error');
    });

    it('should return 400 on invalid signature', async () => {
      const app = buildApp();

      const { stripe } = await import('../src/modules/payment/stripe.service.js');
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const res = await request(app)
        .post('/api/v1/payment/webhook')
        .set('stripe-signature', 'invalid')
        .send({ type: 'payment_intent.succeeded', data: { object: {} } });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Webhook Error');
    });

    it('should handle payment_intent.succeeded event', async () => {
      const app = buildApp();

      const { stripe } = await import('../src/modules/payment/stripe.service.js');
      const fakeEvent = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_123' } } };
      stripe.webhooks.constructEvent.mockReturnValue(fakeEvent);

      const res = await request(app)
        .post('/api/v1/payment/webhook')
        .set('stripe-signature', 'valid_sig')
        .send(fakeEvent);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(stripeService.handlePaymentIntentSucceeded).toHaveBeenCalledWith(fakeEvent.data.object);
    });

    it('should handle account.updated event', async () => {
      const app = buildApp();

      const { stripe } = await import('../src/modules/payment/stripe.service.js');
      const fakeEvent = { type: 'account.updated', data: { object: { id: 'acct_123' } } };
      stripe.webhooks.constructEvent.mockReturnValue(fakeEvent);

      const res = await request(app)
        .post('/api/v1/payment/webhook')
        .set('stripe-signature', 'valid_sig')
        .send(fakeEvent);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(stripeService.handleAccountUpdated).toHaveBeenCalledWith(fakeEvent.data.object);
    });

    it('should ignore checkout.session.completed event', async () => {
      const app = buildApp();

      const { stripe } = await import('../src/modules/payment/stripe.service.js');
      const fakeEvent = { type: 'checkout.session.completed', data: { object: { id: 'cs_123' } } };
      stripe.webhooks.constructEvent.mockReturnValue(fakeEvent);

      const res = await request(app)
        .post('/api/v1/payment/webhook')
        .set('stripe-signature', 'valid_sig')
        .send(fakeEvent);

      expect(res.status).toBe(200);
      expect(stripeService.handlePaymentIntentSucceeded).not.toHaveBeenCalled();
      expect(stripeService.handleAccountUpdated).not.toHaveBeenCalled();
    });

    it('should return 500 when webhook handler throws', async () => {
      const app = buildApp();

      const { stripe } = await import('../src/modules/payment/stripe.service.js');
      stripe.webhooks.constructEvent.mockReturnValue({ type: 'payment_intent.succeeded', data: { object: {} } });
      stripeService.handlePaymentIntentSucceeded.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/api/v1/payment/webhook')
        .set('stripe-signature', 'valid_sig')
        .send({ type: 'payment_intent.succeeded', data: { object: {} } });

      expect(res.status).toBe(500);
      expect(res.text).toContain('Internal Server Error');
    });
  });

  // ──────────────────────────────────────────────
  // Auth guard (all protected routes)
  // ──────────────────────────────────────────────
  describe('Authentication', () => {
    it('should return 401 when no user is set by verifyJwt', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        return res.status(401).json({ success: false, message: 'unauthorized request' });
      });

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/escrow/fund')
        .send({ collaborationId: 'collab_1' });

      expect(res.status).toBe(401);
    });

    it('should return 403 when brand tries influencer route', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/connect/onboard');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should return 403 when influencer tries brand route', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = { _id: 'test_influencer_id', role: 'influencer', stripeAccountId: 'acct_123' };
        next();
      });
      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/escrow/fund')
        .send({ collaborationId: 'collab_1' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should allow brand on brand routes', async () => {
      mockCreateEscrowPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_secret',
        paymentIntentId: 'pi_new'
      });

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/escrow/fund')
        .send({ collaborationId: 'collab_1' });

      expect(res.status).toBe(200);
    });

    it('should allow influencer on influencer routes', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = { _id: 'test_influencer_id', role: 'influencer', stripeAccountId: 'acct_123' };
        next();
      });
      mockCreateConnectAccount.mockResolvedValue('acct_new');
      mockCreateAccountLink.mockResolvedValue('https://connect.stripe.com/onboard');

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/connect/onboard');

      expect(res.status).toBe(200);
    });

    it('should allow both roles on /history', async () => {
      mockGetPaymentHistory.mockResolvedValue([]);

      // Brand
      const appBrand = buildApp();
      const brandRes = await request(appBrand).get('/api/v1/payment/history');
      expect(brandRes.status).toBe(200);

      // Influencer
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = { _id: 'test_influencer_id', role: 'influencer' };
        next();
      });
      const appInf = buildApp();
      const infRes = await request(appInf).get('/api/v1/payment/history');
      expect(infRes.status).toBe(200);
    });
  });

  // ──────────────────────────────────────────────
  // Fund Escrow
  // ──────────────────────────────────────────────
  describe('POST /api/v1/payment/escrow/fund', () => {
    it('should return 400 when collaborationId is missing', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/escrow/fund')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 200 with clientSecret and paymentIntentId', async () => {
      mockCreateEscrowPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_secret_123',
        paymentIntentId: 'pi_123'
      });

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/escrow/fund')
        .send({ collaborationId: 'collab_1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.clientSecret).toBe('pi_secret_123');
      expect(res.body.data.paymentIntentId).toBe('pi_123');
      expect(res.body.message).toBe('Escrow PaymentIntent created');
    });

    it('should return 400 when service throws ApiError (e.g. already funded)', async () => {
      const { ApiError } = await import('../src/utils/ApiError.js');
      const { validationStatus } = await import('../src/utils/ValidationStatusCode.js');
      mockCreateEscrowPaymentIntent.mockRejectedValue(
        new ApiError(validationStatus.badRequest, 'Already funded')
      );

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/escrow/fund')
        .send({ collaborationId: 'collab_1' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Already funded');
    });
  });

  // ──────────────────────────────────────────────
  // Sync Escrow Status
  // ──────────────────────────────────────────────
  describe('POST /api/v1/payment/escrow/sync', () => {
    it('should return 400 when collaborationId is missing', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/escrow/sync')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 200 with sync result', async () => {
      mockSyncEscrowStatus.mockResolvedValue({ needsPayment: true });

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/escrow/sync')
        .send({ collaborationId: 'collab_1' });

      expect(res.status).toBe(200);
      expect(res.body.data.needsPayment).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Payment Methods
  // ──────────────────────────────────────────────
  describe('GET /api/v1/payment/methods', () => {
    it('should return 200 with payment methods list', async () => {
      mockListPaymentMethods.mockResolvedValue([{ id: 'pm_1' }, { id: 'pm_2' }]);

      const app = buildApp();

      const res = await request(app).get('/api/v1/payment/methods');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/v1/payment/methods/setup', () => {
    it('should return 200 with clientSecret', async () => {
      mockCreateSetupIntent.mockResolvedValue({ client_secret: 'seti_secret' });

      const app = buildApp();

      const res = await request(app).post('/api/v1/payment/methods/setup');

      expect(res.status).toBe(200);
      expect(res.body.data.clientSecret).toBe('seti_secret');
    });
  });

  describe('DELETE /api/v1/payment/methods/:id', () => {
    it('should return 403 when payment method belongs to another customer', async () => {
      const { stripe } = await import('../src/modules/payment/stripe.service.js');
      stripe.paymentMethods.retrieve.mockResolvedValue({ customer: 'cus_other' });

      const app = buildApp();

      const res = await request(app)
        .delete('/api/v1/payment/methods/pm_123');

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("You don't own this payment method");
    });

    it('should return 200 on successful detach', async () => {
      const { stripe } = await import('../src/modules/payment/stripe.service.js');
      stripe.paymentMethods.retrieve.mockResolvedValue({ customer: 'cus_test' });
      mockDetachPaymentMethod.mockResolvedValue(undefined);

      const app = buildApp();

      const res = await request(app)
        .delete('/api/v1/payment/methods/pm_123');

      expect(res.status).toBe(200);
      expect(mockDetachPaymentMethod).toHaveBeenCalledWith('pm_123', 'test_brand_id');
    });
  });

  // ──────────────────────────────────────────────
  // Connect Onboarding
  // ──────────────────────────────────────────────
  describe('POST /api/v1/payment/connect/onboard', () => {
    it('should return 200 with onboarding URL', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = { _id: 'test_influencer_id', role: 'influencer', stripeAccountId: null };
        next();
      });
      mockCreateConnectAccount.mockResolvedValue('acct_new');
      mockCreateAccountLink.mockResolvedValue('https://connect.stripe.com/onboard');

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/connect/onboard');

      expect(res.status).toBe(200);
      expect(res.body.data.url).toBe('https://connect.stripe.com/onboard');
    });
  });

  // ──────────────────────────────────────────────
  // Deliverable Actions
  // ──────────────────────────────────────────────
  describe('POST /api/v1/payment/deliverable/:id/start', () => {
    it('should return 404 when deliverable not found', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = {
          _id: 'test_influencer_id',
          role: 'influencer',
          stripeAccountId: 'acct_123',
          stripeOnboardingComplete: true
        };
        next();
      });

      const Collaboration = (await import('../src/modules/collaboration/collaboration.model.js')).default;
      Collaboration.findOne = jest.fn().mockResolvedValue(null);

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/deliverable/deliv_1/start');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Deliverable not found or access denied');
    });

    it('should return 403 when escrow is not funded', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = {
          _id: 'test_influencer_id',
          role: 'influencer',
          stripeAccountId: 'acct_123',
          stripeOnboardingComplete: true
        };
        next();
      });

      const Collaboration = (await import('../src/modules/collaboration/collaboration.model.js')).default;
      Collaboration.findOne = jest.fn().mockResolvedValue({
        escrowFunded: false,
        deliverables: [{ _id: 'deliv_1', status: 'PENDING' }],
        deliverables: { id: () => ({ _id: 'deliv_1', status: 'PENDING' }) },
        save: jest.fn()
      });

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/deliverable/deliv_1/start');

      expect(res.status).toBe(403);
    });

    it('should return 403 when influencer has no Stripe account', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = {
          _id: 'test_influencer_id',
          role: 'influencer',
          stripeAccountId: null
        };
        next();
      });

      const Collaboration = (await import('../src/modules/collaboration/collaboration.model.js')).default;
      Collaboration.findOne = jest.fn().mockResolvedValue({
        escrowFunded: true,
        deliverables: { id: () => ({ _id: 'deliv_1', status: 'PENDING' }) },
        save: jest.fn()
      });

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/deliverable/deliv_1/start');

      expect(res.status).toBe(403);
    });

    it('should return 200 on successful start', async () => {
      mockVerifyJwt.mockImplementation((req, res, next) => {
        req.user = {
          _id: 'test_influencer_id',
          role: 'influencer',
          stripeAccountId: 'acct_123',
          stripeOnboardingComplete: true
        };
        next();
      });

      const Collaboration = (await import('../src/modules/collaboration/collaboration.model.js')).default;
      const mockDeliverable = { _id: 'deliv_1', status: 'PENDING' };
      Collaboration.findOne = jest.fn().mockResolvedValue({
        escrowFunded: true,
        deliverables: { id: () => mockDeliverable },
        save: jest.fn().mockResolvedValue(true)
      });

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/deliverable/deliv_1/start');

      expect(res.status).toBe(200);
      expect(mockDeliverable.status).toBe('IN_PROGRESS');
    });
  });

  describe('POST /api/v1/payment/deliverable/:id/approve', () => {
    it('should return 404 when deliverable not found', async () => {
      const Collaboration = (await import('../src/modules/collaboration/collaboration.model.js')).default;
      Collaboration.findOne = jest.fn().mockResolvedValue(null);

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/deliverable/deliv_1/approve');

      expect(res.status).toBe(404);
    });

    it('should return 200 on successful approval', async () => {
      const Collaboration = (await import('../src/modules/collaboration/collaboration.model.js')).default;
      Collaboration.findOne = jest.fn().mockResolvedValue({
        _id: 'collab_1',
        brand: 'test_brand_id',
        deliverables: { id: () => ({ _id: 'deliv_1', title: 'Test' }) },
        save: jest.fn()
      });
      stripeService.transferDeliverablePayout = jest.fn().mockResolvedValue(undefined);

      const app = buildApp();

      const res = await request(app)
        .post('/api/v1/payment/deliverable/deliv_1/approve');

      expect(res.status).toBe(200);
      expect(stripeService.transferDeliverablePayout).toHaveBeenCalledWith('collab_1', 'deliv_1');
    });
  });

  // ──────────────────────────────────────────────
  // Payment History
  // ──────────────────────────────────────────────
  describe('GET /api/v1/payment/history', () => {
    it('should return 200 with payment history', async () => {
      mockGetPaymentHistory.mockResolvedValue([{ id: 'pay_1', amount: 500 }]);

      const app = buildApp();

      const res = await request(app).get('/api/v1/payment/history');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(mockGetPaymentHistory).toHaveBeenCalledWith('test_brand_id', 'brand');
    });
  });
});
