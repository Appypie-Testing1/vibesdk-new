/**
 * Expo QR Code Overlay
 *
 * Compact floating QR code panel for scanning with Expo Go.
 * Overlays the web preview iframe for mobile projects.
 */

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { Smartphone, X, ChevronUp, ChevronDown, Copy, Check } from 'lucide-react';

interface ExpoQRPreviewProps {
	expoDeepLink: string;
	previewUrl?: string;
}

export function ExpoQRPreview({ expoDeepLink, previewUrl }: ExpoQRPreviewProps) {
	const { copied: deepLinkCopied, copy: copyDeepLink } = useCopyToClipboard();
	const { copied: urlCopied, copy: copyUrl } = useCopyToClipboard();
	const [isExpanded, setIsExpanded] = useState(true);
	const [isDismissed, setIsDismissed] = useState(false);

	if (isDismissed) {
		return (
			<button
				onClick={() => setIsDismissed(false)}
				className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 px-3 py-2 bg-bg-1/95 backdrop-blur-sm border border-text/10 rounded-lg shadow-lg text-xs text-text-primary hover:bg-bg-2 transition-colors"
			>
				<Smartphone className="size-3.5" />
				<span>Show QR</span>
			</button>
		);
	}

	return (
		<div className="absolute bottom-4 right-4 z-20 w-64 bg-bg-1/95 backdrop-blur-sm border border-text/10 rounded-xl shadow-xl overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-text/5">
				<div className="flex items-center gap-1.5">
					<Smartphone className="size-3.5 text-accent" />
					<span className="text-xs font-medium text-text-primary">Test on Device</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						onClick={() => setIsExpanded(!isExpanded)}
						className="p-0.5 hover:bg-bg-3 rounded transition-colors"
					>
						{isExpanded
							? <ChevronDown className="size-3.5 text-text-tertiary" />
							: <ChevronUp className="size-3.5 text-text-tertiary" />
						}
					</button>
					<button
						onClick={() => setIsDismissed(true)}
						className="p-0.5 hover:bg-bg-3 rounded transition-colors"
					>
						<X className="size-3.5 text-text-tertiary" />
					</button>
				</div>
			</div>

			{isExpanded && (
				<div className="p-3 space-y-2.5">
					{/* QR Code */}
					<div className="flex justify-center">
						<div className="p-2 bg-white rounded-lg">
							<QRCodeSVG
								value={expoDeepLink}
								size={140}
								level="M"
								includeMargin={false}
							/>
						</div>
					</div>

					<p className="text-[10px] text-text-tertiary text-center">
						Scan with Expo Go app on your device
					</p>

					{/* Deep Link */}
					<div className="flex items-center gap-1.5">
						<code className="flex-1 text-[10px] font-mono text-text-secondary bg-bg-3/50 px-1.5 py-1 rounded truncate">
							{expoDeepLink}
						</code>
						<button
							onClick={() => copyDeepLink(expoDeepLink)}
							className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded border border-text/10 bg-bg-3 text-text-primary hover:bg-bg-4 transition-colors"
						>
							{deepLinkCopied ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5" />}
							{deepLinkCopied ? 'Copied' : 'Copy'}
						</button>
					</div>

					{/* Preview URL */}
					{previewUrl && (
						<div className="flex items-center gap-1.5">
							<code className="flex-1 text-[10px] font-mono text-text-secondary bg-bg-3/50 px-1.5 py-1 rounded truncate">
								{previewUrl}
							</code>
							<button
								onClick={() => copyUrl(previewUrl)}
								className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded border border-text/10 bg-bg-3 text-text-primary hover:bg-bg-4 transition-colors"
							>
								{urlCopied ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5" />}
								{urlCopied ? 'Copied' : 'Copy'}
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
