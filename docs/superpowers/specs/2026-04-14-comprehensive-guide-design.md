# vibesdk Comprehensive Guide -- Design Spec

**Date:** 2026-04-14
**Output file:** `docs/comprehensive-guide.md`
**Approach:** Single document with progressive depth (Approach C)
**Audience:** Both self-hosters and contributors, progressing from newcomer to expert

---

## Goal

Create a single authoritative document that takes a reader from "what is this project?" to "I can confidently modify, deploy, and debug vibesdk." The document uses progressive disclosure: early sections are accessible to anyone, later sections assume growing familiarity.

## Constraints

- Single markdown file, estimated 2000-2500 lines
- No mermaid diagram source code inline (reference `docs/architecture-diagrams.md` for visuals)
- No line-by-line code walkthroughs; give file paths and function names so readers jump to source
- Document only what exists today, no speculative features
- No duplication of `docs/setup.md` content verbatim; cover the same ground with more context and depth, reference setup.md as the quick-start alternative
- Text-based tables and code blocks for readability on GitHub and local editors

## Relationship to Existing Docs

| Existing Doc | Status | Relationship |
|---|---|---|
| `docs/setup.md` | Kept | Section 2 covers same ground with more depth; references setup.md as quick-start |
| `docs/architecture-diagrams.md` | Kept | Section 1 references it for mermaid diagrams |
| `docs/llm.md` | Kept | Sections 4-5 cover same topics from human-readable angle; llm.md remains as LLM-agent-focused reference |
| `CLAUDE.md` (root) | Kept | AI coding assistant instructions, separate purpose |

## Document Structure

### Section 1: Introduction and Project Overview

**Purpose:** Orient a complete newcomer.

**Contents:**
- One-paragraph description of what vibesdk is: an AI-powered full-stack application generation platform built on Cloudflare infrastructure. Users describe an app in natural language; the platform generates code, previews it in a sandbox, and deploys it to Cloudflare Workers.
- Tech stack summary table:

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, TailwindCSS, React Router v7, Radix UI |
| Backend | Cloudflare Workers, Hono framework, Durable Objects |
| Database | Cloudflare D1 (SQLite), Drizzle ORM |
| AI/LLM | OpenAI, Anthropic, Google AI Studio (Gemini), Cerebras, OpenRouter -- routed via Cloudflare AI Gateway |
| Real-time | WebSocket via PartySocket |
| Sandbox | Cloudflare Containers (production), Docker (local dev) |
| Storage | Cloudflare KV (sessions/cache), R2 (templates/assets) |
| Git | isomorphic-git with SQLite filesystem adapter |
| SDK | `@cf-vibesdk/sdk` -- standalone client library |

- High-level architecture description (text), with pointer to `docs/architecture-diagrams.md` for mermaid visuals
- Project structure tree with one-line description for every top-level directory:
  - `/src` -- React frontend application
  - `/worker` -- Cloudflare Workers backend (entry point, agents, API, database, services, middleware)
  - `/shared` -- Shared types between frontend and backend
  - `/sdk` -- Client SDK package (`@cf-vibesdk/sdk`)
  - `/migrations` -- D1 database migrations
  - `/container` -- Sandbox container tooling (CLI tools, process monitor)
  - `/scripts` -- Deploy, setup, and undeploy scripts
  - `/docs` -- Documentation, architecture diagrams, Postman collection
  - `/debug-tools` -- Python/TS analysis scripts

- Deeper breakdown of `/worker` subdirectories:
  - `worker/agents/core/` -- CodeGeneratorAgent, behaviors, state machine, WebSocket handler
  - `worker/agents/operations/` -- PhaseGeneration, PhaseImplementation, UserConversationProcessor, DeepDebugger, FileRegeneration, PostPhaseCodeFixer
  - `worker/agents/planning/` -- Blueprint generation, template selection
  - `worker/agents/tools/toolkit/` -- LLM tools (read-files, run-analysis, regenerate-file, git, web-search, etc.)
  - `worker/agents/inferutils/` -- Inference pipeline, model config, tool execution, loop detection
  - `worker/agents/output-formats/` -- SCOF streaming format parser
  - `worker/agents/git/` -- isomorphic-git wrapper, SQLite filesystem adapter
  - `worker/agents/services/` -- FileManager, DeploymentManager
  - `worker/agents/utils/` -- Template customizer, prompt utilities
  - `worker/api/routes/` -- HTTP route definitions (auth, apps, user, stats, codegen, model config, etc.)
  - `worker/api/controllers/` -- Request handlers per domain
  - `worker/database/` -- Drizzle ORM schema, service layer
  - `worker/services/` -- One directory per concern (sandbox, secrets, oauth, rate-limit, deployer, etc.)
  - `worker/middleware/` -- CSRF, WebSocket security, auth

---

### Section 2: Prerequisites and Local Setup

**Purpose:** Get vibesdk running locally.

**Contents:**

**2.1 Required Software:**
- Node.js 18+
- Bun (recommended, used by all project scripts)
- Docker (for local sandbox containers)
- Git

