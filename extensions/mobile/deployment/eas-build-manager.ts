/**
 * EAS Build management functions extracted from DeploymentManager and CodeGeneratorAgent.
 * Handles triggering, polling, and artifact storage for Expo Application Services builds.
 */

import type { StructuredLogger } from 'worker/logger';
import type { BaseSandboxService } from 'worker/services/sandbox/BaseSandboxService';
import type { BaseProjectState } from 'worker/agents/core/state';
import type { EasBuildPlatform, EasBuildState } from 'worker/agents/core/types';
import type { IStateManager } from 'worker/agents/services/interfaces/IStateManager';
import { getPreviewDomain, getProtocolForHost } from 'worker/utils/urls';

// Standalone api-client.ts for EAS builds (reads apiUrl from app.json extra)
export const EAS_API_CLIENT_TEMPLATE = `import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Hardcoded at EAS build time — reliable fallback when Constants.expoConfig is unavailable
const BUILT_API_URL = '%%DEPLOYED_API_URL%%';

function getBaseUrl(): string {
  if (Platform.OS === 'web') return '';
  const debuggerHost = Constants.expoConfig?.hostUri
    ?? (Constants as Record<string, unknown>).manifest2?.extra?.expoGo?.debuggerHost as string | undefined;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return 'https://' + host;
  }
  const apiUrl = Constants.expoConfig?.extra?.apiUrl;
  if (apiUrl && !apiUrl.startsWith('__')) return apiUrl;
  if (BUILT_API_URL && !BUILT_API_URL.startsWith('%%')) return BUILT_API_URL;
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
        headers: { 'Content-Type': 'application/json', ...options?.headers },
      });
      if (res.ok) return res.json() as Promise<T>;
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        lastError = new Error(res.statusText);
        await delay(RETRY_DELAY_MS);
        continue;
      }
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((error as Record<string, string>).error || res.statusText);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) { await delay(RETRY_DELAY_MS); continue; }
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
`;

const EAS_POLL_INTERVAL_MS = 30_000;
const EAS_MAX_POLL_DURATION_MS = 30 * 60_000; // 30 minutes
const EAS_MAX_POLL_FAILURES = 5;

/**
 * Dependencies required by EasBuildManager functions.
 * These were previously accessed via `this` on the DeploymentManager/CodeGeneratorAgent classes.
 */
export interface EasBuildDeps {
    stateManager: Pick<IStateManager<BaseProjectState>, 'getState' | 'setState'>;
    getClient: () => BaseSandboxService;
    getLogger: () => StructuredLogger;
    getAgentId: () => string;
    env: Env;
}

/**
 * Callbacks for EAS build trigger.
 */
export interface EasBuildTriggerCallbacks {
    onStatus?: (build: EasBuildState) => void;
    onProgress?: (message: string) => void;
    onError?: (error: string) => void;
    scheduleAlarm?: (delayMs: number) => void;
}

/**
 * Callbacks for EAS build poll.
 */
export interface EasBuildPollCallbacks {
    onStatus?: (build: EasBuildState) => void;
    onComplete?: (build: EasBuildState) => void;
    onError?: (buildId: string, platform: EasBuildPlatform, error: string) => void;
    scheduleAlarm?: (delayMs: number) => void;
}

/**
 * Callbacks for onEasBuildPoll (from codingAgent.ts).
 */
export interface OnEasBuildPollCallbacks {
    onStatus: (build: EasBuildState) => void;
    onComplete: (build: EasBuildState) => void;
    onError: (buildId: string, platform: EasBuildPlatform, error: string) => void;
    scheduleAlarm: (delayMs: number) => void;
}

/**
 * Retrieve the EXPO_TOKEN stored in the sandbox during triggerEasBuild.
 * Falls back to null if the file doesn't exist or can't be read.
 */
async function getExpoTokenFromSandbox(deps: EasBuildDeps): Promise<string | null> {
    const state = deps.stateManager.getState();
    if (!state.sandboxInstanceId) return null;
    try {
        const files = await deps.getClient().getFiles(state.sandboxInstanceId, ['.expo-token']);
        const content = files.files?.find(f => f.filePath === '.expo-token')?.fileContents?.trim();
        return content || null;
    } catch {
        return null;
    }
}

/**
 * Ensure the EAS project is configured in app.json.
 * Strategy 1: Run `yes | eas init` in the sandbox to auto-accept prompts.
 * Strategy 2: Use Expo REST + GraphQL API to create project and inject projectId.
 * Returns the projectId or a truthy string on success, null on failure.
 */
