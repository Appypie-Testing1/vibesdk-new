# AGENTS.md

## Build/Test/Lint Commands
- **Build:** `npm run build` (tsc + vite)
- **Typecheck:** `npm run typecheck`
- **Lint:** `npm run lint`
- **Test all:** `npm run test`
- **Test single file:** `npx vitest run path/to/file.test.ts`
- **Test watch:** `npm run test:watch`
- **Dev servers:** `npm run dev` (frontend), `npm run dev:worker` (backend)

## Code Style
- **No `any` type** - find or create proper types
- **Types:** Frontend imports from `@/api-types` (single source of truth)
- **Formatting:** Prettier with single quotes, tabs (see package.json)
- **Naming:** React components `PascalCase.tsx`, utilities/hooks `kebab-case.ts`, backend services `PascalCase.ts`
- **Comments:** Explain purpose, not narration. No verbose AI-like comments. No emojis.
- **DRY:** Search for existing code before creating new. Never copy-paste.
- **Imports:** Frontend APIs in `src/lib/api-client.ts`, types in `src/api-types.ts`

## Error Handling
- Backend services return `null`/`boolean` on error, never throw in RPC methods
- Use existing error classes from `worker/utils/ErrorHandling.ts`

## Key Patterns
- **Add API endpoint:** types in `src/api-types.ts` -> `src/lib/api-client.ts` -> service in `worker/database/services/` -> controller in `worker/api/controllers/` -> route in `worker/api/routes/`
- **Add LLM tool:** create in `worker/agents/tools/toolkit/` -> register in `worker/agents/tools/customTools.ts`

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
