import { Router } from 'express';
import { platformController } from './platform.controller.js';
import { verifyJwt } from '../../middleware/authMiddleware.js';

const router = Router();

/**
 * GET /api/v1/platforms/youtube
 * Returns stored YouTube analytics data for the logged-in user.
 * Protected — requires authentication.
 */
router.get('/youtube', verifyJwt, platformController.getYouTubeData);

export default router;
