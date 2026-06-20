import { jest } from '@jest/globals';
import crypto from 'crypto';

const mockUserFindOne = jest.fn();
const mockUserFindById = jest.fn();
const mockUserFindByIdAndUpdate = jest.fn();
const mockUserUpdateOne = jest.fn();
const mockUserCreate = jest.fn();

jest.unstable_mockModule('../src/modules/user/user.model.js', () => ({
  default: {
    findOne: mockUserFindOne,
    findById: mockUserFindById,
    findByIdAndUpdate: mockUserFindByIdAndUpdate,
    updateOne: mockUserUpdateOne,
    create: mockUserCreate
  }
}));

const mockBrandCreate = jest.fn();
jest.unstable_mockModule('../src/modules/brand/brand.model.js', () => ({
  default: { create: mockBrandCreate }
}));

const mockInfluencerCreate = jest.fn();
jest.unstable_mockModule('../src/modules/influencer/influencer.model.js', () => ({
  default: { create: mockInfluencerCreate }
}));

const mockSendEmail = jest.fn().mockResolvedValue(true);
jest.unstable_mockModule('../src/utils/email.js', () => ({
  sendEmail: mockSendEmail
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const mockJwtVerify = jest.fn();
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { verify: mockJwtVerify }
}));

const mockOtpRedis = {
  checkLockout: jest.fn().mockResolvedValue(false),
  checkCooldown: jest.fn().mockResolvedValue(false),
  checkAndIncrementDailyLimit: jest.fn().mockResolvedValue({ allowed: true }),
  storeOTP: jest.fn().mockResolvedValue(true),
  verifyOTP: jest.fn().mockResolvedValue(1)
};
jest.unstable_mockModule('../src/utils/otpRedisService.js', () => ({
  otpRedis: mockOtpRedis
}));

let authService;

beforeAll(async () => {
  authService = (await import('../src/modules/auth/auth.service.js')).authService;
});

const USER_ID = '507f1f77bcf86cd799439011';
const USER_EMAIL = 'test@example.com';

