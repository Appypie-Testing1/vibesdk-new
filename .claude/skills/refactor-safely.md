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
