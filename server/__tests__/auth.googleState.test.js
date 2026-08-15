import { encodeGoogleState, decodeGoogleState } from '../src/modules/auth/auth.googleState.js';

describe('auth.googleState', () => {
  const prev = process.env.ACCESS_TOKEN_SECRET;

  beforeAll(() => {
    process.env.ACCESS_TOKEN_SECRET = 'test-google-state-secret';
  });

  afterAll(() => {
    process.env.ACCESS_TOKEN_SECRET = prev;
  });

  it('round-trips role and intent', () => {
    const token = encodeGoogleState({ role: 'influencer', intent: 'signup' });
    expect(decodeGoogleState(token)).toEqual({ role: 'influencer', intent: 'signup' });
  });

  it('falls back to brand/login for missing state', () => {
    expect(decodeGoogleState('')).toEqual({ role: 'brand', intent: 'login' });
  });

  it('rejects tampered state', () => {
    const token = encodeGoogleState({ role: 'brand', intent: 'login' });
    expect(() => decodeGoogleState(`${token}x`)).toThrow(/Invalid Google sign-in state/i);
  });
});
