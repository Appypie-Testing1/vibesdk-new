# Claude Code Full-Stack Setup Design

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Complete `.claude/` configuration for vibesdk -- hooks, agents, skills, settings

## Context

vibesdk is a complex full-stack application (509 files, 112K LOC) with 5-6 distinct subsystems: agent/DO core, WebSocket protocol, sandbox/deployment, database/migrations, LLM inference, and security/crypto. A team of 2-4 developers uses Claude Code daily. The current `.claude/` setup has only code-review-graph hooks and graph-focused skills -- leaving significant automation potential on the table.

## Goals

1. Claude understands subsystem boundaries and patterns deeply (domain agents)
2. Repetitive multi-step workflows are executable, not just documented (workflow skills)
3. Dangerous files are protected from accidental edits (guard hooks)
4. Every team member gets the same experience (committed config, local overrides)
5. No slowdown to tool calls (no PostToolUse lint -- Husky pre-commit handles that)

## Directory Structure

```
.claude/
  settings.json                    # Shared hook wiring + permissions (committed)
  settings.local.json              # Personal overrides (git-ignored)

  hooks/
    pre-commit-guard.sh            # PreToolUse: block edits to protected files
    session-context.sh             # SessionStart: inject branch, env, recent changes

  agents/
    durable-objects-expert.md      # Agent/DO/state machine patterns
    websocket-expert.md            # WS protocol, message types, reconnect
    sandbox-expert.md              # Container service, deployment, templates
    database-expert.md             # Drizzle, D1, migrations, services
    inference-expert.md            # LLM pipeline, tool execution, model config
    security-auditor.md            # Crypto, secrets vault, CSRF, XSS review
    convention-checker.md          # Project patterns, file naming, DRY enforcement

  skills/
    add-api-endpoint/SKILL.md      # Scaffold controller+route+types+api-client
    add-llm-tool/SKILL.md          # Scaffold new tool end-to-end
    add-ws-message/SKILL.md        # Add WebSocket message type across stack
    run-db-migration/SKILL.md      # Generate + apply + verify migration
    deploy-checklist/SKILL.md      # Pre-deploy checks, build, deploy, verify
    debug-issue.md                 # (existing, upgraded with project context)
    explore-codebase.md            # (existing, upgraded with project context)
    refactor-safely.md             # (existing, upgraded with project context)
    review-changes.md              # (existing, upgraded with project context)
```

No `commands/` directory -- skills replace commands with richer functionality.

## Hooks

### Hook 1: session-context.sh (SessionStart)

Injects situational context when Claude starts a session.

**Trigger:** SessionStart
**Timeout:** 5 seconds
**Output:**
- Current branch name and tracking status
- Last 5 commits (one-line format)
- Count of uncommitted/untracked files
- Whether dev server is running (check port 5173)
- Current wrangler dev status (check port 8787)

**Rationale:** Eliminates the manual "check git status, check recent changes" that starts most sessions. Every team member gets the same context baseline.

### Hook 2: pre-commit-guard.sh (PreToolUse on Edit|Write)

Blocks direct edits to protected files, directing to proper workflows.

**Trigger:** PreToolUse (matcher: Edit|Write)
**Timeout:** 3 seconds
**Protected files:**

| Path | Reason | Redirect |
|------|--------|----------|
| `migrations/*` | Schema changes need generate workflow | `/run-db-migration` skill |
| `.prod.vars`, `.dev.vars` | Contains secrets | Manual edit only |
| `wrangler.jsonc`, `wrangler.staging.jsonc` | Infrastructure config | Human review required |
| `worker/agents/core/codingAgent.ts` | High-risk core state machine | Explicit user approval |
| `.github/workflows/*` | CI/CD pipelines | Human review required |
| `scripts/deploy.ts` | Production deployment script | Human review required |

**Behavior:** Exit non-zero with a message explaining why the file is protected and which workflow to use instead. Claude sees the error and explains the situation. User can override by explicitly telling Claude to proceed.

### Existing hooks (unchanged)

- PostToolUse (Edit|Write|Bash) -> `code-review-graph update --skip-flows` (timeout: 5)
- SessionStart -> `code-review-graph status` (timeout: 3)

### Not adding

- No PostToolUse lint/typecheck -- Husky pre-commit catches these, adding it to every tool call would slow Claude down without meaningful benefit.
- No notification hooks (Slack/webhook) -- no clear team need yet.

