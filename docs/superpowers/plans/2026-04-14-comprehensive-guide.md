# Comprehensive Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write `docs/comprehensive-guide.md` -- a single authoritative document (~2000-2500 lines) that takes a reader from "what is vibesdk?" to "I can confidently modify, deploy, and debug it."

**Architecture:** Single markdown file with 9 progressively deeper sections. Each task writes one section, verifies referenced paths exist, and commits. No code changes -- documentation only.

**Tech Stack:** Markdown, referencing existing codebase at verified file paths.

**Spec:** `docs/superpowers/specs/2026-04-14-comprehensive-guide-design.md`

---

## File Map

- **Create:** `docs/comprehensive-guide.md` -- the entire deliverable, built incrementally across 10 tasks

---

### Task 1: Create document skeleton with Table of Contents

**Files:**
- Create: `docs/comprehensive-guide.md`

- [ ] **Step 1: Create the file with title, intro paragraph, and full TOC**

Write `docs/comprehensive-guide.md` with this exact content:

```markdown
# vibesdk: The Complete Guide

> From "what is this?" to "I can build, deploy, and debug it" -- a single document covering everything about vibesdk.

vibesdk is an AI-powered full-stack application generation platform built on Cloudflare infrastructure. Users describe an app in natural language; the platform generates production-ready code, previews it in a live sandbox, and deploys it to Cloudflare Workers -- all in real time.

This guide progresses from high-level overview to deep internals. Read it cover-to-cover, or jump to any section via the table of contents.

**Related documentation:**
- `docs/setup.md` -- Quick-start setup guide
- `docs/architecture-diagrams.md` -- Mermaid architecture diagrams
- `docs/llm.md` -- LLM-focused developer reference

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
```

- [ ] **Step 2: Verify the file was created**

Run: `head -30 docs/comprehensive-guide.md`
Expected: The title, intro paragraph, and start of the TOC.

- [ ] **Step 3: Commit**

```bash
git add docs/comprehensive-guide.md
git commit -m "docs: create comprehensive guide skeleton with TOC"
```

---

### Task 2: Write Section 1 -- Project Overview

**Files:**
- Modify: `docs/comprehensive-guide.md` (append after the `---` following the TOC)

**Context needed:** The spec's Section 1 defines the tech stack table, project structure tree, and worker subdirectory breakdown. All directory paths were verified to exist.

- [ ] **Step 1: Append Section 1 to the document**

Append after the final `---` of the TOC. Section 1 must include:

1. **Section heading:** `## 1. Project Overview`
2. **What vibesdk does** -- 2-3 paragraph explanation: user describes app in natural language, platform selects a template, generates a blueprint, implements code in phases, deploys to a sandbox container, provides live preview, supports iterative refinement, and can deploy to Cloudflare Workers.
3. **Tech stack table** -- exactly as specified:

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

4. **Architecture overview** -- text description of the three-tier architecture (frontend -> API/Workers -> Cloudflare infrastructure), referencing `docs/architecture-diagrams.md` for visual diagrams.

5. **Project structure tree** with one-line descriptions for all top-level directories:
   - `src/` -- React frontend
   - `worker/` -- Cloudflare Workers backend
   - `shared/` -- Shared types between frontend and backend
   - `sdk/` -- Client SDK (`@cf-vibesdk/sdk`)
   - `migrations/` -- D1 database migrations
   - `container/` -- Sandbox container tooling
   - `scripts/` -- Deploy, setup, undeploy scripts
   - `docs/` -- Documentation and Postman collection
   - `debug-tools/` -- Analysis scripts

6. **Worker subdirectory breakdown** -- all 14 subdirectories listed with descriptions:
   - `worker/agents/core/` -- CodeGeneratorAgent, behaviors, state machine, WebSocket handler
   - `worker/agents/operations/` -- PhaseGeneration, PhaseImplementation, UserConversationProcessor, DeepDebugger, FileRegeneration, PostPhaseCodeFixer
   - `worker/agents/planning/` -- Blueprint generation, template selection
   - `worker/agents/tools/toolkit/` -- LLM tools
   - `worker/agents/inferutils/` -- Inference pipeline, model config, tool execution, loop detection
   - `worker/agents/output-formats/` -- SCOF streaming format parser
   - `worker/agents/git/` -- isomorphic-git wrapper, SQLite filesystem adapter
   - `worker/agents/services/` -- FileManager, DeploymentManager
   - `worker/agents/utils/` -- Template customizer, prompt utilities
   - `worker/api/routes/` -- HTTP route definitions
   - `worker/api/controllers/` -- Request handlers
   - `worker/database/` -- Drizzle ORM schema, service layer
   - `worker/services/` -- Sandbox, secrets, oauth, rate-limit, deployer, etc.
   - `worker/middleware/` -- CSRF, WebSocket security, auth

