# End-User Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the platform automatically generate real user authentication (login, register, roles) in apps that need it, based on LLM blueprint analysis.

**Architecture:** Add `authRequired`/`authRoles` fields to blueprint schemas so the LLM decides at blueprint time whether auth is needed. When true, inject auth strategy instructions into phase generation prompts. Provide concrete auth code patterns (entities, middleware, routes) in the DO v2 template's `usage.md` so the LLM generates correct, template-compatible auth code.

**Tech Stack:** Zod (schema), TypeScript (prompts), Markdown (template docs)

**Spec:** `docs/superpowers/specs/2026-04-14-end-user-auth-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `worker/agents/schemas.ts` | Modify | Add `authRequired` and `authRoles` to blueprint schemas |
| `worker/agents/planning/blueprint.ts` | Modify | Add auth detection instructions to blueprint system prompts |
| `worker/agents/prompts.ts` | Modify | Add `AUTH_STRATEGY` block, replace mock auth line, update use-case instructions, wire `authInstructions` variable |
| `templates/definitions/vite-cf-DO-v2-runner/prompts/usage.md` | Modify | Add Authentication Patterns section |

---

### Task 1: Add auth fields to blueprint schemas

**Files:**
- Modify: `worker/agents/schemas.ts:85-119` (both blueprint schemas)
- Modify: `worker/agents/schemas.ts:163` (Blueprint union type -- automatic via inference, just verify)

- [ ] **Step 1: Add `authRequired` and `authRoles` to `PhasicBlueprintSchema`**

In `worker/agents/schemas.ts`, add two fields to `PhasicBlueprintSchema` after the `initialPhase` field (line 114):

```typescript
export const PhasicBlueprintSchema = SimpleBlueprintSchema.extend({
    // ... existing fields unchanged ...
    initialPhase: PhaseConceptSchema.describe('The first phase to be implemented, in **STRICT** accordance with <PHASE GENERATION STRATEGY>'),
    authRequired: z.boolean().describe('Whether the application requires user authentication. True for apps with user-specific data, accounts, or admin panels (e-commerce, SaaS, dashboards, social platforms). False for games, calculators, landing pages, portfolios, static tools.').default(false),
    authRoles: z.array(z.string()).describe('User roles for the application when auth is required. Use ["admin", "user"] as default.').default(['admin', 'user']),
});
```

- [ ] **Step 2: Add `authRequired` and `authRoles` to `AgenticBlueprintSchema`**

In `worker/agents/schemas.ts`, add the same fields to `AgenticBlueprintSchema` (line 117-119):

```typescript
export const AgenticBlueprintSchema = SimpleBlueprintSchema.extend({
    plan: z.array(z.string()).describe('Step by step plan for implementing the project'),
    authRequired: z.boolean().describe('Whether the application requires user authentication. True for apps with user-specific data, accounts, or admin panels (e-commerce, SaaS, dashboards, social platforms). False for games, calculators, landing pages, portfolios, static tools.').default(false),
    authRoles: z.array(z.string()).describe('User roles for the application when auth is required. Use ["admin", "user"] as default.').default(['admin', 'user']),
});
```

- [ ] **Step 3: Run typecheck to verify schema changes compile**

Run: `cd /Users/sumitkumartiwari/Documents/VIBE/vibesdk-new && bun run typecheck`

Expected: No new errors. The `BlueprintSchemaLite` (which is `PhasicBlueprintSchema.omit({ initialPhase: true })`) will automatically include the new fields. The `Blueprint` union type is inferred from the schemas so it also picks them up.

- [ ] **Step 4: Commit**

```bash
git add worker/agents/schemas.ts
git commit -m "feat: add authRequired and authRoles fields to blueprint schemas"
```

---

### Task 2: Add auth detection instructions to blueprint prompts

**Files:**
- Modify: `worker/agents/planning/blueprint.ts:84-215` (PHASIC_SYSTEM_PROMPT)
- Modify: `worker/agents/planning/blueprint.ts:17-82` (SIMPLE_SYSTEM_PROMPT)

- [ ] **Step 1: Add auth detection guidance to `PHASIC_SYSTEM_PROMPT`**

In `worker/agents/planning/blueprint.ts`, add the following block inside `PHASIC_SYSTEM_PROMPT` after the `## Important use case specific instructions:` section (after line 152, before `## Algorithm & Logic Specification`):

