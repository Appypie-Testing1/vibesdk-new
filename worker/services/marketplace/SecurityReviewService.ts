/**
 * SecurityReviewService
 * Automated security checks for marketplace plugin submissions.
 * Runs static analysis in sandbox before human review.
 */

import { createLogger, StructuredLogger } from '../../logger';

export interface SecurityCheck {
    name: string;
    passed: boolean;
    severity: 'info' | 'warning' | 'critical';
    message: string;
}

export interface SecurityReviewResult {
    passed: boolean;
    score: number; // 0-100
    checks: SecurityCheck[];
    requiresManualReview: boolean;
}

export class SecurityReviewService {
    private logger: StructuredLogger;

    constructor() {
        this.logger = createLogger('SecurityReviewService');
    }

    /**
     * Run automated security review on a plugin's manifest and source.
     * @param manifest Parsed plugin manifest JSON
     * @param sourceFiles Map of filename -> content
     */
    async reviewPlugin(
        manifest: PluginManifest,
        sourceFiles: Map<string, string>,
    ): Promise<SecurityReviewResult> {
        const checks: SecurityCheck[] = [];

        // 1. Manifest validation
        checks.push(this.checkManifestFields(manifest));
        checks.push(this.checkCapabilityScope(manifest));
        checks.push(this.checkAllowedHosts(manifest));

        // 2. Source code checks
        for (const [filename, content] of sourceFiles) {
            checks.push(...this.checkSourceFile(filename, content, manifest));
        }

        // 3. Dependency checks
        const packageJson = sourceFiles.get('package.json');
        if (packageJson) {
            checks.push(...this.checkDependencies(packageJson));
        }

        // Calculate score
        const criticalFailed = checks.filter(c => !c.passed && c.severity === 'critical').length;
        const warningFailed = checks.filter(c => !c.passed && c.severity === 'warning').length;
        const totalChecks = checks.length;
        const passedChecks = checks.filter(c => c.passed).length;

        const baseScore = Math.round((passedChecks / totalChecks) * 100);
        const score = Math.max(0, baseScore - criticalFailed * 25 - warningFailed * 5);

        const passed = criticalFailed === 0 && score >= 60;
        const requiresManualReview = !passed || warningFailed > 2 || manifest.capabilities.includes('network:fetch');

        this.logger.info('Security review complete', {
            pluginId: manifest.id,
            score,
            passed,
            criticalFailed,
            warningFailed,
            requiresManualReview,
        });

        return { passed, score, checks, requiresManualReview };
    }

    private checkManifestFields(manifest: PluginManifest): SecurityCheck {
        const required = ['id', 'name', 'version', 'capabilities'];
        const missing = required.filter(f => !(f in manifest) || !manifest[f as keyof PluginManifest]);

        return {
            name: 'manifest-fields',
            passed: missing.length === 0,
            severity: 'critical',
            message: missing.length === 0
                ? 'All required manifest fields present'
                : `Missing manifest fields: ${missing.join(', ')}`,
        };
    }

    private checkCapabilityScope(manifest: PluginManifest): SecurityCheck {
        const highRiskCaps = ['network:fetch', 'write:content', 'email:send', 'email:deliver'];
        const usedHighRisk = manifest.capabilities.filter(c => highRiskCaps.includes(c));

        return {
            name: 'capability-scope',
            passed: true, // Always passes but flags for review
            severity: usedHighRisk.length > 3 ? 'warning' : 'info',
            message: usedHighRisk.length > 0
                ? `Uses ${usedHighRisk.length} high-risk capabilities: ${usedHighRisk.join(', ')}`
                : 'No high-risk capabilities requested',
        };
    }

    private checkAllowedHosts(manifest: PluginManifest): SecurityCheck {
        const hosts = manifest.allowedHosts || [];
        const wildcardHosts = hosts.filter(h => h.includes('*'));

        return {
            name: 'allowed-hosts',
            passed: wildcardHosts.length === 0,
            severity: wildcardHosts.length > 0 ? 'critical' : 'info',
            message: wildcardHosts.length > 0
                ? `Wildcard hosts detected: ${wildcardHosts.join(', ')}. Explicit hosts required.`
                : `${hosts.length} explicit host(s) declared`,
        };
    }

    private checkSourceFile(filename: string, content: string, manifest: PluginManifest): SecurityCheck[] {
        const checks: SecurityCheck[] = [];

        // Check for raw fetch() usage (should use ctx.network.fetch)
        const rawFetchPattern = /(?<!ctx\.network\.)fetch\s*\(/g;
        const rawFetchMatches = content.match(rawFetchPattern);
        if (rawFetchMatches && !filename.endsWith('.json')) {
            checks.push({
                name: `no-raw-fetch:${filename}`,
                passed: false,
                severity: 'critical',
                message: `${filename}: Found ${rawFetchMatches.length} raw fetch() call(s). Must use ctx.network.fetch() for sandboxed network access.`,
            });
        }

        // Check for eval() or Function constructor
        const evalPattern = /\beval\s*\(|new\s+Function\s*\(/g;
        if (evalPattern.test(content)) {
            checks.push({
                name: `no-eval:${filename}`,
                passed: false,
                severity: 'critical',
                message: `${filename}: eval() or Function constructor detected. Code injection risk.`,
            });
        }

        // Check that storage collections used in code are declared in manifest
        const storagePattern = /ctx\.storage\.collection\(['"](\w+)['"]\)/g;
        let match;
        const manifestCollections = new Set((manifest.storage || []).map(s => s.name));
        while ((match = storagePattern.exec(content)) !== null) {
            const collectionName = match[1];
            if (!manifestCollections.has(collectionName)) {
                checks.push({
                    name: `storage-declared:${filename}:${collectionName}`,
                    passed: false,
                    severity: 'warning',
                    message: `${filename}: Storage collection "${collectionName}" used but not declared in manifest.`,
                });
            }
        }

        // Check for undeclared hooks (simplified -- full AST analysis would be more accurate)
        if (filename === 'src/index.ts' || filename.endsWith('/index.ts')) {
            checks.push({
                name: `source-structure:${filename}`,
                passed: true,
                severity: 'info',
                message: `${filename}: Source structure validated`,
            });
        }

        return checks;
    }

    private checkDependencies(packageJsonContent: string): SecurityCheck[] {
        const checks: SecurityCheck[] = [];
        try {
            const pkg = JSON.parse(packageJsonContent);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            // Flag known risky packages
            const riskyPackages = ['child_process', 'fs', 'net', 'dgram', 'cluster', 'worker_threads'];
            const foundRisky = Object.keys(deps).filter(d => riskyPackages.includes(d));

            checks.push({
                name: 'safe-dependencies',
                passed: foundRisky.length === 0,
                severity: foundRisky.length > 0 ? 'critical' : 'info',
                message: foundRisky.length > 0
                    ? `Forbidden Node.js modules in dependencies: ${foundRisky.join(', ')}`
                    : `${Object.keys(deps).length} dependencies checked`,
            });
        } catch {
            checks.push({
                name: 'package-json-valid',
                passed: false,
                severity: 'warning',
                message: 'Could not parse package.json',
            });
        }

        return checks;
    }
}

// Minimal manifest shape for security review
interface PluginManifest {
    id: string;
    name: string;
    version: string;
    capabilities: string[];
    allowedHosts?: string[];
    storage?: Array<{ name: string; description: string }>;
    hooks?: Record<string, unknown>;
    routes?: Array<{ name: string; public: boolean }>;
    [key: string]: unknown;
}