- [ ] **Step 2: Verify all referenced directories exist**

Run: `ls -d src/ worker/ shared/ sdk/ migrations/ container/ scripts/ docs/ debug-tools/ worker/agents/core/ worker/agents/operations/ worker/agents/planning/ worker/agents/tools/toolkit/ worker/agents/inferutils/ worker/agents/output-formats/ worker/agents/git/ worker/agents/services/ worker/agents/utils/ worker/api/routes/ worker/api/controllers/ worker/database/ worker/services/ worker/middleware/`
Expected: All directories listed without errors.

- [ ] **Step 3: Verify section was appended correctly**

Run: `grep -c "## 1. Project Overview" docs/comprehensive-guide.md`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add docs/comprehensive-guide.md
git commit -m "docs: add Section 1 - Project Overview"
```

---

### Task 3: Write Section 2 -- Prerequisites and Local Setup

**Files:**
- Modify: `docs/comprehensive-guide.md` (append after Section 1)

**Context needed:** The spec's Section 2 covers software requirements, Cloudflare account setup, API token permissions, automated and manual setup paths, database setup, dev server, AI provider config, and troubleshooting. Reference `.dev.vars.example` for env var names.

- [ ] **Step 1: Read `.dev.vars.example` for exact variable names**

Run: `cat .dev.vars.example`
Use the actual variable names and structure in the documentation.

- [ ] **Step 2: Append Section 2 to the document**

Section 2 must include all 9 subsections from the spec:

1. `### 2.1 Required Software` -- Node.js 18+, Bun, Docker, Git with install commands
2. `### 2.2 Cloudflare Account` -- free vs paid tier features
3. `### 2.3 API Token Creation` -- step-by-step with exact permissions list from spec
4. `### 2.4 Automated Setup (Recommended)` -- `bun install && bun run setup` walkthrough of each interactive prompt
5. `### 2.5 Manual Setup` -- copy `.dev.vars.example`, every env var documented with description/required/where-to-get, wrangler CLI commands for resource creation:
   ```bash
   npx wrangler kv namespace create VibecoderStore
   npx wrangler d1 create vibesdk-db
   npx wrangler r2 bucket create vibesdk-templates
   ```
   Updating `wrangler.jsonc` with resource IDs
6. `### 2.6 Database Setup` -- `bun run db:generate`, `bun run db:migrate:local`, `bun run db:studio`
7. `### 2.7 Starting Development` -- `bun run dev`, localhost:5173, first account registration
8. `### 2.8 AI Provider Configuration` -- Gemini default, editing `config.ts` for other providers, PLATFORM vs DEFAULT config
9. `### 2.9 Troubleshooting` -- WARP, D1/R2 unauthorized, AI Gateway, Docker, corporate SSL

- [ ] **Step 3: Verify section appended**