```typescript
    ## Authentication Decision
    Determine whether the application needs user authentication based on the user's request and the template's capabilities.

    **Set \`authRequired: true\` when ALL of these conditions are met:**
    1. The template has a persistence layer (Durable Objects, KV, or D1 -- check the template details)
    2. The application involves ANY of:
       - User accounts, profiles, or personal data (e-commerce, SaaS, social platforms)
       - Admin panels or management interfaces
       - User-specific content (orders, dashboards, settings, saved items)
       - Multi-user access with different permission levels
       - Any feature where "who is using it" matters

    **Set \`authRequired: false\` when:**
    - The template has NO persistence layer
    - The application is a single-player game, calculator, converter, or utility tool
    - The application is a landing page, portfolio, or static content site
    - The application has no concept of user identity or personal data
    - Data visualizations or tools where all users see the same content

    **When \`authRequired: true\`:**
    - Set \`authRoles\` to \`["admin", "user"]\`
    - Include login and register views in the \`views\` array
    - Account for auth in the \`userJourney\` (user starts at login, registers, then accesses the app)
    - Plan auth implementation in the first phase of the \`implementationRoadmap\`
    - Include auth-related pitfalls (token expiry handling, password validation, protected route redirects)
```

- [ ] **Step 2: Add brief auth guidance to `SIMPLE_SYSTEM_PROMPT`**

In `worker/agents/planning/blueprint.ts`, add the following inside `SIMPLE_SYSTEM_PROMPT` after the `## Implementation Plan` section (after line 65, before `</INSTRUCTIONS>`):

```typescript
    ## Authentication
    Set \`authRequired: true\` if the application needs user accounts, login, or role-based access AND the template has a persistence layer. Set \`authRoles\` to \`["admin", "user"]\` when auth is required. Default to \`false\` for games, tools, landing pages, or templates without persistence.
```

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/sumitkumartiwari/Documents/VIBE/vibesdk-new && bun run typecheck`

Expected: No errors. These are string template changes only.

- [ ] **Step 4: Commit**

```bash
git add worker/agents/planning/blueprint.ts
git commit -m "feat: add auth detection instructions to blueprint generation prompts"
```

---

### Task 3: Add AUTH_STRATEGY to prompts and replace mock auth line

**Files:**
- Modify: `worker/agents/prompts.ts:842-946` (STRATEGIES_UTILS)
- Modify: `worker/agents/prompts.ts:920-923` (CONSTRAINTS, replace mock auth line)
- Modify: `worker/agents/prompts.ts:1189-1234` (generalSystemPromptBuilder)

- [ ] **Step 1: Add `AUTH_STRATEGY` to `STRATEGIES_UTILS`**

In `worker/agents/prompts.ts`, add the following property to the `STRATEGIES_UTILS` object (after the `CONSTRAINTS` property, around line 946):

```typescript
    AUTH_STRATEGY: `<AUTH IMPLEMENTATION REQUIREMENTS>
    The blueprint specifies that this application requires user authentication with role-based access control.
    You MUST implement real authentication using the template's persistence layer. Do NOT use mock/fake auth.

    **Architecture:**
    - Two roles: "admin" and "user"
    - Token-based auth: login returns a Bearer token, frontend sends it in Authorization header
    - Session storage in the persistence layer (Durable Object entity)
    - Password hashing via Web Crypto API (PBKDF2, SHA-256, 100k iterations)

    **Required Auth Routes (under /api/auth/*):**
    - POST /api/auth/register -- validate input, check duplicate email, hash password with salt, create user entity, create session entity, return { token, user }
    - POST /api/auth/login -- find user by email (iterate or use index), verify password against stored hash, create session entity with 24h expiry, return { token, user }
    - GET /api/auth/me -- read userId from request context (set by middleware), fetch user entity, return user without passwordHash/salt
    - POST /api/auth/logout -- extract token from Authorization header, delete session entity

    **Auth Middleware (apply to all /api/* except /api/auth/login and /api/auth/register):**
    - Read Authorization: Bearer <token> header
    - Look up session entity by token, check expiresAt > Date.now()
    - Attach userId and role to Hono context via c.set()
    - Return 401 JSON for missing/invalid/expired tokens
    - Create a requireRole(role) middleware factory for admin-only routes that returns 403

    **Frontend Requirements:**
    - AuthContext provider wrapping the app, storing token + user in React state
    - Token persisted in localStorage, attached to all fetch requests via Authorization header
    - Login page and Register page with email/password forms
    - ProtectedRoute wrapper component that redirects to /login when unauthenticated
    - Role-based UI: conditionally render admin features (e.g., product management, user list) only for admin role
    - Logout button that clears token from localStorage and context

    **Seed Data (critical for demo):**
    - Admin account: admin@example.com / admin123 (role: "admin", name: "Admin")
    - User account: user@example.com / user123 (role: "user", name: "Demo User")
    - Pre-fill the login form with user@example.com / user123 so the app works on first load
    - Seed via async initialization (hash passwords at runtime using Web Crypto, not pre-computed strings)

    **Phase Strategy:**
    - Auth MUST be part of the first phase -- it is foundational, other features depend on knowing who the user is
    - First phase includes: auth entities, password utils, auth routes, auth middleware, login/register pages, auth context, protected route wrapper
    - Subsequent phases build on the auth context (e.g., "current user's orders", "admin product management")
    </AUTH IMPLEMENTATION REQUIREMENTS>`,
