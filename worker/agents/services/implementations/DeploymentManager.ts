import {
    IDeploymentManager,
    DeploymentParams,
    DeploymentResult,
    SandboxDeploymentCallbacks,
    CloudflareDeploymentCallbacks
} from '../interfaces/IDeploymentManager';
import { BootstrapResponse, StaticAnalysisResponse, RuntimeError, PreviewType } from '../../../services/sandbox/sandboxTypes';
import { FileOutputType } from '../../schemas';
import { generateId } from '../../../utils/idGenerator';
import { generateAppProxyToken, generateAppProxyUrl } from '../../../services/aigateway-proxy/controller';
import { BaseAgentService } from './BaseAgentService';
import { ServiceOptions } from '../interfaces/IServiceOptions';
import { BaseSandboxService } from 'worker/services/sandbox/BaseSandboxService';
import { getSandboxService } from '../../../services/sandbox/factory';
import { validateAndCleanBootstrapCommands } from 'worker/agents/utils/common';
import { DeploymentTarget, EasBuildPlatform, EasBuildState } from '../../core/types';
import { BaseProjectState } from '../../core/state';
import { getPreviewDomain, getProtocolForHost } from '../../../utils/urls';

const PER_ATTEMPT_TIMEOUT_MS = 60000;  // 60 seconds per individual attempt
const MASTER_DEPLOYMENT_TIMEOUT_MS = 300000;  // 5 minutes total
const HEALTH_CHECK_INTERVAL_MS = 30000;

