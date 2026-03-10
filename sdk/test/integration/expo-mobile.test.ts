/**
 * Expo Mobile E2E Integration Test
 *
 * Programmatically creates an Expo/React Native project via the SDK,
 * waits for deployment, then verifies that:
 * 1. The sandbox is running and reachable
 * 2. The web-preview.html is served correctly
 * 3. The Metro web bundle compiles without 500 errors
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

/** Build the Metro web bundle URL from a preview base URL. */
function metroBundleUrl(previewUrl: string, platform: 'web' | 'ios' | 'android' = 'web'): string {
	const url = new URL(previewUrl);
	url.pathname = '/node_modules/expo-router/entry.bundle';
	url.search = `?platform=${platform}&dev=true&hot=false&transform.routerRoot=app`;
	return url.toString();
}

/** Build the web-preview.html URL from a preview base URL. */
function webPreviewUrl(previewUrl: string): string {
	const url = new URL(previewUrl);
	url.pathname = '/web-preview.html';
	return url.toString();
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

	/* -- Step 1: Create Expo project and get preview URL -------------- */
	it('creates an Expo mobile project and gets preview URL', async () => {
		const client = new PhasicClient({
			baseUrl,
			apiKey,
			webSocketFactory: wsFactory,
		});

		console.log(`[expo-e2e] baseUrl=${baseUrl}`);
		console.log('[expo-e2e] creating Expo mobile project...');

		session = await client.build(
			'Build a simple React Native counter app with increment and decrement buttons using Expo. Only use packages from the pre-installed list.',
			{
				projectType: 'app',
				selectedTemplate: 'expo-scratch',
				autoGenerate: true,
				credentials: {},
			},
		);

		// Capture deployment_completed from ANY point in the flow.
		// In phasic mode, deployment happens during phase_validating automatically.
		let deployResolve: (v: { previewURL: string }) => void;
		let deployReject: (e: Error) => void;
		const deploymentPromise = new Promise<{ previewURL: string }>((res, rej) => {
			deployResolve = res;
			deployReject = rej;
		});
		const deployTimeout = setTimeout(() => {
			deployReject!(new Error('Timeout (540s) waiting for deployment_completed'));
		}, 540_000);

		// Log WS messages for debugging (filter out noisy chunk messages)
		session.on('ws:message', (m: Record<string, unknown>) => {
			const msgType = m.type as string;

			// Skip chunk noise
			if (msgType === 'file_chunk_generated') return;

			// Log state content for deployment-related states
			if (msgType === 'cf_agent_state') {
				const state = m as Record<string, unknown>;
				const devState = state.currentDevState ?? state.devState;
				const sandboxId = state.sandboxInstanceId;
				if (devState || sandboxId) {
					console.log(`[expo-e2e] ws: cf_agent_state devState=${devState} sandbox=${sandboxId}`);
				} else {
					console.log(`[expo-e2e] ws: cf_agent_state`);
				}
				return;
			}

			console.log(`[expo-e2e] ws: ${msgType}`);

			// Capture deployment result
			if (msgType === 'deployment_completed') {
				clearTimeout(deployTimeout);
				deployResolve!({ previewURL: m.previewURL as string });
			}
			if (msgType === 'deployment_failed') {
				clearTimeout(deployTimeout);
				deployReject!(new Error(`Deployment failed: ${m.error ?? 'unknown'}`));
			}

			// Also check phase_validated -- it means deployment completed in phasic mode
			if (msgType === 'phase_validated') {
				console.log('[expo-e2e] phase_validated received -- checking state for preview URL');
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

		// Wait for generation to start
		if (session.state.get().generation.status === 'idle') {
			console.log('[expo-e2e] waiting for generation to start...');
			await session.wait.generationStarted({ timeoutMs: 120_000 });
		}
		console.log('[expo-e2e] generation started');

		// Wait for deployment_completed to arrive from the phasic flow.
		// In phasic mode: phase_implementing -> phase_validating (deploys) -> deployment_completed -> phase_validated
		// We also try triggering deployPreview() after generation_complete as a fallback.
		const genCompletePromise = session.wait.generationComplete({ timeoutMs: 300_000 });

		// Race: deployment might complete before or after generation_complete
		const result = await Promise.race([
			deploymentPromise.then(d => ({ type: 'deployed' as const, ...d })),
			genCompletePromise.then(() => ({ type: 'gen_complete' as const })),
		]);

		if (result.type === 'deployed') {
			previewURL = result.previewURL;
			console.log(`[expo-e2e] deployment completed during generation: ${previewURL}`);
		} else {
			console.log('[expo-e2e] generation complete, waiting for deployment...');

			// Give phasic auto-deploy a chance (30s), then manually trigger
			const raceResult = await Promise.race([
				deploymentPromise.then(d => ({ source: 'auto' as const, ...d })),
				new Promise<{ source: 'timeout' }>(resolve =>
					setTimeout(() => resolve({ source: 'timeout' }), 30_000)
				),
			]);

			if (raceResult.source === 'auto') {
				previewURL = raceResult.previewURL;
				console.log(`[expo-e2e] deployment completed from phasic flow: ${previewURL}`);
			} else {
				console.log('[expo-e2e] no auto-deploy after 30s, triggering deployPreview()...');
				session.deployPreview();
				const deployed = await deploymentPromise;
				previewURL = deployed.previewURL;
				console.log(`[expo-e2e] deployment completed from manual trigger: ${previewURL}`);
			}
		}

		expect(previewURL.startsWith('http')).toBe(true);

		// Verify LLM generated files
		const paths = session.files.listPaths();
		console.log(`[expo-e2e] generated ${paths.length} files: ${paths.join(', ')}`);
		expect(paths.length).toBeGreaterThan(0);
		const hasAppRoute = paths.some(p => p.startsWith('app/'));
		expect(hasAppRoute).toBe(true);
		console.log('[expo-e2e] files look good');
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

		// Metro can take a while to compile the first bundle (cold start).
		// Retry a few times since Metro might still be starting up.
		let lastStatus = 0;
		let lastBody = '';
		for (let attempt = 1; attempt <= 3; attempt++) {
			if (attempt > 1) {
				console.log(`[expo-e2e] retrying Metro bundle (attempt ${attempt}/3) in 15s...`);
				await new Promise(r => setTimeout(r, 15_000));
			}

			const resp = await fetch(bundleUrl, {
				headers: { 'Accept': 'application/javascript' },
				redirect: 'follow',
				signal: AbortSignal.timeout(120_000),
			});

			lastStatus = resp.status;
			lastBody = await resp.text();

			console.log(`[expo-e2e] Metro bundle attempt ${attempt}: status=${lastStatus} size=${lastBody.length}`);

			if (lastStatus === 200) break;

			console.error(`[expo-e2e] Metro error (first 1000 chars):\n${lastBody.slice(0, 1000)}`);
		}

		if (lastStatus !== 200) {
			throw new Error(
				`Metro web bundle returned ${lastStatus} after 3 attempts. ` +
				`Error: ${lastBody.slice(0, 500)}`,
			);
		}

		expect(lastStatus).toBe(200);
		expect(lastBody.length).toBeGreaterThan(10_000);
		expect(lastBody).not.toContain('Unable to resolve module');

		console.log(`[expo-e2e] Metro web bundle compiled successfully (${lastBody.length} bytes)`);
	}, 300_000);

	/* -- Step 4: Verify Android bundle compiles (Expo Go bundle) ----- */
	it('Metro Android bundle compiles without errors', async () => {
		expect(previewURL).not.toBeNull();

		const bundleUrl = metroBundleUrl(previewURL!, 'android');
		console.log(`[expo-e2e] fetching Metro Android bundle: ${bundleUrl}`);

		// Android bundle cold-compile can take 3-5 minutes on first request.
		// Use a long per-fetch timeout and fewer retries.
		let lastStatus = 0;
		let lastBody = '';
		for (let attempt = 1; attempt <= 2; attempt++) {
			if (attempt > 1) {
				console.log(`[expo-e2e] retrying Android bundle (attempt ${attempt}/2) in 20s...`);
				await new Promise(r => setTimeout(r, 20_000));
			}

			try {
				const resp = await fetch(bundleUrl, {
					headers: { 'Accept': 'application/javascript' },
					redirect: 'follow',
					signal: AbortSignal.timeout(240_000),
				});

				lastStatus = resp.status;
				lastBody = await resp.text();

				console.log(`[expo-e2e] Android bundle attempt ${attempt}: status=${lastStatus} size=${lastBody.length}`);

				if (lastStatus === 200) break;

				console.error(`[expo-e2e] Android bundle error (first 1000 chars):\n${lastBody.slice(0, 1000)}`);
			} catch (fetchErr) {
				console.error(`[expo-e2e] Android bundle attempt ${attempt} fetch error:`, fetchErr);
				lastStatus = 0;
			}
		}

		if (lastStatus !== 200) {
			throw new Error(
				`Metro Android bundle returned ${lastStatus} after 2 attempts. ` +
				`Error: ${lastBody.slice(0, 500)}`,
			);
		}

		expect(lastStatus).toBe(200);
		expect(lastBody.length).toBeGreaterThan(10_000);
		expect(lastBody).not.toContain('Unable to resolve module');

		console.log(`[expo-e2e] Metro Android bundle compiled successfully (${lastBody.length} bytes)`);
	}, 540_000);

	/* -- Step 5: Verify sandbox root responds (Metro dev server) ----- */
	it('sandbox root responds (Metro dev server running)', async () => {
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

	/* -- Step 6: Verify Expo manifest has clean URLs (no duplicated protocol) */
	it('Expo manifest has valid launchAsset URL (no duplicated protocol)', async () => {
		expect(previewURL).not.toBeNull();

		console.log(`[expo-e2e] fetching Expo manifest from root URL`);
		const resp = await fetch(previewURL!, {
			headers: {
				'Accept': 'application/json',
				'Expo-Platform': 'android',
			},
			redirect: 'follow',
			signal: AbortSignal.timeout(15_000),
		});

		console.log(`[expo-e2e] manifest status=${resp.status}`);
		expect(resp.ok).toBe(true);

		const manifest = await resp.json() as Record<string, unknown>;
		const launchAsset = manifest.launchAsset as Record<string, unknown> | undefined;

		if (launchAsset?.url) {
			const assetUrl = launchAsset.url as string;
			console.log(`[expo-e2e] launchAsset.url=${assetUrl.slice(0, 120)}...`);
			// Must not contain duplicated protocol "https, https://"
			expect(assetUrl).not.toContain('https, https');
			expect(assetUrl).not.toContain('http, http');
			// Must use HTTPS (proxy forces x-forwarded-proto: https)
			expect(assetUrl.startsWith('https://')).toBe(true);
			console.log('[expo-e2e] manifest launchAsset.url is valid HTTPS');
		} else {
			console.log('[expo-e2e] no launchAsset.url in manifest (dev mode may omit it)');
		}

		// Verify hostUri doesn't have redundant port
		const extra = manifest.extra as Record<string, unknown> | undefined;
		const expoClient = extra?.expoClient as Record<string, unknown> | undefined;
		if (expoClient?.hostUri) {
			const hostUri = expoClient.hostUri as string;
			console.log(`[expo-e2e] hostUri=${hostUri}`);
			// Should not end with :8001 or :8002 (port is in subdomain)
			expect(hostUri).not.toMatch(/:800[0-9]$/);
			console.log('[expo-e2e] hostUri is clean');
		}
	}, 30_000);
});
