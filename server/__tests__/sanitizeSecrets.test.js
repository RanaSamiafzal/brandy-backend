import { stripSecretsDeep, sanitizeVerifiedPlatforms, isListedMember } from '../src/utils/sanitizeSecrets.js';

describe('Phase 1: secret sanitization', () => {
    it('strips JWT refreshTokens and OAuth refreshToken from nested payloads', () => {
        const dirty = {
            success: true,
            data: {
                user: {
                    email: 'a@b.com',
                    refreshTokens: ['jwt-secret'],
                    password: 'hash',
                    verifiedPlatforms: [
                        {
                            platform: 'youtube',
                            username: 'someone',
                            refreshToken: '1//oauth-secret',
                            tokenExpiry: '2026-01-01',
                            verified: true,
                        },
                    ],
                },
            },
        };

        const clean = stripSecretsDeep(dirty);
        const json = JSON.stringify(clean);

        expect(clean.data.user.email).toBe('a@b.com');
        expect(clean.data.user.refreshTokens).toBeUndefined();
        expect(clean.data.user.password).toBeUndefined();
        expect(json).not.toMatch(/refreshToken/);
        expect(json).not.toMatch(/oauth-secret/);
        expect(json).not.toMatch(/jwt-secret/);
        expect(clean.data.user.verifiedPlatforms[0].platform).toBe('youtube');
        expect(clean.data.user.verifiedPlatforms[0].username).toBe('someone');
        expect(clean.data.user.verifiedPlatforms[0].verified).toBe(true);
        expect(clean.data.user.verifiedPlatforms[0].tokenExpiry).toBeUndefined();
    });

    it('sanitizeVerifiedPlatforms keeps public fields only', () => {
        const out = sanitizeVerifiedPlatforms([
            { platform: 'tiktok', username: 'x', refreshToken: 'secret', connected: true },
        ]);
        expect(out[0].refreshToken).toBeUndefined();
        expect(out[0].username).toBe('x');
        expect(out[0].connected).toBe(true);
    });

    it('walks class instances such as ApiResponse', () => {
        class ApiResponse {
            constructor(data) {
                this.statusCode = 200;
                this.data = data;
                this.message = 'ok';
                this.success = true;
            }
        }
        const wrapped = new ApiResponse({
            influencers: [{ verifiedPlatforms: [{ platform: 'youtube', refreshToken: 'leak' }] }],
        });
        const clean = stripSecretsDeep(wrapped);
        expect(clean.success).toBe(true);
        expect(JSON.stringify(clean)).not.toMatch(/refreshToken/);
        expect(clean.data.influencers[0].verifiedPlatforms[0].platform).toBe('youtube');
    });

    it('isListedMember matches populated and raw ids', () => {
        const uid = '69c8c3f9b71736236f3195ad';
        expect(isListedMember(uid, [uid])).toBe(true);
        expect(isListedMember(uid, [{ _id: uid }])).toBe(true);
        expect(isListedMember(uid, ['aaaaaaaaaaaaaaaaaaaaaaaa'])).toBe(false);
        expect(isListedMember(uid, null)).toBe(false);
    });
});
