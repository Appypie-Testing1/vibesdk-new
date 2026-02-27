/**
 * App Preview Component
 *
 * Renders the live preview iframe for standard web applications,
 * or an Expo QR code preview for mobile (React Native) projects.
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
		// Mobile (Expo) projects: show QR code instead of iframe
		if (templateDetails?.renderMode === 'mobile' && previewUrl) {
			// Derive expo deep link from preview URL
			let expoDeepLink: string;
			try {
				const url = new URL(previewUrl);
				expoDeepLink = `exp://${url.hostname}:80`;
			} catch {
				expoDeepLink = previewUrl;
			}
			return <ExpoQRPreview expoDeepLink={expoDeepLink} className={className} />;
		}

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
