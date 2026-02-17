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

2. The project **MUST** be a valid Cloudflare worker/durable object + Vite + bun project. 

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
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';

const app = new Hono();

// CORS middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

// API routes placeholder
app.get('/api/data', (c) => {
  return c.json({ message: 'API endpoint working' });
});

// Serve static files
app.use('/*', serveStatic({ root: './dist' }));

// Fallback to index.html for SPA routing
app.get('*', (c) => {
  return c.html(c.env.ASSETS.fetch(new Request('http://localhost/index.html')));
});

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
    fetch('/health')
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
                '@cloudflare/vite-plugin': '^1.17.1',
                '@cloudflare/workers-types': '^4.20251213.0',
                'vite': 'npm:rolldown-vite@latest',
                'wrangler': '^4.50.0'
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
                "run_worker_first": true,
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
- ✅ **Cloudflare Ready**: Optimized for Workers deployment
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

