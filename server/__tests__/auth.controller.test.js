import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

let currentValidator = (req, res, next) => next();
const mockValidate = jest.fn(() => (req, res, next) => currentValidator(req, res, next));

function defaultBrandUser(req, res, next) {
  req.user = { _id: '507f1f77bcf86cd799439011', role: 'brand', email: 'brand@test.com' };
  next();
}
const mockVerifyJwt = jest.fn(defaultBrandUser);

jest.unstable_mockModule('../src/middleware/authMiddleware.js', () => ({ verifyJwt: mockVerifyJwt }));
jest.unstable_mockModule('../src/middleware/validationMiddleware.js', () => ({ validate: mockValidate }));

jest.unstable_mockModule('../src/config/cloudinary.js', () => ({
  uploadOnCloudinary: jest.fn().mockResolvedValue({ url: 'https://cloudinary.com/test.jpg', secure_url: 'https://cloudinary.com/test.jpg' })
}));

jest.unstable_mockModule('../src/events/eventBus.js', () => ({ eventBus: { emit: jest.fn() } }));

const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockRefresh = jest.fn();
const mockForgotPassword = jest.fn();
const mockResetPassword = jest.fn();
const mockChangePassword = jest.fn();
const mockSendOTP = jest.fn();
const mockVerifyOTP = jest.fn();
const mockGetFacebookAuthUrl = jest.fn();
const mockHandleFacebookCallback = jest.fn();

jest.unstable_mockModule('../src/modules/auth/auth.service.js', () => ({
  authService: {
    register: mockRegister,
    login: mockLogin,
    logout: mockLogout,
    refreshAccessToken: mockRefresh,
    forgotPassword: mockForgotPassword,
    resetPassword: mockResetPassword,
    changePassword: mockChangePassword,
    sendEmailVerificationOTP: mockSendOTP,
    verifyEmailVerificationOTP: mockVerifyOTP,
    getFacebookAuthUrl: mockGetFacebookAuthUrl,
    handleFacebookCallback: mockHandleFacebookCallback
  }
}));

jest.unstable_mockModule('../src/middleware/multerMiddleware.js', () => ({
  upload: { fields: jest.fn(() => (req, res, next) => { req.files = {}; next(); }) }
}));

let authRouter;

beforeAll(async () => {
  authRouter = (await import('../src/modules/auth/auth.routes.js')).default;
});

afterEach(() => {
  mockVerifyJwt.mockReset();
  mockVerifyJwt.mockImplementation(defaultBrandUser);
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/v1/users', authRouter);
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Internal Server Error' });
  });
  return app;
}

const USER_ID = '507f1f77bcf86cd799439011';