```

- [ ] **Step 2: Replace the mock auth line in CONSTRAINTS**

In `worker/agents/prompts.ts`, replace line 923:

Old:
```
        **If auth functionality is required, provide mock auth functionality primarily. Provide real auth functionality ONLY IF template has persistence layer. Remember to seed the persistence layer with mock data AND Always PREFILL the UI with mock credentials. No oauth needed**
```

New:
```
        **Authentication: If the blueprint has authRequired: true, follow the {{authInstructions}} section precisely. If authRequired is false or not set, do NOT add any auth scaffolding. If auth is needed but the template has no persistence layer, provide mock auth with pre-filled credentials and in-memory user array. No OAuth.**
```

- [ ] **Step 3: Wire `authInstructions` variable in `generalSystemPromptBuilder`**

In `worker/agents/prompts.ts`, add the following block inside `generalSystemPromptBuilder` after the `templateMetaInfo` check (after line 1230, before the `formattedPrompt` line):

```typescript
    // Auth instructions - inject strategy when blueprint requires auth
    if (params.blueprint && 'authRequired' in params.blueprint && params.blueprint.authRequired) {
        variables.authInstructions = STRATEGIES_UTILS.AUTH_STRATEGY;
    } else {
        variables.authInstructions = '';
    }
```

- [ ] **Step 4: Run typecheck**

Run: `cd /Users/sumitkumartiwari/Documents/VIBE/vibesdk-new && bun run typecheck`

Expected: No errors. `STRATEGIES_UTILS` is a plain object with string values. The `params.blueprint` type check uses `'authRequired' in params.blueprint` which is a valid type narrowing pattern.

- [ ] **Step 5: Commit**

```bash
git add worker/agents/prompts.ts
git commit -m "feat: add AUTH_STRATEGY block and conditional auth instruction wiring"
```

---

### Task 4: Update use-case specific instructions with auth role guidance

**Files:**
- Modify: `worker/agents/prompts.ts:1400-1430` (use-case instructions and switch statement)

- [ ] **Step 1: Add auth role guidance to E-Commerce instructions**

In `worker/agents/prompts.ts`, append to `ECOMM_INSTRUCTIONS` (before the closing backtick at line 1406):

```typescript
const ECOMM_INSTRUCTIONS = (): string => `
** If there is no brand/product name specified, come up with a suitable name
** Include a prominent hero section with a headline, subheadline, and a clear call-to-action (CTA) button above the fold.
** Insert a product showcase section with high-quality images, descriptions, and prices.
** Provide a collapsible sidebar (desktop) or an expandable top bar (tablet/mobile) containing filters (category, price range slider, brand, color swatches), so users can refine results without leaving the page.
** Use a clean, modern layout with generous white space and a clear visual hierarchy
** Auth Roles: Admin manages products, categories, orders, and inventory. User browses products, manages cart, places orders, views order history. Product management and order management pages are admin-only.
`;
```

- [ ] **Step 2: Add auth role guidance to Dashboard instructions**

In `worker/agents/prompts.ts`, append to `DASHBOARD_INSTRUCTIONS` (before the closing backtick at line 1416):

```typescript
const DASHBOARD_INSTRUCTIONS = (): string => `
** If applicable to user query group Related Controls and Forms into Well-Labeled Cards / Panels
** If applicable to user query offer Quick Actions / Shortcuts for Common Tasks
** If user asked for analytics/visualizations/statistics - Show sparklines, mini line/bar charts, or simple pie indicators for trends 
** If user asked for analytics/visualizations/statistics - Maybe show key metrics in modular cards
** If applicable to user query make It Interactive and Contextual (Filters, Search, Pagination)
** If applicable to user query add a sidebar and or tabs
** Dashboard should be information dense.
** Auth Roles: Admin manages data sources, settings, and user accounts. User views dashboards and reports. Settings and user management pages are admin-only.
`;
```

- [ ] **Step 3: Add auth role guidance to SaaS instructions**

In `worker/agents/prompts.ts`, append to `SAAS_LANDING_INSTRUCTIONS` (before the closing backtick, after the style instructions line):

```typescript
const SAAS_LANDING_INSTRUCTIONS = (style: TemplateSelection['styleSelection']): string => `
** If there is no brand/product name specified, come up with a suitable name
** Include a prominent hero section with a headline, subheadline, and a clear call-to-action (CTA) button above the fold.
** Insert a pricing table with tiered plans if applicable
** Design a footer with key navigation links, company info, social icons, and a newsletter sign-up.
** Add a product feature section using icon-text pairs or cards to showcase 3-6 key benefits.
** Use a clean, modern layout with generous white space and a clear visual hierarchy
** Show the magic live i.e if possible show a small demo of the product. Only if simple and feasible.
** Generate SVG illustrations where absolutely relevant.
** Auth Roles: Admin manages workspace settings, billing, and team members. User accesses features and personal settings. Workspace management is admin-only.

Use the following artistic style:
${getStyleInstructions(style)}
`;
```

- [ ] **Step 4: Run typecheck**

Run: `cd /Users/sumitkumartiwari/Documents/VIBE/vibesdk-new && bun run typecheck`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add worker/agents/prompts.ts
git commit -m "feat: add auth role guidance to use-case specific instructions"
```