Run: `grep -c "## 2. Prerequisites and Local Setup" docs/comprehensive-guide.md`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add docs/comprehensive-guide.md
git commit -m "docs: add Section 2 - Prerequisites and Local Setup"
```

---

### Task 4: Write Section 3 -- Templates System

**Files:**
- Modify: `docs/comprehensive-guide.md` (append after Section 2)

**Context needed:** The spec's Section 3 covers template types, data structures (`TemplateInfo`, `TemplateDetails`), R2 storage, selection flow, customization, placeholder system, and deployment. Key source files:
- `worker/services/sandbox/sandboxTypes.ts` -- TemplateInfo/TemplateDetails schemas
- `worker/agents/planning/templateSelector.ts` -- selectTemplate(), predictProjectType()
- `worker/agents/utils/templateCustomizer.ts` -- customizeTemplateFiles()
- `worker/services/sandbox/templateParser.ts` -- TemplateParser
- `worker/agents/tools/toolkit/init-suitable-template.ts` -- init tool

- [ ] **Step 1: Append Section 3 to the document**

Section 3 must include all 8 subsections from the spec:

1. `### 3.1 What Templates Are` -- scaffolds in R2, templates repo URL
2. `### 3.2 Project Types` -- table with type, use case, behavior, sandbox columns
3. `### 3.3 Template Data Structure` -- `TemplateInfo` fields (name, language, frameworks, projectType, description, renderMode, slideDirectory, disabled, initCommand) and `TemplateDetails` fields (fileTree, allFiles, deps, importantFiles, dontTouchFiles, redactedFiles), with source file reference `worker/services/sandbox/sandboxTypes.ts`
4. `### 3.4 Template Storage` -- R2 bucket names, catalog as `template_catalog.json`, templates as `.zip`
5. `### 3.5 Template Selection Flow` -- numbered flow: predictProjectType -> selectTemplate (filter disabled, filter by type, auto-select or AI inference) -> TemplateSelection output fields, with source reference `worker/agents/planning/templateSelector.ts`
6. `### 3.6 Template Import and Customization` -- importTemplate, customizeTemplateFiles steps, source reference `worker/agents/utils/templateCustomizer.ts`
7. `### 3.7 Template Placeholder System` -- `{{KV_ID}}`, `{{D1_ID}}`, TemplateParser class, source reference `worker/services/sandbox/templateParser.ts`
8. `### 3.8 Deploying Templates to R2` -- deploy script clones repo, runs `deploy_templates.sh`

- [ ] **Step 2: Verify key source files exist**

Run: `ls worker/services/sandbox/sandboxTypes.ts worker/agents/planning/templateSelector.ts worker/agents/utils/templateCustomizer.ts worker/services/sandbox/templateParser.ts worker/agents/tools/toolkit/init-suitable-template.ts`
Expected: All 5 files listed.

- [ ] **Step 3: Commit**

```bash
git add docs/comprehensive-guide.md
git commit -m "docs: add Section 3 - Templates System"
```

---

### Task 5: Write Section 4 -- Complete App Generation Flow

**Files:**
- Modify: `docs/comprehensive-guide.md` (append after Section 3)

**Context needed:** The spec's Section 4 traces the full generation journey across 10 subsections. Key source files:
- `worker/api/controllers/agent/controller.ts` -- session creation
- `worker/agents/planning/blueprint.ts` -- blueprint generation
- `worker/agents/core/state.ts` -- state machine, CurrentDevState enum
- `worker/agents/core/behaviors/phasic.ts` -- phasic behavior
- `worker/agents/core/behaviors/agentic.ts` -- agentic behavior
- `worker/agents/operations/PhaseGeneration.ts`
- `worker/agents/operations/PhaseImplementation.ts`
- `worker/agents/output-formats/streaming-formats/scof.ts` -- SCOF parser
- `worker/agents/operations/PostPhaseCodeFixer.ts`
- `worker/agents/assistants/realtimeCodeFixer.ts`
- `worker/services/sandbox/BaseSandboxService.ts`
- `worker/agents/operations/UserConversationProcessor.ts`
- `worker/agents/operations/DeepDebugger.ts`

- [ ] **Step 1: Append Section 4 to the document**

Section 4 must include all 10 subsections from the spec:

1. `### 4.1 Session Initialization` -- POST /api/agent, CodeGenArgs, agent ID generation, WebSocket URL, behavior type resolution
2. `### 4.2 Blueprint Generation` -- template selection reference to Section 3, generateBlueprint(), blueprint schema fields, streaming
3. `### 4.3 State Machine (Phasic Behavior)` -- state diagram: `IDLE -> PHASE_GENERATING -> PHASE_IMPLEMENTING -> REVIEWING -> FINALIZING -> IDLE`, CodeGenState key fields, single-threaded per DO
4. `### 4.4 Phase Generation` -- PhaseGenerationOperation, analyzes codebase, designs next milestone, output schema
5. `### 4.5 Phase Implementation` -- PhaseImplementationOperation, SCOF format (`FILE {path}\n{content}\nEOF`), streaming callbacks, WebSocket messages, RealtimeCodeFixer
6. `### 4.6 Code Review and Fixing` -- FastCodeFixerOperation (up to 5 iterations), RealtimeCodeFixer checks list (render loops, imports, undefined vars, syntax, Tailwind, nested Router), static analysis
7. `### 4.7 Sandbox Deployment` -- LocalSandboxService vs RemoteSandboxService, write files -> run commands -> preview URL, runtime error/log fetching
8. `### 4.8 User Conversation and Iteration` -- UserConversationProcessor, tools (queue_request, get_logs, deep_debug, git, deploy_preview, web_search), conversational interface
9. `### 4.9 Deep Debugger` -- autonomous debugging agent, full tool access, high reasoning effort, cannot run during generation, returns transcript
10. `### 4.10 Agentic Behavior` -- used for presentation/workflow/general, LLM-driven loop with plan string, no predefined phases

