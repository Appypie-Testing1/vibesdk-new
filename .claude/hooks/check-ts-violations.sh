#!/usr/bin/env bash
# PostToolUse hook: check for 'any' type and 'import.meta.env' in TS/JS files.
# Exits silently for non-code files.
set -euo pipefail

FILE="${CLAUDE_FILE:-}"
if [ -z "$FILE" ]; then
  exit 0
fi

# Only check .ts, .tsx, .js, .jsx files
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

# Skip declaration files and node_modules
case "$FILE" in
  *.d.ts|*/node_modules/*) exit 0 ;;
esac

VIOLATIONS=""

# Check for 'any' type usage (rough grep, skip comments)
ANY_HITS=$(grep -n '\bany\b' "$FILE" 2>/dev/null | grep -v '// .*any' | grep -v '/\*' | grep -v '^\s*//' | grep -E ':\s*any\b|<any>|as any' || true)
if [ -n "$ANY_HITS" ]; then
  while IFS= read -r line; do
    VIOLATIONS="${VIOLATIONS}VIOLATION: $FILE $line (usage of 'any' type)\n"
  done <<< "$ANY_HITS"
fi

# Check for import.meta.env in worker/ files
if [[ "$FILE" == worker/* ]] || [[ "$FILE" == */worker/* ]]; then
  ENV_HITS=$(grep -n 'import\.meta\.env' "$FILE" 2>/dev/null || true)
  if [ -n "$ENV_HITS" ]; then
    while IFS= read -r line; do
      VIOLATIONS="${VIOLATIONS}VIOLATION: $FILE $line (Worker code must use 'env' from bindings, not import.meta.env)\n"
    done <<< "$ENV_HITS"
  fi
fi

if [ -n "$VIOLATIONS" ]; then
  printf "%b" "$VIOLATIONS"
fi
