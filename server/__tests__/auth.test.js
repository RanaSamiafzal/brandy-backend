import { jest } from '@jest/globals';
import { verifyJwt } from '../src/middleware/authMiddleware.js';
import { roleMiddleware } from '../src/middleware/roleMiddleware.js';
import { validationStatus } from '../src/utils/ValidationStatusCode.js';
import jwt from 'jsonwebtoken';
import User from '../src/modules/user/user.model.js';

describe('Phase 2: Authentication & RBAC Audit', () => {

    describe('Auth Middleware (verifyJwt)', () => {
        let req, res, next;

        beforeEach(() => {
            req = { cookies: {}, header: jest.fn() };
            res = {};
            next = jest.fn();
            jest.clearAllMocks();
        });

        it('should call next with Unauthorized if no token is provided', (done) => {
            next = (err) => {
                expect(err.statusCode).toBe(validationStatus.unauthorized);
                done();
            };
            verifyJwt(req, res, next);
        });

        it('should call next with Unauthorized if token is invalid', (done) => {
            req.cookies.accessToken = 'invalid_token';
            jest.spyOn(jwt, 'verify').mockImplementation(() => {
                throw new Error('jwt malformed');
            });

            next = (err) => {
                expect(err.statusCode).toBe(validationStatus.unauthorized);
                done();
            };
            verifyJwt(req, res, next);
        });

        it('should call next if token is valid and user exists', (done) => {
            req.cookies.accessToken = 'valid_token';
            const decoded = { _id: '123' };
            jest.spyOn(jwt, 'verify').mockReturnValue(decoded);

            const mockUser = { _id: '123', isBlocked: false, isDeactivated: false };
            User.findById = jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(mockUser)
            });

            next = (err) => {
                expect(err).toBeUndefined();
                expect(req.user).toEqual(mockUser);
                done();
            };
            verifyJwt(req, res, next);
        });

        it('should call next with Forbidden if user is blocked', (done) => {
            req.cookies.accessToken = 'valid_token';
            const decoded = { _id: '123' };
            jest.spyOn(jwt, 'verify').mockReturnValue(decoded);

            const mockUser = { _id: '123', isBlocked: true, isDeactivated: false };
            User.findById = jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(mockUser)
            });

            next = (err) => {
                expect(err.statusCode).toBe(validationStatus.forbidden);
                done();
            };
            verifyJwt(req, res, next);
        });
    });

    describe('Role Middleware', () => {
        let req, res, next;

        beforeEach(() => {
            req = { user: { role: 'brand' } };
            res = {};
            next = jest.fn();
        });

        it('should allow access if role matches', () => {
            const middleware = roleMiddleware('brand', 'admin');
            middleware(req, res, next);
            expect(next).toHaveBeenCalled();
        });

        it('should throw Forbidden if role does not match', () => {
            const middleware = roleMiddleware('influencer');
            expect(() => middleware(req, res, next)).toThrow('You do not have permission to access this resource');
        });

        it('should throw Unauthorized if no user is found', () => {
            req.user = undefined;
            const middleware = roleMiddleware('brand');
            expect(() => middleware(req, res, next)).toThrow('Unauthorized access');
        });
    });
});
