#!/usr/bin/env bash
# SessionStart hook: validates that file paths referenced in .claude/ agents/skills still exist.
# Prints loud WARNING if any are missing. Silent when everything is fine.

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
EXTRACT_SCRIPT="$REPO_ROOT/.claude/hooks/lib/extract-refs.sh"

if [ ! -x "$EXTRACT_SCRIPT" ]; then
  echo "[validate-references] extract-refs.sh not found or not executable"
  exit 0
fi

# Collect missing references
MISSING=""
MISSING_COUNT=0

while IFS=: read -r source_file ref_path; do
  if [ ! -e "$REPO_ROOT/$ref_path" ]; then
    MISSING="${MISSING}    ${ref_path}\n      -> referenced in: ${source_file}\n\n"
    MISSING_COUNT=$((MISSING_COUNT + 1))
  fi
done < <("$EXTRACT_SCRIPT")

# Only print if there are missing references
if [ "$MISSING_COUNT" -gt 0 ]; then
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "  CLAUDE SETUP DRIFT DETECTED - $MISSING_COUNT broken reference(s)"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
  echo "  MISSING FILES:"
  printf "$MISSING"
  echo "  ACTION: Run /sync-claude-setup to fix these references."
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
fi

exit 0