---

### Task 5: Add Authentication Patterns section to DO v2 template usage.md

**Files:**
- Modify: `templates/definitions/vite-cf-DO-v2-runner/prompts/usage.md:82-104` (after Storage Patterns, before Frontend)

- [ ] **Step 1: Add the Authentication Patterns section**

In `templates/definitions/vite-cf-DO-v2-runner/prompts/usage.md`, insert the following section after `Storage Patterns` (after line 104, before `## Frontend`):

````markdown
## Authentication Patterns (when blueprint specifies authRequired: true)

Use these patterns to implement real user authentication on this template. All auth data is stored via the Entity/IndexedEntity pattern from `core-utils.ts`.

### Auth Entities (add to `worker/entities.ts`)
```ts
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
  // seedData populated via async seedAuth() below -- NOT static seedData
}

interface Session {
  id: string;
  userId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
}

// Sessions are looked up by token (used as entity ID), not listed -- use Entity, not IndexedEntity
export class SessionEntity extends Entity<Session> {
  static readonly entityName = "session";
  static readonly initialState: Session = {
    id: "", userId: "", token: "", createdAt: 0, expiresAt: 0
  };
}
```

### Password Hashing (add to `worker/auth-utils.ts`)
```ts
export async function generateSalt(): Promise<string> {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
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

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  return (await hashPassword(password, salt)) === hash;
}
```

### Auth Middleware (add to `worker/user-routes.ts`)
```ts
import { createMiddleware } from 'hono/factory';
import { SessionEntity, AuthUserEntity } from './entities';

const authMiddleware = createMiddleware(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  const token = header.slice(7);
  const session = new SessionEntity(c.env, token);
  if (!await session.exists()) return c.json({ error: 'Invalid session' }, 401);
  const data = await session.getState();
  if (data.expiresAt < Date.now()) return c.json({ error: 'Session expired' }, 401);
  c.set('userId', data.userId);
  const user = new AuthUserEntity(c.env, data.userId);
  const userData = await user.getState();
  c.set('userRole', userData.role);
  await next();
});

const requireRole = (role: string) => createMiddleware(async (c, next) => {
  if (c.get('userRole') !== role) return c.json({ error: 'Forbidden' }, 403);
  await next();
});

// Apply to all /api/* except public auth routes
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/auth/')) return next();
  return authMiddleware(c, next);
});
```