**2.2 Cloudflare Account:**
- Free tier limitations: KV namespace quota (10), D1/R2 may require paid plan
- Paid plan features: Workers for Platforms (app deployment), Advanced Certificate Manager (first-level subdomains)

**2.3 API Token Creation:**
- Step-by-step: Cloudflare dashboard -> My Profile -> API Tokens -> Create Token
- Use "Edit Cloudflare Workers" template as base, then add missing permissions
- Exact permissions list:
  - Account: Workers KV Storage:Edit, Workers Scripts:Edit, Account Settings:Read, Workers Tail:Read, Workers R2 Storage:Edit, Cloudflare Pages:Edit, Workers Builds Configuration:Edit, Workers Agents Configuration:Edit, Workers Observability:Edit, Containers:Edit, D1:Edit, AI Gateway:Read/Edit/Run, Cloudchamber:Edit, Browser Rendering:Edit
  - All zones: Workers Routes:Edit
  - All users: User Details:Read, Memberships:Read

**2.4 Automated Setup (Recommended):**
- Commands: `bun install && bun run setup`
- Walkthrough of each interactive prompt:
  - Cloudflare credentials (Account ID, API Token)
  - Domain configuration (custom domain or localhost-only)
  - Remote vs local-only setup
  - AI Gateway configuration (Cloudflare AI Gateway recommended vs custom URL)
  - AI provider selection (multi-select: OpenAI, Anthropic, Google AI Studio, Cerebras, OpenRouter, Custom)
  - OAuth credentials (Google, GitHub -- optional)
  - Resource creation (KV, D1, R2, AI Gateway)
  - Database migration
  - Template deployment

**2.5 Manual Setup (Alternative):**
- Copy `.dev.vars.example` to `.dev.vars`
- Every env var documented:
  - `CLOUDFLARE_API_TOKEN` -- Cloudflare API access (required)
  - `CLOUDFLARE_ACCOUNT_ID` -- your Cloudflare account (required)
  - `CLOUDFLARE_AI_GATEWAY_TOKEN` -- AI Gateway auth (auto-set if using AI Gateway)
  - `CLOUDFLARE_AI_GATEWAY_URL` -- AI Gateway endpoint URL
  - `JWT_SECRET` -- signing key for auth tokens (required, generate random)
  - `WEBHOOK_SECRET` -- webhook verification (required, generate random)
  - `CUSTOM_DOMAIN` -- your domain if deploying
  - `ENVIRONMENT` -- "prod" for production
  - `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_STUDIO_API_KEY` -- LLM provider keys
  - `OPENROUTER_API_KEY`, `GROQ_API_KEY` -- additional providers (default: "default" to disable)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` -- Google OAuth (optional)
  - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` -- GitHub OAuth (optional)
  - `GITHUB_EXPORTER_CLIENT_ID`, `GITHUB_EXPORTER_CLIENT_SECRET` -- GitHub export OAuth (separate from login)
- Creating Cloudflare resources via wrangler CLI:
  - `npx wrangler kv namespace create VibecoderStore`
  - `npx wrangler d1 create vibesdk-db`
  - `npx wrangler r2 bucket create vibesdk-templates`
- Updating `wrangler.jsonc` with returned resource IDs

**2.6 Database Setup:**
- `bun run db:generate` -- generate migration files from schema
- `bun run db:migrate:local` -- apply migrations to local D1
- `bun run db:studio` -- open Drizzle Studio for visual inspection

**2.7 Starting Development:**
- `bun run dev` -- starts Vite dev server at `localhost:5173`
- First-time: register an account (email/password if no OAuth configured)

**2.8 AI Provider Configuration:**
- Google AI Studio (Gemini): works out of the box, default config, free API key from aistudio.google.com
- Other providers: must edit `worker/agents/inferutils/config.ts`, change models from Gemini to `provider/model-name` format
- `PLATFORM_AGENT_CONFIG` (multi-provider, used at build.cloudflare.dev) vs `DEFAULT_AGENT_CONFIG` (Gemini-only fallback)

**2.9 Troubleshooting:**
- WARP conflicts with cloudflared tunnels -- disable WARP or use DNS-only (1.1.1.1) mode
- D1 "Unauthorized" -- API token permissions or paid plan needed
- R2 "Unauthorized" -- same as D1
- AI Gateway creation failed -- check AI Gateway permissions on token
- Docker not running -- sandbox instances won't start
- Corporate network SSL issues -- custom CA certificate instructions for SandboxDockerfile

---

### Section 3: Templates System

**Purpose:** Explain the foundation that generated apps build upon.

**Contents:**

**3.1 What Templates Are:**
- Pre-built project scaffolds stored in R2 that the AI builds upon rather than generating from scratch
- Each template is a complete, working project with specific framework/stack choices
- Templates repo: `https://github.com/cloudflare/vibesdk-templates`

**3.2 Project Types:**
| Type | Use Case | Behavior | Sandbox |
|---|---|---|---|
| `app` | Full-stack web apps, mobile apps | Phasic (deterministic phases) | Yes |
| `workflow` | Backend APIs, cron jobs, webhooks | Agentic (autonomous LLM loop) | Yes |
| `presentation` | Slide decks, pitch decks | Agentic | Yes |
| `general` | Docs, notes, specs in Markdown/MDX | Agentic | No |

