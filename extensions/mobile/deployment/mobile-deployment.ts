/**
 * Mobile-specific deployment hooks extracted from DeploymentManager.
 * Handles Expo/React Native project deployment concerns: Metro config,
 * dependency management, API URL injection, and third-party package detection.
 */

import type { StructuredLogger } from 'worker/logger';
import type { BaseSandboxService } from 'worker/services/sandbox/BaseSandboxService';
import type { BaseProjectState } from 'worker/agents/core/state';
import { getPreviewDomain, getProtocolForHost } from 'worker/utils/urls';

/**
 * Check whether mobile deployment hooks should handle this project.
 */
function shouldHandle(state: Readonly<BaseProjectState>): boolean {
    return state.templateRenderMode === 'mobile' || state.templateRenderMode === 'mobile-fullstack';
}

/**
 * Metro config that sanitizes proxy headers to prevent "TypeError: Invalid URL".
 * Metro 0.83.x constructs URLs from x-forwarded-proto + host headers. Behind nested
 * proxies, x-forwarded-proto can contain comma-separated duplicates ("https, https")
 * which produces an invalid base URL.
 */
const METRO_CONFIG_CONTENT = `const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Disable package exports to fix React 19 web bundling.
// Metro incorrectly transforms React 19 module exports for web platform,
// causing "(0, _react.createContext) is not a function" errors.
config.resolver.unstable_enablePackageExports = false;
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
`;

/**
 * Reverse proxy that sanitizes duplicated x-forwarded-* headers before they
 * reach the Expo dev server. The enhanceMiddleware in metro.config.js only covers
 * Metro's middleware, but the Expo manifest endpoint (/) is handled separately.
 * This proxy wraps all traffic so both manifest and bundle URLs are clean.
 */
const EXPO_PROXY_CONTENT = `const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const PUBLIC_PORT = parseInt(process.env.PORT || '8001', 10);
const INTERNAL_PORT = PUBLIC_PORT + 1;
const expo = spawn('npx', ['expo', 'start', '--port', String(INTERNAL_PORT), '--host', 'lan'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(INTERNAL_PORT), NODE_OPTIONS: '--max-old-space-size=1536' },
});
expo.on('error', (err) => { console.error('[proxy] Failed to start Expo:', err); process.exit(1); });
expo.on('exit', (code) => { process.exit(code || 0); });
function sanitizeHeaders(headers) {
  const h = { ...headers };
  // Always force HTTPS — the public URL is behind Cloudflare TLS termination.
  // Without this, Expo constructs http:// manifest URLs that break Expo Go.
  h['x-forwarded-proto'] = 'https';
  if (h['x-forwarded-host']) h['x-forwarded-host'] = h['x-forwarded-host'].split(',')[0].trim();
  return h;
}
const server = http.createServer((clientReq, clientRes) => {
  const proxyReq = http.request(
    { hostname: '127.0.0.1', port: INTERNAL_PORT, path: clientReq.url, method: clientReq.method, headers: sanitizeHeaders(clientReq.headers) },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    }
  );
  proxyReq.on('error', () => {
    clientRes.writeHead(503, { 'Content-Type': 'text/plain' });
    clientRes.end('Expo dev server starting...');
  });
  clientReq.pipe(proxyReq, { end: true });
});
server.on('upgrade', (req, socket, head) => {
  const proxySocket = net.connect(INTERNAL_PORT, '127.0.0.1', () => {
    const sanitized = sanitizeHeaders(req.headers);
    const headerLines = Object.entries(sanitized).map(([k, v]) => k + ': ' + v).join('\\r\\n');
    proxySocket.write(req.method + ' ' + req.url + ' HTTP/1.1\\r\\n' + headerLines + '\\r\\n\\r\\n');
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
`;

/** Packages pre-installed in the Expo scratch template (no need to auto-install) */
const EXPO_PREINSTALLED = new Set([
    'expo', 'expo-constants', 'expo-font', 'expo-linking', 'expo-router',
    'expo-status-bar', 'expo-system-ui',
    'react', 'react-dom', 'react-native', 'react-native-gesture-handler',
    'react-native-reanimated', 'react-native-safe-area-context',
    'react-native-screens', 'react-native-web', 'react-native-worklets',
    '@types/react', '@babel/core', 'typescript',
    // Bundled with Expo SDK (no separate install needed)
    '@expo/vector-icons',
    // Expo Router internals
    'expo-router/entry',
]);

/**
 * Canonical template dependencies with pinned versions from the expo-scratch template.
 * Before running `bun install`, these are merged INTO the LLM's package.json so that
 * all template deps (with correct versions) are always present. The LLM frequently
 * drops or changes template dependencies, causing Metro "Unable to resolve module" errors.
 * Using exact versions prevents bun from resolving different transitive dep trees.
 */
const EXPO_TEMPLATE_DEPS: Record<string, string> = {
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
    'react-native-screens': '~4.11.0',
    'react-native-web': '~0.21.0',
    'react-native-worklets': '~0.8.1',
};
const EXPO_TEMPLATE_DEV_DEPS: Record<string, string> = {
    '@babel/core': '^7.25.0',
    '@types/react': '~19.1.0',
    'typescript': '~5.9.0',
};