- [ ] **Step 2: Verify key source files exist**

Run: `ls worker/agents/core/state.ts worker/agents/operations/PhaseGeneration.ts worker/agents/operations/PhaseImplementation.ts worker/agents/operations/DeepDebugger.ts worker/agents/operations/UserConversationProcessor.ts worker/agents/core/behaviors/phasic.ts worker/agents/core/behaviors/agentic.ts`
Expected: All 7 files listed.

- [ ] **Step 3: Commit**

```bash
git add docs/comprehensive-guide.md
git commit -m "docs: add Section 4 - Complete App Generation Flow"
```

---

### Task 6: Write Section 5 -- Backend Architecture

**Files:**
- Modify: `docs/comprehensive-guide.md` (append after Section 4)

**Context needed:** The spec's Section 5 covers worker entry, DOs, inference pipeline, tool system, database layer, API endpoints, auth/security, and WebSocket protocol. This is the largest section. Key source files:
- `worker/index.ts` -- entry point
- `worker/agents/inferutils/config.ts` -- model config
- `worker/agents/inferutils/loopDetection.ts` -- loop detection
- `worker/agents/tools/customTools.ts` -- tool registration
- `worker/database/schema.ts` -- DB schema
- `worker/api/routes/` -- all route files
- `worker/api/websocketTypes.ts` -- WS message types
- `worker/agents/core/websocket.ts` -- WS handler
- `worker/middleware/` -- auth, CSRF
- `worker/utils/authUtils.ts` -- auth utilities
- `worker/services/secrets/` -- vault crypto

- [ ] **Step 1: Read the route index to get actual route file list**

Run: `ls worker/api/routes/`
Use the actual file list when documenting API endpoints.

- [ ] **Step 2: Read the database schema table names**

Run: `grep "export const" worker/database/schema.ts | head -30`
Use actual table names in the documentation.

- [ ] **Step 3: Read the tools directory for actual tool file list**

Run: `ls worker/agents/tools/toolkit/`
Use actual tool names in the documentation.

- [ ] **Step 4: Append Section 5 to the document**

Section 5 must include all 8 subsections from the spec:

1. `### 5.1 Worker Entry Point and Routing` -- worker/index.ts, Hono, route registration pattern
2. `### 5.2 Durable Objects` -- table of all 5 DOs (CodeGeneratorAgent/CodeGenObject, UserAppSandboxService/Sandbox, DORateLimitStore, UserSecretsStore, GlobalDurableObject), note about Agent framework
3. `### 5.3 Inference Pipeline` -- call flow diagram, AI Gateway URL format, PLATFORM vs DEFAULT config, per-operation config keys, user overrides, loop detection
4. `### 5.4 Tool System` -- factory pattern, buildTools vs buildDebugTools, tool listing with descriptions from actual toolkit/ files
5. `### 5.5 Database Layer` -- Drizzle/D1, schema.ts, tables grouped (User/Auth, Apps, Community, Analytics, Configuration, Security), service layer pattern, migration workflow
6. `### 5.6 API Endpoints Reference` -- complete table grouped by domain (Auth, Apps, User, Stats, Analytics, Agent/CodeGen, Model Config, Model Providers, Vault, GitHub, Status, Health) with method, path, auth level, description
7. `### 5.7 Authentication and Security` -- JWT + httpOnly cookies, OAuth flow, email/password + OTP, CSRF, rate limiting config, vault crypto model (VMK/SK/AES-GCM), auth middleware levels, security-sensitive paths
8. `### 5.8 WebSocket Protocol` -- connection flow, agent_connected state restoration, deduplication, message categories table, three-layer sync requirement

- [ ] **Step 5: Commit**

```bash
git add docs/comprehensive-guide.md
git commit -m "docs: add Section 5 - Backend Architecture"
```

---

### Task 7: Write Section 6 -- Frontend Architecture

**Files:**
- Modify: `docs/comprehensive-guide.md` (append after Section 5)

