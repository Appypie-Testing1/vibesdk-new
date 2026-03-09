/**
 * Expo Mobile E2E Integration Test
 *
 * Programmatically creates an Expo/React Native project via the SDK,
 * waits for deployment, then verifies that:
 * 1. The sandbox is running and reachable
 * 2. The web-preview.html is served correctly
 * 3. The Metro web bundle compiles without 500 errors
 * 4. The bundle contains valid JavaScript (not an error page)
 *
 * Run:
 *   VIBESDK_RUN_INTEGRATION_TESTS=1 \
 *   VIBESDK_INTEGRATION_API_KEY=<key> \
 *   VIBESDK_INTEGRATION_BASE_URL=https://vibesnappy.appypie.com \
 *   bun test --timeout 600000 test/integration/expo-mobile.test.ts
 */

import { describe, expect, it, afterAll } from 'bun:test';

import { PhasicClient } from '../../src/phasic';
import { createNodeWebSocketFactory } from '../../src/node';
import type { BuildSession } from '../../src/session';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) {
		throw new Error(
			`Missing ${name}. Create an API key in Settings -> API Keys and run:\n` +
			`  VIBESDK_RUN_INTEGRATION_TESTS=1 ${name}=<key> bun test --timeout 600000 test/integration/expo-mobile.test.ts`,
		);
	}
	return v;
}

function safeWsType(m: unknown): string {
	const t = (m as { type?: unknown })?.type;
	if (typeof t === 'string') return t.length > 120 ? `${t.slice(0, 120)}…` : t;
	try {
		const s = JSON.stringify(t);
		return s.length > 120 ? `${s.slice(0, 120)}…` : s;
	} catch {
		return String(t);
	}
}

/** Build the Metro web bundle URL from a preview base URL. */
function metroBundleUrl(previewUrl: string): string {
	const url = new URL(previewUrl);
	url.pathname = '/node_modules/expo-router/entry.bundle';
	url.search = '?platform=web&dev=true&hot=false&transform.routerRoot=app';
	return url.toString();
}

/** Build the web-preview.html URL from a preview base URL. */
function webPreviewUrl(previewUrl: string): string {
	const url = new URL(previewUrl);
	url.pathname = '/web-preview.html';
	return url.toString();
}

/**
 * Wait for deployment_completed by listening to raw WS messages.
 * In phasic mode for mobile projects, deployment happens during phase_validating.
 * The deployment_completed message may arrive before or after phase_validated.
 * This helper captures it regardless of the phasic flow timing.
 */
function captureDeploymentCompleted(session: BuildSession): Promise<{
	previewURL: string;
	tunnelURL: string;
	instanceId: string;
}> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error('Timeout (480s) waiting for deployment_completed WS message'));
		}, 480_000);

		session.on('ws:message', (m: Record<string, unknown>) => {
			if (m.type === 'deployment_completed') {
				clearTimeout(timeout);
				resolve({
					previewURL: m.previewURL as string,
					tunnelURL: m.tunnelURL as string,
					instanceId: m.instanceId as string,
				});
			}
			if (m.type === 'deployment_failed') {
				clearTimeout(timeout);
				reject(new Error(`Deployment failed: ${m.error ?? 'unknown error'}`));
			}
		});
	});
}

/* ------------------------------------------------------------------ */
/*  Test gate                                                         */
/* ------------------------------------------------------------------ */

