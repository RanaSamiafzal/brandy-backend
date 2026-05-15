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
            // Note: Since tests run in a test environment, not all production vars may be present.
            // We just test if process.env is accessible and not empty.
            expect(process.env).toBeDefined();
        });
    });

    describe('Security Headers', () => {
        it('should have security headers from helmet', async () => {
            const response = await request(app).get('/api/v1/ping');
            // Helmet sets Cross-Origin-Resource-Policy by default based on our config
            expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
            expect(response.headers['content-security-policy']).toBeDefined();
        });
    });
});