## Agents

### Domain Expert Agents

#### durable-objects-expert.md

**Purpose:** Deep knowledge of the agent/Durable Object system.
**Model:** default (inherits from session)
**Knowledge encoded:**
- `CodeGeneratorAgent` extends `Agent` from "agents" package (NOT raw DurableObject)
- State machine: IDLE -> PHASE_GENERATING -> PHASE_IMPLEMENTING -> REVIEWING -> IDLE
- `CodeGenState` fields: blueprint, generatedFilesMap, generatedPhases, currentPhase, currentDevState, shouldBeGenerating, sandboxInstanceId, conversationMessages, pendingUserInputs
- Behavior system: `behaviorType` prop selects phasic (phase-based) or agentic (autonomous LLM loop)
- Persistent state in SQLite, ephemeral state in memory (abort controllers, active promises)
- Single-threaded per instance
- Separate DOs: `DORateLimitStore`, `UserSecretsStore`, `GlobalDurableObject`
- Abort controller pattern: `getOrCreateAbortController()` reuses for nested ops
- Key files: `worker/agents/core/codingAgent.ts`, `worker/agents/core/behaviors/`, `worker/agents/core/objectives/`

**When to use:** Any work touching `worker/agents/core/`, behavior files, state management, DO lifecycle.

#### websocket-expert.md

**Purpose:** Deep knowledge of the real-time communication protocol.
**Model:** default
**Knowledge encoded:**
- PartySocket for real-time communication
- 17 request types, 46 response types (defined in `worker/api/websocketTypes.ts`)
- Connection flow: connect -> agent_connected (state restoration) -> streaming
- State restoration on reconnect
- Message deduplication: tool execution causes duplicate AI messages, backend skips redundant LLM calls, frontend deduplicates live and restored messages
- Three-file pattern: types in `worker/api/websocketTypes.ts`, backend handler in `worker/agents/core/websocket.ts`, frontend handler in `src/routes/chat/utils/handle-websocket-message.ts`

**When to use:** Adding/modifying WS messages, debugging connection issues, message flow tracing.

#### sandbox-expert.md

**Purpose:** Deep knowledge of container service and deployment.
**Model:** default
**Knowledge encoded:**
- Container service hierarchy in `worker/services/`
- Template management via R2 bucket (`vibesdk-templates`)
- Deployment flow via `scripts/deploy.ts` (reads `.prod.vars`)
- Sandbox instance lifecycle, CLI tools in `/container`
- Cloudflare tunnel gotchas: WARP (full mode) breaks anonymous Cloudflared tunnels
- Staging environment: separate wrangler config, separate D1 database

**When to use:** Container/sandbox changes, deployment issues, template modifications.

#### database-expert.md

**Purpose:** Deep knowledge of Drizzle ORM + D1 database layer.
**Model:** default
**Knowledge encoded:**
- Drizzle ORM with Cloudflare D1 (SQLite)
- Migration workflow: generate -> migrate:local -> test -> migrate:remote
- Local vs remote config split (drizzle.config.local.ts vs drizzle.config.remote.ts)
- Staging DB: `vibesdk-db-staging` with separate wrangler config
- Service pattern in `worker/database/services/`
- Git system uses SQLite filesystem adapter: `worker/agents/git/fs-adapter.ts`
- Key directories: `worker/database/`, `/migrations`

**When to use:** Schema changes, new database services, migration issues.

#### inference-expert.md

**Purpose:** Deep knowledge of the LLM inference pipeline.
**Model:** default
**Knowledge encoded:**
- Call flow: `executeInference` -> `infer` -> OpenAI client -> tool execution -> loop detection
- `AGENT_CONFIG`: DEFAULT_AGENT_CONFIG (Gemini-only) vs PLATFORM_AGENT_CONFIG (multi-provider), selected at runtime by `PLATFORM_MODEL_PROVIDERS` env var
- Config location: `worker/agents/inferutils/config.ts`
- Model resolution chain, AI Gateway URL construction, user model overrides
- 24 LLM tools in `worker/agents/tools/toolkit/`
- `buildTools()` (conversation) vs `buildDebugTools()` (debugger)
- Deep Debugger: `worker/agents/operations/DeepDebugger.ts`, reasoning_effort: high, cannot run during code generation
- Tool execution causes duplicate messages (system prompt teaches LLM not to repeat)