const describeExpo =
	process.env.VIBESDK_RUN_INTEGRATION_TESTS === '1' &&
	process.env.VIBESDK_INTEGRATION_API_KEY
		? describe
		: describe.skip;

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describeExpo('Expo mobile E2E: create project, deploy, verify web bundle', () => {
	const apiKey = requireEnv('VIBESDK_INTEGRATION_API_KEY');
	const baseUrl = process.env.VIBESDK_INTEGRATION_BASE_URL ?? 'http://localhost:5173';
	const wsFactory = createNodeWebSocketFactory();

	let session: BuildSession | null = null;
	let previewURL: string | null = null;

	afterAll(() => {
		if (session) {
			try { session.close(); } catch { /* ignore */ }
		}
	});

	/* -- Step 1: Create Expo project and deploy ---------------------- */
	it('creates an Expo mobile project and deploys to preview', async () => {
		const client = new PhasicClient({
			baseUrl,
			apiKey,
			webSocketFactory: wsFactory,
		});

		console.log(`[expo-e2e] baseUrl=${baseUrl}`);
		console.log('[expo-e2e] creating Expo mobile project...');

		session = await client.build(
			'Build a simple React Native counter app with increment and decrement buttons using Expo.',
			{
				projectType: 'app',
				selectedTemplate: 'expo-scratch',
				autoGenerate: true,
				credentials: {},
			},
		);

		// Log WS messages for debugging (filter out noisy chunk messages)
		session.on('ws:message', (m: Record<string, unknown>) => {
			if (m.type !== 'file_chunk_generated') {
				console.log(`[expo-e2e] ws: ${safeWsType(m)}`);
			}
		});
		session.on('ws:reconnecting', (e: { attempt: number; delayMs: number; reason: string }) => {
			console.log(`[expo-e2e] ws reconnecting: attempt=${e.attempt} delay=${e.delayMs}ms reason=${e.reason}`);
		});
		session.on('ws:close', (e: { code: number; reason: string }) => {
			console.log(`[expo-e2e] ws close: code=${e.code} reason=${e.reason}`);
		});
		session.on('ws:error', (e: { error: unknown }) => {
			console.log('[expo-e2e] ws error:', e.error);
		});

		console.log(`[expo-e2e] agentId=${session.agentId}`);
		expect(typeof session.agentId).toBe('string');

		// Start listening for deployment_completed immediately.
		// In phasic mode, deployment happens during phase_validating automatically.
		// We capture it here so we don't miss it regardless of when it arrives.
		const deploymentPromise = captureDeploymentCompleted(session);

		// Wait for generation to start
		if (session.state.get().generation.status === 'idle') {
			console.log('[expo-e2e] waiting for generation to start...');
			await session.wait.generationStarted({ timeoutMs: 120_000 });
		}

		console.log('[expo-e2e] generation started, waiting for generation to complete...');
		await session.wait.generationComplete({ timeoutMs: 300_000 });
		console.log('[expo-e2e] generation complete');

		// Check if deployment_completed already arrived from phasic auto-deploy.
		// If not, manually trigger preview deployment.
		const raceResult = await Promise.race([
			deploymentPromise.then(d => ({ source: 'auto' as const, deployed: d })),
			new Promise<{ source: 'timeout' }>(resolve =>
				setTimeout(() => resolve({ source: 'timeout' }), 5_000)
			),
		]);

		if (raceResult.source === 'auto') {
			console.log('[expo-e2e] deployment_completed received from phasic auto-deploy');
			previewURL = raceResult.deployed.previewURL;
		} else {
			// Deployment hasn't completed yet, trigger it manually
			console.log('[expo-e2e] no auto-deploy yet, triggering deployPreview()...');
			session.deployPreview();
			const deployed = await deploymentPromise;
			previewURL = deployed.previewURL;
		}

		console.log(`[expo-e2e] preview deployed: ${previewURL}`);
		expect(previewURL.startsWith('http')).toBe(true);

		// Verify LLM generated files (template files like app.json, metro.config.js
		// are written directly to sandbox but not tracked in SDK workspace)
		const paths = session.files.listPaths();
		console.log(`[expo-e2e] generated ${paths.length} files: ${paths.join(', ')}`);
		expect(paths.length).toBeGreaterThan(0);

		// At minimum, the LLM should generate route files
		const hasAppRoute = paths.some(p => p.startsWith('app/'));
		expect(hasAppRoute).toBe(true);
		console.log('[expo-e2e] generated files include app/ route files');
	}, 600_000);

	/* -- Step 2: Verify web-preview.html is served ------------------- */
	it('serves web-preview.html from the sandbox', async () => {
		expect(previewURL).not.toBeNull();

		const url = webPreviewUrl(previewURL!);
		console.log(`[expo-e2e] fetching web-preview.html: ${url}`);

		const resp = await fetch(url, {
			headers: { 'Accept': 'text/html' },
			redirect: 'follow',
		});

		console.log(`[expo-e2e] web-preview.html status=${resp.status}`);
		expect(resp.status).toBe(200);

		const body = await resp.text();
		expect(body).toContain('expo-router/entry.bundle');
		expect(body).toContain('<div id="root">');
		console.log('[expo-e2e] web-preview.html content is valid');
	}, 30_000);

	/* -- Step 3: Verify Metro web bundle compiles (no 500) ----------- */
	it('Metro web bundle compiles without 500 error', async () => {
		expect(previewURL).not.toBeNull();

		const bundleUrl = metroBundleUrl(previewURL!);
		console.log(`[expo-e2e] fetching Metro web bundle: ${bundleUrl}`);

		// Metro can take a while to compile the first bundle (cold start)
		const resp = await fetch(bundleUrl, {
			headers: { 'Accept': 'application/javascript' },
			redirect: 'follow',
			signal: AbortSignal.timeout(120_000),
		});

		console.log(`[expo-e2e] Metro bundle status=${resp.status}`);
		console.log(`[expo-e2e] Metro bundle content-type=${resp.headers.get('content-type')}`);

		if (resp.status !== 200) {
			const errorBody = await resp.text();
			console.error(`[expo-e2e] Metro bundle ERROR body (first 2000 chars):\n${errorBody.slice(0, 2000)}`);
			throw new Error(
				`Metro web bundle returned ${resp.status}. ` +
				`Error: ${errorBody.slice(0, 500)}`,
			);
		}

		expect(resp.status).toBe(200);

		const body = await resp.text();
		console.log(`[expo-e2e] Metro bundle size=${body.length} bytes`);

		// Should be a large JS bundle, not an error page
		expect(body.length).toBeGreaterThan(10_000);

		// Should not contain common Metro error indicators
		expect(body).not.toContain('Unable to resolve module');

		console.log('[expo-e2e] Metro web bundle compiled successfully');
	}, 180_000);

	/* -- Step 4: Verify sandbox root responds (Metro dev server) ----- */
	it('sandbox root URL responds (Metro dev server running)', async () => {
		expect(previewURL).not.toBeNull();

		console.log(`[expo-e2e] fetching sandbox root: ${previewURL}`);
		const resp = await fetch(previewURL!, {
			redirect: 'follow',
			signal: AbortSignal.timeout(15_000),
		});

		console.log(`[expo-e2e] sandbox root status=${resp.status}`);
		expect(resp.ok).toBe(true);
		console.log('[expo-e2e] sandbox root is reachable');
	}, 30_000);
});
