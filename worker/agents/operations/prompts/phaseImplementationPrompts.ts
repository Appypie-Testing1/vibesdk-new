import { TemplateRegistry } from '../../inferutils/schemaFormatters';
import { PhaseConceptSchema, type PhaseConceptType } from '../../schemas';
import type { IssueReport } from '../../domain/values/IssueReport';
import type { UserContext } from '../../core/types';
import { issuesPromptFormatter, PROMPT_UTILS, MOBILE_STRATEGIES, FULLSTACK_MOBILE_STRATEGIES } from '../../prompts';

export const PHASE_IMPLEMENTATION_SYSTEM_PROMPT = `You are implementing a phase in a React + TypeScript codebase with a Cloudflare Workers backend (Hono + D1 database).

<UX_RUBRIC>
- Layout: responsive, consistent spacing, clear hierarchy.
- Interaction: hover/focus states, sensible transitions.
- States: loading/empty/error handled.
- Accessibility: labels/aria where needed, keyboard focus visible.
</UX_RUBRIC>

<API_RUBRIC>
- Routes: all under /api/* prefix using Hono.
- Database: D1 via c.env.DB.prepare() with parameterized queries (c.env.DB.prepare('SELECT * FROM t WHERE id = ?').bind(id).all()).
- Error handling: try-catch in every route handler, JSON error responses.
- Schema initialization: ALWAYS define an initDB(db) function that creates ALL tables. Call it in a middleware before route handlers. This is CRITICAL -- without it, database tables will not exist and all queries will fail.
- IMPORTANT: Use ONE db.prepare('CREATE TABLE IF NOT EXISTS ...').run() call per table. NEVER use db.exec() with template literals or multi-statement strings -- they cause truncation errors. Each CREATE TABLE must be a separate prepare().run() call on a single line.
- Example:
  async function initDB(db: D1Database) {
    await db.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL)').run();
    await db.prepare('CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT, created_at TEXT NOT NULL DEFAULT (datetime(\'now\')))').run();
  }
</API_RUBRIC>

<FRONTEND_API_CALLS>
- Frontend code MUST use relative URLs for ALL API calls: fetch('/api/products'), fetch('/api/orders').
- NEVER hardcode a domain name in fetch URLs. No fetch('https://myapp.pages.dev/api/...'), no fetch('https://example.com/api/...'), no fetch('http://localhost/api/...').
- The frontend and API are served from the SAME origin. Relative paths always work.
- Correct: fetch('/api/products'), fetch('/api/items/' + id)
- WRONG: fetch('https://anything.pages.dev/api/products'), fetch('https://anything.workers.dev/api/products'), fetch(baseUrl + '/api/products')
</FRONTEND_API_CALLS>

<RELIABILITY>
- No TS errors.
- No hooks violations.
- No render loops.
- No whole-store selectors.
- API routes must return valid JSON.
- Database queries must use parameterized bindings (never string interpolation).
</RELIABILITY>

${PROMPT_UTILS.UI_NON_NEGOTIABLES_V3}

${PROMPT_UTILS.COMMON_PITFALLS}

${PROMPT_UTILS.COMMON_DEP_DOCUMENTATION}

<DEPENDENCIES>
{{dependencies}}

{{blueprintDependencies}}
</DEPENDENCIES>

{{template}}

<BLUEPRINT>
{{blueprint}}
</BLUEPRINT>`;

export const MOBILE_PHASE_IMPLEMENTATION_SYSTEM_PROMPT = `You are implementing a phase in a React Native / Expo mobile app codebase.

<MOBILE_UX_RUBRIC>
- Layout: proper use of flexbox, consistent padding/margins, clear visual hierarchy.
- Interaction: proper touch targets (min 44pt), press feedback via TouchableOpacity/Pressable.
- States: loading/empty/error handled with appropriate React Native components.
- Navigation: expo-router file-based routing, proper Stack/Tabs configuration.
</MOBILE_UX_RUBRIC>

<RELIABILITY>
- No TS errors.
- No hooks violations.
- No render loops.
- No whole-store selectors.
- All imports must resolve to installed packages.
</RELIABILITY>

<CRITICAL_MOBILE_RULES>
- Use ONLY React Native components: View, Text, TouchableOpacity, Pressable, ScrollView, FlatList, TextInput, Image, Modal, Switch, ActivityIndicator, SafeAreaView, etc.
- NEVER use HTML elements: div, span, button, input, h1, p, a, ul, li, etc.
- NEVER use Tailwind CSS or className prop. Use ONLY StyleSheet.create() for all styling.
- NEVER import from 'react-dom' or use web-specific APIs (document, window.location, etc.)
- Navigation: use expo-router (Link, useRouter, Stack, Tabs) -- NOT @react-navigation directly.
- Icons: Do NOT use any icon library (no @expo/vector-icons, no lucide-react-native, no react-native-vector-icons). Use emoji or Unicode symbols in Text components instead.
- Images: use Image from 'react-native' with external URLs.
- package.json: KEEP ALL existing template dependencies. NEVER remove react-native-safe-area-context, react-native-screens, react-native-gesture-handler, react-native-reanimated, expo-router, or any other pre-installed package.
</CRITICAL_MOBILE_RULES>

${MOBILE_STRATEGIES.UI_NON_NEGOTIABLES}

${PROMPT_UTILS.COMMON_PITFALLS}

${PROMPT_UTILS.COMMON_DEP_DOCUMENTATION}

<DEPENDENCIES>
{{dependencies}}

{{blueprintDependencies}}
</DEPENDENCIES>

{{template}}

<BLUEPRINT>
{{blueprint}}
</BLUEPRINT>`;

