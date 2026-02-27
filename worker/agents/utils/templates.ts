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

const app = new Hono({ router: new LinearRouter() });

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

// Health check — MUST be under /api/ to match run_worker_first routing
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// -------------------------------------------------------------------
// In-memory data store (use this pattern for API data)
// This project does NOT have a D1 database configured.
// Store data in memory. Data resets on worker restart, which is fine
// for development and preview. For production persistence, the user
// can ask to add D1 later.
// -------------------------------------------------------------------
const dataStore = {
  items: [] as Array<{ id: string; name: string; createdAt: string }>,
};

// Example CRUD routes using in-memory store
app.get('/api/data', (c) => {
  return c.json({ items: dataStore.items });
});

app.post('/api/data', async (c) => {
  try {
    const body = await c.req.json();
    const item = {
      id: crypto.randomUUID(),
      name: body.name || 'Untitled',
      createdAt: new Date().toISOString(),
    };
    dataStore.items.push(item);
    return c.json(item, 201);
  } catch (err) {
    return c.json({ error: 'Invalid request body' }, 400);
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

    // Test API endpoint
    fetch('/api/data')
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

- \`GET /health\` - Health check
- \`GET /api/data\` - Sample data endpoint
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
To build a valid, previewable Expo/React Native project, follow these rules:

1. The package.json **MUST** have a dev script using expo start:
\`\`\`
"scripts": {
    "dev": "npx expo start --port \${PORT:-8001}",
    "build": "npx expo export",
    "lint": "npx eslint . --ext .ts,.tsx"
}
\`\`\`

2. The project **MUST** have a valid app.json with Expo configuration.

3. Use expo-router for navigation (file-based routing in the app/ directory).

4. Do NOT include wrangler.jsonc or Cloudflare-specific files -- this is a React Native project.

5. All UI must use React Native components (View, Text, TouchableOpacity, etc.), NOT HTML elements.
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
        'app.json': JSON.stringify({
            expo: {
                name: 'expo-app',
                slug: 'expo-app',
                version: '1.0.0',
                orientation: 'portrait',
                scheme: 'expo-app',
                platforms: ['ios', 'android'],
                web: { bundler: 'metro' },
                plugins: ['expo-router'],
            }
        }, null, 2),
        'package.json': JSON.stringify({
            name: 'expo-app',
            version: '1.0.0',
            main: 'expo-router/entry',
            scripts: {
                dev: 'npx expo start --port ${PORT:-8001}',
                build: 'npx expo export',
                lint: 'npx eslint . --ext .ts,.tsx',
            },
            dependencies: {
                'expo': '~52.0.0',
                'expo-router': '~4.0.0',
                'expo-status-bar': '~2.0.0',
                'react': '^18.3.1',
                'react-native': '0.76.6',
                'react-native-safe-area-context': '~5.0.0',
                'react-native-screens': '~4.4.0',
            },
            devDependencies: {
                '@types/react': '~18.3.0',
                'typescript': '~5.3.0',
            },
        }, null, 2),
        'tsconfig.json': JSON.stringify({
            extends: 'expo/tsconfig.base',
            compilerOptions: {
                strict: true,
                paths: { '@/*': ['./*'] },
            },
        }, null, 2),
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
                { path: 'package.json', type: 'file' },
                { path: 'app.json', type: 'file' },
                { path: 'tsconfig.json', type: 'file' },
            ]
        },
        allFiles: expoFiles,
        language: 'typescript',
        deps: { 'expo': '~52.0.0', 'react-native': '0.76.6' },
        projectType: 'app',
        renderMode: 'mobile',
        initCommand: 'npx expo start --port ${PORT:-8001}',
        frameworks: ['react-native', 'expo', 'expo-router'],
        importantFiles: ['app/index.tsx', 'app/_layout.tsx', 'package.json', 'app.json'],
        dontTouchFiles: ['app.json'],
        redactedFiles: [],
        disabled: false,
    };
}
