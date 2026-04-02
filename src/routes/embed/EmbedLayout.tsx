import type { ReactNode } from 'react';
import type { DashboardConfig } from '../../../shared/types/emdash-context';

interface EmbedLayoutProps {
    config: DashboardConfig;
    children: ReactNode;
}

/**
 * Branded layout wrapper for the embedded dashboard.
 * Applies custom branding from the DashboardConfig.
 */
export function EmbedLayout({ config, children }: EmbedLayoutProps) {
    const { branding } = config;
    const primaryColor = branding?.primaryColor ?? '#2563eb';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header
                className="flex items-center justify-between px-4 py-2 border-b bg-white"
                style={{ borderBottomColor: primaryColor }}
            >
                <div className="flex items-center gap-3">
                    {branding?.logoUrl && (
                        <img
                            src={branding.logoUrl}
                            alt={branding.appName ?? 'Logo'}
                            className="h-7 w-auto"
                        />
                    )}
                    <span className="text-sm font-semibold text-gray-800">
                        {branding?.appName ?? 'Build Studio'}
                    </span>
                </div>
                <div className="text-xs text-gray-400">
                    Powered by VibeSDK
                </div>
            </header>

            <main className="flex-1 flex flex-col overflow-hidden">
                {children}
            </main>
        </div>
    );
}
