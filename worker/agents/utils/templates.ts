import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';

const VITE_CONFIG_MINIMAL = `
// Making changes to this file is **STRICTLY** forbidden. All the code in here is 100% correct and audited.
import { defineConfig, loadEnv } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import { exec } from "node:child_process";
import pino from "pino";
import { cloudflare } from "@cloudflare/vite-plugin";

const logger = pino();

const stripAnsi = (str: string) =>
  str.replace(
    // eslint-disable-next-line no-control-regex -- Allow ANSI escape stripping
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );

const LOG_MESSAGE_BOUNDARY = /\\n(?=\\[[A-Z][^\\]]*\\])/g;

const emitLog = (level: "info" | "warn" | "error", rawMessage: string) => {
  const cleaned = stripAnsi(rawMessage).replace(/\r\n/g, "\n");
  const parts = cleaned
    .split(LOG_MESSAGE_BOUNDARY)
    .map((part) => part.trimEnd())
    .filter((part) => part.trim().length > 0);

  if (parts.length === 0) {
    logger[level](cleaned.trimEnd());
    return;
  }

  for (const part of parts) {
    logger[level](part);
  }
};

// 3. Create the custom logger for Vite
const customLogger = {
  warnOnce: (msg: string) => emitLog("warn", msg),

  // Use Pino's methods, passing the cleaned message
  info: (msg: string) => emitLog("info", msg),
  warn: (msg: string) => emitLog("warn", msg),
  error: (msg: string) => emitLog("error", msg),
  hasErrorLogged: () => false,

  // Keep these as-is
  clearScreen: () => {},
  hasWarned: false,
};

// https://vite.dev/config/
export default ({ mode }: { mode: string }) => {
  const env = loadEnv(mode, process.cwd());
  return defineConfig({
    plugins: [react(), cloudflare()],
    build: {
      minify: true,
      sourcemap: "inline", // Use inline source maps for better error reporting
      rollupOptions: {
        output: {
          sourcemapExcludeSources: false, // Include original source in source maps
        },
      },
    },
    customLogger: env.VITE_LOGGER_TYPE === 'json' ? customLogger : undefined,
    // Enable source maps in development too
    css: {
      devSourcemap: true,
    },
    server: {
      allowedHosts: true,   // This is IMPORTANT for dev server to work
      strictPort: true,     // Prevent auto-port-increment which breaks miniflare/preview mapping
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@shared": path.resolve(__dirname, "./shared"),
      },
    },
    optimizeDeps: {
      // This is still crucial for reducing the time from when \`bun run dev\` is executed to when the server is actually ready.
      include: ["react", "react-dom", "react-router-dom"],
      exclude: ["agents"], // Exclude agents package from pre-bundling due to Node.js dependencies
      force: true,
    },
    define: {
      // Define Node.js globals for the agents package
      global: "globalThis",
    },
    cacheDir: "node_modules/.vite",
  });
};

`;

const SCRATCH_TEMPLATE_INSTRUCTIONS = `
To build a valid, previewable and deployable project, it is essential to follow few important rules:

1. The package.json **MUST** be of the following form:
\`\`\`
...
	"scripts": {
		"dev": "vite --host 0.0.0.0 --port \${PORT:-8001}",
		"build": "vite build",
		"lint": "eslint --cache -f json --quiet .",
		"preview": "bun run build && vite preview --host 0.0.0.0 --port \${PORT:-8001}",
		"deploy": "bun run build && wrangler deploy",
		"cf-typegen": "wrangler types"
	}
...
\`\`\`

Failure to have a compatible package.json would result in the app un-previewable and un-deployable.

2. The project **MUST** be a valid Appy Pie worker + Vite + bun project.

3. It must have a valid wrangler.jsonc and a vite.config.ts file.

4. The vite config file MUST have the following minimal config:
\`\`\`ts
${VITE_CONFIG_MINIMAL}
\`\`\`

5. **Database:** This project has a D1 database pre-configured (binding: DB). Use c.env.DB.prepare() for SQL queries with parameterized bindings. ALWAYS include a DB init middleware that runs CREATE TABLE IF NOT EXISTS for ALL your tables on first request. Without this, tables will not exist and queries will fail.

6. **API Routes:** All backend routes must be under /api/* prefix. The Hono worker is at src/index.ts. Do NOT use in-memory data stores for persistent data -- use D1.

7. Do NOT modify wrangler.jsonc -- it is pre-configured with D1 binding and asset routing.
`;

