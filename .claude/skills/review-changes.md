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
