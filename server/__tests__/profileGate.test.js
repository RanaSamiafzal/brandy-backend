import { jest } from '@jest/globals';
import { requireProfileComplete } from '../src/middleware/profileGate.js';

function mockRes() {
  return {};
}

describe('requireProfileComplete', () => {
  it('calls next() when profileComplete is true', () => {
    const req = { user: { _id: 'u1', profileComplete: true } };
    const next = jest.fn();

    requireProfileComplete(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('forwards 403 when profile is incomplete', () => {
    const req = { user: { _id: 'u1', profileComplete: false } };
    const next = jest.fn();

    requireProfileComplete(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/complete your profile/i);
  });

  it('forwards 401 when req.user is missing', () => {
    const next = jest.fn();

    requireProfileComplete({}, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });
});