async function ensureEasProject(
    sandboxId: string,
    expoToken: string,
    client: BaseSandboxService,
    logger: StructuredLogger
): Promise<{ success: true; projectId: string } | { success: false; error: string }> {
    // Read slug and check if projectId already exists
    const readCmd = 'node -e "const a=require(\'./app.json\'); console.log(JSON.stringify({slug: a.expo?.slug || a.slug || \'my-app\', existingId: a.expo?.extra?.eas?.projectId || \'\'}))"';
    const readResult = await client.executeCommands(sandboxId, [readCmd], 10_000);
    const appInfo = (() => {
        try { return JSON.parse(readResult.results?.[0]?.output?.trim() || '{}') as { slug: string; existingId: string }; }
        catch { return { slug: 'my-app', existingId: '' }; }
    })();

    if (appInfo.existingId) {
        logger.info('EAS projectId already in app.json', { projectId: appInfo.existingId });
        return { success: true, projectId: appInfo.existingId };
    }

    // Build a Node.js script to call Expo GraphQL API from inside the sandbox.
    // We base64-encode it to avoid shell $ expansion corrupting GraphQL variables.
    // Queries verified from eas-cli source: github.com/expo/eas-cli
    // - meActor (not meUserActor) for current user
    // - AppInput! (not CreateAppInput!) for createApp mutation
    // - $fullName: String! for byFullName lookup
    const scriptContent = [
        'const https = require("https");',
        'const fs = require("fs");',
        'const token = process.env.EXPO_TOKEN;',
        `const slug = "${appInfo.slug}";`,
        '',
        'function gql(query, variables) {',
        '  const body = JSON.stringify({ query: query, variables: variables });',
        '  return new Promise(function(resolve, reject) {',
        '    var req = https.request({',
        '      hostname: "api.expo.dev",',
        '      path: "/graphql",',
        '      method: "POST",',
        '      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }',
        '    }, function(res) {',
        '      var data = "";',
        '      res.on("data", function(chunk) { data += chunk; });',
        '      res.on("end", function() { resolve({ status: res.statusCode, body: data }); });',
        '    });',
        '    req.on("error", reject);',
        '    req.write(body);',
        '    req.end();',
        '  });',
        '}',
        '',
        'async function main() {',
        '  // Step 1: Get current user accounts (exact query from eas-cli UserQuery.ts)',
        '  var me = await gql("query { meActor { __typename id ... on UserActor { username } accounts { id name } } }");',
        '  if (me.status !== 200) { console.log(JSON.stringify({ error: "graphql_http_error", status: me.status, body: me.body.slice(0, 300) })); return; }',
        '  var meData;',
        '  try { meData = JSON.parse(me.body); } catch(e) { console.log(JSON.stringify({ error: "parse_failed", body: me.body.slice(0, 300) })); return; }',
        '  if (meData.errors && meData.errors.length > 0) { console.log(JSON.stringify({ error: "auth_failed", messages: meData.errors.map(function(e) { return e.message; }).join("; ") })); return; }',
        '  var actor = meData.data && meData.data.meActor;',
        '  if (!actor) { console.log(JSON.stringify({ error: "no_user", body: me.body.slice(0, 300) })); return; }',
        '  var accounts = actor.accounts || [];',
        '  if (accounts.length === 0) { console.log(JSON.stringify({ error: "no_accounts", user: actor.username })); return; }',
        '  var account = accounts[0];',
        '',
        '  // Step 2: Check if project already exists (exact query from eas-cli AppQuery.ts)',
        '  var fullName = "@" + account.name + "/" + slug;',
        '  var lookup = await gql("query AppByFullName($fullName: String!) { app { byFullName(fullName: $fullName) { id } } }", { fullName: fullName });',
        '  var lookupData;',
        '  try { lookupData = JSON.parse(lookup.body); } catch(e) {}',
        '  var existingId = lookupData && lookupData.data && lookupData.data.app && lookupData.data.app.byFullName && lookupData.data.app.byFullName.id;',
        '  if (existingId) {',
        '    // Project already exists, inject and return',
        '    var appJson = JSON.parse(fs.readFileSync("./app.json", "utf8"));',
        '    appJson.expo = appJson.expo || {};',
        '    appJson.expo.extra = appJson.expo.extra || {};',
        '    appJson.expo.extra.eas = appJson.expo.extra.eas || {};',
        '    appJson.expo.extra.eas.projectId = existingId;',
        '    fs.writeFileSync("./app.json", JSON.stringify(appJson, null, 2));',
        '    console.log(JSON.stringify({ success: true, projectId: existingId, account: account.name, existing: true }));',
        '    return;',
        '  }',
        '',
        '  // Step 3: Create project (exact mutation from eas-cli AppMutation.ts: AppInput!)',
        '  var create = await gql("mutation CreateAppMutation($appInput: AppInput!) { app { createApp(appInput: $appInput) { id } } }", { appInput: { accountId: account.id, projectName: slug } });',
        '  var createData;',
        '  try { createData = JSON.parse(create.body); } catch(e) { console.log(JSON.stringify({ error: "create_parse_failed", body: create.body.slice(0, 300) })); return; }',
        '  var projectId = createData.data && createData.data.app && createData.data.app.createApp && createData.data.app.createApp.id;',
        '',
        '  if (!projectId) {',
        '    console.log(JSON.stringify({ error: "create_failed", account: account.name, slug: slug, body: create.body.slice(0, 300) }));',
        '    return;',
        '  }',
        '',
        '  // Step 4: Inject projectId into app.json',
        '  var appJson = JSON.parse(fs.readFileSync("./app.json", "utf8"));',
        '  appJson.expo = appJson.expo || {};',
        '  appJson.expo.extra = appJson.expo.extra || {};',
        '  appJson.expo.extra.eas = appJson.expo.extra.eas || {};',
        '  appJson.expo.extra.eas.projectId = projectId;',
        '  fs.writeFileSync("./app.json", JSON.stringify(appJson, null, 2));',
        '  console.log(JSON.stringify({ success: true, projectId: projectId, account: account.name }));',
        '}',
        '',
        'main().catch(function(e) { console.log(JSON.stringify({ error: "exception", message: e.message })); });',
    ].join('\n');

    // Base64-encode the script so shell cannot mangle $ signs in GraphQL queries
    const b64Script = btoa(scriptContent);

    const apiResult = await client.executeCommands(sandboxId, [
        `echo '${b64Script}' | base64 -d > /tmp/_eas_setup.js && EXPO_TOKEN='${expoToken}' node /tmp/_eas_setup.js`
    ], 30_000);

    const rawOutput = apiResult.results?.[0]?.output || apiResult.results?.[0]?.error || '';
    // Extract the last line (JSON output) in case there's other output
    const lines = rawOutput.trim().split('\n');
    const apiOutput = lines[lines.length - 1] || '';
    logger.info('Expo API via sandbox result', { output: apiOutput.slice(0, 500), fullOutput: rawOutput.slice(0, 500) });

    try {
        const result = JSON.parse(apiOutput) as {
            success?: boolean;
            projectId?: string;
            account?: string;
            error?: string;
            status?: number;
            body?: string;
            message?: string;
            messages?: string;
            slug?: string;
            user?: string;
        };

        if (result.success && result.projectId) {
            logger.info('EAS project created via sandbox API call', { projectId: result.projectId, account: result.account });

            // Run eas init with the known projectId to finalize configuration
            const initCmd = `EXPO_TOKEN='${expoToken}' bunx eas-cli init --id ${result.projectId} --non-interactive 2>&1`;
            const initResult = await client.executeCommands(sandboxId, [initCmd], 60_000);
            logger.info('eas init --id result', {
                success: initResult.success,
                output: (initResult.results?.[0]?.output || initResult.results?.[0]?.error || '').slice(0, 300)
            });

            return { success: true, projectId: result.projectId };
        }

        // Build detailed error from result
        const errorDetail = result.error === 'graphql_http_error'
            ? `Expo GraphQL HTTP ${result.status}: ${result.body || 'no response'}`
            : result.error === 'auth_failed'
                ? `Expo auth error: ${result.messages || 'unknown'}`
                : result.error === 'no_accounts'
                    ? `No Expo accounts found for user: ${result.user || 'unknown'}`
                    : result.error === 'create_failed'
                        ? `Project creation failed (account: ${result.account}, slug: ${result.slug}): ${result.body || 'no response'}`
                        : result.error === 'exception'
                            ? `Script error: ${result.message || 'unknown'}`
                            : `${result.error || 'unknown'}: ${result.body || result.message || result.messages || apiOutput.slice(0, 300)}`;

        return { success: false, error: errorDetail };
    } catch {
        return { success: false, error: `Failed to parse API response: ${rawOutput.slice(0, 400)}` };
    }
}

