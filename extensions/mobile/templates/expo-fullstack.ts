import type { TemplateDetails } from 'worker/services/sandbox/sandboxTypes';

const EXPO_FULLSTACK_TEMPLATE_INSTRUCTIONS = `
To build a valid, previewable Expo/React Native + Cloudflare Workers fullstack project (Expo SDK 54, React Native 0.81), follow these rules:

1. The package.json **MUST** have these scripts:
\`\`\`
"scripts": {
    "dev": "node _expo-proxy.cjs",
    "build:web": "bun x expo export --platform web --output-dir dist/client",
    "build:worker": "bun x esbuild api/src/index.ts --outfile=dist/index.js --format=esm --bundle --external:cloudflare:* --external:node:*",
    "build": "bun run build:web && bun run build:worker",
    "deploy": "bun run build && wrangler deploy",
    "lint": "eslint --cache -f json --quiet ."
}
\`\`\`

2. The project has TWO parts:
   - **Frontend (app/ directory):** Expo Router screens using React Native components
   - **Backend (api/ directory):** Hono API with D1 database routes

3. The project **MUST** have a valid app.json, wrangler.jsonc, and metro.config.js.

4. All mobile UI must use React Native components (View, Text, TouchableOpacity, etc.), NOT HTML elements.

5. The Hono API worker is at api/src/index.ts with D1 database binding.

6. **CRITICAL API CALLS (NON-NEGOTIABLE -- violations break the production APK):**
   ALL frontend files that fetch data from the backend MUST use \`apiClient\` from \`lib/api-client.ts\`.
   The standalone APK has no web server origin -- raw fetch('/api/...') resolves to nothing and silently fails, causing blank screens with no data.
   - Do NOT modify, regenerate, or replace lib/api-client.ts -- it is pre-configured.
   - CORRECT: \`import { apiClient } from '../lib/api-client'; const data = await apiClient.get<Product[]>('/api/products');\`
   - FORBIDDEN: \`fetch('/api/products')\`, \`fetch('http://localhost:8081/api/...')\`, \`fetch('http://hostname/api/...')\`, \`axios.get('/api/...')\`, or any custom wrapper.
   - This applies to EVERY screen and EVERY component that loads or submits data.

7. These packages are pre-installed: expo, expo-router, expo-constants, expo-font, expo-linking, expo-status-bar, expo-system-ui, react-native, react-native-gesture-handler, react-native-reanimated, react-native-safe-area-context, react-native-screens, react-native-web, @react-native-async-storage/async-storage, hono, drizzle-orm. Do NOT add them again.

8. **CRITICAL**: If your code imports ANY package not listed above, you MUST install it with exec_commands("bun add <package>") BEFORE calling deploy_preview.

9. **BANNED PACKAGES** -- Do NOT use these. They fail to install or are incompatible with Expo SDK 54:
   - lucide-react-native, @expo/vector-icons, react-native-vector-icons, react-native-svg
   - @react-native-async-storage/async-storage@2.x (v2 requires KMP Maven repo not in EAS Build -- v1.23.1 is pre-installed, do NOT upgrade)
   - Any package requiring native compilation or pod install
   For icons, use emoji characters or simple Text components.

10. The wrangler.jsonc serves the web export as static assets and routes /api/* to the Hono worker.

11. The D1 database is pre-provisioned. Use Drizzle ORM for queries in the API layer.
`;

/**
 * Expo/React Native fullstack template with Hono API backend and D1 database.
 * Used for mobile apps that need a persistent backend (CRUD, auth, etc.).
 */
