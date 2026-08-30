# Brandly MCP Server (Botpress)

Brandly exposes a **Streamable HTTP** MCP endpoint so Botpress (and other MCP clients) can call read tools against your live data.

## Endpoint

| Item | Value |
|------|--------|
| URL | `https://<your-host>/mcp` |
| Transport | **HTTP** (Streamable HTTP / JSON responses) |
| Auth | `X-API-KEY: brnd_live_…` **or** `Authorization: Bearer brnd_live_…` |
| Health (no auth) | `GET /mcp/health` |

Local example: `http://localhost:8000/mcp`  
Botpress Cloud **cannot** reach localhost — use **ngrok** or your **Render** URL.

## Tools (MVP read-only)

| Tool | Required API key scope |
|------|------------------------|
| `search_influencers` | `influencers:read` |
| `get_influencer` | `influencers:read` |
| `list_campaigns` | `campaigns:read` |
| `get_campaign` | `campaigns:read` |
| `list_brands` | `brands:read` |
| `get_brand` | `brands:read` |
| `ai_match_for_campaign` | `aimatch:read` |
| `ai_match_for_influencer` | `aimatch:read` |

Default scopes when creating a key via `POST /api/v1/auth/api-keys` already include these four read scopes.

## 1. Create an API key

1. Log into Brandly as the brand/user that should own the agent.
2. Call (with JWT cookie or Bearer):

```bash
curl -X POST "https://<your-host>/api/v1/auth/api-keys" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Botpress Agent"}'
```

3. Save the returned `apiKey` (`brnd_live_…`) once — it is not shown again.

## 2. Expose a public URL

**Option A — already on Render**

Use: `https://brandy-backend.onrender.com/mcp` (or your custom domain).

**Option B — local + ngrok**

```bash
# terminal 1
cd brandy-backend && npm run dev

# terminal 2
ngrok http 8000
```

Use the ngrok HTTPS URL + `/mcp`, e.g. `https://abc123.ngrok-free.app/mcp`.

## 3. Connect in Botpress

1. Open **Build → Tools → MCP**.
2. Choose **Custom MCP server**.
3. Fill in:

| Field | Value |
|-------|--------|
| Name | `Brandly` |
| Transport | **HTTP** |
| URL | `https://<your-host>/mcp` |
| Authentication | API key / Bearer / custom header mapped to `X-API-KEY` or `Authorization: Bearer <key>` (do **not** paste the key into Instructions) |
| Enabled | On |

4. Click **Test connection** — you should see the eight tools listed.
5. Enable the tools you want the agent to use.
6. In **Instructions** (or a Playbook), tell the agent when to call them, for example:

> When the user asks to find influencers, campaigns, or brands on Brandly, use the Brandly MCP tools (`search_influencers`, `list_campaigns`, `ai_match_for_campaign`, etc.). Prefer tools over guessing.

## 4. Smoke test

In Botpress Preview, try:

- “Find beauty influencers on Instagram under $500”
- “List active campaigns”
- “Match influencers for campaign `<campaignId>`”

Confirm the Preview shows a tool call and a JSON result (not only a prose guess).

## Quick local curl check

```bash
# Health (no auth)
curl -s http://localhost:8000/mcp/health

# Initialize (requires API key) — Streamable HTTP JSON-RPC
curl -s http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-KEY: brnd_live_YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.1"}}}'
```

## Notes

- Keep the API key **only** in the MCP connection config — never in chat Instructions.
- Prefer a long-running Node host (Render) over serverless for `/mcp`.
- Write tools (apply, collaboration, payments) are intentionally out of this MVP.