/**
 * Trigger an EAS build for the given platform.
 * Runs `eas build` in the sandbox and stores the build ID in state.
 * Returns the build state for the caller to broadcast via WebSocket.
 */
async function triggerEasBuild(
    deps: EasBuildDeps,
    platform: EasBuildPlatform,
    expoToken: string,
    callbacks?: EasBuildTriggerCallbacks
): Promise<EasBuildState | null> {
    const state = deps.stateManager.getState();
    const logger = deps.getLogger();
    const client = deps.getClient();

    if (!state.sandboxInstanceId) {
        const error = 'No sandbox instance available. Deploy a preview first.';
        logger.error(error);
        callbacks?.onError?.(error);
        return null;
    }

    if (state.easBuild && (state.easBuild.status === 'pending' || state.easBuild.status === 'in-progress')) {
        // Allow retrigger if the previous attempt is stale (>10 min old or has no buildId)
        const isStale = !state.easBuild.buildId
            || (Date.now() - state.easBuild.startedAt > 10 * 60_000);
        if (!isStale) {
            const error = `An EAS build is already ${state.easBuild.status} (${state.easBuild.buildId})`;
            logger.error(error);
            callbacks?.onError?.(error);
            return null;
        }
        logger.info('Clearing stale EAS build state', {
            buildId: state.easBuild.buildId,
            status: state.easBuild.status,
            ageMs: Date.now() - state.easBuild.startedAt,
        });
        deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: undefined });
    }

    logger.info('Triggering EAS build', { platform, sandboxInstanceId: state.sandboxInstanceId });

    try {
        callbacks?.onProgress?.('Checking sandbox health...');

        // Verify the sandbox is reachable before starting the multi-step process
        const healthCheck = await client.getInstanceStatus(state.sandboxInstanceId);
        if (!healthCheck.success || !healthCheck.isHealthy) {
            const error = `Sandbox instance is not healthy. ${healthCheck.error || 'Try regenerating or refreshing the preview.'}`;
            logger.error('Sandbox health check failed before EAS build', { error: healthCheck.error });
            callbacks?.onError?.(error);
            return null;
        }
        logger.info('Sandbox health check passed');

        callbacks?.onProgress?.('Reading project files...');

        // Use writeFiles/getFiles API instead of fragile shell commands (node -e, heredoc)
        const previewDomain = getPreviewDomain(deps.env);
        const protocol = getProtocolForHost(previewDomain);
        const deployedApiUrl = `${protocol}://${state.projectName}.${previewDomain}`;
        const safeSlug = state.projectName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        const bundleId = 'com.expo.' + safeSlug.replace(/[^a-zA-Z0-9]/g, '');
        logger.info('Preparing EAS build files', { deployedApiUrl, safeSlug, bundleId });

        // Read current files from sandbox -- keep originals so we can restore after EAS submit
        const currentFiles = await client.getFiles(state.sandboxInstanceId, ['app.json', 'package.json', '.gitignore', 'lib/api-client.ts', 'bun.lockb']);
        const appJsonFile = currentFiles.files?.find(f => f.filePath === 'app.json');
        const pkgJsonFile = currentFiles.files?.find(f => f.filePath === 'package.json');
        const gitignoreFile = currentFiles.files?.find(f => f.filePath === '.gitignore');

        // Snapshot original file contents for restoration after EAS build submit
        const originalAppJson = appJsonFile?.fileContents || '';
        const originalPkgJson = pkgJsonFile?.fileContents || '';
        const originalApiClient = currentFiles.files?.find(f => f.filePath === 'lib/api-client.ts')?.fileContents || '';

        // Patch app.json with slug, name, bundleIdentifier, apiUrl
        let appJson: Record<string, Record<string, unknown>>;
        try {
            appJson = JSON.parse(appJsonFile?.fileContents || '{"expo":{}}');
        } catch {
            appJson = { expo: {} };
        }
        appJson.expo = appJson.expo || {};
        appJson.expo.slug = safeSlug;
        appJson.expo.name = state.projectName;
        const android = (appJson.expo.android || {}) as Record<string, unknown>;
        if (!android.package) android.package = bundleId;
        appJson.expo.android = android;
        const ios = (appJson.expo.ios || {}) as Record<string, unknown>;
        if (!ios.bundleIdentifier) ios.bundleIdentifier = bundleId;
        appJson.expo.ios = ios;
        const extra = (appJson.expo.extra || {}) as Record<string, unknown>;
        extra.apiUrl = deployedApiUrl;
        appJson.expo.extra = extra;

        // Patch package.json: remove eas-cli from devDependencies if present
        let pkgJson: Record<string, Record<string, unknown>>;
        try {
            pkgJson = JSON.parse(pkgJsonFile?.fileContents || '{}');
        } catch {
            pkgJson = {};
        }
        if (pkgJson.devDependencies && (pkgJson.devDependencies as Record<string, unknown>)['eas-cli']) {
            delete (pkgJson.devDependencies as Record<string, unknown>)['eas-cli'];
        }

        // Ensure .gitignore has node_modules and .expo
        let gitignoreContent = gitignoreFile?.fileContents || '';
        if (!gitignoreContent.includes('node_modules')) {
            gitignoreContent = 'node_modules/\n.expo/\ndist/\n*.tsbuildinfo\n';
        } else if (!gitignoreContent.includes('.expo')) {
            gitignoreContent += '\n.expo/\n';
        }

        callbacks?.onProgress?.('Writing build configuration...');

        // Write all files at once via reliable writeFiles API
        const filesToWrite: { filePath: string; fileContents: string }[] = [
            { filePath: 'app.json', fileContents: JSON.stringify(appJson, null, 2) },
            { filePath: 'package.json', fileContents: JSON.stringify(pkgJson, null, 2) },
            { filePath: '.gitignore', fileContents: gitignoreContent },
            { filePath: 'lib/api-client.ts', fileContents: EAS_API_CLIENT_TEMPLATE.replace('%%DEPLOYED_API_URL%%', deployedApiUrl) },
        ];

        // Add babel.config.js only if it doesn't exist
        const babelCheck = await client.getFiles(state.sandboxInstanceId, ['babel.config.js']);
        if (!babelCheck.files?.find(f => f.filePath === 'babel.config.js')?.fileContents) {
            filesToWrite.push({
                filePath: 'babel.config.js',
                fileContents: 'module.exports = function (api) {\n  api.cache(true);\n  return {\n    presets: ["babel-preset-expo"],\n    plugins: ["react-native-reanimated/plugin"],\n  };\n};\n'
            });
        }

        const writeResult = await client.writeFiles(state.sandboxInstanceId, filesToWrite);
        if (!writeResult.success) {
            logger.warn('writeFiles for build prereqs may have partially failed', { error: writeResult.error });
        }
        logger.info('Build prerequisite files written successfully');

        callbacks?.onProgress?.('Initializing git repository...');

        // EAS CLI requires a git repository with committed files
        // .gitignore was ensured above to prevent staging node_modules/
        const gitInit = 'git init && git add -A && git commit -m "eas-build" --no-verify 2>&1';
        const gitResult = await client.executeCommands(state.sandboxInstanceId, [gitInit], 30_000);
        if (!gitResult.success) {
            logger.warn('Git init for EAS may have failed (could already exist)', { error: gitResult.error });
        } else {
            logger.info('Git init complete', { output: gitResult.results?.[0]?.output?.slice(0, 200) });
        }

        callbacks?.onProgress?.('Fixing native dependencies...');

        // Re-install packages via `expo install` to ensure SDK-compatible versions.
        // Packages installed by LLM via `bun add` may have wrong versions (e.g. expo-image
        // from npm latest instead of SDK-pinned version, causing Android build failures).
        // Also run `--fix` to correct any remaining version mismatches.
        const fixDeps = 'bunx expo install --fix 2>&1 || true';
        await client.executeCommands(state.sandboxInstanceId, [fixDeps], 60_000);

        // Explicitly reinstall expo-image via expo install if present (bun add gets wrong version)
        const reinstallExpoImage = 'node -e "const p=require(\'./package.json\');if(p.dependencies && p.dependencies[\'expo-image\']){console.log(\'reinstall\')}else{console.log(\'skip\')}"';
        const checkResult = await client.executeCommands(state.sandboxInstanceId, [reinstallExpoImage], 5_000);
        if (checkResult.results?.[0]?.output?.trim() === 'reinstall') {
            callbacks?.onProgress?.('Fixing expo-image version...');
            await client.executeCommands(state.sandboxInstanceId, ['bunx expo install expo-image 2>&1 || true'], 30_000);
        }

        callbacks?.onProgress?.('Linking Expo project...');

        // Create EAS project via Expo API and inject projectId into app.json
        const easProjectResult = await ensureEasProject(state.sandboxInstanceId, expoToken, client, logger);
        if (!easProjectResult.success) {
            const error = `EAS project setup failed: ${easProjectResult.error}`;
            logger.error(error);
            callbacks?.onError?.(error);
            return null;
        }

        // Commit the updated app.json with projectId
        const gitCommit = 'git add -A && git commit -m "eas-project-config" --no-verify';
        await client.executeCommands(state.sandboxInstanceId, [gitCommit], 15_000);

        // Deploy CF Worker API so the standalone APK can reach /api/* endpoints.
        // The sandbox proxy only works for dev preview (Expo Go / web); standalone
        // APK calls the deployed Worker URL directly via extra.apiUrl.
        if (state.templateRenderMode === 'mobile-fullstack' || state.templateName === 'expo-fullstack') {
            callbacks?.onProgress?.('Deploying API backend...');

            const deployResult = await client.deployToCloudflareWorkers(
                state.sandboxInstanceId,
                'platform',
                { buildCommand: 'bun run build:worker' }
            );

            if (!deployResult || !deployResult.success) {
                const error = `API backend deployment failed: ${deployResult?.error || deployResult?.message || 'Unknown error'}. The APK will not be able to reach the API.`;
                logger.error('CF Worker deploy failed before EAS build', { error: deployResult?.error });
                callbacks?.onError?.(error);
                return null;
            }

            logger.info('CF Worker API deployed for EAS build', {
                deployedUrl: deployResult.deployedUrl,
                deploymentId: deployResult.deploymentId,
            });

            // Write .api-url so the sandbox proxy also routes to the deployed Worker
            if (deployResult.deployedUrl) {
                try {
                    await client.writeFiles(state.sandboxInstanceId, [
                        { filePath: '.api-url', fileContents: deployResult.deployedUrl }
                    ]);
                } catch (err) {
                    logger.warn('Failed to write .api-url after CF deploy', err);
                }
            }
        }

        callbacks?.onProgress?.(`Submitting ${platform} build to EAS...`);

        // Persist EXPO_TOKEN in sandbox so alarm-based polling can use it
        // without needing the vault (vault session expires after DO hibernation)
        await client.writeFiles(state.sandboxInstanceId, [
            { filePath: '.expo-token', fileContents: expoToken }
        ]);
        // Ensure .gitignore excludes the token file
        await client.executeCommands(state.sandboxInstanceId, [
            'grep -qxF ".expo-token" .gitignore || echo ".expo-token" >> .gitignore'
        ], 5_000);

        const command = `EXPO_TOKEN='${expoToken}' bunx eas-cli build --platform ${platform} --profile preview --non-interactive --no-wait --json`;
        const result = await client.executeCommands(state.sandboxInstanceId, [command], 120_000);

        // Restore original project files so the Metro dev server (web preview) isn't
        // broken by EAS-specific changes (different package versions, patched app.json, etc.)
        try {
            const restoreFiles: { filePath: string; fileContents: string }[] = [];
            if (originalAppJson) restoreFiles.push({ filePath: 'app.json', fileContents: originalAppJson });
            if (originalPkgJson) restoreFiles.push({ filePath: 'package.json', fileContents: originalPkgJson });
            if (originalApiClient) restoreFiles.push({ filePath: 'lib/api-client.ts', fileContents: originalApiClient });
            if (restoreFiles.length > 0) {
                await client.writeFiles(state.sandboxInstanceId, restoreFiles);
                // Reinstall original dependencies to match restored package.json
                await client.executeCommands(state.sandboxInstanceId, ['bun install 2>&1 || true'], 60_000);
                logger.info('Restored original project files after EAS build submit');
            }
        } catch (restoreError) {
            logger.warn('Failed to restore original files after EAS build submit', {
                error: restoreError instanceof Error ? restoreError.message : String(restoreError)
            });
        }

        if (!result.success || !result.results[0]?.success) {
            const error = result.results[0]?.error || result.error || 'EAS build command failed';
            logger.error('EAS build trigger failed', { error });
            callbacks?.onError?.(error);
            return null;
        }

        const output = result.results[0].output;
        let buildId: string;
        try {
            // EAS CLI --json outputs a JSON array with build info
            const parsed = JSON.parse(output);
            const buildInfo = Array.isArray(parsed) ? parsed[0] : parsed;
            buildId = buildInfo.id;
            if (!buildId) throw new Error('No build ID in EAS output');
        } catch (parseError) {
            // Try to extract build ID from non-JSON output
            const match = output.match(/Build ID:\s*([a-f0-9-]+)/i) || output.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
            if (!match) {
                const error = `Failed to parse EAS build output: ${output.slice(0, 500)}`;
                logger.error(error);
                callbacks?.onError?.(error);
                return null;
            }
            buildId = match[1];
        }

        const easBuild: EasBuildState = {
            buildId,
            platform,
            status: 'pending',
            startedAt: Date.now(),
        };

        deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild });
        callbacks?.onStatus?.(easBuild);
        callbacks?.scheduleAlarm?.(EAS_POLL_INTERVAL_MS);

        logger.info('EAS build triggered successfully', { buildId, platform });
        return easBuild;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('EAS build trigger error', { error: message });
        callbacks?.onError?.(message);
        return null;
    }
}

