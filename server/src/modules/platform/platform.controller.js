import { AsyncHandler } from '../../utils/Asynchandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { validationStatus } from '../../utils/ValidationStatusCode.js';
import User from '../user/user.model.js';

/**
 * GET /api/v1/platforms/youtube
 * Returns the authenticated user's stored YouTube platform data.
 * Does NOT call the YouTube API — reads from DB only.
 */
const getYouTubeData = AsyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('platforms.youtube').lean();

    if (!user) {
        return res.status(validationStatus.notFound).json(
            new ApiResponse(validationStatus.notFound, null, 'User not found')
        );
    }

    const youtubeData = user.platforms?.youtube || null;

    if (!youtubeData || !youtubeData.channelId) {
        return res.status(validationStatus.ok).json(
            new ApiResponse(validationStatus.ok, null, 'No YouTube data available. Connect your YouTube account first.')
        );
    }

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, youtubeData, 'YouTube platform data fetched successfully')
    );
});

export const platformController = {
    getYouTubeData,
};