**3.3 Template Data Structure:**
- `TemplateInfo` (metadata stored in catalog):
  - `name`: string identifier
  - `language`: optional ("TypeScript", "JavaScript")
  - `frameworks`: string array
  - `projectType`: enum (app, workflow, presentation, general)
  - `description`: object with `selection` (for AI matching) and `usage` (how to use it)
  - `renderMode`: optional enum (sandbox, browser, mobile, mobile-fullstack)
  - `slideDirectory`: optional path for presentation templates
  - `disabled`: boolean flag
  - `initCommand`: optional initialization command
- `TemplateDetails` (full template with files):
  - Extends `TemplateInfo`
  - `fileTree`: FileTreeNode hierarchy
  - `allFiles`: Record<string, string> -- file path to content map
  - `deps`: Record<string, string> -- package.json dependencies
  - `importantFiles`: string[] -- files the agent should focus on
  - `dontTouchFiles`: string[] -- files the agent should not modify
  - `redactedFiles`: string[] -- sensitive files filtered from AI context

**3.4 Template Storage:**
- R2 bucket: `vibesdk-templates` (production), `vibesdk-templates-staging` (staging)
- Catalog: `template_catalog.json` in R2 bucket root
- Individual templates: `.zip` files containing all template files and metadata

**3.5 Template Selection Flow:**
1. User prompt arrives at agent
2. `predictProjectType(query)` classifies into app/workflow/presentation/general using LLM
3. `selectTemplate(query, templates, projectType)`:
   - Filters out disabled templates and "minimal" templates
   - Filters by project type (unless general)
   - Auto-selects single template for workflow/presentation if only one match
   - Uses AI inference against remaining candidates
4. Returns `TemplateSelection`:
   - `selectedTemplateName`: chosen template
   - `reasoning`: why it was selected
   - `useCase`: enum (SaaS Product Website, Dashboard, Blog, Portfolio, E-Commerce, General, Other)
   - `complexity`: enum (simple, moderate, complex)
   - `styleSelection`: enum (Minimalist Design, Brutalism, Retro, Illustrative, Kid_Playful, Custom)
   - `projectType`: detected type

**3.6 Template Import and Customization:**
- `importTemplate(templateName)` loads template files into agent state
- `customizeTemplateFiles()` orchestrator:
  - Updates `package.json` with project name and prepare script
  - Updates `wrangler.jsonc` with project name (preserves JSONC comments)
  - Generates `.bootstrap.js` self-deleting setup script
  - Updates `.gitignore`

**3.7 Template Placeholder System:**
- Templates contain placeholders in `wrangler.jsonc`: `{{KV_ID}}`, `{{D1_ID}}`
- `TemplateParser` class detects, extracts binding names, replaces with real resource IDs during deployment
- Validates all placeholders were replaced before proceeding

**3.8 Deploying Templates to R2:**
- During `bun run deploy`: clones `https://github.com/cloudflare/vibesdk-templates`
- Finds R2 bucket binding `TEMPLATES_BUCKET`
- Executes `deploy_templates.sh` from templates repo root
- Uploads all templates as zipped bundles with catalog

---

### Section 4: Complete App Generation Flow

**Purpose:** Trace the full journey from user prompt to deployed app.

**Contents:**

**4.1 Session Initialization:**
- Frontend POST `/api/agent` with `CodeGenArgs` (query, language, frameworks, images, behaviorType, projectType)
- `CodingAgentController.startCodeGeneration()` creates agent ID via `generateId()`
- Returns streaming response (SSE) with WebSocket URL
- Client connects via WebSocket to `/api/agent/{agentId}/ws`
- Behavior type resolved: phasic (app default), agentic (presentation/workflow/general)
- Key files: `worker/api/controllers/agent/controller.ts`, `worker/api/routes/codegenRoutes.ts`

**4.2 Blueprint Generation:**
- Template selected (see Section 3)
- `generateBlueprint(query, templateDetails, inferenceContext)` calls LLM with specialized system prompt
- Phasic blueprint schema: title, projectName, description, views, userFlow, dataFlow, architecture, frameworks, pitfalls, implementationRoadmap (phases), initialPhase
- Streamed back to client chunk by chunk via `onBlueprintChunk()` callback
- Key file: `worker/agents/planning/blueprint.ts`

**4.3 State Machine (Phasic Behavior):**
- States and transitions:
  ```
  IDLE -> PHASE_GENERATING -> PHASE_IMPLEMENTING -> REVIEWING -> FINALIZING -> IDLE
  ```
- `CodeGenState` key fields: blueprint, generatedFilesMap, generatedPhases, currentPhase, phasesCounter (max 10), currentDevState, shouldBeGenerating, sandboxInstanceId, conversationMessages
- Single-threaded per Durable Object instance
- Key files: `worker/agents/core/state.ts`, `worker/agents/core/codingAgent.ts`, `worker/agents/core/behaviors/phasic.ts`

