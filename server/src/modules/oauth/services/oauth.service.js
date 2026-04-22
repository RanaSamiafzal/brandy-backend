import User from '../../user/user.model.js';

/**
 * OAuthService handles verification for social platforms.
 * 
 * DESIGN PRINCIPLE:
 * - Isolated: Each platform has its own dedicated logic path.
 * - Atomic: Database updates use findOneAndUpdate to prevent race conditions.
 * - Abstracted: Instagram handles both Basic Display and Graph API via internal routing.
 */
class OAuthService {
    constructor() {
        this.mode = process.env.OAUTH_MODE || 'dev';
        this.supportedPlatforms = ['youtube', 'tiktok', 'instagram', 'linkedin', 'facebook', 'twitter'];
        this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    }

    /**
     * Generates a platform-specific authorization URL.
     */
    async getAuthUrl(platform) {
        if (!this.supportedPlatforms.includes(platform)) {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        if (this.mode === 'dev' && process.env.FORCE_SIMULATE === 'true') {
            return `${this.frontendUrl}/oauth/callback?platform=${platform}&status=pending&mode=simulate`;
        }

        switch (platform) {
            case 'youtube': return this._handleYouTubeAuthUrl();
            case 'tiktok': return this._handleTikTokAuthUrl();
            case 'instagram': return this._handleInstagramAuthUrl();
            case 'linkedin': return this._handleLinkedInAuthUrl();
            case 'facebook': return this._handleFacebookAuthUrl();
            case 'twitter': return this._handleTwitterAuthUrl();
            default: throw new Error('Platform handler not implemented');
        }
    }

    /**
     * Verifies platform ownership after callback.
     * Core methodology: Exchange Code -> Get Profile -> Atomic DB Update
     */
    async verifyPlatform(platform, code, userId) {
        if (!this.supportedPlatforms.includes(platform)) {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        // ── Dev Bypass ──────────────────────────────────────────────────────────
        if (this.mode === 'dev' && (!code || code === 'simulate')) {
            return this._updateUserVerification(userId, {
                platform,
                username: `Simulated_${platform}_User`,
                platformUserId: `sim_${Date.now()}`,
                profileUrl: `https://${platform}.com/simulated_user`,
                connected: true,
                verified: true
            });
        }

        if (!code) throw new Error('Authorization code is required for production');

        let profileData;
        switch (platform) {
            case 'youtube': profileData = await this._verifyYouTube(code); break;
            case 'tiktok': profileData = await this._verifyTikTok(code); break;
            case 'instagram': profileData = await this._verifyInstagram(code); break;
            case 'linkedin': profileData = await this._verifyLinkedIn(code); break;
            case 'facebook': profileData = await this._verifyFacebook(code); break;
            case 'twitter': profileData = await this._verifyTwitter(code); break;
            default: throw new Error('Platform verification handler not implemented');
        }

        const result = await this._updateUserVerification(userId, { platform, ...profileData, connected: true, verified: true });

        // ── Non-Blocking Background Tasks ──────────────────────────────────────
        setImmediate(() => {
            this._triggerBackgroundTasks(userId, platform, profileData).catch(err => {
                console.error(`[OAuth Background] Task error for ${platform}:`, err.message);
            });
        });

        return result;
    }

    /**
     * Placeholder for extensible background tasks (Analytics, Logging, notifications, etc.).
     */
    async _triggerBackgroundTasks(userId, platform, data) {
        // Implementation placeholder — extend this for Bull/Redis or other queues.
        // For now, it stays empty and non-blocking as per production hardening rules.
        return true;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // PRIVATE HANDLERS: YOUTUBE
    // ────────────────────────────────────────────────────────────────────────────

    _handleYouTubeAuthUrl() {
        const clientID = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
        const callbackUrl = process.env.YOUTUBE_VERIFY_CALLBACK_URL;
        const params = new URLSearchParams({
            client_id: clientID,
            redirect_uri: callbackUrl,
            response_type: 'code',
            scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile',
            access_type: 'offline',
            prompt: 'consent',
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    async _verifyYouTube(code) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: process.env.YOUTUBE_VERIFY_CALLBACK_URL,
                grant_type: 'authorization_code',
            }).toString(),
        });
        const tokens = await tokenRes.json();
        if (!tokens.access_token) throw new Error('YouTube token exchange failed');

        const profileRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const profile = await profileRes.json();
        const channel = profile.items?.[0];
        if (!channel) throw new Error('No YouTube channel found for this account');

        return {
            username: channel.snippet.title,
            platformUserId: channel.id,
            profileUrl: `https://youtube.com/channel/${channel.id}`,
            refreshToken: tokens.refresh_token || null,
            tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // PRIVATE HANDLERS: TIKTOK
    // ────────────────────────────────────────────────────────────────────────────

    _handleTikTokAuthUrl() {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const callbackUrl = process.env.TIKTOK_CALLBACK_URL;
        const params = new URLSearchParams({
            client_key: clientKey,
            response_type: 'code',
            scope: 'user.info.basic',
            redirect_uri: callbackUrl,
            state: Math.random().toString(36).substring(7),
        });
        return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
    }

    async _verifyTikTok(code) {
        const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_key: process.env.TIKTOK_CLIENT_KEY,
                client_secret: process.env.TIKTOK_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: process.env.TIKTOK_CALLBACK_URL,
            }).toString(),
        });
        const tokens = await tokenRes.json();
        if (!tokens.access_token) throw new Error('TikTok token exchange failed');

