import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { resolveApiKeyFromRequest } from './auth.js';
import { registerBrandlyTools } from './tools.js';

/**
 * Build a fresh MCP server for one request (stateless), bound to the agent context.
 * @param {{ user: object, scopes: string[] }} agent
 */
export function createBrandlyMcpServer(agent) {
    const server = new McpServer({
        name: 'brandly',
        version: '1.0.0',
    });

    registerBrandlyTools(server, agent);
    return server;
}

/**
 * Express middleware: require a valid Brandly API key for /mcp.
 */
export async function mcpAuthMiddleware(req, res, next) {
    try {
        const agent = await resolveApiKeyFromRequest(req);
        req.mcpAgent = agent;
        next();
    } catch (error) {
        const status = error.status || 401;
        return res.status(status).json({
            jsonrpc: '2.0',
            error: {
                code: status === 403 ? -32003 : -32001,
                message: error.message || 'Unauthorized',
            },
            id: null,
        });
    }
}

/**
 * Stateless Streamable HTTP handler for Botpress / MCP clients.
 * Creates a transport + server per request; uses JSON responses (no long-lived SSE).
 */
export async function handleMcpRequest(req, res) {
    const agent = req.mcpAgent;
    if (!agent) {
        return res.status(401).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Unauthorized' },
            id: null,
        });
    }

    const server = createBrandlyMcpServer(agent);
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });

    try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('[MCP] Error handling request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    } finally {
        res.on('close', () => {
            transport.close().catch(() => {});
            server.close().catch(() => {});
        });
    }
}

/**
 * Mount MCP routes on the main Express app.
 * @param {import('express').Express} app
 */
export function mountMcpRoutes(app) {
    const methods = ['post', 'get', 'delete'];

    for (const method of methods) {
        app[method]('/mcp', mcpAuthMiddleware, async (req, res) => {
            await handleMcpRequest(req, res);
        });
    }

    // Lightweight discovery / health for humans (no auth)
    app.get('/mcp/health', (_req, res) => {
        res.status(200).json({
            success: true,
            name: 'brandly',
            transport: 'streamable-http',
            endpoint: '/mcp',
            auth: 'X-API-KEY or Authorization: Bearer <api_key>',
            tools: [
                'search_influencers',
                'get_influencer',
                'list_campaigns',
                'get_campaign',
                'list_brands',
                'get_brand',
                'ai_match_for_campaign',
                'ai_match_for_influencer',
            ],
        });
    });
}