/**
 * Enhanced scratch template with database, routing, and API scaffolding.
 * Used when starting from-scratch (general mode) or when no template fits.
 */
export function createScratchTemplateDetails(): TemplateDetails {
    const enhancedFiles: Record<string, string> = {
        'src/index.ts': `
import { Hono } from 'hono';
import { LinearRouter } from 'hono/router/linear-router';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>({ router: new LinearRouter() });

// Global error handler - catches unhandled exceptions in any route
app.onError((err, c) => {
  console.error('Unhandled error:', err.message);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
});

// CORS middleware - scoped to API routes only
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Database initialization middleware - runs CREATE TABLE IF NOT EXISTS on first request
let dbInitialized = false;
app.use('/api/*', async (c, next) => {
  if (!dbInitialized && c.env.DB) {
    try {
      await c.env.DB.exec(\`
        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      \`);
      dbInitialized = true;
    } catch (err) {
      console.error('DB init error:', err);
    }
  }
  await next();
});

// Health check — MUST be under /api/ to match run_worker_first routing
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Example: List items from D1 database
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

// Static assets and SPA fallback are handled by wrangler.jsonc asset config.
// Do NOT add serveStatic or app.get('*', ...) — they are unnecessary and break routing.

export default app;
`,
        'src/main.tsx': `
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
        'src/App.tsx': `
import { useState, useEffect } from 'react';

function App() {
  const [message, setMessage] = useState('Loading...');
  const [apiData, setApiData] = useState(null);

  useEffect(() => {
    // Test health endpoint
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setMessage(data.status))
      .catch(() => setMessage('Error'));

    // Test API endpoint (D1 database)
    fetch('/api/items')
      .then(res => res.json())
      .then(data => setApiData(data))
      .catch(() => setApiData({ error: 'API Error' }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-6">
        <h1 className="text-4xl font-bold mb-4 text-gray-900">Enhanced App</h1>
        <p className="text-lg text-gray-600 mb-2">
          Generated with database, routing, and API scaffolding
        </p>
        <div className="space-y-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm font-medium text-green-800">
              API Status: {message}
            </p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm font-medium text-blue-800">
              API Data: {JSON.stringify(apiData)}
            </p>
          </div>
          <div className="text-sm text-gray-500">
            <p>✅ Database scaffolding ready</p>
            <p>✅ API endpoints configured</p>
            <p>✅ Deployment ready</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
        'src/index.css': `
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`,
        'package.json': JSON.stringify({
            name: 'enhanced-scratch-app',
            version: '1.0.0',
            type: 'module',
            scripts: {
                dev: "vite --host 0.0.0.0 --port ${PORT:-8001}",
                build: "vite build",
                lint: "eslint --cache -f json --quiet .",
                preview: "bun run build && vite preview --host 0.0.0.0 --port ${PORT:-8001}",
                deploy: "bun run build && wrangler deploy",
                "cf-typegen": "wrangler types"
            },
            dependencies: {
                'react': '^19.0.0',
                'react-dom': '^19.0.0',
                'typescript': '^5.0.0',
                '@types/react': '^19.0.0',
                '@types/react-dom': '^19.0.0',
                'tailwindcss': '^4.1.18',
                '@tailwindcss/vite': '^4.1.18',
                'hono': '^4.11.0'
            },
            devDependencies: {
                '@cloudflare/vite-plugin': '^1.0.12',
                '@vitejs/plugin-react': '^4.5.0',
                '@cloudflare/workers-types': '^4.20251213.0',
                'vite': '^6.3.0',
                'wrangler': '^4.14.0'
            }
        }, null, 2),
        'vite.config.ts': `
import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default ({ mode }: { mode: string }) => {
  return defineConfig({
    plugins: [react(), cloudflare()],
    build: {
      minify: true,
      sourcemap: "inline",
    },
    server: {
      allowedHosts: true,
      strictPort: true,
      port: 8001,
      host: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  });
};
`,
        'tailwind.config.js': `
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`,
        'wrangler.jsonc': JSON.stringify({
            "$schema": "node_modules/wrangler/config-schema.json",
            "name": "enhanced-scratch-app",
            "main": "src/index.ts",
            "compatibility_date": "2025-01-15",
            "compatibility_flags": ["nodejs_compat"],
            "assets": {
                "directory": "dist",
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
        'README.md': `
# Enhanced Scratch App

This application was generated with enhanced scaffolding including:

- ✅ **API Endpoints**: Health check and data endpoints
- ✅ **Modern UI**: React with Tailwind CSS
- ✅ **Deployment Ready**: Optimized for serverless deployment
- ✅ **TypeScript**: Full type safety

## Development

\`\`\`bash
bun install
bun run dev
\`\`\`

## Deploy

\`\`\`bash
bun run deploy
\`\`\`

## API Endpoints

- \`GET /api/health\` - Health check
- \`GET /api/items\` - List items (D1 database)
- \`POST /api/items\` - Create item
- \`DELETE /api/items/:id\` - Delete item
`
    };

    return {
        name: 'scratch',
        description: { 
            selection: 'enhanced-scratch-template', 
            usage: `Enhanced scratch template with database, routing, and API scaffolding. **IT IS RECOMMENDED THAT YOU CHOOSE A VALID PRECONFIGURED TEMPLATE IF POSSIBLE** ${SCRATCH_TEMPLATE_INSTRUCTIONS}` 
        },
        fileTree: { 
            path: '/', 
            type: 'directory', 
            children: [
                { path: 'src', type: 'directory', children: [] },
                { path: 'package.json', type: 'file' },
                { path: 'vite.config.ts', type: 'file' },
                { path: 'tailwind.config.js', type: 'file' },
                { path: 'wrangler.jsonc', type: 'file' },
                { path: 'README.md', type: 'file' }
            ]
        },
        allFiles: enhancedFiles,
        language: 'typescript',
        deps: { 'hono': '^4.11.0', 'react': '^19.0.0' },
        projectType: 'general',
        frameworks: ['react', 'typescript', 'tailwindcss', 'hono'],
        importantFiles: ['src/App.tsx', 'src/index.ts', 'package.json', 'wrangler.jsonc'],
        dontTouchFiles: ['wrangler.jsonc'],
        redactedFiles: [],
        disabled: false,
    };
}

const EXPO_SCRATCH_TEMPLATE_INSTRUCTIONS = `
To build a valid, previewable Expo/React Native project (SDK 54, React Native 0.81), follow these rules:

1. The package.json **MUST** have these scripts:
\`\`\`
"scripts": {
    "dev": "node _expo-proxy.cjs",
    "build:web": "bun x expo export --platform web --output-dir dist/client",
    "build:worker": "bun x esbuild worker.ts --outfile=dist/index.js --format=esm --bundle",
    "build": "bun run build:web && bun run build:worker",
    "lint": "eslint --cache -f json --quiet ."
}
\`\`\`

2. The project **MUST** have a valid app.json with Expo configuration.

3. Use expo-router for navigation (file-based routing in the app/ directory).

4. Do NOT modify wrangler.jsonc or worker.ts -- they are pre-configured for web deployment.

5. All UI must use React Native components (View, Text, TouchableOpacity, etc.), NOT HTML elements.

6. These packages are already installed: expo, expo-router, expo-constants, expo-font, expo-linking, expo-status-bar, expo-system-ui, react-native, react-native-gesture-handler, react-native-reanimated, react-native-safe-area-context, react-native-screens, react-native-web. Do NOT add them again with exec_commands.

7. **CRITICAL**: If your code imports ANY package not listed above, you MUST install it with exec_commands("bun add <package>") BEFORE calling deploy_preview. Missing dependencies cause Metro bundler to crash with "Unable to resolve module" errors. Common packages that need explicit installation: date-fns, zustand, @react-native-async-storage/async-storage, expo-image, expo-linear-gradient, expo-splash-screen, etc.

8. **BANNED PACKAGES** -- Do NOT use these. They fail to install or are incompatible with Expo SDK 54:
   - lucide-react-native (use emoji or Unicode symbols for icons instead)
   - @expo/vector-icons (not compatible with SDK 54)
   - react-native-vector-icons (requires native linking)
   - react-native-svg (often causes build failures)
   - Any package requiring native compilation or pod install
   For icons, use emoji characters (e.g. "+" for add, "x" for delete, etc.) or simple Text components.
`;

/**
 * Expo/React Native scratch template for mobile app generation.
 * Used when no Expo template is available in the catalog.
 */
export function createExpoScratchTemplateDetails(): TemplateDetails {
    const expoFiles: Record<string, string> = {
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
import { View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome</Text>
      <Text style={styles.subtitle}>Your Expo app is ready</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
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
  },
});
`,
        '.gitignore': `node_modules/
.expo/
dist/
*.tsbuildinfo
`,
        'app.json': JSON.stringify({
            expo: {
                name: 'expo-app',
                slug: 'expo-app',
                version: '1.0.0',
                orientation: 'portrait',
                scheme: 'expo-app',
                platforms: ['ios', 'android', 'web'],
                ios: { bundleIdentifier: 'com.expo.app' },
                android: { package: 'com.expo.app' },
                web: { bundler: 'metro' },
                plugins: ['expo-router'],
            }
        }, null, 2),
        'worker.ts': `export default { fetch() { return new Response('Not Found', { status: 404 }); } };\n`,
        'wrangler.jsonc': JSON.stringify({
            "name": "expo-app",
            "main": "worker.ts",
            "compatibility_date": "2025-01-15",
            "assets": {
                "directory": "dist/client",
                "not_found_handling": "single-page-application",
                "binding": "ASSETS"
            }
        }, null, 2),
        'package.json': JSON.stringify({
            name: 'expo-app',
            version: '1.0.0',
            main: 'expo-router/entry',
            scripts: {
                dev: 'node _expo-proxy.cjs',
                'build:web': 'bun x expo export --platform web --output-dir dist/client',
                'build:worker': 'bun x esbuild worker.ts --outfile=dist/index.js --format=esm --bundle',
                build: 'bun run build:web && bun run build:worker',
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
                'react-native-worklets': '~0.5.0',
            },
            devDependencies: {
                '@babel/core': '^7.25.0',
                '@types/react': '~19.1.0',
                'typescript': '~5.9.0',
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
        'metro.config.js': `const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable package exports to fix React 19 web bundling.
// Metro incorrectly transforms React 19 module exports for web platform,
// causing "(0, _react.createContext) is not a function" errors.
config.resolver.unstable_enablePackageExports = false;

// Sanitize proxy headers to prevent Metro 0.83.x "TypeError: Invalid URL".
// Behind nested proxies (e.g. Cloudflare -> sandbox), x-forwarded-proto can
// contain comma-separated duplicates like "https, https". Metro constructs
// new URL(path, protocol + "://" + host) which fails with invalid base URL.
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
        '_expo-proxy.cjs': `// Reverse proxy that sanitizes duplicated x-forwarded-* headers before they
// reach the Expo dev server. Behind nested proxies (Cloudflare -> sandbox),
// these headers can contain comma-separated duplicates like "https, https"
// which cause Expo to construct malformed manifest URLs.
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const PUBLIC_PORT = parseInt(process.env.PORT || '8001', 10);
const INTERNAL_PORT = PUBLIC_PORT + 1;
let metroReady = false;
let metroDead = false;
let metroExitCode = null;
const lastErrors = [];

// Start Expo dev server on internal port
const expo = spawn('npx', ['expo', 'start', '--port', String(INTERNAL_PORT), '--host', 'lan'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(INTERNAL_PORT), NODE_OPTIONS: '--max-old-space-size=1536' },
});
expo.stdout.on('data', (d) => { const s = d.toString(); process.stdout.write(s); if (/Metro waiting|Bundler is ready|listening on/i.test(s)) { metroReady = true; console.log('[proxy] Metro is ready'); } });
expo.stderr.on('data', (d) => { const s = d.toString(); process.stderr.write(d); lastErrors.push(s); if (lastErrors.length > 30) lastErrors.shift(); });
expo.on('error', (err) => { console.error('[proxy] Failed to start Expo:', err); metroDead = true; lastErrors.push(String(err)); });
expo.on('exit', (code) => { console.error('[proxy] Expo exited with code ' + code); metroDead = true; metroExitCode = code; });

// Probe Metro readiness every 3s until ready
const probe = setInterval(() => {
  if (metroReady || metroDead) { clearInterval(probe); return; }
  const req = http.get({ hostname: '127.0.0.1', port: INTERNAL_PORT, path: '/status', timeout: 2000 }, (res) => {
    if (!metroReady) { metroReady = true; clearInterval(probe); console.log('[proxy] Metro responded on port ' + INTERNAL_PORT); }
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

// HTTP proxy -- sanitize headers, forward to Expo
const server = http.createServer((clientReq, clientRes) => {
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

// WebSocket proxy -- Metro uses WS for HMR / hot reload
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
  console.log('[proxy] Listening on port ' + PUBLIC_PORT + ', forwarding to Expo on port ' + INTERNAL_PORT);
});

process.on('SIGTERM', () => { expo.kill(); server.close(); });
process.on('SIGINT', () => { expo.kill(); server.close(); });
`,
    };

    return {
        name: 'expo-scratch',
        description: {
            selection: 'expo-scratch-template',
            usage: `Expo/React Native scratch template for mobile app development. ${EXPO_SCRATCH_TEMPLATE_INSTRUCTIONS}`
        },
        fileTree: {
            path: '/',
            type: 'directory',
            children: [
                { path: 'app', type: 'directory', children: [] },
                { path: 'public', type: 'directory', children: [] },
                { path: 'package.json', type: 'file' },
                { path: 'app.json', type: 'file' },
                { path: 'tsconfig.json', type: 'file' },
                { path: 'metro.config.js', type: 'file' },
                { path: '_expo-proxy.cjs', type: 'file' },
                { path: 'eas.json', type: 'file' },
                { path: 'wrangler.jsonc', type: 'file' },
                { path: 'worker.ts', type: 'file' },
            ]
        },
        allFiles: expoFiles,
        language: 'typescript',
        deps: { 'expo': '~54.0.0', 'react-native': '0.81.5', 'react-native-gesture-handler': '~2.28.0', 'react-native-reanimated': '~4.1.0', 'expo-router': '~6.0.14' },
        projectType: 'app',
        renderMode: 'mobile',
        initCommand: 'node _expo-proxy.cjs',
        frameworks: ['react-native', 'expo', 'expo-router'],
        importantFiles: ['app/index.tsx', 'app/_layout.tsx', 'package.json', 'app.json'],
        dontTouchFiles: ['app.json', 'metro.config.js', '_expo-proxy.cjs', 'eas.json', 'babel.config.js', 'wrangler.jsonc', 'worker.ts'],
        redactedFiles: [],
        disabled: false,
    };
}

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

6. Frontend screens call the API via lib/api-client.ts using the API_URL env var.

7. These packages are pre-installed: expo, expo-router, expo-constants, expo-font, expo-linking, expo-status-bar, expo-system-ui, react-native, react-native-gesture-handler, react-native-reanimated, react-native-safe-area-context, react-native-screens, react-native-web, hono, drizzle-orm. Do NOT add them again.

8. **CRITICAL**: If your code imports ANY package not listed above, you MUST install it with exec_commands("bun add <package>") BEFORE calling deploy_preview.

9. **BANNED PACKAGES** -- Do NOT use these. They fail to install or are incompatible with Expo SDK 54:
   - lucide-react-native, @expo/vector-icons, react-native-vector-icons, react-native-svg
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

// Database initialization middleware - auto-creates tables on first request
let dbInitialized = false;
app.use('/api/*', async (c, next) => {
  if (!dbInitialized && c.env.DB) {
    try {
      await c.env.DB.exec(\`
        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      \`);
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
// In development (Expo Go), uses the sandbox preview URL.
// In production (deployed), uses relative paths (same origin).

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = API_URL + path;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((error as Record<string, string>).error || res.statusText);
  }
  return res.json() as Promise<T>;
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
                'react-native-worklets': '~0.5.0',
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

const config = getDefaultConfig(__dirname);

// Disable package exports to fix React 19 web bundling.
config.resolver.unstable_enablePackageExports = false;

// Exclude api/ directory from Metro bundling (it's the Workers backend)
config.resolver.blockList = [/api\\/.*$/];

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
        '_expo-proxy.cjs': `// Reverse proxy that sanitizes duplicated x-forwarded-* headers before they
// reach the Expo dev server.
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const PUBLIC_PORT = parseInt(process.env.PORT || '8001', 10);
const INTERNAL_PORT = PUBLIC_PORT + 1;
let metroReady = false;
let metroDead = false;
let metroExitCode = null;
const lastErrors = [];

// Start Expo dev server on internal port
const expo = spawn('npx', ['expo', 'start', '--port', String(INTERNAL_PORT), '--host', 'lan'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(INTERNAL_PORT), NODE_OPTIONS: '--max-old-space-size=1536' },
});
expo.stdout.on('data', (d) => { const s = d.toString(); process.stdout.write(s); if (/Metro waiting|Bundler is ready|listening on/i.test(s)) { metroReady = true; console.log('[proxy] Metro is ready'); } });
expo.stderr.on('data', (d) => { const s = d.toString(); process.stderr.write(d); lastErrors.push(s); if (lastErrors.length > 30) lastErrors.shift(); });
expo.on('error', (err) => { console.error('[proxy] Failed to start Expo:', err); metroDead = true; lastErrors.push(String(err)); });
expo.on('exit', (code) => { console.error('[proxy] Expo exited with code ' + code); metroDead = true; metroExitCode = code; });

// Probe Metro readiness every 3s until ready
const probe = setInterval(() => {
  if (metroReady || metroDead) { clearInterval(probe); return; }
  const req = http.get({ hostname: '127.0.0.1', port: INTERNAL_PORT, path: '/status', timeout: 2000 }, (res) => {
    if (!metroReady) { metroReady = true; clearInterval(probe); console.log('[proxy] Metro responded on port ' + INTERNAL_PORT); }
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

// HTTP proxy
const server = http.createServer((clientReq, clientRes) => {
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
  console.log('[proxy] Listening on port ' + PUBLIC_PORT + ', forwarding to Expo on port ' + INTERNAL_PORT);
});

process.on('SIGTERM', () => { expo.kill(); server.close(); });
process.on('SIGINT', () => { expo.kill(); server.close(); });
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
        importantFiles: ['app/index.tsx', 'app/_layout.tsx', 'api/src/index.ts', 'lib/api-client.ts', 'package.json', 'wrangler.jsonc'],
        dontTouchFiles: ['app.json', 'metro.config.js', '_expo-proxy.cjs', 'eas.json', 'babel.config.js', 'wrangler.jsonc'],
        redactedFiles: [],
        disabled: false,
    };
}
