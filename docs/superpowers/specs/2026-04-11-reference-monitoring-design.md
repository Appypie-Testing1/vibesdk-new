# Reference Monitoring System Design

**Date:** 2026-04-11
**Status:** Approved
**Scope:** 3-layer monitoring to keep `.claude/` agents and skills in sync with the codebase

## Context

The `.claude/` setup contains 7 agents and 9 skills that reference 47 specific file paths and 17 directory paths in the vibesdk codebase. When the codebase is refactored (files renamed, moved, deleted), these references go stale and the agents/skills give incorrect guidance. A 2-4 person team needs automatic detection and repair tools.

## Architecture

Three layers, each catching drift at a different stage:

1. **SessionStart validator** -- loud warning on every session start if any referenced paths are missing
2. **Pre-commit check** -- blocks commits that delete/rename files referenced by agents/skills
3. **Sync skill** -- deep audit with auto-fix for broken paths, stale counts, and pattern drift

All three share a common path extraction utility to avoid duplication.

## Layer 0: Shared Path Extraction

**File:** `.claude/hooks/lib/extract-refs.sh`

Scans all `.claude/agents/*.md` and `.claude/skills/**/*.md` files. Extracts backtick-wrapped paths matching real file/directory patterns. Returns `source_file:referenced_path` pairs, one per line.

**Filtering rules (skip these):**
- Paths containing angle brackets (`<domain>`, `<Name>`, `<tool-name>`)
- Single-segment naming convention examples: `PascalCase.tsx`, `PascalCase.ts`, `kebab-case.ts`, `ChatMessage.tsx`, `AppService.ts`, `BaseService.ts`, `controller.ts`, `types.ts`
- Paths inside fenced code blocks that are template examples (lines containing `MyService`, `MyController`, `setupMyRoutes`)

**Keep these:**
- Paths starting with `worker/`, `src/`, `scripts/`, `migrations/`, `container/`, `shared/`, `sdk/`
- Root-level config files: `drizzle.config.local.ts`, `drizzle.config.remote.ts`, `wrangler.staging.jsonc`
- Paths with at least one `/` separator that don't match the skip patterns

**Output format:**
```
.claude/agents/durable-objects-expert.md:worker/agents/core/codingAgent.ts
.claude/agents/durable-objects-expert.md:worker/agents/core/state.ts
.claude/agents/durable-objects-expert.md:worker/agents/core/behaviors/
...
```

**Performance target:** Under 500ms for the full scan.

## Layer 1: SessionStart Path Validator

**File:** `.claude/hooks/validate-references.sh`
**Trigger:** SessionStart hook in `settings.json`
**Timeout:** 5 seconds

### Behavior

1. Source `lib/extract-refs.sh` to get all reference pairs
2. For each referenced path, check if it exists (`test -e`)
3. If ALL paths exist: output nothing (no noise on clean sessions)
4. If ANY paths are missing: print loud WARNING block

### Output format

```
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  CLAUDE SETUP DRIFT DETECTED - N broken references
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

  MISSING FILES:
    worker/agents/core/state.ts
      -> referenced in: .claude/agents/durable-objects-expert.md

    worker/agents/tools/types.ts
      -> referenced in: .claude/skills/add-llm-tool/SKILL.md
      -> referenced in: .claude/agents/inference-expert.md

  ACTION: Run /sync-claude-setup to fix these references.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

When no drift: no output at all.

### Settings.json wiring

Add to the existing SessionStart hook array, after the two existing hooks:

```json
{
  "type": "command",
  "command": ".claude/hooks/validate-references.sh",
  "timeout": 5
}
```

## Layer 2: Pre-commit Reference Check

**Integration:** Added to existing `.husky/pre-commit` script
**Position:** After the code-review-graph check (section 0), before typecheck (section 1)

### Behavior

1. Get staged deletions and renames: `git diff --cached --name-only --diff-filter=DR`
2. Source `lib/extract-refs.sh` to get all referenced paths
3. Cross-reference: if any staged deletion/rename matches a referenced path, block the commit

### Output format

```
[pre-commit] Claude setup reference check
BLOCKED: Staged changes would break .claude/ references:

  worker/agents/core/state.ts (DELETED)
    -> referenced in: .claude/agents/durable-objects-expert.md

  Fix: Update the agent/skill files to reflect the new paths, then re-stage.
  Bypass: SKIP_REF_CHECK=1 git commit ...
```

### Bypass

`SKIP_REF_CHECK=1` environment variable skips the check. Same pattern as existing `SKIP_TESTS=1`.

### Key constraint

This check only examines files being deleted/renamed in the current commit. It does NOT scan all references for validity (that's Layer 1's job). This keeps it fast and targeted.

## Layer 3: `/sync-claude-setup` Skill

**File:** `.claude/skills/sync-claude-setup/SKILL.md`

### Phase 1: Audit

1. Run `lib/extract-refs.sh` to get all referenced paths
2. Validate each path exists
3. For missing paths, check git history for renames: `git log --all --diff-filter=R --find-object=$(git hash-object <path>) -- <path>` or `git log --all --diff-filter=R -- <old_path>`
4. Count-check hardcoded claims:

| Claim pattern | Verification command |
|---------------|---------------------|
| "N tools in toolkit/" | `ls worker/agents/tools/toolkit/*.ts \| wc -l` |
| "N request message types" | Count entries in `WebSocketMessageRequests` object |
| "N response message types" | Count entries in `WebSocketMessageResponses` object |

5. Pattern-check key code snippets in skills against actual codebase:
   - `adaptController` import in route files
   - `createXTool` factory pattern in tool files
   - `BaseService` / `BaseController` class hierarchy

### Phase 2: Report

Present findings in three categories:

**Broken paths:** File/directory no longer exists. Show old path, which agent/skill references it, and suggested new path if a rename was detected.

**Stale counts:** Numeric claims that don't match reality. Show current count vs claimed count.

**Pattern drift:** Import patterns or code snippets in skills that don't match the actual codebase. Show the skill's version vs the real version.

### Phase 3: Fix

- **Renamed paths:** Auto-fix by replacing old path with new path in the agent/skill file
- **Deleted paths (no rename found):** Ask user where it moved or if the reference should be removed
- **Stale counts:** Auto-update with current values
- **Pattern drift:** Show the diff and suggest the fix, ask user to confirm

After all fixes, commit: `fix: sync .claude/ setup references with current codebase`

## Files to create/modify

**New files (3):**
- `.claude/hooks/lib/extract-refs.sh` -- shared path extraction utility
- `.claude/hooks/validate-references.sh` -- SessionStart validator
- `.claude/skills/sync-claude-setup/SKILL.md` -- deep audit and repair skill

**Modified files (2):**
- `.claude/settings.json` -- add validate-references.sh to SessionStart hooks
- `.husky/pre-commit` -- add reference check section

## Implementation order

1. `lib/extract-refs.sh` (shared dependency)
2. `validate-references.sh` + settings.json wiring
3. Pre-commit integration
4. `sync-claude-setup` skill
5. Verification: introduce a fake broken reference, confirm all 3 layers detect it, then revert
