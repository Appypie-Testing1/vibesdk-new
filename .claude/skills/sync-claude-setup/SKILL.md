---
name: sync-claude-setup
description: Audit and repair .claude/ agent and skill references that have drifted from the codebase
---

# Sync Claude Setup

Deep audit of all `.claude/` agent and skill files. Detects broken file paths, stale counts, and pattern drift. Can auto-fix most issues.

## Phase 1: Audit Broken Paths

Run the reference extraction script and check each path:

```bash
.claude/hooks/lib/extract-refs.sh | while IFS=: read -r source ref; do
  if [ ! -e "$ref" ]; then
    echo "MISSING: $ref (in $source)"
  fi
done
```

For each missing path, search git history for renames:
```bash
git log --all --diff-filter=R --summary -- <missing_path> | grep "rename"
```

If a rename is found, note the new path for auto-fix.

## Phase 2: Audit Stale Counts

Check these hardcoded claims against reality:

### Tool count
Claim in `inference-expert.md`: "24 tools in `worker/agents/tools/toolkit/`"
```bash
ls worker/agents/tools/toolkit/*.ts | wc -l
```
If the count differs, note the current count.

### WebSocket request types
Claim in `websocket-expert.md`: "17 request message types"
```bash
grep -cE '^\s+\w+:' worker/agents/constants.ts | head -1
```
Or manually count entries in the `WebSocketMessageRequests` object.

### WebSocket response types
Claim in `websocket-expert.md`: "46 response message types"

Count the response type definitions in `worker/api/websocketTypes.ts`.

## Phase 3: Audit Pattern Drift

Check that key code patterns shown in skills still match the codebase:

### Route pattern (add-api-endpoint skill)
Verify the skill's route example uses `adaptController` and `setAuthLevel`:
```bash
grep -l "adaptController" worker/api/routes/*.ts | wc -l
```
If all route files use it, the skill's pattern is current. If not, flag the drift.

### Tool factory pattern (add-llm-tool skill)
Verify the `createXTool` factory pattern still exists:
```bash
grep -rE "export function create\w+Tool" worker/agents/tools/toolkit/ | head -5
```

### Service pattern (add-api-endpoint skill)
Verify `BaseService` is still the base class:
```bash
grep -rE "extends BaseService" worker/database/services/ | head -5
```

### Controller pattern (add-api-endpoint skill)
Verify `BaseController` is still the base class:
```bash
grep -rE "extends BaseController" worker/api/controllers/ | head -5
```

## Phase 4: Report

Present all findings grouped by severity:

### Broken Paths
For each missing path:
- The missing path and which file references it
- If a rename was found: "Renamed to: `<new_path>`" with auto-fix available
- If no rename found: ask user where it moved

### Stale Counts
For each count mismatch:
- The claim, the current value, and which file contains it
- Auto-fix available

### Pattern Drift
For each drifted pattern:
- What the skill shows vs what the codebase actually uses
- Show the diff
- Suggest the fix

## Phase 5: Fix

Apply fixes based on user approval:

1. **Broken paths with known rename:** Replace old path with new path in the agent/skill file using Edit tool
2. **Broken paths without rename:** Ask user for the new location, then replace
3. **Stale counts:** Replace the old number with the current count
4. **Pattern drift:** Show the suggested edit, apply after user confirms

After all fixes are applied:
```bash
# Verify no remaining broken references
.claude/hooks/validate-references.sh

# Commit
git add .claude/agents/ .claude/skills/
git commit -m "fix: sync .claude/ setup references with current codebase"
```

## When to Run

- After major refactors (file renames, directory restructuring)
- When the SessionStart validator reports broken references
- Quarterly as a maintenance check
- After upgrading dependencies that change import patterns
