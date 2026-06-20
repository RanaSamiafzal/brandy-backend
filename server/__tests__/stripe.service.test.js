import { jest } from '@jest/globals';
import mongoose from 'mongoose';

// ── Mock dependencies before module imports ──
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

// ── Dynamic imports ──
let stripeService, stripe;
let Collaboration, User, Payment, Campaign;

beforeAll(async () => {
  const mod = await import('../src/modules/payment/stripe.service.js');
  stripeService = mod.stripeService;
  stripe = mod.stripe;

  Collaboration = (await import('../src/modules/collaboration/collaboration.model.js')).default;
  User = (await import('../src/modules/user/user.model.js')).default;
  Payment = (await import('../src/modules/payment/payment.model.js')).default;
  Campaign = (await import('../src/modules/campaign/campaign.model.js')).default;
});

// ── Helpers ──
const makeUser = (overrides = {}) => ({
  _id: 'user_brand_1',
  email: 'brand@test.com',
  fullname: 'Test Brand',
  stripeCustomerId: null,
  stripeAccountId: null,
  stripeOnboardingComplete: false,
  save: jest.fn().mockResolvedValue(true),
  ...overrides
});

const makeDeliverable = (overrides = {}) => ({
  _id: 'deliv_1',
  title: 'Test Deliverable',
  status: 'SUBMITTED',
  paymentStatus: 'unpaid',
  allocatedBudget: 500,
  isFinal: false,
  approvedAt: null,
  stripeTransferId: null,
  submissionFiles: ['https://example.com/file'],
  ...overrides
});

// Creates array of deliverables with Mongoose-like .id() method
const makeDeliverables = (...items) => {
  const arr = [...items];
  arr.id = (id) => arr.find(d => d._id === id);
  return arr;
};

const makeCollaboration = (overrides = {}) => {
  const defaults = {
    _id: 'collab_1',
    brand: 'user_brand_1',
    influencer: 'user_influencer_1',
    campaign: { _id: 'camp_1' },
    status: 'awaiting_funds',
    escrowFunded: false,
    agreedBudget: 1000,
    totalFundedAmount: 0,
    totalPaidAmount: 0,
    stripePaymentIntentId: null,
    brandAgreed: true,
    influencerAgreed: true,
    currency: 'USD',
    title: 'Test Project',
    fundingHistory: [],
    refundHistory: [],
    deliverables: makeDeliverables(),
    save: jest.fn().mockResolvedValue(true),
  };
  const collab = { ...defaults, ...overrides };
  if (overrides.deliverables) {
    collab.deliverables = makeDeliverables(...overrides.deliverables);
  }
  return collab;
};

// Mocking helper: returns object with .populate() chain
const mockFindById = (result) => {
  Collaboration.findById = jest.fn().mockImplementation(() => ({
    populate: jest.fn().mockResolvedValue(result)
  }));
};

// Mocking helper for session-based queries (transferDeliverablePayout)
const mockFindByIdWithSession = (result) => {
  Collaboration.findById = jest.fn().mockImplementation(() => ({
    session: jest.fn().mockResolvedValue(result)
  }));
  User.findById = jest.fn().mockImplementation(() => ({
    session: jest.fn().mockResolvedValue(makeUser({ stripeAccountId: 'acct_123' }))
  }));
};