**4.4 Phase Generation:**
- `PhaseGenerationOperation.execute()` analyzes current codebase state
- Identifies what's implemented vs what remains from the blueprint roadmap
- Designs next deployable milestone (visual excellence, UX, accessibility focus)
- Output: phase name, description, file list with purposes, install commands, `lastPhase` boolean
- Key file: `worker/agents/operations/PhaseGeneration.ts`

**4.5 Phase Implementation (File Generation):**
- `PhaseImplementationOperation.execute()` with streaming inference
- SCOF (Structured Code Output Format): `FILE {filePath}\n{content}\nEOF`
  - Robust streaming parser handles arbitrary chunk boundaries
  - Callbacks: `onFileOpen()`, `onFileChunk()`, `onFileClose()`
- Files streamed to client via WebSocket: `file_generating`, `file_chunk_generated`, `file_generated`
- RealtimeCodeFixer runs inline if enabled
- Key files: `worker/agents/operations/PhaseImplementation.ts`, `worker/agents/output-formats/streaming-formats/scof.ts`

**4.6 Code Review and Fixing:**
- `FastCodeFixerOperation` runs post-phase review (up to 5 iterations)
- `RealtimeCodeFixer` applies search-replace diffs for:
  - Infinite render loops (useEffect without deps, setState in render)
  - Import/export integrity errors
  - Undefined variable access
  - Syntax errors and JSX mismatches
  - Tailwind class errors
  - Nested Router components
- Static analysis via sandbox (ESLint, TypeScript errors)
- Key files: `worker/agents/operations/PostPhaseCodeFixer.ts`, `worker/agents/assistants/realtimeCodeFixer.ts`

**4.7 Sandbox Deployment:**
- Files deployed to sandbox container
  - Local: Docker containers via LocalSandboxService
  - Production: Cloudflare Containers via RemoteSandboxService
- Execution sequence: write files -> run commands (npm install, build) -> return preview URL
- Runtime errors and logs fetched for next review cycle
- Key files: `worker/services/sandbox/BaseSandboxService.ts`, `worker/services/sandbox/sandboxSdkClient.ts`

**4.8 User Conversation and Iteration:**
- `UserConversationProcessor` handles follow-up messages after initial generation
- Available tools: `queue_request`, `get_logs`, `deep_debug`, `git`, `deploy_preview`, `web_search`
- User feedback can trigger new phase generation or targeted file regeneration
- Speaks as the developer ("I'll fix that") -- conversational interface
- Key file: `worker/agents/operations/UserConversationProcessor.ts`

**4.9 Deep Debugger:**
- Triggered for persistent runtime errors that regular fixing can't resolve
- Autonomous debugging agent with full tool access: read_file, get_logs, get_runtime_errors, get_file_list, write_file, wait, deploy_preview
- Operates with high reasoning effort model config
- Cannot run during active code generation (checked via `isCodeGenerating()`)
- Returns transcript of all diagnostic steps taken
- Key file: `worker/agents/operations/DeepDebugger.ts`

**4.10 Agentic Behavior (Alternative Flow):**
- Used for presentation, workflow, general project types
- Autonomous LLM loop with a plan string instead of deterministic state machine
- LLM decides what to do next at each step (no predefined phase transitions)
- Same underlying operations available but orchestrated by the LLM
- Key file: `worker/agents/core/behaviors/agentic.ts`

---

### Section 5: Backend Architecture Deep Dive

**Purpose:** Enable backend development, API changes, and debugging.

**Contents:**

**5.1 Worker Entry Point and Routing:**
- `worker/index.ts` -- main entry, routes requests to API handlers or agent WebSocket handlers
- Hono framework for HTTP routing
- Route registration: routes in `worker/api/routes/`, controllers in `worker/api/controllers/`
- Each controller extends base patterns for consistent error handling

**5.2 Durable Objects:**
| Durable Object | Class | Purpose |
|---|---|---|
| `CodeGeneratorAgent` | `CodeGenObject` | One per chat session, holds all generation state, runs state machine |
| `UserAppSandboxService` | `Sandbox` | Sandbox container lifecycle management |
| `DORateLimitStore` | `DORateLimitStore` | Per-user sliding window rate limiting |
| `UserSecretsStore` | `UserSecretsStore` | Encrypted secret vault per user |
| `GlobalDurableObject` | `GlobalDurableObject` | Global platform state |

- Note: `CodeGeneratorAgent` extends `Agent` from Cloudflare's "agents" framework, NOT raw DurableObject
- Single-threaded per instance, persistent state in SQLite, ephemeral state in memory

**5.3 Inference Pipeline:**
- Call flow: `executeInference()` -> `infer()` -> OpenAI-compatible client -> tool execution loop -> loop detection
- AI Gateway URL construction: `https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayName}/{provider}`
- Model config: `worker/agents/inferutils/config.ts`
  - `PLATFORM_AGENT_CONFIG`: multi-provider, used when `PLATFORM_MODEL_PROVIDERS` env var is set (production at build.cloudflare.dev)
  - `DEFAULT_AGENT_CONFIG`: Gemini-only fallback for self-hosted instances
  - Exported `AGENT_CONFIG` selects between them at runtime
