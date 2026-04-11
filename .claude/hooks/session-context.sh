#!/usr/bin/env bash
# Session context hook -- injects branch, recent commits, and working state
# Wired via settings.json SessionStart event

set -euo pipefail

echo "=== Session Context ==="

# Current branch and tracking
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
TRACKING=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "no upstream")
echo "Branch: $BRANCH (tracking: $TRACKING)"

# Ahead/behind upstream
if [ "$TRACKING" != "no upstream" ]; then
  AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "?")
  BEHIND=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo "?")
  echo "Ahead: $AHEAD / Behind: $BEHIND"
fi

# Last 5 commits (one-line)
echo ""
echo "Recent commits:"
git log --oneline -5 2>/dev/null || echo "(no commits)"

# Dirty state
DIRTY_COUNT=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
STAGED_COUNT=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "Uncommitted files: $DIRTY_COUNT (staged: $STAGED_COUNT)"

# Dev server status
if lsof -i :5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Dev server: RUNNING (port 5173)"
else
  echo "Dev server: not running"
fi

# Wrangler dev status
if lsof -i :8787 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Wrangler dev: RUNNING (port 8787)"
else
  echo "Wrangler dev: not running"
fi

echo "=== End Context ==="
