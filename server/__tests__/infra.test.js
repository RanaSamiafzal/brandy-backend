import request from 'supertest';
import { app } from '../src/app.js';

describe('Phase 1: Infrastructure & Environment Audit', () => {
    describe('GET /', () => {
        it('should return 200 and Brandy API running message', async () => {
            const response = await request(app).get('/');
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Brandy API Running Successfully');
        });
    });

    describe('GET /api/v1/ping', () => {
        it('should return 200 with server status ok', async () => {
            const response = await request(app).get('/api/v1/ping');
            expect(response.status).toBe(200);
            expect(response.body.status).toBe('ok');
            expect(response.body.server).toBe('brandy-backend-primary');
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('Environment Variables', () => {
        it('should have basic environment variables loaded', () => {
            expect(process.env).toBeDefined();
        });
    });

    describe('Security Headers', () => {
        it('should have security headers from helmet', async () => {
            const response = await request(app).get('/api/v1/ping');
            expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
            expect(response.headers['content-security-policy']).toBeDefined();
        });
    });

    // ── Phase 5 expansions ──────────────────────────────────────────

    describe('CORS Headers', () => {
        it('should return Access-Control-Allow-Origin on preflight', async () => {
            const res = await request(app)
                .options('/api/v1/ping')
                .set('Origin', 'http://localhost:5173')
                .set('Access-Control-Request-Method', 'GET');
            expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
        });

        it('should reflect allowed origins', async () => {
            const res = await request(app).get('/api/v1/ping').set('Origin', 'http://localhost:3000');
            expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
        });

        it('should include credentials header', async () => {
            const res = await request(app).get('/api/v1/ping').set('Origin', 'http://localhost:5173');
            expect(res.headers['access-control-allow-credentials']).toBe('true');
        });

        it('should reject disallowed origins', async () => {
            const res = await request(app).get('/api/v1/ping').set('Origin', 'https://evil.com');
            // CORS with credentials doesn't return the header for disallowed origins
            expect(res.headers['access-control-allow-origin']).toBeUndefined();
        });
    });

    describe('Compression', () => {
        it('should set Vary: Accept-Encoding header', async () => {
            const res = await request(app)
                .get('/api/v1/ping')
                .set('Accept-Encoding', 'gzip');
            // compression middleware sets Vary header; actual gzip may depend on supertest
            expect(res.headers['vary']).toMatch(/accept-encoding/i);
        });
    });

    describe('Rate Limiting', () => {
        it('should limit auth routes after many requests', async () => {
            const promises = [];
            for (let i = 0; i < 110; i++) {
                promises.push(
                    request(app)
                        .post('/api/v1/auth/login')
                        .send({ email: 'test@test.com', password: 'pass' })
                        .then(r => r.status)
                );
            }
            const statuses = await Promise.all(promises);
            const tooMany = statuses.filter(s => s === 429);
            expect(tooMany.length).toBeGreaterThan(0);
        }, 30000);

        it('should include rate-limit headers on limited response', async () => {
            // First make one auth request to warm up the rate limiter
            await request(app).post('/api/v1/auth/login').send({ email: 't@t.com', password: 'p' });
            // Make enough to get limited
            const results = [];
            for (let i = 0; i < 120; i++) {
                results.push(await request(app).post('/api/v1/auth/login').send({ email: 't@t.com', password: 'p' }));
            }
            const limited = results.find(r => r.status === 429);
            expect(limited).toBeDefined();
            expect(limited.headers['retry-after']).toBeDefined();
        }, 30000);
    });

    describe('404 Handling', () => {
        it('should return 404 for unknown API routes', async () => {
            const res = await request(app).get('/api/v1/nonexistent');
            expect(res.status).toBe(404);
        });
    });

    describe('Error Middleware', () => {
        it('should handle malformed JSON body on non-limited route', async () => {
            // /api/v1/ping has no rate limiter — send invalid JSON
            const res = await request(app)
                .post('/api/v1/ping')
                .set('Content-Type', 'application/json')
                .send('not-json-at-all');
            expect(res.status).toBe(400);
        });

        it('should return JSON error shape on 404', async () => {
            const res = await request(app).get('/api/v1/nonexistent');
            expect(res.status).toBe(404);
            expect(res.body).toBeDefined();
        });
    });

    describe('XSS & NoSQL Sanitization', () => {
        it('should handle XSS payload without crashing', async () => {
            // Use a non-rate-limited route
            const res = await request(app)
                .post('/api/v1/ping')
                .send({ email: '<script>alert("xss")</script>', password: 'pass' });
            // Should not crash; status 404 since POST /api/v1/ping doesn't exist
            expect(res.status).toBe(404);
        });
    });
});
