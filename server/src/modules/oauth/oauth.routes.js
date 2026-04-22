import { Router } from 'express';
import { oauthController } from './oauth.controller.js';
import { verifyJwt } from '../../middleware/authMiddleware.js';

const router = Router();

/**
 * GET /api/v1/oauth/status
 * Returns current user's verified platforms
 */
router.get('/status', verifyJwt, oauthController.getStatus);

/**
 * GET /api/v1/oauth/:platform/connect
 * Initiates OAuth for a platform (YouTube, TikTok, Instagram, LinkedIn)
 */
router.get('/:platform/connect', oauthController.connect);

/**
 * GET /api/v1/oauth/:platform/callback
 * Generic callback handler for all platforms
 */
router.get('/:platform/callback', oauthController.callback);

/**
 * DELETE /api/v1/oauth/:platform/revoke
 * Revokes verification for a platform
 */
router.delete('/:platform/revoke', verifyJwt, oauthController.revoke);

export default router;