export function createExpoFullstackTemplateDetails(): TemplateDetails {
    const fullstackFiles: Record<string, string> = {
        'app/_layout.tsx': `
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#f5f5f5' },
        headerTintColor: '#333',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Home' }} />
    </Stack>
  );
}
`,
        'app/index.tsx': `
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api-client';

export default function HomeScreen() {
  const [status, setStatus] = useState<string>('Loading...');

  useEffect(() => {
    apiClient.get('/api/health')
      .then(data => setStatus(data.status ?? 'ok'))
      .catch(() => setStatus('Error connecting to API'));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome</Text>
      <Text style={styles.subtitle}>Fullstack Expo + Workers App</Text>
      <View style={styles.statusCard}>
        {status === 'Loading...' ? (
          <ActivityIndicator size="small" color="#4f46e5" />
        ) : (
          <Text style={styles.statusText}>API: {status}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  statusCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4f46e5',
  },
});
`,
        'api/src/index.ts': `
/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { LinearRouter } from 'hono/router/linear-router';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>({ router: new LinearRouter() });

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err.message);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
});

// CORS middleware
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Database initialization - one prepare().run() call per table (never use exec() with multi-statement strings)
async function initDB(db: D1Database) {
  await db.prepare('CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime(\\'now\\')))').run();
}
let dbInitialized = false;
app.use('/api/*', async (c, next) => {
  if (!dbInitialized && c.env.DB) {
    try {
      await initDB(c.env.DB);
      dbInitialized = true;
    } catch (err) {
      console.error('DB init error:', err);
    }
  }
  await next();
});

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Example: List items
app.get('/api/items', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
    return c.json({ items: result.results });
  } catch (err) {
    return c.json({ items: [], error: 'Failed to load items' }, 500);
  }
});

// Example: Create item
app.post('/api/items', async (c) => {
  try {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const name = body.name || 'Untitled';
    await c.env.DB.prepare('INSERT INTO items (id, name, created_at) VALUES (?, ?, ?)')
      .bind(id, name, new Date().toISOString())
      .run();
    return c.json({ id, name, created_at: new Date().toISOString() }, 201);
  } catch (err) {
    return c.json({ error: 'Failed to create item' }, 400);
  }
});

// Example: Delete item
app.delete('/api/items/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to delete item' }, 400);
  }
});

export default app;
`,
        'api/src/db/schema.sql': `-- D1 database schema
-- Run this via wrangler d1 execute or migrations

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
        'lib/api-client.ts': `
// API client for communicating with the Hono backend.
// - Web preview: relative paths (same origin, proxied by _expo-proxy.cjs)
// - Expo Go (dev): derives proxy URL from Expo manifest hostUri
// - Standalone APK/IPA: uses the deployed CF Workers API URL from app.json extra.apiUrl
// Includes retry logic for 5xx errors (API may still be deploying).
import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getBaseUrl(): string {
  if (Platform.OS === 'web') return '';
  // In Expo Go (development), route through the sandbox proxy
  const debuggerHost = Constants.expoConfig?.hostUri
    ?? (Constants as Record<string, unknown> ).manifest2?.extra?.expoGo?.debuggerHost as string | undefined;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return 'https://' + host;
  }
  // In standalone builds (APK/IPA), use the deployed API URL from app config
  const apiUrl = Constants.expoConfig?.extra?.apiUrl;
  if (apiUrl && !apiUrl.startsWith('__')) return apiUrl;
  return '';
}

const BASE_URL = getBaseUrl();
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 3000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = BASE_URL + path;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
      if (res.ok) return res.json() as Promise<T>;
      // Retry on server errors (API may still be deploying)
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        lastError = new Error(res.statusText);
        await delay(RETRY_DELAY_MS);
        continue;
      }
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((error as Record<string, string>).error || res.statusText);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
    }
  }
  throw lastError || new Error('Request failed');
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};
`,
        '.gitignore': `node_modules/
.expo/
dist/
*.tsbuildinfo
`,
        'app.json': JSON.stringify({
            expo: {
                name: 'expo-fullstack-app',
                slug: 'expo-fullstack-app',
                version: '1.0.0',
                orientation: 'portrait',
                scheme: 'expo-fullstack-app',
                platforms: ['ios', 'android', 'web'],
                ios: { bundleIdentifier: 'com.expo.fullstackapp' },
                android: { package: 'com.expo.fullstackapp' },
                web: { bundler: 'metro' },
                plugins: ['expo-router'],
                extra: { apiUrl: '__API_URL__' },
            }
        }, null, 2),
        'package.json': JSON.stringify({
            name: 'expo-fullstack-app',
            version: '1.0.0',
            main: 'expo-router/entry',
            scripts: {
                dev: 'node _expo-proxy.cjs',
                'build:web': 'bun x expo export --platform web --output-dir dist/client',
                'build:worker': 'bun x esbuild api/src/index.ts --outfile=dist/index.js --format=esm --bundle --external:cloudflare:* --external:node:*',
                build: 'bun run build:web && bun run build:worker',
                deploy: 'bun run build && wrangler deploy',
                lint: 'eslint --cache -f json --quiet .',
            },
            dependencies: {
                'expo': '~54.0.0',
                'expo-constants': '~18.0.9',
                'expo-font': '~14.0.9',
                'expo-linking': '~8.0.8',
                'expo-router': '~6.0.14',
                'expo-status-bar': '~3.0.8',
                'expo-system-ui': '~6.0.7',
                'react': '19.1.0',
                'react-dom': '19.1.0',
                'react-native': '0.81.5',
                'react-native-gesture-handler': '~2.28.0',
                'react-native-reanimated': '~4.1.0',
                'react-native-safe-area-context': '~5.6.0',
                'react-native-screens': '~4.16.0',
                'react-native-web': '~0.21.0',
                'react-native-worklets': '0.8.1',
                '@react-native-async-storage/async-storage': '1.23.1',
                'hono': '^4.11.0',
                'drizzle-orm': '^0.39.0',
            },
            devDependencies: {
                '@babel/core': '^7.25.0',
                '@types/react': '~19.1.0',
                'typescript': '~5.9.0',
                '@cloudflare/workers-types': '^4.20251213.0',
                'wrangler': '^4.14.0',
                'esbuild': '^0.24.0',
            },
        }, null, 2),
        'tsconfig.json': JSON.stringify({
            extends: 'expo/tsconfig.base',
            compilerOptions: {
                strict: true,
                paths: { '@/*': ['./*'] },
            },
        }, null, 2),
        'babel.config.js': `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