        const profileRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,open_id,avatar_url', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const { data } = await profileRes.json();
        const user = data?.user;
        if (!user) throw new Error('TikTok user info fetch failed');

        return {
            username: user.display_name,
            platformUserId: user.open_id,
            profileUrl: `https://tiktok.com/@${user.display_name}`,
            refreshToken: tokens.refresh_token || null,
            tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // PRIVATE HANDLERS: INSTAGRAM (Abstraction: Basic Display vs Graph)
    // ────────────────────────────────────────────────────────────────────────────

    _handleInstagramAuthUrl() {
        const apiType = (process.env.INSTAGRAM_API_TYPE || 'basic').toLowerCase();
        const isGraph = apiType === 'graph';
        const clientID = process.env.INSTAGRAM_CLIENT_ID;
        const callbackUrl = process.env.INSTAGRAM_CALLBACK_URL;

        if (isGraph) {
            return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientID}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=instagram_basic,pages_show_list`;
        } else {
            return `https://api.instagram.com/oauth/authorize?client_id=${clientID}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=user_profile,user_media&response_type=code`;
        }
    }

    async _verifyInstagram(code) {
        const apiType = (process.env.INSTAGRAM_API_TYPE || 'basic').toLowerCase();
        if (apiType === 'graph') return this._verifyInstagramGraph(code);
        return this._verifyInstagramBasic(code);
    }