/**
 * Poll the status of an active EAS build.
 * Called from the alarm handler. Returns whether polling should continue.
 */
async function pollEasBuildStatus(
    deps: EasBuildDeps,
    expoToken: string,
    callbacks?: EasBuildPollCallbacks
): Promise<boolean> {
    const state = deps.stateManager.getState();
    const logger = deps.getLogger();
    const easBuild = state.easBuild;

    if (!easBuild || !state.sandboxInstanceId) {
        logger.info('No active EAS build to poll');
        return false;
    }

    // Check timeout
    const elapsed = Date.now() - easBuild.startedAt;
    if (elapsed > EAS_MAX_POLL_DURATION_MS) {
        const error = 'EAS build timed out after 30 minutes';
        logger.error(error, { buildId: easBuild.buildId });
        const timedOutBuild: EasBuildState = { ...easBuild, status: 'errored', error };
        deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: timedOutBuild });
        callbacks?.onError?.(easBuild.buildId, easBuild.platform, error);
        return false;
    }

    try {
        // Poll build status via Expo GraphQL API directly (no sandbox/CLI dependency)
        const gqlQuery = `query { builds { byId(buildId: "${easBuild.buildId}") { id status platform artifacts { buildUrl applicationArchiveUrl } error { message errorCode } } } }`;
        const gqlResponse = await fetch('https://api.expo.dev/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${expoToken}`,
            },
            body: JSON.stringify({ query: gqlQuery }),
        });

        if (!gqlResponse.ok) {
            const failures = (easBuild.pollFailures || 0) + 1;
            logger.warn('EAS build status API call failed', { status: gqlResponse.status, failures });
            if (failures >= EAS_MAX_POLL_FAILURES) {
                const error = `EAS build polling stopped after ${failures} consecutive failures: HTTP ${gqlResponse.status}`;
                const failedBuild: EasBuildState = { ...easBuild, status: 'errored', error, pollFailures: failures };
                deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: failedBuild });
                callbacks?.onError?.(easBuild.buildId, easBuild.platform, error);
                return false;
            }
            const updatedBuild: EasBuildState = { ...easBuild, pollFailures: failures };
            deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: updatedBuild });
            callbacks?.scheduleAlarm?.(EAS_POLL_INTERVAL_MS);
            return true;
        }

        const gqlData = await gqlResponse.json() as { data?: { builds?: { byId?: Record<string, any> } }; errors?: Array<{ message: string }> };
        const buildData = gqlData.data?.builds?.byId;

        if (!buildData || gqlData.errors?.length) {
            const failures = (easBuild.pollFailures || 0) + 1;
            const errMsg = gqlData.errors?.[0]?.message || 'Build not found';
            logger.warn('EAS build status query failed', { error: errMsg, failures });
            if (failures >= EAS_MAX_POLL_FAILURES) {
                const error = `EAS build polling stopped after ${failures} failures: ${errMsg}`;
                const failedBuild: EasBuildState = { ...easBuild, status: 'errored', error, pollFailures: failures };
                deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: failedBuild });
                callbacks?.onError?.(easBuild.buildId, easBuild.platform, error);
                return false;
            }
            const updatedBuild: EasBuildState = { ...easBuild, pollFailures: failures };
            deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: updatedBuild });
            callbacks?.scheduleAlarm?.(EAS_POLL_INTERVAL_MS);
            return true;
        }

        const buildStatus = (buildData.status as string || '').toLowerCase();

        logger.info('EAS build status', { buildId: easBuild.buildId, status: buildStatus });

        if (buildStatus === 'finished') {
            const artifactUrl = buildData.artifacts?.buildUrl || buildData.artifacts?.applicationArchiveUrl;
            const completedBuild: EasBuildState = {
                ...easBuild,
                status: 'finished',
                easArtifactUrl: artifactUrl,
            };
            deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: completedBuild });

            if (artifactUrl) {
                // Download and store in R2
                const stored = await downloadAndStoreArtifact(
                    deps,
                    artifactUrl,
                    easBuild.buildId,
                    easBuild.platform
                );
                if (stored) {
                    const finalBuild: EasBuildState = { ...completedBuild, artifactUrl: stored };
                    deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: finalBuild });
                    callbacks?.onComplete?.(finalBuild);
                } else {
                    callbacks?.onComplete?.(completedBuild);
                }
            } else {
                callbacks?.onComplete?.(completedBuild);
            }
            return false;
        }

        if (buildStatus === 'errored' || buildStatus === 'canceled') {
            const error = buildData.error?.message || `Build ${buildStatus}`;
            const failedBuild: EasBuildState = { ...easBuild, status: 'errored', error };
            deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: failedBuild });
            callbacks?.onError?.(easBuild.buildId, easBuild.platform, error);
            return false;
        }

        // Still building (pending, in-progress, etc.)
        const updatedBuild: EasBuildState = {
            ...easBuild,
            status: (buildStatus === 'in-progress' || buildStatus === 'pending') ? buildStatus as 'in-progress' | 'pending' : easBuild.status,
            pollFailures: 0,
        };
        deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: updatedBuild });
        callbacks?.onStatus?.(updatedBuild);
        callbacks?.scheduleAlarm?.(EAS_POLL_INTERVAL_MS);
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failures = (easBuild.pollFailures || 0) + 1;
        logger.warn('EAS build poll error', { error: message, failures });
        if (failures >= EAS_MAX_POLL_FAILURES) {
            const errorMsg = `EAS build polling stopped after ${failures} consecutive failures: ${message}`;
            const failedBuild: EasBuildState = { ...easBuild, status: 'errored', error: errorMsg, pollFailures: failures };
            deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: failedBuild });
            callbacks?.onError?.(easBuild.buildId, easBuild.platform, errorMsg);
            return false;
        }
        const updatedBuild: EasBuildState = { ...easBuild, pollFailures: failures };
        deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: updatedBuild });
        callbacks?.scheduleAlarm?.(EAS_POLL_INTERVAL_MS);
        return true;
    }
}

