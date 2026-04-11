# Claude Code Full-Stack Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure `.claude/` with hooks, 7 agents, 5 new skills, and 4 upgraded skills to maximize Claude Code effectiveness for the vibesdk team.

**Architecture:** Shell hook scripts wired through settings.json provide session context and file protection. Markdown agent definitions encode subsystem-specific knowledge. SKILL.md files automate multi-step workflows with exact file paths and code patterns from the codebase.

**Tech Stack:** Bash (hooks), Markdown with YAML frontmatter (agents, skills), JSON (settings)

---

### Task 1: Create Session Context Hook

**Files:**
- Create: `.claude/hooks/session-context.sh`

- [ ] **Step 1: Create the hook script**

```bash
#!/usr/bin/env bash
# Session context hook -- injects branch, recent commits, and working state
# Wired via settings.json SessionStart event

set -euo pipefail

echo "=== Session Context ==="

# Current branch and tracking
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
TRACKING=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "no upstream")
echo "Branch: $BRANCH (tracking: $TRACKING)"

# Ahead/behind upstream
if [ "$TRACKING" != "no upstream" ]; then
  AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "?")
  BEHIND=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo "?")
  echo "Ahead: $AHEAD / Behind: $BEHIND"
fi

# Last 5 commits (one-line)
echo ""
echo "Recent commits:"
git log --oneline -5 2>/dev/null || echo "(no commits)"

# Dirty state
DIRTY_COUNT=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
STAGED_COUNT=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "Uncommitted files: $DIRTY_COUNT (staged: $STAGED_COUNT)"

# Dev server status
if lsof -i :5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Dev server: RUNNING (port 5173)"
else
  echo "Dev server: not running"
fi

# Wrangler dev status
if lsof -i :8787 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Wrangler dev: RUNNING (port 8787)"
else
  echo "Wrangler dev: not running"
fi

echo "=== End Context ==="
```

- [ ] **Step 2: Make executable**

Run: `chmod +x .claude/hooks/session-context.sh`

- [ ] **Step 3: Verify it runs**

Run: `.claude/hooks/session-context.sh`
Expected: Output showing branch name, recent commits, dirty file count, server status.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/session-context.sh
git commit -m "feat: add session-context hook for Claude Code session startup"
```

---

### Task 2: Create Pre-Commit Guard Hook

**Files:**
- Create: `.claude/hooks/pre-commit-guard.sh`

- [ ] **Step 1: Create the guard script**

The hook receives tool input via the `$TOOL_INPUT` environment variable (JSON with `file_path` field for Edit/Write tools).

```bash
#!/usr/bin/env bash
# Pre-commit guard -- blocks edits to protected files
# Wired via settings.json PreToolUse event (matcher: Edit|Write)
# Exit 0 = allow, Exit 2 = block with message shown to Claude

set -euo pipefail