describe('auth.controller.js', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    currentValidator = (req, res, next) => next();
  });

  // ── POST /register ─────────────────────────────────────────────────
  describe('POST /register', () => {
    it('should register a new user', async () => {
      mockRegister.mockResolvedValue({ _id: USER_ID, email: 'new@test.com', role: 'brand' });
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/register').send({
        fullname: 'New User', email: 'new@test.com', password: 'pass123', role: 'brand'
      });
      expect(res.status).toBe(201);
      expect(mockRegister).toHaveBeenCalled();
    });

    it('should return 400 if email already exists', async () => {
      mockRegister.mockRejectedValue({ statusCode: 400, message: 'Email is already registered' });
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/register').send({
        fullname: 'New User', email: 'dup@test.com', password: 'pass123', role: 'brand'
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 when validation fails', async () => {
      currentValidator = (req, res, next) => res.status(400).json({ success: false, message: 'Validation failed' });
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/register').send({});
      expect(res.status).toBe(400);
    });
  });

  // ── POST /login ────────────────────────────────────────────────────
  describe('POST /login', () => {
    it('should login successfully', async () => {
      mockLogin.mockResolvedValue({
        user: { _id: USER_ID, email: 'test@test.com' },
        accessToken: 'at',
        refreshToken: 'rt'
      });
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/login').send({ email: 'test@test.com', password: 'pass' });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBe('at');
    });

    it('should return 401 on invalid credentials', async () => {
      mockLogin.mockRejectedValue({ statusCode: 401, message: 'Invalid credentials' });
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/login').send({ email: 'test@test.com', password: 'wrong' });
      expect(res.status).toBe(401);
    });
  });

  // ── POST /logout ───────────────────────────────────────────────────
  describe('POST /logout', () => {
    it('should logout successfully', async () => {
      mockLogout.mockResolvedValue(undefined);
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/logout');
      expect(res.status).toBe(200);
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  // ── POST /refresh-token ────────────────────────────────────────────
  describe('POST /refresh-token', () => {
    it('should refresh token', async () => {
      mockRefresh.mockResolvedValue({ accessToken: 'new_at', refreshToken: 'new_rt' });
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/refresh-token').send({ refreshToken: 'rt' });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBe('new_at');
    });
  });

  // ── POST /forgot-password ──────────────────────────────────────────
  describe('POST /forgot-password', () => {
    it('should return success (silent on unknown)', async () => {
      mockForgotPassword.mockResolvedValue(undefined);
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/forgot-password').send({ email: 'test@test.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/OTP/i);
    });
  });

  // ── POST /reset-password ───────────────────────────────────────────
  describe('POST /reset-password', () => {
    it('should reset password', async () => {
      mockResetPassword.mockResolvedValue(undefined);
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/reset-password').send({ email: 'test@test.com', otp: '123456', password: 'newPass' });
      expect(res.status).toBe(200);
    });
  });

  // ── POST /change-password ──────────────────────────────────────────
  describe('POST /change-password', () => {
    it('should change password', async () => {
      mockChangePassword.mockResolvedValue(undefined);
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/change-password').send({ oldPassword: 'old', newPassword: 'new' });
      expect(res.status).toBe(200);
    });
  });

  // ── POST /send-otp ─────────────────────────────────────────────────
  describe('POST /send-otp', () => {
    it('should send OTP', async () => {
      mockSendOTP.mockResolvedValue(undefined);
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/send-otp');
      expect(res.status).toBe(200);
    });
  });

  // ── POST /verify-otp ───────────────────────────────────────────────
  describe('POST /verify-otp', () => {
    it('should verify OTP', async () => {
      mockVerifyOTP.mockResolvedValue(undefined);
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/verify-otp').send({ otp: '123456' });
      expect(res.status).toBe(200);
    });

    it('should return 400 if OTP missing', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/verify-otp').send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/OTP is required/i);
    });
  });

  // ── GET /facebook ──────────────────────────────────────────────────
  describe('GET /facebook', () => {
    it('should redirect to Facebook OAuth', async () => {
      mockGetFacebookAuthUrl.mockReturnValue('https://facebook.com/dialog/oauth?client_id=123');
      const app = buildApp();
      const res = await request(app).get('/api/v1/users/facebook');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('facebook.com');
    });
  });

  // ── GET /facebook/callback ─────────────────────────────────────────
  describe('GET /facebook/callback', () => {
    it('should handle Facebook callback', async () => {
      mockHandleFacebookCallback.mockResolvedValue({ username: 'test_ig', followers: 100, media_count: 5 });
      const app = buildApp();
      const res = await request(app).get('/api/v1/users/facebook/callback?code=abc123');
      expect(res.status).toBe(200);
      expect(res.body.instagram.username).toBe('test_ig');
    });

    it('should return 400 if error in query', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/users/facebook/callback?error=access_denied');
      expect(res.status).toBe(400);
    });

    it('should return 400 if code missing', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/users/facebook/callback');
      expect(res.status).toBe(400);
    });
  });

  // ── Auth guard ─────────────────────────────────────────────────────
  describe('auth guard', () => {
    it('should return 401 on protected routes without valid token', async () => {
      mockVerifyJwt.mockImplementationOnce((req, res, next) => res.status(401).json({ message: 'Unauthorized' }));
      const app = buildApp();
      const res = await request(app).post('/api/v1/users/logout');
      expect(res.status).toBe(401);
    });
  });
});