/**
 * Download an EAS build artifact and store it in R2.
 * Returns the R2 object key, or null on failure.
 */
async function downloadAndStoreArtifact(
    deps: EasBuildDeps,
    easArtifactUrl: string,
    buildId: string,
    platform: EasBuildPlatform
): Promise<string | null> {
    const logger = deps.getLogger();
    const extension = platform === 'ios' ? 'ipa' : 'apk';
    const agentId = deps.getAgentId();
    const r2Key = `eas-builds/${agentId}/${buildId}.${extension}`;

    try {
        logger.info('Downloading EAS artifact', { easArtifactUrl, r2Key });

        const response = await fetch(easArtifactUrl);
        if (!response.ok) {
            logger.error('Failed to download EAS artifact', { status: response.status });
            return null;
        }

        const data = await response.arrayBuffer();
        const contentType = platform === 'ios' ? 'application/octet-stream' : 'application/vnd.android.package-archive';

        await deps.env.R2_BUCKET.put(r2Key, data, {
            httpMetadata: { contentType },
            customMetadata: {
                buildId,
                platform,
                agentId,
                createdAt: new Date().toISOString(),
            },
        });

        logger.info('EAS artifact stored in R2', { r2Key, size: data.byteLength });
        return r2Key;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Failed to store EAS artifact in R2', { error: message });
        return null;
    }
}

