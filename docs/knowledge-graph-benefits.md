# Knowledge Graph (code-review-graph) -- Benefits and Impact

## Overview

The code-review-graph MCP server builds a structural knowledge graph of the codebase. It indexes functions, classes, files, tests, and their relationships (calls, imports, inheritance, test coverage) into a queryable graph with 4,186 nodes and 29,899 edges.

## Graph Coverage

| Category | Count |
|----------|-------|
| Files | 534 |
| Functions | 3,068 |
| Classes | 168 |
| Tests | 416 |
| CALLS edges | 20,554 |
| CONTAINS edges | 3,995 |
| IMPORTS_FROM edges | 2,411 |
| TESTED_BY edges | 2,933 |
| INHERITS edges | 6 |
| Communities | 243 |

## How It Helps

### 1. Faster Code Navigation

**Without graph:** Grep for function names, wade through hundreds of string matches, imports, comments, and false positives across 534 files.

**With graph:** `query_graph(pattern="callers_of", target="infer")` returns exact call sites with file paths, line numbers, and context in one call.

### 2. Impact Analysis Before Changes

**Without graph:** Manually trace imports file-by-file to figure out what might break.

**With graph:** `get_impact_radius(changed_files=[...])` instantly reports all impacted nodes, files, and tests at risk. Gives a confident blast radius before touching anything.

### 3. Smarter Code Reviews

**Without graph:** Read entire changed files, guess what's important, risk missing downstream effects.

**With graph:** `detect_changes` provides risk-scored priorities. Automatically flags test gaps, untested functions, and suggests review order by risk.

### 4. Finding Test Gaps

**Without graph:** Grep for test files and hope naming conventions match.

**With graph:** `query_graph(pattern="tests_for", target="SomeFunction")` directly shows which functions have tests and which don't. `detect_changes` surfaces untested changed code automatically.

### 5. Understanding Architecture

**Without graph:** Read dozens of files to understand how 243 modules relate to each other.

**With graph:** `list_communities` shows module clusters with size and cohesion scores. `list_flows` shows critical execution paths ranked by criticality.

### 6. Token Efficiency

Instead of reading 5-10 files (thousands of lines) to trace a call chain, one graph query suffices. This means less context window consumed, faster responses, and more room for actual implementation work.

## Impact on Code Quality

### Directly Improves

| Aspect | Without Graph | With Graph |
|--------|--------------|------------|
| Regression risk | Higher -- incomplete impact analysis | Lower -- full dependency tracing |
| Test coverage awareness | Manual, often skipped | Automatic, surfaced per-change |
| Architectural drift | Easy to violate boundaries unknowingly | Community structure makes boundaries visible |
| Review thoroughness | Depends on how many files are read | Prioritized by risk score |

### Does NOT Improve

- **Logic correctness** -- The graph knows structure, not intent. Algorithm bugs are not caught.
- **Code style/patterns** -- Does not enforce DRY or existing conventions. Still requires reading code and following CLAUDE.md.
- **Security** -- Does not flag SQL injection, XSS, or OWASP issues. Needs actual code analysis.
- **Design decisions** -- Architectural choices (e.g., Durable Object vs KV) remain judgment calls.

## Key Tools Reference

| Tool | Use When |
|------|----------|
| `list_graph_stats` | Check if graph is built and up to date |
| `detect_changes` | Reviewing code changes -- risk-scored analysis |
| `get_review_context` | Need source snippets for review -- token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `list_communities` | Viewing module clusters and cohesion |
| `list_flows` | Seeing critical execution paths |
| `refactor_tool` | Planning renames, finding dead code |

## Bottom Line

The knowledge graph does not write better code. It provides better information to make better decisions. In a 534-file, 112K LOC codebase, the difference between "informed" and "guessing" is where most quality issues originate.