// Standalone api-client.ts for EAS builds (reads apiUrl from app.json extra)
const EAS_API_CLIENT_TEMPLATE = `import { Platform } from 'react-native';
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

/**
 * Normalize PEM content that may have had newlines stripped (e.g. pasted into a single-line input).
 * Ensures proper PEM format with header/footer on their own lines and 64-char base64 lines.
 */
function normalizePemContent(raw: string): string {
    const trimmed = raw.trim();
    // If it already has proper newlines after the header, return as-is
    if (trimmed.startsWith('-----BEGIN') && trimmed.indexOf('\n') < trimmed.indexOf('-----', 10)) {
        return trimmed + '\n';
    }

    // Extract header, body, footer from potentially single-line PEM
    const headerMatch = trimmed.match(/^(-----BEGIN [A-Z ]+-----)\s*/);
    const footerMatch = trimmed.match(/\s*(-----END [A-Z ]+-----)$/);
    if (!headerMatch || !footerMatch) {
        return trimmed + '\n';
    }

    const header = headerMatch[1];
    const footer = footerMatch[1];
    const body = trimmed
        .slice(headerMatch[0].length, trimmed.length - footerMatch[0].length)
        .replace(/\s+/g, '');

    // Re-wrap base64 body at 64 characters per line (PEM standard)
    const lines: string[] = [header];
    for (let i = 0; i < body.length; i += 64) {
        lines.push(body.slice(i, i + 64));
    }
    lines.push(footer);
    return lines.join('\n') + '\n';
}

/**
 * Manages deployment operations for sandbox instances
 * Handles instance creation, file deployment, analysis, and GitHub/Cloudflare export
 * Also manages sessionId and health check intervals
 */
export class DeploymentManager extends BaseAgentService<BaseProjectState> implements IDeploymentManager {
    private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
    private currentDeploymentPromise: Promise<PreviewType | null> | null = null;
    private cachedSandboxClient: BaseSandboxService | null = null;

    constructor(
        options: ServiceOptions<BaseProjectState>,
        private maxCommandsHistory: number,
    ) {
        super(options);
        
        // Ensure state has sessionId
        const state = this.getState();
        if (!state.sessionId) {
            this.setState({
                ...state,
                sessionId: DeploymentManager.generateNewSessionId()
            });
        }
    }

    /**
     * Get current session ID from state
     */
    getSessionId(): string {
        return this.getState().sessionId;
    }

    /**
     * Cache is tied to current sessionId and invalidated on reset
     */
    public getClient(): BaseSandboxService {
        if (!this.cachedSandboxClient) {
            const logger = this.getLog();
            logger.info('Creating sandbox service client', { 
                sessionId: this.getSessionId(), 
                agentId: this.getAgentId() 
            });
            this.cachedSandboxClient = getSandboxService(
                this.getSessionId(), 
                this.getAgentId()
            );
        }
        return this.cachedSandboxClient;
    }

    /**
     * Reset session ID (called on timeout or specific errors)
     */
    resetSessionId(): void {
        const logger = this.getLog();
        const state = this.getState();
        const oldSessionId = state.sessionId;
        const newSessionId = DeploymentManager.generateNewSessionId();
        
        logger.info(`SessionId reset: ${oldSessionId} → ${newSessionId}`);
        
        // Reset session ID in logger
        logger.setFields({
            sessionId: newSessionId,
        });
        // Invalidate cached sandbox client (tied to old sessionId)
        this.cachedSandboxClient = null;
        
        // Update state
        this.setState({
            ...state,
            sessionId: newSessionId,
            sandboxInstanceId: undefined  // Clear instance on session reset
        });
    }

    static generateNewSessionId(): string {
        return generateId();
    }

    /**
     * Wait for preview to be ready
     */
    async waitForPreview(): Promise<void> {
        const state = this.getState();
        const logger = this.getLog();
        
        logger.info("Waiting for preview");
        
        if (!state.sandboxInstanceId) {
            logger.info("No sandbox instance, will create during next deploy");
        }
        
        logger.info("Waiting for preview completed");
    }

    /**
     * Execute setup commands (used during redeployment)
     * @param onAfterCommands Optional callback invoked after commands complete (e.g., for syncing package.json)
     */
    async executeSetupCommands(
        sandboxInstanceId: string, 
        timeoutMs: number = 60000,
        onAfterCommands?: () => Promise<void>
    ): Promise<void> {
        const { commandsHistory } = this.getState();
        const logger = this.getLog();
        const client = this.getClient();
        
        if (!commandsHistory || commandsHistory.length === 0) {
            return;
        }

        // CRITICAL: Audit bootstrap commands before execution (safety net)
        const { validCommands, invalidCommands } = validateAndCleanBootstrapCommands(
            commandsHistory, 
            this.maxCommandsHistory
        );
        
        if (invalidCommands.length > 0) {
            logger.warn('[commands] DANGEROUS COMMANDS DETECTED IN BOOTSTRAP - FILTERED OUT', {
                dangerous: invalidCommands,
                dangerousCount: invalidCommands.length,
                validCount: validCommands.length
            });
        }
        
        if (validCommands.length === 0) {
            logger.warn('[commands] No valid commands to execute after filtering');
            return;
        }

        logger.info(`[commands] Executing ${validCommands.length} validated setup commands on instance ${sandboxInstanceId}`);

        await this.withTimeout(
            client.executeCommands(sandboxInstanceId, validCommands),
            timeoutMs,
            'Command execution timed out'
        );
        
        logger.info('Setup commands executed successfully');
        
        // Invoke callback if provided (e.g., for package.json sync)
        if (onAfterCommands) {
            logger.info('Invoking post-command callback');
            await onAfterCommands();
        }
    }

    /**
     * Start health check interval for instance
     */
    private startHealthCheckInterval(instanceId: string): void {
        const logger = this.getLog();
        
        // Clear any existing interval
        this.clearHealthCheckInterval();
        
        logger.info(`Starting health check interval for instance ${instanceId}`);
        
        this.healthCheckInterval = setInterval(async () => {
            try {
                const client = this.getClient();
                const status = await client.getInstanceStatus(instanceId);
                
                if (!status.success || !status.isHealthy) {
                    logger.warn(`Instance ${instanceId} unhealthy, triggering redeploy`);
                    this.clearHealthCheckInterval();
                    
                    // Trigger redeploy to recover from unhealthy state
                    try {
                        await this.deployToSandbox();
                        logger.info('Instance redeployed successfully after health check failure');
                    } catch (redeployError) {
                        logger.error('Failed to redeploy after health check failure:', redeployError);
                    }
                }
            } catch (error) {
                logger.error('Health check failed:', error);
            }
        }, HEALTH_CHECK_INTERVAL_MS);
    }

    private clearHealthCheckInterval(): void {
        if (this.healthCheckInterval !== null) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Run static analysis (lint + typecheck) on code
     */
    async runStaticAnalysis(files?: string[]): Promise<StaticAnalysisResponse> {
        const { sandboxInstanceId } = this.getState();

        if (!sandboxInstanceId) {
            throw new Error('No sandbox instance available for static analysis');
        }

        const logger = this.getLog();
        const client = this.getClient();

        logger.info(`Linting code in sandbox instance ${sandboxInstanceId}`);

        const targetFiles = Array.isArray(files) && files.length > 0
            ? files
            : this.fileManager.getGeneratedFilePaths();

        const analysisResponse = await client.runStaticAnalysisCode(
            sandboxInstanceId,
            targetFiles
        );

        if (!analysisResponse || analysisResponse.error) {
            const errorMsg = `Code linting failed: ${analysisResponse?.error || 'Unknown error'}`;
            logger.error(errorMsg, { fullResponse: analysisResponse });
            throw new Error(errorMsg);
        }

        const { lint, typecheck } = analysisResponse;
        const { issues: lintIssues, summary: lintSummary } = lint;
        const { issues: typeCheckIssues, summary: typeCheckSummary } = typecheck;

        logger.info(`Linting found ${lintIssues.length} issues: ` +
            `${lintSummary?.errorCount || 0} errors, ` +
            `${lintSummary?.warningCount || 0} warnings, ` +
            `${lintSummary?.infoCount || 0} info`);

        logger.info(`Type checking found ${typeCheckIssues.length} issues: ` +
            `${typeCheckSummary?.errorCount || 0} errors, ` +
            `${typeCheckSummary?.warningCount || 0} warnings, ` +
            `${typeCheckSummary?.infoCount || 0} info`);

        return analysisResponse;
    }

    /**
     * Fetch runtime errors from sandbox instance
     */
    async fetchRuntimeErrors(clear: boolean = true): Promise<RuntimeError[]> {
        const { sandboxInstanceId } = this.getState();
        if (!sandboxInstanceId) {
            throw new Error('No sandbox instance available for runtime error fetching');
        }
        const logger = this.getLog();
        const client = this.getClient();

        const resp = await client.getInstanceErrors(sandboxInstanceId, clear);
            
        if (!resp || !resp.success) {
            throw new Error(`Failed to fetch runtime errors: ${resp?.error || 'Unknown error'}`);
        }

        const errors = resp.errors || [];
            
        if (errors.length > 0) {
            logger.info(`Found ${errors.length} runtime errors: ${errors.map(e => e.message).join(', ')}`);
        }

        return errors;
    }

    /**
     * Main deployment method
     * Callbacks allow agent to broadcast at the right times
     * All concurrent callers share the same promise and wait together
     * Retries indefinitely until success or master timeout (5 minutes)
     */
    async deployToSandbox(
        files: FileOutputType[] = [],
        redeploy: boolean = false,
        commitMessage?: string,
        clearLogs: boolean = false,
        callbacks?: SandboxDeploymentCallbacks
    ): Promise<PreviewType | null> {
        const logger = this.getLog();
        
        // All concurrent callers wait on the same promise
        if (this.currentDeploymentPromise) {
            logger.info('Deployment already in progress, waiting for completion');
            return await this.withTimeout(
                this.currentDeploymentPromise,
                MASTER_DEPLOYMENT_TIMEOUT_MS,
                'Deployment failed after 5 minutes'
            ).catch(() => null);  // Convert timeout to null like first caller
        }

        logger.info("Deploying to sandbox", { files: files.length, redeploy, commitMessage, sessionId: this.getSessionId() });

        // Create deployment promise
        this.currentDeploymentPromise = this.executeDeploymentWithRetry(
            files,
            redeploy,
            commitMessage,
            clearLogs,
            callbacks
        );

        try {
            // Master timeout: 5 minutes total
            // This doesn't break the underlying operation - it just stops waiting
            const result = await this.withTimeout(
                this.currentDeploymentPromise,
                MASTER_DEPLOYMENT_TIMEOUT_MS,
                'Deployment failed after 5 minutes of retries'
                // No onTimeout callback - don't break the operation
            );
            return result;
        } catch (error) {
            // Master timeout reached - all retries exhausted
            logger.error('Deployment permanently failed after master timeout:', error);
            return null;
        } finally {
            this.currentDeploymentPromise = null;
        }
    }

    /**
     * Execute deployment with infinite retry until success
     * Each attempt has its own timeout
     * Resets sessionId after consecutive failures
     */
    private async executeDeploymentWithRetry(
        files: FileOutputType[],
        redeploy: boolean,
        commitMessage: string | undefined,
        clearLogs: boolean,
        callbacks?: SandboxDeploymentCallbacks
    ): Promise<PreviewType> {
        const logger = this.getLog();
        let attempt = 0;
        const maxAttemptsBeforeSessionReset = 3;
        
        while (true) {
            attempt++;
            logger.info(`Deployment attempt ${attempt}`, { sessionId: this.getSessionId() });
            
            try {
                // Callback: deployment starting (only on first attempt)
                callbacks?.onStarted?.({
                    message: "Deploying code to sandbox service",
                    files: files.map(f => ({ filePath: f.filePath }))
                });

                // Core deployment with per-attempt timeout
                const deployPromise = this.deploy({
                    files,
                    redeploy,
                    commitMessage,
                    clearLogs
                });
                
                const result = await this.withTimeout(
                    deployPromise,
                    PER_ATTEMPT_TIMEOUT_MS,
                    `Deployment attempt ${attempt} timed out`
                    // No onTimeout callback - don't break anything
                );

                // Success! Start health check and return
                if (result.redeployed || this.healthCheckInterval === null) {
                    this.startHealthCheckInterval(result.sandboxInstanceId);
                    // Execute setup commands with callback
                    await this.executeSetupCommands(
                        result.sandboxInstanceId,
                        undefined,
                        callbacks?.onAfterSetupCommands
                    );
                }

                const preview = {
                    runId: result.sandboxInstanceId,
                    previewURL: result.previewURL,
                    tunnelURL: result.tunnelURL
                };

                callbacks?.onCompleted?.({
                    message: "Deployment completed",
                    instanceId: preview.runId,
                    previewURL: preview.previewURL ?? '',
                    tunnelURL: preview.tunnelURL ?? ''
                });

                logger.info('Deployment succeeded', { attempt, sessionId: this.getSessionId() });
                return preview;
                
            } catch (error) {
                logger.warn(`Deployment attempt ${attempt} failed:`, error);
                
                const errorMsg = error instanceof Error ? error.message : String(error);

                // Handle specific errors that require session reset
                if (errorMsg.includes('Network connection lost') || 
                    errorMsg.includes('Container service disconnected') || 
                    errorMsg.includes('Internal error in Durable Object storage')) {
                    logger.warn('Session-level error detected, resetting sessionId');
                    this.resetSessionId();
                }
                
                // After consecutive failures, reset session to get fresh sandbox
                if (attempt % maxAttemptsBeforeSessionReset === 0) {
                    logger.warn(`${attempt} consecutive failures, resetting sessionId for fresh sandbox`);
                    this.resetSessionId();
                }
                
                // Clear instance ID from state
                this.setState({
                    ...this.getState(),
                    sandboxInstanceId: undefined
                });

                callbacks?.onError?.({
                    error: `Deployment attempt ${attempt} failed: ${errorMsg}`
                });
                
                // Exponential backoff before retry (capped at 30 seconds)
                const backoffMs = Math.min(1000 * Math.pow(2, Math.min(attempt - 1, 5)), 30000);
                logger.info(`Retrying deployment in ${backoffMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                
                // Loop continues - retry indefinitely until master timeout
            }
        }
    }


    /**
     * Deploy files to sandbox instance (core deployment)
     */
    private async deploy(params: DeploymentParams): Promise<DeploymentResult> {
        const { files, redeploy, commitMessage, clearLogs } = params;
        const logger = this.getLog();
        
        logger.info("Deploying code to sandbox service");

        // Ensure instance exists and is healthy
        const instanceResult = await this.ensureInstance(redeploy);
        const { sandboxInstanceId, previewURL, tunnelURL, redeployed } = instanceResult;

        // Determine which files to deploy
        const filesToWrite = this.getFilesToDeploy(files, redeployed);

        // Write files if any
        if (filesToWrite.length > 0) {
            const writeResponse = await this.getClient().writeFiles(
                sandboxInstanceId,
                filesToWrite,
                commitMessage
            );
            
            if (!writeResponse || !writeResponse.success) {
                logger.error(`File writing failed. Error: ${writeResponse?.error}`);
                throw new Error(`File writing failed. Error: ${writeResponse?.error}`);
            }

            logger.info('Files written to sandbox instance', { instanceId: sandboxInstanceId, files: filesToWrite.map(f => f.filePath) });

            // For Expo/mobile projects:
            // 1. Ensure metro.config.js exists (sanitizes proxy headers to prevent Metro crashes)
            // 2. Auto-install any missing third-party dependencies
            const state = this.getState();
            if (state.templateRenderMode === 'mobile' || state.templateRenderMode === 'mobile-fullstack') {
                await this.ensureMetroConfig(sandboxInstanceId);
                await this.autoInstallMissingDependencies(sandboxInstanceId);
            }

            // Ensure .api-url exists for fullstack mobile projects so the proxy
            // can route /api/* requests. Uses writeFiles (reliable) instead of
            // executeCommands (fire-and-forget). Covers existing projects that
            // were created before .api-url was included in initial files.
            if (state.templateRenderMode === 'mobile-fullstack' || state.templateName === 'expo-fullstack') {
                const previewDomain = getPreviewDomain(this.env);
                const protocol = getProtocolForHost(previewDomain);
                const apiUrl = `${protocol}://${state.projectName}.${previewDomain}`;
                try {
                    await this.getClient().writeFiles(sandboxInstanceId, [
                        { filePath: '.api-url', fileContents: apiUrl }
                    ]);
                    logger.info('Wrote .api-url via writeFiles', { apiUrl });
                } catch (e) {
                    logger.warn('Failed to write .api-url via writeFiles', e);
                }
            }
        }

        // Clear logs if requested
        if (clearLogs) {
            try {
                logger.info('Clearing logs and runtime errors for instance', { instanceId: sandboxInstanceId });
                await Promise.all([
                    this.getClient().getLogs(sandboxInstanceId, true),
                    this.getClient().clearInstanceErrors(sandboxInstanceId)
                ]);
            } catch (error) {
                logger.error('Failed to clear logs and runtime errors', error);
            }
        }

        return {
            sandboxInstanceId,
            previewURL,
            tunnelURL,
            redeployed
        };
    }

    /**
     * Ensure sandbox instance exists and is healthy
     */
    async ensureInstance(redeploy: boolean): Promise<DeploymentResult> {
        if (redeploy) {
            this.resetSessionId();
        }
        const state = this.getState();
        const { sandboxInstanceId } = state;
        const logger = this.getLog();
        const client = this.getClient();

        // Check existing instance
        if (sandboxInstanceId) {
            const status = await client.getInstanceStatus(sandboxInstanceId);
            if (status.success && status.isHealthy) {
                logger.info(`DEPLOYMENT CHECK PASSED: Instance ${sandboxInstanceId} is running`);
                return {
                    sandboxInstanceId,
                    previewURL: status.previewURL,
                    tunnelURL: status.tunnelURL,
                    redeployed: false
                };
            }
            logger.error(`DEPLOYMENT CHECK FAILED: Failed to get status for instance ${sandboxInstanceId}, redeploying...`);
        }

        const results = await this.createNewInstance();
        if (!results || !results.runId || !results.previewURL) {
            throw new Error('Failed to create new deployment');
        }

        // Update state with new instance ID
        this.setState({
            ...this.getState(),
            sandboxInstanceId: results.runId,
        });

        return {
            sandboxInstanceId: results.runId,
            previewURL: results.previewURL,
            tunnelURL: results.tunnelURL,
            redeployed: true
        };
    }


    /**
     * Create new sandbox instance
     */
    private async createNewInstance(): Promise<BootstrapResponse | null> {
        const state = this.getState();
        const projectName = state.projectName;

        // Add AI proxy vars if AI template
        let localEnvVars: Record<string, string> = {};
        if (state.templateName?.includes('agents')) {
            const secret = this.env.AI_PROXY_JWT_SECRET;
            if (typeof secret === 'string' && secret.trim().length > 0) {
                localEnvVars = {
                    "CF_AI_BASE_URL": generateAppProxyUrl(this.env),
                    "CF_AI_API_KEY": await generateAppProxyToken(
                        state.metadata.agentId,
                        state.metadata.userId,
                        this.env
                    )
                };
            }
        }

        // Get latest files and sanitize worker entry point
        const files = DeploymentManager.sanitizeFiles(this.fileManager.getAllFiles(), state.templateRenderMode);

        // For fullstack mobile projects, bake the deployed API URL into app.json
        // so standalone APK/IPA builds can reach the CF Workers API directly.
        // Also include .api-url so the proxy can route /api/* from first boot.
        if (state.templateRenderMode === 'mobile-fullstack' || state.templateName === 'expo-fullstack') {
            const previewDomain = getPreviewDomain(this.env);
            const protocol = getProtocolForHost(previewDomain);
            const apiUrl = `${protocol}://${projectName}.${previewDomain}`;
            const appJsonFile = files.find(f => f.filePath === 'app.json');
            if (appJsonFile) {
                appJsonFile.fileContents = appJsonFile.fileContents
                    .replace(/__API_URL__/g, apiUrl)
                    .replace(/expo-fullstack-app/g, projectName);
            }
            // Write .api-url as a regular file so the sandbox proxy can route
            // /api/* requests immediately. This is more reliable than using
            // executeCommands (fire-and-forget) which can fail silently.
            if (!files.find(f => f.filePath === '.api-url')) {
                files.push({ filePath: '.api-url', fileContents: apiUrl, filePurpose: 'Deployed API URL for proxy routing' });
            }
        }

        this.getLog().info('Files to deploy', {
            files: files.map(f => f.filePath)
        });

        // Create instance
        const client = this.getClient();
        const logger = this.getLog();

        const createResponse = await client.createInstance({
            files,
            projectName,
            initCommand: state.templateInitCommand || 'bun run dev',
            envVars: localEnvVars
        });

        if (!createResponse || !createResponse.success || !createResponse.runId) {
            throw new Error(`Failed to create sandbox instance: ${createResponse?.error || 'Unknown error'}`);
        }

        logger.info(`Created sandbox instance`, {
            runId: createResponse.runId,
            previewURL: createResponse.previewURL
        });

        if (createResponse.runId && createResponse.previewURL) {
            return createResponse;
        }

        throw new Error(`Failed to create sandbox instance: ${createResponse?.error || 'Unknown error'}`);
    }

    /**
     * Sanitize worker entry point to remove patterns that break Hono's router on deployed apps
     * and inject safety measures for common runtime issues.
     *
     * 1. Removes: serveStatic imports/usage, wildcard SPA fallback routes.
     * 2. Replaces: default Hono SmartRouter with LinearRouter (prevents "matcher already built" error).
     * 3. Injects: global error handler (app.onError) if missing.
     */
    private static sanitizeWorkerEntryPoint(contents: string): string {
        let result = contents;

        // Remove serveStatic import line
        result = result.replace(/^import\s*\{[^}]*serveStatic[^}]*\}\s*from\s*['"]hono\/cloudflare-workers['"];?\s*$/gm, '');

        // Remove app.use('/*', serveStatic(...)) or app.use('*', serveStatic(...))
        result = result.replace(/^\s*app\.use\(\s*['"][/*]*['"]\s*,\s*serveStatic\([^)]*\)\s*\);?\s*$/gm, '');

        // Remove wildcard SPA fallback: app.get('*', ...) that references ASSETS or index.html
        result = result.replace(/^\s*app\.get\(\s*['"][*]['"][\s\S]*?(?:ASSETS|index\.html)[\s\S]*?\}\s*\)\s*;?\s*$/gm, '');

        // Replace default Hono SmartRouter with LinearRouter.
        // SmartRouter freezes after first match() call, causing "Can not add a route since
        // the matcher is already built" when @cloudflare/vite-plugin triggers HMR re-evaluation.
        // LinearRouter never freezes and can accept routes at any time.
        if (!result.includes('LinearRouter')) {
            // Add LinearRouter import if not present
            const honoImportMatch = result.match(/^(import\s*\{[^}]*\}\s*from\s*['"]hono['"];?\s*)$/m);
            if (honoImportMatch) {
                result = result.replace(
                    honoImportMatch[0],
                    honoImportMatch[0] + "import { LinearRouter } from 'hono/router/linear-router';\n"
                );
            } else {
                // Hono imported differently (e.g., import { Hono } from 'hono'), prepend LinearRouter import
                const anyHonoImport = result.match(/^(import\s+.*from\s*['"]hono['"];?\s*)$/m);
                if (anyHonoImport) {
                    result = result.replace(
                        anyHonoImport[0],
                        anyHonoImport[0] + "import { LinearRouter } from 'hono/router/linear-router';\n"
                    );
                }
            }

            // Replace `new Hono()` or `new Hono<...>()` with LinearRouter version
            result = result.replace(
                /new\s+Hono\s*(<[^>]*>)?\s*\(\s*\)/g,
                'new Hono$1({ router: new LinearRouter() })'
            );
            // Handle `new Hono({ ...existingOptions })` — inject router if not already there
            result = result.replace(
                /new\s+Hono\s*(<[^>]*>)?\s*\(\s*\{(?![\s\S]*router\s*:)([\s\S]*?)\}\s*\)/g,
                'new Hono$1({ router: new LinearRouter(), $2})'
            );
        }

        // Inject global error handler if missing — prevents unhandled exceptions from
        // returning opaque 500s with no JSON body
        if (!result.includes('.onError(') && !result.includes('.onError (')) {
            const honoInitMatch = result.match(/^(.*new Hono\b[^)]*\)\s*;?\s*)$/m);
            if (honoInitMatch) {
                const errorHandler = `\n// Global error handler (auto-injected safety net)\napp.onError((err, c) => {\n  console.error('Unhandled route error:', err.message);\n  return c.json({ error: err.message || 'Internal Server Error' }, 500);\n});\n`;
                result = result.replace(honoInitMatch[0], honoInitMatch[0] + errorHandler);
            }
        }

        return result;
    }

    /**
     * Sanitize wrangler.jsonc to use Cloudflare-recommended run_worker_first pattern.
     * Replaces `"run_worker_first": true` with `"run_worker_first": ["/api/*"]` which
     * ensures only API requests hit the worker, avoiding router issues in dev mode.
     */
    private static sanitizeWranglerConfig(contents: string): string {
        // Replace run_worker_first: true with the Cloudflare-recommended array pattern
        // This prevents ALL requests from hitting the worker (which triggers Hono router issues)
        return contents.replace(
            /"run_worker_first"\s*:\s*true/g,
            '"run_worker_first": ["/api/*"]'
        );
    }

    /**
     * Fix orphaned closing braces before JSX closing tags in TSX/JSX files.
     * LLMs sometimes generate a stray `}` on the line before or same line as `</tag>`,
     * producing invalid JSX like:
     *   {card.trend}
     *   }</span>
     * This tracks cumulative brace depth to only remove braces that have no matching opener.
     */
    private static sanitizeJsxBraces(content: string): string {
        const lines = content.split('\n');
        const result: string[] = [];
        // Track net brace depth across all lines (only outside strings/templates)
        let braceDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if this line is a stray `}` before a closing JSX tag
            const strayBraceMatch = line.match(/^(\s*)}\s*(<\/\w[^>]*>.*)$/);
            if (strayBraceMatch && braceDepth === 0) {
                // braceDepth is 0 so there's no open `{` for this `}` to close -- remove it
                result.push(strayBraceMatch[1] + strayBraceMatch[2]);
                continue;
            }

            // Update brace depth: count `{` and `}` outside string literals
            // Simple heuristic that avoids counting braces inside quotes
            const stripped = line
                .replace(/`[^`]*`/g, '')       // remove template literals (single-line)
                .replace(/'[^']*'/g, '')        // remove single-quoted strings
                .replace(/"[^"]*"/g, '')        // remove double-quoted strings
                .replace(/\/\/.*$/g, '');       // remove line comments

            const opens = (stripped.match(/\{/g) || []).length;
            const closes = (stripped.match(/\}/g) || []).length;
            braceDepth += opens - closes;
            if (braceDepth < 0) braceDepth = 0; // clamp to avoid drift from multiline strings

            result.push(line);
        }

        return result.join('\n');
    }

    /**
     * Apply worker entry point sanitization to a list of files.
     * Processes Hono worker entry points, wrangler config, and JSX brace fixes.
     */
    private static sanitizeFiles<T extends { filePath: string; fileContents: string }>(files: T[], renderMode?: string): T[] {
        // Skip Vite/Hono sanitization entirely for mobile (Expo) projects
        if (renderMode === 'mobile' || renderMode === 'mobile-fullstack') {
            return files;
        }
        return files.map(file => {
            let contents = file.fileContents;
            let changed = false;

            // Sanitize Hono worker entry points
            if (/^src\/index\.(ts|js)$/.test(file.filePath) && contents.includes('hono')) {
                const sanitized = DeploymentManager.sanitizeWorkerEntryPoint(contents);
                if (sanitized !== contents) {
                    contents = sanitized;
                    changed = true;
                }
            }
            // Sanitize wrangler config to use recommended run_worker_first pattern
            if (/wrangler\.jsonc?$/.test(file.filePath) && contents.includes('run_worker_first')) {
                const sanitized = DeploymentManager.sanitizeWranglerConfig(contents);
                if (sanitized !== contents) {
                    contents = sanitized;
                    changed = true;
                }
            }
            // Fix orphaned JSX braces in TSX/JSX files
            if (/\.(tsx|jsx)$/.test(file.filePath)) {
                const sanitized = DeploymentManager.sanitizeJsxBraces(contents);
                if (sanitized !== contents) {
                    contents = sanitized;
                    changed = true;
                }
            }

            return changed ? { ...file, fileContents: contents } : file;
        });
    }

    /**
     * Determine which files to deploy
     */
    private getFilesToDeploy(
        requestedFiles: FileOutputType[],
        redeployed: boolean
    ): Array<{ filePath: string; fileContents: string }> {
        const state = this.getState();

        // If no files requested or redeploying, use all generated files from state
        if (!requestedFiles || requestedFiles.length === 0 || redeployed) {
            requestedFiles = Object.values(state.generatedFilesMap);
        }

        const files = requestedFiles.map(file => ({
            filePath: file.filePath,
            fileContents: file.fileContents
        }));

        return DeploymentManager.sanitizeFiles(files, state.templateRenderMode);
    }

    /**
     * Extract third-party package names from import/require statements in source files.
     * Handles standard imports, scoped packages (@scope/pkg), and require() calls.
     * Filters out relative imports (./), path aliases (@/), and Node/RN built-ins.
     */
    private static extractThirdPartyPackages(files: Array<{ filePath: string; fileContents: string }>): string[] {
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

    /** Packages pre-installed in the Expo scratch template (no need to auto-install) */
    private static readonly EXPO_PREINSTALLED = new Set([
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
     * Metro config that sanitizes proxy headers to prevent "TypeError: Invalid URL".
     * Metro 0.83.x constructs URLs from x-forwarded-proto + host headers. Behind nested
     * proxies, x-forwarded-proto can contain comma-separated duplicates ("https, https")
     * which produces an invalid base URL.
     */
    private static readonly METRO_CONFIG_CONTENT = `const { getDefaultConfig } = require('expo/metro-config');
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
    private static readonly EXPO_PROXY_CONTENT = `const http = require('http');
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

    /**
     * Ensure metro.config.js and _expo-proxy.cjs exist in the sandbox for mobile projects.
     * Written on every deploy so they're present even for projects created before this fix.
     */
    private async ensureMetroConfig(sandboxInstanceId: string): Promise<void> {
        const logger = this.getLog();
        try {
            await this.getClient().writeFiles(sandboxInstanceId, [
                { filePath: 'metro.config.js', fileContents: DeploymentManager.METRO_CONFIG_CONTENT },
                { filePath: '_expo-proxy.cjs', fileContents: DeploymentManager.EXPO_PROXY_CONTENT },
            ]);
            logger.info('Ensured metro.config.js and _expo-proxy.cjs exist in sandbox');
        } catch (error) {
            logger.warn('Failed to write metro config files (non-blocking)', error);
        }
    }

    /**
     * Canonical template dependencies with pinned versions from the expo-scratch template.
     * Before running `bun install`, these are merged INTO the LLM's package.json so that
     * all template deps (with correct versions) are always present. The LLM frequently
     * drops or changes template dependencies, causing Metro "Unable to resolve module" errors.
     * Using exact versions prevents bun from resolving different transitive dep trees.
     */
    private static readonly EXPO_TEMPLATE_DEPS: Record<string, string> = {
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
        'react-native-worklets': '~0.8.0',
    };
    private static readonly EXPO_TEMPLATE_DEV_DEPS: Record<string, string> = {
        '@babel/core': '^7.25.0',
        '@types/react': '~19.1.0',
        'typescript': '~5.9.0',
    };

    /**
     * Auto-detect and install missing third-party dependencies for Expo projects.
     * 1. Ensures framework-required packages (react-dom) are always installed.
     * 2. Scans all generated files for import statements and installs any third-party
     *    packages not in the template or package.json.
     */
    private async autoInstallMissingDependencies(sandboxInstanceId: string): Promise<void> {
        const logger = this.getLog();
        const state = this.getState();
        const client = this.getClient();

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
                    for (const [pkg, ver] of Object.entries(DeploymentManager.EXPO_TEMPLATE_DEPS)) {
                        pkgJson.dependencies[pkg] = ver;
                    }
                    for (const [pkg, ver] of Object.entries(DeploymentManager.EXPO_TEMPLATE_DEV_DEPS)) {
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
            const knownPackages = new Set(DeploymentManager.EXPO_PREINSTALLED);
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

            const detectedPackages = DeploymentManager.extractThirdPartyPackages(allFiles);
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
     * Deploy to Cloudflare Workers
     * Returns deployment URL and deployment ID for database updates
     */
    async deployToCloudflare(request?: {
        target?: DeploymentTarget;
        callbacks?: CloudflareDeploymentCallbacks;
        buildCommand?: string;
    }): Promise<{ deploymentUrl: string | null; deploymentId?: string }> {
        const state = this.getState();
        const logger = this.getLog();
        const client = this.getClient();
        const target = request?.target ?? 'platform';
        const callbacks = request?.callbacks;
        
        await this.waitForPreview();
        
        callbacks?.onStarted?.({
            message: 'Starting deployment to Appy Pie...',
            instanceId: state.sandboxInstanceId ?? ''
        });
        
        logger.info('Starting Cloudflare deployment', { target });

        // Check if we have generated files
        if (!state.generatedFilesMap || Object.keys(state.generatedFilesMap).length === 0) {
            logger.error('No generated files available for deployment');
            callbacks?.onError?.({
                message: 'Deployment failed: No generated code available',
                instanceId: state.sandboxInstanceId ?? '',
                error: 'No files have been generated yet'
            });
            return { deploymentUrl: null };
        }

        // Ensure sandbox instance exists - return null to trigger agent orchestration
        if (!state.sandboxInstanceId) {
            logger.info('No sandbox instance ID available');
            return { deploymentUrl: null };
        }

        logger.info('Prerequisites met, initiating deployment', {
            sandboxInstanceId: state.sandboxInstanceId,
            fileCount: Object.keys(state.generatedFilesMap).length
        });

        // Deploy to Cloudflare
        const deployOpts = request?.buildCommand ? { buildCommand: request.buildCommand } : undefined;
        const deploymentResult = await client.deployToCloudflareWorkers(
            state.sandboxInstanceId,
            target,
            deployOpts
        );

        logger.info('Deployment result:', deploymentResult);

        if (!deploymentResult || !deploymentResult.success) {
            logger.error('Deployment failed', {
                message: deploymentResult?.message,
                error: deploymentResult?.error
            });

            // Check for preview expired error
            if (deploymentResult?.error?.includes('Failed to read instance metadata') || 
                deploymentResult?.error?.includes(`/bin/sh: 1: cd: can't cd to i-`)) {
                logger.error('Deployment sandbox died - preview expired');
                this.deployToSandbox();
            } else {
                callbacks?.onError?.({
                    message: `Deployment failed: ${deploymentResult?.message || 'Unknown error'}`,
                    instanceId: state.sandboxInstanceId ?? '',
                    error: deploymentResult?.error || 'Unknown deployment error'
                });
            }
            
            return { deploymentUrl: null };
        }

        const deploymentUrl = deploymentResult.deployedUrl;
        const deploymentId = deploymentResult.deploymentId;

        logger.info('Cloudflare deployment completed successfully', {
            deploymentUrl,
            deploymentId,
            message: deploymentResult.message
        });

        // For fullstack mobile projects, write deployed URL so the dev proxy
        // can route /api/* requests to the live Cloudflare Workers backend.
        if (deploymentUrl && (state.templateRenderMode === 'mobile-fullstack' || state.templateName === 'expo-fullstack') && state.sandboxInstanceId) {
            try {
                await client.writeFiles(state.sandboxInstanceId, [
                    { filePath: '.api-url', fileContents: deploymentUrl }
                ]);
                logger.info('Wrote .api-url via writeFiles after CF deploy', { deploymentUrl });
            } catch (err) {
                logger.warn('Failed to write .api-url after CF deploy', err);
            }
        }

        callbacks?.onCompleted?.({
            message: deploymentResult.message || 'Successfully deployed to Appy Pie!',
            instanceId: state.sandboxInstanceId ?? '',
            deploymentUrl: deploymentUrl || ''
        });

        return {
            deploymentUrl: deploymentUrl || null,
            deploymentId: deploymentId
        };
    }

    // ========== EAS BUILD METHODS ==========

    private static readonly EAS_POLL_INTERVAL_MS = 30_000;
    private static readonly EAS_MAX_POLL_DURATION_MS = 30 * 60_000; // 30 minutes
    private static readonly EAS_MAX_POLL_FAILURES = 5;

    /**
     * Retrieve the EXPO_TOKEN stored in the sandbox during triggerEasBuild.
     * Falls back to null if the file doesn't exist or can't be read.
     */
    async getExpoTokenFromSandbox(): Promise<string | null> {
        const state = this.getState();
        if (!state.sandboxInstanceId) return null;
        try {
            const files = await this.getClient().getFiles(state.sandboxInstanceId, ['.expo-token']);
            const content = files.files?.find(f => f.filePath === '.expo-token')?.fileContents?.trim();
            return content || null;
        } catch {
            return null;
        }
    }

    /**
     * Ensure the EAS project is configured in app.json.
     * Clear existing iOS credentials from EAS servers for a project.
     * This removes stale/invalid Distribution Certificates and Build Credentials
     * that block non-interactive builds. EAS CLI will re-create them using the
     * ASC API Key env vars on the next build.
     */
    private async clearIosCredentials(
        projectId: string,
        expoToken: string,
        logger: ReturnType<typeof this.getLog>
    ): Promise<void> {
        const gqlEndpoint = 'https://api.expo.dev/graphql';
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${expoToken}`,
        };

        try {
            // Step 1: Query existing iOS App Credentials for this project
            const queryBody = JSON.stringify({
                query: `query($appId: String!) {
                    app { byId(appId: $appId) {
                        iosAppCredentials {
                            id
                            iosDistributionCertificate { id serialNumber }
                            iosAppBuildCredentialsList { id }
                        }
                    }}
                }`,
                variables: { appId: projectId },
            });

            const queryRes = await fetch(gqlEndpoint, { method: 'POST', headers, body: queryBody });
            if (!queryRes.ok) {
                logger.warn('Failed to query iOS credentials', { status: queryRes.status });
                return;
            }

            const queryData = await queryRes.json() as {
                data?: { app?: { byId?: { iosAppCredentials?: Array<{
                    id: string;
                    iosDistributionCertificate?: { id: string; serialNumber?: string };
                    iosAppBuildCredentialsList?: Array<{ id: string }>;
                }> } } };
                errors?: Array<{ message: string }>;
            };

            const creds = queryData.data?.app?.byId?.iosAppCredentials;
            if (!creds || creds.length === 0) {
                logger.info('No existing iOS credentials to clear');
                return;
            }

            logger.info('Found iOS credentials to clear', {
                count: creds.length,
                hasCert: !!creds[0]?.iosDistributionCertificate,
                buildCredsCount: creds[0]?.iosAppBuildCredentialsList?.length || 0,
            });

            // Step 2: Delete iOS App Build Credentials (links between cert/profile and app)
            for (const cred of creds) {
                for (const buildCred of (cred.iosAppBuildCredentialsList || [])) {
                    const deleteBody = JSON.stringify({
                        query: `mutation($id: ID!) {
                            iosAppBuildCredentials { deleteIosAppBuildCredentials(iosAppBuildCredentialsId: $id) { id } }
                        }`,
                        variables: { id: buildCred.id },
                    });
                    const delRes = await fetch(gqlEndpoint, { method: 'POST', headers, body: deleteBody });
                    if (delRes.ok) {
                        logger.info('Deleted iOS App Build Credentials', { id: buildCred.id });
                    } else {
                        logger.warn('Failed to delete build credentials', { id: buildCred.id, status: delRes.status });
                    }
                }
            }

            logger.info('iOS credential cleanup complete');
        } catch (error) {
            // Non-fatal — the build may still succeed if credentials are valid
            logger.warn('Error clearing iOS credentials (non-fatal)', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Strategy 1: Run `yes | eas init` in the sandbox to auto-accept prompts.
     * Strategy 2: Use Expo REST + GraphQL API to create project and inject projectId.
     * Returns the projectId or a truthy string on success, null on failure.
     */
    private async ensureEasProject(
        sandboxId: string,
        expoToken: string,
        client: BaseSandboxService,
        logger: ReturnType<typeof this.getLog>
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
    async triggerEasBuild(
        platform: EasBuildPlatform,
        expoToken: string,
        ascCredentials?: { teamId: string; teamType: string; ascKeyId: string; ascIssuerId: string; ascApiKeyContent: string },
        callbacks?: {
            onStatus?: (build: EasBuildState) => void;
            onProgress?: (message: string) => void;
            onError?: (error: string) => void;
            scheduleAlarm?: (delayMs: number) => void;
        }
    ): Promise<EasBuildState | null> {
        const state = this.getState();
        const logger = this.getLog();
        const client = this.getClient();

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
            this.setState({ ...this.getState(), easBuild: undefined });
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
            const previewDomain = getPreviewDomain(this.env);
            const protocol = getProtocolForHost(previewDomain);
            const deployedApiUrl = `${protocol}://${state.projectName}.${previewDomain}`;
            const safeSlug = state.projectName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
            const bundleId = 'com.expo.' + safeSlug.replace(/[^a-zA-Z0-9]/g, '');
            logger.info('Preparing EAS build files', { deployedApiUrl, safeSlug, bundleId });

            // Read current files from sandbox — keep originals so we can restore after EAS submit
            const currentFiles = await client.getFiles(state.sandboxInstanceId, ['app.json', 'package.json', '.gitignore', 'lib/api-client.ts', 'eas.json', 'bun.lockb']);
            const appJsonFile = currentFiles.files?.find(f => f.filePath === 'app.json');
            const pkgJsonFile = currentFiles.files?.find(f => f.filePath === 'package.json');
            const gitignoreFile = currentFiles.files?.find(f => f.filePath === '.gitignore');
            const easJsonFile = currentFiles.files?.find(f => f.filePath === 'eas.json');

            // Snapshot original file contents for restoration after EAS build submit
            const originalAppJson = appJsonFile?.fileContents || '';
            const originalPkgJson = pkgJsonFile?.fileContents || '';
            const originalApiClient = currentFiles.files?.find(f => f.filePath === 'lib/api-client.ts')?.fileContents || '';
            const originalEasJson = easJsonFile?.fileContents || '';

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
            const infoPlist = (ios.infoPlist || {}) as Record<string, unknown>;
            if (infoPlist.ITSAppUsesNonExemptEncryption === undefined) {
                infoPlist.ITSAppUsesNonExemptEncryption = false;
            }
            ios.infoPlist = infoPlist;
            appJson.expo.ios = ios;
            const extra = (appJson.expo.extra || {}) as Record<string, unknown>;
            extra.apiUrl = deployedApiUrl;
            appJson.expo.extra = extra;

            // Patch eas.json: set explicit environment and distribution per platform
            let easJson: Record<string, unknown>;
            try {
                easJson = JSON.parse(easJsonFile?.fileContents || '{}');
            } catch {
                easJson = {};
            }
            const build = (easJson.build || {}) as Record<string, Record<string, unknown>>;
            const preview = build.preview || {};
            // Explicit environment prevents EAS from inferring wrong environment
            preview.environment = 'preview';
            if (platform === 'ios') {
                // Use "store" distribution for iOS (internal/ad-hoc requires pre-registered
                // devices which can't be set up in non-interactive mode)
                preview.distribution = 'store';
            }
            build.preview = preview;
            easJson.build = build;

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
                { filePath: 'eas.json', fileContents: JSON.stringify(easJson, null, 2) },
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
            const easProjectResult = await this.ensureEasProject(state.sandboxInstanceId, expoToken, client, logger);
            if (!easProjectResult.success) {
                const error = `EAS project setup failed: ${easProjectResult.error}`;
                logger.error(error);
                callbacks?.onError?.(error);
                return null;
            }

            // For iOS builds, clear any stale/invalid credentials from EAS servers.
            // Previous failed attempts may leave Distribution Certificates in an unvalidated
            // state that blocks non-interactive builds.
            if (platform === 'ios') {
                callbacks?.onProgress?.('Clearing stale iOS credentials...');
                await this.clearIosCredentials(easProjectResult.projectId, expoToken, logger);
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

            if (platform === 'ios' && ascCredentials) {
                // Normalize .p8 PEM content -- vault UI may strip newlines
                const normalizedP8 = normalizePemContent(ascCredentials.ascApiKeyContent);

                // Write .p8 key file and a build script to avoid env var propagation issues
                const scriptLines = [
                    '#!/bin/sh',
                    'set -e',
                    `export EXPO_TOKEN='${expoToken}'`,
                    `export EXPO_APPLE_TEAM_ID='${ascCredentials.teamId}'`,
                    `export EXPO_APPLE_TEAM_TYPE='${ascCredentials.teamType}'`,
                    `export EXPO_ASC_KEY_ID='${ascCredentials.ascKeyId}'`,
                    `export EXPO_ASC_ISSUER_ID='${ascCredentials.ascIssuerId}'`,
                    'export EXPO_ASC_API_KEY_PATH="$(pwd)/.eas-asc-key.p8"',
                    '',
                    `exec bunx eas-cli build --platform ${platform} --profile preview --non-interactive --no-wait --json 2>&1`,
                ].join('\n');

                await client.writeFiles(state.sandboxInstanceId, [
                    { filePath: '.eas-asc-key.p8', fileContents: normalizedP8 },
                    { filePath: '.eas-build.sh', fileContents: scriptLines },
                ]);
                await client.executeCommands(state.sandboxInstanceId, [
                    'chmod +x .eas-build.sh && grep -qxF ".eas-asc-key.p8" .gitignore || echo ".eas-asc-key.p8" >> .gitignore && grep -qxF ".eas-build.sh" .gitignore || echo ".eas-build.sh" >> .gitignore'
                ], 5_000);

                logger.info('iOS ASC credentials configured via build script', {
                    teamId: ascCredentials.teamId,
                    ascKeyId: ascCredentials.ascKeyId,
                    ascIssuerId: ascCredentials.ascIssuerId.slice(0, 8) + '...',
                    keyFileLength: ascCredentials.ascApiKeyContent.length,
                    keyFileStart: ascCredentials.ascApiKeyContent.slice(0, 30),
                });
            }

            const command = platform === 'ios' && ascCredentials
                ? 'sh .eas-build.sh'
                : `EXPO_TOKEN='${expoToken}' bunx eas-cli build --platform ${platform} --profile preview --non-interactive --no-wait --json`;
            const result = await client.executeCommands(state.sandboxInstanceId, [command], 120_000);

            logger.info('EAS build command output', { output: result.results[0]?.output?.slice(0, 2000), error: result.results[0]?.error?.slice(0, 1000) });

            // Clean up ASC key file and build script immediately after EAS CLI finishes
            if (platform === 'ios' && ascCredentials) {
                await client.executeCommands(state.sandboxInstanceId, ['rm -f .eas-asc-key.p8 .eas-build.sh'], 5_000).catch(() => {});
            }

            // Restore original project files so the Metro dev server (web preview) isn't
            // broken by EAS-specific changes (different package versions, patched app.json, etc.)
            try {
                const restoreFiles: { filePath: string; fileContents: string }[] = [];
                if (originalAppJson) restoreFiles.push({ filePath: 'app.json', fileContents: originalAppJson });
                if (originalEasJson) restoreFiles.push({ filePath: 'eas.json', fileContents: originalEasJson });
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
                const rawError = result.results[0]?.error || result.results[0]?.output || result.error || 'EAS build command failed';
                logger.error('EAS build trigger failed', { rawError, platform });
                callbacks?.onError?.(rawError);
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

            this.setState({ ...this.getState(), easBuild });
            callbacks?.onStatus?.(easBuild);
            callbacks?.scheduleAlarm?.(DeploymentManager.EAS_POLL_INTERVAL_MS);

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
    async pollEasBuildStatus(
        expoToken: string,
        callbacks?: {
            onStatus?: (build: EasBuildState) => void;
            onComplete?: (build: EasBuildState) => void;
            onError?: (buildId: string, platform: EasBuildPlatform, error: string) => void;
            scheduleAlarm?: (delayMs: number) => void;
        }
    ): Promise<boolean> {
        const state = this.getState();
        const logger = this.getLog();
        const easBuild = state.easBuild;

        if (!easBuild || !state.sandboxInstanceId) {
            logger.info('No active EAS build to poll');
            return false;
        }

        // Check timeout
        const elapsed = Date.now() - easBuild.startedAt;
        if (elapsed > DeploymentManager.EAS_MAX_POLL_DURATION_MS) {
            const error = 'EAS build timed out after 30 minutes';
            logger.error(error, { buildId: easBuild.buildId });
            const timedOutBuild: EasBuildState = { ...easBuild, status: 'errored', error };
            this.setState({ ...this.getState(), easBuild: timedOutBuild });
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
                if (failures >= DeploymentManager.EAS_MAX_POLL_FAILURES) {
                    const error = `EAS build polling stopped after ${failures} consecutive failures: HTTP ${gqlResponse.status}`;
                    const failedBuild: EasBuildState = { ...easBuild, status: 'errored', error, pollFailures: failures };
                    this.setState({ ...this.getState(), easBuild: failedBuild });
                    callbacks?.onError?.(easBuild.buildId, easBuild.platform, error);
                    return false;
                }
                const updatedBuild: EasBuildState = { ...easBuild, pollFailures: failures };
                this.setState({ ...this.getState(), easBuild: updatedBuild });
                callbacks?.scheduleAlarm?.(DeploymentManager.EAS_POLL_INTERVAL_MS);
                return true;
            }

            const gqlData = await gqlResponse.json() as { data?: { builds?: { byId?: Record<string, any> } }; errors?: Array<{ message: string }> };
            const buildData = gqlData.data?.builds?.byId;

            if (!buildData || gqlData.errors?.length) {
                const failures = (easBuild.pollFailures || 0) + 1;
                const errMsg = gqlData.errors?.[0]?.message || 'Build not found';
                logger.warn('EAS build status query failed', { error: errMsg, failures });
                if (failures >= DeploymentManager.EAS_MAX_POLL_FAILURES) {
                    const error = `EAS build polling stopped after ${failures} failures: ${errMsg}`;
                    const failedBuild: EasBuildState = { ...easBuild, status: 'errored', error, pollFailures: failures };
                    this.setState({ ...this.getState(), easBuild: failedBuild });
                    callbacks?.onError?.(easBuild.buildId, easBuild.platform, error);
                    return false;
                }
                const updatedBuild: EasBuildState = { ...easBuild, pollFailures: failures };
                this.setState({ ...this.getState(), easBuild: updatedBuild });
                callbacks?.scheduleAlarm?.(DeploymentManager.EAS_POLL_INTERVAL_MS);
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
                this.setState({ ...this.getState(), easBuild: completedBuild });

                if (artifactUrl) {
                    // Download and store in R2
                    const stored = await this.downloadAndStoreArtifact(
                        artifactUrl,
                        easBuild.buildId,
                        easBuild.platform
                    );
                    if (stored) {
                        const finalBuild: EasBuildState = { ...completedBuild, artifactUrl: stored };
                        this.setState({ ...this.getState(), easBuild: finalBuild });
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
                const rawError = buildData.error?.message || `Build ${buildStatus}`;
                logger.error('EAS build poll error', { rawError, platform: easBuild.platform, buildId: easBuild.buildId });
                const failedBuild: EasBuildState = { ...easBuild, status: 'errored', error: rawError };
                this.setState({ ...this.getState(), easBuild: failedBuild });
                callbacks?.onError?.(easBuild.buildId, easBuild.platform, rawError);
                return false;
            }

            // Still building (pending, in-progress, etc.)
            const updatedBuild: EasBuildState = {
                ...easBuild,
                status: (buildStatus === 'in-progress' || buildStatus === 'pending') ? buildStatus as 'in-progress' | 'pending' : easBuild.status,
                pollFailures: 0,
            };
            this.setState({ ...this.getState(), easBuild: updatedBuild });
            callbacks?.onStatus?.(updatedBuild);
            callbacks?.scheduleAlarm?.(DeploymentManager.EAS_POLL_INTERVAL_MS);
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const failures = (easBuild.pollFailures || 0) + 1;
            logger.warn('EAS build poll error', { error: message, failures });
            if (failures >= DeploymentManager.EAS_MAX_POLL_FAILURES) {
                const errorMsg = `EAS build polling stopped after ${failures} consecutive failures: ${message}`;
                const failedBuild: EasBuildState = { ...easBuild, status: 'errored', error: errorMsg, pollFailures: failures };
                this.setState({ ...this.getState(), easBuild: failedBuild });
                callbacks?.onError?.(easBuild.buildId, easBuild.platform, errorMsg);
                return false;
            }
            const updatedBuild: EasBuildState = { ...easBuild, pollFailures: failures };
            this.setState({ ...this.getState(), easBuild: updatedBuild });
            callbacks?.scheduleAlarm?.(DeploymentManager.EAS_POLL_INTERVAL_MS);
            return true;
        }
    }

    /**
     * Download an EAS build artifact and store it in R2.
     * Returns the R2 object key, or null on failure.
     */
    async downloadAndStoreArtifact(
        easArtifactUrl: string,
        buildId: string,
        platform: EasBuildPlatform
    ): Promise<string | null> {
        const logger = this.getLog();
        const extension = platform === 'ios' ? 'ipa' : 'apk';
        const agentId = this.getAgentId();
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

            await this.env.R2_BUCKET.put(r2Key, data, {
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
     * Get the current EAS build state from agent state.
     */
    getEasBuildState(): EasBuildState | undefined {
        return this.getState().easBuild;
    }
}