- Per-operation config keys: `blueprint`, `phaseGeneration`, `phaseImplementation`, `codeReview`, `codeFixer`, `deepDebugger`, `userConversation`, `templateSelection`, etc.
- User model overrides: stored in `userModelConfigs` DB table, applied at inference time
- Loop detection: `worker/agents/inferutils/loopDetection.ts` catches repeated tool calls or circular patterns

**5.4 Tool System:**
- Factory pattern: each tool exports `createToolName(agent, logger)` function
- Two tool sets:
  - `buildTools()` -- conversation tools (safe subset)
  - `buildDebugTools()` -- debugger tools (full access including file writes)
- Tool listing with descriptions (from `worker/agents/tools/toolkit/`):
  - `read-files` -- read file contents from generated project
  - `run-analysis` -- static analysis of generated code
  - `regenerate-file` -- regenerate a specific file
  - `init-suitable-template` -- select and import a template
  - `git` -- version control (parameterized: safe for users, full for debugger)
  - `web-search` -- search the web for solutions
  - `get-logs` -- fetch sandbox runtime logs
  - `get-runtime-errors` -- fetch sandbox error reports
  - `deploy-preview` -- redeploy sandbox for testing
  - `queue-request` -- relay user modification requests
  - `deep-debug` -- trigger deep debugger
  - `wait` -- wait for sandbox state changes
  - (and others as they exist in toolkit/)
- Resource-based parallel execution for independent tool calls

**5.5 Database Layer:**
- ORM: Drizzle with Cloudflare D1 (SQLite)
- Schema: `worker/database/schema.ts`
- Tables summary:
  - **User/Auth**: users, sessions, apiKeys, oauthStates, authAttempts, passwordResetTokens, emailVerificationTokens, verificationOtps
  - **Apps**: apps, favorites, stars
  - **Community**: appLikes, appComments, commentLikes
  - **Analytics**: appViews
  - **Configuration**: userModelConfigs, userModelProviders, systemSettings
  - **Security**: auditLogs
- Service layer: `worker/database/services/` -- one service class per domain (UserService, AppService, AuthService, etc.)
- Migration workflow: `db:generate` -> `db:migrate:local` -> verify with `db:studio` -> `db:migrate:remote`

**5.6 API Endpoints Reference:**
- Complete table of all endpoints grouped by domain
- Columns: Method, Path, Auth Level, Description
- Domains: Auth, Apps, User, Stats, Analytics, Agent/CodeGen, Model Config, Model Providers, Vault/Secrets, GitHub Export, Status/Capabilities, Health

**5.7 Authentication and Security:**
- JWT access tokens + httpOnly refresh cookies
- OAuth flow: initiate -> redirect to provider -> callback -> create/update user -> set cookies
- Email/password with OTP email verification
- CSRF token protection (7200s expiry, auto-refresh on 403)
- Rate limiting: API_RATE_LIMITER (10000 requests/60s), AUTH_RATE_LIMITER (1000 requests/60s)
- Vault crypto: Argon2id key derivation (client-side), AES-GCM encryption
  - VMK (Vault Master Key): derived client-side from master password, never sent to server
  - SK (Session Key): random per-session
  - Server holds only `AES-GCM(SK, VMK)` in DO memory
  - DB dump = useless encrypted blobs
- Auth middleware levels: `public`, `authenticated`, `ownerOnly`
- Security-sensitive files: `worker/services/secrets/`, `worker/middleware/`, `worker/utils/authUtils.ts`

**5.8 WebSocket Protocol:**
- Connection: client connects to `/api/agent/{agentId}/ws` after session creation
- State restoration on reconnect: `agent_connected` message includes full state snapshot (templateDetails, previewUrl, files, conversation)
- Message deduplication: tool execution causes duplicate AI messages; backend skips redundant LLM calls, frontend deduplicates live and restored messages
- Message categories (key types per category):
  - Agent State: `cf_agent_state`, `agent_connected`, `template_updated`
  - Conversation: `conversation_state`, `conversation_response`, `conversation_cleared`
  - Code Generation: `generation_started`, `file_generating`, `file_chunk_generated`, `file_generated`, `generation_complete`
  - Code Review: `code_reviewing`, `code_reviewed`, `runtime_error_found`, `static_analysis_results`
  - Phased Generation: `phase_generating`, `phase_generated`, `phase_implementing`, `phase_implemented`
  - Deployment: `deployment_started`, `deployment_completed`, `deployment_failed`, `cloudflare_deployment_*`
  - Preview: `preview_force_refresh`, `screenshot_capture_*`, `screenshot_analysis_result`
  - GitHub Export: `github_export_started`, `github_export_progress`, `github_export_completed`, `github_export_error`
  - Commands: `command_executing`, `command_executed`, `command_execution_failed`
  - Terminal: `terminal_command`, `terminal_output`, `server_log`
  - Model Config: `model_configs_info`
  - EAS Builds: `eas_build_status`, `eas_build_complete`, `eas_build_error`
  - Vault: `vault_unlocked`, `vault_locked`, `vault_required`, `vault_store_secret_request`, etc.
