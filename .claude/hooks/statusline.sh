#!/usr/bin/env bash
# Status line script for Claude Code
# Receives JSON session data on stdin, outputs formatted status line

set -euo pipefail

# Get git info
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

# Server status
if lsof -i :5173 -sTCP:LISTEN >/dev/null 2>&1; then
  DEV="dev:ON"
else
  DEV="dev:off"
fi

# Build status line
if [ "$DIRTY" -gt 0 ]; then
  echo "[$BRANCH +$DIRTY] $DEV"
else
  echo "[$BRANCH] $DEV"
fi
