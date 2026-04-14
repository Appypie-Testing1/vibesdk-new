# End-User Authentication for Generated Apps

**Date:** 2026-04-14
**Status:** Approved
**Scope:** Platform-level changes so generated apps get real auth automatically when needed

## Problem

The LLM prompt system biases toward mock auth for all generated apps (`prompts.ts:923`), even when the template has a persistence layer (Durable Objects) that can support real authentication. Apps like e-commerce platforms, dashboards, and SaaS products ship without login, registration, or role-based access control.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auth scope | Login/register + role-based access (admin/user) | Covers majority of use cases without overcomplicating |
| Detection | LLM-detected via blueprint schema field | Most natural fit -- LLM already analyzes the query during blueprint generation |
| Knowledge location | Split: template `usage.md` for patterns, `prompts.ts` for strategy | Each layer provides what it's best at |
| Middleware pattern | Token-in-header (Bearer token) | Works reliably across all Workers deployment scenarios |
| Roles | Two: `admin` and `user` | Simple, predictable, covers e-commerce/dashboard/SaaS admin vs end-user |

## Section 1: Blueprint Schema Changes

### `worker/agents/schemas.ts`

Add two fields to `PhasicBlueprintSchema`:

```typescript
authRequired: z.boolean().describe('Whether the application requires user authentication. True for apps with user-specific data, accounts, or admin panels. False for games, calculators, landing pages, portfolios.')
authRoles: z.array(z.string()).describe('User roles for the application. Defaults to ["admin", "user"] when auth is required.').default(['admin', 'user'])
```

Add the same fields to `AgenticBlueprintSchema` for parity.

### `worker/agents/planning/blueprint.ts`

Add an instruction block to `PHASIC_SYSTEM_PROMPT` (within `<INSTRUCTIONS>`) teaching the LLM when to set `authRequired`:

**Auth required** (set `authRequired: true`):
- E-commerce (user accounts, order history, admin product management)
- Dashboards with user-specific data
- SaaS products with workspaces or user settings
- Social platforms, forums, community apps
- Any app where users create, own, or manage personal data
- Multi-user apps with different access levels

**Auth not required** (set `authRequired: false`):
- Games (single-player, no accounts)
- Calculators, converters, utility tools
- Landing pages, portfolios, static content sites
- Data visualizations without user-specific data
- Single-purpose tools without user identity

**Constraint**: Only set `authRequired: true` when the template has a persistence layer. If the template description does not mention Durable Objects, KV, or D1 storage, set `authRequired: false` regardless of the app type.

## Section 2: Prompt System -- Auth Strategy

### `worker/agents/prompts.ts`

**Replace line 923** (the existing mock auth instruction) with conditional logic:

```
When blueprint.authRequired is true AND template has persistence:
  -> Inject AUTH_STRATEGY instructions (real auth)
When blueprint.authRequired is true AND template has NO persistence:
  -> Inject mock auth instructions (pre-filled credentials, in-memory)
When blueprint.authRequired is false:
  -> No auth instructions at all
```

**New `AUTH_STRATEGY` block** added to `STRATEGIES` object:

```
AUTH_STRATEGY: `
  <AUTH IMPLEMENTATION REQUIREMENTS>
  The application requires user authentication with role-based access control.

  **Architecture:**
  - Two roles: "admin" and "user"
  - Token-based auth: login returns a Bearer token, frontend sends it in Authorization header
  - Session storage in the persistence layer (DO entity or equivalent)
  - Password hashing via Web Crypto API (PBKDF2, SHA-256, 100k iterations)

  **Required Auth Routes (under /api/auth/*):**
  - POST /api/auth/register -- create user with hashed password, return token + user
  - POST /api/auth/login -- verify credentials, create session, return token + user
  - GET /api/auth/me -- return current user from token (protected)
  - POST /api/auth/logout -- delete session (protected)

  **Auth Middleware:**
  - Apply to all /api/* routes EXCEPT /api/auth/register and /api/auth/login
  - Read Authorization: Bearer <token> header
  - Look up session by token, check expiry
  - Attach userId and role to request context
  - Return 401 for missing/invalid/expired tokens
  - requireRole(role) middleware factory for admin-only routes

  **Frontend Requirements:**
  - Auth context provider wrapping the app (stores token + user in state)
  - Token stored in localStorage, attached to all API requests via header
  - Login page and Register page with forms
  - Protected route wrapper that redirects to login when unauthenticated
  - Role-based UI: admin sees management features, user sees standard features

  **Seed Data (for immediate demo):**
  - Admin account: admin@example.com / admin123 (role: "admin")
  - User account: user@example.com / user123 (role: "user")
  - Pre-fill login form with user credentials so the app works on first load
  - Seed accounts created via ensureSeed() pattern

  **Implementation Phase:**
  - Auth MUST be implemented in the first phase (foundational -- other features depend on it)
  - First phase includes: auth entities, auth routes, auth middleware, login/register UI, auth context, protected routes
  - Subsequent phases build features that use the auth context (e.g., "current user's orders")
  </AUTH IMPLEMENTATION REQUIREMENTS>
`
```

**Use-case specific enhancements** in `getUsecaseSpecificInstructions()`:

- **E-Commerce**: "Admin role manages products, categories, orders, and inventory. User role browses products, manages cart, places orders, views order history. Product management pages are admin-only."
- **Dashboard**: "Admin role manages data sources, settings, and user accounts. User role views dashboards and reports. Settings and user management pages are admin-only."
- **SaaS Product Website**: "Admin role manages workspace settings, billing, and team members. User role accesses features and personal settings. Workspace management is admin-only."

### Prompt wiring

In `generalSystemPromptBuilder` (around line 1205-1230):

```typescript
if (params.blueprint && 'authRequired' in params.blueprint && params.blueprint.authRequired) {
    variables.authInstructions = STRATEGIES.AUTH_STRATEGY;
} else {
    variables.authInstructions = '';
}
```

Add `{{authInstructions}}` placeholder to phase generation prompts (in the constraints/guidelines section where the old mock auth line was).

## Section 3: Template `usage.md` -- Auth Patterns

### `templates/definitions/vite-cf-DO-v2-runner/prompts/usage.md`

Add a new "Authentication Patterns" section after the existing "Storage Patterns" section. This provides concrete, template-specific code examples.

### Auth Entities

```typescript
import { IndexedEntity, Entity } from "./core-utils";

interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: 'admin' | 'user';
  name: string;
  createdAt: number;
}

export class AuthUserEntity extends IndexedEntity<AuthUser> {
  static readonly entityName = "authuser";
  static readonly indexName = "authusers";
  static readonly initialState: AuthUser = {
    id: "", email: "", passwordHash: "", salt: "",
    role: "user", name: "", createdAt: 0
  };
}

interface Session {
  id: string;
  userId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
}

export class SessionEntity extends Entity<Session> {
  static readonly entityName = "session";
  static readonly initialState: Session = {
    id: "", userId: "", token: "", createdAt: 0, expiresAt: 0
  };
}
```

Note: `SessionEntity` extends `Entity` (not `IndexedEntity`) since sessions are looked up by token, not listed.

### Password Hashing Utility

```typescript
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  return (await hashPassword(password, salt)) === hash;
}
```

### Auth Middleware

```typescript
import { createMiddleware } from 'hono/factory';

const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.slice(7);
  const session = new SessionEntity(c.env, token);
  if (!await session.exists()) {
    return c.json({ error: 'Invalid session' }, 401);
  }
  const sessionData = await session.getState();
  if (sessionData.expiresAt < Date.now()) {
    return c.json({ error: 'Session expired' }, 401);
  }
  c.set('userId', sessionData.userId);
  const user = new AuthUserEntity(c.env, sessionData.userId);
  const userData = await user.getState();
  c.set('userRole', userData.role);
  await next();
});

const requireRole = (role: string) => createMiddleware(async (c, next) => {
  if (c.get('userRole') !== role) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
});

// Apply: auth middleware to all /api/* except auth routes
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/auth/')) return next();
  return authMiddleware(c, next);
});

// Admin-only route example
app.get('/api/admin/users', requireRole('admin'), async (c) => { ... });
```

### Auth Routes

```typescript
app.post('/api/auth/register', async (c) => {
  const { email, password, name } = await c.req.json();
  // validate, check duplicate, hash password, create AuthUserEntity, create SessionEntity, return token + user
});

app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json();
  // find user by email, verify password, create SessionEntity, return token + user
});

app.get('/api/auth/me', async (c) => {
  const userId = c.get('userId');
  // fetch AuthUserEntity, return user (without passwordHash/salt)
});

app.post('/api/auth/logout', async (c) => {
  // delete SessionEntity by token
});
```

### Seed Data

```typescript
// Pre-hash passwords at seed time using the same hashPassword utility
// Admin: admin@example.com / admin123
// User: user@example.com / user123
static seedData = [
  { id: "admin-1", email: "admin@example.com", passwordHash: "<pre-computed>", salt: "<pre-computed>", role: "admin", name: "Admin", createdAt: Date.now() },
  { id: "user-1", email: "user@example.com", passwordHash: "<pre-computed>", salt: "<pre-computed>", role: "user", name: "Demo User", createdAt: Date.now() },
];
```

Note on seed data: Since `hashPassword` is async (uses Web Crypto), the LLM should generate a seed initialization function that hashes passwords on first load rather than using pre-computed hashes. The `ensureSeed()` pattern already supports async initialization.

## Section 4: Propagation and Wiring

### Data flow

```
User query
  -> Template selection (useCase detected, e.g., "E-Commerce")
  -> Blueprint generation (LLM sets authRequired: true, authRoles: ["admin", "user"])
  -> state.blueprint.authRequired stored in agent state
  -> Phase generation reads blueprint.authRequired
  -> If true: AUTH_STRATEGY injected into phase prompt + use-case auth instructions
  -> LLM generates auth code following usage.md patterns
  -> First phase includes auth scaffolding
```

### Files modified

| File | Change |
|---|---|
| `worker/agents/schemas.ts` | Add `authRequired: boolean` and `authRoles: string[]` to `PhasicBlueprintSchema` and `AgenticBlueprintSchema` |
| `worker/agents/planning/blueprint.ts` | Add auth detection instructions to `PHASIC_SYSTEM_PROMPT` (detailed, for phasic behavior) and `SIMPLE_SYSTEM_PROMPT` (brief, for agentic behavior -- just the `authRequired`/`authRoles` field guidance, no detailed strategy) |
| `worker/agents/prompts.ts` | Replace mock auth line (923) with conditional logic, add `AUTH_STRATEGY` to `STRATEGIES`, update `getUsecaseSpecificInstructions()` for E-Commerce/Dashboard/SaaS, add `{{authInstructions}}` wiring in `generalSystemPromptBuilder` |
| `templates/definitions/vite-cf-DO-v2-runner/prompts/usage.md` | Add "Authentication Patterns" section with entity, hashing, middleware, route, and seed examples |

### Files NOT modified

- `worker/agents/core/state.ts` -- `authRequired` lives inside the `blueprint` object, already typed as `Blueprint`
- `worker/agents/core/codingAgent.ts` -- no state machine changes
- `worker/api/websocketTypes.ts` -- no new message types
- `templates/definitions/vite-cf-DO-v2-runner/worker/*` -- no new template source files
- `worker/core-utils.ts`, `wrangler.jsonc` -- untouched per template rules

## Scope Boundaries

**In scope:**
- Blueprint-level auth detection
- Prompt-level auth strategy for persistence-backed templates
- Template-level auth code patterns for DO v2
- Two roles (admin/user), token-in-header, PBKDF2 hashing

**Out of scope (future work):**
- OAuth (GitHub, Google social login)
- Custom role definitions beyond admin/user
- Auth patterns for non-DO templates (KV-only, in-memory)
- Auth for agentic behavior (uses different code generation path -- but schema changes cover it)
- Session refresh/rotation
- Rate limiting on auth endpoints