- Three layers that must stay in sync:
  1. Type definitions: `worker/api/websocketTypes.ts`
  2. Backend handler: `worker/agents/core/websocket.ts`
  3. Frontend handler: `src/routes/chat/utils/handle-websocket-message.ts`

---

### Section 6: Frontend Architecture

**Purpose:** Enable frontend development and UI changes.

**Contents:**

**6.1 Tech Stack and Build:**
- React 19, Vite (Rolldown), TypeScript, TailwindCSS, Radix UI primitives
- Commands: `bun run dev` (dev server), `bun run build` (tsc + vite build), `bun run typecheck`

**6.2 Routing:**
- React Router v7, all routes in `src/routes.ts`
- Routes: `/` (Home), `/chat/:chatId` (Chat), `/profile` (protected), `/settings` (protected), `/apps` (protected), `/app/:id` (public), `/discover`

**6.3 Context Providers:**
| Provider | File | Purpose |
|---|---|---|
| `AuthContext` | `src/contexts/auth-context.tsx` | User state, login/logout, token refresh, OAuth, intended URL management |
| `AppsDataContext` | `src/contexts/apps-data-context.tsx` | User's app list, pagination, filtering, sorting |
| `VaultContext` | `src/contexts/vault-context.tsx` | Secret vault management, encryption/decryption, master password |
| `ThemeContext` | `src/contexts/theme-context.tsx` | Dark/light/system theme switching and persistence |
| `MobileViewContext` | `src/contexts/mobile-view-context.tsx` | Responsive UI state management |

**6.4 API Client:**
- Singleton `apiClient` in `src/lib/api-client.ts`
- Type-safe methods with TypeScript generics
- CSRF token management with automatic refresh on 403
- 401 interception triggers global auth modal
- Anonymous session token tracking via localStorage
- All methods listed by category: auth, apps, user, stats, analytics, model config, model providers, vault, GitHub, agent

**6.5 Type System:**
- Single source of truth: `src/api-types.ts` (re-exports from worker types)
- Frontend always imports from `@/api-types`, never directly from worker code
- Type categories: App, User, Auth, Analytics, Model Config, Model Provider, Agent/CodeGen, WebSocket, Vault, Image Attachment, Error

**6.6 Chat Interface and WebSocket:**
- Chat page establishes WebSocket to agent via PartySocket
- Message handling: `src/routes/chat/utils/handle-websocket-message.ts`
- Real-time updates: file streaming (content appears as it generates), phase progress bars, preview URL iframe
- Monaco Editor for code viewing and editing
- State restoration on page refresh via `agent_connected` message

**6.7 Key Libraries:**
| Library | Purpose |
|---|---|
| Monaco Editor | In-browser code editor for viewing/editing generated files |
| Framer Motion | Animations and transitions |
| Recharts | Analytics charts and graphs |
| react-markdown | Rendering markdown in chat and app descriptions |
| PartySocket | WebSocket client with reconnection |
| Sonner | Toast notifications |
| Embla Carousel | Carousel components |
| Lucide React | Icon library |

---

### Section 7: SDK Package (`@cf-vibesdk/sdk`)

**Purpose:** Enable programmatic integration with vibesdk.

**Contents:**

**7.1 Overview:**
- Standalone client library: `sdk/` directory with own `package.json`
- Package: `@cf-vibesdk/sdk` v0.0.3, ES module
- Two entry points: `.` (browser-compatible), `./node` (Node.js specific)

**7.2 Core Classes:**
| Class | Purpose |
|---|---|
| `VibeClient` | Main entry point, authentication, app management |
| `BuildSession` | Long-lived session managing a single build lifecycle |
| `PhasicClient` | Phasic behavior wrapper |
| `AgenticClient` | Agentic behavior wrapper |
| `WorkspaceStore` | File system workspace management |
| `SessionStateStore` | Session state persistence and recovery |

**7.3 Usage Examples:**
- Constructing client: `new VibeClient({ baseUrl, credentials })`
- Building an app: `const session = await client.build(prompt, options)`
- Connecting to existing session: `const session = await client.connect(agentId)`
- Listing apps: `client.apps.listPublic()`, `client.apps.listMine()`, `client.apps.get(appId)`
- Git clone token: `client.apps.getGitCloneToken(appId)`

**7.4 Event System:**
- `BuildSession` emits events for generation progress tracking
- State types: `ConnectionState`, `GenerationState`, `PhaseState`, `SessionState`
- WebSocket message types available to SDK consumers

**7.5 Utilities:**
- `BlueprintStreamParser` -- parse streamed blueprint data
- `blueprintToMarkdown()` -- convert blueprint to readable markdown
- `withTimeout()`, `TimeoutError` -- timeout utilities for async operations

**7.6 Testing:**
- Unit tests: `cd sdk && bun test test/*.test.ts`
- Integration tests: `cd sdk && bun test --timeout 600000 test/integration/*.test.ts`
- Integration tests require: `VIBESDK_INTEGRATION_API_KEY` env var

