/**
 * Expo QR Code Preview Component
 *
 * Renders a QR code encoding the `exp://` deep link for mobile app previews.
 * Intended as a replacement for the iframe preview when renderMode is 'mobile'.
 */

import { QRCodeSVG } from 'qrcode.react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

interface ExpoQRPreviewProps {
	expoDeepLink: string;
	className?: string;
}

export function ExpoQRPreview({ expoDeepLink, className }: ExpoQRPreviewProps) {
	const { copied, copy } = useCopyToClipboard();

	return (
		<div className={`${className ?? ''} flex items-center justify-center bg-bg-3 border border-text/10 rounded-lg`}>
			<div className="text-center p-8 max-w-sm">
				<h3 className="text-lg font-semibold text-text-primary mb-2">
					Mobile Preview
				</h3>
				<p className="text-sm text-text-tertiary mb-6">
					Scan with the Expo Go app to preview on your device
				</p>

				<div className="inline-block p-4 bg-white rounded-xl shadow-sm mb-6">
					<QRCodeSVG
						value={expoDeepLink}
						size={200}
						level="M"
						includeMargin={false}
					/>
				</div>

				<div className="bg-bg-4/60 border border-text/5 rounded-md p-3">
					<div className="text-xs text-text-tertiary font-medium mb-1">Deep Link:</div>
					<div className="flex items-center gap-2">
						<code className="flex-1 text-sm font-mono text-text-primary bg-bg-3/50 px-2 py-1 rounded text-ellipsis overflow-hidden">
							{expoDeepLink}
						</code>
						<button
							onClick={() => copy(expoDeepLink)}
							className="flex-shrink-0 px-2 py-1 text-xs font-medium rounded border border-text/10 bg-bg-3 text-text-primary hover:bg-bg-4 transition-colors"
						>
							{copied ? 'Copied!' : 'Copy'}
						</button>
					</div>
				</div>

				<p className="text-xs text-text-tertiary mt-4">
					Install Expo Go from the App Store or Google Play
				</p>
			</div>
		</div>
	);
}