`,
        'wrangler.jsonc': JSON.stringify({
            "$schema": "node_modules/wrangler/config-schema.json",
            "name": "expo-fullstack-app",
            "main": "api/src/index.ts",
            "compatibility_date": "2025-01-15",
            "compatibility_flags": ["nodejs_compat"],
            "assets": {
                "directory": "dist/client",
                "not_found_handling": "single-page-application",
                "run_worker_first": ["/api/*"],
                "binding": "ASSETS"
            },
            "d1_databases": [{
                "binding": "DB",
                "database_name": "app-db",
                "database_id": "{{D1_ID}}"
            }],
            "vars": {
                "ENVIRONMENT": "production"
            },
            "workers_dev": false,
            "preview_urls": false
        }, null, 2),
        'metro.config.js': `const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Disable package exports to fix React 19 web bundling.
config.resolver.unstable_enablePackageExports = false;

// Exclude the project's api/ directory from Metro bundling (Workers backend).
// Use absolute path so we don't accidentally block node_modules/*/api/ paths
// (e.g. expo-router/build/api/ which is needed for the router to work).
const apiDir = path.resolve(__dirname, 'api');
config.resolver.blockList = [new RegExp(apiDir + '/')];

// Sanitize proxy headers to prevent Metro 0.83.x "TypeError: Invalid URL".
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (req.headers['x-forwarded-proto']) {
        req.headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'].split(',')[0].trim();
      }
      if (req.headers['x-forwarded-host']) {
        req.headers['x-forwarded-host'] = req.headers['x-forwarded-host'].split(',')[0].trim();
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
`,
        'public/web-preview.html': `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,viewport-fit=cover" />
<title>App Preview</title>
<style>
html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #fff; }
#root { display: flex; flex: 1; height: 100vh; }
</style>
</head>
<body>
<div id="root"></div>
<script src="/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&transform.routerRoot=app"></script>
</body>
</html>`,
        'eas.json': JSON.stringify({
            cli: { version: '>= 12.0.0', appVersionSource: 'remote' },
            build: {
                development: { developmentClient: true, distribution: 'internal' },
                preview: { distribution: 'internal' },
                production: {},
            },
        }, null, 2),
        '_expo-proxy.cjs': `// Reverse proxy: routes /api/* to deployed CF Workers backend,
// everything else to the Expo Metro dev server.
// Auto-restarts Metro when it crashes (e.g. file watcher ENOENT during bun install).
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const { spawn } = require('child_process');

const PUBLIC_PORT = parseInt(process.env.PORT || '8001', 10);
const INTERNAL_PORT = PUBLIC_PORT + 1;
const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 3000;

let expo = null;
let metroReady = false;
let metroDead = false;
let metroExitCode = null;
let restartCount = 0;
let shuttingDown = false;
const lastErrors = [];

// Read deployed API URL from .api-url file (written after CF Workers deploy)
let cachedApiUrl = null;
let apiUrlCheckedAt = 0;
function getApiUrl() {
  const now = Date.now();
  if (cachedApiUrl && now - apiUrlCheckedAt < 5000) return cachedApiUrl;
  try {
    cachedApiUrl = fs.readFileSync('.api-url', 'utf-8').trim();
    apiUrlCheckedAt = now;
    if (cachedApiUrl) console.log('[proxy] API URL loaded: ' + cachedApiUrl);
  } catch { cachedApiUrl = null; }
  return cachedApiUrl;
}

function startMetro() {
  metroReady = false;
  metroDead = false;
  metroExitCode = null;
  lastErrors.length = 0;

  console.log('[proxy] Starting Expo dev server' + (restartCount > 0 ? ' (restart #' + restartCount + ')' : '') + '...');
  expo = spawn('npx', ['expo', 'start', '--port', String(INTERNAL_PORT), '--host', 'lan'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(INTERNAL_PORT), NODE_OPTIONS: '--max-old-space-size=1536' },
  });
  expo.stdout.on('data', (d) => { const s = d.toString(); process.stdout.write(s); if (/Metro waiting|Bundler is ready|listening on/i.test(s)) { metroReady = true; console.log('[proxy] Metro is ready'); } });
  expo.stderr.on('data', (d) => { const s = d.toString(); process.stderr.write(d); lastErrors.push(s); if (lastErrors.length > 30) lastErrors.shift(); });
  expo.on('error', (err) => { console.error('[proxy] Failed to start Expo:', err); lastErrors.push(String(err)); handleMetroExit(1); });
  expo.on('exit', (code) => { console.error('[proxy] Expo exited with code ' + code); handleMetroExit(code); });
}