**When to use:** Model config changes, adding tools, debugging inference issues, prompt engineering.

### Guard Agents

#### security-auditor.md

**Purpose:** Pre-commit security review for code touching sensitive areas.
**Model:** opus (higher reasoning for security analysis)
**Knowledge encoded:**
- AES-GCM + Argon2id vault crypto in `worker/services/secrets/`
- VMK/SK key model: VMK derived client-side (never stored), SK random per-session, server holds only `AES-GCM(SK, VMK)` in DO memory
- RPC methods return null/boolean on error, never throw exceptions
- CSRF middleware in `worker/middleware/`
- WebSocket security middleware in `worker/middleware/`
- Pre-deploy AST safety gate
- OWASP top 10 awareness for Cloudflare Workers context

**When to use:** Review of any code touching `worker/services/secrets/`, `worker/middleware/`, auth flows, crypto operations.

#### convention-checker.md

**Purpose:** Enforce project patterns and coding standards.
**Model:** haiku (fast, pattern-matching task)
**Knowledge encoded:**
- No `any` type -- strict type safety
- Frontend types from `@/api-types` (single source of truth: `src/api-types.ts`)
- All frontend API calls in `src/lib/api-client.ts`
- File naming: PascalCase.tsx (components), kebab-case.ts (utilities/hooks), PascalCase.ts (backend services)
- Route/controller/service pattern for API endpoints
- DRY: search for similar functionality before implementing
- No TODOs, placeholders, or hacky workarounds
- Vite env vars NOT available in Worker code (use `env` from bindings)

**When to use:** Review of any new code for pattern violations, file naming issues, type safety violations.

## Skills

### New Workflow Skills

#### add-api-endpoint/SKILL.md

Scaffolds a complete API endpoint following the project's established pattern.

**Steps:**
1. Ask: endpoint path, HTTP method, whether it's DB-backed, request/response shape
2. Add request/response types to `src/api-types.ts`
3. Add API function to `src/lib/api-client.ts`
4. Create service in `worker/database/services/` (if DB-backed)
5. Create controller in `worker/api/controllers/`
6. Create route in `worker/api/routes/`
7. Register route in `worker/api/routes/index.ts`
8. Run typecheck to verify

**References:** Existing endpoint files as templates for pattern consistency.

#### add-llm-tool/SKILL.md

Scaffolds a new LLM tool for the agent system.

**Steps:**
1. Ask: tool name, description, parameters, whether it's conversation-only or also debugger
2. Create `worker/agents/tools/toolkit/<tool-name>.ts`
3. Export `create<ToolName>Tool(agent, logger)` following existing tool pattern
4. Import in `worker/agents/tools/customTools.ts`
5. Add to `buildTools()` and/or `buildDebugTools()` based on user input
6. Verify tool signature matches existing patterns

**References:** Existing tools in `worker/agents/tools/toolkit/` as templates.

#### add-ws-message/SKILL.md

Adds a new WebSocket message type across the full stack.

**Steps:**
1. Ask: message direction (request/response/both), message name, payload shape
2. Add type to `worker/api/websocketTypes.ts`
3. Add handler in `worker/agents/core/websocket.ts`
4. Add frontend handler in `src/routes/chat/utils/handle-websocket-message.ts`
5. If state-changing: update `CodeGenState` type and restoration logic
6. Run typecheck to verify

#### run-db-migration/SKILL.md

Guides through the database migration workflow with safety checks.

**Steps:**
1. Verify current schema state (`bun run db:check`)
2. Make schema changes in Drizzle schema files
3. Generate migration (`bun run db:generate`)
4. Apply locally (`bun run db:migrate:local`)
5. Run related tests
6. Display migration SQL for human review
7. **STOP** -- never auto-run `db:migrate:remote` or `db:migrate:staging`

**Guard:** The skill explicitly stops after showing SQL and waits for user to confirm remote application.

#### deploy-checklist/SKILL.md

Pre-deploy verification and deployment.

**Steps:**
1. Run `bun run typecheck`
2. Run `bun run test` (full suite, not just related)
3. Run `bun run knip` (dead code detection)
4. Run `bun run build`
5. Check `git status` -- no uncommitted changes
6. Show `git diff main...HEAD` for final review
7. **STOP** -- wait for user approval before running deploy
8. Run `bun run deploy` (or `deploy:staging` based on user choice)