**Context needed:** The spec's Section 6 covers frontend tech, routing, context providers, API client, types, chat/WebSocket, and libraries. Key source files:
- `src/routes.ts` -- route definitions
- `src/contexts/` -- all context providers
- `src/lib/api-client.ts` -- API client
- `src/api-types.ts` -- type re-exports
- `src/routes/chat/utils/handle-websocket-message.ts` -- WS handler

- [ ] **Step 1: Verify frontend source files exist**

Run: `ls src/routes.ts src/api-types.ts src/lib/api-client.ts src/contexts/auth-context.tsx src/contexts/apps-data-context.tsx src/contexts/vault-context.tsx src/contexts/theme-context.tsx src/contexts/mobile-view-context.tsx`
Expected: All files listed.

- [ ] **Step 2: Append Section 6 to the document**

Section 6 must include all 7 subsections from the spec:

1. `### 6.1 Tech Stack and Build` -- React 19, Vite, TypeScript, TailwindCSS, Radix UI, build commands
2. `### 6.2 Routing` -- React Router v7, src/routes.ts, route table with path, component, and protected status
3. `### 6.3 Context Providers` -- table of 5 providers (Auth, AppsData, Vault, Theme, MobileView) with file path and purpose
4. `### 6.4 API Client` -- singleton apiClient, type-safe generics, CSRF management, 401 interception, anonymous session tokens, methods by category
5. `### 6.5 Type System` -- src/api-types.ts as single source of truth, import from `@/api-types`, type categories
6. `### 6.6 Chat Interface and WebSocket` -- PartySocket connection, handle-websocket-message.ts, real-time file streaming, Monaco Editor, state restoration
7. `### 6.7 Key Libraries` -- table of 8 libraries (Monaco, Framer Motion, Recharts, react-markdown, PartySocket, Sonner, Embla, Lucide)

- [ ] **Step 3: Commit**

```bash
git add docs/comprehensive-guide.md
git commit -m "docs: add Section 6 - Frontend Architecture"
```

---

### Task 8: Write Section 7 -- SDK Package

**Files:**
- Modify: `docs/comprehensive-guide.md` (append after Section 6)

**Context needed:** The spec's Section 7 covers the `@cf-vibesdk/sdk` package. Key source files:
- `sdk/package.json` -- package metadata
- `sdk/src/index.ts` -- exports
- `sdk/src/client.ts` -- VibeClient
- `sdk/src/session.ts` -- BuildSession
- `sdk/src/types.ts` -- type definitions

- [ ] **Step 1: Read sdk/package.json for accurate version and entry points**

Run: `cat sdk/package.json | head -20`
Use the actual version and entry points.

- [ ] **Step 2: Append Section 7 to the document**

Section 7 must include all 6 subsections from the spec:

1. `### 7.1 Overview` -- standalone library, sdk/ directory, package name/version, ES module, two entry points
2. `### 7.2 Core Classes` -- table of 6 classes (VibeClient, BuildSession, PhasicClient, AgenticClient, WorkspaceStore, SessionStateStore)
3. `### 7.3 Usage Examples` -- code blocks showing client construction, build(), connect(), app listing, git clone token
4. `### 7.4 Event System` -- BuildSession events, state types (ConnectionState, GenerationState, PhaseState, SessionState)
5. `### 7.5 Utilities` -- BlueprintStreamParser, blueprintToMarkdown, withTimeout/TimeoutError
6. `### 7.6 Testing` -- unit test command, integration test command with timeout, required env var

- [ ] **Step 3: Commit**

```bash
git add docs/comprehensive-guide.md
git commit -m "docs: add Section 7 - SDK Package"
```

---

### Task 9: Write Section 8 -- Deployment and Operations

**Files:**
- Modify: `docs/comprehensive-guide.md` (append after Section 7)

**Context needed:** The spec's Section 8 covers env vars, wrangler config, staging, database ops, deploy script, containers, AI Gateway, and CLI reference. Key source files:
- `.dev.vars.example` -- env var template
- `wrangler.jsonc` -- production config
- `wrangler.staging.jsonc` -- staging config
- `worker-configuration.d.ts` -- TypeScript env types
- `scripts/deploy.ts` -- deploy script
- `package.json` -- all scripts

- [ ] **Step 1: Read wrangler.jsonc for accurate binding names and IDs**

Run: `head -80 wrangler.jsonc`
Use actual binding names, not spec approximations.

- [ ] **Step 2: Append Section 8 to the document**

