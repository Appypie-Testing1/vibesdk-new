import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { MarketplacePluginResponseData } from '@/api-types';

interface InstallFlowProps {
    plugin: MarketplacePluginResponseData;
    onClose: () => void;
    onInstalled: () => void;
}

type Step = 'site-select' | 'capability-review' | 'installing' | 'success' | 'error';

export function InstallFlow({ plugin, onClose, onInstalled }: InstallFlowProps) {
    const [step, setStep] = useState<Step>('site-select');
    const [siteId, setSiteId] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleInstall = async () => {
        if (!siteId.trim()) return;
        setStep('installing');
        setError(null);

        try {
            const result = await apiClient.installMarketplacePlugin(plugin.id, siteId.trim());
            if (result.data) {
                setStep('success');
                onInstalled();
            } else {
                setError('Installation failed');
                setStep('error');
            }
        } catch {
            setError('An error occurred during installation');
            setStep('error');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">
                            Install {plugin.name}
                        </h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            X
                        </button>
                    </div>

                    {step === 'site-select' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">
                                Enter the ID of the EmDash site where you want to install this plugin.
                            </p>
                            <input
                                type="text"
                                value={siteId}
                                onChange={(e) => setSiteId(e.target.value)}
                                placeholder="EmDash Site ID"
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={() => setStep('capability-review')}
                                disabled={!siteId.trim()}
                                className="w-full py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                Continue
                            </button>
                        </div>
                    )}

                    {step === 'capability-review' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">
                                This plugin requires the following capabilities:
                            </p>
                            <div className="space-y-1.5">
                                {(plugin.capabilities || []).map((cap: string) => (
                                    <div key={cap} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                                        <span className="text-sm text-gray-700">{cap}</span>
                                    </div>
                                ))}
                                {(!plugin.capabilities || plugin.capabilities.length === 0) && (
                                    <p className="text-sm text-gray-400">No special capabilities required.</p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setStep('site-select')}
                                    className="flex-1 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleInstall}
                                    className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                                >
                                    Approve and Install
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'installing' && (
                        <div className="flex flex-col items-center py-8">
                            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                            <p className="text-sm text-gray-500">Installing plugin...</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-6">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <span className="text-green-600 text-lg">OK</span>
                            </div>
                            <p className="text-sm font-medium text-gray-900">Plugin installed successfully</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {plugin.name} has been installed on site {siteId}
                            </p>
                            <button
                                onClick={onClose}
                                className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                            >
                                Done
                            </button>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="text-center py-6">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <span className="text-red-600 text-lg">!</span>
                            </div>
                            <p className="text-sm font-medium text-red-700">{error}</p>
                            <button
                                onClick={() => setStep('site-select')}
                                className="mt-4 px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
                            >
                                Try Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