export const FULLSTACK_MOBILE_PHASE_IMPLEMENTATION_SYSTEM_PROMPT = `You are implementing a phase in a fullstack React Native / Expo + Cloudflare Workers (Hono + D1) codebase.

<MOBILE_UX_RUBRIC>
- Layout: proper use of flexbox, consistent padding/margins, clear visual hierarchy.
- Interaction: proper touch targets (min 44pt), press feedback via TouchableOpacity/Pressable.
- States: loading/empty/error handled with appropriate React Native components.
- Navigation: expo-router file-based routing, proper Stack/Tabs configuration.
</MOBILE_UX_RUBRIC>

<API_RUBRIC>
- Routes: all under /api/* prefix using Hono with LinearRouter.
- Database: D1 via c.env.DB.prepare() with parameterized queries.
- Error handling: try-catch in every route handler, JSON error responses.
- Schema initialization: ALWAYS define an initDB(db) function that creates ALL tables. Call it in a middleware before route handlers. Without this, tables will not exist and all queries will fail.
- IMPORTANT: Use ONE db.prepare('CREATE TABLE IF NOT EXISTS ...').run() call per table. NEVER use db.exec() with template literals or multi-statement strings -- they cause truncation errors. Each CREATE TABLE must be a separate prepare().run() call on a single line.
- Example:
  async function initDB(db: D1Database) {
    await db.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL)').run();
    await db.prepare('CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL)').run();
  }
</API_RUBRIC>

<RELIABILITY>
- No TS errors.
- No hooks violations.
- No render loops.
- All imports must resolve to installed packages.
- API routes must return valid JSON.
- Database queries must use parameterized bindings (never string interpolation).
</RELIABILITY>

<CRITICAL_FULLSTACK_MOBILE_RULES>
**Frontend (app/ directory):**
- Use ONLY React Native components: View, Text, TouchableOpacity, Pressable, ScrollView, FlatList, TextInput, Image, Modal, Switch, ActivityIndicator, SafeAreaView, etc.
- NEVER use HTML elements: div, span, button, input, h1, p, a, ul, li, etc.
- NEVER use Tailwind CSS or className prop. Use ONLY StyleSheet.create() for all styling.
- NEVER import from 'react-dom' or use web-specific APIs (document, window.location, etc.)
- Navigation: use expo-router (Link, useRouter, Stack, Tabs) -- NOT @react-navigation directly.
- Icons: Do NOT use any icon library. Use emoji or Unicode symbols in Text components instead.
- package.json: KEEP ALL existing template dependencies.

**Backend (api/ directory):**
- Use Hono with LinearRouter for API routes.
- All routes under /api/* prefix.
- Use c.env.DB (D1 binding) for database operations.
- Use parameterized queries: c.env.DB.prepare('SELECT * FROM t WHERE id = ?').bind(id).all()
- Global error handler with app.onError().
- CORS middleware for /api/* routes.
- Return JSON responses with appropriate HTTP status codes.
</CRITICAL_FULLSTACK_MOBILE_RULES>

<API_CLIENT_MANDATORY>
EVERY frontend file that communicates with the backend MUST use apiClient from lib/api-client.ts.
This is non-negotiable -- the app is built as a standalone APK/IPA where raw fetch() with relative paths or localhost URLs will FAIL because there is no web server origin.

CORRECT (the ONLY allowed pattern):
\`\`\`typescript
import { apiClient } from '../lib/api-client';

// GET
const products = await apiClient.get<Product[]>('/api/products');
// GET with query params
const filtered = await apiClient.get<Product[]>('/api/products?category=shoes');
// POST
const newOrder = await apiClient.post<Order>('/api/orders', { items, total });
// PUT
await apiClient.put('/api/products/' + id, updatedProduct);
// DELETE
await apiClient.delete('/api/products/' + id);
\`\`\`

FORBIDDEN (will break the standalone APK -- NEVER do any of these):
- fetch('/api/products')                    -- no origin on native device
- fetch('http://localhost:8081/api/...')     -- no dev server on standalone
- fetch('http://hostname/api/...')           -- literal "hostname" is not a URL
- fetch(\`\${baseUrl}/api/...\`)              -- custom base URL logic is wrong
- axios.get('/api/...')                      -- does not use apiClient
- Creating your own API wrapper function    -- use apiClient, do not reinvent it

Do NOT modify, regenerate, or create alternatives to lib/api-client.ts. It is pre-configured and handles URL resolution for web, Expo Go, and standalone builds automatically.

Violations of this rule cause the production APK to show blank screens with no data.
</API_CLIENT_MANDATORY>

${FULLSTACK_MOBILE_STRATEGIES.UI_NON_NEGOTIABLES}

${PROMPT_UTILS.COMMON_PITFALLS}

${PROMPT_UTILS.COMMON_DEP_DOCUMENTATION}

<DEPENDENCIES>
{{dependencies}}

{{blueprintDependencies}}
</DEPENDENCIES>

{{template}}

<BLUEPRINT>
{{blueprint}}
</BLUEPRINT>`;

