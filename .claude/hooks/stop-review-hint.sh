#!/usr/bin/env bash
# Stop hook: checks if uncommitted changes touch security-sensitive files.
# Outputs a hint to run the appropriate agent review. Fast (< 1 second).

set -euo pipefail

CHANGED=$(git diff --name-only HEAD 2>/dev/null || true)
if [ -z "$CHANGED" ]; then
  exit 0
fi

# Check for security-sensitive files
SECURITY_FILES=$(echo "$CHANGED" | grep -E 'worker/services/secrets/|worker/middleware/|worker/utils/authUtils' || true)
if [ -n "$SECURITY_FILES" ]; then
  echo ""
  echo "[REVIEW HINT] Changes touch security-sensitive files:"
  echo "$SECURITY_FILES" | sed 's/^/  - /'
  echo "  Consider delegating to the security-auditor agent before committing."
fi

# Check for convention-sensitive patterns (new files)
NEW_FILES=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
if [ -n "$NEW_FILES" ]; then
  echo ""
  echo "[REVIEW HINT] New TypeScript files detected:"
  echo "$NEW_FILES" | sed 's/^/  - /'
  echo "  Consider delegating to the convention-checker agent to verify patterns."
fi

exit 0
