/**
 * Expo QR Code Preview Component
 *
 * Renders a QR code encoding the Expo deep link for mobile app previews.
 * Also shows the preview URL for browser fallback.
 */

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

interface ExpoQRPreviewProps {
	expoDeepLink: string;
	previewUrl?: string;
	className?: string;
}

export function ExpoQRPreview({ expoDeepLink, previewUrl, className }: ExpoQRPreviewProps) {
	const { copied: deepLinkCopied, copy: copyDeepLink } = useCopyToClipboard();
	const { copied: urlCopied, copy: copyUrl } = useCopyToClipboard();
	const [showHelp, setShowHelp] = useState(false);

	return (
		<div className={`${className ?? ''} flex items-center justify-center bg-bg-3 border border-text/10 rounded-lg overflow-auto`}>
			<div className="text-center p-8 max-w-md">
				<h3 className="text-lg font-semibold text-text-primary mb-2">
					Mobile Preview
				</h3>
				<p className="text-sm text-text-tertiary mb-6">
					Scan with Expo Go to preview on your device
				</p>

				<div className="inline-block p-4 bg-white rounded-xl shadow-sm mb-6">
					<QRCodeSVG
						value={expoDeepLink}
						size={200}
						level="M"
						includeMargin={false}
					/>
				</div>

				{/* Expo Deep Link */}
				<div className="bg-bg-4/60 border border-text/5 rounded-md p-3 mb-3">
					<div className="text-xs text-text-tertiary font-medium mb-1">Expo Deep Link:</div>
					<div className="flex items-center gap-2">
						<code className="flex-1 text-xs font-mono text-text-primary bg-bg-3/50 px-2 py-1 rounded truncate">
							{expoDeepLink}
						</code>
						<button
							onClick={() => copyDeepLink(expoDeepLink)}
							className="flex-shrink-0 px-2 py-1 text-xs font-medium rounded border border-text/10 bg-bg-3 text-text-primary hover:bg-bg-4 transition-colors"
						>
							{deepLinkCopied ? 'Copied!' : 'Copy'}
						</button>
					</div>
				</div>

				{/* Preview URL for browser fallback */}
				{previewUrl && (
					<div className="bg-bg-4/60 border border-text/5 rounded-md p-3 mb-3">
						<div className="text-xs text-text-tertiary font-medium mb-1">Preview URL (open in mobile browser):</div>
						<div className="flex items-center gap-2">
							<code className="flex-1 text-xs font-mono text-text-primary bg-bg-3/50 px-2 py-1 rounded truncate">
								{previewUrl}
							</code>
							<button
								onClick={() => copyUrl(previewUrl)}
								className="flex-shrink-0 px-2 py-1 text-xs font-medium rounded border border-text/10 bg-bg-3 text-text-primary hover:bg-bg-4 transition-colors"
							>
								{urlCopied ? 'Copied!' : 'Copy'}
							</button>
						</div>
					</div>
				)}

				{/* How to use */}
				<button
					onClick={() => setShowHelp(!showHelp)}
					className="text-xs text-accent hover:underline mt-2 mb-2"
				>
					{showHelp ? 'Hide instructions' : 'How to preview this app?'}
				</button>

				{showHelp && (
					<div className="text-left bg-bg-4/40 border border-text/5 rounded-md p-4 mt-2 text-xs text-text-secondary space-y-3">
						<div>
							<span className="font-semibold text-text-primary">Option 1: Expo Go (recommended)</span>
							<ol className="list-decimal ml-4 mt-1 space-y-1">
								<li>Install <span className="font-medium">Expo Go</span> from App Store or Google Play</li>
								<li>Open Expo Go and scan the QR code above</li>
								<li>The app loads on your phone</li>
							</ol>
						</div>
						<div>
							<span className="font-semibold text-text-primary">Option 2: Mobile browser</span>
							<ol className="list-decimal ml-4 mt-1 space-y-1">
								<li>Copy the Preview URL above</li>
								<li>Open it in your phone's browser</li>
							</ol>
						</div>
						<div>
							<span className="font-semibold text-text-primary">Option 3: Run locally</span>
							<ol className="list-decimal ml-4 mt-1 space-y-1">
								<li>Clone the project (use Git Clone button)</li>
								<li>Run: <code className="bg-bg-3 px-1 rounded">bun install && npx expo start</code></li>
								<li>Scan the QR code from your terminal</li>
							</ol>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
