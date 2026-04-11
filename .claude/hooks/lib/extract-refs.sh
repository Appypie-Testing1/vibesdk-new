#!/usr/bin/env bash
# Extracts file path references from .claude/ agents and skills.
# Output: source_file:referenced_path (one per line)
# Used by validate-references.sh and the pre-commit hook.

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
CLAUDE_DIR="$REPO_ROOT/.claude"

# Known example patterns to skip (not real file paths)
SKIP_PATTERNS=(
  "PascalCase.tsx"
  "PascalCase.ts"
  "kebab-case.ts"
  "ChatMessage.tsx"
  "controller.ts"
  "types.ts"
  "SKILL.md"
)

# Known top-level prefixes for real paths
REAL_PREFIXES="worker/|src/|scripts/|migrations/|container/|shared/|sdk/|docs/"

# Known root-level config files
ROOT_CONFIGS="drizzle.config.local.ts|drizzle.config.remote.ts|wrangler.staging.jsonc|eslint.config.js"

is_skip_pattern() {
  local path="$1"
  # Skip paths with angle brackets (template placeholders)
  if echo "$path" | grep -q '<'; then
    return 0
  fi
  # Skip known example-only filenames (single segment, no slash)
  if [[ "$path" != */* ]]; then
    for skip in "${SKIP_PATTERNS[@]}"; do
      if [[ "$path" == "$skip" ]]; then
        return 0
      fi
    done
    # Single segment without a known root config match -> skip
    if ! echo "$path" | grep -qE "^($ROOT_CONFIGS)$"; then
      return 0
    fi
  fi
  return 1
}

is_real_path() {
  local path="$1"
  # Multi-segment paths starting with known prefixes
  if echo "$path" | grep -qE "^($REAL_PREFIXES)"; then
    return 0
  fi
  # Root-level config files
  if echo "$path" | grep -qE "^($ROOT_CONFIGS)$"; then
    return 0
  fi
  return 1
}

# Find all agent and skill markdown files
find "$CLAUDE_DIR/agents" "$CLAUDE_DIR/skills" -name "*.md" -type f 2>/dev/null | while read -r md_file; do
  rel_md="${md_file#$REPO_ROOT/}"

  # Extract backtick-wrapped paths: `some/path.ts` or `some/path/`
  grep -oE '`[a-zA-Z][a-zA-Z0-9/_.-]+(\.(ts|tsx|js|jsx|json|jsonc|sh|sql|yaml|yml)|/)`' "$md_file" 2>/dev/null | sed 's/`//g' | sort -u | while read -r ref_path; do
    # Skip template examples and non-real paths
    if is_skip_pattern "$ref_path"; then
      continue
    fi
    if is_real_path "$ref_path"; then
      echo "$rel_md:$ref_path"
    fi
  done
done
