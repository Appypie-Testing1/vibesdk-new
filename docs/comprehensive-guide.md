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
