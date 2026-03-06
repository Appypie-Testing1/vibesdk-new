/**
 * App Preview Component
 *
 * Renders the live preview iframe for standard web applications,
 * or a web preview (via react-native-web) with a floating QR code
 * for mobile (React Native/Expo) projects.
 */

import { forwardRef } from 'react';
import { PreviewIframe } from '@/routes/chat/components/preview-iframe';
import { ExpoQRPreview } from './ExpoQRPreview';
import type { PreviewComponentProps } from '../../core/types';

export const AppPreview = forwardRef<HTMLIFrameElement, PreviewComponentProps>(
	(
		{
			previewUrl,
			websocket,
			shouldRefreshPreview,
			manualRefreshTrigger,
			previewRef,
			className,
			templateDetails,
		},
		ref,
	) => {
		if (!previewUrl) {
			return (
				<div className={`${className ?? ''} flex items-center justify-center bg-bg-3 border border-text/10 rounded-lg`}>
					<div className="text-center p-8">
						<p className="text-text-primary/70 text-sm">
							No preview URL available yet. The preview will appear once your app is deployed.
						</p>
					</div>
				</div>
			);
		}

		// Mobile (Expo) projects: load /web-preview.html (a static HTML page in public/ that
		// loads the Metro web bundle) instead of the root URL (which returns manifest JSON
		// through the proxy). A floating QR code overlay enables real device testing via Expo Go.
		if (templateDetails?.renderMode === 'mobile') {
			let expoDeepLink: string;
			let webPreviewSrc: string;
			try {
				const url = new URL(previewUrl);
				const scheme = url.protocol === 'https:' ? 'exps' : 'exp';
				expoDeepLink = `${scheme}://${url.host}`;
				url.pathname = '/web-preview.html';
				webPreviewSrc = url.toString();
			} catch {
				expoDeepLink = previewUrl;
				webPreviewSrc = previewUrl;
			}

			return (
				<div className={`${className ?? ''} relative`}>
					<PreviewIframe
						ref={ref ?? previewRef}
						src={webPreviewSrc}
						className="w-full h-full border-0"
						title="Mobile App Preview"
						shouldRefreshPreview={shouldRefreshPreview}
						manualRefreshTrigger={manualRefreshTrigger}
						webSocket={websocket}
					/>
					<ExpoQRPreview
						expoDeepLink={expoDeepLink}
						previewUrl={previewUrl}
					/>
				</div>
			);
		}

		return (
			<PreviewIframe
				ref={ref ?? previewRef}
				src={previewUrl}
				className={className}
				title="App Preview"
				shouldRefreshPreview={shouldRefreshPreview}
				manualRefreshTrigger={manualRefreshTrigger}
				webSocket={websocket}
			/>
		);
	},
);

AppPreview.displayName = 'AppPreview';