### Auth Routes (add to `worker/user-routes.ts`)
```ts
import { generateSalt, hashPassword, verifyPassword } from './auth-utils';

// Register
app.post('/api/auth/register', async (c) => {
  const { email, password, name } = await c.req.json();
  if (!email || !password || !name) return bad(c, 'email, password, and name required');
  // Check duplicate by listing and filtering (IndexedEntity)
  const existing = await AuthUserEntity.list(c.env, null, 100);
  if (existing.items.some(u => u.email === email)) return bad(c, 'Email already registered');
  const salt = await generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const id = crypto.randomUUID();
  const user = await AuthUserEntity.create(c.env, { id, email, passwordHash, salt, role: 'user', name, createdAt: Date.now() });
  const token = crypto.randomUUID();
  await SessionEntity.create(c.env, { id: token, userId: id, token, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
  return ok(c, { token, user: { id, email, name, role: 'user' } });
});

// Login
app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return bad(c, 'email and password required');
  const allUsers = await AuthUserEntity.list(c.env, null, 100);
  const user = allUsers.items.find(u => u.email === email);
  if (!user || !(await verifyPassword(password, user.salt, user.passwordHash))) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  const token = crypto.randomUUID();
  await SessionEntity.create(c.env, { id: token, userId: user.id, token, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
  return ok(c, { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// Get current user (protected by middleware)
app.get('/api/auth/me', async (c) => {
  const userId = c.get('userId');
  const user = new AuthUserEntity(c.env, userId);
  const data = await user.getState();
  return ok(c, { id: data.id, email: data.email, name: data.name, role: data.role });
});

// Logout (protected by middleware)
app.post('/api/auth/logout', async (c) => {
  const header = c.req.header('Authorization');
  const token = header!.slice(7);
  await SessionEntity.delete(c.env, token);
  return ok(c, { success: true });
});
```

### Seed Auth Data
```ts
// Call this once on app init (e.g., alongside other ensureSeed calls)
async function seedAuth(env: Env) {
  const existing = await AuthUserEntity.list(env, null, 1);
  if (existing.items.length > 0) return; // already seeded
  const adminSalt = await generateSalt();
  const userSalt = await generateSalt();
  await AuthUserEntity.create(env, {
    id: 'admin-1', email: 'admin@example.com',
    passwordHash: await hashPassword('admin123', adminSalt), salt: adminSalt,
    role: 'admin', name: 'Admin', createdAt: Date.now()
  });
  await AuthUserEntity.create(env, {
    id: 'user-1', email: 'user@example.com',
    passwordHash: await hashPassword('user123', userSalt), salt: userSalt,
    role: 'user', name: 'Demo User', createdAt: Date.now()
  });
}
```

### Frontend Auth Context Pattern
```tsx
// src/context/AuthContext.tsx
const AuthContext = createContext<{ user: AuthUser | null; token: string | null; login: Function; logout: Function; }>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setUser(d.data)).catch(() => logout());
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.data.token);
    setToken(data.data.token);
    setUser(data.data.user);
  };

  const logout = () => {
    if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, token, login, logout }}>{children}</AuthContext.Provider>;
}
```

### Protected Route Pattern
```tsx
function ProtectedRoute({ children, requiredRole }: { children: ReactNode; requiredRole?: string }) {
  const { user, token } = useContext(AuthContext);
  if (!token) return <Navigate to="/login" />;
  if (requiredRole && user?.role !== requiredRole) return <Navigate to="/" />;
  return <>{children}</>;
}
```

**Pre-fill login form** with `user@example.com` / `user123` as default values so the app is immediately demoable.
````

- [ ] **Step 2: Verify the usage.md is valid markdown**

Read back the file to confirm no formatting issues.

Run: `cd /Users/sumitkumartiwari/Documents/VIBE/vibesdk-new && head -20 templates/definitions/vite-cf-DO-v2-runner/prompts/usage.md && echo "---" && wc -l templates/definitions/vite-cf-DO-v2-runner/prompts/usage.md`

Expected: File exists, line count increased, no syntax issues.

- [ ] **Step 3: Commit**

```bash
git add templates/definitions/vite-cf-DO-v2-runner/prompts/usage.md
git commit -m "feat: add Authentication Patterns section to DO v2 template usage.md"
```

---

### Task 6: Verify end-to-end typecheck and lint

**Files:**
- All modified files from Tasks 1-5

- [ ] **Step 1: Run full typecheck**

Run: `cd /Users/sumitkumartiwari/Documents/VIBE/vibesdk-new && bun run typecheck`

Expected: No errors. All changes are to Zod schemas (which infer types automatically) and string templates.

- [ ] **Step 2: Run lint**

Run: `cd /Users/sumitkumartiwari/Documents/VIBE/vibesdk-new && bun run lint`

Expected: No new lint errors from our changes. If existing lint errors appear, they are pre-existing and not related to this work.

- [ ] **Step 3: Run knip (dead code detection)**

Run: `cd /Users/sumitkumartiwari/Documents/VIBE/vibesdk-new && bun run knip`

Expected: No new unused exports. `AUTH_STRATEGY` is consumed by `generalSystemPromptBuilder` via the `variables` object. The schema fields are consumed via Zod inference.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address typecheck/lint issues from auth feature"
```

Only run this step if Steps 1-3 revealed issues that needed fixing.