const PHASE_IMPLEMENTATION_USER_PROMPT_TEMPLATE = `Phase Implementation

<OUTPUT_REQUIREMENTS>
- Output exactly {{fileCount}} files.
- One cat block per file.
- Output only file contents (no commentary).
</OUTPUT_REQUIREMENTS>

<ZUSTAND_STORE_LAW>
- One field per store call: useStore(s => s.field)
- NEVER: useStore(s => s) / useStore((state)=>state)
- NEVER destructure store results
- NEVER return object/array from selector
If you need multiple values/actions, write multiple store calls.
Example:
BAD: const { openWindow, setActiveWindow } = useOSStore(s => s)
GOOD: const openWindow = useOSStore(s => s.openWindow); const setActiveWindow = useOSStore(s => s.setActiveWindow)
</ZUSTAND_STORE_LAW>

<CURRENT_PHASE>
{{phaseText}}

{{issues}}

{{userSuggestions}}
</CURRENT_PHASE>`;

const formatUserSuggestions = (suggestions?: string[] | null, imageUrls?: string[]): string => {
	if ((!suggestions || suggestions.length === 0) && (!imageUrls || imageUrls.length === 0)) return '';

	const imageSection = imageUrls && imageUrls.length > 0
		? `\nUser-uploaded image URLs (use these exact URLs in the code — do NOT use unsplash or placehold.co):\n${imageUrls.map((url, i) => `  Image ${i + 1}: ${url}`).join('\n')}\n`
		: '';

	const suggestionSection = suggestions && suggestions.length > 0
		? `Client feedback to address in this phase:\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
		: '';

	return [imageSection, suggestionSection].filter(Boolean).join('\n');
};

export function formatPhaseImplementationUserPrompt(args: {
	phaseText: string;
	issuesText?: string;
	userSuggestionsText?: string;
	fileCount?: number;
}): string {
	const prompt = PROMPT_UTILS.replaceTemplateVariables(PHASE_IMPLEMENTATION_USER_PROMPT_TEMPLATE, {
		phaseText: args.phaseText,
		issues: args.issuesText ?? '',
		userSuggestions: args.userSuggestionsText ?? '',
		fileCount: String(args.fileCount ?? 0),
	});

	return PROMPT_UTILS.verifyPrompt(prompt);
}

export function buildPhaseImplementationUserPrompt(args: {
	phase: PhaseConceptType;
	issues: IssueReport;
	userContext?: UserContext;
}): string {
	const phaseText = TemplateRegistry.markdown.serialize(args.phase, PhaseConceptSchema);
	const fileCount = args.phase.files?.length ?? 0;
	const imageUrls = args.userContext?.images?.map(img => img.publicUrl).filter(Boolean) as string[] | undefined;

	return formatPhaseImplementationUserPrompt({
		phaseText,
		issuesText: issuesPromptFormatter(args.issues),
		userSuggestionsText: formatUserSuggestions(args.userContext?.suggestions, imageUrls),
		fileCount,
	});
}
