/**
 * App Preview Component
 *
 * Renders the live preview iframe for standard web applications.
 * For mobile (React Native/Expo) projects, renders a device testing
 * experience with QR code and optional web preview.
 */

import { forwardRef, useState, useEffect, useCallback, useRef } from 'react';
import { PreviewIframe } from '@/routes/chat/components/preview-iframe';
import { QRCodeSVG } from 'qrcode.react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { Smartphone, Copy, Check, RefreshCw, Monitor } from 'lucide-react';
import type { PreviewComponentProps } from '../../core/types';

type MobileViewMode = 'device' | 'web';

const MobilePreview = forwardRef<HTMLIFrameElement, {
	previewUrl: string;
	className?: string;
	shouldRefreshPreview?: boolean;
	manualRefreshTrigger?: number;
}>(({ previewUrl, className, shouldRefreshPreview, manualRefreshTrigger }, ref) => {
	const [viewMode, setViewMode] = useState<MobileViewMode>('device');
	const [iframeLoaded, setIframeLoaded] = useState(false);
	const [iframeKey, setIframeKey] = useState(0);
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const { copied: deepLinkCopied, copy: copyDeepLink } = useCopyToClipboard();
	const { copied: urlCopied, copy: copyUrl } = useCopyToClipboard();

	let expoDeepLink: string;
	let webPreviewSrc: string;
	try {
		const url = new URL(previewUrl);
		const scheme = url.protocol === 'https:' ? 'exps' : 'exp';
		expoDeepLink = `${scheme}://${url.hostname}`;
		url.pathname = '/web-preview.html';
		webPreviewSrc = url.toString();
	} catch {
		expoDeepLink = previewUrl;
		webPreviewSrc = previewUrl;
	}

	const setRef = useCallback((el: HTMLIFrameElement | null) => {
		iframeRef.current = el;
		if (typeof ref === 'function') ref(el);
		else if (ref) ref.current = el;
	}, [ref]);

	useEffect(() => {
		if (shouldRefreshPreview || manualRefreshTrigger) {
			setIframeLoaded(false);
			setIframeKey(k => k + 1);
		}
	}, [shouldRefreshPreview, manualRefreshTrigger]);

	return (
		<div className={`${className ?? ''} flex flex-col h-full bg-bg-2`}>
			{/* Mode tabs */}
			<div className="flex items-center gap-1 px-3 py-2 border-b border-text/10 bg-bg-1 flex-shrink-0">
				<button
					onClick={() => setViewMode('device')}
					className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
						viewMode === 'device'
							? 'bg-accent/10 text-accent'
							: 'text-text-secondary hover:text-text-primary hover:bg-bg-3'
					}`}
				>
					<Smartphone className="size-3.5" />
					Device Testing
				</button>
				<button
					onClick={() => setViewMode('web')}
					className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
						viewMode === 'web'
							? 'bg-accent/10 text-accent'
							: 'text-text-secondary hover:text-text-primary hover:bg-bg-3'
					}`}
				>
					<Monitor className="size-3.5" />
					Web Preview
				</button>
			</div>

			{/* Device Testing View */}
			{viewMode === 'device' && (
				<div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
					<div className="flex flex-col items-center gap-5 max-w-sm w-full">
						{/* QR Code */}
						<div className="p-4 bg-white rounded-2xl shadow-sm border border-text/5">
							<QRCodeSVG
								value={expoDeepLink}
								size={200}
								level="M"
								includeMargin={false}
							/>
						</div>

						<div className="text-center space-y-1">
							<p className="text-sm font-medium text-text-primary">
								Scan with Expo Go
							</p>
							<p className="text-xs text-text-tertiary">
								Open Expo Go on your device and scan this QR code to preview your app
							</p>
						</div>

						{/* Deep Link */}
						<div className="w-full space-y-2">
							<div className="flex items-center gap-2 bg-bg-3/50 rounded-lg p-2 border border-text/5">
								<code className="flex-1 text-[11px] font-mono text-text-secondary truncate">
									{expoDeepLink}
								</code>
								<button
									onClick={() => copyDeepLink(expoDeepLink)}
									className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-text/10 bg-bg-1 text-text-primary hover:bg-bg-3 transition-colors"
								>
									{deepLinkCopied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
									{deepLinkCopied ? 'Copied' : 'Copy'}
								</button>
							</div>

							<div className="flex items-center gap-2 bg-bg-3/50 rounded-lg p-2 border border-text/5">
								<code className="flex-1 text-[11px] font-mono text-text-secondary truncate">
									{previewUrl}
								</code>
								<button
									onClick={() => copyUrl(previewUrl)}
									className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-text/10 bg-bg-1 text-text-primary hover:bg-bg-3 transition-colors"
								>
									{urlCopied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
									{urlCopied ? 'Copied' : 'Copy'}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Web Preview View */}
			{viewMode === 'web' && (
				<div className="flex-1 relative">
					{!iframeLoaded && (
						<div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg-2">
							<div className="animate-spin size-6 border-2 border-accent/30 border-t-accent rounded-full mb-3" />
							<p className="text-xs text-text-tertiary">Loading web preview...</p>
							<p className="text-[10px] text-text-tertiary/60 mt-1">
								Some native features may not render in web view
							</p>
						</div>
					)}
					<div className="absolute top-2 right-2 z-20">
						<button
							onClick={() => { setIframeLoaded(false); setIframeKey(k => k + 1); }}
							className="p-1.5 bg-bg-1/90 backdrop-blur-sm border border-text/10 rounded-lg hover:bg-bg-3 transition-colors"
							title="Refresh preview"
						>
							<RefreshCw className="size-3.5 text-text-secondary" />
						</button>
					</div>
					<iframe
						ref={setRef}
						key={iframeKey}
						src={webPreviewSrc}
						className="w-full h-full border-0"
						title="Mobile Web Preview"
						onLoad={() => setIframeLoaded(true)}
					/>
				</div>
			)}
		</div>
	);
});

MobilePreview.displayName = 'MobilePreview';

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

		if (templateDetails?.renderMode === 'mobile') {
			return (
				<MobilePreview
					ref={ref ?? previewRef}
					previewUrl={previewUrl}
					className={className}
					shouldRefreshPreview={shouldRefreshPreview}
					manualRefreshTrigger={manualRefreshTrigger}
				/>
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
