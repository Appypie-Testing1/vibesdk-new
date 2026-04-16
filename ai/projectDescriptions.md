# VibeSdk - Complete Project Documentation

A step-by-step guide covering every aspect of the VibeSdk project. Read sequentially for full understanding.

---

## Table of Contents

1. [What is VibeSdk?](#1-what-is-vibesdk)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Directory Structure](#4-project-directory-structure)
5. [The Durable Object System](#5-the-durable-object-system)
6. [State Machine - Code Generation Flow](#6-state-machine---code-generation-flow)
7. [LLM Tools (24 Tools)](#7-llm-tools-24-tools)
8. [All API Endpoints (70+)](#8-all-api-endpoints-70)
9. [WebSocket Messages](#9-websocket-messages)
10. [Database Schema (D1)](#10-database-schema-d1)
11. [SDK Sub-Package](#11-sdk-sub-package)
12. [Security Architecture](#12-security-architecture)
13. [How to Run Locally](#13-how-to-run-locally)
14. [CI/CD Pipeline](#14-cicd-pipeline)
15. [Key Architectural Patterns](#15-key-architectural-patterns)
16. [Generated App Tech Stack and Templates](#16-generated-app-tech-stack-and-templates)
17. [Current LLM Providers and Configuration](#17-current-llm-providers-and-configuration)
18. [Where API Keys Are Stored](#18-where-api-keys-are-stored)
19. [Where the Gemini API Key Lives in Code](#19-where-the-gemini-api-key-lives-in-code)
20. [Project Issues Audit](#20-project-issues-audit)
21. [Where Generated Codebase is Kept](#21-where-generated-codebase-is-kept)
22. [Cloudflare Container Configuration](#22-cloudflare-container-configuration)
23. [All URLs for Generated Code](#23-all-urls-for-generated-code)
24. [What is Bun](#24-what-is-bun)
25. [How to Read the Sandbox Docker Image](#25-how-to-read-the-sandbox-docker-image)
26. [What is Docker](#26-what-is-docker)
27. [What is Hosted in Docker vs Serverless](#27-what-is-hosted-in-docker-vs-serverless)
28. [Workers vs Workers for Platforms](#28-workers-vs-workers-for-platforms)
29. [What is Wrangler](#29-what-is-wrangler)
30. [What is Hono](#30-what-is-hono)
31. [Why Workers AND Durable Objects](#31-why-workers-and-durable-objects)
32. [What Each of the 5 DOs Does](#32-what-each-of-the-5-dos-does)
33. [Rate Limiting (DORateLimitStore)](#33-rate-limiting-doratelimitstore)
34. [UserSecretsStore Deep Dive](#34-usersecretsstore-deep-dive)
35. [Frontend Architecture](#35-frontend-architecture)
36. [How Frontend Calls the Main Worker](#36-how-frontend-calls-the-main-worker)
37. [Full Code Generation Flow](#37-full-code-generation-flow)
38. [DNS Setup](#38-dns-setup)
39. [Template System -- Complete Deep Dive](#39-template-system----complete-deep-dive)
40. [How to See D1 Data](#40-how-to-see-d1-data)
41. [Where User-Generated Code is Stored](#41-where-user-generated-code-is-stored)
42. [How to Access Durable Object SQLite](#42-how-to-access-durable-object-sqlite)
43. [Is There a "DO for Platforms"?](#43-is-there-a-do-for-platforms)
44. [EAS Build -- Mobile APK/IPA Generation](#44-eas-build----mobile-apkipa-generation)
45. [R2 Buckets Used in the Project](#45-r2-buckets-used-in-the-project)

---

## 1. What is VibeSdk?

VibeSdk (also called "Cloudflare Vibe Coding") is an **AI-powered full-stack application generation platform** built entirely on Cloudflare infrastructure. It is the technology behind `build.cloudflare.dev`.

You describe what you want to build in plain English, and the system:

1. **Analyzes** the request and picks the right tech stack
2. **Generates a blueprint** (architecture plan) for the app
3. **Writes all the code** across multiple files in phases
4. **Deploys it live** to a sandbox with a preview URL
5. **Debugs any errors** automatically
6. Lets users **chat** to refine, fix bugs, or add features

Think of it as "ChatGPT meets Vercel" -- an AI that doesn't just write code, but actually builds and runs complete apps.

**Live URL:** `build.cloudflare.dev` (original Cloudflare deployment)
**This fork:** `vibesnappy.appypie.com` (Appy Pie deployment)

---

## 2. High-Level Architecture

```
User's Browser (React Frontend)
       |
       | REST API + WebSocket (real-time streaming)
       v
Cloudflare Worker (Hono HTTP framework)
       |
       |--- Durable Objects (stateful per-session AI agents)
       |--- D1 Database (SQLite -- users, apps, sessions)
       |--- R2 Storage (templates, assets)
       |--- KV Namespace (configuration overrides, optional KV-based rate limiting)
       |--- AI Gateway (routes LLM calls to multiple providers)
       |--- Container Service (sandbox for running generated apps)
       |
       v
AI Providers: Google Gemini, xAI/Grok, OpenAI, Anthropic, Groq
```

### How a Request Flows

```
1. User types "Build me a todo app" in browser
2. Frontend calls POST /api/agent with the prompt
3. Worker creates a Durable Object (CodeGeneratorAgent) for this session
4. WebSocket connection established for real-time streaming
5. Agent picks a template (e.g., React + Vite)
6. Agent generates a blueprint (architecture plan) via Gemini Pro
7. Agent enters phase loop:
   a. PHASE_GENERATING: Plans what to build in this phase
   b. PHASE_IMPLEMENTING: Writes the actual code files (streamed to browser)
   c. REVIEWING: Deploys to sandbox, checks for errors
   d. If errors -> auto-fix or deep debug, then loop back
   e. If clean -> move to next phase or finish
8. User sees live preview in iframe, can chat to modify
```

---

## 3. Technology Stack

### Frontend (`/src`)

| Technology | Purpose | Version |
|---|---|---|
| **React 19** | UI framework | 19.x |
| **TypeScript** | Type safety | 5.9 |
| **Vite** | Build tool and dev server | 7.x (rolldown-vite) |
| **TailwindCSS v4** | Utility-first CSS | 4.x |
| **React Router v7** | Client-side routing | 7.x |
| **shadcn/ui + Radix UI** | Component library (20+ primitives) | Latest |
| **Monaco Editor** | Code editor (same as VS Code) | Latest |
| **PartySocket** | WebSocket with auto-reconnect | Latest |
| **Framer Motion** | Animations | Latest |

### Backend (`/worker`)

| Technology | Purpose |
|---|---|
| **Cloudflare Workers** | Serverless runtime (edge computing) |
| **Hono** | Lightweight HTTP framework |
| **Durable Objects** | Stateful per-session instances |
| **D1** | SQLite database at the edge |
| **R2** | Object storage -- two buckets: `vibesdk-templates` (templates, images, screenshots) and `appypievibe` (mobile build artifacts) |
| **KV** | Key-value store (session tokens) |
| **Drizzle ORM** | Type-safe SQL query builder |
| **isomorphic-git** | Pure JS git (version control in-memory) |
| **Zod** | Runtime schema validation |

### AI / LLM Providers

| Provider | Models Used | Purpose |
|---|---|---|
| **Google Gemini** | gemini-3-pro-preview, gemini-3-flash-preview | Blueprint generation, phase planning, code writing |
| **xAI/Grok** | grok-4-1-fast | Deep debugging, conversation, file regeneration |
| **OpenAI** | GPT-5, GPT-5-mini | Alternative provider (BYOK) |
| **Anthropic** | Claude 4.5 Sonnet/Opus | Alternative provider (BYOK) |
| **Groq** | Various | Alternative provider |

### Infrastructure

| Service | Purpose |
|---|---|
| **Cloudflare Containers** | Sandbox for running generated apps (12 GiB, 2 vCPU) |
| **Cloudflare AI Gateway** | Routes and monitors LLM API calls |
| **Workers for Platforms (Dispatch)** | Multi-tenant deployment of user apps |
| **GitHub Actions** | CI/CD pipeline |
| **Sentry** | Error tracking and observability |

### SDK (`/sdk`)

| Technology | Purpose |
|---|---|
| **@cf-vibesdk/sdk** | Client SDK for programmatic access |
| **Bun** | Runtime for SDK tests and build |

---

## 4. Project Directory Structure

```
vibesdk-new/
|
|-- src/                          # FRONTEND (React app)
|   |-- main.tsx                  # Entry point (React Router setup)
|   |-- App.tsx                   # Root component (provider hierarchy)
|   |-- routes.ts                 # Route definitions
|   |-- api-types.ts              # Single source of truth for all types
|   |-- index.css                 # Global styles + Tailwind theme
|   |-- components/               # 80+ React components
|   |   |-- ui/                   # 48 shadcn/ui primitives
|   |   |-- auth/                 # Login modal, auth button
|   |   |-- shared/               # AppCard, dropdowns, modals
|   |   |-- monaco-editor/        # Code editor integration
|   |   |-- vault/                # Secret management UI
|   |-- routes/                   # Page components
|   |   |-- home.tsx              # Landing page
|   |   |-- chat/                 # Main chat interface (22 subcomponents)
|   |   |-- profile.tsx           # User profile
|   |   |-- settings/             # Settings pages
|   |   |-- apps/                 # User's apps list
|   |   |-- app/                  # Single app viewer
|   |   |-- discover/             # Public app discovery
|   |-- hooks/                    # 20 custom React hooks
|   |-- contexts/                 # 5 React Context providers
|   |-- lib/                      # Core utilities
|   |   |-- api-client.ts         # ALL API calls (70+ endpoints)
|   |   |-- vault-crypto.ts       # Client-side encryption
|   |   |-- database-client.ts    # Local database
|   |-- features/                 # Feature modules (app, presentation, general)
|   |-- utils/                    # Helper utilities
|
|-- worker/                       # BACKEND (Cloudflare Worker)
|   |-- index.ts                  # Worker entry point (request routing, 224 lines)
|   |-- app.ts                    # Hono app setup (middleware stack)
|   |-- agents/                   # AI Agent system (119 files)
|   |   |-- core/                 # Core agent logic
|   |   |   |-- codingAgent.ts    # Main Durable Object (per-session)
|   |   |   |-- AgentCore.ts      # Agent infrastructure interface
|   |   |   |-- state.ts          # State machine definitions
|   |   |   |-- websocket.ts      # WebSocket message handler
|   |   |   |-- behaviors/        # Phasic vs Agentic behavior
|   |   |-- operations/           # AI operations
|   |   |   |-- PhaseGeneration.ts     # Plans what to build next
|   |   |   |-- PhaseImplementation.ts # Writes the actual code
|   |   |   |-- DeepDebugger.ts        # Autonomous bug fixer
|   |   |   |-- UserConversationProcessor.ts  # Chat handler
|   |   |-- tools/                # LLM tools (24 tools)
|   |   |   |-- customTools.ts    # Tool registry
|   |   |   |-- toolkit/          # Individual tool implementations
|   |   |-- git/                  # Git system (SQLite-backed)
|   |   |-- inferutils/           # LLM provider config
|   |   |-- prompts.ts            # System prompts (87 KB, 1447 lines)
|   |   |-- schemas.ts            # Zod validation schemas
|   |-- api/                      # REST API layer
|   |   |-- routes/               # Route definitions
|   |   |-- controllers/          # Business logic
|   |   |-- handlers/             # Request handlers
|   |   |-- websocketTypes.ts     # WebSocket message types (667 lines)
|   |-- database/                 # Database layer
|   |   |-- schema.ts             # Drizzle ORM table definitions
|   |   |-- database.ts           # D1 connection setup
|   |   |-- services/             # CRUD service classes
|   |-- services/                 # Backend services
|   |   |-- sandbox/              # Container management
|   |   |-- secrets/              # Encrypted vault (UserSecretsStore DO)
|   |   |-- aigateway-proxy/      # AI Gateway routing
|   |   |-- rate-limit/           # Rate limiting
|   |   |-- oauth/                # Google/GitHub OAuth
|   |   |-- code-fixer/           # Auto code repair
|   |-- middleware/                # Auth, security middleware
|   |-- config/                   # Configuration management
|   |-- logger/                   # Structured logging
|
|-- sdk/                          # CLIENT SDK (@cf-vibesdk/sdk)
|   |-- src/
|   |   |-- index.ts              # Main exports
|   |   |-- client.ts             # VibeClient (HTTP + streaming)
|   |   |-- session.ts            # BuildSession (WebSocket lifecycle)
|   |   |-- phasic.ts             # PhasicClient (phase-based generation)
|   |   |-- agentic.ts            # AgenticClient (conversation-based)
|   |   |-- ws.ts                 # WebSocket management
|   |   |-- types.ts              # 30+ exported types
|   |-- test/                     # Unit + integration tests
|
|-- shared/                       # Shared types (frontend + backend)
|   |-- types/errors.ts           # SecurityError, RateLimitExceededError
|
|-- container/                    # Sandbox container tooling
|   |-- cli-tools.ts              # Process monitoring CLI
|   |-- process-monitor.ts        # Process monitoring
|   |-- storage.ts                # SQLite storage
|
|-- migrations/                   # D1 database migrations
|   |-- 0000_living_forge.sql     # Initial schema
|   |-- 0001-0004_*.sql           # Schema evolution
|
|-- scripts/                      # Deployment scripts
|   |-- deploy.ts                 # Full automated deployment
|   |-- setup.ts                  # Initial project setup wizard
|   |-- undeploy.ts               # Cleanup/teardown
|
|-- .github/workflows/            # CI/CD
|   |-- ci.yml                    # Lint + typecheck + test + build
|   |-- deploy-release-live.yml   # Production deploy pipeline
|
|-- wrangler.jsonc                # Cloudflare Worker configuration
|-- vite.config.ts                # Vite build configuration
|-- vitest.config.ts              # Test configuration
|-- package.json                  # Dependencies (100+ packages)
|-- tsconfig*.json                # TypeScript configurations
|-- SandboxDockerfile             # Container image definition
```

---

## 5. The Durable Object System

### What Is a Durable Object?

A Durable Object (DO) is a Cloudflare primitive that gives you a **single-threaded, stateful instance** with its own SQLite database. Think of it as a mini-server dedicated to one task.

### The 5 Durable Objects in VibeSdk

```
wrangler.jsonc:
"durable_objects": {
    "bindings": [
        { "class_name": "CodeGeneratorAgent",    "name": "CodeGenObject" },
        { "class_name": "UserAppSandboxService",  "name": "Sandbox" },
        { "class_name": "DORateLimitStore",        "name": "DORateLimitStore" },
        { "class_name": "UserSecretsStore",        "name": "UserSecretsStore" },
        { "class_name": "GlobalDurableObject",     "name": "GlobalDurableObject" }
    ]
}
```

| Durable Object | Purpose | One Per... |
|---|---|---|
| **CodeGeneratorAgent** | The AI coding agent | Chat session |
| **UserAppSandboxService** | Runs generated apps in containers | App preview |
| **UserSecretsStore** | Encrypted API key vault | User |
| **DORateLimitStore** | Request rate limiting | Rate limit bucket |
| **GlobalDurableObject** | Shared global state | Entire platform |

### How They Relate

```
Main Worker (stateless, handles HTTP)
    |
    |--- CodeGeneratorAgent (one per chat session)
    |       |-- Stores generated files, conversation, git history
    |       |-- Holds WebSocket connections
    |       |-- Coordinates with Sandbox
    |
    |--- UserAppSandboxService (one per sandbox container)
    |       |-- Creates/manages Docker container
    |       |-- Deploys files, runs commands
    |       |-- Returns preview URL
    |
    |--- UserSecretsStore (one per user)
    |       |-- Encrypted API key storage
    |       |-- XChaCha20-Poly1305 encryption
    |
    |--- DORateLimitStore (one per bucket)
    |       |-- Counts requests per time window
    |       |-- Allow/deny decisions
    |
    |--- GlobalDurableObject (singleton)
            |-- Platform-wide settings
```

---

## 6. State Machine - Code Generation Flow

```
IDLE
  |
  v
PHASE_GENERATING -------> Plans the next phase (what files to create/modify)
  |
  v
PHASE_IMPLEMENTING -----> Actually writes the code (streamed to browser)
  |
  v
REVIEWING ----------------> Deploys to sandbox, runs analysis, checks errors
  |
  |---> Errors found? --> Auto-fix or Deep Debug --> back to IMPLEMENTING
  |
  |---> More phases? --> back to PHASE_GENERATING
  |
  v
FINALIZING ---------------> All phases done, final deployment
  |
  v
IDLE (ready for user conversation/modifications)
```

### Behavior Modes

| Mode | Used For | How It Works |
|---|---|---|
| **Phasic** (default) | Web apps, mobile apps | Multi-phase blueprint, implements one phase at a time |
| **Agentic** | Presentations, workflows, general tasks | Conversational, plan-based approach |

---

## 7. LLM Tools

There are 24 tool files in `worker/agents/tools/toolkit/`, but not all are exposed as LLM-callable tools at runtime. They are registered in two separate registries in `worker/agents/tools/customTools.ts`:

### Conversation Tools -- `buildTools()` (11 tools)

These are exposed to the LLM during user conversation (the chat interface):

| Tool | What It Does |
|---|---|
| `web_search` | Searches the web for information |
| `feedback` | Collects user feedback |
| `queue_request` | Relays user modification requests to the coding agent |
| `get_logs` | Gets execution logs from sandbox |
| `deploy_preview` | Deploys code to sandbox for testing |
| `wait_for_generation` | Waits for generation to complete |
| `wait_for_debug` | Waits for debug session to complete |
| `rename_project` | Renames the project |
| `alter_blueprint` | Modifies the project plan |
| `git` | Git operations (commit, log, show -- excludes reset) |
| `deep_debugger` | Launches autonomous deep debugging |

**Note:** `regenerate_file` and `read_files` are NOT conversation tools -- they are only available in debug tools (`buildDebugTools()`).

### Debug Tools -- `buildDebugTools()` (10 tools)

These are exposed to the LLM during deep debugging sessions only:

| Tool | What It Does |
|---|---|
| `get_logs` | Gets execution logs |
| `get_runtime_errors` | Gets runtime errors from sandbox |
| `read_files` | Reads file contents |
| `run_analysis` | Runs static analysis / linting |
| `exec_commands` | Runs terminal commands in sandbox |
| `regenerate_file` | Rewrites a single file |
| `generate_files` | Writes multiple code files at once |
| `deploy_preview` | Deploys to sandbox for testing |
| `wait` | Pauses execution |
| `git` | Git operations (full access including reset) |

### Tools Called Directly (NOT registered in LLM tool lists)

These exist as toolkit files but are called directly by agent operations, not exposed as LLM-callable tools:

| Tool | Called By |
|---|---|
| `generate_blueprint` | PhasicCodingBehavior initialization |
| `init_suitable_template` | AgenticProjectBuilder, template selection flow |
| `virtual_filesystem` | AgenticProjectBuilder |
| `generate_images` | AgenticProjectBuilder |
| `initialize_slides` | AgenticProjectBuilder (presentation mode) |
| `completion_signals` | AgenticProjectBuilder |

---

## 8. All API Endpoints (70+)

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/verify-email` | Verify email with OTP |
| POST | `/api/auth/resend-otp` | Resend verification code |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/profile` | Get current user profile |
| GET | `/api/auth/providers` | Available OAuth providers |
| GET | `/api/auth/csrf-token` | Get CSRF token |
| GET | `/api/auth/sessions` | List active sessions |
| POST | `/api/auth/sessions/:id/revoke` | Revoke a session |
| GET | `/api/auth/api-keys` | List API keys |
| POST | `/api/auth/api-keys` | Create API key |
| POST | `/api/auth/api-keys/:id/revoke` | Revoke API key |

### Code Generation (Core Feature)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/agent` | Start new code generation session |
| GET | `/api/agent/:agentId/ws` | WebSocket connection to agent |
| GET | `/api/agent/:agentId/connect` | Reconnect to existing agent |
| GET | `/api/agent/:agentId/preview` | Get preview URL |
| GET | `/api/agent/:agentId/builds/:buildId/download` | Download mobile build |

### Apps Management

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/apps` | List user's apps |
| POST | `/api/apps` | Create app record |
| PATCH | `/api/apps/:id` | Update app |
| DELETE | `/api/apps/:id` | Delete app |
| GET | `/api/apps/recent` | Recent apps |
| GET | `/api/apps/favorites` | Favorited apps |
| GET | `/api/apps/public` | Public/discover feed |
| GET | `/api/apps/user` | Paginated user apps |
| GET | `/api/apps/:id/details` | Full app details |
| POST | `/api/apps/:id/favorite` | Toggle favorite |
| POST | `/api/apps/:id/star` | Toggle star |
| POST | `/api/apps/:id/visibility` | Change visibility |

### User

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/user/profile` | Update profile |
| GET | `/api/user/stats` | User statistics |
| GET | `/api/user/activity` | Activity history |

### Model Configuration (BYOK)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/model-config` | Get all model configs |
| GET | `/api/model-config/:id` | Get specific config |
| PATCH | `/api/model-config/:id` | Update config |
| POST | `/api/model-config/:id/test` | Test model config |
| POST | `/api/model-config/:id/reset` | Reset to default |
| POST | `/api/model-config/reset-all` | Reset all configs |
| DELETE | `/api/model-config/:id` | Delete config |
| GET | `/api/model-config/defaults` | Get default configs |
| GET | `/api/model-providers` | List custom providers |
| POST | `/api/model-providers` | Add custom provider |
| PATCH | `/api/model-providers/:id` | Update provider |
| DELETE | `/api/model-providers/:id` | Remove provider |
| POST | `/api/model-providers/:id/test` | Test provider |
| GET | `/api/byok-providers` | Available BYOK providers |

### Secrets / Vault

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/secrets/templates` | Secret templates |
| GET | `/api/vault/status` | Vault status |
| GET | `/api/vault/config` | Vault configuration |
| POST | `/api/vault/setup` | Initialize vault |
| POST | `/api/vault/reset` | Reset vault |

### GitHub Export

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/github/export` | Export to GitHub repo |
| POST | `/api/github/check-status` | Check export status |

### Platform

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/status` | Platform health |
| GET | `/api/capabilities` | Available features |
| GET | `/api/analytics/user` | User analytics |
| GET | `/api/analytics/agent` | Agent analytics |

### Git Protocol (for `git clone`)

| Endpoint | Purpose |
|---|---|
| `/apps/:id.git/info/refs` | Git smart HTTP refs |
| `/apps/:id.git/git-upload-pack` | Git pack protocol |

---

## 9. WebSocket Messages

### Browser --> Server

| Message | Purpose |
|---|---|
| `SESSION_INIT` | Initialize with credentials |
| `GENERATE_ALL` | Start full code generation |
| `STOP_GENERATION` | Cancel generation |
| `PAUSE_GENERATION` | Pause generation |
| `RESUME_GENERATION` | Resume generation |
| `USER_MESSAGE` | Send chat message |
| `USER_SUGGESTION` | Send user suggestion |
| `DEPLOY` | Deploy to production |
| `PREVIEW` | Deploy for preview |
| `OVERWRITE` | Overwrite existing files |
| `UPDATE_QUERY` | Update the generation query |
| `CAPTURE_SCREENSHOT` | Take screenshot |
| `CLEAR_CONVERSATION` | Clear chat history |
| `GET_CONVERSATION_STATE` | Request current conversation state |
| `GET_MODEL_CONFIGS` | Request model configurations |
| `GITHUB_EXPORT` | Export project to GitHub |
| `RUNTIME_ERROR_FOUND` | Report runtime error from frontend |
| `PREVIEW_FAILED` | Report preview failure |
| `VAULT_UNLOCKED` | Notify vault has been unlocked |
| `VAULT_LOCKED` | Notify vault has been locked |
| `EAS_BUILD_TRIGGER` | Trigger mobile APK/IPA build |

### Server --> Browser

| Message | Purpose |
|---|---|
| `agent_connected` | Connection established, state restored |
| `generation_started` | Generation beginning |
| `file_generating` | A file is being written |
| `file_chunk_generated` | Code chunk streaming |
| `file_generated` | File complete |
| `generation_complete` | All generation done |
| `phase_generating/generated` | Phase lifecycle |
| `phase_implementing/implemented` | Phase implementation lifecycle |
| `blueprint_chunk` | Blueprint streaming |
| `deployment_started/completed/failed` | Deployment lifecycle |
| `runtime_error_found` | Error in sandbox |
| `static_analysis_results` | Linting results |
| `conversation_response` | AI chat response |
| `vault_required/unlocked/locked` | Vault lifecycle |
| `terminal_command/output` | Terminal streaming |
| `eas_build_status` | Mobile build status update (platform, buildId, status, progress) |
| `eas_build_complete` | Mobile build finished (includes downloadUrl) |
| `eas_build_error` | Mobile build failed (includes error message) |

---

## 10. Database Schema (D1)

D1 is the main platform database (SQLite at the edge). It stores everything about the platform itself, NOT the generated apps' data.

| Table | What It Stores |
|---|---|
| `users` | User accounts (email, OAuth, preferences, theme) |
| `sessions` | JWT sessions (tokens, device info, expiry) |
| `api_keys` | SDK API keys (hashed, scoped, revocable) |
| `apps` | Generated app metadata (title, prompt, blueprint, framework, deployment_id, status) |
| `favorites` | Which users favorited which apps |
| `stars` | App ratings |
| `app_likes` | User reactions on apps |
| `app_comments` | Threaded comments on apps |
| `app_views` | View analytics (device, referrer, duration) |
| `user_model_configs` | Per-user LLM model overrides |
| `user_model_providers` | Custom BYOK provider configurations |
| `auth_attempts` | Login attempt tracking (brute force protection) |
| `password_reset_tokens` | Password reset flow |
| `email_verification_tokens` | Email verification |
| `verification_otps` | OTP codes |
| `oauth_states` | OAuth flow state |
| `system_settings` | Global platform config |
| `audit_logs` | Change tracking |

**D1 does NOT store:** generated code (in Durable Object SQLite), git history (also DO SQLite), or user secrets (encrypted in UserSecretsStore DO).

---

## 11. SDK Sub-Package

The SDK (`@cf-vibesdk/sdk`) allows programmatic access to VibeSdk from Node.js/Bun.

### Main Classes

- **PhasicClient** -- Phase-based generation (most common)
- **AgenticClient** -- Conversation-based generation
- **BuildSession** -- Manages a live build session (WebSocket)

### Example Usage Pattern

```typescript
import { PhasicClient } from '@cf-vibesdk/sdk';

const client = new PhasicClient({
  baseUrl: 'https://vibesnappy.appypie.com',
  apiKey: 'your-api-key'
});

const session = await client.build({
  query: 'Build me a todo app with React',
  template: 'react-vite'
});

await session.waitForIdle();
const files = session.workspace.files;
```

### Key Features

- Automatic WebSocket reconnection with exponential backoff + jitter
- Message deduplication
- NDJSON streaming for blueprint chunks
- Workspace reconstruction from `generatedFilesMap`
- Full TypeScript support with 30+ exported types

---

## 12. Security Architecture

### Authentication

- **OAuth**: Google and GitHub
- **Email/Password**: With email verification (OTP)
- **JWT Sessions**: Access + refresh tokens, stored as hashes
- **API Keys**: For SDK access, scoped and revocable

### Request Security

- **CSRF Protection**: Double-submit cookie pattern on all state-changing requests
- **Rate Limiting**: Durable Object-based (10k req/min API, 1k req/min auth)
- **CORS**: Configured for specific origins
- **IP Rejection**: Blocks direct IP access (must use domain)

### Secrets Vault (UserSecretsStore)

- **Client-side encryption**: VMK (Vault Master Key) never leaves browser
- **XChaCha20-Poly1305**: Encryption algorithm
- **Key hierarchy**: MEK -> UMK -> DEK (PBKDF2 derivation)
- **One session per user**: Server memory only holds encrypted key

---

## 13. How to Run Locally

### Prerequisites

- Bun (package manager and runtime)
- Node.js 22+
- Wrangler CLI (Cloudflare)

### Commands

```bash
# Install dependencies
bun install

# Start development server (frontend + worker)
bun run dev

# Run tests
bun run test

# Type check
bun run typecheck

# Lint
bun run lint

# Build for production
bun run build

# Database operations
bun run db:generate          # Generate migrations
bun run db:migrate:local     # Apply migrations locally
bun run db:studio            # Open Drizzle Studio

# SDK (from sdk/ directory)
cd sdk && bun test           # Run SDK unit tests

# Deploy
bun run deploy               # Deploy to Cloudflare (needs .prod.vars)
```

### Environment Variables

Copy `.dev.vars.example` to `.dev.vars` and fill in:
- Cloudflare credentials (API token, account ID)
- AI provider keys (at minimum `GOOGLE_AI_STUDIO_API_KEY`)
- OAuth credentials (Google, GitHub)
- `JWT_SECRET`, `WEBHOOK_SECRET`

**Note:** `.dev.vars` is gitignored (line 31: `.dev.vars*`). Never committed to the repo.

---

## 14. CI/CD Pipeline

### On Pull Request / Push to main

1. **Lint** -- ESLint
2. **Typecheck** -- TypeScript compilation check
3. **Test** -- Vitest in Cloudflare Workers pool
4. **Build** -- tsc + Vite production build

### On Push to release-live

1. Run tests
2. Run `bun scripts/deploy.ts` which:
   - Validates all credentials
   - Updates Wrangler configuration
   - Deploys Worker + Durable Objects
   - Uploads templates to R2
   - Configures AI Gateway
   - Sets up rate limiters

---

## 15. Key Architectural Patterns

### Single Source of Truth for Types

All API types defined in `src/api-types.ts`, re-exported from worker types. Frontend and backend share the same type definitions.

### Centralized API Client

Every API call goes through `src/lib/api-client.ts`. Automatic CSRF token management, 401 interception triggers auth modal globally, rate limit error detection.

### React Context + Hooks (No Redux)

5 global contexts: Auth, Vault, Theme, MobileView, AppsData. 20+ custom hooks. `useChat` is the main orchestrator hook (600+ lines).

### Git-in-SQLite

Full git history stored in Durable Object's SQLite using isomorphic-git. Supports git clone protocol.

### Streaming Everything

Blueprint: NDJSON streaming. Code files: chunk-by-chunk via WebSocket. Conversation: streamed token by token.

---

## 16. Generated App Tech Stack and Templates

Generated apps use **templates** fetched from the external repo `https://github.com/cloudflare/vibesdk-templates` (stored in R2). The AI picks the right template based on the user's prompt.

| Project Type | Render Mode | Likely Stack |
|---|---|---|
| `app` | `sandbox` | React + Vite (web apps running in Cloudflare Container) | **Enabled** |
| `app` | `mobile` | React Native + Expo | **Enabled** |
| `app` | `mobile-fullstack` | React Native + Expo + backend | **Enabled** |
| `presentation` | `browser` | Slides/presentation framework | **Disabled** in current deployment |
| `general` | varies | General code generation | **Disabled** in current deployment |

**Note:** `presentation` and `general` are disabled in `wrangler.jsonc` PLATFORM_CAPABILITIES (`enabled: false`). Only `app` type is active.

Generated apps use **in-memory data** by default. From the prompts:
> "MUST use in-memory data stores (arrays/objects) -- D1/KV are NOT available."

---

## 17. Current LLM Providers and Configuration

Defined in `worker/agents/inferutils/config.ts:184`:

```typescript
export const AGENT_CONFIG = env.PLATFORM_MODEL_PROVIDERS
    ? PLATFORM_AGENT_CONFIG    // Multi-provider (production)
    : DEFAULT_AGENT_CONFIG;    // Gemini-only (self-hosted default)
```

### Production Config (PLATFORM_MODEL_PROVIDERS set)

| Agent Action | Model | Provider |
|---|---|---|
| Blueprint | Gemini 3.0 Pro Preview | Google |
| Phase Generation | Gemini 3.0 Flash Preview | Google |
| Code Implementation | Gemini 3.0 Flash Preview | Google |
| Deep Debugger | Grok 4.1 Fast | xAI |
| Conversation | Grok 4.1 Fast | xAI |
| File Regeneration | Grok 4.1 Fast (non-reasoning) | xAI |
| Code Fixer | Grok 4.1 Fast (non-reasoning) | xAI |
| Template Selection | Gemini 2.5 Flash-Lite | Google |

### Default Config (Gemini-only, for self-hosted)

Most operations use **Gemini 3.0 Flash Preview**, with these exceptions:

| Agent Action | Model |
|---|---|
| Blueprint | Gemini 3.0 Flash Preview (reasoning: high) |
| Phase Generation | Gemini 3.0 Flash Preview |
| Code Implementation | Gemini 3.0 Flash Preview |
| **Conversation** | **Gemini 2.5 Flash** (NOT 3.0 Flash Preview) |
| Deep Debugger | Gemini 3.0 Flash Preview (reasoning: high) |
| File Regeneration | Gemini 3.0 Flash Preview |
| Template Selection | Gemini 2.5 Flash-Lite |

All LLM calls route through **Cloudflare AI Gateway** (`vibesdk-gateway`).

### All Available Models (from config.types.ts MODELS_MASTER)

| Model | Provider | Size | Cost (credits) | Context |
|---|---|---|---|---|
| Gemini 2.5 Pro | Google AI Studio | Large | 5 | 1M |
| Gemini 2.5 Pro (Latest) | Google AI Studio | Large | 5 | 1M |
| Gemini 2.5 Flash | Google AI Studio | Regular | 1.2 | 1M |
| Gemini 2.5 Flash (Latest) | Google AI Studio | Regular | 1.2 | 1M |
| Gemini 2.5 Flash-Lite | Google AI Studio | Lite | 0.4 | 1M |
| Gemini 2.5 Flash-Lite (Latest) | Google AI Studio | Lite | 0.4 | 1M |
| Gemini 3.0 Pro Preview | Google AI Studio | Large | 8 | 1M |
| Gemini 3.0 Flash Preview | Google AI Studio | Regular | 2 | 1M |
| Claude 3.7 Sonnet | Anthropic | Large | 12 | 200K |
| Claude 4 Sonnet | Anthropic | Large | 12 | 200K |
| Claude 4.5 Sonnet | Anthropic | Large | 12 | 200K |
| Claude 4.5 Opus | Anthropic | Large | 20 | 200K |
| Claude 4.5 Haiku | Anthropic | Regular | 4 | 200K |
| GPT-5 | OpenAI | Large | 5 | 400K |
| GPT-5.1 | OpenAI | Large | 5 | 400K |
| GPT-5.2 | OpenAI | Large | 7 | 400K |
| GPT-5 Mini | OpenAI | Lite | 1 | 400K |
| Grok Code Fast 1 | xAI (Grok) | Lite | 0.8 | 256K |
| Grok 4 Fast | xAI (Grok) | Lite | 0.8 | 2M |
| Grok 4.1 Fast | xAI (Grok) | Lite | 0.8 | 2M |
| Grok 4.1 Fast Non Reasoning | xAI (Grok) | Lite | 0.8 | 2M |
| Vertex GPT OSS 120B | Google Vertex AI | Lite | 0.36 | 128K |
| Vertex Kimi K2 Thinking | Google Vertex AI | Lite | 2 | 256K |
| Qwen 3 Coder 480B | Google Vertex AI | Lite | 8 | 256K |

---

## 18. Where API Keys Are Stored

Three layers:

| What | Where | Purpose |
|---|---|---|
| **Platform AI keys** | `.dev.vars` (local) / `.prod.vars` (deploy) / GitHub Secrets (CI) | Server-side keys the platform uses to call LLM providers |
| **User BYOK keys** | **UserSecretsStore Durable Object** -- encrypted with XChaCha20-Poly1305 | Users supply their own provider keys |
| **User SDK API keys** | **D1 database** `api_keys` table -- stored as hashed values | API keys for programmatic SDK access |

---

## 19. Where the Gemini API Key Lives in Code

| Where | What |
|---|---|
| `.dev.vars` / `.prod.vars` | The actual key value (gitignored, never committed) |
| GitHub Secrets | CI/CD deployment key |
| `worker/agents/inferutils/core.ts:305` | Code that reads `env.GOOGLE_AI_STUDIO_API_KEY` |
| `worker-configuration.d.ts:18` | TypeScript type declaration |
| `worker/types/secretsTemplates.ts:79` | BYOK template definition |
| `.dev.vars.example` | Placeholder (not a real key) |

The `.dev.vars` file is gitignored (`.gitignore` line 31: `.dev.vars*`). You need to create it yourself:
```bash
cp .dev.vars.example .dev.vars
# Then fill in GOOGLE_AI_STUDIO_API_KEY
```

---

## 20. Project Issues Audit

### Summary

| Severity | Count |
|---|---|
| Critical | 7 |
| High | 13 |
| Medium | 12 |
| Low | 6 |
| **Total** | **38** |

### Critical Issues

1. **Debug console.log in Auth Middleware** -- `worker/middleware/auth/routeAuth.ts:74` exposes auth details
2. **JWT Secret Validation Commented Out** -- `worker/utils/jwtUtils.ts:32-57`
3. **WebSocket Connection Leak in useChat** -- `src/routes/chat/hooks/use-chat.ts:666-671`
4. **CSRF Token Race Condition** -- `src/lib/api-client.ts:233-244`
5. **Unhandled Stream Error** -- `src/routes/chat/hooks/use-chat.ts:529-572`
6. **ESLint no-explicit-any Disabled** -- `eslint.config.js:38`
7. **SDK noUncheckedIndexedAccess Disabled** -- `sdk/tsconfig.json:10`

### High Issues

8. Race Condition in WebSocket handling (`worker/agents/core/websocket.ts:31-60`)
9. `any` casts in AuthService (`worker/database/services/AuthService.ts:720,737`)
10. Legacy CSRF tokens still accepted (`worker/services/csrf/CsrfService.ts:64-86`)
11. parseInt without validation (`worker/api/controllers/user/controller.ts:27-28`)
12. Rate limit "fail open" pattern (`worker/services/rate-limit/rateLimits.ts:72-77`)
13. Vault WebSocket timeout leak (`src/contexts/vault-context.tsx:106-156`)
14. Stale closure in handleWebSocketMessage (`src/routes/chat/hooks/use-chat.ts:281-301`)
15. Race condition in apps data fetch (`src/contexts/apps-data-context.tsx:70-121`)
16. Missing env var validation at startup
17. Very low test coverage (18 test files for 100+ source files)
18. Docker security issues in SandboxDockerfile
19. CI/CD missing security checks
20. Hardcoded infrastructure IDs in wrangler.jsonc

### Recommended Priority

**Immediate:** Remove debug console.log (#1), uncomment JWT validation (#2), fix CSRF race (#4), enable no-explicit-any (#6), fix WebSocket cleanup (#3).

**Next sprint:** Input validation (#11), fail-closed rate limits (#12), vault WebSocket leak (#13), env var validation (#16), Docker security (#18).

---

## 21. Where Generated Codebase is Kept

Generated code lives in **3 places simultaneously**:

```
AI generates code
  --> FileManager updates generatedFilesMap (DO state)
  --> FileManager commits to git (SQLite)
  --> DeploymentManager deploys to sandbox container
  --> User sees live preview
```

| Storage | What | Access |
|---|---|---|
| **DO State** (`generatedFilesMap`) | Live working copy | WebSocket / frontend |
| **DO SQLite** (git via isomorphic-git) | Full version history with diffs | `git clone` protocol |
| **Sandbox Container** | Running copy of files | Browse preview URL |

**Nothing is stored in D1.** D1 only stores metadata (title, prompt, blueprint JSON). The actual generated code lives entirely within the Durable Object.

---

## 22. Cloudflare Container Configuration

From `wrangler.jsonc` and `SandboxDockerfile`:

```
Class:          UserAppSandboxService
Image:          registry.cloudflare.com/vibesdk-production-userappsandboxservice:727be683
Instance Type:  standard-3
Specs:          12 GiB RAM, 2 vCPU, 16 GB disk
Max Instances:  10
Port:           3000
CMD:            ./startup.sh  (CMD, not ENTRYPOINT -- can be overridden)
```

### What's Inside the Container

| Layer | What |
|---|---|
| **Base image** | `docker.io/cloudflare/sandbox:0.5.6` |
| **Runtime** | Bun (JavaScript/TypeScript runtime) |
| **OS packages** | git, curl, procps, net-tools, ca-certificates |
| **Tunneling** | cloudflared (Cloudflare tunnel binary) |
| **Monitoring** | Custom process monitor CLI |
| **TypeScript** | tsc via bunx |

### Container vs Worker

| | Worker | Container |
|---|---|---|
| **Runtime** | V8 JavaScript isolate | Full Linux OS |
| **Startup** | ~0ms | ~5-30 seconds |
| **Memory** | 128 MB max | 12 GiB |
| **CPU time** | 30s CPU time per request (but DOs can hold WebSockets for hours -- wall time is much longer) | Unlimited |
| **File system** | No POSIX filesystem, but has R2, KV, D1, and DO SQLite for storage | Full Linux filesystem |
| **Can install packages** | No | Yes (`bun install`) |
| **Can run processes** | No (single request/response) | Yes (dev server, linter, multiple processes) |

---

## 23. All URLs for Generated Code

For deployment at `vibesnappy.appypie.com`:

### Live Preview (running app in sandbox)
```
https://{sandboxInstanceId}.vibesnappy.appypie.com
```

### Permanently Deployed App (Workers for Platforms)
```
https://{deploymentId}.vibesnappy.appypie.com
```

### Git Clone (full source code)
```
git clone https://oauth2:{token}@vibesnappy.appypie.com/apps/{appId}.git
```

### Git Protocol Endpoints
```
GET  https://vibesnappy.appypie.com/apps/{appId}.git/info/refs?service=git-upload-pack
POST https://vibesnappy.appypie.com/apps/{appId}.git/git-upload-pack
```

### WebSocket (live streaming during generation)
```
wss://vibesnappy.appypie.com/api/agent/{agentId}/ws
```

### For Local Development
```
http://localhost:5173                              # Frontend
http://{id}.localhost:8787                         # Preview
http://localhost:8787/apps/{appId}.git             # Git clone
ws://localhost:8787/api/agent/{agentId}/ws         # WebSocket
```

---

## 24. What is Bun

Bun is a JavaScript/TypeScript runtime (like Node.js) but much faster. It's an all-in-one tool:

| Capability | Replaces |
|---|---|
| JS/TS runtime | Node.js |
| Package manager | npm / yarn / pnpm |
| Bundler | webpack / esbuild |
| Test runner | Jest / Vitest (partially) |

### How Bun Is Used in This Project

1. **Package manager:** `bun install`, `bun run dev`, `bun run build`
2. **SDK build tool:** `bun build ./src/index.ts --outdir ./dist --target bun`
3. **Deploy runner:** `bun --env-file .prod.vars scripts/deploy.ts`
4. **Inside sandbox container:** Installs deps (`bun install`), runs dev server (`bun run dev`)
5. **In generated apps:** Bun is the runtime inside the container

---

## 25. How to Read the Sandbox Docker Image

`docker.io/cloudflare/sandbox:0.5.6` is a public Docker image on Docker Hub.

```bash
# Pull and explore
docker pull cloudflare/sandbox:0.5.6
docker run -it cloudflare/sandbox:0.5.6 /bin/bash

# View on Docker Hub
# https://hub.docker.com/r/cloudflare/sandbox

# Inspect without pulling
docker manifest inspect cloudflare/sandbox:0.5.6

# See contents
docker history cloudflare/sandbox:0.5.6
docker inspect cloudflare/sandbox:0.5.6
docker run --rm cloudflare/sandbox:0.5.6 bun --version
```

---

## 26. What is Docker

Docker packages an application with everything it needs (OS, libraries, runtime, code) into a portable unit called a **container**.

| Term | What It Is |
|---|---|
| **Image** | Blueprint/template (read-only snapshot) |
| **Container** | Running instance of an image |
| **Dockerfile** | Recipe that describes how to build an image |
| **Docker Hub** | Public registry for sharing images |
| **Registry** | Any server that stores images |

### Is Docker Free?

| Tier | Cost |
|---|---|
| Docker Desktop (Personal) | Free (individuals, small businesses <250 employees) |
| Docker Engine (CLI only, Linux) | Always free |
| Pro/Team/Business | $5-$24/user/month |

**For this project, you don't need Docker locally.** Containers run on Cloudflare's infrastructure.

---

## 27. What is Hosted in Docker vs Serverless

### INSIDE Docker (the sandbox container)

| What | Purpose |
|---|---|
| Generated app source code | The files the AI wrote |
| Bun runtime | Runs the app |
| Vite dev server | Serves the app on port 3000 |
| node_modules | App dependencies |
| Process monitor CLI | Captures logs, errors |
| git | Version control inside container |
| cloudflared | Tunnel for exposing the app |

### NOT in Docker (serverless on Cloudflare)

| What | Where |
|---|---|
| VibeSdk backend (Worker) | Cloudflare Workers |
| D1 database | Cloudflare D1 |
| R2 storage (templates) | Cloudflare R2 |
| KV store | Cloudflare KV |
| AI Gateway | Cloudflare AI Gateway |
| Durable Objects | Cloudflare DO runtime |
| Frontend (React app) | Cloudflare Assets (CDN) |
| Permanently deployed user apps | Workers for Platforms |

### Lifecycle of a Generated App

```
User types prompt
    |
    v
Cloudflare Worker (serverless, NOT Docker)
    |-- AI generates code via LLM
    |-- Stores in Durable Object state + git
    |
    v
Sandbox Container (Docker) is created
    |-- Files uploaded into container
    |-- bun install
    |-- bun run dev (starts Vite dev server)
    |-- Preview URL: https://{id}.vibesnappy.appypie.com
    |
    v
User clicks "Deploy"
    |
    v
Workers for Platforms (serverless, NOT Docker)
    |-- App deployed as a lightweight Worker
    |-- Permanent URL: https://{deploymentId}.vibesnappy.appypie.com
    |-- Container shut down (no longer needed)
```

---

## 28. Workers vs Workers for Platforms

| | Normal Worker | Workers for Platforms |
|---|---|---|
| **Who deploys** | You (the developer) | Your users (programmatically) |
| **Scope** | One worker, one purpose | Many isolated workers under one account |
| **Use case** | Your own backend | Multi-tenant app hosting |
| **Count** | 1 | Hundreds/thousands |
| **Config** | `wrangler.jsonc` | None (programmatic) |
| **Bindings** | D1, R2, KV, DO, AI, etc. | Minimal (just serves static app) |
| **Domain** | `vibesnappy.appypie.com` | `*.vibesnappy.appypie.com` |
| **Code** | Your backend (7000+ lines) | User's generated app (~50-500 lines) |

In this project:
- **VibeSdk backend** = normal Worker (`vibesdk-production`)
- **User's deployed apps** = Workers for Platforms in dispatch namespace `orange-build-default-namespace`
- `DISPATCHER` binding lets the main worker route subdomain requests to user workers

---

## 29. What is Wrangler

Wrangler is Cloudflare's CLI tool for managing Workers. Like how `git` manages repos, **wrangler manages Cloudflare Workers**.

### What Wrangler Does in This Project

| Command | Script | What It Does |
|---|---|---|
| `wrangler dev` | `bun run dev` (via Vite plugin) | Local dev server with Worker runtime |
| `wrangler deploy` | `bun run deploy` | Push to production |
| `wrangler d1 migrations apply` | `bun run db:migrate:local/remote` | Apply database schema changes |
| `wrangler d1 migrations generate` | `bun run db:generate` | Generate migration SQL |
| `wrangler types` | Generates `worker-configuration.d.ts` | TypeScript types for Env |
| `wrangler secret put` | Inside deploy script | Set encrypted secrets |

### Without Wrangler vs With Wrangler

| Without | With |
|---|---|
| Can't run Workers locally | Full local dev with simulated Cloudflare |
| Manual API calls to deploy | `wrangler deploy` |
| No typed bindings | Auto-generated `Env` types |
| Manual DB migrations | `wrangler d1 migrations apply` |

---

## 30. What is Hono

Hono is a lightweight HTTP framework for Cloudflare Workers -- like Express.js but edge-native.

### Without Hono vs With Hono

```
// Without:
if (url.pathname === '/api/users' && request.method === 'GET') { ... }
if (url.pathname === '/api/users' && request.method === 'POST') { ... }
// 70+ endpoints as if/else chains...

// With Hono:
app.get('/api/users', (c) => c.json(users));
app.post('/api/users', (c) => { ... });
app.use('/api/*', corsMiddleware);
```

### Middleware Stack in This Project (`worker/app.ts`)

```
Request
  --> Secure Headers (CSP, X-Frame-Options)
  --> CORS (for /api/* routes)
  --> CSRF protection (double-submit cookie)
  --> Global config + rate limiting
  --> Authentication (owner-only by default)
  --> Route handlers
  --> 404 fallback: serve static assets
```

---

## 31. Why Workers AND Durable Objects

### The Core Problem: Workers Are Stateless

```
Request 1 --> Worker instance A --> processes --> dies (memory gone)
Request 2 --> Worker instance B --> processes --> no idea about Request 1
```

But VibeSdk needs to:
- Remember conversation history across many requests
- Track which files have been generated across 10+ LLM calls
- Maintain WebSocket connections for real-time streaming
- Store git history that persists
- Keep encryption keys in memory for the vault

### Durable Objects Solve This

```
Request 1 --> Worker --> routes to DO "session-abc" --> DO remembers state
Request 2 --> Worker --> routes to DO "session-abc" --> same state, same memory
Request 3 --> Worker --> routes to DO "session-abc" --> still there
```

### When to Use Which

| Task | Worker or DO? | Why? |
|---|---|---|
| Receive HTTP request, return JSON | **Worker** | Stateless, one-shot |
| Hold WebSocket open for 30 min | **DO** | Long-lived connection |
| Remember 50 files across 20 LLM calls | **DO** | Persistent state |
| Store git commits in SQLite | **DO** | Needs database |
| Serve a static HTML page | **Worker** | Stateless, fast |
| Track rate limit counters | **DO** | State persists across requests |

### How They Work Together

```
User request
  --> Worker (stateless): authenticates, validates, routes
  --> Durable Object (stateful): does the actual work, remembers everything
  --> Worker: returns response to user
```

---

## 32. What Each of the 5 DOs Does

### CodeGeneratorAgent (name: "CodeGenObject")

**One instance per chat session.** The brain of the system.

| What it stores | What it does |
|---|---|
| User's prompt and conversation | Orchestrates entire code generation |
| Generated files map | Calls LLMs (Gemini, Grok) to write code |
| Blueprint (architecture plan) | Manages state machine |
| Git history (SQLite) | Holds WebSocket connections |
| Phase progress | Runs tools (read, deploy, debug) |
| Sandbox instance ID | Coordinates with sandbox container |

### UserAppSandboxService (name: "Sandbox")

**One instance per sandbox container.** The container manager.

| What it does |
|---|
| Creates Cloudflare Container from Docker image |
| Uploads generated code files |
| Runs commands (`bun install`, `bun run dev`) |
| Returns preview URL |
| Runs static analysis (linter, type checker) |
| Fetches runtime errors and logs |
| Health-checks the container |

### DORateLimitStore

**One instance per rate limit bucket.** Simple request counter.

| What it does |
|---|
| Counts requests per time window |
| Returns allow/deny decisions |
| API: 10k/min, Auth: 1k/min |

### UserSecretsStore

**One instance per user.** Encrypted vault.

| What it stores | How |
|---|---|
| Encrypted API keys | XChaCha20-Poly1305 |
| Session keys (memory only) | Key hierarchy: MEK --> UMK --> DEK |

### GlobalDurableObject

**One singleton for the entire platform.**

| What it does |
|---|
| Stores global configuration |
| Platform-wide settings |
| Shared state across all users |

---

## 33. Rate Limiting

### Why Track Requests?

To prevent abuse:

| Attack | What Happens | Cost |
|---|---|---|
| Spam code generation | 1000 LLM calls in a minute | $$$ to Gemini/Grok APIs |
| Brute force login | 100k password attempts | Could crack accounts |
| API scraping | Bot scrapes all public apps | Database overloaded |
| DDoS | Flood of requests | Platform goes down |

### Three Rate Limit Backends

The system supports three different storage backends for rate limiting (`worker/services/rate-limit/config.ts`):

| Store | Backend | Used For |
|---|---|---|
| `RATE_LIMITER` | Cloudflare native `ratelimit` binding (wrangler.jsonc unsafe bindings) | API and Auth rate limits |
| `DURABLE_OBJECT` | DORateLimitStore Durable Object | App creation and LLM call limits |
| `KV` | VibecoderStore KV namespace | Optional alternative (configurable) |

### All 4 Rate Limit Types

From `RateLimitType` enum (`worker/services/rate-limit/config.ts:47-52`):

| Type | Store | Limits | Purpose |
|---|---|---|---|
| `API_RATE_LIMIT` | **Native ratelimit binding** (`API_RATE_LIMITER`) | 10,000 req / 60s | All `/api/*` endpoints |
| `AUTH_RATE_LIMIT` | **Native ratelimit binding** (`AUTH_RATE_LIMITER`) | 1,000 req / 60s | Login, register, OAuth |
| `APP_CREATION` | **DORateLimitStore** (Durable Object) | 50 per 4 hours, 50 per day | Prevents mass app creation |
| `LLM_CALLS` | **DORateLimitStore** (Durable Object) | 500 credits per 2 hours, 1,700 per day | Prevents LLM cost abuse. **Excludes BYOK users** (they pay for their own keys) |

### Configuration (from config.ts DEFAULT_RATE_LIMIT_SETTINGS)

```typescript
// Native Cloudflare bindings (wrangler.jsonc)
apiRateLimit:  { store: RATE_LIMITER, bindingName: 'API_RATE_LIMITER' }
authRateLimit: { store: RATE_LIMITER, bindingName: 'AUTH_RATE_LIMITER' }

// Durable Object backed
appCreation:   { store: DURABLE_OBJECT, limit: 50, period: 4h, dailyLimit: 50 }
llmCalls:      { store: DURABLE_OBJECT, limit: 500, period: 2h, dailyLimit: 1700, excludeBYOKUsers: true }
```

**Important distinction:** `API_RATE_LIMITER` and `AUTH_RATE_LIMITER` in wrangler.jsonc are NOT handled by the `DORateLimitStore` Durable Object. They use Cloudflare's built-in `ratelimit` binding type. The `DORateLimitStore` DO is only used for `APP_CREATION` and `LLM_CALLS`.

---

## 34. UserSecretsStore Deep Dive

### The Problem

Users want to use their own API keys (BYOK -- Bring Your Own Key). These keys need secure storage.

### When User API Keys Come Into Play

**Step 1: User stores a key**
```
User: Settings --> Vault --> "Add API Key"
  --> Enters: "OpenAI" + "sk-abc123..."
  --> Browser encrypts with vault password (client-side)
  --> Encrypted blob sent to DO via WebSocket
  --> DO stores encrypted blob in SQLite
  --> Raw key "sk-abc123..." NEVER reaches server
```

**Step 2: Code generation uses the key**
```
User starts generating code with OpenAI as provider
  --> Agent asks UserSecretsStore for the key
  --> DO decrypts using session key --> returns raw key temporarily
  --> Agent calls OpenAI API with that key
  --> Session key forgotten after timeout
```

### Encryption Architecture

```
User's browser                          Server (UserSecretsStore DO)
-----------------                       --------------------------

User enters vault password
  |
Derive VMK from password (PBKDF2)
  (Vault Master Key -- never sent)
  |
Generate random SK (Session Key)
  |
Encrypt VMK with SK:
  encryptedVMK = AES-GCM(SK, VMK)
  |
Send encryptedVMK + SK ------------>  Store in memory (NOT database)
                                        Session { encryptedVMK, SK }

User says "store my OpenAI key"
  |
Encrypt key with VMK:
  encryptedKey = XChaCha20(VMK, key)
  |
Send encryptedKey ----------------->  Store encryptedKey in SQLite
                                        (useless without VMK)

Later: Agent needs the key
                                      DO has SK in memory
                                      Decrypts VMK using SK
                                      Decrypts key using VMK
                                      Returns raw key (temp)

Session timeout
                                      SK deleted from memory
                                      VMK gone -- can't decrypt
                                      encryptedKey in DB = useless
```

### Threat Protection

| Threat | Protection |
|---|---|
| Database stolen | Keys are encrypted, attacker gets useless blobs |
| Server memory dumped | Only has encrypted VMK + SK |
| Session hijacked | Session expires on timeout, one per user |
| Multiple tabs | Only one active vault session allowed |

---

## 35. Frontend Architecture

### How the App Starts

```
Browser loads vibesnappy.appypie.com
  --> Worker serves dist/index.html (static asset from CDN)
  --> Browser loads JavaScript bundles
  --> src/main.tsx runs:
      1. initSentry() -- error tracking
      2. createBrowserRouter(routes) -- React Router
      3. Renders <RouterProvider> into #root
```

### Provider Hierarchy (App.tsx)

```
ErrorBoundary              -- catches React crashes
  ThemeProvider            -- dark/light mode
    MobileViewProvider     -- viewport detection
      FeatureProvider      -- platform capabilities
        AuthProvider       -- user auth state
          VaultProvider    -- encrypted secrets
            AuthModalProvider  -- global login modal
              AppLayout        -- sidebar + header
                <Outlet />     -- page content
              Toaster          -- toast notifications
```

### All Pages

| URL | Component | Auth? | What It Does |
|---|---|---|---|
| `/` | Home | No (until submit) | Landing page, prompt input |
| `/chat/:chatId` | Chat | No | Main code generation interface |
| `/profile` | Profile | Yes | User profile, stats |
| `/settings` | Settings | Yes | Model config, API keys, vault |
| `/apps` | AppsPage | Yes | User's apps list |
| `/app/:id` | AppView | No | View a single app |
| `/discover` | DiscoverPage | No | Browse public apps |

---

## 36. How Frontend Calls the Main Worker

Two communication channels:

### Channel 1: REST API (via `apiClient`)

`src/lib/api-client.ts` handles all HTTP calls:

```
Component calls apiClient.someMethod()
  --> ensureSessionToken()  -- anonymous users get UUID
  --> ensureCsrfToken()     -- fetches CSRF token if needed
  --> fetch() with:
      - credentials: 'include' (sends cookies)
      - X-CSRF-Token header
      - Content-Type: application/json
  --> Response handling:
      - 401? --> triggers auth modal
      - 403 CSRF? --> retries with fresh token
      - 429? --> throws RateLimitExceededError
      - Success? --> returns typed JSON
```

### Channel 2: WebSocket (via PartySocket)

Used for real-time streaming during code generation. Managed by `src/routes/chat/hooks/use-chat.ts`.

---

## 37. Full Code Generation Flow (Steps 1-12)

```
Step 1: User types "Build me a todo app" on Home page, hits Enter
  |
  v
Step 2: Home component navigates to /chat/new?q=Build+me+a+todo+app
  |
  v
Step 3: Chat component mounts, reads query from URL params
  |
  v
Step 4: POST /api/agent (REST call)
  |     Body: { query: "Build me a todo app", projectType: "app" }
  |     Worker:
  |       --> Validates query
  |       --> Rate limit check
  |       --> Generates agentId
  |       --> Creates CodeGeneratorAgent Durable Object
  |       --> DO: picks template, generates blueprint
  |       --> Returns NDJSON stream:
  |           { agentId: "abc-123" }
  |           { websocketUrl: "wss://vibesnappy.appypie.com/api/agent/abc-123/ws" }
  |           { behaviorType: "phasic" }
  |           { chunk: '{"projectName":"Todo App"...' }  <-- blueprint streaming
  |           { template: { files: [...] } }              <-- bootstrap files
  |
  v
Step 5: Frontend processes NDJSON stream
  |     - Shows "Blueprint is being generated..."
  |     - Renders blueprint progressively
  |     - Loads bootstrap template files
  |
  v
Step 6: Stream ends. Frontend connects WebSocket
  |     new WebSocket("wss://vibesnappy.appypie.com/api/agent/abc-123/ws")
  |     Worker: upgrades to WebSocket, routes to DO
  |
  v
Step 7: Frontend sends "generate_all"
  |     DO starts state machine: IDLE --> GENERATING --> IMPLEMENTING
  |
  v
Step 8: DO streams messages back over WebSocket
  |     { type: "phase_generating", data: { phase: 1, name: "Core UI" } }
  |     { type: "file_generating", data: { filePath: "src/App.tsx" } }
  |     { type: "file_chunk_generated", data: { chunk: "import React..." } }
  |     { type: "file_generated", data: { filePath: "src/App.tsx" } }
  |     ... more files ...
  |     { type: "deployment_completed", data: { previewUrl: "https://xyz..." } }
  |
  v
Step 9: Frontend processes each WebSocket message
  |     "file_generating"       --> add file with isGenerating=true
  |     "file_chunk_generated"  --> append chunk to file content
  |     "file_generated"        --> mark file complete
  |     "deployment_completed"  --> show preview iframe
  |
  v
Step 10: User sees live preview in iframe
  |      Can browse files, view code in Monaco editor
  |
  v
Step 11: User types "Add dark mode toggle"
  |      ws.send({ type: 'user_message', message: 'Add dark mode toggle' })
  |      DO --> UserConversationProcessor --> LLM decides changes
  |      --> Regenerates files --> Streams back --> Redeploys
  |
  v
Step 12: User clicks "Deploy"
         ws.send({ type: 'deploy' })
         DO --> deploys to Workers for Platforms
         --> permanent URL: https://{deploymentId}.vibesnappy.appypie.com
```

---

## 38. DNS Setup

### Domain Structure

`vibesnappy.appypie.com` is a subdomain of `appypie.com`, owned by Appy Pie LLP. The domain is managed on Cloudflare DNS (Enterprise plan).

### DNS Records

| Type | Name | Content | Purpose |
|---|---|---|---|
| **Worker** | `vibesnappy.appypie.com` | `vibesdk-production` | Main domain --> Worker |
| **CNAME** | `*.vibesnappy` | `vibesnappy.appypie.com` | Wildcard for subdomains |

### Request Routing

```
vibesnappy.appypie.com/api/agent     --> Worker --> Hono API
vibesnappy.appypie.com/              --> Worker --> serves React app
xyz.vibesnappy.appypie.com           --> CNAME --> same Worker
                                       --> Worker sees subdomain "xyz"
                                       --> routes to sandbox or deployed app
```

### Where to Find on Cloudflare Dashboard

```
dash.cloudflare.com
  --> appypie.com zone
  --> DNS --> Records
  --> Search "vibe"
  --> Two records: Worker + CNAME wildcard
```

---

## 39. Template System -- Complete Deep Dive

### What is a Template?

A template is a **starter project scaffold** -- a pre-built boilerplate. Instead of the AI writing `package.json`, `vite.config.ts`, etc. from scratch, it starts from a working template and only writes the custom code on top.

### The Templates Repository

Templates live in a **separate git repository** inside the `templates/` directory.

- It is **NOT committed** to the main vibesdk-new repo. The `templates` directory is listed in `.gitignore`.
- It has its own `.git` directory -- an independent repo.
- Developers clone it separately into the `templates/` directory for authoring/deploying templates.
- The `scripts/deploy.ts` `deployTemplates()` method auto-clones it from the `TEMPLATES_REPOSITORY` env var during deployment.
- At runtime, the worker reads templates from R2, not from the local filesystem.

### Three-Tier Dynamic Generation Architecture

Templates are NOT stored as complete projects. They are **dynamically generated** from shared base references + lightweight overlay configurations. This eliminates massive duplication across 10 templates.

```
Tier 1: Base References (reference/)
    3 clean, complete starter projects that form the foundation
         |
         v
Tier 2: Template Definitions (definitions/)
    10 YAML configs + overlay directories that customize the bases
         |
         v  [tools/generate_templates.py]
Tier 3: Generated Output (build/)
    10 final templates, ready for packaging and deployment
         |
         v  [create_zip.py + deploy_templates.sh]
    Distribution (zips/ --> Cloudflare R2)
```

**Key design benefit**: 6 Vite-based templates share one 148-file `vite-reference/` base. Bug fixes in the base propagate to all automatically. Overlay directories only contain files that differ from the base.

### Templates Directory Structure

```
templates/                              (separate git repo, gitignored in vibesdk-new)
|
|-- CLAUDE.md                           # AI instructions for working on templates (338 lines)
|-- AGENTS.md                           # Quick-reference cheat sheet for AI agents (31 lines)
|-- README.md                           # Human-readable documentation (8,279 bytes)
|-- DEPLOYMENT_SETUP.md                 # R2 + GitHub Actions setup guide (6,061 bytes)
|-- .gitignore                          # Excludes build/, node_modules, .env, .zip, etc.
|
|-- reference/                          # 3 base reference templates (Tier 1)
|   |-- vite-reference/                 # 148 files: React 18.3 + Vite 6.3 + shadcn/ui + Tailwind + Hono
|   |-- next-reference/                 # ~21 files: Next.js base (currently disabled)
|   |-- minimal-js-reference/           # ~15 files: Bare Hono server + static HTML
|
|-- definitions/                        # Template definitions and overlays (Tier 2)
|   |-- *.yaml                          # 10 YAML configuration files
|   |-- <template-name>/               # Overlay directories with customizations
|       |-- prompts/                    # selection.md + usage.md (REQUIRED)
|       |-- worker/                     # Worker code overrides
|       |-- src/                        # Frontend code overrides
|       |-- wrangler.jsonc              # Worker configuration override
|       |-- bun.lock                    # Dependency lock file
|       |-- .donttouch_files.json       # AI metadata (optional)
|       |-- .important_files.json       # AI metadata (optional)
|       |-- .redacted_files.json        # AI metadata (optional)
|
|-- build/                              # Generated output (Tier 3, gitignored)
|   |-- <template-name>/               # 10 complete runnable project scaffolds
|
|-- zips/                               # Packaged ZIPs for R2 upload
|   |-- <template-name>.zip            # 10 ZIP files (24KB-191KB each)
|
|-- tools/                              # Build and verification scripts
|   |-- generate_templates.py           # Core generation engine (1,043 lines, Python)
|   |-- template_schema.py              # Dataclass schema definitions (123 lines)
|   |-- extract_template_differences.py # Reverse-engineering tool for migrating originals (253 lines)
|
|-- generate_template_catalog.py        # Catalog generator from build/ (426 lines)
|-- create_zip.py                       # ZIP packaging utility (110 lines)
|-- deploy_templates.sh                 # End-to-end build + deploy pipeline (222 lines)
|-- template_catalog.json               # Published catalog with all template metadata (50,291 bytes)
|
|-- .github/workflows/
|   |-- deploy-templates.yml            # GitHub Actions: auto-deploy on push to main
```

### The 3 Base Reference Templates

#### 1. `reference/vite-reference/` (148 files) -- Primary Base

Used by 6 templates. A complete, production-ready Vite + React + Cloudflare Workers project.

**Tech stack**: React 18.3, TypeScript 5.8, Vite 6.3, Tailwind CSS 3.4, shadcn/ui (45+ components), Radix UI, Hono 4, Cloudflare Workers, Framer Motion, Lucide React, React Router 7, React Query 5, Recharts 2.15, Zod 4, Zustand 5

**Key files**:
- `package.json`: ~80 dependencies + ~25 devDependencies. Single source of truth for all Vite-based template deps.
- `vite.config.ts`: Custom Vite plugins for watch-dependencies, reload-trigger, Pino logging
- `wrangler.jsonc`: SPA routing (`not_found_handling: single-page-application`), `run_worker_first: ["/api/*"]`
- `worker/index.ts`: Hono server with CORS, error handling, `/api/client-errors` endpoint
- `worker/core-utils.ts`: **DO NOT MODIFY** -- `Env` interface, core DO utilities
- `worker/userRoutes.ts`: Template for user-defined API routes
- `src/main.tsx`: React Router setup with error boundaries, React Query provider
- `src/components/ui/`: 45 shadcn/ui components (accordion, alert-dialog, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip)
- `src/components/ErrorBoundary.tsx`, `RouteErrorBoundary.tsx`, `ErrorFallback.tsx`: Multi-layer error handling
- `src/hooks/use-mobile.tsx`, `use-theme.ts`
- `src/lib/errorReporter.ts`, `utils.ts`
- Config files: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.worker.json`, `eslint.config.js` (v9 flat config), `components.json` (shadcn), `tailwind.config.js`, `postcss.config.js`
- Metadata: `.important_files.json` (22 entries), `.donttouch_files.json` (12 entries), `.redacted_files.json` (7 patterns)

#### 2. `reference/minimal-js-reference/` (~15 files) -- Minimal Base

Used by 3 templates. Bare-bones Hono server for minimal/presentation templates.

**Tech stack**: Hono 4, TypeScript, Wrangler, Bun

**Key files**:
- `worker/index.ts`: Minimal Hono server with JSON structured logging
- `worker/logger.ts`: Structured JSON logger for platform log parsing
- `public/index.html`: Static HTML entry point
- `scripts/dev.ts`: Development server script
- `package.json`: Only `hono@^4` as production dep

#### 3. `reference/next-reference/` (~21 files) -- Next.js Base (Disabled)

Used by 1 template (c-code-next-runner, also disabled). Similar shadcn/ui component set as vite-reference but with Next.js Pages Router configuration.

### All 10 Template Definitions -- Deep Dive

There are exactly **10 YAML definitions**. 7 are active, 3 are disabled.

#### Template 1: `c-code-react-runner` (ENABLED)

**YAML** (`definitions/c-code-react-runner.yaml`, 8 lines):
```yaml
name: "c-code-react-runner"
description: "React/Vite application with Cloudflare Workers integration"
base_reference: "vite-reference"
projectType: app
package_patches:
  name: "c-code-react-runner"
```

**What it does**: The simplest template. Just renames the package. Uses vite-reference almost as-is with zero additional dependencies.

**Overlay files** (3 files): `prompts/selection.md`, `prompts/usage.md`, `bun.lock`

**Use case**: Static React SPAs, dashboards, simple fast Vite projects. No DO, no KV, no persistent backend. The default "full" web template.

**Critical constraint**: MUST use `createBrowserRouter` (NOT `BrowserRouter` or `HashRouter`) for error boundaries to work correctly.

#### Template 2: `vite-cfagents-runner` (ENABLED)

**YAML** (`definitions/vite-cfagents-runner.yaml`, 15 lines):
```yaml
name: "vite-cfagents-runner"
description: "Vite/React application with Cloudflare Agents SDK and MCP support"
base_reference: "vite-reference"
projectType: app
package_patches:
  name: "vite-cfagents-runner"
  dependencies:
    "@modelcontextprotocol/sdk": "^1.16.0"
    "@modelcontextprotocol/server-filesystem": "^2025.7.1"
    "agents": "^0.0.109"
    "mcp-client": "^1.4.0"
    "mcp-remote": "^0.1.18"
    "openai": "^5.10.1"
```

**What it does**: Adds 6 AI/agent dependencies on top of the full vite-reference. Inherits all 80+ base dependencies. The most AI-capable template.

**Overlay files** (15 files):
- `worker/agent.ts`: Cloudflare Agents SDK agent definition
- `worker/chat.ts`: Chat handling logic
- `worker/config.ts`: AI model configuration (GPT-4o, Gemini, Claude)
- `worker/tools.ts`: MCP tool definitions
- `worker/types.ts`: Agent-specific types
- `worker/utils.ts`: Agent utilities
- `worker/mcp-client.ts`: MCP client setup
- `worker/app-controller.ts`: Application controller Durable Object
- `worker/core-utils.ts`: Overridden core utils for agent bindings (CHAT_AGENT, APP_CONTROLLER)
- `worker/index.ts`: Overridden worker entry with agent routes
- `worker/userRoutes.ts`: User-defined routes
- `src/components/TemplateDemo.tsx`: Chat UI component
- `src/lib/chat.ts`: Frontend chat utilities
- `wrangler.jsonc`: Agent-specific bindings (CHAT_AGENT DO, APP_CONTROLLER DO)

**Use case**: AI chatbot applications with multi-model support, MCP tool integration, real-time streaming, persistent conversation state via Durable Objects. Note: limited API request quota across all user apps.

#### Template 3: `vite-cf-DO-runner` (ENABLED)

**YAML** (`definitions/vite-cf-DO-runner.yaml`, 7 lines):
```yaml
name: "vite-cf-DO-runner"
description: "Vite/React application with Cloudflare Durable Objects"
base_reference: "vite-reference"
projectType: app
package_patches:
  name: "vite-cf-do-runner"
```

**What it does**: Minimal YAML -- just renames the package. All customization is in overlay files.

**Overlay files** (11 files):
- `worker/core-utils.ts`: Single GlobalDurableObject with direct access pattern
- `worker/durableObject.ts`: DO class definition
- `worker/types.ts`: DO-specific types
- `worker/userRoutes.ts`: User routes with DO access
- `shared/types.ts`, `shared/mock-data.ts`: Shared type definitions and mock data
- `src/components/TemplateDemo.tsx`: Demo component
- `wrangler.jsonc`: DO bindings

**Use case**: Single Durable Object for stateful apps with direct DO method calls. Full DO feature access (alarms, WebSocket handlers, etc.). Example: real-time collaborative app, stateful counter.

#### Template 4: `vite-cf-DO-KV-runner` (ENABLED)

**YAML** (`definitions/vite-cf-DO-KV-runner.yaml`, 9 lines):
```yaml
name: "vite-cf-DO-KV-runner"
description: "Vite/React application with Cloudflare Durable Objects and KV storage"
base_reference: "vite-reference"
projectType: app
package_patches:
  name: "vite-cf-do-kv-runner"
```

**Overlay files** (11 files): Similar to DO-runner but with KV storage integration alongside DOs. Includes `shared/seed-utils.ts` for KV seeding.

**Use case**: Workers + React with both DO and KV storage. **Deprecated** -- prefer DO-v2-runner or DO-runner instead.

#### Template 5: `vite-cf-DO-v2-runner` (ENABLED)

**YAML** (`definitions/vite-cf-DO-v2-runner.yaml`, 19 lines):
```yaml
name: "vite-cf-DO-v2-runner"
description: "Vite/React application with Cloudflare Durable Objects v2"
base_reference: "vite-reference"
projectType: app
package_patches:
  name: "vite-cf-do-v2-runner"
  dependencies:
    "cloudflare": "^5.0.0"
excludes:
  - "worker/userRoutes.ts"
file_patches:
  - file: "worker/index.ts"
    replacements:
      - find: "const USER_ROUTES_MODULE = './userRoutes';"
        replace: "const USER_ROUTES_MODULE = './user-routes';"
```

**What it does**: The most sophisticated Vite DO template. Adds `cloudflare` SDK, removes base `userRoutes.ts` (replaces with `user-routes.ts` in kebab-case), and patches the import path in `worker/index.ts` via `file_patches`. This is the **only template using file_patches**.

**Overlay files** (11 files):
- `worker/core-utils.ts`: GlobalDurableObject with multi-entity SQLite storage, IndexedEntity utilities. Includes automatic JSON error logging (console.error -> structured JSON logs).
- `worker/entities.ts`: Entity definitions for the multi-entity pattern
- `worker/user-routes.ts`: Renamed user routes (kebab-case)
- `shared/types.ts`, `shared/mock-data.ts`: Shared types and mock data
- `src/components/TemplateDemo.tsx`: Demo component
- `src/lib/api-client.ts`: API client for DO endpoints
- `wrangler.jsonc`: DO bindings

**Use case**: Multi-entity persistent storage (chats, ecommerce, dashboards) with a single SQLite-backed Durable Object. Cost-effective -- one DO class handles multiple entity types via IndexedEntity utilities.

**Critical constraints**: Cannot modify `wrangler.jsonc` or `worker/core-utils.ts`. No SSR or direct DO access -- DO is storage-only via API layer.

#### Template 6: `reveal-presentation-pro` (ENABLED)

**YAML** (`definitions/reveal-presentation-pro.yaml`, 31 lines):
```yaml
name: "reveal-presentation-pro"
description: "Advanced Reveal.js presentation template with glass morphism design, runtime JSX compilation, and comprehensive slide components"
base_reference: "minimal-js-reference"
projectType: presentation
renderMode: browser
slideDirectory: "public/slides"
package_patches:
  name: "reveal-presentation-pro"
  scripts:
    lint:fix: "eslint --cache --fix ."
    format: "prettier --write \"**/*.{js,jsx,json,md,css}\""
    format:check: "prettier --check \"**/*.{js,jsx,json,md,css}\""
  devDependencies:
    eslint-plugin-import: "^2"
    eslint-plugin-react-hooks: "^5"
    eslint-plugin-react-refresh: "^0.4"
    prettier: "^3"
    wrangler: "^4.47.0"
template_specific_files:
  - .editorconfig
  - .prettierrc
  - wrangler.jsonc
  - eslint.config.js
  - prompts/
  - public/
  - .donttouch_files.json
  - .important_files.json
  - .redacted_files.json
```

**What it does**: Transforms minimal-js-reference into an advanced Reveal.js presentation system. Adds dev deps for ESLint, Prettier, Wrangler. Uses `template_specific_files` to copy exactly 9 overlay items. `slideDirectory` tells the platform where JSON slide files live.

**Overlay files** (~40 files):
- `public/_dev/`: Runtime JSX compiler, slide renderer (SlideRenderer.jsx), App.jsx, Presentation.jsx, streaming utilities (streamingBuffer.js, streamingJsonParser.js), background renderers (MeshGradient.jsx, ParticleBackground.jsx, SlideBackground.jsx), component registry, editor overlay, useReveal hook, compiler with cache/memory-manager/dependency-graph/import-scanner
- `public/slides/`: 6 demo JSON slides (demo-slide01.json through demo-slide06.json) + `manifest.json` controlling slide order
- `public/slides-library.jsx`: Component library with 13 slide templates + 9 UI components
- `public/slides-styles.css`: Glass morphism styles, gradient effects, ambient glow, CSS classes (glass, glass-panel, glass-blue, etc.)
- `schema.ts`: JSON slide schema definition

**Architecture**: Slides are **pure JSON** files describing element trees (NOT JSX). A runtime compiler in `public/_dev/` processes them. Supports:
- Live streaming (slides appear in real-time as AI generates them)
- Step-by-step reveals (fragments)
- Recharts charts embedded in slides
- 35 Lucide icons available as `type: "svg"` elements
- CSS classes: glass, glass-panel, glass-blue for glass morphism effects

**Critical constraints**:
- Valid JSON only (no comments, no trailing commas)
- Must update `manifest.json` after creating/removing slides
- NEVER modify `public/_dev/`, `index.html`
- NEVER create `.jsx` or `.tsx` files
- Use `type: "svg"` with `icon: "IconName"` for Lucide icons

#### Template 7: `minimal-js` (ENABLED)

**YAML** (`definitions/minimal-js.yaml`, 23 lines):
```yaml
name: "minimal-js"
description: "Beautiful vanilla HTML, CSS, and JavaScript template with modern UI design"
base_reference: "minimal-js-reference"
projectType: app
renderMode: browser
package_patches:
  name: "minimal-js"
excludes:
  - "worker/**"
  - "scripts/**"
  - "eslint.config.js"
  - "tsconfig.json"
  - ".eslintcache"
  - ".donttouch_files.json"
  - ".important_files.json"
  - ".redacted_files.json"
template_specific_files:
  - wrangler.jsonc
  - prompts/
```

**What it does**: Strips the minimal-js-reference down to its absolute minimum. Removes ALL worker code, scripts, TypeScript config, ESLint, and metadata files. Only copies `wrangler.jsonc` and `prompts/` from overlay. `renderMode: browser` tells the platform this renders in-browser without a sandbox.

**Overlay files** (4 files): `wrangler.jsonc`, `prompts/selection.md`, `prompts/usage.md`, `bun.lock`

**Use case**: Pure vanilla HTML/CSS/JS with Tailwind CDN, Lucide icons CDN, Google Fonts (Inter). Glass morphism cards, gradient text, ambient glow, staggered animations, scroll reveal, smooth scrolling, sticky header. Zero frameworks, zero build step.

**Critical constraint**: Always use Tailwind CSS via CDN script tag only. Never use Tailwind CLI, PostCSS, or any build-time Tailwind configuration.

#### Template 8: `reveal-presentation-dev` (DISABLED)

**YAML**: Nearly identical to reveal-presentation-pro but with `disabled: true`.

**Key difference from pro**: Uses **JSX slide files** instead of JSON. Slides are `.jsx` files in `public/slides/` (Slide01.jsx through Slide11.jsx). Has a `public/theme-config.js` for theming and `public/lib/chartTheme.jsx` for chart configuration.

**Why disabled**: The pro version (JSON-based) is preferred for AI generation because JSON is easier to generate, validate, and stream than JSX.

#### Template 9: `minimal-vite` (DISABLED)

**YAML** (`definitions/minimal-vite.yaml`, 56 lines):
```yaml
name: "minimal-vite"
base_reference: "vite-reference"
projectType: app
disabled: true
inherit_dependencies: false
```

**What it does**: Starts with EMPTY dependencies (`inherit_dependencies: false`), adds only 11 production deps + 15 dev deps (bare essentials: React, Hono, Tailwind, TypeScript, Vite, ESLint). Aggressively strips vite-reference via `excludes`: removes `src/components/**`, `src/pages/**`, `src/assets/**`, `src/hooks/**`, `src/lib/**`, `src/App.css`, `worker/userRoutes.ts`, `worker/core-utils.ts`, `components.json`, `public/vite.svg`.

**Why disabled**: Too minimal -- selection.md says "DO NOT SELECT THIS TEMPLATE unless explicitly requested." Use full vite-reference templates instead.

#### Template 10: `c-code-next-runner` (DISABLED)

**YAML** (`definitions/c-code-next-runner.yaml`, 100 lines):
```yaml
name: "c-code-next-runner"
base_reference: "next-reference"
projectType: app
disabled: true
inherit_dependencies: false
```

**What it does**: The most complex YAML definition. Starts with EMPTY dependencies and specifies 57 production deps + 14 dev deps from scratch:
- Next.js 15.5.2, React 18.3.1
- Full Radix UI suite (20+ components)
- State management (Zustand, Immer, React Query, SWR)
- Forms (React Hook Form, Zod)
- UI (Framer Motion, Lucide, Recharts, embla-carousel, sonner, vaul, cmdk)
- Auth (next-auth), Drag-and-drop (@dnd-kit)
- OpenNext for Cloudflare deployment (`@opennextjs/cloudflare`)

**Overlay files** (~34 files): Complete Next.js Pages Router application with `src/pages/`, `src/components/`, `src/lib/`, `src/styles/`, `public/` assets, plus config files.

**Why disabled**: OpenNext deployment not stable enough for production use.

### Template Summary Table

| # | Template | Base | Type | Status | ZIP Size | Key Differentiator |
|---|----------|------|------|--------|----------|--------------------|
| 1 | `c-code-react-runner` | vite-reference | app | Enabled | 153 KB | General-purpose React SPA, no backend persistence |
| 2 | `vite-cfagents-runner` | vite-reference | app | Enabled | 187 KB | AI chatbot with Agents SDK + MCP + multi-model |
| 3 | `vite-cf-DO-runner` | vite-reference | app | Enabled | 157 KB | Single DO with direct access, full DO features |
| 4 | `vite-cf-DO-KV-runner` | vite-reference | app | Enabled | 157 KB | DO + KV storage (deprecated, prefer DO-v2) |
| 5 | `vite-cf-DO-v2-runner` | vite-reference | app | Enabled | 165 KB | Multi-entity SQLite DO, cost-effective persistence |
| 6 | `reveal-presentation-pro` | minimal-js-reference | presentation | Enabled | 83 KB | JSON-defined Reveal.js slides, live streaming |
| 7 | `minimal-js` | minimal-js-reference | app | Enabled | 24 KB | Vanilla HTML/CSS/JS, no frameworks, Tailwind CDN |
| 8 | `reveal-presentation-dev` | minimal-js-reference | presentation | Disabled | 76 KB | JSX slides (superseded by JSON pro version) |
| 9 | `minimal-vite` | vite-reference | app | Disabled | 65 KB | Too minimal for AI to work with |
| 10 | `c-code-next-runner` | next-reference | app | Disabled | 182 KB | Next.js + OpenNext (not production-ready) |

### Synthetic/In-Memory Templates (Not in templates/ directory)

3 additional templates are created **entirely in code** at runtime, with no YAML definition or ZIP:

**File:** `worker/agents/utils/templates.ts`

| Template | Function | renderMode | Description |
|----------|----------|------------|-------------|
| `scratch` | `createScratchTemplateDetails()` | (default browser) | Generic from-scratch web app. React + Hono + D1 database scaffolding. Used when user selects "general" mode. |
| `expo-scratch` | `createExpoScratchTemplateDetails()` | `mobile` | React Native / Expo frontend-only mobile app. Includes `app/_layout.tsx`, `app/index.tsx`, `metro.config.js`, `_expo-proxy.cjs`. |
| `expo-fullstack` | `createExpoFullstackTemplateDetails()` | `mobile-fullstack` | Expo + Hono backend with D1 database. Adds `api/src/index.ts` (Hono routes), `api/src/db/schema.sql`, `lib/api-client.ts`. |

**Selection logic** (`worker/agents/index.ts`):
- Keywords like `mobile app`, `ios app`, `android app`, `react native`, `expo` trigger mobile templates
- If the query also mentions `database`, `api`, `backend`, `auth`, `crud`, `full-stack` --> `expo-fullstack`
- Otherwise --> `expo-scratch`

### YAML Configuration Schema -- Complete Reference

```yaml
name: "template-name"                     # REQUIRED - Template identifier
description: "Short description"          # REQUIRED - For catalog
base_reference: "vite-reference"          # REQUIRED - vite-reference | next-reference | minimal-js-reference
projectType: app                          # REQUIRED - app | presentation | workflow
disabled: false                           # Optional - true = built but hidden from users (default: false)
renderMode: browser                       # Optional - browser | sandbox (default: omitted)
slideDirectory: "public/slides"           # Optional - for presentation templates only
inherit_dependencies: true                # Optional - false = start with empty deps (default: true)

package_patches:                          # Optional - Deep merge into base reference's package.json
  name: "template-name"                   # null values DELETE keys from base
  dependencies:
    "some-package": "^1.0.0"
    "unwanted-package": null              # Removes this dep from base
  devDependencies:
    "dev-tool": "^2.0.0"
  scripts:
    custom-script: "echo hello"

excludes:                                 # Optional - Glob patterns to remove from final output
  - "src/pages/**"
  - "worker/unused.ts"

template_specific_files:                  # Optional - only copy THESE overlay files (default: copy all)
  - "src/App.tsx"
  - "wrangler.jsonc"
  - "prompts/"

file_patches:                             # Optional - String/regex find/replace in generated files
  - file: "worker/index.ts"
    replacements:                         # Exact string replacements
      - find: "old string"
        replace: "new string"
    regex_replacements:                   # Regex replacements (supports i/m/s flags)
      - pattern: "pattern"
        replace: "replacement"
        flags: "i"
```

### Dependency Management Strategies

| Strategy | How It Works | Used By |
|----------|-------------|---------|
| **Full inheritance + patches** (default) | Copies all ~80 base deps, applies patches on top | c-code-react-runner, vite-cf-DO-*, vite-cfagents-runner |
| **Empty start + full specification** | `inherit_dependencies: false`, specifies all deps from scratch | c-code-next-runner (57 deps), minimal-vite (11 deps) |
| **Rename only** | Inherits everything, only changes `name` field | vite-cf-DO-runner, vite-cf-DO-KV-runner |

**Critical rule**: NEVER create `definitions/<template>/package.json`. Always use `package_patches` in the YAML file. The overlay `package.json` is explicitly excluded during generation.

### Template Generation Pipeline -- Deep Dive

Templates are **NOT generated at runtime**. They are generated offline by a Python script, then deployed as static ZIPs to R2.

**Script:** `templates/tools/generate_templates.py` (class `TemplateGenerator`, 1,043 lines)

**Command:** `python3 tools/generate_templates.py --clean`

**The 5-step pipeline** (method `generate_template_from_yaml()`, line 425):

```
Step 1: Copy base reference
   reference/vite-reference/  -->  build/c-code-react-runner/
   Uses copytree_with_ignores(): skips .git, node_modules, dist, .wrangler,
   coverage, .nyc_output, all lockfiles (bun.lock, pnpm-lock, yarn.lock,
   package-lock), .DS_Store, .eslintcache, next-env.d.ts

Step 2: Build package.json (BEFORE overlays)
   Reads base reference's package.json
   If inherit_dependencies: true  --> starts with full reference package.json
   If inherit_dependencies: false --> starts with minimal (name, private, version, type, scripts, empty deps)
   Deep-merges package_patches from YAML (null values DELETE keys)
   Writes with tab indentation + trailing newline

Step 3: Apply overlay files (AFTER package.json)
   Copies files from definitions/<name>/ on top of the base
   Overwrites any colliding files from the base
   If template_specific_files is set, ONLY those files are copied
   package.json is ALWAYS excluded (handled in step 2)
   Skips: .DS_Store, .eslintcache, .template-definition.json, *.yaml files

Step 4: Apply excludes
   Walks target directory, deletes files matching glob patterns from YAML excludes
   Cleans up empty directories afterwards

Step 5: Apply file patches
   String find/replace and regex substitutions in specific generated files
   Validates that find patterns actually exist in the file (fails if not found)
   Currently only vite-cf-DO-v2-runner uses this
```

**Deep merge algorithm** (`_deep_merge_with_null()`): Recursive merge where:
- `null` values in the patch DELETE the key from base
- Nested dicts are merged recursively
- All other values overwrite the base

**CLI flags**:
- `--clean / -c`: Delete and recreate `build/` before generation
- `--template / -t <name>`: Generate only one specific template
- `--verify / -V`: Compare generated output against `originals/` directory + run Bun checks
- `--diffs / -d`: Show unified diffs for modified files during verification
- `--summary-only / -s`: Only print summary (no per-file lists)
- `--ignore / -i <pattern>`: Additional ignore patterns for verification
- `--no-bun`: Skip `bun install` / `bun run lint` / `bun run build` viability checks
- `--sync-lockfiles`: Run `bun install --ignore-scripts` per template, copy `bun.lock` back to `definitions/<template>/`, then delete `node_modules` from build
- `--lockfile-jobs <n>`: Parallelism for lockfile sync (default: 4, uses `ThreadPoolExecutor`)

**Verification system**: The `originals/` directory contains ground-truth templates. `--verify` compares generated vs original using:
- Sorted file listings (added/removed/common)
- MD5 checksums with EOL normalization (CRLF -> LF, trailing newline ignored)
- Text files compared via `_md5_text_normalized()`, binary files via raw `_md5()`
- Optional unified diffs for modified files

### Template Catalog (`template_catalog.json`)

**Generated by**: `generate_template_catalog.py` (426 lines) scanning the `build/` directory.

**Template validation** (`is_valid_template()`): A directory is valid only if ALL of:
- Has `wrangler.jsonc` OR `wrangler.toml`
- Has `package.json`
- Has `prompts/` directory with both `selection.md` and `usage.md`

**Framework detection** (`extract_frameworks()`): Scans `package.json` dependencies against 190+ patterns covering: frontend frameworks, backend frameworks, build tools, Cloudflare services, UI libraries, state management, form handling, routing, auth, database/ORM, GraphQL, tRPC, AI/ML, real-time, data viz, maps, utilities, testing, security, email, storage, deployment, monitoring, and more.

**Output per template**:
```json
{
  "name": "c-code-react-runner",
  "language": "typescript",
  "frameworks": ["react", "vite", "hono", "tailwind", ...],
  "projectType": "app",
  "disabled": false,
  "description": {
    "selection": "...contents of prompts/selection.md...",
    "usage": "...contents of prompts/usage.md..."
  },
  "renderMode": "browser",
  "slideDirectory": "public/slides"
}
```

Disabled templates are **filtered out** from the catalog output. Only 7 active templates appear in the published catalog.

**Purpose at runtime**: The worker reads this from R2 to list available templates. The AI template selector reads `description.selection` to decide which template fits the user's request. The code generation agent reads `description.usage` as system instructions.

### Deployment Pipeline (`deploy_templates.sh`, 222 lines)

**Full end-to-end pipeline**:

```
1. Check/install PyYAML dependency
         |
2. python3 tools/generate_templates.py --clean --sync-lockfiles
   --> Generates all 10 templates into build/
   --> Syncs bun.lock back to definitions/ (parallel, 4 workers)
         |
3. python3 generate_template_catalog.py --output template_catalog.json --pretty
   --> Scans build/, validates, extracts metadata
   --> Outputs JSON catalog (50KB, 7 active templates)
         |
4. For each valid template in build/:
     python3 create_zip.py build/<name> zips/<name>.zip
   --> Parallel ZIP creation (bash background processes with PID tracking)
   --> ZIP_DEFLATED compresslevel=9
   --> Excludes: node_modules, .git, dist, .wrangler, .env.*, .dev.vars*
         |
5. wrangler r2 object put <bucket>/template_catalog.json --file=template_catalog.json
   wrangler r2 object put <bucket>/<name>.zip --file=zips/<name>.zip  (for each template)
   --> Parallel uploads to Cloudflare R2 (or sequential with LOCAL_R2=true)
         |
6. GitHub Actions Summary (if running in CI)
   --> Markdown summary with template names, sizes, R2 access URLs
```

**Two deployment modes**:
- `LOCAL_R2=true bash deploy_templates.sh`: Sequential uploads to local R2 (development)
- `bash deploy_templates.sh`: Parallel uploads to remote Cloudflare R2 (production)

**CI/CD** (`.github/workflows/deploy-templates.yml`): Triggered on push to `main` or manual dispatch. Uses Python 3.11 + Node.js 20, installs PyYAML + Wrangler, runs `deploy_templates.sh` with Cloudflare secrets.

### AI Metadata Files (.donttouch, .important, .redacted)

These files exist in **three layers**:

1. **Base references** (source of truth): `reference/vite-reference/.donttouch_files.json` etc.
2. **Definition overlays** (override if needed): `definitions/reveal-presentation-pro/.donttouch_files.json` etc.
3. **Build output** (merged result, shipped in ZIP): `build/<every-template>/.donttouch_files.json` etc.

**What each file does:**

| File | Purpose | Example Contents |
|------|---------|-----------------|
| `.donttouch_files.json` | Files the AI agent must **NEVER modify** during code generation | `wrangler.jsonc`, `worker/index.ts`, `vite.config.ts`, `package.json`, `ErrorBoundary.tsx` |
| `.important_files.json` | Files the AI should **be aware of and preserve** (can read, should not delete) | `tsconfig.json`, `src/main.tsx`, `src/components/ui/`, `worker/`, `src/pages/` |
| `.redacted_files.json` | Files **hidden from the AI's context** entirely (saves tokens, avoids confusion) | `.donttouch_files.json` itself, `errorReporter.ts`, `ErrorBoundary.tsx` |

Consumed by `BaseSandboxService.getTemplateDetails()` which extracts them from the ZIP and includes them in the `TemplateDetails` response sent to the agent.

### Template Selection Flow at Runtime

**Orchestration:** `worker/agents/index.ts` --> `getTemplateForQuery()`

```
User: "Build me a todo app"
         |
         v
1. Check for "general" mode --> use scratch template (synthetic)
         |
2. Check for mobile keywords (mobile app, ios, expo, react native) --> expo templates (synthetic)
         |
3. Fetch templates via BaseSandboxService.listTemplates() (from R2 catalog)
         |
4. predictProjectType() -- AI predicts: app | workflow | presentation | general
         |
5. Filter templates by project type, exclude disabled/minimal
         |
6. selectTemplate() -- AI evaluates user requirements against filtered templates
   Uses TemplateSelectionSchema (worker/agents/schemas.ts):
     - selectedTemplateName: string | null
     - reasoning: string
     - useCase: SaaS | Dashboard | Blog | Portfolio | E-Commerce | General | Other
     - complexity: simple | moderate | complex
     - styleSelection: Minimalist | Brutalism | Retro | Illustrative | Kid_Playful | Custom
     - projectType: app | workflow | presentation | general
         |
7. Fetch full details via BaseSandboxService.getTemplateDetails()
   Downloads ZIP from R2, extracts in-memory, returns TemplateDetails
         |
8. agent.importTemplate(templateName) loads files into project
   customizeTemplateFiles() updates package.json name, wrangler.jsonc, generates .bootstrap.js
```

### Template State in Agent

Template info lives in the Durable Object state (`worker/agents/core/state.ts`):

```typescript
interface BaseProjectState {
    templateName: string | 'custom';
    templateInitCommand?: string;
    templateRenderMode?: 'sandbox' | 'browser' | 'mobile' | 'mobile-fullstack';
    projectType: ProjectType;
}
```

Template name is NOT persisted in D1 -- it only lives in the agent state and the generated files.

### Render Modes

| renderMode | What | Templates |
|---|---|---|
| `browser` | Web app in browser iframe | c-code-react-runner, vite-cfagents-runner, vite-cf-DO-*, minimal-js, reveal-presentation-pro |
| `sandbox` | Server-side rendering | (rare) |
| `mobile` | React Native / Expo frontend only | expo-scratch (synthetic) |
| `mobile-fullstack` | Expo + Hono backend | expo-fullstack (synthetic) |

### Git Integration

`worker/agents/git/git-clone-service.ts` handles the "rebase on template" pattern:
1. Creates a base commit with template files
2. Imports exported git objects from the agent
3. Replays agent commits on top of the template base
4. Result: clone-able git repo where template is the foundation and all AI-generated changes are committed on top

### Behavior Differences

- **Phasic behavior** (`worker/agents/core/behaviors/phasic.ts`) -- **requires** templateInfo, throws if missing
- **Agentic behavior** (`worker/agents/core/behaviors/agentic.ts`) -- templateInfo is **optional**, falls back to scratch

### Non-Negotiable Rules for Templates

1. **NEVER edit `build/` directly** -- changes lost on regeneration. Edit `reference/` or `definitions/` instead.
2. **NEVER modify `worker/core-utils.ts`** -- marked DO NOT MODIFY, breaks Durable Object functionality.
3. **NEVER create `definitions/<template>/package.json`** -- always use `package_patches` in YAML.
4. **ALWAYS verify after changes**: `python3 tools/generate_templates.py -t <name> --verify --diffs`
5. **ALWAYS regenerate** affected templates after modifying base references or overlays.
6. TypeScript: No `any` types, static imports only, strict DRY.
7. React Router: Use `createBrowserRouter` (NOT `BrowserRouter` or `HashRouter`).
8. Tailwind in minimal-js: CDN script tag only (never CLI/PostCSS).
9. Reveal presentation slides: Valid JSON only (no comments, no trailing commas), update `manifest.json` after adding/removing slides.

### Coverage Gaps (Not Covered by Templates)

- **Next.js / SSR** -- c-code-next-runner exists but is disabled (OpenNext not stable enough)
- **Vue, Svelte, Angular** -- no templates
- **E-commerce, Blog/CMS** -- no specialized templates (AI builds on generic react runner)
- **API-only / backend-only** -- every template includes a frontend
- **Python / non-JS** -- everything is JavaScript/TypeScript
- **Static site generators** (Astro, 11ty) -- not supported
- **Games / Canvas / WebGL** -- no specialized template

### How to Create a New Template

**Path A: File-based template (like the existing 10)**

1. Create YAML definition: `templates/definitions/my-template.yaml`
2. Create overlay directory: `templates/definitions/my-template/` with at minimum `prompts/selection.md` and `prompts/usage.md`
3. Generate: `cd templates && python3 tools/generate_templates.py -t my-template`
4. Test: `cd build/my-template && bun install && bun run lint && bun run build`
5. Verify: `python3 tools/generate_templates.py -t my-template --verify --diffs`
6. Package: `python3 create_zip.py build/my-template zips/my-template.zip`
7. Deploy: `bash deploy_templates.sh`

**Path B: Synthetic/in-memory template (like expo-scratch)**

1. Add a function in `worker/agents/utils/templates.ts` following the `createScratchTemplateDetails()` pattern
2. Wire it into `worker/agents/index.ts` `getTemplateForQuery()` for selection logic
3. Wire it into `worker/agents/core/behaviors/base.ts` `getTemplateDetails()` for lazy loading

### Key File Reference for Templates

| Component | File Path | Purpose |
|---|---|---|
| **Templates Repo** | | |
| AI instructions | `templates/CLAUDE.md` | 338-line guidance for AI agents in the templates repo |
| Quick reference | `templates/AGENTS.md` | 31-line cheat sheet for AI agents |
| Generation engine | `templates/tools/generate_templates.py` | TemplateGenerator class (1,043 lines) |
| Schema definitions | `templates/tools/template_schema.py` | Dataclass definitions (123 lines) |
| Difference extractor | `templates/tools/extract_template_differences.py` | Migration tool (253 lines) |
| Catalog generator | `templates/generate_template_catalog.py` | Scans build/, outputs JSON catalog (426 lines) |
| ZIP packager | `templates/create_zip.py` | Creates optimized ZIPs (110 lines) |
| Deploy pipeline | `templates/deploy_templates.sh` | End-to-end build + upload (222 lines) |
| CI/CD workflow | `templates/.github/workflows/deploy-templates.yml` | Auto-deploy on push to main |
| Published catalog | `templates/template_catalog.json` | Machine-readable metadata (50KB, 7 templates) |
| **Main Project** | | |
| Template state | `worker/agents/core/state.ts` | templateName, templateInitCommand, templateRenderMode |
| Selection schema | `worker/agents/schemas.ts` | TemplateSelectionSchema, TemplateSelection |
| AI selection logic | `worker/agents/planning/templateSelector.ts` | selectTemplate(), predictProjectType() |
| Orchestration | `worker/agents/index.ts` | getTemplateForQuery() |
| Sandbox service | `worker/services/sandbox/BaseSandboxService.ts` | listTemplates(), getTemplateDetails() |
| Type definitions | `worker/services/sandbox/sandboxTypes.ts` | TemplateInfoSchema, TemplateDetailsSchema |
| Base behavior | `worker/agents/core/behaviors/base.ts` | ensureTemplateDetails(), importTemplate() |
| Template customizer | `worker/agents/utils/templateCustomizer.ts` | customizeTemplateFiles() |
| Synthetic templates | `worker/agents/utils/templates.ts` | createScratchTemplateDetails(), createExpoScratchTemplateDetails(), createExpoFullstackTemplateDetails() |
| LLM tool | `worker/agents/tools/toolkit/init-suitable-template.ts` | init_suitable_template tool |
| Git clone/rebase | `worker/agents/git/git-clone-service.ts` | buildRepository() |
| Deploy integration | `scripts/deploy.ts` | deployTemplates() -- clones repo + runs deploy script |

---

## 40. How to See D1 Data

### 1. Cloudflare Dashboard

```
dash.cloudflare.com --> Workers & Pages --> D1 --> vibesdk-db --> Console
```

Run queries:
```sql
SELECT * FROM users LIMIT 10;
SELECT * FROM apps ORDER BY created_at DESC LIMIT 10;
```

### 2. Drizzle Studio (locally)

```bash
bun run db:studio
```

### 3. Wrangler CLI

```bash
npx wrangler d1 execute vibesdk-db --remote --command "SELECT id, title FROM apps LIMIT 5"
```

---

## 41. Where User-Generated Code is Stored

**NOT in D1.** D1 only stores metadata.

```
D1 (vibesdk-db)                     Durable Object SQLite
-------------------                  ----------------------
apps table:                          CodeGeneratorAgent:
  id: "abc-123"                        generatedFilesMap: {
  title: "Todo App"                      "src/App.tsx": { content: "..." },
  prompt: "Build me..."                  "src/components/TodoList.tsx": "...",
  blueprint: { JSON }                   ... 50+ files
  status: "deployed"                   }
  deployment_id: "xyz"
                                       Git history:
  (NO actual code here)                  commit 1: "Initial template"
                                         commit 2: "Phase 1: Core UI"
```

### How to Access Generated Code

| Method | How |
|---|---|
| **Git clone** | `git clone https://oauth2:<token>@vibesnappy.appypie.com/apps/<appId>.git` |
| **Frontend** | Open `/chat/<chatId>`, file explorer reads from DO state |
| **Sandbox** | Browse preview URL while container is alive |
| **GitHub** | If exported via GitHub export |

---

## 42. How to Access Durable Object SQLite

There is **no direct UI** in the Cloudflare dashboard for DO SQLite.

### Option 1: Browser DevTools

```
Open /chat/<chatId> --> DevTools --> Network --> WS tab
--> See WebSocket messages with full state including files
```

### Option 2: Git Clone

Gets code from DO's Git SQLite via HTTP protocol.

### Option 3: Local Development

```bash
# After bun run dev, DO SQLite files are at:
ls .wrangler/state/v3/do/

# Open with SQLite client:
sqlite3 .wrangler/state/v3/do/<DO-name>/<instance-id>.sqlite

# Query:
SELECT * FROM _cf_KV;              # DO state
SELECT * FROM full_conversations;   # chat history
```

### Option 4: Worker Logs

```
dash.cloudflare.com --> Workers & Pages --> vibesdk-production --> Logs
```

Shows FileManager logs but not actual file contents.

### What's Inside DO SQLite

| Table/Storage | Content |
|---|---|
| `_cf_KV` | AgentState (generatedFilesMap, blueprint, sandboxInstanceId, etc.) |
| `full_conversations` | Complete conversation history |
| `compact_conversations` | Summarized conversation |
| Git objects | `.git/objects/*`, `.git/refs/*`, `.git/HEAD` |

---

## 43. Is There a "DO for Platforms"?

**No.** There is no "Durable Objects for Platforms" equivalent.

### Why It Doesn't Need to Exist

DOs already handle multi-tenancy by design:

- You define **one class** (e.g., `CodeGeneratorAgent`)
- Cloudflare creates **unlimited instances** on demand
- Each instance has **isolated state** (own SQLite, own memory)
- One user's DO instance **cannot access** another's

### The Key Difference

| | Workers for Platforms | Durable Objects |
|---|---|---|
| **Code** | Different per user | Same for all instances |
| **Data** | N/A | Different per instance |
| **Purpose** | Run user's arbitrary code | Run your code with different data |

DOs = **same code, different data** (already multi-tenant)
WfP = **different code per user** (needs a hosting platform)

---

## 44. EAS Build -- Mobile APK/IPA Generation

### What It Is

EAS (Expo Application Services) integration for compiling Expo mobile apps into native binaries. Supports both **Android (APK)** and **iOS (IPA)**.

### Key Files

| Layer | File | Purpose |
|---|---|---|
| UI Component | `src/routes/chat/components/eas-build-panel.tsx` | Platform toggle (Android/iOS), build trigger, status display, download button |
| Frontend Hook | `src/routes/chat/hooks/use-chat.ts` | `handleTriggerEasBuild()`, `easBuild` state, WebSocket callbacks |
| WebSocket Types | `worker/api/websocketTypes.ts` | `eas_build_trigger`, `eas_build_status`, `eas_build_complete`, `eas_build_error` |
| WS Handler | `worker/agents/core/websocket.ts` (lines 246-305) | Receives trigger, validates EXPO_TOKEN, calls DeploymentManager |
| Core Build Logic | `worker/agents/services/implementations/DeploymentManager.ts` (lines 1506-1805) | `triggerEasBuild()` -- patches app.json, inits git, runs eas-cli, polls status |
| Status Polling | Same file (lines 1811-1955) | `pollEasBuildStatus()` -- polls Expo GraphQL API, downloads artifact to R2 |
| Download Endpoint | `worker/api/controllers/builds/controller.ts` | `GET /api/agent/:agentId/builds/:buildId/download` -- serves APK/IPA from R2 |
| Alarm Scheduling | `worker/agents/core/codingAgent.ts` | `scheduleEasBuildPoll()` via Durable Objects alarm system |
| Types | `worker/agents/core/types.ts` | `EasBuildState`, `EasBuildPlatform`, `EasBuildStatus` |
| Agent State | `worker/agents/core/state.ts` | `easBuild?: EasBuildState` persisted in DO |
| Frontend WS Handling | `src/routes/chat/utils/handle-websocket-message.ts` | Handles `eas_build_status`, `eas_build_complete`, `eas_build_error` |

### When the Build Panel is Visible

The EasBuildPanel renders only when **all three** conditions are met:

| Condition | Location | Check |
|---|---|---|
| Active chat session | `chat.tsx:780` | `chatId` exists |
| Phasic mode (not agentic) | `chat.tsx:780` | `behaviorType !== 'agentic'` |
| Mobile project | `eas-build-panel.tsx:51-52` | `templateRenderMode === 'mobile'` or `'mobile-fullstack'` |

### When the Build Button is Enabled

| State | Condition | Location |
|---|---|---|
| **Enabled** | `previewUrl` exists (sandbox preview is deployed) | `chat.tsx:820` |
| **Disabled** | No preview URL -- shows "Deploy preview first" hint | `eas-build-panel.tsx:94-101` |

The WebSocket must also be connected (`readyState === WebSocket.OPEN`) for the trigger to fire (`use-chat.ts:764-771`).

### Build Flow

```
1. User clicks "Build Android" or "Build iOS" in EasBuildPanel
2. Frontend sends WebSocket message: eas_build_trigger + platform
3. Backend validates EXPO_TOKEN from vault (UserSecretsStore)
4. DeploymentManager.triggerEasBuild():
   a. Validates sandbox is healthy
   b. Reads current project files
   c. Patches app.json (slug, bundleIdentifier, packageName, API URL for standalone)
   d. Patches package.json (removes eas-cli if present)
   e. Updates .gitignore
   f. Initializes git repo (required by EAS CLI)
   g. Runs expo install --fix (corrects SDK-compatible versions)
   h. Creates EAS project via Expo GraphQL API
   i. For fullstack apps: deploys CF Workers API backend
   j. Runs: eas-cli build --platform [ios|android] --profile preview --non-interactive --no-wait --json
   k. Restores original project files (keeps dev server working)
   l. Returns buildId for polling
5. DO alarm schedules pollEasBuildStatus()
6. Polls Expo GraphQL API every ~30 seconds (max 30-minute timeout)
7. On completion: downloads artifact to R2 bucket (appypievibe)
8. Sends eas_build_complete with download URL via WebSocket
9. User downloads APK/IPA from: GET /api/agent/:agentId/builds/:buildId/download
```

### Edge Cases Handled

| Scenario | Handling |
|---|---|
| Missing EXPO_TOKEN | Prompts vault unlock with helpful message |
| Unhealthy sandbox | Graceful error before build attempt |
| Stale builds (>10 min old) | Auto-cleared |
| Active build already running | Prevents duplicate unless stale |
| Build timeout | 30-minute timeout with clear error |
| Poll failures | Retries 5 times before giving up |
| File restoration | Ensures dev preview works after EAS build submit |

### iOS Note

iOS builds via EAS require an **Apple Developer account** with valid provisioning profiles and certificates configured on the Expo side. The codebase handles `EXPO_TOKEN` for Expo authentication but Apple credential setup is external.

### Artifact Storage

Build artifacts (APK/IPA files) are stored in the **`appypievibe` R2 bucket** with proper content-type and content-disposition headers for download.

---

## Key File Reference

| Component | File Path | Purpose |
|---|---|---|
| Worker Entry | `worker/index.ts` | Request routing |
| Hono App | `worker/app.ts` | Middleware stack |
| Coding Agent | `worker/agents/core/codingAgent.ts` | Main DO |
| State Machine | `worker/agents/core/state.ts` | State definitions |
| WebSocket Handler | `worker/agents/core/websocket.ts` | WS message dispatch |
| Behaviors | `worker/agents/core/behaviors/` | Phasic/Agentic |
| Operations | `worker/agents/operations/` | Phase generation, implementation, debug |
| Tools | `worker/agents/tools/customTools.ts` | 24 LLM tools |
| Prompts | `worker/agents/prompts.ts` | 1447 lines of prompts |
| LLM Config | `worker/agents/inferutils/config.ts` | Model configuration |
| API Routes | `worker/api/routes/index.ts` | Route setup |
| DB Schema | `worker/database/schema.ts` | D1 tables |
| Sandbox Types | `worker/services/sandbox/sandboxTypes.ts` | Container types |
| Secrets Store | `worker/services/secrets/UserSecretsStore.ts` | Encrypted vault |
| Template Selector | `worker/agents/planning/templateSelector.ts` | AI template selection |
| Frontend Entry | `src/main.tsx` | React bootstrap |
| API Client | `src/lib/api-client.ts` | All REST calls |
| Chat Hook | `src/routes/chat/hooks/use-chat.ts` | WebSocket + state |
| WS Handler | `src/routes/chat/utils/handle-websocket-message.ts` | Message processing |
| Auth Context | `src/contexts/auth-context.tsx` | Auth state |
| Vault Context | `src/contexts/vault-context.tsx` | Vault management |
| Wrangler Config | `wrangler.jsonc` | All Cloudflare bindings |
| Dockerfile | `SandboxDockerfile` | Container image |
| Deploy Script | `scripts/deploy.ts` | Automated deployment |

---

## 45. R2 Buckets Used in the Project

2 R2 buckets are configured in `wrangler.jsonc` (lines 108-119):

### Bucket 1: `TEMPLATES_BUCKET` (bucket name: `vibesdk-templates`)

Multi-purpose bucket used for 4 things:

| Usage | Code Location | What's Stored |
|---|---|---|
| Template catalog | `BaseSandboxService.ts:80` | `template_catalog.json` -- JSON array of all template metadata |
| Template ZIPs | `BaseSandboxService.ts:130` | `{name}.zip` -- 10 packaged template scaffolds |
| User-uploaded images | `worker/utils/images.ts:143,214` | Images uploaded during chat conversations (with `cfImagesUrl` metadata) |
| App screenshots | `worker/api/controllers/screenshots/controller.ts:73` | Screenshots of generated apps |

**R2 directory structure (flat, no nesting):**
```
vibesdk-templates/                          (R2 bucket root)
|-- template_catalog.json                   (JSON array, ~50KB)
|-- c-code-react-runner.zip                 (~150-200KB each)
|-- vite-cfagents-runner.zip
|-- vite-cf-DO-runner.zip
|-- vite-cf-DO-KV-runner.zip
|-- vite-cf-DO-v2-runner.zip
|-- reveal-presentation-pro.zip
|-- reveal-presentation-dev.zip
|-- minimal-js.zip
|-- minimal-vite.zip
|-- c-code-next-runner.zip
|-- (user images and screenshots at various keys)
```

### Bucket 2: `R2_BUCKET` (bucket name: `appypievibe`)

Specifically for deployed app builds:

| Usage | Code Location | What's Stored |
|---|---|---|
| Build/deployment artifacts | `DeploymentManager.ts:1983` | Deployed app files (HTML, JS, CSS, assets) uploaded during deployment |
| Build file serving | `worker/api/controllers/builds/controller.ts:33` | Serves deployed build files to end users via API |

### What's NOT in R2

- Mobile templates (`expo-scratch`, `expo-fullstack`) -- synthetic, created in-memory
- The `scratch` template -- also synthetic
- No `node_modules`, no built artifacts, no lock files in template ZIPs