---

### Section 8: Deployment and Operations

**Purpose:** Enable deploying, maintaining, and configuring vibesdk environments.

**Contents:**

**8.1 Environment Variables Reference:**
- Complete table: Variable | Required | Description | Where to Get It
- Groups: Cloudflare credentials, security secrets, AI provider keys, OAuth credentials, AI Gateway, feature flags

**8.2 Wrangler Configuration Anatomy:**
- `wrangler.jsonc` explained binding by binding:
  - `name`: worker name
  - `main`: entry point (`worker/index.ts`)
  - `compatibility_date` and `compatibility_flags`
  - `d1_databases`: DB binding name, database name, ID, migrations directory
  - `kv_namespaces`: binding name, ID
  - `r2_buckets`: binding names (TEMPLATES_BUCKET, R2_BUCKET), bucket names
  - `durable_objects.bindings`: all 5 DOs with class names
  - `ai`: AI binding (remote: true)
  - `containers`: image registry URL, instance type, max instances
  - `dispatch_namespaces`: dispatch namespace name
  - `unsafe.bindings` (rate limiters): API and AUTH rate limiter configs
  - `vars`: all config variables (TEMPLATES_REPOSITORY, DISPATCH_NAMESPACE, CLOUDFLARE_AI_GATEWAY, CUSTOM_DOMAIN, MAX_SANDBOX_INSTANCES, SANDBOX_INSTANCE_TYPE, PLATFORM_CAPABILITIES)
- `wrangler.staging.jsonc` differences: staging resource names, staging domain, preview_urls enabled

**8.3 `worker-configuration.d.ts`:**
- TypeScript interface defining all env bindings
- When to update: adding new KV, D1, R2, DO, or vars bindings
- Auto-updated by setup script for custom providers

**8.4 Staging Environment:**
- Resources: vibesdk-db-staging, vibesdk-templates-staging, appypievibe-staging, VibecoderStore-staging
- Domain: vibestaging.appypie.com
- Feature flags via PLATFORM_CAPABILITIES
- workers_dev and preview_urls enabled

**8.5 Database Operations:**
- Generate: `bun run db:generate` (reads schema, generates SQL migrations in `migrations/`)
- Apply local: `bun run db:migrate:local` (applies to local D1 via wrangler)
- Verify: `bun run db:studio` (opens Drizzle Studio GUI)
- Apply remote: `bun run db:migrate:remote` (applies to production D1 -- requires confirmation)
- Schema file: `worker/database/schema.ts`
- Drizzle config: `drizzle.config.ts`

**8.6 Production Deployment:**
- Command: `bun run deploy`
- What the deploy script (`scripts/deploy.ts`) does step by step:
  1. Validates environment variables and build config
  2. Parses and manages `wrangler.jsonc`
  3. Clones/pulls templates from GitHub (`https://github.com/cloudflare/vibesdk-templates`)
  4. Deploys templates to R2 via `deploy_templates.sh`
  5. Ensures dispatch namespace exists (`ensureDispatchNamespace()`)
  6. Configures container instances: type from `SANDBOX_INSTANCE_TYPE`, count from `MAX_SANDBOX_INSTANCES`
  7. Creates/verifies AI Gateway with tokens (`ensureAIGateway()`)
  8. Runs `wrangler deploy` with production config
  9. Handles SIGINT/SIGTERM with graceful cleanup (`restoreOriginalVars()`)

**8.7 Container and Sandbox Configuration:**
- Production: Cloudflare Containers
  - Image: `registry.cloudflare.com/vibesdk-production-userappsandboxservice:{hash}`
  - Instance type: `standard-3`
  - Max instances: 10 (configurable via `MAX_SANDBOX_INSTANCES`)
- Local dev: Docker containers
  - Requires Docker running
  - `SandboxDockerfile` for custom builds
  - Corporate network: add custom CA certs to Dockerfile

**8.8 AI Gateway Setup:**
- Gateway name: `vibesdk-gateway` (configurable via `CLOUDFLARE_AI_GATEWAY`)
- Auto-configured during `bun run setup` (token set to API token)
- Provides: caching, rate limiting, monitoring, multi-provider routing
- Manual setup: create gateway in Cloudflare dashboard, set `CLOUDFLARE_AI_GATEWAY_TOKEN` and `CLOUDFLARE_AI_GATEWAY_URL`

