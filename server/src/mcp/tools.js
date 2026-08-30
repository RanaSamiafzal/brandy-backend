import { z } from 'zod';
import { assertScope } from './auth.js';
import { influencerService } from '../modules/influencer/influencer.service.js';
import { campaignService } from '../modules/campaign/campaign.service.js';
import { brandService } from '../modules/brand/brand.service.js';
import {
    getFilteredInfluencers,
    getMatchedCampaigns,
    getMatchedBrands,
} from '../modules/aiMatch/aiMatch.service.js';
import { scoreInfluencers, scoreCampaigns, scoreBrands } from '../modules/aiMatch/aiMatch.scorer.js';
import {
    formatAndRankInfluencers,
    formatAndRankCampaigns,
    formatAndRankBrands,
} from '../modules/aiMatch/aiMatch.formatter.js';
import Campaign from '../modules/campaign/campaign.model.js';
import Influencer from '../modules/influencer/influencer.model.js';

/**
 * @param {unknown} data
 * @returns {{ content: Array<{ type: 'text', text: string }> }}
 */
function textResult(data) {
    return {
        content: [
            {
                type: 'text',
                text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
            },
        ],
    };
}

/**
 * @param {unknown} error
 * @returns {{ content: Array<{ type: 'text', text: string }>, isError: true }}
 */
function errorResult(error) {
    const message = error?.message || 'Tool execution failed';
    return {
        content: [{ type: 'text', text: message }],
        isError: true,
    };
}

/**
 * Register Brandly read tools on an MCP server instance.
 * Uses the authenticated agent context (API key owner + scopes).
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {{ user: object, scopes: string[] }} agent
 */