/**
 * Extract third-party package names from import/require statements in source files.
 * Handles standard imports, scoped packages (@scope/pkg), and require() calls.
 * Filters out relative imports (./), path aliases (@/), and Node/RN built-ins.
 */
function extractThirdPartyPackages(files: Array<{ filePath: string; fileContents: string }>): string[] {
    const packages = new Set<string>();
    const importRegex = /(?:from|require\()\s*['"]([^'"./][^'"]*)['"]/g;

    for (const file of files) {
        if (!/\.(tsx?|jsx?)$/.test(file.filePath)) continue;
        let match;
        while ((match = importRegex.exec(file.fileContents)) !== null) {
            const specifier = match[1];
            // Skip path aliases (@/ prefix used by tsconfig paths)
            if (specifier.startsWith('@/')) continue;

            // Extract the bare package name (handle @scope/pkg/subpath)
            let pkgName: string;
            if (specifier.startsWith('@')) {
                const parts = specifier.split('/');
                pkgName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
            } else {
                pkgName = specifier.split('/')[0];
            }
            packages.add(pkgName);
        }
    }
    return Array.from(packages);
}

/**
 * Ensure metro.config.js and _expo-proxy.cjs exist in the sandbox for mobile projects.
 * Written on every deploy so they're present even for projects created before this fix.
 */
async function ensureMetroConfig(
    sandboxInstanceId: string,
    client: BaseSandboxService,
    logger: StructuredLogger
): Promise<void> {
    try {
        await client.writeFiles(sandboxInstanceId, [
            { filePath: 'metro.config.js', fileContents: METRO_CONFIG_CONTENT },
            { filePath: '_expo-proxy.cjs', fileContents: EXPO_PROXY_CONTENT },
        ]);
        logger.info('Ensured metro.config.js and _expo-proxy.cjs exist in sandbox');
    } catch (error) {
        logger.warn('Failed to write metro config files (non-blocking)', error);
    }
}

/**
 * Auto-detect and install missing third-party dependencies for Expo projects.
 * 1. Ensures framework-required packages (react-dom) are always installed.
 * 2. Scans all generated files for import statements and installs any third-party
 *    packages not in the template or package.json.
 */
async function autoInstallMissingDependencies(
    sandboxInstanceId: string,
    state: Readonly<BaseProjectState>,
    client: BaseSandboxService,
    logger: StructuredLogger
): Promise<void> {
    try {
        const allFiles = Object.values(state.generatedFilesMap);

        // Step 0: Fix common LLM import typos in generated source files.
        // The LLM frequently writes `@expo-vector-icons` instead of `@expo/vector-icons`.
        const IMPORT_TYPO_FIXES: Record<string, string> = {
            '@expo-vector-icons': '@expo/vector-icons',
        };
        for (const file of allFiles) {
            if (!file.filePath.match(/\.(tsx?|jsx?)$/)) continue;
            let fixed = file.fileContents;
            for (const [wrong, correct] of Object.entries(IMPORT_TYPO_FIXES)) {
                if (fixed.includes(wrong)) {
                    fixed = fixed.replaceAll(wrong, correct);
                    logger.info('Fixed import typo in generated file', { file: file.filePath, wrong, correct });
                }
            }
            if (fixed !== file.fileContents) {
                file.fileContents = fixed;
                await client.writeFiles(sandboxInstanceId, [{ filePath: file.filePath, fileContents: fixed }]);
            }
        }

        // Step 1: Merge template dependencies into the LLM's package.json.
        // The LLM frequently drops or changes template dependency versions, causing
        // Metro "Unable to resolve module" errors for transitive deps like @expo/log-box.
        // By restoring template deps with pinned versions, `bun install` resolves the
        // same dependency tree as the original template.
        const pkgJsonFile = allFiles.find(f => f.filePath === 'package.json');
        if (pkgJsonFile) {
            try {
                const pkgJson = JSON.parse(pkgJsonFile.fileContents);
                if (!pkgJson.dependencies) pkgJson.dependencies = {};
                if (!pkgJson.devDependencies) pkgJson.devDependencies = {};

                // Template deps take precedence (restore pinned versions)
                for (const [pkg, ver] of Object.entries(EXPO_TEMPLATE_DEPS)) {
                    pkgJson.dependencies[pkg] = ver;
                }
                for (const [pkg, ver] of Object.entries(EXPO_TEMPLATE_DEV_DEPS)) {
                    pkgJson.devDependencies[pkg] = ver;
                }

                const mergedJson = JSON.stringify(pkgJson, null, 2);
                pkgJsonFile.fileContents = mergedJson;
                await client.writeFiles(sandboxInstanceId, [{ filePath: 'package.json', fileContents: mergedJson }]);
                logger.info('Merged template dependencies into package.json');
            } catch (error) {
                logger.error('Failed to merge template deps into package.json', { error });
            }

            // Now run bun install with the corrected package.json
            logger.info('Running bun install with merged package.json');
            try {
                await client.executeCommands(sandboxInstanceId, ['bun install'], 90_000);
                logger.info('bun install completed');
            } catch (error) {
                logger.error('bun install failed', { error });
            }
        }

        // Step 2: Detect imports that aren't in package.json (LLM used a package
        // without adding it to dependencies). Install these separately.
        const knownPackages = new Set(EXPO_PREINSTALLED);
        if (pkgJsonFile) {
            try {
                const pkgJson = JSON.parse(pkgJsonFile.fileContents);
                for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
                    if (pkgJson[key]) {
                        Object.keys(pkgJson[key]).forEach(dep => knownPackages.add(dep));
                    }
                }
            } catch {
                // Malformed package.json, proceed with pre-installed list only
            }
        }

        const detectedPackages = extractThirdPartyPackages(allFiles);
        const missingFromImports = detectedPackages.filter(pkg => !knownPackages.has(pkg));
        if (missingFromImports.length === 0) return;

        logger.info('Auto-installing additional Expo dependencies not in package.json', { packages: missingFromImports });
        await client.executeCommands(sandboxInstanceId, [
            `bun add ${missingFromImports.join(' ')}`
        ], 90_000);
        logger.info('Auto-installed additional Expo dependencies', { count: missingFromImports.length });
    } catch (error) {
        logger.error('Failed to auto-install missing Expo dependencies', { error });
        // Continue deployment -- Metro will surface the missing module error
        // which the deep debugger or user can address.
    }
}

