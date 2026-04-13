# Refine Prompt Skill -- Design Spec

## Purpose

Takes a vague user prompt and produces a specific, codebase-grounded prompt by researching relevant code before brainstorming begins. Designed for a developer whose primary expertise is native mobile (Android/iOS), not this web/Cloudflare stack.

## Location

`.claude/skills/refine-prompt/SKILL.md` (project-level, vibesdk-specific)

## Activation

Automatically, as the first step of brainstorming. When brainstorming starts, this skill runs first, then hands off to the normal brainstorming flow with the refined prompt.

## Workflow

```
User: "make the debugger smarter"
         |
    [1] Symbol search -- Grep (scoped by glob/type) + subsystem map
         |
    [2] File reading -- read the top 3-5 relevant files found
         |
    [3] Present findings -- show what it found in the codebase
         |
    [4] Ask 1-2 targeted questions -- narrow ambiguity
         |
    [5] Output refined prompt -- user approves or tweaks
         |
    [6] Brainstorming continues with refined prompt
```

### Step 1: Symbol search

Use Grep/Glob scoped to the likely subsystem (see the architecture map in `CLAUDE.md` -- "Project Structure" and "Key Architectural Patterns"):
- `Grep` with keywords extracted from the user's prompt (tight `glob` and `type` filters to cut noise)
- For each hit, re-grep the symbol name with `-C 2` to surface call sites and imports
- For broad prompts (e.g., "improve performance"), start from the subsystem map rather than searching blind

### Step 2: File reading

Read the top 3-5 files identified by the symbol search. Focus on:
- The primary file(s) the user's intent maps to
- Key interfaces/types those files depend on
- Configuration that governs behavior (e.g., AGENT_CONFIG for agent-related prompts)

Cap at 5 files to keep token cost reasonable.

### Step 3: Present findings

Output a structured summary:

```
=== Codebase Context ===
- [Component name] ([file path]) -- [what it does, current behavior]
- [Config/type] ([file path:line]) -- [relevant setting or constraint]
- [Related component] ([file path]) -- [how it connects]
```

### Step 4: Targeted questions

Ask at most 2 questions grounded in what was found. Questions should:
- Reference specific things in the codebase ("Are you seeing failures in X or Y?")
- Offer multiple choice when possible
- Help distinguish between ambiguous interpretations of the prompt

### Step 5: Refined prompt

After the user answers, produce a refined prompt that includes:
- Exact file paths and line references
- Current behavior description (what it does now)
- Specific change requested (based on user's answers)
- Known constraints (guards, dependencies, config)
- What should NOT change (scope boundary)

Format:

```
=== Refined Prompt ===
[One paragraph, specific and actionable, naming files and behaviors]
```

The user approves or tweaks this. Once approved, brainstorming continues using this as the input.

### Step 6: Handoff to brainstorming

The refined prompt becomes the input for the brainstorming skill's normal flow (clarifying questions, approaches, design).

## Scope Boundaries

- Reads at most 5 files
- Asks at most 2 questions
- If the user's prompt is already specific (names files, describes exact behavior), skip refinement and say: "Your prompt is already specific enough. Proceeding to brainstorming."
- No code changes, no plan creation, no implementation decisions
- Does not replace brainstorming -- it feeds into it

## Output Example

Input: "make the debugger smarter"

```
=== Codebase Context ===
- DeepDebugger (worker/agents/operations/DeepDebugger.ts) -- current debugger,
  uses run_analysis/get_runtime_errors/get_logs tools in that priority order
- AGENT_CONFIG deepDebugger key (worker/agents/inferutils/config.ts:45) --
  model: gemini, reasoning_effort: high
- buildDebugTools (worker/agents/tools/customTools.ts) -- 8 tools available
  to debugger: read-files, run-analysis, get-runtime-errors, get-logs,
  regenerate-file, get-sandbox-info, run-command, get-file-tree

=== Narrowing Questions ===
1. Are you seeing the debugger fail on specific error types, or is this
   about general diagnostic quality?
2. Should it get new capabilities (new tools) or better use of existing ones?

=== Refined Prompt (after user answers) ===
"Enhance DeepDebugger (worker/agents/operations/DeepDebugger.ts) to
[specific thing]. Currently has 8 tools via buildDebugTools(), uses gemini
with high reasoning_effort. Diagnostic priority: run_analysis >
get_runtime_errors > get_logs. Guard: cannot run during code generation
(isCodeGenerating()). Key constraint: [from user's answers]."
```

## Integration with superpowers:brainstorming

The refine-prompt skill is invoked by the brainstorming skill before its first clarifying question. The brainstorming checklist step "Explore project context" is effectively replaced/enhanced by this skill's symbol search + file reading. The rest of brainstorming proceeds as normal.

## Research tools used

| Tool | Purpose |
|------|---------|
| `Grep` | Find relevant functions/classes by keywords from prompt (scope with `glob`/`type`) |
| `Grep` with `-C 2` | Trace call sites and imports around a matched symbol |
| Subsystem map (`CLAUDE.md`) | Identify relevant subsystem for broad prompts |
| `Read` | Read actual file content for the top 3-5 results |