function handleMetroExit(code) {
  metroExitCode = code;
  if (shuttingDown) { metroDead = true; return; }
  if (code !== 0 && restartCount < MAX_RESTARTS) {
    restartCount++;
    console.log('[proxy] Metro crashed, restarting in ' + (RESTART_DELAY_MS / 1000) + 's (' + restartCount + '/' + MAX_RESTARTS + ')...');
    setTimeout(startMetro, RESTART_DELAY_MS);
  } else {
    metroDead = true;
  }
}

startMetro();

// Probe Metro readiness every 3s
setInterval(() => {
  if (metroReady || metroDead || !expo) return;
  const req = http.get({ hostname: '127.0.0.1', port: INTERNAL_PORT, path: '/status', timeout: 2000 }, () => {
    if (!metroReady) { metroReady = true; console.log('[proxy] Metro responded on port ' + INTERNAL_PORT); }
  });
  req.on('error', () => {});
  req.on('timeout', () => { req.destroy(); });
}, 3000);

function sanitizeHeaders(headers) {
  const h = { ...headers };
  h['x-forwarded-proto'] = 'https';
  if (h['x-forwarded-host']) h['x-forwarded-host'] = h['x-forwarded-host'].split(',')[0].trim();
  return h;
}

function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const LOADING_PAGE = '<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;background:#f5f5f5;color:#333}div{text-align:center}.spin{width:32px;height:32px;border:3px solid #ddd;border-top-color:#666;border-radius:50%;animation:s 0.8s linear infinite;margin:0 auto 16px}@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div><div class="spin"></div><p>Starting Expo dev server...</p><p style="font-size:12px;color:#999">This may take 30-60 seconds on first launch</p></div></body></html>';

function buildErrorPage() {
  const errText = escapeHtml(lastErrors.join('').trim().slice(-2000));
  return '<html><head><meta charset="utf-8"><style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui;background:#fef2f2;color:#991b1b}div{text-align:center;max-width:700px;padding:24px}pre{text-align:left;background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;font-size:12px;overflow-x:auto;max-height:400px;overflow-y:auto;white-space:pre-wrap;word-break:break-word}</style></head><body><div><h2>Metro Bundler Crashed</h2><p>The Expo dev server exited unexpectedly (code: ' + (metroExitCode || 'unknown') + ')</p>' + (errText ? '<pre>' + errText + '</pre>' : '<p>No error output captured.</p>') + '</div></body></html>';
}

// Proxy /api/* to deployed CF Workers backend
function proxyApiRequest(clientReq, clientRes) {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    clientRes.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    clientRes.end(JSON.stringify({ error: 'API not ready. Deploy the app first.' }));
    return;
  }
  try {
    const parsed = new URL(apiUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: clientReq.url,
      method: clientReq.method,
      headers: {
        'content-type': clientReq.headers['content-type'] || 'application/json',
        'host': parsed.hostname,
      },
      rejectUnauthorized: true,
    };
    if (clientReq.headers['authorization']) opts.headers['authorization'] = clientReq.headers['authorization'];
    console.log('[proxy] /api -> ' + parsed.hostname + clientReq.url);
    const proxyReq = mod.request(opts, (proxyRes) => {
      const h = {};
      h['content-type'] = proxyRes.headers['content-type'] || 'application/json';
      h['access-control-allow-origin'] = '*';
      h['access-control-allow-methods'] = 'GET,POST,PUT,DELETE,OPTIONS';
      h['access-control-allow-headers'] = 'Content-Type,Authorization';
      clientRes.writeHead(proxyRes.statusCode, h);
      proxyRes.pipe(clientRes, { end: true });
    });
    proxyReq.on('error', (err) => {
      console.error('[proxy] API proxy error:', err.message);
      clientRes.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      clientRes.end(JSON.stringify({ error: 'API unreachable: ' + err.message }));
    });
    proxyReq.setTimeout(15000, () => {
      proxyReq.destroy();
      clientRes.writeHead(504, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      clientRes.end(JSON.stringify({ error: 'API request timed out' }));
    });
    clientReq.pipe(proxyReq, { end: true });
  } catch (err) {
    console.error('[proxy] API proxy setup error:', err.message);
    clientRes.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    clientRes.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
  }
}