# Extract file path from tool input JSON
FILE_PATH=$(echo "$TOOL_INPUT" 2>/dev/null | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//' || echo "")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Resolve to relative path from repo root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
REL_PATH="${FILE_PATH#$REPO_ROOT/}"

# Protected paths and their reasons
check_protected() {
  local path="$1"

  case "$path" in
    migrations/*)
      echo "BLOCKED: $path is a migration file."
      echo "Reason: Schema changes must go through the generate workflow."
      echo "Use: /run-db-migration skill to generate and apply migrations safely."
      exit 2
      ;;
    .prod.vars|.dev.vars)
      echo "BLOCKED: $path contains secrets."
      echo "Reason: Environment secrets must be edited manually, never by AI."
      echo "Action: Edit this file manually outside of Claude Code."
      exit 2
      ;;
    wrangler.jsonc|wrangler.staging.jsonc)
      echo "BLOCKED: $path is infrastructure config."
      echo "Reason: Wrangler config changes affect production infrastructure."
      echo "Action: Review and edit manually, or explicitly tell Claude to proceed."
      exit 2
      ;;
    .github/workflows/*)
      echo "BLOCKED: $path is a CI/CD pipeline."
      echo "Reason: Workflow changes affect all team members and deployments."
      echo "Action: Review and edit manually, or explicitly tell Claude to proceed."
      exit 2
      ;;
    scripts/deploy.ts)
      echo "BLOCKED: $path is the production deployment script."
      echo "Reason: Changes to deploy logic can break production releases."
      echo "Action: Review and edit manually, or explicitly tell Claude to proceed."
      exit 2
      ;;
  esac
}

check_protected "$REL_PATH"

# Not protected -- allow
exit 0
```

- [ ] **Step 2: Make executable**

Run: `chmod +x .claude/hooks/pre-commit-guard.sh`

- [ ] **Step 3: Test with a protected path**

Run: `TOOL_INPUT='{"file_path": "/Users/sumitkumartiwari/Documents/VIBE/vibesdk-new/migrations/test.sql"}' .claude/hooks/pre-commit-guard.sh; echo "Exit: $?"`
Expected: "BLOCKED: migrations/test.sql is a migration file..." with exit code 2.

- [ ] **Step 4: Test with an allowed path**

Run: `TOOL_INPUT='{"file_path": "/Users/sumitkumartiwari/Documents/VIBE/vibesdk-new/src/lib/api-client.ts"}' .claude/hooks/pre-commit-guard.sh; echo "Exit: $?"`
Expected: No output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/pre-commit-guard.sh
git commit -m "feat: add pre-commit guard hook to protect sensitive files"
```

---

### Task 3: Update settings.json with New Hooks

**Files:**
- Modify: `.claude/settings.json`

- [ ] **Step 1: Update settings.json**

Replace the entire file with:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "code-review-graph status",
            "timeout": 3
          },
          {
            "type": "command",
            "command": ".claude/hooks/session-context.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/pre-commit-guard.sh",
            "timeout": 3
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "code-review-graph update --skip-flows",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate JSON**

Run: `python3 -c "import json; json.load(open('.claude/settings.json')); print('Valid JSON')"`
Expected: "Valid JSON"

- [ ] **Step 3: Verify .gitignore includes settings.local.json**

Run: `grep -q 'settings.local.json' .gitignore && echo "Already ignored" || echo "NEEDS ADDING"`
If "NEEDS ADDING": add `.claude/settings.local.json` to `.gitignore`.

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json
git commit -m "feat: wire session-context and pre-commit-guard hooks into settings.json"
```

---

### Task 4: Create Domain Expert Agents

**Files:**
- Create: `.claude/agents/durable-objects-expert.md`
- Create: `.claude/agents/websocket-expert.md`
- Create: `.claude/agents/sandbox-expert.md`
- Create: `.claude/agents/database-expert.md`
- Create: `.claude/agents/inference-expert.md`

- [ ] **Step 1: Create durable-objects-expert.md**

```markdown
---
name: durable-objects-expert
description: Deep knowledge of the CodeGeneratorAgent, Durable Object lifecycle, state machine, and behavior system
model: sonnet
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

You are a domain expert for the vibesdk Durable Object and agent system. You have deep knowledge of how the agent core works.

## Architecture

- `CodeGeneratorAgent` (worker/agents/core/codingAgent.ts) extends `Agent` from the Cloudflare "agents" package. It is NOT a raw DurableObject.
- Each chat session creates one `CodeGeneratorAgent` instance.
- Single-threaded per instance. Persistent state in SQLite, ephemeral state in memory.

## State Machine

States flow: IDLE -> PHASE_GENERATING -> PHASE_IMPLEMENTING -> REVIEWING -> IDLE

The `currentDevState` field on `CodeGenState` tracks the current position. The `shouldBeGenerating` flag indicates persistent user intent to generate.

## CodeGenState Fields

- Project Identity: `blueprint`, `projectName`, `templateName`
- File Management: `generatedFilesMap` (tracks all generated files)
- Phase Tracking: `generatedPhases`, `currentPhase`
- State Machine: `currentDevState`, `shouldBeGenerating`
- Sandbox: `sandboxInstanceId`, `commandsHistory`
- Conversation: `conversationMessages`, `pendingUserInputs`

## Behavior System

Selected at init via `behaviorType` prop:
- `phasic` (default): Phase-based generation. Breaks work into phases, generates then implements each.
- `agentic`: Autonomous LLM loop. The LLM drives the entire process with tool calls.

Behavior files: `worker/agents/core/behaviors/`
Objectives: `worker/agents/core/objectives/`

## Separate Durable Objects

- `DORateLimitStore` -- rate limiting per user
- `UserSecretsStore` -- encrypted API key storage (AES-GCM + Argon2id)
- `GlobalDurableObject` -- shared platform state

## Abort Controller Pattern

- `getOrCreateAbortController()` reuses controller for nested operations
- Cleared after top-level operations complete
- Shared by parent and nested tool calls
- User abort cancels entire operation tree

## Key Files

- Core agent: `worker/agents/core/codingAgent.ts`
- State types: `worker/agents/core/state.ts`
- Behaviors: `worker/agents/core/behaviors/`
- Objectives: `worker/agents/core/objectives/`
- Operations: `worker/agents/operations/`

## Guidelines

- Never modify the state machine transitions without understanding the full flow
- State changes must be atomic (spread + setState pattern)
- Test abort controller cleanup when adding nested async operations
- The agent is single-threaded; no concurrent mutation concerns within a single instance
```

- [ ] **Step 2: Create websocket-expert.md**

```markdown
---
name: websocket-expert
description: Deep knowledge of the WebSocket protocol, message types, reconnect flow, and deduplication
model: sonnet
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

You are a domain expert for the vibesdk WebSocket communication layer.

## Architecture

- Real-time communication via PartySocket
- 17 request message types, 46 response message types
- Discriminated union pattern: every message has a `type` string field

## Connection Flow

1. Client connects via PartySocket
2. Server sends `agent_connected` with full `AgentState` + `TemplateDetails` + `previewUrl`
3. Client restores state from the `agent_connected` payload
4. Bidirectional streaming begins

## Three-File Pattern

Every WebSocket message touches exactly three files:

1. **Types**: `worker/api/websocketTypes.ts` -- discriminated union type definition
2. **Backend handler**: `worker/agents/core/websocket.ts` -- switch case on `parsedMessage.type`
3. **Frontend handler**: `src/routes/chat/utils/handle-websocket-message.ts` -- switch case with state updates

Message type constants live in `worker/agents/constants.ts` as `WebSocketMessageRequests` and `WebSocketMessageResponses`.

## Message Deduplication

Tool execution causes duplicate AI messages. Three layers handle this:
1. Backend skips redundant LLM calls when tool results are empty
2. Frontend `deduplicateMessages()` in `src/routes/chat/utils/deduplicate-messages.ts`
3. System prompt teaches LLM not to repeat content

## State Restoration

On reconnect, the `agent_connected` message carries the full `AgentState`. The frontend replays this to restore:
- Generated files and their status
- Phase progress
- Conversation history
- Sandbox state

## Key Files

- Types: `worker/api/websocketTypes.ts`
- Backend handler: `worker/agents/core/websocket.ts`
- Frontend handler: `src/routes/chat/utils/handle-websocket-message.ts`
- Constants: `worker/agents/constants.ts`
- Deduplication: `src/routes/chat/utils/deduplicate-messages.ts`
- Frontend helpers: `src/routes/chat/utils/message-helpers.ts`, `file-state-helpers.ts`, `websocket-helpers.ts`

## Guidelines

- Always add to all three files when creating a new message type
- Use the `WebSocketMessageRequests`/`WebSocketMessageResponses` constants, not raw strings
- Test reconnect behavior when adding state-changing messages
- Check deduplication logic if the message can be sent multiple times
```

- [ ] **Step 3: Create sandbox-expert.md**

```markdown
---
name: sandbox-expert
description: Deep knowledge of the container service, sandbox lifecycle, template management, and deployment
model: sonnet
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

You are a domain expert for the vibesdk sandbox and deployment system.

## Architecture

- Sandbox provides isolated execution environments for generated applications
- Container service hierarchy in `worker/services/sandbox/`
- Templates stored in R2 bucket (`vibesdk-templates`)
- Deployment via `scripts/deploy.ts` (reads `.prod.vars`)

## Sandbox Lifecycle

1. Instance created with a `sandboxInstanceId` (stored in agent state)
2. Files deployed to sandbox container
3. CLI tools available in `/container` for container management
4. Preview URL generated via Cloudflare tunnels

## Template Management

- Templates define project scaffolding (React, Vue, etc.)
- Stored in R2 bucket `vibesdk-templates`
- `TemplateDetails` type carries template metadata through the system
- Git clone protocol supports rebase on template

## Deployment Flow

1. `scripts/deploy.ts` reads `.prod.vars` for credentials
2. Builds the project (`tsc + vite build`)
3. Deploys to Cloudflare Workers
4. Staging: separate `wrangler.staging.jsonc` config, separate D1 database (`vibesdk-db-staging`)

## Known Gotchas

- Cloudflare WARP (full mode) breaks anonymous Cloudflared tunnels used for local dev previews
- Disable WARP or switch to DNS-only (1.1.1.1) mode while developing locally
- Vite env vars (`import.meta.env.*`) are NOT available in Worker code -- use `env` from Worker bindings

## Key Files

- Sandbox service: `worker/services/sandbox/`
- Sandbox types: `worker/services/sandbox/sandboxTypes.ts`
- Container tooling: `/container`
- Deploy script: `scripts/deploy.ts`
- Staging config: `wrangler.staging.jsonc`
- Template details: referenced in `worker/api/websocketTypes.ts`

## Guidelines

- Never modify `.prod.vars` or `.dev.vars` programmatically
- Staging and production use separate D1 databases -- never cross them
- Test sandbox changes with local wrangler dev before deploying
- Container CLI tools may have different behavior than the Worker API
```

- [ ] **Step 4: Create database-expert.md**

```markdown
---
name: database-expert
description: Deep knowledge of Drizzle ORM, D1 database, migrations, and the service layer pattern
model: sonnet
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

You are a domain expert for the vibesdk database layer.

## Architecture

- Drizzle ORM with Cloudflare D1 (SQLite under the hood)
- Schema defined in `worker/database/schema.ts`
- Services in `worker/database/services/` extend `BaseService`
- Migrations in `/migrations` directory

## Migration Workflow

1. Modify schema in `worker/database/schema.ts`
2. Generate migration: `bun run db:generate`
3. Apply locally: `bun run db:migrate:local`
4. Test locally
5. Apply to staging: `bun run db:migrate:staging`
6. Apply to production: `bun run db:migrate:remote`

NEVER auto-run `db:migrate:remote` or `db:migrate:staging`. Always show the migration SQL first and wait for human approval.

## Config Split

- Local: `drizzle.config.local.ts`
- Remote: `drizzle.config.remote.ts`
- Staging uses `wrangler.staging.jsonc` with `vibesdk-db-staging`

## Service Pattern

Services extend `BaseService` and encapsulate database operations:

```typescript
export class MyService extends BaseService {
  async getItems(userId: string) {
    return this.db.select().from(schema.items).where(eq(schema.items.userId, userId));
  }
}
```

Instantiated in controllers: `const service = new MyService(env);`

## Database Types

- Shared types in `worker/database/types.ts`
- Schema inference: `typeof schema.tableName.$inferSelect` and `$inferInsert`
- Pagination types: `PaginationInfo`, `PaginatedResult<T>`

## Git SQLite Filesystem

The git system uses a SQLite filesystem adapter (`worker/agents/git/fs-adapter.ts`) separate from D1. This stores file content for isomorphic-git operations within the Durable Object.

## Key Files

- Schema: `worker/database/schema.ts`
- Base service: `worker/database/services/BaseService.ts`
- Services: `worker/database/services/` (AppService, UserService, etc.)
- Types: `worker/database/types.ts`
- Local config: `drizzle.config.local.ts`
- Remote config: `drizzle.config.remote.ts`
- Migrations: `/migrations`

## Guidelines

- Always use the service layer -- never query D1 directly from controllers
- Use Drizzle's type inference (`$inferSelect`) instead of manual type definitions
- Test migrations locally before applying remotely
- The git SQLite filesystem is separate from D1 -- do not confuse them
```

- [ ] **Step 5: Create inference-expert.md**

```markdown
---
name: inference-expert
description: Deep knowledge of the LLM inference pipeline, model configuration, tool execution, and the Deep Debugger
model: sonnet
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

You are a domain expert for the vibesdk LLM inference system.

## Inference Pipeline

Call flow: `executeInference` -> `infer` -> OpenAI-compatible client -> tool execution -> loop detection

The pipeline supports multiple providers (OpenAI, Anthropic, Google AI Studio/Gemini) through a unified OpenAI-compatible interface.

## Model Configuration

Two configs in `worker/agents/inferutils/config.ts`:

- `DEFAULT_AGENT_CONFIG`: Gemini-only. Used when `PLATFORM_MODEL_PROVIDERS` env var is unset.
- `PLATFORM_AGENT_CONFIG`: Multi-provider. Used at build.cloudflare.dev (production).

The exported `AGENT_CONFIG` selects between them at runtime based on the env var.

Each operation (phaseGeneration, phaseImplementation, conversation, deepDebugger, codeReview) has its own model config with provider, model name, temperature, and reasoning_effort.

## Model Resolution Chain

1. User runtime overrides (BYOK -- Bring Your Own Key)
2. `AGENT_CONFIG` operation-level config
3. Default fallback

AI Gateway URL construction routes through Cloudflare AI Gateway for logging/caching.

## Tool System

- 24 tools in `worker/agents/tools/toolkit/`
- Factory pattern: `createXTool(agent, logger, ...)` returns a `tool()` object
- Tools use Zod schemas for argument validation with a custom `Type` wrapper for resource declarations
- `buildTools()` returns conversation tools, `buildDebugTools()` returns debugger tools
- Tool registration: `worker/agents/tools/customTools.ts`

## Deep Debugger

- Location: `worker/agents/operations/DeepDebugger.ts`
- Model: configured via `deepDebugger` key in `AGENT_CONFIG` (reasoning_effort: high)
- Diagnostic priority: `run_analysis` -> `get_runtime_errors` -> `get_logs`
- Can fix multiple files in parallel (`regenerate_file`)
- Cannot run during code generation (checked via `isCodeGenerating()`)
- Limited to one call per conversation turn

## Loop Detection

The inference pipeline detects when the LLM enters repetitive tool-call loops and breaks out after a configurable threshold.

## Key Files

- Config: `worker/agents/inferutils/config.ts`
- Config types: `worker/agents/inferutils/config.types.ts`
- Common inference utils: `worker/agents/inferutils/common.ts`
- Tools registry: `worker/agents/tools/customTools.ts`
- Tool implementations: `worker/agents/tools/toolkit/`
- Deep Debugger: `worker/agents/operations/DeepDebugger.ts`
- Conversation processor: `worker/agents/operations/UserConversationProcessor.ts`

## Guidelines

- Model changes go in `worker/agents/inferutils/config.ts`, not scattered across operations
- New tools follow the `createXTool` factory pattern exactly
- Always declare resource types (files, gitCommit, sandbox) in tool argument Type wrappers
- Test tool execution with the abort controller pattern -- tools must respect cancellation
- Deep Debugger cannot run during generation -- always check `isCodeGenerating()` guard
```

- [ ] **Step 6: Verify all 5 files exist**

Run: `ls -la .claude/agents/`
Expected: 5 markdown files listed (durable-objects-expert.md, websocket-expert.md, sandbox-expert.md, database-expert.md, inference-expert.md)

- [ ] **Step 7: Commit**

```bash
git add .claude/agents/durable-objects-expert.md .claude/agents/websocket-expert.md .claude/agents/sandbox-expert.md .claude/agents/database-expert.md .claude/agents/inference-expert.md
git commit -m "feat: add 5 domain expert agents for Claude Code subsystem knowledge"
```

---

### Task 5: Create Guard Agents

**Files:**
- Create: `.claude/agents/security-auditor.md`
- Create: `.claude/agents/convention-checker.md`

- [ ] **Step 1: Create security-auditor.md**

```markdown
---
name: security-auditor
description: Security review agent for code touching crypto, secrets vault, auth, CSRF, and WebSocket security
model: opus
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

You are a security auditor for the vibesdk platform. Review code changes for security vulnerabilities, focusing on the areas below.

## Secrets Vault (worker/services/secrets/)

- AES-GCM encryption with Argon2id key derivation
- Key model:
  - VMK (Vault Master Key): Derived client-side from user password. NEVER stored on server.
  - SK (Session Key): Random per-session. Server holds only `AES-GCM(SK, VMK)` in DO memory.
  - DB dump = useless encrypted blobs. Server memory = needs client SK to decrypt.
- `UserSecretsStore` is a Durable Object -- one per user
- RPC methods return `null` or `boolean` on error. They NEVER throw exceptions.
- Tests: `worker/services/secrets/UserSecretsStore.test.ts`

## Review Checklist

When reviewing code that touches secrets:
- [ ] VMK is never logged, stored to disk, or sent in a response
- [ ] SK is never persisted beyond DO memory
- [ ] RPC methods return null/boolean, not throw
- [ ] Encryption uses AES-GCM (not AES-CBC or other modes)
- [ ] Key derivation uses Argon2id with appropriate parameters

## Middleware Security

- CSRF middleware: `worker/middleware/`
- WebSocket security middleware: `worker/middleware/`
- Verify CSRF tokens are checked on all state-mutating endpoints
- Verify WebSocket connections are authenticated

## Pre-Deploy Safety

- AST safety gate runs before deployment
- Checks for dangerous patterns in generated code
- Never bypass or weaken the safety gate checks

## OWASP Top 10 for Workers

Watch for these in Cloudflare Workers context:
1. Injection (SQL via Drizzle -- parameterized by default, but watch for raw SQL)
2. Broken authentication (JWT validation, session handling)
3. Sensitive data exposure (secrets in logs, error messages, responses)
4. XXE -- not applicable (no XML parsing)
5. Broken access control (user ID checks, DO isolation)
6. Security misconfiguration (CORS, headers)
7. XSS (frontend rendering of user/AI content)
8. Insecure deserialization (JSON.parse of WebSocket messages)
9. Using components with known vulnerabilities (dependency audit)
10. Insufficient logging (security events should be logged)

## Key Files

- Secrets store: `worker/services/secrets/UserSecretsStore.ts`
- Secrets types: `worker/services/secrets/types.ts`
- CSRF middleware: `worker/middleware/`
- Auth utilities: `worker/utils/authUtils.ts`
- Safety gate: check `worker/` for AST safety checks

## Output Format

Report findings as:
- CRITICAL: Must fix before merge (security vulnerability)
- WARNING: Should fix (weakened security posture)
- INFO: Suggestion (defense in depth improvement)
```

- [ ] **Step 2: Create convention-checker.md**

```markdown
---
name: convention-checker
description: Enforces project coding conventions, file naming, type safety, DRY principle, and architectural patterns
model: haiku
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

You are a convention checker for the vibesdk project. Review code for adherence to established patterns.

## Type Safety Rules

- NEVER use `any` type. Use `unknown` with type guards if the type is truly unknown.
- Frontend imports types from `@/api-types` (re-exports from worker types). This is the single source of truth.
- Search the codebase for existing types before creating new ones.

## File Naming Conventions

- React Components: `PascalCase.tsx` (e.g., `ChatMessage.tsx`)
- Utilities and Hooks: `kebab-case.ts` (e.g., `use-chat.ts`, `api-client.ts`)
- Backend Services: `PascalCase.ts` (e.g., `AppService.ts`, `BaseService.ts`)
- Backend Controllers: `PascalCase` directory + `controller.ts` (e.g., `apps/controller.ts`)

## Architectural Patterns

### API Endpoints
All API calls on the frontend go through `src/lib/api-client.ts`. Never use raw `fetch` in components.

### Route Structure
- Controllers: `worker/api/controllers/<domain>/controller.ts`
- Routes: `worker/api/routes/<domain>Routes.ts`
- Registration: `worker/api/routes/index.ts` via `setupXRoutes(app)`

### Database
- Services: `worker/database/services/<Name>Service.ts` extending `BaseService`
- Types: `worker/database/types.ts` for shared types
- Schema: `worker/database/schema.ts` for Drizzle schema
- Never query D1 directly from controllers

### Frontend
- Shared hooks in `src/hooks/`
- Route components in `src/routes/`
- Shared components in `src/components/`

## DRY Enforcement

- Search for similar functionality before implementing new code
- Extract reusable utilities, hooks, and components
- Never copy-paste code blocks -- refactor into shared functions
- Three similar lines of code is acceptable; four is not

## Code Quality

- Production-ready code only -- no TODOs or placeholder implementations
- No hacky workarounds
- Comments explain WHY, not WHAT
- No verbose AI-style narration comments

## Vite/Worker Gotcha

Vite env vars (`import.meta.env.*`) are NOT available in Worker code. Worker code uses `env` from bindings. Flag any `import.meta.env` usage in files under `worker/`.

## Output Format

Report findings as:
- VIOLATION: Must fix (breaks project convention)
- SUGGESTION: Should consider (improves consistency)
```

- [ ] **Step 3: Verify both files exist**

Run: `ls -la .claude/agents/security-auditor.md .claude/agents/convention-checker.md`
Expected: Both files listed.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/security-auditor.md .claude/agents/convention-checker.md
git commit -m "feat: add security-auditor and convention-checker guard agents"
```

---

### Task 6: Create Workflow Skills -- add-api-endpoint

**Files:**
- Create: `.claude/skills/add-api-endpoint/SKILL.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: add-api-endpoint
description: Scaffold a complete API endpoint following the vibesdk pattern (types, api-client, service, controller, route)
---

# Add API Endpoint

Scaffolds a new API endpoint across all layers of the stack.

## Gather Requirements

Before writing any code, ask the user:
1. What is the endpoint path? (e.g., `/api/projects/:id/export`)
2. What HTTP method? (GET, POST, PUT, DELETE, PATCH)
3. Is it authenticated? (most are -- check if it needs `context.user`)
4. Is it database-backed? (needs a service in `worker/database/services/`)
5. What is the request body shape? (for POST/PUT/PATCH)
6. What is the response data shape?

## Steps

### 1. Define Types

**File:** `src/api-types.ts`

Add the response data type as a re-export. If the type is specific to this endpoint, create it in a `types.ts` file alongside the controller:

```
worker/api/controllers/<domain>/types.ts
```

Then re-export from `src/api-types.ts`:
```typescript
export type { MyNewData } from 'worker/api/controllers/<domain>/types';
```

### 2. Create Database Service (if DB-backed)

**File:** `worker/database/services/<Name>Service.ts`

Follow the pattern:
```typescript
import { BaseService } from './BaseService';
import * as schema from '../schema';
import { eq } from 'drizzle-orm';

export class MyService extends BaseService {
  async getItem(id: string) {
    return this.db.select().from(schema.myTable).where(eq(schema.myTable.id, id));
  }
}
```

### 3. Create Controller

**File:** `worker/api/controllers/<domain>/controller.ts`

Follow the pattern:
```typescript
import { BaseController } from '../baseController';
import type { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import type { MyNewData } from './types';
import { createLogger } from '../../../logger';

export class MyController extends BaseController {
  static logger = createLogger('MyController');

  static async getItem(
    _request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext
  ): Promise<ControllerResponse<ApiResponse<MyNewData>>> {
    try {
      const user = context.user!;
      // ... service call ...
      return MyController.createSuccessResponse(data);
    } catch (error) {
      this.logger.error('Error:', error);
      return MyController.createErrorResponse<MyNewData>('Failed', 500);
    }
  }
}
```

### 4. Create Route

**File:** `worker/api/routes/<domain>Routes.ts`

```typescript
import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { MyController } from '../controllers/<domain>/controller';

export function setupMyRoutes(app: Hono<AppEnv>): void {
  app.get('/api/my-endpoint', async (c) => {
    const response = await MyController.getItem(c.req.raw, c.env, c.executionCtx, c.get('routeContext'));
    return c.json(response.body, response.status);
  });
}
```

### 5. Register Route

**File:** `worker/api/routes/index.ts`

Add import and call in `setupRoutes()`:
```typescript
import { setupMyRoutes } from './myRoutes';
// ... inside setupRoutes():
setupMyRoutes(app);
```

### 6. Add API Client Method

**File:** `src/lib/api-client.ts`

```typescript
async getMyItem(id: string): Promise<ApiResponse<MyNewData>> {
  return this.request<MyNewData>(`/api/my-endpoint/${id}`);
}
```

### 7. Verify

Run: `bun run typecheck`
Expected: No type errors.
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .claude/skills/add-api-endpoint
git add .claude/skills/add-api-endpoint/SKILL.md
git commit -m "feat: add add-api-endpoint workflow skill"
```

---

### Task 7: Create Workflow Skills -- add-llm-tool

**Files:**
- Create: `.claude/skills/add-llm-tool/SKILL.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: add-llm-tool
description: Scaffold a new LLM tool for the agent system following the factory pattern
---

# Add LLM Tool

Scaffolds a new tool for the CodeGeneratorAgent's LLM tool system.

## Gather Requirements

Before writing any code, ask the user:
1. What does the tool do? (one-sentence description for the LLM)
2. What arguments does it take? (name, type, description for each)
3. What resources does it need? (file read/write, git commit, sandbox deploy)
4. Is it for conversation, debugger, or both?

## Steps

### 1. Create Tool File

**File:** `worker/agents/tools/toolkit/<tool-name>.ts`

Follow the factory pattern:

```typescript
import { tool, t, type Type, type } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { z } from 'zod';

export function create<ToolName>Tool(
  agent: ICodingAgent,
  logger: StructuredLogger
) {
  return tool({
    name: '<tool_name>',
    description: '<One sentence describing what this tool does and when to use it>',
    args: {
      // Define args using t.string(), t.number(), t.boolean(), or custom Type with Zod
      myArg: t.string().describe('Description of this argument'),
    },
    run: async ({ myArg }) => {
      logger.info(`Running <tool_name> with: ${myArg}`);

      // Implementation here
      // Access agent state: agent.state
      // Access agent methods: agent.someMethod()

      return { result: 'success' };
    },
  });
}
```

For tools that need resource declarations (file access, git, sandbox):

```typescript
const filePathType: Type<string> = type(
  z.string(),
  (path: string) => ({
    files: { mode: 'read', paths: [path] },
  })
);
```

### 2. Register in customTools.ts

**File:** `worker/agents/tools/customTools.ts`

Add import:
```typescript
import { create<ToolName>Tool } from './toolkit/<tool-name>';
```

Add to `buildTools()` (for conversation) and/or `buildDebugTools()` (for debugger):
```typescript
create<ToolName>Tool(agent, logger),
```

### 3. Verify

Run: `bun run typecheck`
Expected: No type errors.

## Reference

Existing tools to study for patterns:
- Simple tool: `worker/agents/tools/toolkit/read-files.ts`
- Tool with resource types: `worker/agents/tools/toolkit/regenerate-file.ts`
- Tool with state guards: `worker/agents/tools/toolkit/deep-debugger.ts`
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .claude/skills/add-llm-tool
git add .claude/skills/add-llm-tool/SKILL.md
git commit -m "feat: add add-llm-tool workflow skill"
```

---

### Task 8: Create Workflow Skills -- add-ws-message

**Files:**
- Create: `.claude/skills/add-ws-message/SKILL.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: add-ws-message
description: Add a new WebSocket message type across the full stack (types, backend handler, frontend handler)
---

# Add WebSocket Message

Adds a new WebSocket message type across all three layers of the WebSocket stack.

## Gather Requirements

Before writing any code, ask the user:
1. Message direction: request (client->server), response (server->client), or both?
2. Message name/type string (e.g., `user_typing`, `build_progress`)
3. Payload shape (what data does the message carry?)
4. Does it change agent state? (if yes, needs state restoration handling)

## Steps

### 1. Add Message Type Constant

**File:** `worker/agents/constants.ts`

Add to `WebSocketMessageRequests` (for client->server) or `WebSocketMessageResponses` (for server->client):

```typescript
// In WebSocketMessageRequests:
MY_MESSAGE: 'my_message',

// Or in WebSocketMessageResponses:
MY_RESPONSE: 'my_response',
```

### 2. Add Type Definition

**File:** `worker/api/websocketTypes.ts`

Add a new type to the discriminated union:

```typescript
type MyMessageType = {
  type: 'my_message';
  payload: string;
  // ... other fields
};
```

Add it to the `WebSocketMessage` union type (for requests) or the response union.

### 3. Add Backend Handler

**File:** `worker/agents/core/websocket.ts`

Add a case in the `handleWebSocketMessage` switch:

```typescript
case WebSocketMessageRequests.MY_MESSAGE: {
  const payload = parsedMessage.payload;
  // Handle the message
  // Optionally update agent state:
  // agent.setState({ ...agent.state, myField: payload });
  break;
}
```

### 4. Add Frontend Handler

**File:** `src/routes/chat/utils/handle-websocket-message.ts`

Add a case in the message handler switch:

```typescript
case 'my_response': {
  const data = message as MyResponseType;
  // Update frontend state
  break;
}
```

### 5. State Restoration (if state-changing)

If the message changes `AgentState`, ensure the `agent_connected` restoration path handles it:
- Backend: verify the field is included in the `agent_connected` state snapshot
- Frontend: verify the field is restored from the `agent_connected` payload

### 6. Verify

Run: `bun run typecheck`
Expected: No type errors.

## Reference

- Existing types: `worker/api/websocketTypes.ts`
- Constants: `worker/agents/constants.ts`
- Backend handler: `worker/agents/core/websocket.ts`
- Frontend handler: `src/routes/chat/utils/handle-websocket-message.ts`
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .claude/skills/add-ws-message
git add .claude/skills/add-ws-message/SKILL.md
git commit -m "feat: add add-ws-message workflow skill"
```

---

### Task 9: Create Workflow Skills -- run-db-migration

**Files:**
- Create: `.claude/skills/run-db-migration/SKILL.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: run-db-migration
description: Guide through database migration workflow with safety checks -- generate, apply locally, verify, then wait for human approval before remote
---

# Run Database Migration

Safely guides through the Drizzle + D1 migration workflow.

## CRITICAL SAFETY RULE

NEVER auto-run `bun run db:migrate:remote` or `bun run db:migrate:staging`. Always stop after showing the migration SQL and wait for explicit human approval.

## Steps

### 1. Check Current State

Run: `bun run db:check`

This verifies the current schema state is consistent. If it reports issues, resolve them before proceeding.

### 2. Make Schema Changes

Edit the Drizzle schema file: `worker/database/schema.ts`

Follow existing patterns:
- Use Drizzle's column types (`text`, `integer`, `blob`, etc.)
- Add indexes where appropriate
- Update related types in `worker/database/types.ts` if needed

### 3. Generate Migration

Run: `bun run db:generate`

This creates a new SQL migration file in `/migrations`. Read the generated file and verify:
- The SQL matches your intended schema change
- No destructive operations (DROP TABLE, DROP COLUMN) unless intended
- Column defaults are correct

### 4. Apply Locally

Run: `bun run db:migrate:local`

This applies the migration to your local D1 database.

### 5. Test Locally

Run: `bun run test`

Verify that:
- Existing tests still pass
- Any new service methods work with the updated schema
- No type errors: `bun run typecheck`

### 6. Review Migration SQL

Display the generated migration SQL file to the user. Show the full content.

### 7. STOP -- Wait for Human Approval

Tell the user:
> "Migration generated and tested locally. Here is the SQL that will be applied. To apply to staging, run: `bun run db:migrate:staging`. To apply to production, run: `bun run db:migrate:remote`. I will NOT run these commands automatically."

Do not proceed past this point without explicit user instruction.

## Config Reference

- Local config: `drizzle.config.local.ts`
- Remote config: `drizzle.config.remote.ts`
- Staging: uses `wrangler.staging.jsonc` with `vibesdk-db-staging`
- Schema: `worker/database/schema.ts`
- Migrations output: `/migrations`
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .claude/skills/run-db-migration
git add .claude/skills/run-db-migration/SKILL.md
git commit -m "feat: add run-db-migration workflow skill with safety guards"
```

---

### Task 10: Create Workflow Skills -- deploy-checklist

**Files:**
- Create: `.claude/skills/deploy-checklist/SKILL.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: deploy-checklist
description: Pre-deploy verification checklist -- typecheck, test, knip, build, git status -- then deploy with human approval
---

# Deploy Checklist

Runs all verification steps before deployment. Stops on any failure. Never skips steps.

## CRITICAL SAFETY RULE

NEVER auto-run `bun run deploy` or `bun run deploy:staging`. Always complete all checks and wait for explicit human approval.

## Steps

### 1. Typecheck

Run: `bun run typecheck`

Must pass with zero errors. If it fails, fix the type errors before continuing.

### 2. Full Test Suite

Run: `bun run test`

Must pass with zero failures. This runs the full suite, not just related tests. If tests fail, fix them before continuing.

### 3. Dead Code Check

Run: `bun run knip`

Review output for:
- Unused exports that should be cleaned up
- Unused dependencies that should be removed
- Unused files that should be deleted

Warn the user about any findings but do not block deployment for knip warnings alone.

### 4. Build

Run: `bun run build`

Must complete successfully. This runs `tsc -b --incremental && vite build` and produces `dist/`.

### 5. Git Status

Run: `git status`

Verify:
- No uncommitted changes (working tree clean)
- No untracked files that should be committed
- Current branch is correct for deployment

If there are uncommitted changes, warn the user and ask whether to proceed or commit first.

### 6. Diff Against Main

Run: `git diff main...HEAD --stat`

Show the user a summary of all changes that will be deployed relative to main. This is their final review opportunity.

### 7. STOP -- Wait for Human Approval

Report results:
> "All checks passed. Here is the summary of changes to deploy. To deploy to production: `bun run deploy`. To deploy to staging: `bun run deploy:staging`. I will NOT run these commands automatically."

Do not proceed past this point without explicit user instruction.

## Deployment Commands

- Production: `bun run deploy` (reads `.prod.vars`)
- Staging: `bun run deploy:staging` (uses `wrangler.staging.jsonc`)

## Known Issues

- Cloudflare WARP (full mode) can interfere with deployment tunnels
- Ensure `.prod.vars` exists and has valid credentials before deploying
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .claude/skills/deploy-checklist
git add .claude/skills/deploy-checklist/SKILL.md
git commit -m "feat: add deploy-checklist workflow skill with safety guards"
```

---

### Task 11: Upgrade Existing Skills

**Files:**
- Modify: `.claude/skills/debug-issue.md`
- Modify: `.claude/skills/explore-codebase.md`
- Modify: `.claude/skills/refactor-safely.md`
- Modify: `.claude/skills/review-changes.md`

- [ ] **Step 1: Upgrade debug-issue.md**

Replace entire file:

```markdown
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
```

- [ ] **Step 2: Upgrade explore-codebase.md**

Replace entire file:

```markdown
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
```

- [ ] **Step 3: Upgrade refactor-safely.md**

Replace entire file:

```markdown
---
name: refactor-safely
description: Plan and execute safe refactoring using dependency analysis and project convention awareness
---

## Refactor Safely

Use the knowledge graph and project conventions to plan and execute refactoring with confidence.

### Steps

1. Use `get_minimal_context(task="<your task>")` for targeted context.
2. Use `refactor_tool` with mode="suggest" for community-driven refactoring suggestions.
3. Use `refactor_tool` with mode="dead_code" to find unreferenced code.
4. For renames, use `refactor_tool` with mode="rename" to preview all affected locations.
5. Use `apply_refactor_tool` with the refactor_id to apply renames.
6. After changes, run `detect_changes` to verify the refactoring impact.

### Safety Checks

- Always preview before applying (rename mode gives you an edit list).
- Check `get_impact_radius` before major refactors.
- Use `get_affected_flows` to ensure no critical paths are broken.
- Run `find_large_functions` to identify decomposition targets.

### Convention Compliance

After refactoring, verify the result follows project conventions:
- File naming: PascalCase.tsx (components), kebab-case.ts (utils/hooks), PascalCase.ts (backend services)
- Types: re-exported through `src/api-types.ts`, not defined inline
- API calls: all in `src/lib/api-client.ts`, not scattered in components
- Services: extend `BaseService`, not raw D1 queries
- Controllers: extend `BaseController`, static async methods

### Verification

After refactoring, run:
1. `bun run typecheck` -- must pass
2. `bun run test` -- must pass
3. `bun run knip` -- check for newly dead code

### Token Efficiency Rules
- ALWAYS start with `get_minimal_context(task="<your task>")` before any other graph tool.
- Use `detail_level="minimal"` on all calls. Only escalate to "standard" when minimal is insufficient.
- Target: complete any refactor task in <=5 tool calls plus verification.
```

- [ ] **Step 4: Upgrade review-changes.md**

Replace entire file:

```markdown
---
name: review-changes
description: Perform a structured code review using change detection, impact analysis, and project convention checks
---

## Review Changes

Perform a thorough, risk-aware code review using the knowledge graph and project conventions.

### Steps

1. Run `detect_changes` to get risk-scored change analysis.
2. Run `get_affected_flows` to find impacted execution paths.
3. For each high-risk function, run `query_graph` with pattern="tests_for" to check test coverage.
4. Run `get_impact_radius` to understand the blast radius.
5. For any untested changes, suggest specific test cases.

### Convention Checks

For each changed file, verify:
- No `any` types introduced
- File naming follows convention (PascalCase/kebab-case per file type)
- New API types added to `src/api-types.ts` (not defined locally)
- New API calls added to `src/lib/api-client.ts` (not raw fetch)
- New database operations use service layer (not raw D1)
- No `import.meta.env` in `worker/` files (use `env` from bindings)
- No secrets, API keys, or credentials in code

### Security-Sensitive Areas

Flag for extra scrutiny if changes touch:
- `worker/services/secrets/` -- vault crypto
- `worker/middleware/` -- CSRF, WebSocket security
- `worker/utils/authUtils.ts` -- authentication
- Any file handling user input or external data

### Output Format

Provide findings grouped by risk level:

**CRITICAL** -- Must fix before merge
**WARNING** -- Should fix before merge
**INFO** -- Suggestion for improvement

For each finding:
- What changed and why it matters
- Test coverage status
- Suggested fix or improvement
- Overall merge recommendation (approve / request changes / needs discussion)

### Token Efficiency Rules
- ALWAYS start with `get_minimal_context(task="<your task>")` before any other graph tool.
- Use `detail_level="minimal"` on all calls. Only escalate to "standard" when minimal is insufficient.
- Target: complete any review task in <=5 tool calls and <=800 total output tokens from graph tools.
```

- [ ] **Step 5: Verify all skill files**

Run: `find .claude/skills -name "*.md" -o -name "SKILL.md" | sort`
Expected: 9 files (4 existing upgraded + 5 new SKILL.md files in subdirectories).

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/
git commit -m "feat: upgrade 4 existing skills with project context, add to skill set"
```

---

### Task 12: Verify Full Setup

- [ ] **Step 1: Verify directory structure**

Run: `find .claude -type f | sort`
Expected output:
```
.claude/agents/convention-checker.md
.claude/agents/database-expert.md
.claude/agents/durable-objects-expert.md
.claude/agents/inference-expert.md
.claude/agents/sandbox-expert.md
.claude/agents/security-auditor.md
.claude/agents/websocket-expert.md
.claude/hooks/pre-commit-guard.sh
.claude/hooks/session-context.sh
.claude/settings.json
.claude/settings.local.json
.claude/skills/add-api-endpoint/SKILL.md
.claude/skills/add-llm-tool/SKILL.md
.claude/skills/add-ws-message/SKILL.md
.claude/skills/debug-issue.md
.claude/skills/deploy-checklist/SKILL.md
.claude/skills/explore-codebase.md
.claude/skills/refactor-safely.md
.claude/skills/review-changes.md
.claude/skills/run-db-migration/SKILL.md
```

- [ ] **Step 2: Verify hooks are executable**

Run: `ls -la .claude/hooks/*.sh`
Expected: Both files have execute permission (`-rwxr-xr-x`).

- [ ] **Step 3: Validate settings.json**

Run: `python3 -c "import json; d=json.load(open('.claude/settings.json')); print(f'Hooks: {list(d[\"hooks\"].keys())}')" `
Expected: `Hooks: ['SessionStart', 'PreToolUse', 'PostToolUse']`

- [ ] **Step 4: Verify .gitignore**

Run: `grep 'settings.local.json' .gitignore`
Expected: Line containing `settings.local.json`.

- [ ] **Step 5: Test session-context hook**

Run: `.claude/hooks/session-context.sh`
Expected: Branch info, recent commits, dirty file count, server status.

- [ ] **Step 6: Test pre-commit-guard with protected file**

Run: `TOOL_INPUT='{"file_path": "'$(pwd)'/migrations/test.sql"}' .claude/hooks/pre-commit-guard.sh 2>&1; echo "Exit: $?"`
Expected: BLOCKED message with exit code 2.

- [ ] **Step 7: Test pre-commit-guard with allowed file**

Run: `TOOL_INPUT='{"file_path": "'$(pwd)'/src/lib/api-client.ts"}' .claude/hooks/pre-commit-guard.sh 2>&1; echo "Exit: $?"`
Expected: No output, exit code 0.

- [ ] **Step 8: Final commit (if any remaining changes)**

```bash
git status
# If there are uncommitted changes:
git add -A .claude/
git commit -m "feat: complete Claude Code full-stack setup -- hooks, agents, skills"
```
