# Cloudflare Codebase Migrations -- Complete Analysis & Work Done

A step-by-step record of all analysis, refactoring, and findings from comparing this fork (Appypie-Testing1/vibesdk-new) against the upstream Cloudflare vibesdk repository.

---

## Table of Contents

1. [Fork vs Upstream Status](#1-fork-vs-upstream-status)
2. [What the Fork Added (258 Commits)](#2-what-the-fork-added-258-commits)
3. [What Upstream Added (76 Commits)](#3-what-upstream-added-76-commits)
4. [Merge Conflict Analysis](#4-merge-conflict-analysis)
5. [Extensions Package Refactoring](#5-extensions-package-refactoring)
6. [Config Fix: tsconfig.app.json](#6-config-fix-tsconfigappjson)
7. [Upstream Expo Branches Analysis](#7-upstream-expo-branches-analysis)
8. [Comparison: Fork Expo vs Cloudflare Expo](#8-comparison-fork-expo-vs-cloudflare-expo)
9. [What to Take from Cloudflare's Expo Branches](#9-what-to-take-from-cloudflares-expo-branches)
10. [Recommended Next Steps](#10-recommended-next-steps)

---

## 1. Fork vs Upstream Status

**Analysis date:** 2026-04-15
**Merge base (common ancestor):** `9b0907b95502a8afdf88f2577eb19f60f63b463c`

| Metric | Value |
|--------|-------|
| Fork commits ahead of upstream | 258 |
| Fork commits behind upstream | 76 |
| Upstream date range | 2025-12-24 to 2026-04-13 (~4 months) |
| Fork date range | 2026-01-29 to 2026-04-11 (~11 weeks) |
| Upstream cumulative diff | 90 files, +6,571 / -1,384 lines |
| Fork cumulative diff | 103 files, +8,067 / -823 lines |
| Files changed by BOTH sides | 20 |
| Files with actual merge conflicts | 8 |
| Can merge cleanly? | NO -- 8 files with 15 conflict markers |

**Upstream remote configured as:**
```
upstream  https://github.com/cloudflare/vibesdk.git
```

---

## 2. What the Fork Added (258 Commits)

### Authors
- Avadhesh: 257 commits (99.6%) -- sole developer
- Sumit Tiwari: 1 commit (CLAUDE.md audit)

### Three Main Features

#### 2.1 Expo / React Native Mobile Support (~80% of changes)

The fork's primary purpose: adding mobile app generation to the web-only upstream platform.

**Backend (heaviest files):**

| File | Commits | Lines Added | Purpose |
|------|---------|-------------|---------|
| `worker/agents/services/implementations/DeploymentManager.ts` | 64 | +1,297 | EAS build pipeline, Expo deployment, artifact R2 storage |
| `worker/agents/utils/templates.ts` | 52 | +1,420 | Expo/React Native scaffolding, DB templates, routing |
| `worker/agents/prompts.ts` | -- | +338 | Mobile-aware LLM prompt engineering |
| `worker/agents/operations/PhaseGeneration.ts` | -- | +199 | Mobile phase generation logic |
| `worker/services/sandbox/sandboxSdkClient.ts` | 23 | +278 | Mobile sandbox support, Metro bundler |

**Frontend (new files):**

| File | Lines | Purpose |
|------|-------|---------|
| `eas-build-panel.tsx` | 153 | EAS build status UI |
| `ExpoQRPreview.tsx` | 114 | QR code for Expo Go |
| `mobile-preview-wrapper.tsx` | 67 | Phone frame mockup (dynamic island, side buttons) |
| `mobile-web-switcher.tsx` | 81 | Mobile/Web view toggle |
| `mobile-view-context.tsx` | 35 | View context provider |
| `expo-mobile.test.ts` (SDK) | 403 | Expo integration tests |

#### 2.2 Infrastructure Rebrand

| Setting | Upstream (Cloudflare) | Fork (AppyPie) |
|---------|----------------------|----------------|
| Domain | `build.cloudflare.dev` | `vibesnappy.appypie.com` |
| Dispatch namespace | `vibesdk-default-namespace` | `orange-build-default-namespace` |
| Container | Build from Dockerfile, 1400 instances | Pre-built registry image, 10 instances |
| Container size | vcpu:4, 8192MiB RAM | `standard-3` |
| D1/KV IDs | Cloudflare-owned | AppyPie-owned |
| New R2 bucket | (none) | `appypievibe` |

#### 2.3 Per-App Database Service

| File | Lines | Purpose |
|------|-------|---------|
| `worker/services/database/GlobalDurableObject.ts` | 311 | SQLite-backed DO for per-app storage |
| `worker/api/routes/database.ts` | 241 | REST CRUD API for apps, data, executions |
| `src/lib/database-client.ts` | 289 | Frontend client with CSRF |
| `src/lib/app-id-detector.ts` | 48 | App ID detection from URL |
| `src/hooks/use-app-database-init.ts` | 47 | Auto-init hook |

---

## 3. What Upstream Added (76 Commits)

**Authors:** Ashish Kumar Singh (39), Karishnu Poddar (36), github-actions[bot] (1)

### 3.1 SDK Overhaul (v0.0.3 -> v0.0.9)
- Build target changed: `bun` -> `browser`
- Removed `ws` (Node.js WebSocket) -- replaced with browser-native
- Deleted `sdk/src/node.ts`, `sdk/src/ws-node-shim.d.ts`
- Added phase timeline tracking with subscriptions
- WebSocket ticket auth with auto-reconnect
- New test infrastructure (miniflare, puppeteer, integration tests)

### 3.2 WebSocket Ticket Authentication
New files: `worker/api/controllers/ticket/controller.ts`, `worker/middleware/auth/ticketAuth.ts`, `worker/utils/wsTicketManager.ts`
Clients must now obtain tickets before WS connection. Major auth architecture change.

### 3.3 Security Fixes (CRITICAL)
- OAuth state manipulation prevention (JWT-signed state tokens)
- Signed screenshot URLs (JWT token verification)
- Owner-only enforcement for deploy/export
- GitHub export ownership checks with logging
- New files: `worker/utils/authUtils.ts`, `worker/utils/screenshot-security.ts`

### 3.4 Git Filesystem Chunked Storage
Replaced single-row file storage with multi-chunk (1.8MB) model to overcome 1MB SQL parameter limit. Includes automatic v1->v2 migration. Major rewrite of `fs-adapter.ts` and `memfs.ts`.

### 3.5 Static Analysis Service (NEW)
Entire new directory: `worker/services/static-analysis/`
In-memory analysis for browser-rendered projects (HTML/CSS/JS analyzers + cross-validation). New dependencies: `acorn`, `htmlparser2`.

### 3.6 Key Backend Changes
- Rate limits reduced: app creation 10/4hr -> 3/24hr, LLM calls 500/2hr -> 250/24hr
- Blueprint optimization for minimal templates (`MinimalBlueprintSchema`)
- Manual template selection bypass
- Preview URL fix with `resolvePreviewUrl()`
- Scratch template package.json editing

### 3.7 CI/CD
- AI-powered PR review via Bonk (`.github/workflows/ai-pr-review.yml`)
- Version: 1.4.0 -> 1.5.0 with CHANGELOG.md

### 3.8 All 27 New Files Added by Upstream

**Worker (16):** ticket controller, ticket routes, ticket auth middleware, auth types, wsTicketManager, encoding utils, screenshot security, URL utils, authUtils, static analysis (9 files: InMemoryAnalyzer, CSS/HTML/JS analyzers, HTMLCSSCrossValidator, types, validators, indexes)

**SDK (6):** expand-drizzle-types script, test server, state tests, integration test flow, worker integration tests, integration worker directory

**CI/CD (2):** ai-pr-review.yml, bonk.yml

**Other (1):** CHANGELOG.md

---

## 4. Merge Conflict Analysis

### Summary

| Category | Count |
|----------|-------|
| Files changed by fork only | 83 |
| Files changed by upstream only | 70 |
| Files changed by BOTH sides | 20 |
| Files that auto-merge cleanly | 12 |
| Files with actual merge conflicts | 8 |

### The 8 Conflict Files

| File | Severity | Root Cause |
|------|----------|-----------|
| `worker/agents/utils/templates.ts` | SEVERE | Both rewrote scratch templates + fork added Expo templates |
| `worker/agents/index.ts` | SEVERE | Both refactored `getTemplateForQuery()`; fork added mobile detection |
| `worker/api/controllers/screenshots/controller.ts` | SEVERE | Both restructured `serveScreenshot` method body |
| `worker/agents/services/implementations/DeploymentManager.ts` | MODERATE | Fork added ~1400 lines; upstream changed preview URL resolution |
| `worker/services/sandbox/sandboxSdkClient.ts` | MODERATE | Upstream removed `USE_TUNNEL_FOR_PREVIEW`; fork added Expo readiness |
| `worker/services/rate-limit/config.ts` | MODERATE | Intentional divergence: fork 50/50 vs upstream 3/3 limits |
| `worker/api/routes/index.ts` | TRIVIAL | Both added an import at same location |
| `bun.lock` | TRIVIAL | Regenerate with `bun install` |

### Recommended Merge Strategy
`git merge upstream/main` (not rebase). 8 conflicts are manageable (~4 hours total). Rate limits should keep fork values. Estimated resolution effort per file listed above.

---

## 5. Extensions Package Refactoring

### What Was Done

All fork-specific code was extracted from ~16 core upstream files into a new `extensions/` directory at project root. This reduces future merge conflicts to near-zero.

### Config Changes Made

**tsconfig.node.json** -- added `@ext/*` path alias:
```json
"@ext/*": ["./extensions/*"]
```

**tsconfig.app.json** -- added `@ext/*` path alias + include:
```json
"@ext/*": ["./extensions/*"]
"include": ["src", "shared", "extensions/ui"]
```

**tsconfig.worker.json** -- added extensions subdirectories to include:
```json
"include": [..., "./extensions/mobile", "./extensions/database", "./extensions/builds", "./extensions/config", "./extensions/index.ts"]
```

**vite.config.ts** -- added resolve alias:
```typescript
'@ext': path.resolve(__dirname, './extensions'),
```

### Directory Structure Created

```
extensions/
  mobile/
    detection.ts              # isMobileRequest() regex, detectMobileTemplate()
    types.ts                  # EasBuildPlatform, EasBuildStatus, EasBuildState
    templates/
      expo-scratch.ts         # createExpoScratchTemplateDetails() (~345 lines)
      expo-fullstack.ts       # createExpoFullstackTemplateDetails() (~450 lines)
      index.ts
    prompts/
      mobile-prompts.ts       # MOBILE_STRATEGIES, MOBILE_SYSTEM_PROMPT
      fullstack-prompts.ts    # FULLSTACK_MOBILE_STRATEGIES, FULLSTACK_MOBILE_SYSTEM_PROMPT
      index.ts                # getMobileSystemPrompt() helper
    deployment/
      eas-build-manager.ts    # EAS build trigger, poll, artifact storage
      mobile-deployment.ts    # MobileDeploymentHooks (Metro config, auto-install, .api-url)
      sanitizers.ts           # sanitizeWorkerEntryPoint, sanitizeWranglerConfig, sanitizeJsxBraces
      index.ts
    behavior/
      mobile-behavior.ts      # MobileBehavior (template synthesis, previewability, generation hooks)
      mobile-websocket.ts     # EAS_BUILD_TRIGGER, eas_build_check handlers
      expo-deep-link.ts       # computeExpoDeepLink() transformer
      index.ts
    sandbox/
      expo-readiness.ts       # EXPO_READINESS_PATTERNS (Metro/Expo log patterns)
      index.ts
    index.ts

  database/
    GlobalDurableObject.ts    # SQLite-backed DO (moved from worker/services/database/)
    routes.ts                 # /api/db/* routes (moved from worker/api/routes/database.ts)
    index.ts

  ui/
    components/
      mobile-preview-wrapper.tsx   # iPhone bezel mockup
      mobile-web-switcher.tsx      # Web/mobile toggle
      expo-qr-preview.tsx          # QR code overlay
      eas-build-panel.tsx          # EAS build status UI
    contexts/
      mobile-view-context.tsx      # Mobile view state provider
    styles/
      mobile-preview.css           # Phone frame styles
    hooks/
      use-app-database-init.ts     # Database auto-init
      use-app-execution-tracker.ts # Execution tracking
    lib/
      database-client.ts           # Frontend DB client
      app-id-detector.ts           # App ID detection
    index.ts

  builds/
    controller.ts             # BuildsController (APK/IPA download)
    index.ts

  config/
    rate-limits.ts            # Fork-specific rate limit overrides (50/50 vs upstream 3/3)
    index.ts

  index.ts                    # Main barrel (excludes UI to avoid React in worker bundle)
```

**38 new files created in extensions/.**

### Core Files Refactored

Each core file went from "hundreds of lines of fork code" to "1-3 import lines + thin hooks":

| Core File | Lines Removed | Lines Added | What Changed |
|-----------|--------------|-------------|--------------|
| `worker/agents/utils/templates.ts` | ~800 | 0 | Removed both Expo template functions entirely |
| `worker/agents/services/implementations/DeploymentManager.ts` | ~500 | ~10 | EAS, sanitizers, mobile hooks -> `@ext/mobile/deployment` |
| `worker/agents/prompts.ts` | ~220 | 0 | MOBILE_STRATEGIES, FULLSTACK_MOBILE_STRATEGIES removed |
| `worker/agents/operations/PhaseGeneration.ts` | ~200 | ~3 | Mobile system prompts -> `getMobileSystemPrompt()` |
| `worker/agents/core/websocket.ts` | ~110 | ~8 | EAS handlers -> `@ext/mobile/behavior` |
| `worker/agents/core/codingAgent.ts` | ~100 | ~8 | EAS polling -> `EasBuildManager` delegation |
| `worker/agents/core/behaviors/base.ts` | ~80 | ~15 | Mobile checks -> `MobileBehavior` delegation |
| `worker/agents/index.ts` | ~38 | ~3 | Mobile detection -> `detectMobileTemplate()` |
| `worker/agents/core/types.ts` | ~13 | ~1 | EAS types re-exported from `@ext/mobile/types` |
| `worker/services/sandbox/sandboxSdkClient.ts` | ~3 | ~3 | Expo patterns -> `EXPO_READINESS_PATTERNS` spread |
| `worker/api/routes/index.ts` | 1 | 1 | Import source changed to `@ext/database` |
| `worker/index.ts` | 1 | 1 | Export source changed to `@ext/database` |
| `worker/services/rate-limit/config.ts` | 3 | 3 | Values from `RATE_LIMIT_OVERRIDES` |
| `worker/api/routes/codegenRoutes.ts` | 1 | 1 | Import source changed to `@ext/builds` |
| `worker/agents/operations/prompts/phaseImplementationPrompts.ts` | 1 | 1 | Import source changed to `@ext/mobile/prompts` |

### 14 Original Files Deleted (after moving to extensions/)

1. `src/components/mobile-preview-wrapper.tsx`
2. `src/components/mobile-preview.css`
3. `src/components/mobile-web-switcher.tsx`
4. `src/contexts/mobile-view-context.tsx`
5. `src/features/app/components/ExpoQRPreview.tsx`
6. `src/hooks/use-app-database-init.ts`
7. `src/hooks/use-app-execution-tracker.ts`
8. `src/lib/database-client.ts`
9. `src/lib/app-id-detector.ts`
10. `src/routes/chat/components/eas-build-panel.tsx`
11. `worker/services/database/GlobalDurableObject.ts`
12. `worker/api/routes/database.ts`
13. `worker/api/controllers/builds/controller.ts`
14. `worker/GlobalDurableObject.ts`

### Frontend Import Updates

All `src/` files that imported from moved locations were updated to `@ext/ui/...`:

| File | Old Import | New Import |
|------|-----------|------------|
| `src/App.tsx` | `./contexts/mobile-view-context` | `@ext/ui/contexts/mobile-view-context` |
| `src/App.tsx` | `./hooks/use-app-database-init` | `@ext/ui/hooks/use-app-database-init` |
| `src/routes/app/index.tsx` | `@/contexts/mobile-view-context` | `@ext/ui/contexts/mobile-view-context` |
| `src/routes/app/index.tsx` | `@/components/mobile-web-switcher` | `@ext/ui/components/mobile-web-switcher` |
| `src/routes/app/index.tsx` | `@/components/mobile-preview-wrapper` | `@ext/ui/components/mobile-preview-wrapper` |
| `src/routes/chat/chat.tsx` | `./components/eas-build-panel` | `@ext/ui/components/eas-build-panel` |
| `src/routes/chat/components/view-header.tsx` | `@/components/mobile-web-switcher` | `@ext/ui/components/mobile-web-switcher` |
| `src/routes/chat/components/view-header.tsx` | `@/contexts/mobile-view-context` | `@ext/ui/contexts/mobile-view-context` |
| `src/routes/chat/components/main-content-panel.tsx` | `@/components/mobile-preview-wrapper` | `@ext/ui/components/mobile-preview-wrapper` |
| `src/features/app/components/AppPreview.tsx` | `@/contexts/mobile-view-context` | `@ext/ui/contexts/mobile-view-context` |

### Result

| Metric | Before | After |
|--------|--------|-------|
| Fork-specific lines in core files | ~2,500+ | ~65 |
| Core files with large fork changes | 16 | 0 |
| Core files with thin hook lines | 0 | 16 |
| Expected future merge conflicts | 8+ files | ~0 files |

---

## 6. Config Fix: tsconfig.app.json

### The Bug

During the extensions refactoring, `tsconfig.app.json` was set to:
```json
"include": ["src", "shared", "extensions"]
```

This caused the frontend tsconfig (which has DOM/React types but NO `@cloudflare/workers-types`) to compile ALL of `extensions/` -- including `extensions/mobile/`, `extensions/database/`, `extensions/builds/`, `extensions/config/` which use Cloudflare Worker types (`Env`, `DurableObjectState`, `ExecutionContext`, `cloudflare:workers`).

**Result:** Typecheck went from 0 errors to 129 errors (23 in extensions/, 106 in worker/ via transitive imports).

### The Fix

```json
"include": ["src", "shared", "extensions/ui"]
```

Only `extensions/ui/` contains React/browser code. Worker-side extensions are already typechecked by `tsconfig.worker.json` which has the Cloudflare types.

**Result:** Typecheck returns to 0 errors.

### Why It's Safe

- All 10 `@ext/*` imports from `src/` only target `@ext/ui/*`
- Zero imports of `@ext/mobile/*`, `@ext/database/*`, etc. from frontend
- `extensions/ui/*` has zero imports from `worker/*`
- `@ext/*` path alias still resolves correctly for all imports

---

## 7. Upstream Expo Branches Analysis

On 2026-04-15, Cloudflare's team shared two branches implementing Expo mobile support:

### Branch 1: `cloudflare/vibesdk:feat/expo-support`

**2 commits by Karishnu Poddar, 22 files, +408/-30 lines**

This is the **platform logic** -- the engine that detects mobile projects, renders previews, and manages the sandbox.

| Area | Implementation |
|------|---------------|
| **Mobile detection** | LLM-based: `templateSelector.ts` asks Claude to classify query as `app/workflow/presentation/general/mobile` |
| **Feature registry** | NEW plugin architecture: `src/features/mobile/index.ts` + `worker/agents/core/features/types.ts`. Each project type is a "feature" with capabilities (hasPreview, supportedExports, behaviorType, supportedViews) |
| **QR preview UI** | `MobilePreview.tsx` with iPhone bezel (375x812) + tab switcher (Web/QR). Floating QR button in toolbar via `main-content-panel.tsx` |
| **Tunnel integration** | Sets `EXPO_PACKAGER_PROXY_URL` env var on Metro so bundles embed the tunnel URL instead of localhost |
| **URL conversion** | `toExpoUrl()`: `https://` -> `exps://`, `http://` -> `exp://` for Expo Go deep links |
| **Capabilities** | `PLATFORM_CAPABILITIES` env var + `/api/capabilities` endpoint for backend-driven feature gating |
| **Deploy block** | Mobile projects CANNOT deploy to Cloudflare Workers (returns "Export to GitHub instead") |
| **Preview iframe** | CORS-aware handling: treats `.trycloudflare.com` CORS errors as "sandbox available" |
| **Blueprint guidance** | Tells LLM: "Use React Native components, NativeWind styling, no HTML, don't modify config files" |
| **Behavior type** | Mobile uses `agentic` (autonomous agent) not `phasic` (step-by-step) |

**Key new files:**
- `src/features/mobile/index.ts` (53 lines) -- mobile feature module
- `src/features/app/components/MobilePreview.tsx` (121 lines) -- preview with bezel + QR
- `src/features/mobile/components/MobileHeaderActions.tsx` (24 lines) -- header buttons
- `worker/agents/core/features/types.ts` (150+ lines) -- feature capability definitions

### Branch 2: `cloudflare/vibesdk-templates:feat/expo-support-v2`

**1 commit, 13 files, +4,674 lines (95% is lockfile)**

This is the **template** -- a separate repo (`cloudflare/vibesdk-templates`) containing starter files for different project types. The expo branch adds one new template: `expo-runner`.

**Template structure:**

| File | Purpose |
|------|---------|
| `definitions/expo-runner.yaml` | Metadata: name, description, projectType: mobile |
| `definitions/expo-runner/prompts/selection.md` | When to select (user wants mobile/iOS/Android/RN) |
| `definitions/expo-runner/prompts/usage.md` | LLM rules: no HTML, no installs, NativeWind, path aliases |
| `definitions/expo-runner/bun.lock` | Pre-built lockfile (no install needed at runtime) |
| `reference/expo-reference/package.json` | 40+ deps: expo 54, react-native 0.81.5, nativewind 4, zustand, react-query |
| `reference/expo-reference/app.json` | Expo config: both iOS + Android targets, New Architecture, typed routes |
| `reference/expo-reference/babel.config.js` | NativeWind JSX transform + reanimated plugin |
| `reference/expo-reference/.donttouch_files.json` | Protected files LLM must not modify |
| `reference/expo-reference/eslint.config.js` | Linting config |
| `reference/expo-reference/expo-env.d.ts` | TypeScript ambient types |
| `reference/expo-reference/bun.lock` | Dependency lockfile (2,205 lines) |

### How the Two Branches Work Together

They are NOT alternatives -- they are **two halves of one feature**:

- **Branch 1** (vibesdk) = the engine that runs mobile projects
- **Branch 2** (templates) = the starter template loaded by the engine

Branch 1 detects "mobile" -> filters templates by `projectType: 'mobile'` -> loads `expo-runner` from R2 -> generates code using it.

Neither works without the other.

### Templates Repo: `main` vs `feat/expo-support-v2`

**main branch:** 11 templates (all web/slides):
`c-code-next-runner`, `c-code-react-runner`, `minimal-js`, `minimal-vite`, `reveal-presentation-dev`, `reveal-presentation-pro`, `vite-cf-DO-KV-runner`, `vite-cf-DO-runner`, `vite-cf-DO-v2-runner`, `vite-cfagents-runner`

**expo branch:** 12 templates (main + 1 new):
All of the above + `expo-runner` (Expo React Native mobile app)

Purely additive: 13 new files, 0 modified files.

---

## 8. Comparison: Fork Expo vs Cloudflare Expo

### Feature-by-Feature

| Feature | Fork (extensions/mobile/) | Cloudflare (feat/expo-support) |
|---------|--------------------------|-------------------------------|
| **Code volume** | ~8,000 lines across 258 commits | ~400 lines in 2 commits + ~250 lines in template |
| **Mobile detection** | Regex-based (fast, deterministic, free) | LLM-based (slow, costs tokens, catches edge cases) |
| **Templates** | Inline (expo-scratch + expo-fullstack, ~800 lines) | External repo (expo-runner, loaded from R2) |
| **Fullstack template** | YES (Hono + D1 + API client) | NO (frontend-only) |
| **Backend/API support** | YES (Hono server, D1 database, wrangler.jsonc) | NONE (pure local state) |
| **Cloudflare tunnel** | YES (cloudflared + URL extraction) | YES (same approach) |
| **EXPO_PACKAGER_PROXY_URL** | YES | YES |
| **QR code** | qrcode.react (overlay panel) | qrcode.react (tabbed view) |
| **iPhone bezel mockup** | Elaborate (dynamic island, home indicator, side buttons) | Basic (rounded rect + notch) |
| **exp:// URL scheme** | Only `exp://` (relies on SDK 54 HTTPS support) | Both `exp://` and `exps://` (more correct) |
| **Web/Mobile view switcher** | YES | NO |
| **EAS Build (APK/IPA)** | FULL pipeline (trigger, poll, R2 artifacts) | NONE |
| **Feature registry/plugin** | Partial (has `src/features/`) | Full (capabilities-driven, lazy-loaded) |
| **PLATFORM_CAPABILITIES** | NO | YES (env var + API endpoint) |
| **Deploy block for mobile** | NO (users can trigger broken deploy) | YES (returns clear error message) |
| **CORS preview fix** | NO | YES (smart tunnel detection) |
| **Blueprint guidance** | Extensive mobile prompts (~200+ lines) | Concise (~7 lines) |
| **Styling approach** | StyleSheet.create() | NativeWind (Tailwind for RN) |
| **State management** | None in template | Zustand + React Query |
| **Metro proxy** | Custom `_expo-proxy.cjs` reverse proxy | None (just env var) |
| **GitHub export** | Reuses existing | Reuses existing (no changes) |
| **Worker deploy for mobile** | Allowed (will fail) | Blocked with message |

### What Cloudflare Has That Fork Doesn't

1. **`exps://` URL scheme** for HTTPS tunnel URLs (more correct Expo Go convention)
2. **Feature registry / capabilities system** (backend-driven, lazy-loaded plugin architecture)
3. **`PLATFORM_CAPABILITIES` env var** (enable/disable features per deployment)
4. **Block mobile deploy to Workers** (clean error instead of broken deploy)
5. **CORS-aware preview iframe** (treats tunnel CORS errors as "sandbox available")
6. **LLM-based project type classification** (catches natural language edge cases regex misses)
7. **NativeWind styling** in template (Tailwind classes in React Native)
8. **External template pattern** (templates as files in separate repo, not inline code)

### What Fork Has That Cloudflare Doesn't

1. **EAS Build pipeline** (trigger builds, poll status, download APK/IPA from R2)
2. **Fullstack mobile template** (Hono API + D1 database + API client)
3. **Backend/API for mobile apps** (Cloudflare has ZERO backend solution)
4. **Web/Mobile view switcher** (toggle preview size)
5. **Metro reverse proxy** (`_expo-proxy.cjs` for header sanitization)
6. **Elaborate phone mockup** (dynamic island, home indicator, side buttons, ambient shadow)
7. **Regex-based fast detection** (instant, free, deterministic)
8. **Per-app database service** (GlobalDurableObject with SQLite)

---

## 9. What to Take from Cloudflare's Expo Branches

### HIGH VALUE -- adopt these:

**1. Block mobile deploy to Workers (10 lines in base.ts)**
Your fork lets users trigger a broken deploy on mobile projects. CF returns: "Deployment to Cloudflare is not supported for mobile apps. Export to GitHub instead." Prevents user confusion.

**2. `exps://` URL for HTTPS (1 line in expo-deep-link.ts)**
Your fork uses `exp://` for all URLs. CF correctly uses `exps://` for HTTPS tunnel URLs. This is the standard Expo Go convention.

**3. CORS-aware preview iframe (42 lines in preview-iframe.tsx)**
Tunnel URLs fail CORS checks even when sandbox is running. CF treats `.trycloudflare.com` CORS errors as "sandbox available" and shows the preview. Without this, mobile previews via tunnel show "not ready" forever.

**4. Feature registry / capabilities system (150+ lines)**
Backend-driven plugin architecture. Each project type declares: supportedViews, supportedExports, behaviorType, hasPreview, etc. UI adapts automatically. Features can be enabled/disabled per deployment via `PLATFORM_CAPABILITIES` env var. Combines well with the `extensions/` package.

**5. LLM classification as fallback for regex detection**
Keep regex as fast path. Add LLM classification as fallback for edge cases like "cross-platform app for phones and tablets" where no mobile keyword appears.

### MEDIUM VALUE -- nice to have:

**6. NativeWind styling in templates**
CF uses NativeWind (Tailwind for React Native). Fork uses StyleSheet.create(). NativeWind is more modern and matches the Tailwind workflow web users already know.

**7. `LOCAL_TEMPLATES_DIR` env var**
Allows loading templates from local disk during development instead of R2. Makes template editing easier (real files with syntax highlighting vs string literals in TS).

### LOW VALUE / DON'T ADOPT:

**8. CF's expo-runner template** -- Fork's templates are better (fullstack + proxy shim).

**9. CF's blueprint wording** -- Both are equivalent. Not worth changing.

---

## 10. Recommended Next Steps

### Immediate (before next upstream merge)

1. **Apply the tsconfig.app.json fix** (Section 6) -- restores typecheck to 0 errors
2. **Block mobile deploy to Workers** -- adopt CF's 10-line check
3. **Fix `exps://` URL scheme** -- 1-line change in `computeExpoDeepLink()`
4. **Add CORS-aware preview iframe** -- adopt CF's tunnel detection

### Short-term (before PR to Cloudflare)

5. **Adopt feature registry / capabilities system** -- cleaner architecture for multi-project-type support
6. **Add LLM classification fallback** -- supplement regex detection for edge cases
7. **Update Expo template to use NativeWind** -- modernize styling approach
8. **Run `git merge upstream/main`** to sync the 76 upstream commits -- the extensions refactoring reduces conflicts to near-zero

### Medium-term (quality improvements)

9. **Move inline templates to external files** -- easier to maintain, test, and update independently
10. **Squash fork's 258 commits** into semantic feature commits before PR
11. **Add integration tests** for mobile flow (template detection -> generation -> preview -> QR)

### For a Cloudflare PR

Cloudflare's email said: *"if you do end up developing a production ready version of it we would love a PR!"*

A PR should include:
- EAS Build pipeline (fork's unique value)
- Fullstack mobile template (Hono + D1)
- Feature registry integration
- The extensions/ package pattern for clean separation
- Tests

Skip fork-specific items: infrastructure rebrand, per-app database, rate limit overrides.
