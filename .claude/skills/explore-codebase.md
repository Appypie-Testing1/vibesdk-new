---
name: explore-codebase
description: Navigate and understand codebase structure using the knowledge graph and project architecture knowledge
---

## Explore Codebase

Use the code-review-graph MCP tools and project context to explore and understand the codebase.

### Steps

1. Run `get_minimal_context(task="<your task>")` for a targeted starting point.
2. Run `list_graph_stats` to see overall codebase metrics.
3. Run `get_architecture_overview` for high-level community structure.
4. Use `list_communities` to find major modules, then `get_community` for details.
5. Use `semantic_search_nodes` to find specific functions or classes.
6. Use `query_graph` with patterns like `callers_of`, `callees_of`, `imports_of` to trace relationships.
7. Use `list_flows` and `get_flow` to understand execution paths.

### Project Architecture Quick Reference

**Frontend (`/src`):** React 19 + TypeScript + Vite + TailwindCSS. Types in `src/api-types.ts`. API calls in `src/lib/api-client.ts`. Hooks in `src/hooks/`. Routes in `src/routes/`.

**Backend (`/worker`):** Cloudflare Workers + Durable Objects. Entry: `worker/index.ts`. Agent core: `worker/agents/core/`. Tools: `worker/agents/tools/toolkit/`. Database: `worker/database/`. Services: `worker/services/`. API: `worker/api/`.

**Key Subsystems:**
- Agent/DO core: `worker/agents/core/codingAgent.ts` + behaviors + objectives
- WebSocket: `worker/api/websocketTypes.ts` + `worker/agents/core/websocket.ts` + `src/routes/chat/utils/handle-websocket-message.ts`
- Inference: `worker/agents/inferutils/config.ts` + `worker/agents/operations/`
- Database: `worker/database/schema.ts` + `worker/database/services/`
- Sandbox: `worker/services/sandbox/`
- Security: `worker/services/secrets/` + `worker/middleware/`

### Fallback

If graph tools do not cover the area, fall back to `Glob` for file discovery and `Grep` for content search.

### Token Efficiency Rules
- ALWAYS start with `get_minimal_context(task="<your task>")` before any other graph tool.
- Use `detail_level="minimal"` on all calls. Only escalate to "standard" when minimal is insufficient.
- Target: complete any exploration task in <=5 tool calls.
