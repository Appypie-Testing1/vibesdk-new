#!/usr/bin/env bash
# Pre-commit guard -- blocks edits to protected files
# Wired via settings.json PreToolUse event (matcher: Edit|Write)
# Exit 0 = allow, Exit 2 = block with message shown to Claude

set -euo pipefail

# Extract file path from tool input JSON
FILE_PATH=$(echo "$TOOL_INPUT" 2>/dev/null | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//' || echo "")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Resolve to relative path from repo root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
REL_PATH="${FILE_PATH#$REPO_ROOT/}"

# Protected paths and their reasons
check_protected() {
  local path="$1"

  case "$path" in
    migrations/*)
      echo "BLOCKED: $path is a migration file."
      echo "Reason: Schema changes must go through the generate workflow."
      echo "Use: /run-db-migration skill to generate and apply migrations safely."
      exit 2
      ;;
    .prod.vars|.dev.vars)
      echo "BLOCKED: $path contains secrets."
      echo "Reason: Environment secrets must be edited manually, never by AI."
      echo "Action: Edit this file manually outside of Claude Code."
      exit 2
      ;;
    wrangler.jsonc|wrangler.staging.jsonc)
      echo "BLOCKED: $path is infrastructure config."
      echo "Reason: Wrangler config changes affect production infrastructure."
      echo "Action: Review and edit manually, or explicitly tell Claude to proceed."
      exit 2
      ;;
    .github/workflows/*)
      echo "BLOCKED: $path is a CI/CD pipeline."
      echo "Reason: Workflow changes affect all team members and deployments."
      echo "Action: Review and edit manually, or explicitly tell Claude to proceed."
      exit 2
      ;;
    scripts/deploy.ts)
      echo "BLOCKED: $path is the production deployment script."
      echo "Reason: Changes to deploy logic can break production releases."
      echo "Action: Review and edit manually, or explicitly tell Claude to proceed."
      exit 2
      ;;
  esac
}

check_protected "$REL_PATH"

# Not protected -- allow
exit 0