**8.9 CLI Commands Reference:**
| Command | Description |
|---|---|
| `bun run dev` | Start Vite dev server (DEV_MODE=true) |
| `bun run build` | TypeScript compile + Vite build (produces dist/) |
| `bun run typecheck` | TypeScript type-check without emitting |
| `bun run lint` | ESLint |
| `bun run knip` | Dead code / unused export detection |
| `bun run knip:fix` | Auto-fix unused exports |
| `bun run test` | Run all tests once |
| `bun run test:watch` | Watch mode |
| `bun run test:coverage` | Coverage report |
| `bun run test:integration` | Integration tests (needs VIBESDK_RUN_INTEGRATION_TESTS=1) |
| `bun run db:generate` | Generate migrations from schema |
| `bun run db:migrate:local` | Apply migrations to local D1 |
| `bun run db:migrate:remote` | Apply migrations to production D1 |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run deploy` | Deploy via scripts/deploy.ts (reads .prod.vars) |
| `bun run setup` | Interactive first-time setup |

---

### Section 9: Development Workflow and Contribution Guide

**Purpose:** Equip active contributors with patterns, recipes, and rules.

**Contents:**

**9.1 Code Quality Commands:**
- `bun run typecheck` -- run before committing
- `bun run lint` -- ESLint checks
- `bun run knip` / `bun run knip:fix` -- dead code detection

**9.2 Testing:**
- Runner: Vitest with `vitest-pool-workers` (Cloudflare Workers runtime)
- All tests: `bun run test`
- Single file: `vitest run path/to/file.test.ts`
- Watch: `bun run test:watch`
- Coverage: `bun run test:coverage`
- Integration: `bun run test:integration` (requires `VIBESDK_RUN_INTEGRATION_TESTS=1`)
- SDK tests: run separately from `sdk/` directory

**9.3 How-To Recipes:**
- **Add API endpoint:**
  1. Define types in `src/api-types.ts`
  2. Add method to `src/lib/api-client.ts`
  3. Create service in `worker/database/services/`
  4. Create controller in `worker/api/controllers/`
  5. Add route in `worker/api/routes/`
  6. Register in `worker/api/routes/index.ts`

- **Add WebSocket message:**
  1. Add type to `worker/api/websocketTypes.ts`
  2. Handle in `worker/agents/core/websocket.ts`
  3. Handle in `src/routes/chat/utils/handle-websocket-message.ts`

- **Add LLM tool:**
  1. Create `worker/agents/tools/toolkit/my-tool.ts`
  2. Export `createMyTool(agent, logger)` factory function
  3. Import in `worker/agents/tools/customTools.ts`
  4. Add to `buildTools()` (conversation) or `buildDebugTools()` (debugger)

- **Change LLM model for an operation:**
  - Edit `worker/agents/inferutils/config.ts`
  - Modify the relevant key in `DEFAULT_AGENT_CONFIG` or `PLATFORM_AGENT_CONFIG`

- **Modify conversation agent behavior:**
  - Edit `worker/agents/operations/UserConversationProcessor.ts` (SYSTEM_PROMPT)

**9.4 File Naming Conventions:**
| Type | Convention | Example |
|---|---|---|
| React components | PascalCase.tsx | `ChatView.tsx` |
| Utilities/hooks | kebab-case.ts | `api-client.ts`, `use-chat.ts` |
| Backend services | PascalCase.ts | `AppService.ts` |

**9.5 Core Rules (Non-Negotiable):**
1. **Strict type safety** -- never use `any`. Frontend imports types from `@/api-types`. Search codebase for existing types before creating new ones.
2. **DRY principle** -- search for similar functionality before implementing. Extract reusable utilities, hooks, and components. Never copy-paste.
3. **Follow existing patterns** -- frontend APIs in `src/lib/api-client.ts`, backend routes in `worker/api/routes/`, controllers in `worker/api/controllers/`, DB services in `worker/database/services/`, types shared in `shared/types/` and `src/api-types.ts`.
4. **Production-ready code only** -- no TODOs, no placeholders, no hacky workarounds.
5. **File naming** -- follow conventions in 9.4.

**9.6 Debugging Hotspots:**
| Subsystem | What to Check |
|---|---|
| State machine | Transitions in `worker/agents/core/codingAgent.ts`; abort controller cleanup; `CodeGenState` field consistency |
| WebSocket | All three layers in sync (types, backend handler, frontend handler); message deduplication; reconnect state restoration |
| Inference/LLM | Model config in `worker/agents/inferutils/config.ts`; tool execution loop; loop detection triggers |
| Database | Migration state; service query logic; Drizzle schema types |
| Sandbox | Container lifecycle; Cloudflare tunnel status; WARP interference |

**9.7 Security-Sensitive Paths:**
- `worker/services/secrets/` -- vault crypto (Argon2id/AES-GCM); RPC methods return null/boolean, never throw
- `worker/middleware/` -- CSRF, WebSocket security
- `worker/utils/authUtils.ts` -- JWT signing, authentication
- Any file handling user input or external data

**9.8 Gotchas:**
- Vite env vars (`import.meta.env.*`) not available in Worker code -- use `env` bindings from Worker context
- Cloudflare WARP (full mode) breaks anonymous cloudflared tunnels -- disable or use DNS-only (1.1.1.1) mode
- Docker required for local sandbox instances
- First-time setup: see `docs/setup.md` for the quick walkthrough

---

## Spec Self-Review Checklist

- [ ] No TBD, TODO, or incomplete sections
- [ ] No contradictions between sections
- [ ] Scope is appropriate for a single document (~2000-2500 lines)
- [ ] No ambiguous requirements -- each section has clear deliverables
- [ ] File paths reference actual codebase locations (verified during research)
- [ ] Existing docs relationship is clearly defined (kept, referenced, not duplicated)