Section 8 must include all 9 subsections from the spec:

1. `### 8.1 Environment Variables Reference` -- complete table with Variable, Required, Description, Where to Get It columns, grouped by category
2. `### 8.2 Wrangler Configuration Anatomy` -- wrangler.jsonc binding-by-binding: d1_databases, kv_namespaces, r2_buckets, durable_objects, ai, containers, dispatch_namespaces, rate limiters, vars; staging differences
3. `### 8.3 worker-configuration.d.ts` -- what it is, when to update
4. `### 8.4 Staging Environment` -- staging resource names, domain, feature flags
5. `### 8.5 Database Operations` -- generate, apply local, verify, apply remote with exact commands
6. `### 8.6 Production Deployment` -- `bun run deploy`, 9-step deploy script walkthrough
7. `### 8.7 Container and Sandbox Configuration` -- production (CF Containers) vs local (Docker), image registry, instance types, corporate network SSL
8. `### 8.8 AI Gateway Setup` -- gateway name, auto-config, capabilities, manual setup
9. `### 8.9 CLI Commands Reference` -- complete table of all bun run scripts with descriptions

- [ ] **Step 3: Commit**

```bash
git add docs/comprehensive-guide.md
git commit -m "docs: add Section 8 - Deployment and Operations"
```

---

### Task 10: Write Section 9 -- Development Workflow and Contribution Guide

**Files:**
- Modify: `docs/comprehensive-guide.md` (append after Section 8)

**Context needed:** The spec's Section 9 covers code quality, testing, how-to recipes, naming conventions, core rules, debugging hotspots, security paths, and gotchas. This is the final section.

- [ ] **Step 1: Append Section 9 to the document**

Section 9 must include all 8 subsections from the spec:

1. `### 9.1 Code Quality Commands` -- typecheck, lint, knip commands
2. `### 9.2 Testing` -- Vitest with vitest-pool-workers, all test commands, SDK tests separate
3. `### 9.3 How-To Recipes` -- 5 recipes with numbered steps:
   - Add API endpoint (6 steps: types -> api-client -> service -> controller -> route -> register)
   - Add WebSocket message (3 steps: types -> backend handler -> frontend handler)
   - Add LLM tool (4 steps: create file -> export factory -> import in customTools -> add to buildTools)
   - Change LLM model (edit config.ts, modify DEFAULT or PLATFORM config)
   - Modify conversation behavior (edit UserConversationProcessor.ts SYSTEM_PROMPT)
4. `### 9.4 File Naming Conventions` -- table with type, convention, example
5. `### 9.5 Core Rules` -- 5 numbered rules (type safety, DRY, patterns, production-ready, naming)
6. `### 9.6 Debugging Hotspots` -- table with subsystem and what to check
7. `### 9.7 Security-Sensitive Paths` -- 4 paths with notes
8. `### 9.8 Gotchas` -- 4 gotchas (Vite env vars, WARP, Docker, setup.md reference)

- [ ] **Step 2: Verify final document structure**

Run: `grep "^## " docs/comprehensive-guide.md`
Expected: 10 lines (TOC header + 9 section headers).

- [ ] **Step 3: Count total lines**

Run: `wc -l docs/comprehensive-guide.md`
Expected: Between 1800-2800 lines.

- [ ] **Step 4: Verify all section anchors from TOC resolve**

Run: `grep -c "^## [0-9]" docs/comprehensive-guide.md`
Expected: `9` (sections 1-9).

- [ ] **Step 5: Commit**

```bash
git add docs/comprehensive-guide.md
git commit -m "docs: add Section 9 - Development Workflow and Contribution Guide"
```

---

## Post-Completion Verification

After all 10 tasks are done, run these final checks:

- [ ] **Line count check:** `wc -l docs/comprehensive-guide.md` -- should be 1800-2800 lines
- [ ] **Section count:** `grep -c "^## [0-9]" docs/comprehensive-guide.md` -- should be 9
- [ ] **Subsection count:** `grep -c "^### [0-9]" docs/comprehensive-guide.md` -- should be ~55-60
- [ ] **No TODOs:** `grep -ci "TODO\|TBD\|FIXME\|placeholder" docs/comprehensive-guide.md` -- should be 0
- [ ] **No broken internal links:** Each TOC entry's anchor matches a section heading
- [ ] **Referenced files exist:** Spot-check 5-10 file paths mentioned in the doc with `ls`
