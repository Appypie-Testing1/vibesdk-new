---
name: deploy-checklist
description: Pre-deploy verification checklist -- typecheck, test, knip, build, git status -- then deploy with human approval
---

# Deploy Checklist

Runs all verification steps before deployment. Stops on any failure. Never skips steps.

## CRITICAL SAFETY RULE

NEVER auto-run `bun run deploy` or `bun run deploy:staging`. Always complete all checks and wait for explicit human approval.

## Steps

### 1. Typecheck

Run: `bun run typecheck`

Must pass with zero errors. If it fails, fix the type errors before continuing.

### 2. Full Test Suite

Run: `bun run test`

Must pass with zero failures. This runs the full suite, not just related tests. If tests fail, fix them before continuing.

### 3. Dead Code Check

Run: `bun run knip`

Review output for:
- Unused exports that should be cleaned up
- Unused dependencies that should be removed
- Unused files that should be deleted

Warn the user about any findings but do not block deployment for knip warnings alone.

### 4. Build

Run: `bun run build`

Must complete successfully. This runs `tsc -b --incremental && vite build` and produces `dist/`.

### 5. Git Status

Run: `git status`

Verify:
- No uncommitted changes (working tree clean)
- No untracked files that should be committed
- Current branch is correct for deployment

If there are uncommitted changes, warn the user and ask whether to proceed or commit first.

### 6. Diff Against Main

Run: `git diff main...HEAD --stat`

Show the user a summary of all changes that will be deployed relative to main. This is their final review opportunity.

### 7. STOP -- Wait for Human Approval

Report results:
> "All checks passed. Here is the summary of changes to deploy. To deploy to production: `bun run deploy`. To deploy to staging: `bun run deploy:staging`. I will NOT run these commands automatically."

Do not proceed past this point without explicit user instruction.

## Deployment Commands

- Production: `bun run deploy` (reads `.prod.vars`)
- Staging: `bun run deploy:staging` (uses `wrangler.staging.jsonc`)

## Known Issues

- Cloudflare WARP (full mode) can interfere with deployment tunnels
- Ensure `.prod.vars` exists and has valid credentials before deploying
