import { AsyncHandler } from '../../utils/Asynchandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { validationStatus } from '../../utils/ValidationStatusCode.js';
import User from '../user/user.model.js';
import { oauthService } from './services/oauth.service.js';
import jwt from 'jsonwebtoken';

/**
 * Shared: identify logged-in user from JWT cookie.
 * Needed for callbacks where traditional auth middleware might be skipped or session-less.
 */
const getUserFromCookie = async (req) => {
    const token = req.cookies?.accessToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        return await User.findById(decoded._id);
    } catch {
        return null;
    }
};

/**
 * GET /oauth/:platform/connect
 * Redirects user to the platform's OAuth provider.
 */
const connect = AsyncHandler(async (req, res) => {
    const { platform } = req.params;
    try {
        const authUrl = await oauthService.getAuthUrl(platform);
        return res.redirect(authUrl);
    } catch (error) {
        console.error(`[OAuth Connect] Error for ${platform}:`, error.message);
        const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${FRONTEND_URL}/oauth/callback?platform=${platform}&status=error&msg=${encodeURIComponent(error.message)}`);
    }
});

/**
 * GET /oauth/:platform/callback
 * Generic callback handler for all platforms.
 */
const callback = AsyncHandler(async (req, res) => {
    const { platform } = req.params;
    const { code, error } = req.query;
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (error) {
        return res.redirect(`${FRONTEND_URL}/oauth/callback?platform=${platform}&status=error&msg=${error}`);
    }

    const user = await getUserFromCookie(req);
    if (!user) {
        return res.redirect(`${FRONTEND_URL}/oauth/callback?platform=${platform}&status=error&msg=not_logged_in`);
    }

    try {
        await oauthService.verifyPlatform(platform, code, user._id);
        
        // Redirect back to frontend OAuthCallbackPage to handle UI updates
        return res.redirect(`${FRONTEND_URL}/oauth/callback?platform=${platform}&status=success`);
    } catch (err) {
        console.error(`[OAuth Callback] ${platform} error:`, err.message);
        return res.redirect(`${FRONTEND_URL}/oauth/callback?platform=${platform}&status=error&msg=${encodeURIComponent(err.message)}`);
    }
});

/**
 * GET /oauth/status
 */
const getStatus = AsyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json(new ApiResponse(404, null, 'User not found'));

    const platforms = user.verifiedPlatforms || [];
    const vpMap = {};
    platforms.forEach(p => {
        vpMap[p.platform] = p.verified;
    });

    const verifiedCount = platforms.filter(p => p.verified).length;

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            verifiedPlatforms: vpMap,
            verifiedDetails: platforms, // Include details for advanced UI
            isProfileVerified: verifiedCount >= 3,
            verifiedCount,
        }, 'OAuth status fetched')
    );
});

/**
 * DELETE /oauth/:platform/revoke
 */
const revoke = AsyncHandler(async (req, res) => {
    const { platform } = req.params;

    const user = await User.findOneAndUpdate(
        { _id: req.user._id, "verifiedPlatforms.platform": platform },
        { $set: { "verifiedPlatforms.$.verified": false, "verifiedPlatforms.$.connected": false } },
        { new: true }
    );

    if (!user) return res.status(404).json(new ApiResponse(404, null, 'Platform entry not found'));

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, null, `${platform} verification revoked`)
    );
});

export const oauthController = {
    connect,
    callback,
    getStatus,
    revoke,
};