describe('stripe.service.js', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // ── Stripe method mocks ──
    stripe.accounts = {
      create: jest.fn().mockResolvedValue({ id: 'acct_123' })
    };
    stripe.accountLinks = {
      create: jest.fn().mockResolvedValue({ url: 'https://connect.stripe.com/onboard' })
    };
    stripe.paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: 'pi_new', client_secret: 'secret_new' }),
      retrieve: jest.fn()
    };
    stripe.transfers = {
      create: jest.fn().mockResolvedValue({ id: 'tr_123' })
    };
    stripe.customers = {
      create: jest.fn().mockResolvedValue({ id: 'cus_123' })
    };
    stripe.paymentMethods = {
      list: jest.fn().mockResolvedValue({ data: [] }),
      retrieve: jest.fn(),
      detach: jest.fn().mockResolvedValue({ id: 'pm_123' })
    };
    stripe.setupIntents = {
      create: jest.fn().mockResolvedValue({ client_secret: 'seti_secret' })
    };
    stripe.refunds = {
      list: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: 're_123' })
    };
    stripe.webhooks = {
      constructEvent: jest.fn()
    };

    // ── Mongoose static method mocks ──
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(true);
    User.findOneAndUpdate = jest.fn().mockResolvedValue(true);
    Campaign.findByIdAndUpdate = jest.fn().mockResolvedValue({});
    Collaboration.findByIdAndUpdate = jest.fn().mockResolvedValue(true);
    Payment.create = jest.fn().mockResolvedValue([{}]);

    // ── Session mock ──
    mongoose.startSession = jest.fn().mockResolvedValue({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn()
    });
  });

  // ═══════════════════════════════════════════
  //  createConnectAccount
  // ═══════════════════════════════════════════
  describe('createConnectAccount', () => {
    it('should create a Stripe Connect account for a user without one', async () => {
      const user = makeUser({ stripeAccountId: null });
      User.findById = jest.fn().mockResolvedValue(user);

      const result = await stripeService.createConnectAccount('user_brand_1');

      expect(stripe.accounts.create).toHaveBeenCalledWith({
        type: 'express',
        email: user.email,
        capabilities: { transfers: { requested: true } }
      });
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user_brand_1', {
        $set: { stripeAccountId: 'acct_123' }
      });
      expect(result).toBe('acct_123');
    });

    it('should return existing account ID if user already has one', async () => {
      const user = makeUser({ stripeAccountId: 'acct_existing' });
      User.findById = jest.fn().mockResolvedValue(user);

      const result = await stripeService.createConnectAccount('user_brand_1');

      expect(stripe.accounts.create).not.toHaveBeenCalled();
      expect(result).toBe('acct_existing');
    });

    it('should throw ApiError if user is not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      await expect(stripeService.createConnectAccount('nonexistent'))
        .rejects.toThrow('User not found');
    });
  });

  // ═══════════════════════════════════════════
  //  createAccountLink
  // ═══════════════════════════════════════════
  describe('createAccountLink', () => {
    it('should create an account link and return the URL', async () => {
      const result = await stripeService.createAccountLink('acct_123');

      expect(stripe.accountLinks.create).toHaveBeenCalledWith({
        account: 'acct_123',
        refresh_url: expect.stringContaining('/dashboard/payment/refresh'),
        return_url: expect.stringContaining('/dashboard/payment/success'),
        type: 'account_onboarding'
      });
      expect(result).toBe('https://connect.stripe.com/onboard');
    });
  });

  // ═══════════════════════════════════════════
  //  createEscrowPaymentIntent  ⭐ CRITICAL
  // ═══════════════════════════════════════════
  describe('createEscrowPaymentIntent', () => {
    it('should throw if collaboration not found', async () => {
      mockFindById(null);

      await expect(stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1'))
        .rejects.toThrow('Collaboration not found');
    });

    it('should throw if brand does not own the collaboration', async () => {
      const collab = makeCollaboration({ brand: 'other_brand' });
      mockFindById(collab);

      await expect(stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1'))
        .rejects.toThrow('Only the assigned brand can fund this escrow');
    });

    it('should throw if collaboration status is not awaiting_funds or active', async () => {
      const collab = makeCollaboration({ status: 'completed' });
      mockFindById(collab);

      await expect(stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1'))
        .rejects.toThrow(/not awaiting_funds/);
    });

    it('should throw if both parties have not signed the agreement', async () => {
      const collab = makeCollaboration({ brandAgreed: true, influencerAgreed: false });
      mockFindById(collab);

      await expect(stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1'))
        .rejects.toThrow(/Agreement must be signed/);
    });

    it('should throw if escrow is already funded', async () => {
      const collab = makeCollaboration({ escrowFunded: true });
      mockFindById(collab);

      await expect(stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1'))
        .rejects.toThrow(/already funded/);
    });

    it('should reuse existing PaymentIntent with matching amount', async () => {
      const collab = makeCollaboration({
        stripePaymentIntentId: 'pi_existing',
        agreedBudget: 500
      });
      mockFindById(collab);

      stripe.paymentIntents.retrieve = jest.fn().mockResolvedValue({
        id: 'pi_existing',
        amount: 50000,
        client_secret: 'secret_existing',
        status: 'requires_payment_method'
      });

      const result = await stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1');

      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
      expect(result.clientSecret).toBe('secret_existing');
      expect(result.paymentIntentId).toBe('pi_existing');
    });

    it('should create new PaymentIntent if existing amount does not match', async () => {
      const collab = makeCollaboration({
        stripePaymentIntentId: 'pi_stale',
        agreedBudget: 1000
      });
      mockFindById(collab);
      User.findById = jest.fn().mockResolvedValue(makeUser({ stripeCustomerId: 'cus_123' }));

      stripe.paymentIntents.retrieve = jest.fn().mockResolvedValue({
        id: 'pi_stale',
        amount: 50000,
        client_secret: 'secret_stale',
        status: 'requires_payment_method'
      });

      await stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1');

      expect(stripe.paymentIntents.create).toHaveBeenCalled();
      expect(Collaboration.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should create a Stripe customer for brand if none exists', async () => {
      const collab = makeCollaboration({ stripePaymentIntentId: null });
      mockFindById(collab);

      const user = makeUser({ stripeCustomerId: null });
      User.findById = jest.fn().mockResolvedValue(user);

      await stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1');

      expect(stripe.customers.create).toHaveBeenCalledWith({
        email: user.email,
        name: user.fullname,
        metadata: { userId: 'user_brand_1' }
      });
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user_brand_1', {
        $set: { stripeCustomerId: 'cus_123' }
      });
    });

    it('should auto-fix zero agreedBudget from proposedBudget', async () => {
      const collab = makeCollaboration({
        stripePaymentIntentId: null,
        agreedBudget: 0,
        proposedBudget: 750
      });
      mockFindById(collab);
      User.findById = jest.fn().mockResolvedValue(makeUser({ stripeCustomerId: 'cus_123' }));

      await stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1');

      expect(collab.agreedBudget).toBe(750);
      expect(collab.save).toHaveBeenCalled();
    });

    it('should throw if amount is below $0.50 minimum', async () => {
      const collab = makeCollaboration({
        stripePaymentIntentId: null,
        agreedBudget: 0.25
      });
      mockFindById(collab);
      User.findById = jest.fn().mockResolvedValue(makeUser({ stripeCustomerId: 'cus_123' }));

      await expect(stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1'))
        .rejects.toThrow(/below the minimum/);
    });

    it('should save PaymentIntent ID immediately after creation', async () => {
      const collab = makeCollaboration({ stripePaymentIntentId: null, agreedBudget: 100 });
      mockFindById(collab);
      User.findById = jest.fn().mockResolvedValue(makeUser({ stripeCustomerId: 'cus_123' }));

      await stripeService.createEscrowPaymentIntent('collab_1', 'user_brand_1');

      expect(Collaboration.findByIdAndUpdate).toHaveBeenCalledWith('collab_1', {
        $set: { stripePaymentIntentId: 'pi_new' }
      });
    });
  });

  // ═══════════════════════════════════════════
  //  handlePaymentIntentSucceeded  ⭐ CRITICAL
  // ═══════════════════════════════════════════
  describe('handlePaymentIntentSucceeded', () => {
    const succeededPI = {
      id: 'pi_succeeded',
      amount: 100000,
      metadata: {
        collaborationId: 'collab_1',
        type: 'escrow_funding'
      }
    };

    it('should ignore non-escrow_funding events', async () => {
      const pi = { metadata: { type: 'other' } };
      Collaboration.findById = jest.fn();

      await stripeService.handlePaymentIntentSucceeded(pi);

      expect(Collaboration.findById).not.toHaveBeenCalled();
    });

    it('should update collaboration to funded and active', async () => {
      const collab = makeCollaboration({ status: 'awaiting_funds' });
      Collaboration.findById = jest.fn().mockResolvedValue(collab);

      await stripeService.handlePaymentIntentSucceeded(succeededPI);

      expect(collab.escrowFunded).toBe(true);
      expect(collab.totalFundedAmount).toBe(1000);
      expect(collab.status).toBe('active');
      expect(collab.stripePaymentIntentId).toBe('pi_succeeded');
      expect(collab.save).toHaveBeenCalled();
    });

    it('should record funding history', async () => {
      const collab = makeCollaboration({ status: 'awaiting_funds', fundingHistory: [] });
      Collaboration.findById = jest.fn().mockResolvedValue(collab);

      await stripeService.handlePaymentIntentSucceeded(succeededPI);

      expect(collab.fundingHistory.length).toBe(1);
      expect(collab.fundingHistory[0].amount).toBe(1000);
      expect(collab.fundingHistory[0].paymentIntentId).toBe('pi_succeeded');
    });

    it('should sync campaign status to active', async () => {
      const collab = makeCollaboration({ status: 'awaiting_funds', campaign: { _id: 'camp_1' } });
      Collaboration.findById = jest.fn().mockResolvedValue(collab);

      await stripeService.handlePaymentIntentSucceeded(succeededPI);

      expect(Campaign.findByIdAndUpdate).toHaveBeenCalledWith({ _id: 'camp_1' }, {
        $set: { status: 'active' }
      });
    });

    it('should handle missing collaboration gracefully', async () => {
      Collaboration.findById = jest.fn().mockResolvedValue(null);

      await expect(stripeService.handlePaymentIntentSucceeded(succeededPI))
        .resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════
  //  transferDeliverablePayout  ⭐ CRITICAL
  // ═══════════════════════════════════════════
  describe('transferDeliverablePayout', () => {
    it('should throw if escrow is not funded', async () => {
      const collab = makeCollaboration({ escrowFunded: false });
      mockFindByIdWithSession(collab);

      await expect(stripeService.transferDeliverablePayout('collab_1', 'deliv_1'))
        .rejects.toThrow('Escrow has not been funded');
    });

    it('should throw if influencer has no Stripe account', async () => {
      const deliv = makeDeliverable();
      const collab = makeCollaboration({ escrowFunded: true, deliverables: [deliv] });
      Collaboration.findById = jest.fn().mockImplementation(() => ({
        session: jest.fn().mockResolvedValue(collab)
      }));
      User.findById = jest.fn().mockImplementation(() => ({
        session: jest.fn().mockResolvedValue(makeUser({ stripeAccountId: null }))
      }));

      await expect(stripeService.transferDeliverablePayout('collab_1', 'deliv_1'))
        .rejects.toThrow('has not completed Stripe onboarding');
    });

    it('should throw if deliverable is already paid', async () => {
      const deliv = makeDeliverable({ paymentStatus: 'paid' });
      const collab = makeCollaboration({ escrowFunded: true, deliverables: [deliv] });
      mockFindByIdWithSession(collab);

      await expect(stripeService.transferDeliverablePayout('collab_1', 'deliv_1'))
        .rejects.toThrow('already been paid');
    });

    it('should handle zero-sum payout (no Stripe call)', async () => {
      const deliv = makeDeliverable({ isFinal: true });
      const collab = makeCollaboration({
        escrowFunded: true,
        agreedBudget: 1000,
        totalPaidAmount: 1000,
        deliverables: [deliv]
      });
      mockFindByIdWithSession(collab);

      const result = await stripeService.transferDeliverablePayout('collab_1', 'deliv_1');

      expect(stripe.transfers.create).not.toHaveBeenCalled();
      expect(deliv.paymentStatus).toBe('paid');
      expect(result.message).toContain('Zero-sum');
    });

    it('should create Stripe transfer for non-final deliverable', async () => {
      const deliv = makeDeliverable({ isFinal: false, allocatedBudget: 300 });
      const collab = makeCollaboration({
        escrowFunded: true,
        agreedBudget: 1000,
        totalPaidAmount: 0,
        deliverables: [deliv]
      });
      mockFindByIdWithSession(collab);

      await stripeService.transferDeliverablePayout('collab_1', 'deliv_1');

      expect(stripe.transfers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 30000,
          currency: 'usd',
          destination: 'acct_123',
        }),
        expect.objectContaining({ idempotencyKey: 'deliverable_payout_deliv_1' })
      );
      expect(deliv.paymentStatus).toBe('paid');
    });

    it('should prevent overpaying beyond remaining escrow', async () => {
      const deliv = makeDeliverable({ isFinal: false, allocatedBudget: 900 });
      const collab = makeCollaboration({
        escrowFunded: true,
        agreedBudget: 1000,
        totalPaidAmount: 500,
        deliverables: [deliv]
      });
      mockFindByIdWithSession(collab);

      await expect(stripeService.transferDeliverablePayout('collab_1', 'deliv_1'))
        .rejects.toThrow(/exceeds remaining escrow budget/);
    });

    it('should abort transaction on error', async () => {
      const session = {
        startTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };
      mongoose.startSession = jest.fn().mockResolvedValue(session);
      Collaboration.findById = jest.fn().mockImplementation(() => ({
        session: jest.fn().mockRejectedValue(new Error('DB error'))
      }));

      await expect(stripeService.transferDeliverablePayout('collab_1', 'deliv_1'))
        .rejects.toThrow('DB error');

      expect(session.abortTransaction).toHaveBeenCalled();
      expect(session.endSession).toHaveBeenCalled();
    });

    it('should transfer full remaining escrow for final deliverable', async () => {
      const deliv = makeDeliverable({ isFinal: true, allocatedBudget: 0 });
      const collab = makeCollaboration({
        escrowFunded: true,
        agreedBudget: 1000,
        totalPaidAmount: 600,
        deliverables: [deliv]
      });
      mockFindByIdWithSession(collab);

      await stripeService.transferDeliverablePayout('collab_1', 'deliv_1');

      expect(stripe.transfers.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 40000 }),
        expect.any(Object)
      );
    });
  });

  // ═══════════════════════════════════════════
  //  refundCollaborationBalance  ⭐ CRITICAL
  // ═══════════════════════════════════════════
  describe('refundCollaborationBalance', () => {
    it('should return early if escrow not funded', async () => {
      const collab = makeCollaboration({ escrowFunded: false });
      Collaboration.findById = jest.fn().mockResolvedValue(collab);

      const result = await stripeService.refundCollaborationBalance('collab_1');

      expect(result.refundedAmount).toBe(0);
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('should return early if no remaining balance', async () => {
      const collab = makeCollaboration({
        escrowFunded: true,
        agreedBudget: 1000,
        totalPaidAmount: 1000
      });
      Collaboration.findById = jest.fn().mockResolvedValue(collab);

      const result = await stripeService.refundCollaborationBalance('collab_1');

      expect(result.refundedAmount).toBe(0);
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('should process waterfall refund across all funding sources', async () => {
      const collab = makeCollaboration({
        escrowFunded: true,
        agreedBudget: 1000,
        totalPaidAmount: 300,
        fundingHistory: [
          { amount: 500, paymentIntentId: 'pi_1', fundedAt: new Date('2024-01-01') },
          { amount: 500, paymentIntentId: 'pi_2', fundedAt: new Date('2024-01-15') }
        ],
        refundHistory: []
      });
      Collaboration.findById = jest.fn().mockResolvedValue(collab);

      const result = await stripeService.refundCollaborationBalance('collab_1');

      expect(stripe.refunds.create).toHaveBeenCalledTimes(2);
      expect(result.refundedAmount).toBeCloseTo(700);
    });

    it('should skip amounts below $0.50 Stripe minimum', async () => {
      const collab = makeCollaboration({
        escrowFunded: true,
        agreedBudget: 100,
        totalPaidAmount: 99.60,
        fundingHistory: [
          { amount: 100, paymentIntentId: 'pi_1', fundedAt: new Date('2024-01-01') }
        ],
        refundHistory: []
      });
      Collaboration.findById = jest.fn().mockResolvedValue(collab);

      const result = await stripeService.refundCollaborationBalance('collab_1');

      expect(stripe.refunds.create).not.toHaveBeenCalled();
      expect(result.refundedAmount).toBe(0);
    });

    it('should continue processing remaining PIs if one refund fails', async () => {
      const collab = makeCollaboration({
        escrowFunded: true,
        agreedBudget: 1500,
        totalPaidAmount: 0,
        fundingHistory: [
          { amount: 500, paymentIntentId: 'pi_1', fundedAt: new Date('2024-01-01') },
          { amount: 1000, paymentIntentId: 'pi_2', fundedAt: new Date('2024-01-15') }
        ],
        refundHistory: []
      });
      Collaboration.findById = jest.fn().mockResolvedValue(collab);

      stripe.refunds.create
        .mockRejectedValueOnce(new Error('Stripe error'))
        .mockResolvedValueOnce({ id: 're_2' });

      const result = await stripeService.refundCollaborationBalance('collab_1');

      expect(stripe.refunds.create).toHaveBeenCalledTimes(2);

      // pi_2 (newest, $1000) processed first → fails
      // pi_1 ($500) processed second → succeeds
      // total refunded = $500
      expect(result.refundedAmount).toBeCloseTo(500);
      expect(result.refundsIssued.length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════
  //  handleAccountUpdated
  // ═══════════════════════════════════════════
  describe('handleAccountUpdated', () => {
    it('should mark onboarding complete when details submitted', async () => {
      await stripeService.handleAccountUpdated({ id: 'acct_123', details_submitted: true });

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { stripeAccountId: 'acct_123' },
        { $set: { stripeOnboardingComplete: true } }
      );
    });

    it('should do nothing if details not yet submitted', async () => {
      await stripeService.handleAccountUpdated({ id: 'acct_123', details_submitted: false });

      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  //  syncEscrowStatus
  // ═══════════════════════════════════════════
  describe('syncEscrowStatus', () => {
    it('should return alreadyFunded if escrow is already funded', async () => {
      const collab = makeCollaboration({ escrowFunded: true });
      Collaboration.findById = jest.fn().mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(collab)
      }));

      const result = await stripeService.syncEscrowStatus('collab_1');

      expect(result.alreadyFunded).toBe(true);
    });

    it('should return needsPayment if no PaymentIntent ID', async () => {
      const collab = makeCollaboration({ escrowFunded: false, stripePaymentIntentId: null });
      Collaboration.findById = jest.fn().mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(collab)
      }));

      const result = await stripeService.syncEscrowStatus('collab_1');

      expect(result.needsPayment).toBe(true);
    });

    it('should update collaboration if PaymentIntent succeeded', async () => {
      const collab = makeCollaboration({ escrowFunded: false, stripePaymentIntentId: 'pi_123' });
      Collaboration.findById = jest.fn().mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(collab)
      }));
      stripe.paymentIntents.retrieve = jest.fn().mockResolvedValue({ status: 'succeeded' });

      const result = await stripeService.syncEscrowStatus('collab_1');

      expect(collab.escrowFunded).toBe(true);
      expect(collab.status).toBe('active');
      expect(result.updated).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  //  Card Management
  // ═══════════════════════════════════════════
  describe('listPaymentMethods', () => {
    it('should return empty array if user has no stripeCustomerId', async () => {
      User.findById = jest.fn().mockResolvedValue(makeUser({ stripeCustomerId: null }));

      const result = await stripeService.listPaymentMethods('user_1');

      expect(result).toEqual([]);
    });

    it('should list payment methods from Stripe', async () => {
      User.findById = jest.fn().mockResolvedValue(makeUser({ stripeCustomerId: 'cus_123' }));

      await stripeService.listPaymentMethods('user_1');

      expect(stripe.paymentMethods.list).toHaveBeenCalledWith({
        customer: 'cus_123',
        type: 'card'
      });
    });
  });

  describe('createSetupIntent', () => {
    it('should create Stripe customer if none exists', async () => {
      const user = makeUser({ stripeCustomerId: null });
      User.findById = jest.fn().mockResolvedValue(user);

      await stripeService.createSetupIntent('user_brand_1');

      expect(stripe.customers.create).toHaveBeenCalled();
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user_brand_1', {
        $set: { stripeCustomerId: 'cus_123' }
      });
    });

    it('should create setup intent with existing customer', async () => {
      User.findById = jest.fn().mockResolvedValue(makeUser({ stripeCustomerId: 'cus_123' }));

      const result = await stripeService.createSetupIntent('user_brand_1');

      expect(stripe.setupIntents.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        payment_method_types: ['card']
      });
      expect(result.client_secret).toBe('seti_secret');
    });
  });

  describe('detachPaymentMethod', () => {
    it('should throw if user has no customer ID', async () => {
      User.findById = jest.fn().mockResolvedValue(makeUser({ stripeCustomerId: null }));

      await expect(stripeService.detachPaymentMethod('pm_1', 'user_1'))
        .rejects.toThrow('Customer not found');
    });

    it('should throw if payment method belongs to another customer', async () => {
      User.findById = jest.fn().mockResolvedValue(makeUser({ stripeCustomerId: 'cus_123' }));
      stripe.paymentMethods.retrieve = jest.fn().mockResolvedValue({
        id: 'pm_1',
        customer: 'cus_other'
      });

      await expect(stripeService.detachPaymentMethod('pm_1', 'user_1'))
        .rejects.toThrow('Access denied');
    });

    it('should detach if payment method belongs to user', async () => {
      User.findById = jest.fn().mockResolvedValue(makeUser({ stripeCustomerId: 'cus_123' }));
      stripe.paymentMethods.retrieve = jest.fn().mockResolvedValue({
        id: 'pm_1',
        customer: 'cus_123'
      });

      const result = await stripeService.detachPaymentMethod('pm_1', 'user_1');

      expect(stripe.paymentMethods.detach).toHaveBeenCalledWith('pm_1');
      expect(result.id).toBe('pm_123');
    });
  });

  // ═══════════════════════════════════════════
  //  getPaymentHistory
  // ═══════════════════════════════════════════
  describe('getPaymentHistory', () => {
    it('should query by brand for brand role', async () => {
      Payment.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ amount: 100 }])
      });

      const result = await stripeService.getPaymentHistory('user_1', 'brand');

      expect(Payment.find).toHaveBeenCalledWith({ brand: 'user_1' });
      expect(result).toEqual([{ amount: 100 }]);
    });

    it('should query by influencer for influencer role', async () => {
      Payment.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });

      await stripeService.getPaymentHistory('user_1', 'influencer');

      expect(Payment.find).toHaveBeenCalledWith({ influencer: 'user_1' });
    });
  });
});
