# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Setup (first-time):**
```bash
bun install          # Install dependencies
bun run setup        # Interactive first-time setup (Cloudflare, D1, env vars)
```

**Development:**
```bash
bun run dev          # Start Vite dev server (DEV_MODE=true)
bun run typecheck    # TypeScript type-check without emitting
bun run lint         # ESLint
bun run build        # tsc + vite build (produces dist/)
bun run knip         # Dead code / unused export detection
bun run knip:fix     # Auto-fix unused exports
```

**Testing (root — runs in Cloudflare Workers via vitest-pool-workers):**
```bash
bun run test                        # Run all tests once
bun run test:watch                  # Watch mode
bun run test:coverage               # Coverage report
bun run test:integration            # Run SDK integration tests (needs VIBESDK_RUN_INTEGRATION_TESTS=1)
vitest run path/to/file.test.ts     # Run a single test file
```

**SDK sub-package (run from `sdk/` directory):**
```bash
bun test test/*.test.ts                         # Unit tests
bun test --timeout 600000 test/integration/*.test.ts  # Integration tests (needs VIBESDK_INTEGRATION_API_KEY)
```

**Database:**
```bash
bun run db:generate          # Generate migrations (local)
bun run db:migrate:local     # Apply migrations locally
bun run db:migrate:remote    # Apply migrations to production D1
bun run db:studio            # Open Drizzle Studio (local)
```

**Deploy:**
```bash
bun run deploy               # Deploy via scripts/deploy.ts (reads .prod.vars)
```

## Communication Style
- Professional, concise, direct. No emojis in code, comments, reviews, or generated content.
- Substance over style; clear technical language.

## Project Overview
vibesdk is an AI-powered full-stack application generation platform built on Cloudflare infrastructure.

**Tech Stack:**
- Frontend: React 19, TypeScript, Vite, TailwindCSS, React Router v7
- Backend: Cloudflare Workers, Durable Objects, D1 (SQLite)
- AI/LLM: OpenAI, Anthropic, Google AI Studio (Gemini)
- WebSocket: PartySocket for real-time communication
- Sandbox: Custom container service with CLI tools
- Git: isomorphic-git with SQLite filesystem

**Project Structure**

**Frontend (`/src`):**
- React application with components, hooks, and route views
- Single source of truth for types: `src/api-types.ts`
- All API calls in `src/lib/api-client.ts`
- Custom hooks in `src/hooks/`
- Route components in `src/routes/`

**Backend (`/worker`):**
- Entry point: `worker/index.ts` (routes to API/agent handlers)
- Agent system: `worker/agents/`
  - Core: `CodeGeneratorAgent` in `worker/agents/core/codingAgent.ts` (extends `Agent` from "agents" package)
  - Behaviors: `worker/agents/core/behaviors/` (phasic, agentic coding strategies)
  - Objectives: `worker/agents/core/objectives/` (project objectives)
  - Operations: PhaseGeneration, PhaseImplementation, UserConversationProcessor, DeepDebugger
  - Tools: `worker/agents/tools/toolkit/` (read-files, run-analysis, regenerate-file, etc.)
  - Git: isomorphic-git with SQLite filesystem
- Database: `worker/database/` (Drizzle ORM, D1)
- Middleware: `worker/middleware/` (CSRF, websocket security)
- Services: `worker/services/` (one directory per concern -- sandbox, secrets, oauth, rate-limit, deployer, etc.)
- API: `worker/api/` (routes, controllers, handlers)

**Other:**
- `/shared` - Shared types between frontend/backend (not worker specific types that are also imported in frontend)
- `/sdk` - Client SDK (`@cf-vibesdk/sdk`), separate `package.json`, own bun-based tests
- `/migrations` - D1 database migrations
- `/container` - Sandbox container tooling
- `/scripts` - Deploy, setup, and undeploy scripts
- `/docs` - Setup guide, architecture diagrams, LLM docs, Postman collection
- `/debug-tools` - Python/TS analysis scripts (AI request analyzer, conversation analyzer, state analyzer)