/**
 * Post-file-write hook for mobile projects.
 * Ensures Metro config exists and auto-installs missing dependencies,
 * then writes .api-url for fullstack mobile projects.
 */
async function onFilesWritten(
    state: Readonly<BaseProjectState>,
    sandboxInstanceId: string,
    client: BaseSandboxService,
    env: Env,
    logger: StructuredLogger
): Promise<void> {
    if (state.templateRenderMode === 'mobile' || state.templateRenderMode === 'mobile-fullstack') {
        await ensureMetroConfig(sandboxInstanceId, client, logger);
        await autoInstallMissingDependencies(sandboxInstanceId, state, client, logger);
    }

    // Ensure .api-url exists for fullstack mobile projects so the proxy
    // can route /api/* requests. Uses writeFiles (reliable) instead of
    // executeCommands (fire-and-forget). Covers existing projects that
    // were created before .api-url was included in initial files.
    if (state.templateRenderMode === 'mobile-fullstack' || state.templateName === 'expo-fullstack') {
        const previewDomain = getPreviewDomain(env);
        const protocol = getProtocolForHost(previewDomain);
        const apiUrl = `${protocol}://${state.projectName}.${previewDomain}`;
        try {
            await client.writeFiles(sandboxInstanceId, [
                { filePath: '.api-url', fileContents: apiUrl }
            ]);
            logger.info('Wrote .api-url via writeFiles', { apiUrl });
        } catch (e) {
            logger.warn('Failed to write .api-url via writeFiles', e);
        }
    }
}

/**
 * Pre-deploy hook for mobile-fullstack projects.
 * Injects the deployed API URL into app.json and writes .api-url
 * so the sandbox proxy can route /api/* requests from first boot.
 */
async function onPreDeploy(
    state: Readonly<BaseProjectState>,
    files: Array<{ filePath: string; fileContents: string; filePurpose?: string }>,
    env: Env,
    _logger: StructuredLogger
): Promise<void> {
    // For fullstack mobile projects, bake the deployed API URL into app.json
    // so standalone APK/IPA builds can reach the CF Workers API directly.
    // Also include .api-url so the proxy can route /api/* from first boot.
    if (state.templateRenderMode === 'mobile-fullstack' || state.templateName === 'expo-fullstack') {
        const previewDomain = getPreviewDomain(env);
        const protocol = getProtocolForHost(previewDomain);
        const apiUrl = `${protocol}://${state.projectName}.${previewDomain}`;
        const appJsonFile = files.find(f => f.filePath === 'app.json');
        if (appJsonFile) {
            appJsonFile.fileContents = appJsonFile.fileContents
                .replace(/__API_URL__/g, apiUrl)
                .replace(/expo-fullstack-app/g, state.projectName);
        }
        // Write .api-url as a regular file so the sandbox proxy can route
        // /api/* requests immediately. This is more reliable than using
        // executeCommands (fire-and-forget) which can fail silently.
        if (!files.find(f => f.filePath === '.api-url')) {
            files.push({ filePath: '.api-url', fileContents: apiUrl, filePurpose: 'Deployed API URL for proxy routing' });
        }
    }
}

export const MobileDeploymentHooks = {
    shouldHandle,
    onFilesWritten,
    onPreDeploy,
    extractThirdPartyPackages,
    autoInstallMissingDependencies,
    ensureMetroConfig,
    METRO_CONFIG_CONTENT,
    EXPO_PROXY_CONTENT,
    EXPO_PREINSTALLED,
    EXPO_TEMPLATE_DEPS,
    EXPO_TEMPLATE_DEV_DEPS,
};
