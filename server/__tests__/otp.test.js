import { jest } from '@jest/globals';
import { otpRedis } from '../src/utils/otpRedisService.js';
import { authService } from '../src/modules/auth/auth.service.js';
import User from '../src/modules/user/user.model.js';
import { getRedisConnection } from '../src/config/redis.js';

describe('OTP System Automated Tests & SaaS Hardening Validation', () => {
    let mockUser;
    
    beforeEach(() => {
        jest.clearAllMocks();
        mockUser = {
            _id: 'mock_user_id',
            email: 'test@example.com',
            passwordResetOTP: undefined,
            passwordResetExpires: undefined,
            passwordResetAttempts: 0,
            emailVerificationOTP: undefined,
            emailVerificationOTPExpires: undefined,
            isVerified: false,
            save: jest.fn().mockResolvedValue(true),
            generatePasswordResetOTP: jest.fn().mockReturnValue('123456'),
            generateEmailVerificationOTP: jest.fn().mockReturnValue('654321')
        };
        User.findOne = jest.fn().mockResolvedValue(mockUser);
        User.findById = jest.fn().mockResolvedValue(mockUser);
        User.updateOne = jest.fn().mockImplementation(async (_filter, update) => {
            if (update.$set) Object.assign(mockUser, update.$set);
            if (update.$inc?.passwordResetAttempts) {
                mockUser.passwordResetAttempts += update.$inc.passwordResetAttempts;
            }
            return { acknowledged: true };
        });
        User.findByIdAndUpdate = jest.fn().mockImplementation(async (_id, update) => {
            Object.assign(mockUser, update);
            return mockUser;
        });
    });

    describe('1. Redis Key Privacy (PII Protection)', () => {
        it('should hash email addresses irreversibly for forgot password keys', () => {
            const email = 'user@example.com';
            const hashed = otpRedis.hashEmail(email);
            expect(hashed).toBeDefined();
            expect(hashed.length).toBe(64); // SHA-256 is 64 hex characters
            expect(hashed).not.toContain('user@example.com');
        });

        it('should generate secure hashed key namespaces for forgot password', () => {
            const email = 'user@example.com';
            const keys = otpRedis.getKeys('pwd-reset', email);
            expect(keys.otp).toContain('auth:otp:pwd-reset:');
            expect(keys.otp).not.toContain('user@example.com');
        });

        it('should use raw userId for verify-email key namespace (safe inside JWT context)', () => {
            const userId = '12345_user_id';
            const keys = otpRedis.getKeys('email-verify', userId);
            expect(keys.otp).toBe('auth:otp:email-verify:12345_user_id');
        });
    });

    describe('2. Brute-Force & Lockout Checks', () => {
        it('should verify that a user locked out is rejected early', async () => {
            jest.spyOn(otpRedis, 'checkLockout').mockResolvedValue(true);
            
            await expect(authService.forgotPassword('test@example.com'))
                .rejects.toThrow('Too many attempts. Try again in 1 hour.');
        });
    });

    describe('3. Cooldown & Spam Protection', () => {
        it('should verify that resending OTP within 60s cooldown is blocked', async () => {
            jest.spyOn(otpRedis, 'checkLockout').mockResolvedValue(false);
            jest.spyOn(otpRedis, 'checkCooldown').mockResolvedValue(true);
            
            await expect(authService.forgotPassword('test@example.com'))
                .rejects.toThrow('Please wait 60 seconds before requesting another OTP.');
        });
    });

    describe('4. Daily Request Throttling (SaaS Limits)', () => {
        it('should block generating password OTPs once 5 daily requests limit is met', async () => {
            jest.spyOn(otpRedis, 'checkLockout').mockResolvedValue(false);
            jest.spyOn(otpRedis, 'checkCooldown').mockResolvedValue(false);
            jest.spyOn(otpRedis, 'checkAndIncrementDailyLimit').mockResolvedValue({ allowed: false, count: 5 });

            await expect(authService.forgotPassword('test@example.com'))
                .rejects.toThrow('Daily OTP request limit reached (5 per day). Please try again tomorrow.');
        });

        it('should block email verification requests once 5 daily limit is met', async () => {
            jest.spyOn(otpRedis, 'checkLockout').mockResolvedValue(false);
            jest.spyOn(otpRedis, 'checkCooldown').mockResolvedValue(false);
            jest.spyOn(otpRedis, 'checkAndIncrementDailyLimit').mockResolvedValue({ allowed: false, count: 5 });

            await expect(authService.sendEmailVerificationOTP('mock_user_id'))
                .rejects.toThrow('Daily OTP request limit reached (5 per day). Please try again tomorrow.');
        });
    });

    describe('5. Redis Outage & Emergency HA Fallback (Circuit Breaker)', () => {
        it('should fallback to MongoDB storage if Redis is down when requesting forgot-password OTP', async () => {
            jest.spyOn(otpRedis, 'checkLockout').mockRejectedValue(new Error('Redis connection lost'));

            await authService.forgotPassword('test@example.com');

            expect(User.updateOne).toHaveBeenCalled();
            expect(mockUser.passwordResetOTP).toBeDefined();
            expect(mockUser.passwordResetExpires).toBeDefined();
            expect(mockUser.passwordResetAttempts).toBe(0);
        });

        it('should fallback to MongoDB verification if Redis is down when verifying reset-password OTP', async () => {
            jest.spyOn(otpRedis, 'checkLockout').mockRejectedValue(new Error('Redis connection lost'));
            jest.spyOn(otpRedis, 'verifyOTP').mockRejectedValue(new Error('Redis Connection Error'));

            mockUser.passwordResetOTP = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
            mockUser.passwordResetExpires = Date.now() + 10 * 60 * 1000;
            mockUser.passwordResetAttempts = 0;

            await authService.verifyResetOtp('test@example.com', '');
            await authService.resetPassword('test@example.com', '', 'new_password_123');

            expect(User.findByIdAndUpdate).toHaveBeenCalled();
            expect(mockUser.passwordResetOTP).toBeUndefined();
            expect(mockUser.passwordResetExpires).toBeUndefined();
        });

        it('should lockout user after 3 failed attempts in MongoDB fallback mode', async () => {
            jest.spyOn(otpRedis, 'checkLockout').mockRejectedValue(new Error('Redis connection lost'));
            jest.spyOn(otpRedis, 'verifyOTP').mockRejectedValue(new Error('Redis Connection Error'));

            mockUser.passwordResetOTP = 'hashed_otp_in_db';
            mockUser.passwordResetExpires = Date.now() + 10 * 60 * 1000;
            mockUser.passwordResetAttempts = 3;

            await expect(authService.verifyResetOtp('test@example.com', 'wrong_otp'))
                .rejects.toThrow('Too many attempts. Try again in 1 hour.');
        });
    });
});
