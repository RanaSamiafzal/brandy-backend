import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { resolveApiKeyFromRequest } from './auth.js';
import { registerBrandlyTools } from './tools.js';

/** @type {Map<string, { transport: StreamableHTTPServerTransport, server: McpServer }>} */
const sessions = new Map();

/**
 * Build a fresh MCP server bound to the agent context.
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
 * Streamable HTTP handler with JSON responses + session IDs (Botpress-friendly).
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

    try {
        const sessionId = req.headers['mcp-session-id'];

        if (sessionId && sessions.has(sessionId)) {
            const { transport } = sessions.get(sessionId);
            await transport.handleRequest(req, res, req.body);
            return;
        }

        if (!sessionId && req.body && isInitializeRequest(req.body)) {
            const server = createBrandlyMcpServer(agent);
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                enableJsonResponse: true,
                onsessioninitialized: (id) => {
                    sessions.set(id, { transport, server });
                },
            });

            transport.onclose = () => {
                const id = transport.sessionId;
                if (id) sessions.delete(id);
            };

            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            return;
        }

        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Bad Request: No valid session ID. Call initialize first.',
            },
            id: null,
        });
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
    }
}

function mcpMethodNotAllowed(_req, res) {
    res.status(405).json({
        jsonrpc: '2.0',
        error: {
            code: -32000,
            message: 'Method not allowed. Use POST for Streamable HTTP JSON MCP.',
        },
        id: null,
    });
}

/**
 * Mount MCP routes on the main Express app.
 * @param {import('express').Express} app
 */
export function mountMcpRoutes(app) {
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

    app.post('/mcp', mcpAuthMiddleware, async (req, res) => {
        await handleMcpRequest(req, res);
    });
    // Avoid hanging SSE GET streams that break Botpress "Discover tools"
    app.get('/mcp', mcpMethodNotAllowed);
    app.delete('/mcp', mcpAuthMiddleware, async (req, res) => {
        const sessionId = req.headers['mcp-session-id'];
        if (sessionId && sessions.has(sessionId)) {
            const { transport, server } = sessions.get(sessionId);
            sessions.delete(sessionId);
            await transport.close().catch(() => {});
            await server.close().catch(() => {});
        }
        res.status(200).json({ jsonrpc: '2.0', result: {}, id: null });
    });
}