function makeUser(overrides = {}) {
  return {
    _id: USER_ID,
    email: USER_EMAIL,
    fullname: 'Test User',
    password: 'hashed_pass',
    role: 'brand',
    isBlocked: false,
    isDeactivated: false,
    isVerified: false,
    refreshTokens: [],
    generateAccessToken() { return 'access_token'; },
    generateRefreshToken() { return 'refresh_token'; },
    isPasswordCorrect() { return Promise.resolve(true); },
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
}

// Builder: returns a thenable query-like object so callers can do
//   await User.findById(id)           -> resolves to user
//   await User.findById(id).select()  -> also resolves to user
function queryChain(user) {
  const q = {
    select: jest.fn(() => q),
    populate: jest.fn(() => q),
    lean: jest.fn(() => q),
    sort: jest.fn(() => q),
    then(resolve) { return Promise.resolve(user).then(resolve); }
  };
  return q;
}

describe('auth.service.js', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── register ────────────────────────────────────────────────────────
  describe('register', () => {
    it('should throw if email already exists', async () => {
      mockUserFindOne.mockReturnValue(queryChain({ _id: 'existing' }));
      await expect(authService.register({ email: USER_EMAIL }))
        .rejects.toThrow('Email is already registered');
    });

    it('should create user and brand profile for brand role', async () => {
      mockUserFindOne.mockReturnValue(queryChain(null));
      mockUserCreate.mockResolvedValue(makeUser());
      mockUserFindById.mockReturnValue(queryChain(makeUser()));

      await authService.register({ email: USER_EMAIL, fullname: 'Test Brand', password: 'pass123', role: 'brand' });
      expect(mockBrandCreate).toHaveBeenCalled();
    });

    it('should create user and influencer profile for influencer role', async () => {
      mockUserFindOne.mockReturnValue(queryChain(null));
      mockUserCreate.mockResolvedValue(makeUser({ role: 'influencer' }));
      mockUserFindById.mockReturnValue(queryChain(makeUser({ role: 'influencer' })));

      await authService.register({ email: 'inf@test.com', fullname: 'Test Inf', password: 'pass123', role: 'influencer' });
      expect(mockInfluencerCreate).toHaveBeenCalled();
    });
  });

  // ── login ───────────────────────────────────────────────────────────
  describe('login', () => {
    it('should throw if user not found', async () => {
      mockUserFindOne.mockReturnValue(queryChain(null));
      await expect(authService.login(USER_EMAIL, 'pass')).rejects.toThrow('User does not exist');
    });

    it('should throw if user is blocked', async () => {
      mockUserFindOne.mockReturnValue(queryChain(makeUser({ isBlocked: true })));
      await expect(authService.login(USER_EMAIL, 'pass')).rejects.toThrow('Account has been blocked');
    });

    it('should throw on invalid password', async () => {
      const user = makeUser();
      user.isPasswordCorrect = () => Promise.resolve(false);
      mockUserFindOne.mockReturnValue(queryChain(user));
      await expect(authService.login(USER_EMAIL, 'wrongpass')).rejects.toThrow('Invalid credentials');
    });

    it('should auto-reactivate deactivated account', async () => {
      const user = makeUser({ isDeactivated: true });
      mockUserFindOne.mockReturnValue(queryChain(user));
      mockUserFindById.mockReturnValue(queryChain(user));

      const result = await authService.login(USER_EMAIL, 'pass');
      expect(user.isDeactivated).toBe(false);
      expect(result.accessToken).toBe('access_token');
    });

    it('should return user and tokens on successful login', async () => {
      const user = makeUser();
      mockUserFindOne.mockReturnValue(queryChain(user));
      mockUserFindById.mockReturnValue(queryChain(user));

      const result = await authService.login(USER_EMAIL, 'pass');
      expect(result.accessToken).toBe('access_token');
      expect(result.refreshToken).toBe('refresh_token');
      expect(result.user).toBeDefined();
    });
  });

  // ── logout ──────────────────────────────────────────────────────────
  describe('logout', () => {
    it('should remove specific refresh token', async () => {
      mockUserFindByIdAndUpdate.mockResolvedValue({});
      await authService.logout(USER_ID, 'specific_token');
      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(USER_ID, { $pull: { refreshTokens: 'specific_token' } }, { new: true });
    });

    it('should clear all tokens if no refresh token provided', async () => {
      mockUserFindByIdAndUpdate.mockResolvedValue({});
      await authService.logout(USER_ID, null);
      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(USER_ID, { $set: { refreshTokens: [] } }, { new: true });
    });
  });

  // ── refreshAccessToken ─────────────────────────────────────────────
  describe('refreshAccessToken', () => {
    it('should throw if token is invalid', async () => {
      mockJwtVerify.mockImplementation(() => { throw new Error('jwt expired'); });
      const err = await authService.refreshAccessToken('bad_token').catch(e => e);
      expect(err.message).toMatch(/jwt expired/i);
    });

    it('should throw if user not found or token not in list', async () => {
      mockJwtVerify.mockReturnValue({ _id: USER_ID });
      mockUserFindById.mockReturnValue(queryChain(null));
      await expect(authService.refreshAccessToken('valid_token')).rejects.toThrow('Invalid or expired refresh token');
    });

    it('should return new tokens on success', async () => {
      mockJwtVerify.mockReturnValue({ _id: USER_ID });
      const user = makeUser({ refreshTokens: ['valid_token'] });
      mockUserFindById.mockReturnValue(queryChain(user));

      const result = await authService.refreshAccessToken('valid_token');
      expect(result.accessToken).toBe('access_token');
    });
  });

  // ── forgotPassword ─────────────────────────────────────────────────
  describe('forgotPassword', () => {
    it('should silently return if email not found', async () => {
      mockUserFindOne.mockReturnValue(queryChain(null));
      await expect(authService.forgotPassword('unknown@test.com')).resolves.toBeUndefined();
    });

    it('should throw if rate limited by Redis', async () => {
      mockUserFindOne.mockReturnValue(queryChain(makeUser()));
      mockOtpRedis.checkLockout.mockResolvedValue(true);
      await expect(authService.forgotPassword(USER_EMAIL)).rejects.toThrow('Too many attempts');
    });

    it('should store OTP in MongoDB when Redis fails', async () => {
      const user = makeUser();
      mockUserFindOne.mockReturnValue(queryChain(user));
      mockUserUpdateOne.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
      mockOtpRedis.storeOTP.mockRejectedValue(new Error('Redis down'));
      mockOtpRedis.checkLockout.mockResolvedValue(false);
      mockOtpRedis.checkCooldown.mockResolvedValue(false);

      await authService.forgotPassword(USER_EMAIL);
      expect(mockUserUpdateOne).toHaveBeenCalledWith(
        { _id: USER_ID },
        expect.objectContaining({
          $set: expect.objectContaining({
            passwordResetOTP: expect.any(String),
            passwordResetExpires: expect.any(Date),
            passwordResetAttempts: 0,
          })
        })
      );
    });
  });

  // ── resetPassword ──────────────────────────────────────────────────
  describe('resetPassword', () => {
    it('should throw if user not found', async () => {
      mockUserFindOne.mockReturnValue(queryChain(null));
      await expect(authService.resetPassword(USER_EMAIL, '123456', 'newPass'))
        .rejects.toThrow('Invalid request');
    });

    it('should reset password on successful OTP verification', async () => {
      const user = makeUser();
      mockUserFindOne.mockReturnValue(queryChain(user));
      mockUserFindByIdAndUpdate.mockResolvedValue(user);
      mockOtpRedis.verifyOTP.mockResolvedValue(1);

      await authService.resetPassword(USER_EMAIL, '123456', 'newPass');
      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
        user._id,
        expect.objectContaining({
          password: expect.any(String),
          refreshTokens: [],
        })
      );
    });

    it('should fall back to MongoDB if Redis fails', async () => {
      const hashed = crypto.createHash('sha256').update('123456').digest('hex');
      const user = makeUser({ passwordResetOTP: hashed, passwordResetExpires: Date.now() + 600000, passwordResetAttempts: 0 });
      mockUserFindOne.mockReturnValue(queryChain(user));
      mockUserFindByIdAndUpdate.mockResolvedValue(user);
      mockOtpRedis.verifyOTP.mockRejectedValue(new Error('Redis error'));
      mockOtpRedis.checkLockout.mockRejectedValue(new Error('Redis error'));

      await authService.resetPassword(USER_EMAIL, '123456', 'newPass');
      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
        user._id,
        expect.objectContaining({
          password: expect.any(String),
          refreshTokens: [],
        })
      );
    });
  });

  // ── changePassword ─────────────────────────────────────────────────
  describe('changePassword', () => {
    it('should throw if user not found', async () => {
      mockUserFindById.mockReturnValue(queryChain(null));
      await expect(authService.changePassword(USER_ID, 'old', 'new')).rejects.toThrow('User not found');
    });

    it('should throw if old password is wrong', async () => {
      const user = makeUser();
      user.isPasswordCorrect = () => Promise.resolve(false);
      mockUserFindById.mockReturnValue(queryChain(user));
      await expect(authService.changePassword(USER_ID, 'wrong', 'new')).rejects.toThrow('Invalid current password');
    });

    it('should update password on success', async () => {
      const user = makeUser();
      mockUserFindById.mockReturnValue(queryChain(user));
      await authService.changePassword(USER_ID, 'old', 'new');
      expect(user.password).toBe('new');
    });
  });

  // ── sendEmailVerificationOTP ───────────────────────────────────────
  describe('sendEmailVerificationOTP', () => {
    it('should throw if user not found', async () => {
      mockUserFindById.mockReturnValue(queryChain(null));
      await expect(authService.sendEmailVerificationOTP(USER_ID)).rejects.toThrow('User not found');
    });

    it('should store OTP and send email', async () => {
      const user = makeUser();
      mockUserFindById.mockReturnValue(queryChain(user));
      mockOtpRedis.checkLockout.mockResolvedValue(false);
      mockOtpRedis.checkCooldown.mockResolvedValue(false);
      mockOtpRedis.checkAndIncrementDailyLimit.mockResolvedValue({ allowed: true });

      await authService.sendEmailVerificationOTP(USER_ID);
      expect(mockOtpRedis.storeOTP).toHaveBeenCalled();
      expect(mockSendEmail).toHaveBeenCalled();
    });
  });

  // ── verifyEmailVerificationOTP ─────────────────────────────────────
  describe('verifyEmailVerificationOTP', () => {
    it('should throw if user not found', async () => {
      mockUserFindById.mockReturnValue(queryChain(null));
      await expect(authService.verifyEmailVerificationOTP(USER_ID, '123456')).rejects.toThrow('User not found');
    });

    it('should mark user as verified on success', async () => {
      const user = makeUser();
      mockUserFindById.mockReturnValue(queryChain(user));
      mockOtpRedis.checkLockout.mockResolvedValue(false);
      mockOtpRedis.verifyOTP.mockResolvedValue(1);

      await authService.verifyEmailVerificationOTP(USER_ID, '123456');
      expect(user.isVerified).toBe(true);
    });
  });

  // ── getFacebookAuthUrl ─────────────────────────────────────────────
  describe('getFacebookAuthUrl', () => {
    it('should return a valid Facebook OAuth URL', () => {
      const url = authService.getFacebookAuthUrl();
      expect(url).toContain('facebook.com');
      expect(url).toContain('dialog/oauth');
    });
  });

  // ── handleFacebookCallback ─────────────────────────────────────────
  describe('handleFacebookCallback', () => {
    it('should throw if token exchange fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({ json: jest.fn().mockResolvedValue({ error: { message: 'bad code' } }) });
      await expect(authService.handleFacebookCallback('bad_code')).rejects.toThrow('bad code');
    });

    it('should throw if no pages found', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ access_token: 'tok' }) })
        .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ data: [] }) });
      await expect(authService.handleFacebookCallback('code')).rejects.toThrow('No Facebook pages');
    });

    it('should return Instagram profile data on success', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ access_token: 'tok' }) })
        .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ data: [{ id: 'page1' }] }) })
        .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ instagram_business_account: { id: 'ig1' } }) })
        .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ username: 'test_ig', followers_count: 100, media_count: 5 }) });

      const result = await authService.handleFacebookCallback('code');
      expect(result.username).toBe('test_ig');
      expect(result.followers).toBe(100);
    });
  });
});