/**
 * Schedule an EAS build poll using the Agent framework's scheduling system.
 * This avoids conflicts with the framework's internal alarm management --
 * Cloudflare DOs only support one alarm at a time, and raw setAlarm() calls
 * get overwritten by the framework's _scheduleNextAlarm().
 *
 * @param scheduleCallback - The agent's this.schedule() bound method
 * @param logger - Logger instance
 * @param delayMs - Delay in milliseconds before next poll
 */
function scheduleEasBuildPoll(
    scheduleCallback: (delaySeconds: number, handler: string) => Promise<void>,
    logger: StructuredLogger,
    delayMs: number
): void {
    const delaySeconds = Math.ceil(delayMs / 1000);
    scheduleCallback(delaySeconds, 'onEasBuildPoll').catch(err => {
        logger.error('Failed to schedule EAS build poll', err);
    });
}

/**
 * Scheduled callback for EAS build status polling.
 * Called by the Agent framework's schedule system.
 *
 * @param deps - EAS build dependencies
 * @param getDecryptedSecret - Function to retrieve decrypted secrets from vault
 * @param callbacks - Callbacks for broadcasting status/completion/error via WebSocket
 */
async function onEasBuildPoll(
    deps: EasBuildDeps,
    getDecryptedSecret: (query: { envVarName: string }) => Promise<string | null>,
    callbacks: OnEasBuildPollCallbacks
): Promise<void> {
    const easBuild = deps.stateManager.getState().easBuild;
    if (!easBuild || (easBuild.status !== 'pending' && easBuild.status !== 'in-progress')) {
        return;
    }

    const logger = deps.getLogger();
    logger.info('EAS build poll triggered', { buildId: easBuild.buildId });

    // Retrieve EXPO_TOKEN: try vault first, fall back to sandbox-persisted token
    // (vault session may expire after DO hibernation between poll intervals)
    let expoToken = await getDecryptedSecret({ envVarName: 'EXPO_TOKEN' });
    if (!expoToken) {
        logger.info('Vault token unavailable during poll, trying sandbox fallback');
        expoToken = await getExpoTokenFromSandbox(deps);
    }
    if (!expoToken) {
        logger.error('EXPO_TOKEN not found during EAS poll (vault + sandbox fallback)');
        const errorBuild = { ...easBuild, status: 'errored' as const, error: 'EXPO_TOKEN not available' };
        deps.stateManager.setState({ ...deps.stateManager.getState(), easBuild: errorBuild });
        callbacks.onError(
            easBuild.buildId,
            easBuild.platform,
            'EXPO_TOKEN not available. Please unlock your vault or reconfigure your Expo token.',
        );
        return;
    }

    await pollEasBuildStatus(deps, expoToken, {
        onStatus: callbacks.onStatus,
        onComplete: callbacks.onComplete,
        onError: callbacks.onError,
        scheduleAlarm: callbacks.scheduleAlarm,
    });
}

/**
 * Get the current EAS build state from agent state.
 */
function getEasBuildState(deps: EasBuildDeps): EasBuildState | undefined {
    return deps.stateManager.getState().easBuild;
}

export const EasBuildManager = {
    getExpoTokenFromSandbox,
    triggerEasBuild,
    pollEasBuildStatus,
    downloadAndStoreArtifact,
    scheduleEasBuildPoll,
    onEasBuildPoll,
    getEasBuildState,
    EAS_POLL_INTERVAL_MS,
    EAS_MAX_POLL_DURATION_MS,
    EAS_MAX_POLL_FAILURES,
};
