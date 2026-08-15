import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockSendEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../src/utils/email.js', () => ({
  sendEmail: mockSendEmail,
}));

jest.unstable_mockModule('../src/modules/support/support.service.js', () => ({
  supportService: {
    createTicket: jest.fn(),
  },
}));

jest.unstable_mockModule('../src/modules/support/support.repository.js', () => ({
  supportRepository: {
    findByUserId: jest.fn(),
    findById: jest.fn(),
    getAllTickets: jest.fn(),
  },
}));

jest.unstable_mockModule('../src/middleware/authMiddleware.js', () => ({
  verifyJwt: (req, res, next) => next(),
}));

jest.unstable_mockModule('../src/middleware/roleMiddleware.js', () => ({
  roleMiddleware: () => (req, res, next) => next(),
}));

let supportRouter;

beforeAll(async () => {
  supportRouter = (await import('../src/modules/support/support.routes.js')).default;
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/support', supportRouter);
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Internal Server Error',
    });
  });
  return app;
}

describe('POST /api/v1/support/contact', () => {
  beforeEach(() => {
    mockSendEmail.mockClear();
  });

  it('returns 400 (not 500) when required fields are missing', async () => {
    const res = await request(buildApp())
      .post('/api/v1/support/contact')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/missing required fields/i);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 200 when the body is complete', async () => {
    const res = await request(buildApp())
      .post('/api/v1/support/contact')
      .send({
        firstName: 'Sami',
        lastName: 'Afzal',
        email: 'sami@test.com',
        subject: 'Hello',
        message: 'Need help',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSendEmail).toHaveBeenCalled();
  });
});
