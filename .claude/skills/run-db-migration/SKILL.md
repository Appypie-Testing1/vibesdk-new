---
name: run-db-migration
description: Guide through database migration workflow with safety checks -- generate, apply locally, verify, then wait for human approval before remote
---

# Run Database Migration

Safely guides through the Drizzle + D1 migration workflow.

## CRITICAL SAFETY RULE

NEVER auto-run `bun run db:migrate:remote` or `bun run db:migrate:staging`. Always stop after showing the migration SQL and wait for explicit human approval.

## Steps

### 1. Check Current State

Run: `bun run db:check`

This verifies the current schema state is consistent. If it reports issues, resolve them before proceeding.

### 2. Make Schema Changes

Edit the Drizzle schema file: `worker/database/schema.ts`

Follow existing patterns:
- Use Drizzle's column types (`text`, `integer`, `blob`, etc.)
- Add indexes where appropriate
- Update related types in `worker/database/types.ts` if needed

### 3. Generate Migration

Run: `bun run db:generate`

This creates a new SQL migration file in `/migrations`. Read the generated file and verify:
- The SQL matches your intended schema change
- No destructive operations (DROP TABLE, DROP COLUMN) unless intended
- Column defaults are correct

### 4. Apply Locally

Run: `bun run db:migrate:local`

This applies the migration to your local D1 database.

### 5. Test Locally

Run: `bun run test`

Verify that:
- Existing tests still pass
- Any new service methods work with the updated schema
- No type errors: `bun run typecheck`

### 6. Review Migration SQL

Display the generated migration SQL file to the user. Show the full content.

### 7. STOP -- Wait for Human Approval

Tell the user:
> "Migration generated and tested locally. Here is the SQL that will be applied. To apply to staging, run: `bun run db:migrate:staging`. To apply to production, run: `bun run db:migrate:remote`. I will NOT run these commands automatically."

Do not proceed past this point without explicit user instruction.

## Config Reference

- Local config: `drizzle.config.local.ts`
- Remote config: `drizzle.config.remote.ts`
- Staging: uses `wrangler.staging.jsonc` with `vibesdk-db-staging`
- Schema: `worker/database/schema.ts`
- Migrations output: `/migrations`

## Expert Agents

For complex scenarios, delegate to these domain experts:
- **database-expert**: Schema design, index strategy, migration safety, Drizzle patterns
- **security-auditor**: If the migration touches user data, encryption, or access control
