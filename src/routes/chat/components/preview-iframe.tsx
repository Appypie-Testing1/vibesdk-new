import { useEffect, useState, useRef, forwardRef, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { WebSocket } from 'partysocket';

interface PreviewIframeProps {
    src: string;
    className?: string;
    title?: string;
    shouldRefreshPreview?: boolean;
    manualRefreshTrigger?: number;
    webSocket?: WebSocket | null;
}

// ============================================================================
// Types & Constants
// ============================================================================

interface LoadState {
    status: 'idle' | 'loading' | 'postload' | 'loaded' | 'error';
    attempt: number;
    loadedSrc: string | null;
    errorMessage: string | null;
    previewType?: 'sandbox' | 'dispatcher';
}

const MAX_RETRIES = 10;
const REDEPLOY_AFTER_ATTEMPT = 8;
const POST_LOAD_WAIT_SANDBOX = 2000;
const POST_LOAD_WAIT_DISPATCHER = 1000;

const SANDBOX_PERMISSIONS = "allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-orientation-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation";

const getRetryDelay = (attempt: number): number => {
	// 1s, 2s, 4s, 8s (capped)
	return Math.min(1000 * Math.pow(2, attempt), 8000);
};

// ============================================================================
// Main Component
// ============================================================================

export const PreviewIframe = forwardRef<HTMLIFrameElement, PreviewIframeProps>(
	({ src, className = '', title = 'Preview', shouldRefreshPreview = false, manualRefreshTrigger, webSocket }, ref) => {

		const [loadState, setLoadState] = useState<LoadState>({
			status: 'idle',
			attempt: 0,
			loadedSrc: null,
			errorMessage: null,
		});

		const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
		const hasRequestedRedeployRef = useRef(false);
        const postLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

		// ====================================================================
		// Core Loading Logic
		// ====================================================================

		/**
		 * Test if URL is accessible using a simple HEAD request
		 * Returns preview type if accessible, null otherwise
		 */
		const testAvailability = useCallback(async (url: string): Promise<'sandbox' | 'dispatcher' | null> => {
			try {
				const response = await fetch(url, {
					method: 'HEAD',
					mode: 'cors',
					cache: 'no-cache',
					signal: AbortSignal.timeout(8000),
				});

				if (!response.ok) {
					return null;
				}

				const previewType = response.headers.get('X-Preview-Type');

                if (previewType === 'sandbox-error') {
                    return null;
                } else if (previewType === 'sandbox' || previewType === 'dispatcher') {
					return previewType;
				}

				return 'sandbox';
			} catch {
				return null;
			}
		}, []);

		/**
		 * Request automatic redeployment via WebSocket
		 */
		const requestRedeploy = useCallback(() => {
			if (!webSocket || webSocket.readyState !== WebSocket.OPEN) {
				return;
			}

			if (hasRequestedRedeployRef.current) {
				return;
			}

			try {
				webSocket.send(JSON.stringify({
					type: 'preview',
				}));
				hasRequestedRedeployRef.current = true;
			} catch (error) {
				console.error('Failed to send redeploy request:', error);
			}
		}, [webSocket]);

		/**
		 * Request screenshot capture via WebSocket
		 */
		const requestScreenshot = useCallback((url: string) => {
			if (!webSocket || webSocket.readyState !== WebSocket.OPEN) {
				return;
			}

			try {
				webSocket.send(JSON.stringify({
					type: 'capture_screenshot',
					data: {
						url,
						viewport: { width: 1280, height: 720 },
					},
				}));
			} catch (error) {
				console.error('Failed to send screenshot request:', error);
			}
		}, [webSocket]);

		/**
		 * Attempt to load the preview with retry logic
		 */
		const loadWithRetry = useCallback(async (url: string, attempt: number) => {
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}

            if (postLoadTimeoutRef.current) {
                clearTimeout(postLoadTimeoutRef.current);
                postLoadTimeoutRef.current = null;
            }

			if (attempt >= MAX_RETRIES) {
				setLoadState({
					status: 'error',
					attempt,
					loadedSrc: null,
					errorMessage: 'Preview failed to load after multiple attempts',
				});
				return;
			}

			setLoadState({
				status: 'loading',
				attempt: attempt + 1,
				loadedSrc: null,
				errorMessage: null,
			});

			const previewType = await testAvailability(url);

			if (previewType) {
				setLoadState({
					status: 'postload',
					attempt: attempt + 1,
					loadedSrc: url,
					errorMessage: null,
					previewType,
				});

				const waitTime = previewType === 'dispatcher' ? POST_LOAD_WAIT_DISPATCHER : POST_LOAD_WAIT_SANDBOX;
				postLoadTimeoutRef.current = setTimeout(() => {
					setLoadState(prev => ({
						...prev,
						status: 'loaded',
					}));
					requestScreenshot(url);
				}, waitTime);
			} else {
				const delay = getRetryDelay(attempt);
				const nextAttempt = attempt + 1;

				if (nextAttempt === REDEPLOY_AFTER_ATTEMPT) {
					requestRedeploy();
				}

				retryTimeoutRef.current = setTimeout(() => {
					loadWithRetry(url, nextAttempt);
				}, delay);
			}
		}, [testAvailability, requestScreenshot, requestRedeploy]);

		/**
		 * Force a fresh reload from scratch
		 */
		const forceReload = useCallback(() => {
			hasRequestedRedeployRef.current = false;

			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}

            if (postLoadTimeoutRef.current) {
                clearTimeout(postLoadTimeoutRef.current);
                postLoadTimeoutRef.current = null;
            }

			setLoadState({
				status: 'idle',
				attempt: 0,
				loadedSrc: null,
				errorMessage: null,
			});

			loadWithRetry(src, 0);
		}, [src, loadWithRetry]);

		// ====================================================================
		// Effects
		// ====================================================================

		/**
		 * Effect: Load when src changes
		 */
		useEffect(() => {
			if (!src) return;

			hasRequestedRedeployRef.current = false;

			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}

            if (postLoadTimeoutRef.current) {
                clearTimeout(postLoadTimeoutRef.current);
                postLoadTimeoutRef.current = null;
            }

			setLoadState({
				status: 'idle',
				attempt: 0,
				loadedSrc: null,
				errorMessage: null,
			});

			loadWithRetry(src, 0);

			return () => {
				if (retryTimeoutRef.current) {
					clearTimeout(retryTimeoutRef.current);
					retryTimeoutRef.current = null;
				}
				if (postLoadTimeoutRef.current) {
					clearTimeout(postLoadTimeoutRef.current);
					postLoadTimeoutRef.current = null;
				}
			};
		}, [src, loadWithRetry]);

		/**
		 * Effect: Auto-refresh after deployment
		 */
		useEffect(() => {
			if (shouldRefreshPreview && loadState.status === 'loaded' && loadState.loadedSrc) {
				forceReload();
			}
		}, [shouldRefreshPreview, loadState.status, loadState.loadedSrc, forceReload]);

		/**
		 * Effect: Manual refresh trigger
		 */
		useEffect(() => {
			if (manualRefreshTrigger && manualRefreshTrigger > 0) {
				forceReload();
			}
		}, [manualRefreshTrigger, forceReload]);

		/**
		 * Effect: Cleanup on unmount
		 */
		useEffect(() => {
			return () => {
				if (retryTimeoutRef.current) {
					clearTimeout(retryTimeoutRef.current);
				}
				if (postLoadTimeoutRef.current) {
					clearTimeout(postLoadTimeoutRef.current);
				}
			};
		}, []);

		// ====================================================================
		// Render
		// ====================================================================

		// Successfully loaded - show iframe
		if (loadState.status === 'loaded' && loadState.loadedSrc) {
			return (
				<iframe
                    sandbox={SANDBOX_PERMISSIONS}
					ref={ref}
					src={loadState.loadedSrc}
					className={className}
					title={title}
					style={{ border: 'none' }}
					onError={() => {
						setLoadState(prev => ({
							...prev,
							status: 'error',
							errorMessage: 'Preview failed to render',
						}));
					}}
				/>
			);
		}

		// Loading state
		if (loadState.status === 'loading' || loadState.status === 'idle' || loadState.status === 'postload') {
			const delay = getRetryDelay(loadState.attempt - 1);
			const delaySeconds = Math.ceil(delay / 1000);

			return (
				<div className={`${className} relative flex flex-col items-center justify-center bg-bg-3 border border-text/10 rounded-lg`}>
                    {loadState.status === 'postload' && loadState.loadedSrc && (
                        <iframe
                            sandbox={SANDBOX_PERMISSIONS}
                            ref={ref}
                            src={loadState.loadedSrc}
                            className="absolute inset-0 opacity-0 pointer-events-none"
                            title={title}
                            aria-hidden="true"
                            onError={() => {
                                setLoadState(prev => ({
                                    ...prev,
                                    status: 'error',
                                    errorMessage: 'Preview failed to render',
                                }));
                            }}
                        />
                    )}
					<div className="text-center p-8 max-w-md">
						<RefreshCw className="size-8 text-accent animate-spin mx-auto mb-4" />
						<h3 className="text-lg font-medium text-text-primary mb-2">
							Loading Preview
						</h3>
						<p className="text-text-primary/70 text-sm mb-4">
							{loadState.attempt === 0
								? 'Checking if your deployed preview is ready...'
								: `Preview not ready yet. Retrying in ${delaySeconds}s... (attempt ${loadState.attempt}/${MAX_RETRIES})`
							}
						</p>
						{loadState.attempt >= REDEPLOY_AFTER_ATTEMPT && (
							<p className="text-xs text-accent/70">
								Auto-redeployment triggered to refresh the preview
							</p>
						)}
						<div className="text-xs text-text-primary/50 mt-2">
							Preview URLs may take a moment to become available after deployment
						</div>
					</div>
				</div>
			);
		}

		// Error state - after max retries
		return (
			<div className={`${className} flex flex-col items-center justify-center bg-bg-3 border border-text/10 rounded-lg`}>
				<div className="text-center p-8 max-w-md">
					<AlertCircle className="size-8 text-orange-500 mx-auto mb-4" />
					<h3 className="text-lg font-medium text-text-primary mb-2">
						Preview Not Available
					</h3>
					<p className="text-text-primary/70 text-sm mb-6">
						{loadState.errorMessage || 'The preview failed to load after multiple attempts.'}
					</p>
					<div className="space-y-3">
						<button
							onClick={forceReload}
							className="flex items-center justify-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors text-sm mx-auto font-medium w-full"
						>
							<RefreshCw className="size-4" />
							Try Again
						</button>
						<p className="text-xs text-text-primary/60">
							If the issue persists, please describe the problem in chat so I can help diagnose and fix it.
						</p>
					</div>
				</div>
			</div>
		);
	}
);

PreviewIframe.displayName = 'PreviewIframe';
