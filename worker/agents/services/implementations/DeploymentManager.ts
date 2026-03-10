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
import { DeploymentTarget } from '../../core/types';
import { BaseProjectState } from '../../core/state';

const PER_ATTEMPT_TIMEOUT_MS = 60000;  // 60 seconds per individual attempt
const MASTER_DEPLOYMENT_TIMEOUT_MS = 300000;  // 5 minutes total
const HEALTH_CHECK_INTERVAL_MS = 30000;

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
            if (state.templateRenderMode === 'mobile') {
                await this.ensureMetroConfig(sandboxInstanceId);
                await this.autoInstallMissingDependencies(sandboxInstanceId);
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
        if (renderMode === 'mobile') {
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
  env: { ...process.env, PORT: String(INTERNAL_PORT) },
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
        'react-native-worklets': '~0.5.0',
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

        // Mobile (Expo/React Native) projects cannot be deployed to Cloudflare Workers.
        // They don't have wrangler.jsonc or a Worker entry point.
        if (state.templateRenderMode === 'mobile') {
            logger.info('Skipping Cloudflare deployment for mobile project');
            callbacks?.onError?.({
                message: 'Mobile apps cannot be deployed to Cloudflare Workers. Use Expo Go or EAS Build to distribute your app.',
                instanceId: state.sandboxInstanceId ?? '',
                error: 'Mobile projects are not supported for Cloudflare Workers deployment'
            });
            return { deploymentUrl: null };
        }

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
        const deploymentResult = await client.deployToCloudflareWorkers(
            state.sandboxInstanceId,
            target
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

}
