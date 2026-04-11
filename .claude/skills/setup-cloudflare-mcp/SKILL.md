---
name: setup-cloudflare-mcp
description: Guide a developer through adding Cloudflare MCP servers to their local Claude Code config for D1, Workers, and R2 inspection
---

# Setup Cloudflare MCP

Guides a team member through adding Cloudflare MCP servers to their personal `.claude/settings.local.json` for inspecting production infrastructure.

## Why Local, Not Shared

Cloudflare MCP servers require per-developer API token authentication. Adding them to `.mcp.json` would prompt every team member to authenticate on every session, even when not needed. Personal setup keeps it optional.

## Available Cloudflare MCP Servers

These are the most useful for the vibesdk project:

### 1. cloudflare-workers-bindings
Inspect KV namespaces, D1 databases, R2 buckets, and Worker bindings. Useful for:
- Querying D1 production data directly
- Checking KV namespace contents (`VibecoderStore`)
- Listing R2 bucket files (`vibesdk-templates`)

### 2. cloudflare-observability
View Worker logs, errors, and performance metrics. Useful for:
- Debugging production errors without opening the dashboard
- Checking Worker invocation counts and CPU time
- Tailing live logs

## Setup Steps

### 1. Verify you have a Cloudflare API token

Check your `.dev.vars` file for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

### 2. Add to your local MCP config

Create or edit `~/.claude/.mcp.json` (personal, not project-level):

```json
{
  "mcpServers": {
    "cloudflare-workers-bindings": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/cloudflare-mcp", "workers-bindings"],
      "type": "stdio",
      "env": {
        "CLOUDFLARE_API_TOKEN": "<your-token>",
        "CLOUDFLARE_ACCOUNT_ID": "<your-account-id>"
      }
    },
    "cloudflare-observability": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/cloudflare-mcp", "observability"],
      "type": "stdio",
      "env": {
        "CLOUDFLARE_API_TOKEN": "<your-token>",
        "CLOUDFLARE_ACCOUNT_ID": "<your-account-id>"
      }
    }
  }
}
```

### 3. Restart Claude Code

MCP servers are loaded at session start. Restart to pick up the new servers.

### 4. Authenticate

On first use, the Cloudflare MCP tools will prompt for authentication. Follow the flow to connect your account.

## Expert Agents

For infrastructure-related work, delegate to:
- **sandbox-expert**: Container and deployment issues
- **database-expert**: D1 query and migration questions