// HTTP proxy
const server = http.createServer((clientReq, clientRes) => {
  // Route /api/* to deployed CF Workers backend
  if (clientReq.url && clientReq.url.startsWith('/api/')) {
    if (clientReq.method === 'OPTIONS') {
      clientRes.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Max-Age': '86400',
      });
      clientRes.end();
      return;
    }
    proxyApiRequest(clientReq, clientRes);
    return;
  }

  if (metroDead) {
    clientRes.writeHead(503, { 'Content-Type': 'text/html' });
    clientRes.end(buildErrorPage());
    return;
  }
  const proxyReq = http.request(
    { hostname: '127.0.0.1', port: INTERNAL_PORT, path: clientReq.url, method: clientReq.method, headers: sanitizeHeaders(clientReq.headers) },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    }
  );
  proxyReq.on('error', () => {
    clientRes.writeHead(503, { 'Content-Type': 'text/html' });
    clientRes.end(LOADING_PAGE);
  });
  clientReq.pipe(proxyReq, { end: true });
});

// WebSocket proxy
server.on('upgrade', (req, socket, head) => {
  const proxySocket = net.connect(INTERNAL_PORT, '127.0.0.1', () => {
    const sanitized = sanitizeHeaders(req.headers);
    const headerLines = Object.entries(sanitized).map(([k, v]) => k + ': ' + v).join('\\r\\n');
    proxySocket.write(
      req.method + ' ' + req.url + ' HTTP/1.1\\r\\n' + headerLines + '\\r\\n\\r\\n'
    );
    if (head && head.length) proxySocket.write(head);
    socket.pipe(proxySocket).pipe(socket);
  });
  proxySocket.on('error', () => socket.destroy());
  socket.on('error', () => proxySocket.destroy());
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log('[proxy] Listening on port ' + PUBLIC_PORT + ', Metro on port ' + INTERNAL_PORT);
  console.log('[proxy] /api/* routes proxy to deployed backend (reads .api-url)');
});

process.on('SIGTERM', () => { shuttingDown = true; if (expo) expo.kill(); server.close(); });
process.on('SIGINT', () => { shuttingDown = true; if (expo) expo.kill(); server.close(); });
`,
    };

    return {
        name: 'expo-fullstack',
        description: {
            selection: 'expo-fullstack-template',
            usage: `Expo/React Native fullstack template with Hono API backend and D1 database. ${EXPO_FULLSTACK_TEMPLATE_INSTRUCTIONS}`
        },
        fileTree: {
            path: '/',
            type: 'directory',
            children: [
                { path: 'app', type: 'directory', children: [] },
                { path: 'api', type: 'directory', children: [
                    { path: 'src', type: 'directory', children: [] },
                ] },
                { path: 'lib', type: 'directory', children: [] },
                { path: 'public', type: 'directory', children: [] },
                { path: 'package.json', type: 'file' },
                { path: 'app.json', type: 'file' },
                { path: 'wrangler.jsonc', type: 'file' },
                { path: 'tsconfig.json', type: 'file' },
                { path: 'metro.config.js', type: 'file' },
                { path: '_expo-proxy.cjs', type: 'file' },
                { path: 'eas.json', type: 'file' },
            ]
        },
        allFiles: fullstackFiles,
        language: 'typescript',
        deps: {
            'expo': '~54.0.0',
            'react-native': '0.81.5',
            'react-native-gesture-handler': '~2.28.0',
            'react-native-reanimated': '~4.1.0',
            'expo-router': '~6.0.14',
            'hono': '^4.11.0',
            'drizzle-orm': '^0.39.0',
        },
        projectType: 'app',
        renderMode: 'mobile-fullstack',
        initCommand: 'node _expo-proxy.cjs',
        frameworks: ['react-native', 'expo', 'expo-router', 'hono', 'drizzle-orm'],
        importantFiles: ['app/index.tsx', 'app/_layout.tsx', 'api/src/index.ts', 'package.json', 'wrangler.jsonc'],
        dontTouchFiles: ['app.json', 'metro.config.js', '_expo-proxy.cjs', 'eas.json', 'babel.config.js', 'wrangler.jsonc', '.api-url', 'lib/api-client.ts'],
        redactedFiles: [],
        disabled: false,
    };
}
