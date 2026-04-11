---
name: debug-issue
description: Systematically debug issues using graph-powered code navigation and project-specific subsystem knowledge
---

## Debug Issue

Use the knowledge graph and project context to systematically trace and debug issues.

### Steps

1. Use `get_minimal_context(task="<your task>")` to get a starting point.
2. Use `semantic_search_nodes` to find code related to the issue.
3. Use `query_graph` with `callers_of` and `callees_of` to trace call chains.
4. Use `get_flow` to see full execution paths through suspected areas.
5. Run `detect_changes` to check if recent changes caused the issue.
6. Use `get_impact_radius` on suspected files to see what else is affected.

### Subsystem-Specific Debugging

When the issue is in a specific subsystem, focus on these areas:

- **Durable Objects / State**: Check state machine transitions in `worker/agents/core/codingAgent.ts`. Verify abort controller cleanup. Check `CodeGenState` field consistency.
- **WebSocket**: Check all three files (types, backend handler, frontend handler). Verify message deduplication. Test reconnect state restoration.
- **Inference / LLM**: Check model config in `worker/agents/inferutils/config.ts`. Verify tool execution loop. Check for loop detection triggers.
- **Database**: Check migration state (`bun run db:check`). Verify service query logic. Check Drizzle schema types.
- **Sandbox**: Check container lifecycle. Verify Cloudflare tunnel status. Check WARP interference.

### Fallback

If graph tools do not cover the area, fall back to:
- `Grep` for searching code patterns and error messages
- `Read` for examining specific files
- `Bash` for running tests (`bun run test`) or type checks (`bun run typecheck`)

### Token Efficiency Rules
- ALWAYS start with `get_minimal_context(task="<your task>")` before any other graph tool.
- Use `detail_level="minimal"` on all calls. Only escalate to "standard" when minimal is insufficient.
- Target: complete any debug task in <=8 tool calls.
