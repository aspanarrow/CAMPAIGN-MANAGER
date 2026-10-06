# Glowify MCP Server

Shopify Marketing AI campaign manager ko MCP (Model Context Protocol) ke through connect karo — Claude Desktop, Cursor, ya kisi bhi MCP client se.

## Setup

```bash
cd scripts/mcp
pnpm install   # ya npm install
```

## Configuration

Backend `.env` file auto-read hoti hai (`backend/.env`). Custom backend URL chahiye to env var set karo:

| Env Var | Default | Description |
|---------|---------|-------------|
| `MCP_BACKEND_URL` | `http://localhost:5001` | Backend API URL |
| `MCP_API_KEY` | `.env` se auto | API key (auto-read from backend/.env) |
| `MCP_HTTP_TOKEN` | (none) | Optional bearer token for HTTP mode |

## Mode 1: Stdio (Claude Desktop / Cursor)

```bash
node scripts/mcp/server.mjs --stdio
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "glowify": {
      "command": "node",
      "args": ["/absolute/path/to/scripts/mcp/server.mjs", "--stdio"],
      "env": {
        "MCP_BACKEND_URL": "http://localhost:5001",
        "MCP_API_KEY": "your-api-key"
      }
    }
  }
}
```

Location: `~/Library/Application Support/Claude/claude_desktop_config.json`

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "glowify": {
      "command": "node",
      "args": ["/absolute/path/to/scripts/mcp/server.mjs", "--stdio"],
      "env": {
        "MCP_BACKEND_URL": "http://localhost:5001",
        "MCP_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Mode 2: HTTP (Remote clients)

```bash
node scripts/mcp/server.mjs
# → http://localhost:3910/mcp
```

HTTP mode mein optional bearer token lagao:

```bash
MCP_HTTP_TOKEN=your-secret node scripts/mcp/server.mjs
```

Client se connect karte waqt header lagao:
```
Authorization: Bearer your-secret
```

### Streamable HTTP endpoint

```
POST http://localhost:3910/mcp
Content-Type: application/json
Accept: application/json, text/event-stream
```

## Tools (26 total)

| Tool | Description |
|------|-------------|
| `health` | Backend health check |
| `list_campaigns` | Campaigns list karo (filter: platform, status) |
| `get_campaign` | Campaign details |
| `create_campaign` | Naya campaign banao |
| `deploy_campaign` | Campaign Meta pe deploy karo |
| `sync_campaign_metrics` | Meta se metrics sync karo |
| `update_campaign` | Campaign update karo (budget, status) |
| `list_products` | Shopify products list karo |
| `list_approvals` | Pending approvals |
| `approve_request` | Approval accept karo |
| `reject_request` | Approval reject karo |
| `profit_summary` | India unit economics summary |
| `profit_orders` | Order-level profit drill-down |
| `profit_campaigns` | Campaign-wise contribution |
| `set_order_outcome` | Manual order outcome set karo |
| `sync_profit_orders` | Shopify orders sync karo |
| `get_cost_assumptions` | Cost assumptions read karo |
| `update_cost_assumption` | Cost assumption update karo |
| `list_automation_rules` | Rules list |
| `create_automation_rule` | Naya rule banao |
| `evaluate_rules_now` | Rules abhi evaluate karo |
| `toggle_automation_rule` | Rule enable/disable |
| `delete_automation_rule` | Rule delete |
| `get_audit_log` | Audit trail |
| `get_analytics` | Campaign analytics |
| `optimize_campaign` | AI se optimization suggestion |

## Security Notes

- **Local only**: HTTP mode mein localhost pe bind hota hai
- **Token**: Production mein `MCP_HTTP_TOKEN` zaroor set karo
- **API Key**: `.env` file se auto-read hoti hai — koi bhi `.env` commit mat karo
- **Network**: Agar LAN se connect karna hai to firewall check karo

## Testing

```bash
# Health check
curl -s http://localhost:3910/health

# Initialize
curl -s -X POST http://localhost:3910/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# List tools
curl -s -X POST http://localhost:3910/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call a tool
curl -s -X POST http://localhost:3910/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"health","arguments":{}}}'
```