export function registerBrandlyTools(server, agent) {
    const { user, scopes } = agent;

    server.registerTool(
        'search_influencers',
        {
            description:
                'Search Brandly influencers by keyword, category, platform, price, followers, rating, or location. Returns paginated public-facing results.',
            inputSchema: {
                search: z.string().optional().describe('Username search keyword'),
                category: z.string().optional().describe('Influencer category / niche'),
                platform: z.string().optional().describe('Platform name e.g. Instagram, YouTube, TikTok'),
                minPrice: z.number().optional().describe('Minimum service price'),
                maxPrice: z.number().optional().describe('Maximum service price'),
                minFollowers: z.number().optional().describe('Minimum followers on a platform'),
                rating: z.number().min(0).max(5).optional().describe('Minimum average rating'),
                location: z.string().optional().describe('Location filter'),
                page: z.number().int().min(1).optional().describe('Page number (default 1)'),
                limit: z.number().int().min(1).max(50).optional().describe('Page size (default 10)'),
                sort: z.enum(['latest', 'rating_desc']).optional().describe('Sort order'),
            },
        },
        async (args) => {
            try {
                assertScope(scopes, 'influencers:read');
                const data = await influencerService.searchInfluencers({
                    search: args.search,
                    category: args.category,
                    platform: args.platform,
                    minPrice: args.minPrice,
                    maxPrice: args.maxPrice,
                    minFollowers: args.minFollowers,
                    rating: args.rating,
                    location: args.location,
                    page: args.page ?? 1,
                    limit: args.limit ?? 10,
                    sort: args.sort ?? 'latest',
                });
                return textResult(data);
            } catch (error) {
                return errorResult(error);
            }
        }
    );

    server.registerTool(
        'get_influencer',
        {
            description:
                'Get a single Brandly influencer profile by influencer document ID or user ID, including reviews and active collaborations.',
            inputSchema: {
                influencerId: z.string().describe('Influencer MongoDB _id or linked user id'),
            },
        },
        async ({ influencerId }) => {
            try {
                assertScope(scopes, 'influencers:read');
                const data = await influencerService.getInfluencerById(influencerId);
                return textResult(data);
            } catch (error) {
                return errorResult(error);
            }
        }
    );

    server.registerTool(
        'list_campaigns',
        {
            description:
                'List Brandly campaigns visible to the API key owner. Brands see their own campaigns; influencers/admins see active public campaigns. Supports search, industry, and platform filters.',
            inputSchema: {
                status: z.string().optional().describe('Campaign status filter (mainly for brand owners)'),
                search: z.string().optional().describe('Text search on campaign fields'),
                industry: z.string().optional().describe('Industry filter'),
                platform: z.string().optional().describe('Platform filter'),
                page: z.number().int().min(1).optional().describe('Page number (default 1)'),
                limit: z.number().int().min(1).max(50).optional().describe('Page size (default 10)'),
            },
        },
        async (args) => {
            try {
                assertScope(scopes, 'campaigns:read');
                const role = user?.role;
                const data = await campaignService.getAllCampaigns({
                    role,
                    brand: role === 'brand' ? user._id : null,
                    status: role === 'influencer' ? 'active' : args.status,
                    search: args.search,
                    industry: args.industry,
                    platform: args.platform,
                    page: args.page ?? 1,
                    limit: args.limit ?? 10,
                });
                return textResult(data);
            } catch (error) {
                return errorResult(error);
            }
        }
    );

    server.registerTool(
        'get_campaign',
        {
            description: 'Get a single Brandly campaign by its MongoDB ID.',
            inputSchema: {
                campaignId: z.string().describe('Campaign MongoDB _id'),
            },
        },
        async ({ campaignId }) => {
            try {
                assertScope(scopes, 'campaigns:read');
                const data = await campaignService.getCampaignById(campaignId);
                return textResult(data);
            } catch (error) {
                return errorResult(error);
            }
        }
    );

    server.registerTool(
        'list_brands',
        {
            description: 'List public Brandly brands for explore/discovery. Supports search and industry filters.',
            inputSchema: {
                search: z.string().optional().describe('Search brand name, fullname, or industry'),
                industry: z.string().optional().describe('Industry filter (use All or omit for any)'),
                page: z.number().int().min(1).optional().describe('Page number (default 1)'),
                limit: z.number().int().min(1).max(50).optional().describe('Page size (default 12)'),
            },
        },
        async (args) => {
            try {
                assertScope(scopes, 'brands:read');
                const data = await brandService.getPublicBrandList({
                    search: args.search,
                    industry: args.industry,
                    page: args.page ?? 1,
                    limit: args.limit ?? 12,
                });
                return textResult(data);
            } catch (error) {
                return errorResult(error);
            }
        }
    );

    server.registerTool(
        'get_brand',
        {
            description:
                'Get a public Brandly brand profile by brand user ID (or brand id accepted by the public profile service), including campaigns and stats.',
            inputSchema: {
                brandId: z.string().describe('Brand user ID used by GET /brands/:brandId/public'),
            },
        },
        async ({ brandId }) => {
            try {
                assertScope(scopes, 'brands:read');
                const data = await brandService.getPublicProfile(brandId);
                return textResult(data);
            } catch (error) {
                return errorResult(error);
            }
        }
    );

    server.registerTool(
        'ai_match_for_campaign',
        {
            description:
                'Run Brandly AI matching to find and rank influencers for a given campaign ID (filter + score + rank).',
            inputSchema: {
                campaignId: z.string().describe('Campaign MongoDB _id to match influencers against'),
            },
        },
        async ({ campaignId }) => {
            try {
                assertScope(scopes, 'aimatch:read');
                const campaign = await Campaign.findById(campaignId).lean();
                if (!campaign) {
                    return errorResult(new Error('Campaign not found'));
                }

                const influencers = await getFilteredInfluencers(campaign);
                const scoredInfluencers = scoreInfluencers(influencers, campaign);
                const ranked = formatAndRankInfluencers(scoredInfluencers);

                return textResult({
                    success: true,
                    count: Array.isArray(ranked) ? ranked.length : 0,
                    data: ranked,
                });
            } catch (error) {
                return errorResult(error);
            }
        }
    );

    server.registerTool(
        'ai_match_for_influencer',
        {
            description:
                'Run Brandly AI matching for an influencer user ID. type=campaigns (default) ranks campaigns; type=brands ranks brands.',
            inputSchema: {
                userId: z.string().describe('Influencer user MongoDB _id'),
                type: z
                    .enum(['campaigns', 'brands'])
                    .optional()
                    .describe('Match type: campaigns (default) or brands'),
            },
        },
        async ({ userId, type }) => {
            try {
                assertScope(scopes, 'aimatch:read');
                const matchType = type || 'campaigns';

                const influencer = await Influencer.findOne({ user: userId }).lean();
                if (!influencer) {
                    return errorResult(new Error('Influencer profile not found'));
                }

                if (matchType === 'brands') {
                    const { brands, history, brandCollabMap } = await getMatchedBrands(influencer);
                    const scoredBrands = scoreBrands(brands, influencer, history);
                    const ranked = formatAndRankBrands(scoredBrands, brandCollabMap);
                    return textResult({
                        success: true,
                        count: Array.isArray(ranked) ? ranked.length : 0,
                        data: ranked,
                    });
                }

                const { campaigns, history } = await getMatchedCampaigns(influencer);
                const scoredCampaigns = scoreCampaigns(campaigns, influencer, history);
                const ranked = formatAndRankCampaigns(scoredCampaigns);

                return textResult({
                    success: true,
                    count: Array.isArray(ranked) ? ranked.length : 0,
                    data: ranked,
                });
            } catch (error) {
                return errorResult(error);
            }
        }
    );
}