## Key Architectural Patterns

**Agent Pattern:**
- Each chat session = `CodeGeneratorAgent` instance (extends `Agent` from Cloudflare's "agents" framework, NOT raw DurableObject)
- Behavior selected at init via `behaviorType` prop: `'phasic'` (default, phase-based generation) or `'agentic'` (autonomous agent-driven)
- Persistent state in SQLite (blueprint, files, history); ephemeral state in memory (abort controllers, active promises)
- Single-threaded per instance
- Separate Durable Objects for rate limiting (`DORateLimitStore`), secrets (`UserSecretsStore`), global state (`GlobalDurableObject`)

**State Machine:**
IDLE -> PHASE_GENERATING -> PHASE_IMPLEMENTING -> REVIEWING -> IDLE

**CodeGenState (Agent State):**
- Project Identity: blueprint, projectName, templateName
- File Management: generatedFilesMap (tracks all files)
- Phase Tracking: generatedPhases, currentPhase
- State Machine: currentDevState, shouldBeGenerating
- Sandbox: sandboxInstanceId, commandsHistory
- Conversation: conversationMessages, pendingUserInputs

**WebSocket Communication:**
- Real-time streaming via PartySocket
- State restoration on reconnect (agent_connected message)
- Message deduplication (tool execution causes duplicates)

**Git System:**
- `GitVersionControl` class wraps isomorphic-git; key methods: commit(), reset(), log(), show()
- SQLite filesystem adapter: `worker/agents/git/fs-adapter.ts`
- Full commit history in Durable Object storage
- Git clone protocol support (rebase on template)
- FileManager auto-syncs from git via callback registration
- Access control: user conversations get safe commands, debugger gets full access

## Common Development Tasks

**Change LLM Model for Operation:**
Edit `/worker/agents/inferutils/config.ts`. There are two configs: `DEFAULT_AGENT_CONFIG` (Gemini-only, used when `PLATFORM_MODEL_PROVIDERS` env var is unset) and `PLATFORM_AGENT_CONFIG` (multi-provider, used at build.cloudflare.dev). The exported `AGENT_CONFIG` selects between them at runtime.

**Modify Conversation Agent Behavior:**
Edit `/worker/agents/operations/UserConversationProcessor.ts` (SYSTEM_PROMPT at line ~74)

**Add New WebSocket Message:**
1. Add type to `worker/api/websocketTypes.ts`
2. Handle in `worker/agents/core/websocket.ts`
3. Handle in `src/routes/chat/utils/handle-websocket-message.ts`

**Add New LLM Tool:**
1. Create `/worker/agents/tools/toolkit/my-tool.ts`
2. Export `createMyTool(agent, logger)` function
3. Import in `/worker/agents/tools/customTools.ts`
4. Add to `buildTools()` (conversation) or `buildDebugTools()` (debugger)

**Add API Endpoint:**
1. Define types in `src/api-types.ts`
2. Add to `src/lib/api-client.ts`
3. Create service in `worker/database/services/`
4. Create controller in `worker/api/controllers/`
5. Add route in `worker/api/routes/`
6. Register in `worker/api/routes/index.ts`

## Important Context

**Deep Debugger:**
- Location: `/worker/agents/operations/DeepDebugger.ts`
- Model: configured via `deepDebugger` key in `AGENT_CONFIG` (reasoning_effort: high)
- Diagnostic priority: run_analysis → get_runtime_errors → get_logs
- Can fix multiple files in parallel (regenerate_file)
- Cannot run during code generation (checked via isCodeGenerating())

**User Secrets Store (Durable Object):**
- Location: `/worker/services/secrets/`
- Purpose: Encrypted storage for user API keys
- Architecture: One DO per user, AES-GCM encryption, SQLite backend
- Key model: VMK (Vault Master Key, derived client-side, never stored on server) + SK (Session Key, random per-session). Server holds only `AES-GCM(SK, VMK)` in DO memory.
- DB dump = useless encrypted blobs; server memory = needs client SK
- RPC Methods: Return `null`/`boolean` on error, never throw exceptions
- Tests: `worker/services/secrets/UserSecretsStore.test.ts`

**Abort Controller Pattern:**
- `getOrCreateAbortController()` reuses controller for nested operations
- Cleared after top-level operations complete
- Shared by parent and nested tool calls
- User abort cancels entire operation tree

**Message Deduplication:**
- Tool execution causes duplicate AI messages
- Backend skips redundant LLM calls (empty tool results)
- Frontend utilities deduplicate live and restored messages
- System prompt teaches LLM not to repeat

## Core Rules (Non-Negotiable)

**1. Strict Type Safety**
- NEVER use `any` type
- Frontend imports types from `@/api-types` (single source of truth)
- Search codebase for existing types before creating new ones

**2. DRY Principle**
- Search for similar functionality before implementing
- Extract reusable utilities, hooks, and components
- Never copy-paste code - refactor into shared functions

**3. Follow Existing Patterns**
- Frontend APIs: All in `/src/lib/api-client.ts`
- Backend Routes: Controllers in `worker/api/controllers/`, routes in `worker/api/routes/`
- Database Services: In `worker/database/services/`
- Types: Shared in `shared/types/`, API in `src/api-types.ts`

**4. Code Quality**
- Production-ready code only - no TODOs or placeholders
- No hacky workarounds
- Comments explain purpose, not narration
- No overly verbose AI-like comments

**5. File Naming**
- React Components: PascalCase.tsx
- Utilities/Hooks: kebab-case.ts
- Backend Services: PascalCase.ts

## Debugging and Security Hotspots

When debugging, check these subsystem-specific failure modes first:
- **Durable Objects / State:** state machine transitions in `worker/agents/core/codingAgent.ts`; abort controller cleanup; `CodeGenState` field consistency
- **WebSocket:** all three layers must stay in sync -- `worker/api/websocketTypes.ts`, `worker/agents/core/websocket.ts`, `src/routes/chat/utils/handle-websocket-message.ts`; verify message deduplication; test reconnect state restoration
- **Inference / LLM:** model config in `worker/agents/inferutils/config.ts`; tool execution loop; loop detection triggers
- **Database:** migration state (`bun run db:check`); service query logic; Drizzle schema types
- **Sandbox:** container lifecycle; Cloudflare tunnel status; WARP interference

When reviewing or editing, these paths require extra scrutiny:
- `worker/services/secrets/` -- vault crypto (Argon2id/AES-GCM); RPC methods must return `null`/`boolean` on error, never throw
- `worker/middleware/` -- CSRF, WebSocket security
- `worker/utils/authUtils.ts` -- authentication, JWT signing
- Any file handling user input or external data (injection, authz checks)

## Environment

Local dev requires a `.dev.vars` file (copy from `.dev.vars.example`). Key variables:
```
CLOUDFLARE_API_TOKEN   # Cloudflare API access
CLOUDFLARE_ACCOUNT_ID  # Your Cloudflare account
JWT_SECRET             # Auth token signing
WEBHOOK_SECRET         # Webhook verification
```
Cloudflare resources needed: KV namespace (`VibecoderStore`), D1 database (`vibesdk-db`), R2 bucket (`vibesdk-templates`). IDs go in `wrangler.jsonc`. Full walkthrough: `docs/setup.md`.

## Gotchas

- **Vite env vars in Workers:** Vite env variables (`import.meta.env.*`) are NOT available in Worker code. Use `env` from the Worker bindings instead.
- **Cloudflare WARP:** WARP (full mode) breaks anonymous Cloudflared tunnels used for local dev previews. Disable WARP or switch to DNS-only (1.1.1.1) mode while developing locally.
- **First-time setup:** See `docs/setup.md` for the full setup guide including Cloudflare API token, D1 database, and env var configuration.
