import type { TemplateDetails } from 'worker/services/sandbox/sandboxTypes';

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

6. These packages are already installed: expo, expo-router, expo-constants, expo-font, expo-linking, expo-status-bar, expo-system-ui, react-native, react-native-gesture-handler, react-native-reanimated, react-native-safe-area-context, react-native-screens, react-native-web, @react-native-async-storage/async-storage. Do NOT add them again with exec_commands.

7. **CRITICAL**: If your code imports ANY package not listed above, you MUST install it with exec_commands("bun add <package>") BEFORE calling deploy_preview. Missing dependencies cause Metro bundler to crash with "Unable to resolve module" errors. Common packages that need explicit installation: date-fns, zustand, expo-image, expo-linear-gradient, expo-splash-screen, etc.

8. **BANNED PACKAGES** -- Do NOT use these. They fail to install or are incompatible with Expo SDK 54:
   - lucide-react-native (use emoji or Unicode symbols for icons instead)
   - @expo/vector-icons (not compatible with SDK 54)
   - react-native-vector-icons (requires native linking)
   - react-native-svg (often causes build failures)
   - @react-native-async-storage/async-storage@2.x (v2 requires KMP Maven repo not available in EAS Build -- v1.23.1 is pre-installed, do NOT upgrade it)
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
                'react-native-worklets': '0.5.1',
                '@react-native-async-storage/async-storage': '1.23.1',
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
// Auto-restarts Metro when it crashes (e.g. file watcher ENOENT during bun install).
const http = require('http');
const net = require('net');
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
  // Auto-restart on crash (non-zero exit), up to MAX_RESTARTS
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

process.on('SIGTERM', () => { shuttingDown = true; if (expo) expo.kill(); server.close(); });
process.on('SIGINT', () => { shuttingDown = true; if (expo) expo.kill(); server.close(); });
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