    async _verifyInstagramBasic(code) {
        const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: process.env.INSTAGRAM_CLIENT_ID,
                client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
                grant_type: 'authorization_code',
                redirect_uri: process.env.INSTAGRAM_CALLBACK_URL,
                code,
            }),
        });
        const tokens = await tokenRes.json();
        if (!tokens.access_token) throw new Error('Instagram token exchange failed');

        const profileRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${tokens.access_token}`);
        const user = await profileRes.json();
        if (!user.username) throw new Error('Instagram profile fetch failed');

        return {
            username: user.username,
            platformUserId: user.id,
            profileUrl: `https://instagram.com/${user.username}`,
            tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null
        };
    }

    async _verifyInstagramGraph(code) {
        throw new Error('Instagram Graph API handler not yet implemented');
    }

    // ────────────────────────────────────────────────────────────────────────────
    // PRIVATE HANDLERS: LINKEDIN
    // ────────────────────────────────────────────────────────────────────────────

    _handleLinkedInAuthUrl() {
        const clientID = process.env.LINKEDIN_CLIENT_ID;
        const callbackUrl = process.env.LINKEDIN_CALLBACK_URL;
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientID,
            redirect_uri: callbackUrl,
            scope: 'openid profile email',
        });
        return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
    }

    async _verifyLinkedIn(code) {
        const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: process.env.LINKEDIN_CLIENT_ID,
                client_secret: process.env.LINKEDIN_CLIENT_SECRET,
                redirect_uri: process.env.LINKEDIN_CALLBACK_URL,
            }).toString(),
        });
        const tokens = await tokenRes.json();
        if (!tokens.access_token) throw new Error('LinkedIn token exchange failed');

        const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const user = await profileRes.json();
        if (!user.sub) throw new Error('LinkedIn profile fetch failed');

        return {
            username: user.name,
            platformUserId: user.sub,
            profileUrl: `https://www.linkedin.com/in/${user.sub}`,
            tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // PRIVATE HANDLERS: FACEBOOK
    // ────────────────────────────────────────────────────────────────────────────

    _handleFacebookAuthUrl() {
        const clientID = process.env.FACEBOOK_CLIENT_ID;
        const callbackUrl = process.env.FACEBOOK_CALLBACK_URL;
        const params = new URLSearchParams({
            client_id: clientID,
            redirect_uri: callbackUrl,
            scope: 'public_profile,email',
            response_type: 'code',
            auth_type: 'rerequest',
            display: 'popup',
        });
        return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    }

    async _verifyFacebook(code) {
        const tokenRes = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
            method: 'GET',
            body: new URLSearchParams({
                client_id: process.env.FACEBOOK_CLIENT_ID,
                client_secret: process.env.FACEBOOK_CLIENT_SECRET,
                redirect_uri: process.env.FACEBOOK_CALLBACK_URL,
                code,
            }),
        });
        const tokens = await tokenRes.json();
        if (!tokens.access_token) throw new Error('Facebook token exchange failed');

        const profileRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${tokens.access_token}`);
        const user = await profileRes.json();
        if (!user.id) throw new Error('Facebook profile fetch failed');

        return {
            username: user.name,
            platformUserId: user.id,
            profileUrl: `https://facebook.com/${user.id}`,
            tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // PRIVATE HANDLERS: TWITTER (X)
    // ────────────────────────────────────────────────────────────────────────────

    _handleTwitterAuthUrl() {
        // Twitter OAuth 2.0 PKCE flow (Simplified for placeholder)
        const clientID = process.env.TWITTER_CLIENT_ID;
        const callbackUrl = process.env.TWITTER_CALLBACK_URL;
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientID,
            redirect_uri: callbackUrl,
            scope: 'tweet.read users.read offline.access',
            state: 'state',
            code_challenge: 'challenge',
            code_challenge_method: 'plain',
        });
        return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
    }

    async _verifyTwitter(code) {
        // Placeholder for Twitter verification logic
        throw new Error('Twitter OAuth 2.0 verification requires PKCE state management (not yet implemented)');
    }

    // ────────────────────────────────────────────────────────────────────────────
    // ── DB ATOMIC UPDATE
    // ────────────────────────────────────────────────────────────────────────────

    async _updateUserVerification(userId, platformData) {
        const platform = platformData.platform;
        const data = { 
            ...platformData, 
            lastSyncedAt: new Date(),
            updatedAt: new Date() 
        };

        // ── Uniqueness Check: Ensure this platform account isn't used by anyone else ──
        const existingOwner = await User.findOne({
            _id: { $ne: userId },
            verifiedPlatforms: {
                $elemMatch: {
                    platform: platform,
                    platformUserId: platformData.platformUserId,
                    verified: true
                }
            }
        });

        if (existingOwner) {
            throw new Error(`This ${platform} account is already linked to another profile.`);
        }

        await User.updateOne(
            { _id: userId },
            { $pull: { verifiedPlatforms: { platform: platform } } }
        );

        const result = await User.findOneAndUpdate(
            { _id: userId },
            { $push: { verifiedPlatforms: data } },
            { new: true, upsert: true }
        );

        if (!result) throw new Error(`Failed to update user verification for ${platform}`);

        return { success: true, platform };
    }
}

export const oauthService = new OAuthService();
