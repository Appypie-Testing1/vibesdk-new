# vibesdk: The Complete Guide

> From "what is this?" to "I can build, deploy, and debug it" -- a single document covering everything about vibesdk.

vibesdk is an AI-powered full-stack application generation platform built on Cloudflare infrastructure. Users describe an app in natural language; the platform generates production-ready code, previews it in a live sandbox, and deploys it to Cloudflare Workers -- all in real time.

This guide progresses from high-level overview to deep internals. Read it cover-to-cover, or jump to any section via the table of contents.

**Related documentation:**
- [`docs/setup.md`](setup.md) -- Quick-start setup guide
- [`docs/architecture-diagrams.md`](architecture-diagrams.md) -- Mermaid architecture diagrams
- [`docs/llm.md`](llm.md) -- LLM-focused developer reference

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites and Local Setup](#2-prerequisites-and-local-setup)
3. [Templates System](#3-templates-system)
4. [Complete App Generation Flow](#4-complete-app-generation-flow)
5. [Backend Architecture](#5-backend-architecture)
6. [Frontend Architecture](#6-frontend-architecture)
7. [SDK Package](#7-sdk-package)
8. [Deployment and Operations](#8-deployment-and-operations)
9. [Development Workflow and Contribution Guide](#9-development-workflow-and-contribution-guide)

---

## 1. Project Overview

### 1a. What vibesdk Does

vibesdk is an AI-powered application generation platform. A user describes an app in natural language -- a description, a feature list, or a rough idea -- and the platform handles the rest. It selects a matching project template from Cloudflare R2 storage and invokes an LLM to produce a structured blueprint: a document covering architecture, views, data flow, and an implementation roadmap. That blueprint drives everything that follows.

Code generation proceeds in phases. Each phase is scoped to a portion of the application (routing, data layer, UI, etc.) and produces files that are streamed to the frontend in real time via WebSocket. After each phase, a code review step runs automatically, and a fixer pass resolves TypeScript errors before moving to the next phase. Generated files are synced to a sandbox container -- Cloudflare Containers in production, Docker locally -- giving users a live preview at each step. Users can send follow-up messages to refine the app mid-session; conversation turns are processed as agent operations that can modify the blueprint, regenerate files, or trigger re-deployment.

Final applications are deployed to Cloudflare Workers. The platform manages the full deployment pipeline: bundling, environment variable injection, Worker upload, and route assignment. Two behavior modes govern code generation: **phasic** (default for web apps) uses a deterministic state machine that drives the platform through a fixed sequence of generation, review, and implementation phases; **agentic** (used for presentations, workflows, and general projects) runs an autonomous LLM loop that decides what to do next without a predefined phase order.

### 1b. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, TailwindCSS, React Router v7, Radix UI |
| Backend | Cloudflare Workers, Hono framework, Durable Objects |
| Database | Cloudflare D1 (SQLite), Drizzle ORM |
| AI/LLM | OpenAI, Anthropic, Google AI Studio (Gemini), Cerebras, OpenRouter via Cloudflare AI Gateway |
| Real-time | WebSocket via PartySocket |
| Sandbox | Cloudflare Containers (production), Docker (local dev) |
| Storage | Cloudflare KV (sessions/cache), R2 (templates/assets) |
| Git | isomorphic-git with SQLite filesystem adapter |
| SDK | `@cf-vibesdk/sdk` -- standalone client library |

### 1c. Architecture Overview

vibesdk follows a three-tier architecture.

**Frontend (React SPA):** The client application lives in `src/`. It communicates with the backend over two channels: a REST API for discrete operations (auth, app management, model configuration, stats) and a persistent WebSocket connection for real-time streaming of agent events, file contents, and state updates. The frontend reconstructs full application state on reconnect by replaying the agent's persisted state.

**Backend (Cloudflare Workers + Durable Objects):** The backend entry point is `worker/index.ts`, which routes requests to either the HTTP API (Hono router) or the agent handler. Each chat session is backed by a `CodeGeneratorAgent` Durable Object -- a long-lived, single-threaded process that holds the full session state in SQLite. Separate Durable Objects handle rate limiting (`DORateLimitStore`), encrypted user secrets (`UserSecretsStore`), and global state (`GlobalDurableObject`).

**Cloudflare Infrastructure:** The platform is entirely Cloudflare-native. D1 provides the relational database, KV stores ephemeral session data and cache, R2 holds project templates and generated assets, Containers run the sandbox preview environment, and AI Gateway proxies all LLM calls with unified authentication, logging, and fallback handling.

For visual mermaid diagrams of these relationships, see [`docs/architecture-diagrams.md`](architecture-diagrams.md).

### 1d. Project Structure

```
vibesdk/
├── src/              # React frontend application
├── worker/           # Cloudflare Workers backend
├── shared/           # Shared types between frontend and backend
├── sdk/              # Client SDK package (@cf-vibesdk/sdk)
├── migrations/       # D1 database migrations
├── container/        # Sandbox container tooling (CLI tools, process monitor)
├── scripts/          # Deploy, setup, and undeploy scripts
├── docs/             # Documentation, architecture diagrams, Postman collection
└── debug-tools/      # Python/TS analysis scripts
```

### 1e. Worker Subdirectory Breakdown

The `worker/` directory is organized by concern. The following table covers all 14 primary subdirectories.

| Directory | Contents |
|---|---|
| `worker/agents/core/` | `CodeGeneratorAgent` (extends Cloudflare `Agent`), phasic and agentic behavior classes, state machine transitions, WebSocket message handler |
| `worker/agents/operations/` | Discrete agent operations: `PhaseGeneration`, `PhaseImplementation`, `UserConversationProcessor`, `DeepDebugger`, `FileRegeneration`, `PostPhaseCodeFixer` |
| `worker/agents/planning/` | Blueprint generation pipeline and template selection logic |
| `worker/agents/tools/toolkit/` | All LLM-callable tools: `read-files`, `run-analysis`, `regenerate-file`, git operations, web search, and others |
| `worker/agents/inferutils/` | Inference pipeline (`executeInference`), model configuration, tool execution loop, loop detection |
| `worker/agents/output-formats/` | SCOF (Streaming Code Output Format) parser for incremental file streaming |
| `worker/agents/git/` | `GitVersionControl` wrapper around isomorphic-git; SQLite filesystem adapter (`fs-adapter.ts`) |
| `worker/agents/services/` | `FileManager` (file sync and tracking), `DeploymentManager` (Cloudflare Worker deployment) |
| `worker/agents/utils/` | Template customizer, prompt construction utilities |
| `worker/api/routes/` | Hono HTTP route definitions: auth, apps, user, stats, codegen, model config, and others |
| `worker/api/controllers/` | Request handler implementations, one directory per domain |
| `worker/database/` | Drizzle ORM schema definitions and service layer for all database operations |
| `worker/services/` | One directory per infrastructure concern: sandbox, secrets, oauth, rate-limit, deployer, and others |
| `worker/middleware/` | CSRF protection, WebSocket security checks, authentication middleware |

---

## 2. Prerequisites and Local Setup

### 2.1 Required Software

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ | Required for tooling compatibility |
| Bun | Latest | All project scripts use Bun. Install: `curl -fsSL https://bun.sh/install | bash` |
| Docker | Latest | Required for local sandbox containers |
| Git | Any recent | For version control and isomorphic-git operations |

### 2.2 Cloudflare Account

A Cloudflare account is required. Plan requirements:

| Feature | Free Tier | Paid Plan |
|---|---|---|
| Basic development | Sufficient | Not required |
| KV namespace quota | 10 namespaces | Higher limits |
| D1 database | Limited | Recommended for production |
| R2 bucket | Limited | Recommended for production |
| Workers for Platforms (app deployment button) | Not available | Required |
| Advanced Certificate Manager (first-level subdomains) | Not available | Required |

### 2.3 API Token Creation

The setup script requires a Cloudflare API token with specific permissions. Follow these steps:

1. Go to Cloudflare dashboard -> My Profile -> API Tokens -> Create Token
2. Select "Edit Cloudflare Workers" as the base template
3. Add the following permissions that the template does not include by default:

**Account-level permissions (add all of these):**

| Permission | Access Level |
|---|---|
| Workers KV Storage | Edit |
| Workers Scripts | Edit |
| Account Settings | Read |
| Workers Tail | Read |
| Workers R2 Storage | Edit |
| Cloudflare Pages | Edit |
| Workers Builds Configuration | Edit |
| Workers Agents Configuration | Edit |
| Workers Observability | Edit |
| Containers | Edit |
| D1 | Edit |
| AI Gateway | Read, Edit, Run |
| Cloudchamber | Edit |
| Browser Rendering | Edit |

**Zone-level permissions:**

| Resource | Permission | Access Level |
|---|---|---|
| All zones | Workers Routes | Edit |

**User-level permissions:**

| Permission | Access Level |
|---|---|
| User Details | Read |
| Memberships | Read |

### 2.4 Automated Setup (Recommended)

The interactive setup script handles all resource creation and configuration in a single pass.

```bash
bun install
bun run setup
```

The script walks through the following prompts in order:

| Prompt | What to enter |
|---|---|
| Cloudflare Account ID | Found in the sidebar of the Cloudflare dashboard |
| Cloudflare API Token | The token created in step 2.3 |
| Custom domain | Your production domain, or press Enter for localhost-only development |
| Remote vs local-only | Choose remote to create Cloudflare resources, local to skip |
| AI Gateway configuration | Select Cloudflare AI Gateway (recommended) -- auto-configures the gateway token |
| AI provider selection | Multi-select: OpenAI, Anthropic, Google AI Studio, Cerebras, OpenRouter, or Custom |
| OAuth credentials (Google) | Client ID and secret from Google Cloud Console, or skip for email-only auth |
| OAuth credentials (GitHub) | Client ID and secret from GitHub OAuth Apps, or skip |

After gathering credentials, the script automatically:

- Creates a KV namespace (`VibecoderStore`)
- Creates a D1 database (`vibesdk-db`)
- Creates an R2 bucket (`vibesdk-templates`)
- Creates an AI Gateway (if selected)
- Applies the database schema migrations
- Uploads project templates to R2
- Writes all configuration to `wrangler.jsonc` and `.dev.vars`

### 2.5 Manual Setup

If you prefer to configure everything manually instead of using the setup script:

**Step 1: Copy the environment file**

```bash
cp .dev.vars.example .dev.vars
```

**Step 2: Fill in environment variables**

Open `.dev.vars` and set the following variables:

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Yes (deploy) | API token for Cloudflare access | Cloudflare dashboard -> My Profile -> API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Yes (deploy) | Your Cloudflare account ID | Cloudflare dashboard sidebar |
| `CLOUDFLARE_AI_GATEWAY_TOKEN` | Recommended | Token for AI Gateway creation and access; requires at least Run permission | Cloudflare dashboard -> AI Gateway |
| `CLOUDFLARE_AI_GATEWAY_URL` | Optional | Override URL for AI Gateway endpoint; leave unset if using auto-configuration | AI Gateway dashboard |
| `GOOGLE_AI_STUDIO_API_KEY` | Yes (default config) | API key for Gemini models; required for the default `DEFAULT_AGENT_CONFIG` | https://aistudio.google.com/ |
| `ANTHROPIC_API_KEY` | Optional | API key for Anthropic Claude models | https://console.anthropic.com/ |
| `OPENAI_API_KEY` | Optional | API key for OpenAI models | https://platform.openai.com/ |
| `OPENROUTER_API_KEY` | Optional | API key for OpenRouter model aggregator | https://openrouter.ai/ |
| `GROQ_API_KEY` | Optional | API key for Groq inference | https://console.groq.com/ |
| `GOOGLE_CLIENT_ID` | Optional | OAuth 2.0 client ID for Google login | Google Cloud Console -> APIs & Services -> Credentials |
| `GOOGLE_CLIENT_SECRET` | Optional | OAuth 2.0 client secret for Google login | Google Cloud Console -> APIs & Services -> Credentials |
| `GITHUB_CLIENT_ID` | Optional | OAuth App client ID for GitHub login | GitHub -> Settings -> Developer Settings -> OAuth Apps |
| `GITHUB_CLIENT_SECRET` | Optional | OAuth App client secret for GitHub login | GitHub -> Settings -> Developer Settings -> OAuth Apps |
| `GITHUB_EXPORTER_CLIENT_ID` | Optional | Separate OAuth App for GitHub export feature | GitHub -> Settings -> Developer Settings -> OAuth Apps |
| `GITHUB_EXPORTER_CLIENT_SECRET` | Optional | Client secret for GitHub export OAuth App | GitHub -> Settings -> Developer Settings -> OAuth Apps |
| `JWT_SECRET` | Yes | Secret used to sign authentication tokens; generate any long random string | Generate with: `openssl rand -hex 32` |
| `WEBHOOK_SECRET` | Yes | Secret for webhook signature verification | Generate with: `openssl rand -hex 32` |
| `CUSTOM_DOMAIN` | Optional | Your production domain for CORS configuration | Your domain registrar |
| `ENVIRONMENT` | Optional | Deployment environment: `dev`, `staging`, or `prod` | Set manually |

**Step 3: Create Cloudflare resources via CLI**

```bash
npx wrangler kv namespace create VibecoderStore
npx wrangler d1 create vibesdk-db
npx wrangler r2 bucket create vibesdk-templates
```

Each command prints an `id` field. Copy these IDs into `wrangler.jsonc` under the corresponding binding entries.

### 2.6 Database Setup

After creating the D1 database and updating `wrangler.jsonc` with its ID, apply the schema:

```bash
bun run db:generate       # Generate migration files from the Drizzle schema
bun run db:migrate:local  # Apply migrations to the local D1 instance
bun run db:studio         # Open Drizzle Studio for visual inspection of the schema
```

For production, use `bun run db:migrate:remote` to apply migrations to the remote D1 database.

### 2.7 Starting Development

```bash
bun run dev  # Starts the Vite dev server at localhost:5173
```

On first launch, register an account via the UI. If no OAuth providers are configured, only email-based registration and login are available.

### 2.8 AI Provider Configuration

**Google AI Studio (Gemini)** is the default provider and works out of the box with a free API key from https://aistudio.google.com/. This is the same configuration used at build.cloudflare.dev.

To use other providers, edit `worker/agents/inferutils/config.ts`. The file contains two configurations:

| Config | When Used | Description |
|---|---|---|
| `DEFAULT_AGENT_CONFIG` | `PLATFORM_MODEL_PROVIDERS` env var is unset | Gemini-only; the default for self-hosted deployments |
| `PLATFORM_AGENT_CONFIG` | `PLATFORM_MODEL_PROVIDERS` env var is set | Multi-provider; used on build.cloudflare.dev |

When switching providers, update the model name strings in the relevant config to use the `provider/model-name` format. Examples:

```
openai/gpt-4o
anthropic/claude-3-5-sonnet-20241022
google/gemini-2.0-flash-001
```

### 2.9 Troubleshooting

**Cloudflare WARP interference**

Cause: WARP in full-tunnel mode intercepts and breaks anonymous cloudflared tunnels, which are used to expose local sandbox previews to the internet.

Solution: Disable WARP, or switch it to DNS-only mode (1.1.1.1) while doing local development.

---

**D1 "Unauthorized" error**

Cause: The API token is missing the D1:Edit permission, or the Cloudflare account does not have a paid plan that includes D1.

Solution: Update the token permissions following step 2.3, or upgrade the Cloudflare plan.

---

**R2 "Unauthorized" error**

Cause: Same as D1 -- missing Workers R2 Storage:Edit permission or plan limitation.

Solution: Update token permissions or upgrade the plan.

---

**AI Gateway creation failed**

Cause: The API token is missing AI Gateway permissions.

Solution: Add AI Gateway:Read, AI Gateway:Edit, and AI Gateway:Run to the token.

---

**Docker not running**

Cause: The sandbox service requires Docker to run container instances locally.

Solution: Start Docker Desktop before running `bun run dev`.

---

**Corporate network SSL issues**

Cause: Corporate networks that perform SSL inspection use a custom CA certificate not trusted by the sandbox container's default certificate store. Requests from the container to external services fail with certificate validation errors.

Solution: Add your corporate root CA certificate to the sandbox Dockerfile. Edit `container/SandboxDockerfile` (or your equivalent container definition):

```dockerfile
COPY your-root-ca.pem /usr/local/share/ca-certificates/your-root-ca.crt
RUN update-ca-certificates
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/your-root-ca.crt
```

**Warning:** Never commit corporate CA certificate files to a public repository.

---

## 3. Templates System

### 3.1 What Templates Are

Templates are pre-built project scaffolds stored in Cloudflare R2. Instead of generating an application from a blank slate, the AI extends an existing, working project. Each template represents a specific framework and stack choice -- a complete, runnable codebase with configuration, dependencies, and structure already in place.

Templates repository: `https://github.com/cloudflare/vibesdk-templates`

The AI uses a template as a foundation: it reads the existing files, understands the established patterns, and generates new code that fits the project rather than inventing structure from scratch. This produces more consistent, idiomatic output than fully generative approaches.

### 3.2 Project Types

| Type | Use Case | Behavior | Sandbox |
|---|---|---|---|
| `app` | Full-stack web apps, mobile apps | Phasic (deterministic phases) | Yes |
| `workflow` | Backend APIs, cron jobs, webhooks | Agentic (autonomous LLM loop) | Yes |
| `presentation` | Slide decks, pitch decks | Agentic | Yes |
| `general` | Docs, notes, specs in Markdown/MDX | Agentic | No |

### 3.3 Template Data Structure

Two levels of template data are defined in `worker/services/sandbox/sandboxTypes.ts`.

**TemplateInfo** (metadata stored in the catalog):

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Unique template identifier |
| `language` | `string` (optional) | "TypeScript" or "JavaScript" |
| `frameworks` | `string[]` | Framework names used in this template |
| `projectType` | `enum` | `app`, `workflow`, `presentation`, or `general` |
| `description` | `object` | `selection` (used by AI for matching) and `usage` (how to build on it) |
| `renderMode` | `enum` (optional) | `sandbox`, `browser`, `mobile`, or `mobile-fullstack` |
| `slideDirectory` | `string` (optional) | Path to slides directory for presentation templates |
| `disabled` | `boolean` | When true, template is excluded from selection |
| `initCommand` | `string` (optional) | Command to run during sandbox initialization |

**TemplateDetails** (full template with file contents, extends `TemplateInfo`):

| Field | Type | Description |
|---|---|---|
| `fileTree` | `FileTreeNode` | Directory hierarchy representing the template structure |
| `allFiles` | `Record<string, string>` | Map of file paths to file contents |
| `deps` | `Record<string, string>` | Dependencies from `package.json` |
| `importantFiles` | `string[]` | Files the agent should focus on when reading the project |
| `dontTouchFiles` | `string[]` | Files the agent must not modify |
| `redactedFiles` | `string[]` | Sensitive files filtered from AI context |

### 3.4 Template Storage

| Resource | Name |
|---|---|
| Production R2 bucket | `vibesdk-templates` |
| Staging R2 bucket | `vibesdk-templates-staging` |
| Catalog file | `template_catalog.json` at R2 bucket root |
| Individual templates | `.zip` files containing all files and metadata |

Templates are accessed via `BaseSandboxService.listTemplates()` in `worker/services/sandbox/BaseSandboxService.ts`. The catalog is fetched once per request and templates are loaded on demand by name.

### 3.5 Template Selection Flow

1. User prompt arrives at the agent.
2. `predictProjectType(query)` in `worker/agents/planning/templateSelector.ts` classifies the prompt into `app`, `workflow`, `presentation`, or `general` using an LLM inference call.
3. `selectTemplate(query, templates, projectType)` narrows the candidate set:
   - Filters out disabled templates and templates with "minimal" in their name.
   - Filters remaining templates by the detected project type (skipped for `general`).
   - Auto-selects if only one template matches (common for `workflow` and `presentation`).
   - Runs an AI inference call to rank and select among remaining candidates.
4. Returns a `TemplateSelection` object with the following fields:

| Field | Type | Description |
|---|---|---|
| `selectedTemplateName` | `string` | The chosen template's name |
| `reasoning` | `string` | Explanation of why this template was selected |
| `useCase` | `enum` | SaaS Product Website, Dashboard, Blog, Portfolio, E-Commerce, General, Other |
| `complexity` | `enum` | `simple`, `moderate`, or `complex` |
| `styleSelection` | `enum` | Minimalist Design, Brutalism, Retro, Illustrative, Kid_Playful, Custom |
| `projectType` | `enum` | The detected project type |

### 3.6 Template Import and Customization

Source: `worker/agents/utils/templateCustomizer.ts`

`importTemplate(templateName)` loads the template's files into agent state. `customizeTemplateFiles()` then orchestrates the following sequence:

1. Updates `package.json` with the project name and a `prepare` script.
2. Updates `wrangler.jsonc` with the project name. Comments are preserved using `jsonc-parser`, which handles JSONC syntax that standard JSON parsers reject.
3. Generates `.bootstrap.js` -- a self-deleting first-run setup script that runs once on sandbox initialization and removes itself after completion.
4. Updates `.gitignore` to exclude bootstrap marker files.

### 3.7 Template Placeholder System

Source: `worker/services/sandbox/templateParser.ts`

Templates use placeholders in `wrangler.jsonc` for Cloudflare resource IDs that are not known until deployment time. The `TemplateParser` class manages their lifecycle:

```
{{KV_ID}}   -- replaced with the KV namespace ID for this project
{{D1_ID}}   -- replaced with the D1 database ID for this project
```

The replacement sequence:

1. Detects placeholders in the wrangler config file.
2. Extracts the binding names associated with each placeholder.
3. Replaces placeholders with the actual Cloudflare resource IDs allocated during deployment setup.
4. Validates that all placeholders were replaced before allowing deployment to proceed -- any remaining placeholder causes a hard failure rather than deploying a broken configuration.

### 3.8 Deploying Templates to R2

Templates are uploaded to R2 as part of the main deploy pipeline, executed via `bun run deploy` (which runs `scripts/deploy.ts`):

1. Clones or pulls `https://github.com/cloudflare/vibesdk-templates` to a local path.
2. Reads `wrangler.jsonc` to find the `TEMPLATES_BUCKET` R2 binding for the target environment.
3. Executes `deploy_templates.sh` from the templates repository root.
4. The script zips each template directory and uploads the bundles to R2 along with an updated `template_catalog.json`.

The staging environment uses the `vibesdk-templates-staging` bucket, keeping template versions independent between environments.

## 4. Complete App Generation Flow

This section traces the full journey of a user prompt becoming a deployed, running application -- from the initial HTTP request through blueprint generation, phased code generation, sandbox deployment, and iterative refinement.

### 4.1 Session Initialization

The frontend sends a POST to `/api/agent` with a `CodeGenArgs` body containing: `query`, `language`, `frameworks`, `images`, `behaviorType`, and `projectType`. `CodingAgentController.startCodeGeneration()` in `worker/api/controllers/agent/controller.ts` creates a unique agent ID via `generateId()` and returns a streaming SSE response (`text/event-stream`) that includes the WebSocket URL. The client then connects via WebSocket to `/api/agent/{agentId}/ws` for all subsequent bidirectional communication.

Behavior type is resolved at this point: `phasic` for standard app projects (default), `agentic` for presentations, workflows, and general-purpose projects.

Key files: `worker/api/controllers/agent/controller.ts`, `worker/api/routes/codegenRoutes.ts`

### 4.2 Blueprint Generation

Template selection follows the flow described in Section 3. Once a template is selected, `generateBlueprint()` in `worker/agents/planning/blueprint.ts` takes the user query and selected template, then calls the LLM with a specialized system prompt to produce a structured blueprint.

For phasic behavior, the blueprint schema includes: `title`, `projectName`, `description`, `views`, `userFlow`, `dataFlow`, `architecture`, `frameworks`, `pitfalls`, `implementationRoadmap` (ordered array of phases), and `initialPhase`. The blueprint is streamed back to the client chunk by chunk via the `onBlueprintChunk()` callback as inference progresses.

### 4.3 State Machine (Phasic Behavior)

The phasic behavior drives code generation through a deterministic state machine:

```
IDLE -> PHASE_GENERATING -> PHASE_IMPLEMENTING -> REVIEWING -> FINALIZING -> IDLE
```

Key fields in `CodeGenState` (`worker/agents/core/state.ts`):

- `blueprint` -- the generated blueprint
- `generatedFilesMap` -- tracks all generated files across phases
- `generatedPhases` -- completed phases array
- `currentPhase` -- phase currently being worked on
- `phasesCounter` -- remaining phases (max 10)
- `currentDevState` -- current state machine position
- `shouldBeGenerating` -- generation active flag
- `sandboxInstanceId` -- sandbox container ID
- `conversationMessages` -- full chat history

Each `CodeGeneratorAgent` instance is single-threaded per Durable Object, enforcing sequential phase execution.

Key files: `worker/agents/core/state.ts`, `worker/agents/core/codingAgent.ts`, `worker/agents/core/behaviors/phasic.ts`

### 4.4 Phase Generation

`PhaseGenerationOperation` in `worker/agents/operations/PhaseGeneration.ts` runs at the start of each cycle. It analyzes the current codebase state, compares it against the blueprint roadmap to identify what has been built versus what remains, and designs the next deployable milestone with emphasis on visual quality, UX, and accessibility.

Output schema: phase name, description, an array of files with their purposes, install commands to run, and a `lastPhase` boolean. `lastPhase: true` signals that the roadmap is complete and no critical errors remain -- triggering the finalization path rather than another generation cycle.

### 4.5 Phase Implementation (File Generation)

`PhaseImplementationOperation` in `worker/agents/operations/PhaseImplementation.ts` runs streaming inference to produce all files for the current phase. Files are emitted using SCOF (Structured Code Output Format), defined in `worker/agents/output-formats/streaming-formats/scof.ts`:

```
FILE path/to/file.tsx
[file content here]
EOF
```

The SCOF parser is designed to handle arbitrary streaming chunk boundaries robustly. Parser callbacks (`onFileOpen`, `onFileChunk`, `onFileClose`) relay progress to the client in real-time via WebSocket messages: `file_generating`, `file_chunk_generated`, and `file_generated`. If `RealtimeCodeFixer` is enabled, it runs inline during this phase to catch issues before the phase completes.

### 4.6 Code Review and Fixing

`FastCodeFixerOperation` in `worker/agents/operations/PostPhaseCodeFixer.ts` runs a post-phase review cycle, iterating up to 5 times until no critical issues remain. `RealtimeCodeFixer` in `worker/agents/assistants/realtimeCodeFixer.ts` applies targeted search-replace diffs for common error classes:

- Infinite render loops (missing `useEffect` deps, `setState` in render body)
- Import and export integrity errors
- Undefined variable access
- Syntax errors and JSX mismatches
- Invalid Tailwind class usage
- Nested Router components

Diffs use the following format:

```
<<<<<<< SEARCH
[old code]
=======
[new code]
>>>>>>> REPLACE
```

Static analysis is performed via the sandbox using ESLint and the TypeScript compiler to surface errors that pattern-based fixing cannot catch.

### 4.7 Sandbox Deployment

After each phase, generated files are deployed to a sandbox container for live preview and runtime error collection:

- Local dev: Docker containers managed by `LocalSandboxService`
- Production: Cloudflare Containers managed by `RemoteSandboxService`

Execution sequence: write all files -> run install and build commands (`npm install`, build step) -> return a preview URL. Runtime errors and logs are fetched via `getRuntimeErrors()` and `getLogs()` and fed into the next review cycle.

Key file: `worker/services/sandbox/BaseSandboxService.ts`

### 4.8 User Conversation and Iteration

`UserConversationProcessor` in `worker/agents/operations/UserConversationProcessor.ts` handles all follow-up messages after initial generation. It presents a conversational interface between the user and the underlying agent system, speaking as the developer ("I'll fix that").

Available tools in conversation context: `queue_request` (relay modifications to the dev agent), `get_logs`, `deep_debug`, `git`, `deploy_preview`, `web_search`. User feedback can trigger new phase generation cycles or targeted file regeneration without restarting the full flow.

### 4.9 Deep Debugger

`DeepDebuggerOperation` in `worker/agents/operations/DeepDebugger.ts` handles persistent runtime errors that regular post-phase fixing cannot resolve. It runs as an autonomous debugging agent with full tool access: `read_file`, `get_logs`, `get_runtime_errors`, `get_file_list`, `write_file`, `wait`, `deploy_preview`.

The deep debugger uses the `deepDebugger` model config key (high reasoning effort). It cannot run during active code generation -- enforced via `isCodeGenerating()` -- and returns a transcript of all diagnostic steps taken so the conversation agent can summarize findings for the user.

### 4.10 Agentic Behavior (Alternative Flow)

For presentation, workflow, and general project types, the agentic behavior replaces the phasic state machine with an autonomous LLM loop. The LLM holds a plan string and decides what to do at each step rather than following predefined state transitions.

Key file: `worker/agents/core/behaviors/agentic.ts`

The same underlying operations are available (file generation, code fixing, sandbox deployment), but orchestration is driven by LLM decisions rather than the state machine. This gives the agent flexibility for project types where a linear phase-based approach does not fit the generation pattern.

---

## 5. Backend Architecture

### 5.1 Worker Entry Point and Routing

The backend entry point is `worker/index.ts`. It receives all incoming requests and routes them to either the HTTP API handler (Hono) or the Durable Object WebSocket handler depending on the path.

Hono is used as the HTTP router. Routes are organized by domain in `worker/api/routes/` and loaded into a central registry at `worker/api/routes/index.ts`. Each route file pairs with a corresponding controller directory in `worker/api/controllers/`.

**Route files in `worker/api/routes/`:**

| File | Domain |
|---|---|
| `authRoutes.ts` | Registration, login, sessions, OAuth, API keys |
| `appRoutes.ts` | App CRUD, visibility, favorites, stars, git token |
| `userRoutes.ts` | User profile, paginated app listing |
| `statsRoutes.ts` | User stats and activity |
| `analyticsRoutes.ts` | User analytics, agent analytics |
| `codegenRoutes.ts` | Session creation, WebSocket connect, preview, build download |
| `modelConfigRoutes.ts` | Per-user model configuration |
| `modelProviderRoutes.ts` | User-supplied model provider management |
| `userSecretsRoutes.ts` | Vault unlock, lock, status |
| `secretsRoutes.ts` | Secret templates and platform-level secrets |
| `githubExporterRoutes.ts` | GitHub authorize, export, check-remote |
| `statusRoutes.ts` | Platform health and status |
| `capabilitiesRoutes.ts` | Platform capabilities (feature flags) |
| `sentryRoutes.ts` | Error reporting relay |
| `imagesRoutes.ts` | Image asset serving |
| `database.ts` | Internal database utility routes |
| `index.ts` | Route registry and health check |

### 5.2 Durable Objects

All stateful backend concerns are handled by Durable Objects. Each instance is single-threaded, which eliminates concurrency issues within a session.

| Durable Object | Class | Purpose |
|---|---|---|
| `CodeGeneratorAgent` | `CodeGenObject` | One per chat session; holds generation state, runs the state machine, receives WebSocket connections |
| `UserAppSandboxService` | `Sandbox` | Sandbox container lifecycle management; allocates, monitors, and tears down containers |
| `DORateLimitStore` | `DORateLimitStore` | Per-user sliding window rate limiting for API and auth endpoints |
| `UserSecretsStore` | `UserSecretsStore` | Encrypted secret vault per user; AES-GCM storage, RPC interface |
| `GlobalDurableObject` | `GlobalDurableObject` | Global platform state shared across all Workers instances |

`CodeGeneratorAgent` extends the `Agent` class from Cloudflare's "agents" framework, not a raw `DurableObject`. This provides built-in WebSocket lifecycle management, SQLite-backed persistent state, and RPC tooling. Ephemeral state (abort controllers, active promise handles) lives only in object memory and is reconstructed after hibernation.

### 5.3 Inference Pipeline

**Call flow:**

```
executeInference()
  -> infer()
     -> OpenAI-compatible client (provider-specific base URL)
        -> AI Gateway (optional)
     -> tool execution loop
        -> loop detection
```

All LLM requests are routed through an OpenAI-compatible interface regardless of the underlying provider (OpenAI, Anthropic, Google). The AI Gateway URL pattern is:

```
https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayName}/{provider}
```

**Model configuration** is defined in `worker/agents/inferutils/config.ts`:

| Config | When Active | Description |
|---|---|---|
| `PLATFORM_AGENT_CONFIG` | `PLATFORM_MODEL_PROVIDERS` env var is set | Multi-provider; used in the hosted platform deployment |
| `DEFAULT_AGENT_CONFIG` | Fallback | Gemini-only; used in self-hosted / local development |

The exported `AGENT_CONFIG` selects between them at runtime based on the environment variable.

**Per-operation config keys** (each maps to a specific model + parameters):

| Key | Operation |
|---|---|
| `blueprint` | Blueprint generation |
| `phaseGeneration` | Phase plan generation |
| `phaseImplementation` | Phase code implementation |
| `codeReview` | Post-phase code review |
| `codeFixer` | TypeScript error fixing |
| `deepDebugger` | Autonomous deep debugger (high reasoning effort) |
| `userConversation` | User conversation agent |
| `templateSelection` | Template selection |

User model overrides are stored in the `user_model_configs` DB table and applied at inference time, allowing users to supply their own models and API keys (BYOK). Loop detection is handled in `worker/agents/inferutils/loopDetection.ts` and aborts the inference loop when repeated identical tool calls are detected.

### 5.4 Tool System

Tools follow a factory pattern: each tool file in `worker/agents/tools/toolkit/` exports a `createToolName(agent, logger)` function. Tools are assembled into two sets in `worker/agents/tools/customTools.ts`:

- `buildTools()` -- conversation tool set; safe subset available to the user-facing agent
- `buildDebugTools()` -- debugger tool set; full access including destructive operations

**All 24 tools:**

| Tool File | Tool Name | Description |
|---|---|---|
| `alter-blueprint.ts` | `alter_blueprint` | Modify an existing project blueprint |
| `completion-signals.ts` | `completion_signals` | Signal task completion to the orchestration layer |
| `deep-debugger.ts` | `deep_debug` | Trigger autonomous debugging session |
| `deploy-preview.ts` | `deploy_preview` | Redeploy sandbox for preview testing |
| `exec-commands.ts` | `exec_commands` | Execute shell commands in the sandbox container |
| `feedback.ts` | `feedback` | Provide structured feedback to the system |
| `generate-blueprint.ts` | `generate_blueprint` | Create the initial project blueprint |
| `generate-files.ts` | `generate_files` | Generate code files from the blueprint |
| `generate-images.ts` | `generate_images` | Generate image assets for the project |
| `get-logs.ts` | `get_logs` | Fetch runtime logs from the sandbox |
| `get-runtime-errors.ts` | `get_runtime_errors` | Fetch error reports from the sandbox |
| `git.ts` | `git` | Version control operations (parameterized: safe subset for users, full access for debugger) |
| `init-suitable-template.ts` | `init_suitable_template` | Select and import the most appropriate project template |
| `initialize-slides.ts` | `initialize_slides` | Set up presentation slide structure |
| `queue-request.ts` | `queue_request` | Relay user modification requests to the generation agent |
| `read-files.ts` | `read_files` | Read file contents from the generated project |
| `regenerate-file.ts` | `regenerate_file` | Regenerate a specific file (used during fixing and debugging) |
| `rename-project.ts` | `rename_project` | Rename the project |
| `run-analysis.ts` | `run_analysis` | Run static analysis on generated code |
| `virtual-filesystem.ts` | `virtual_filesystem` | Filesystem operations on the in-memory project tree |
| `wait-for-debug.ts` | `wait_for_debug` | Wait for a debug session to complete |
| `wait-for-generation.ts` | `wait_for_generation` | Wait for a generation phase to complete |
| `wait.ts` | `wait` | Wait for sandbox state changes |
| `web-search.ts` | `web_search` | Search the web for documentation or context |

### 5.5 Database Layer

The database layer uses Drizzle ORM backed by Cloudflare D1 (SQLite). The schema is defined in `worker/database/schema.ts`. Each domain has a dedicated service class in `worker/database/services/`.

**Schema tables by group:**

| Group | Tables |
|---|---|
| User / Auth | `users`, `sessions`, `api_keys`, `oauth_states`, `auth_attempts`, `password_reset_tokens`, `email_verification_tokens`, `verification_otps` |
| Apps | `apps`, `favorites`, `stars` |
| Community | `app_likes`, `app_comments`, `comment_likes` |
| Analytics | `app_views` |
| Configuration | `user_model_configs`, `user_model_providers`, `system_settings` |
| Security | `audit_logs` |

**Migration workflow:**

```
bun run db:generate        # Generate migration files from schema changes
bun run db:migrate:local   # Apply migrations to local D1
bun run db:studio          # Inspect local DB in Drizzle Studio
bun run db:migrate:remote  # Apply migrations to production D1
```

### 5.6 API Endpoints Reference

#### Auth (`authRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Create new account with email/password |
| `POST` | `/api/auth/login` | Public | Login, receive access token + refresh cookie |
| `POST` | `/api/auth/verify-email` | Public | Verify email with OTP code |
| `POST` | `/api/auth/resend-verification` | Public | Resend email verification OTP |
| `GET` | `/api/auth/check` | Public | Check auth status (returns user if valid session) |
| `GET` | `/api/auth/csrf-token` | Public | Retrieve CSRF token |
| `GET` | `/api/auth/providers` | Public | List available OAuth providers |
| `GET` | `/api/auth/profile` | Authenticated | Get current user profile |
| `POST` | `/api/auth/logout` | Authenticated | Invalidate session and clear cookies |
| `GET` | `/api/auth/sessions` | Authenticated | List active sessions |
| `DELETE` | `/api/auth/sessions/:id` | Authenticated | Revoke a specific session |
| `GET` | `/api/auth/api-keys` | Authenticated | List API keys |
| `POST` | `/api/auth/api-keys` | Authenticated | Create API key |
| `DELETE` | `/api/auth/api-keys/:id` | Authenticated | Revoke API key |
| `GET` | `/api/auth/oauth/:provider` | Public | Initiate OAuth flow |
| `GET` | `/api/auth/oauth/:provider/callback` | Public | OAuth callback handler |

#### Apps (`appRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/apps` | Public | List public apps |
| `GET` | `/api/apps/mine` | Authenticated | List current user's apps |
| `GET` | `/api/apps/recent` | Authenticated | List recently accessed apps |
| `GET` | `/api/apps/favorites` | Authenticated | List favorited apps |
| `POST` | `/api/apps/:id/star` | Authenticated | Star an app |
| `DELETE` | `/api/apps/:id/star` | Authenticated | Unstar an app |
| `POST` | `/api/apps/:id/favorite` | Authenticated | Favorite an app |
| `DELETE` | `/api/apps/:id/favorite` | Authenticated | Unfavorite an app |
| `GET` | `/api/apps/:id` | Public | Get app details |
| `PUT` | `/api/apps/:id` | Owner only | Update app metadata |
| `PATCH` | `/api/apps/:id/visibility` | Owner only | Change app visibility |
| `DELETE` | `/api/apps/:id` | Owner only | Delete app |
| `GET` | `/api/apps/:id/git-token` | Owner only | Get git access token for app |

#### User (`userRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users/:id/apps` | Public | List a user's public apps (paginated) |
| `PATCH` | `/api/users/profile` | Authenticated | Update profile (display name, avatar) |

#### Stats (`statsRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/stats/me` | Authenticated | Current user stats (app count, stars, etc.) |
| `GET` | `/api/stats/activity` | Authenticated | User activity timeline |

#### Analytics (`analyticsRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/analytics/user` | Authenticated | Aggregated user analytics |
| `GET` | `/api/analytics/agent` | Authenticated | Agent usage and token analytics |

#### Agent / CodeGen (`codegenRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/agent/session` | Authenticated | Create a new agent session (returns agentId) |
| `GET` | `/api/agent/:id/ws` | Authenticated | WebSocket upgrade endpoint |
| `GET` | `/api/agent/:id/connect` | Authenticated | Alternative WebSocket connect path |
| `GET` | `/api/agent/:id/preview` | Authenticated | Get preview URL for sandbox |
| `GET` | `/api/agent/:id/download` | Authenticated | Download build artifact |

#### Model Config (`modelConfigRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/model-config` | Authenticated | List user model configurations |
| `GET` | `/api/model-config/defaults` | Authenticated | Get platform default model configs |
| `GET` | `/api/model-config/byok-providers` | Authenticated | List BYOK-compatible providers |
| `GET` | `/api/model-config/:operation` | Authenticated | Get config for a specific operation |
| `PUT` | `/api/model-config/:operation` | Authenticated | Update config for a specific operation |
| `DELETE` | `/api/model-config/:operation` | Authenticated | Delete override for a specific operation |
| `POST` | `/api/model-config/test` | Authenticated | Test a model configuration |
| `DELETE` | `/api/model-config` | Authenticated | Reset all model configs to defaults |

#### Model Providers (`modelProviderRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/model-providers` | Authenticated | List user model providers |
| `POST` | `/api/model-providers` | Authenticated | Add a model provider |
| `PUT` | `/api/model-providers/:id` | Authenticated | Update a model provider |
| `DELETE` | `/api/model-providers/:id` | Authenticated | Remove a model provider |
| `POST` | `/api/model-providers/:id/test` | Authenticated | Test connectivity for a provider |

#### Vault / Secrets (`userSecretsRoutes.ts`, `secretsRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/vault/unlock` | Authenticated | Unlock vault with master password |
| `POST` | `/api/vault/lock` | Authenticated | Lock vault |
| `GET` | `/api/vault/status` | Authenticated | Check vault lock state |
| `GET` | `/api/secrets/templates` | Authenticated | List available secret templates |

#### GitHub Export (`githubExporterRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/github/authorize` | Authenticated | Initiate GitHub OAuth for export |
| `POST` | `/api/github/export` | Authenticated | Export project to GitHub repository |
| `GET` | `/api/github/check-remote` | Authenticated | Check if remote repository exists |

#### Status / Capabilities (`statusRoutes.ts`, `capabilitiesRoutes.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/status` | Public | Platform status |
| `GET` | `/api/capabilities` | Public | Feature flags and platform capabilities |

#### Health (`index.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Worker health check |

### 5.7 Authentication and Security

**Token model:**

Access tokens are short-lived JWTs. Refresh tokens are stored in httpOnly cookies and used to reissue access tokens without re-authentication. JWT signing uses the `JWT_SECRET` environment variable.

**OAuth flow:**

1. Client calls `GET /api/auth/oauth/:provider` -- server generates state, stores in `oauth_states` table, redirects to provider
2. Provider redirects to `GET /api/auth/oauth/:provider/callback` with code + state
3. Server verifies state, exchanges code for tokens, creates or updates the user record, sets cookies

Supported providers: Google, GitHub.

**Email/password flow:**

Registration triggers OTP email verification. The OTP is stored in `verification_otps`. Login is blocked until email is verified. Password resets use `password_reset_tokens` with short expiry.

**CSRF protection:**

CSRF tokens have a 7200-second expiry. The `api-client.ts` on the frontend automatically retries on a 403 by refreshing the token. The middleware is in `worker/middleware/`.

**Rate limiting:**

| Limiter | Limit | Window |
|---|---|---|
| `API_RATE_LIMITER` | 10,000 requests | 60 seconds |
| `AUTH_RATE_LIMITER` | 1,000 requests | 60 seconds |

Rate limiting is enforced by the `DORateLimitStore` Durable Object using a sliding window algorithm.

**Vault crypto model:**

The vault uses a zero-knowledge design. The server never has access to plaintext secrets.

| Component | Description |
|---|---|
| VMK (Vault Master Key) | Derived client-side from the user's master password via Argon2id; never sent to the server |
| SK (Session Key) | Random per-session key generated on the server |
| Server storage | Server holds only `AES-GCM(SK, VMK)` in DO memory; DB stores only ciphertext blobs |
| Security property | A DB dump produces only useless encrypted blobs; server memory alone requires the client SK to be useful |

RPC methods on `UserSecretsStore` return `null` or `boolean` on error and never throw exceptions.

**Auth middleware levels:**

| Level | Description |
|---|---|
| `public` | No authentication required |
| `authenticated` | Valid session or API key required |
| `ownerOnly` | Authenticated + resource ownership verified |

**Security-sensitive files requiring extra scrutiny:**

- `worker/services/secrets/` -- vault crypto implementation
- `worker/middleware/` -- CSRF and WebSocket security
- `worker/utils/authUtils.ts` -- JWT signing and verification
- Any file handling user input or external data (injection, authorization checks)

### 5.8 WebSocket Protocol

Clients connect to `/api/agent/{agentId}/ws` after session creation. The connection is upgraded to a WebSocket handled by the `CodeGeneratorAgent` Durable Object.

**Connection lifecycle:**

1. Client sends initial connect message
2. Server responds with `agent_connected` containing a full state snapshot -- all files, conversation history, current dev state
3. Client restores UI from snapshot
4. Subsequent messages are real-time events

**Message deduplication:**

Tool execution during generation causes duplicate AI messages. The backend skips redundant LLM calls when tool results are empty. The frontend deduplicates both live and restored messages using utility functions in `src/routes/chat/utils/`.

**Message categories and key types:**

| Category | Message Types |
|---|---|
| Agent State | `cf_agent_state`, `agent_connected`, `template_updated` |
| Conversation | `conversation_state`, `conversation_response`, `conversation_cleared` |
| Code Generation | `generation_started`, `file_generating`, `file_chunk_generated`, `file_generated`, `generation_complete` |
| Code Review | `code_reviewing`, `code_reviewed`, `runtime_error_found`, `static_analysis_results` |
| Phased Generation | `phase_generating`, `phase_generated`, `phase_implementing`, `phase_implemented` |
| Deployment | `deployment_started`, `deployment_completed`, `deployment_failed` |
| Preview | `preview_force_refresh`, `screenshot_capture_*`, `screenshot_analysis_result` |
| GitHub Export | `github_export_started`, `github_export_progress`, `github_export_completed`, `github_export_error` |
| Commands | `command_executing`, `command_executed`, `command_execution_failed` |
| Terminal | `terminal_command`, `terminal_output`, `server_log` |
| Model Config | `model_configs_info` |
| EAS Builds | `eas_build_status`, `eas_build_complete`, `eas_build_error` |
| Vault | `vault_unlocked`, `vault_locked`, `vault_required` |

**Three layers that must stay in sync when adding or modifying message types:**

| Layer | File |
|---|---|
| Type definitions | `worker/api/websocketTypes.ts` |
| Backend handler | `worker/agents/core/websocket.ts` |
| Frontend handler | `src/routes/chat/utils/handle-websocket-message.ts` |

Modifying a WebSocket message type without updating all three layers will result in silent failures where either the backend sends a message the frontend ignores or the frontend expects a field that no longer exists.

## 6. Frontend Architecture

### 6.1 Tech Stack and Build

- React 19, Vite (with Rolldown), TypeScript, TailwindCSS, Radix UI primitives

| Command | Description |
|---|---|
| `bun run dev` | Start dev server (localhost:5173) |
| `bun run build` | tsc + vite build (produces dist/) |
| `bun run typecheck` | Type-check without emitting |

### 6.2 Routing

React Router v7. All routes defined in `src/routes.ts`.

| Path | Component | Protected |
|---|---|---|
| `/` | Home | No |
| `/chat/:chatId` | Chat | No |
| `/profile` | Profile | Yes |
| `/settings` | Settings | Yes |
| `/apps` | AppsPage | Yes |
| `/app/:id` | AppView | No |
| `/discover` | DiscoverPage | No |

### 6.3 Context Providers

| Provider | File | Purpose |
|---|---|---|
| AuthContext | `src/contexts/auth-context.tsx` | User state, login/logout, token refresh, OAuth, intended URL management |
| AppsDataContext | `src/contexts/apps-data-context.tsx` | User's app list, pagination, filtering, sorting |
| VaultContext | `src/contexts/vault-context.tsx` | Secret vault management, encryption/decryption, master password |
| ThemeContext | `src/contexts/theme-context.tsx` | Dark/light/system theme switching and persistence |
| MobileViewContext | `src/contexts/mobile-view-context.tsx` | Responsive UI state management |

### 6.4 API Client

Singleton `apiClient` exported from `src/lib/api-client.ts`. Type-safe methods with TypeScript generics.

- CSRF token management -- automatically fetches and attaches CSRF tokens, refreshes on 403
- 401 interception -- triggers global auth modal via `setGlobalAuthModalTrigger()`
- Anonymous session token tracking via localStorage

| Domain | Methods |
|---|---|
| Auth | loginWithEmail, register, verifyEmail, getProfile, logout, getCsrfToken, initiateOAuth |
| Apps | getUserApps, getPublicApps, createApp, updateApp, deleteApp, getAppDetails, toggleFavorite, toggleAppStar |
| User | getUserAppsWithPagination, updateProfile |
| Stats | getUserStats, getUserActivity |
| Analytics | getUserAnalytics, getAgentAnalytics |
| Model Config | getModelConfigs, updateModelConfig, testModelConfig, resetAllModelConfigs |
| Model Providers | getModelProviders, createModelProvider, updateModelProvider, deleteModelProvider, testModelProvider |
| Vault | getVaultStatus, getVaultConfig, setupVault, resetVault |
| GitHub | initiateGitHubOAuth, initiateGitHubExport, checkRemoteStatus |
| Agent | createAgentSession (streaming), connectToAgent, deployPreview |

### 6.5 Type System

- Single source of truth: `src/api-types.ts` re-exports types from worker code
- Frontend always imports from `@/api-types`, never directly from worker

| Category | Description |
|---|---|
| App | App entity, app metadata, app list pagination |
| User | User profile, user stats, user activity |
| Auth | Login, registration, token, OAuth |
| Analytics | User analytics, agent analytics |
| Model Config | Per-operation model configuration |
| Model Provider | Provider definitions and credentials |
| Agent/CodeGen | Code generation state, phases, blueprint |
| WebSocket | All request and response message types |
| Vault | Vault status, config, setup |
| Image Attachment | File upload metadata |
| Error | Typed API error responses |

### 6.6 Chat Interface and WebSocket

- Chat page (`/chat/:chatId`) establishes WebSocket to agent via PartySocket
- Message handling in `src/routes/chat/utils/handle-websocket-message.ts`
- Real-time updates: file content streams as it generates, phase progress tracking, preview URL iframe updates
- Monaco Editor for viewing and editing generated code files
- State restoration on page refresh via `agent_connected` WebSocket message (includes full state snapshot)

### 6.7 Key Libraries

| Library | Purpose |
|---|---|
| Monaco Editor | In-browser code editor for viewing/editing generated files |
| Framer Motion | Animations and transitions |
| Recharts | Analytics charts and graphs |
| react-markdown | Rendering markdown content in chat and descriptions |
| PartySocket | WebSocket client with automatic reconnection |
| Sonner | Toast notifications |
| Embla Carousel | Carousel components |
| Lucide React | Icon library |

## 7. SDK Package

The `@cf-vibesdk/sdk` package provides programmatic access to vibesdk for building integrations, automation, and custom tooling.

### 7.1 Overview

- Standalone library in the `sdk/` directory with its own `package.json`
- Package name: `@cf-vibesdk/sdk`, version: `0.0.3`
- ES module (`"type": "module"`)
- Two entry points: `.` (browser-compatible default) and `./node` (Node.js specific)
- Source files in `sdk/src/`

### 7.2 Core Classes

| Class | File | Purpose |
|---|---|---|
| VibeClient | `sdk/src/client.ts` | Main entry point -- authentication, app management, session creation |
| BuildSession | `sdk/src/session.ts` | Long-lived session managing a single build lifecycle |
| PhasicClient | `sdk/src/phasic.ts` | Phasic (phase-based) behavior wrapper |
| AgenticClient | `sdk/src/agentic.ts` | Agentic (autonomous) behavior wrapper |
| WorkspaceStore | `sdk/src/workspace.ts` | File system workspace management |
| SessionStateStore | `sdk/src/state.ts` | Session state persistence and recovery |

### 7.3 Usage Examples

```typescript
import { VibeClient } from '@cf-vibesdk/sdk';

// Create a client
const client = new VibeClient({
  baseUrl: 'https://your-instance.example.com',
  credentials: { apiKey: 'your-api-key' }
});

// Build an app from a prompt
const session = await client.build('Create a todo app with authentication', {
  projectType: 'app'
});

// Connect to an existing session
const existing = await client.connect('agent-id-here');

// List apps
const publicApps = await client.apps.listPublic();
const myApps = await client.apps.listMine();
const app = await client.apps.get('app-id');

// Get git clone token
const token = await client.apps.getGitCloneToken('app-id');
```

### 7.4 Event System

`BuildSession` emits events for tracking generation progress. State types exported from the SDK:

- `ConnectionState` -- WebSocket connection status
- `GenerationState` -- current generation phase
- `PhaseState` -- individual phase progress
- `SessionState` -- overall session state

WebSocket message types are also available to SDK consumers for lower-level integration.

### 7.5 Utilities

- `BlueprintStreamParser` -- parse streamed blueprint data from the API
- `blueprintToMarkdown()` -- convert a blueprint object to human-readable markdown
- `withTimeout(promise, ms)` -- wrap async operations with a timeout; throws `TimeoutError` on expiry

### 7.6 Testing

```bash
# Unit tests
cd sdk && bun test test/*.test.ts

# Integration tests (requires API key)
cd sdk && bun test --timeout 600000 test/integration/*.test.ts
```

Integration tests require the `VIBESDK_INTEGRATION_API_KEY` environment variable.
