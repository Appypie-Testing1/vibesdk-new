import { useState, useEffect } from 'react';
import type { DashboardConfig, DashboardMode } from '../../../shared/types/emdash-context';
import { EmbedLayout } from './EmbedLayout';
import { ModeSwitcher } from './ModeSwitcher';
import { EmbedChat } from './EmbedChat';

/**
 * Embed entry route.
 * Receives DashboardConfig via URL search params or postMessage from the embedding host.
 *
 * URL params: ?config=<base64-encoded JSON DashboardConfig>
 * Or postMessage: { type: 'vibesdk:config', config: DashboardConfig }
 */
export default function EmbedPage() {
    const [config, setConfig] = useState<DashboardConfig | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Try to parse config from URL params first
        const params = new URLSearchParams(window.location.search);
        const configParam = params.get('config');
        if (configParam) {
            try {
                const decoded = JSON.parse(atob(configParam)) as DashboardConfig;
                setConfig(decoded);
                return;
            } catch {
                setError('Invalid config parameter. Expected base64-encoded JSON.');
                return;
            }
        }

        // Fallback: listen for postMessage from embedding host
        const handler = (event: MessageEvent) => {
            if (event.data?.type === 'vibesdk:config' && event.data.config) {
                setConfig(event.data.config as DashboardConfig);
            }
        };
        window.addEventListener('message', handler);

        // Notify parent that we are ready to receive config
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'vibesdk:ready' }, '*');
        }

        return () => window.removeEventListener('message', handler);
    }, []);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="p-6 bg-white rounded-lg shadow-sm border max-w-md">
                    <h2 className="text-lg font-semibold text-red-700 mb-2">Configuration Error</h2>
                    <p className="text-sm text-gray-600">{error}</p>
                </div>
            </div>
        );
    }

    if (!config) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex items-center gap-2 text-gray-500">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Waiting for configuration...</span>
                </div>
            </div>
        );
    }

    return <EmbedDashboard config={config} />;
}

function EmbedDashboard({ config: initialConfig }: { config: DashboardConfig }) {
    const [mode, setMode] = useState<DashboardMode>(initialConfig.mode);
    const config: DashboardConfig = { ...initialConfig, mode };

    return (
        <EmbedLayout config={config}>
            <ModeSwitcher currentMode={mode} onModeChange={setMode} />
            <EmbedChat config={config} />
        </EmbedLayout>
    );
}