**Guard:** Stop on any step failure. Never skip steps. Never auto-deploy.

### Existing Skills Upgrade

The four existing skills (`debug-issue.md`, `explore-codebase.md`, `refactor-safely.md`, `review-changes.md`) are upgraded with:

1. **Project-specific context:** Key file paths, subsystem boundaries, common patterns
2. **Agent delegation:** For subsystem-specific issues, suggest delegating to the relevant domain expert agent
3. **Fallback guidance:** When graph tools don't cover an area, fall back to Grep/Read with project-aware search patterns
4. **Expanded steps:** Beyond graph-only workflow to include running tests, checking types, verifying changes

## Settings Configuration

### settings.json (committed, shared by team)

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

### settings.local.json (git-ignored, per-developer)

Each developer maintains their own permissions. Example structure:

```json
{
  "permissions": {
    "allow": [
      "Bash(git clone:*)",
      "mcp__code-review-graph__*"
    ]
  }
}
```

### .mcp.json (unchanged)

```json
{
  "mcpServers": {
    "code-review-graph": {
      "command": "uvx",
      "args": ["code-review-graph", "serve"],
      "type": "stdio"
    }
  }
}
```

No additional MCP servers. The knowledge graph plus domain expert agents provide sufficient codebase intelligence.

## Protected Files

The `pre-commit-guard.sh` hook blocks edits to these paths:

| Path | Reason | Proper workflow |
|------|--------|-----------------|
| `migrations/*` | Schema changes need generate workflow | `/run-db-migration` skill |
| `.prod.vars`, `.dev.vars` | Contains secrets | Manual edit only |
| `wrangler.jsonc`, `wrangler.staging.jsonc` | Infrastructure config | Human review required |
| `worker/agents/core/codingAgent.ts` | High-risk core state machine | Explicit user approval |
| `.github/workflows/*` | CI/CD pipelines | Human review required |
| `scripts/deploy.ts` | Production deployment script | Human review required |

Override mechanism: User tells Claude explicitly to proceed. Claude re-attempts the edit with a flag/comment acknowledging the override.

## Team Onboarding

1. `bun install` (Husky installs via `prepare` script)
2. Create `.claude/settings.local.json` with personal permission preferences
3. Everything else (hooks, agents, skills) comes from committed `.claude/` directory
4. Verify: start a Claude Code session and confirm `session-context.sh` output appears

## Implementation Order

1. **Hooks first** -- `session-context.sh`, `pre-commit-guard.sh`, updated `settings.json`
2. **Agents second** -- all 7 agent markdown files
3. **New skills third** -- 5 workflow skills
4. **Existing skills upgrade fourth** -- enhance 4 existing graph skills
5. **Verification** -- test each component in a fresh Claude Code session

## Files to create/modify

**New files (17):**
- `.claude/hooks/session-context.sh`
- `.claude/hooks/pre-commit-guard.sh`
- `.claude/agents/durable-objects-expert.md`
- `.claude/agents/websocket-expert.md`
- `.claude/agents/sandbox-expert.md`
- `.claude/agents/database-expert.md`
- `.claude/agents/inference-expert.md`
- `.claude/agents/security-auditor.md`
- `.claude/agents/convention-checker.md`
- `.claude/skills/add-api-endpoint/SKILL.md`
- `.claude/skills/add-llm-tool/SKILL.md`
- `.claude/skills/add-ws-message/SKILL.md`
- `.claude/skills/run-db-migration/SKILL.md`
- `.claude/skills/deploy-checklist/SKILL.md`
- `docs/superpowers/specs/2026-04-11-claude-code-full-stack-setup-design.md` (this file)

**Modified files (5):**
- `.claude/settings.json` (add new hooks)
- `.claude/skills/debug-issue.md` (upgrade with project context)
- `.claude/skills/explore-codebase.md` (upgrade with project context)
- `.claude/skills/refactor-safely.md` (upgrade with project context)
- `.claude/skills/review-changes.md` (upgrade with project context)

**Unchanged files:**
- `.claude/settings.local.json` (per-developer, git-ignored)
- `.mcp.json` (no changes needed)

**Verify `.gitignore` includes:** `.claude/settings.local.json`
