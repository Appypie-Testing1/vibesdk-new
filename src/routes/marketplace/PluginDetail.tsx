import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { apiClient } from '@/lib/api-client';
import type { MarketplacePluginResponseData, MarketplaceRatingsResponseData } from '@/api-types';

export default function PluginDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [plugin, setPlugin] = useState<MarketplacePluginResponseData | null>(null);
    const [ratings, setRatings] = useState<MarketplaceRatingsResponseData | null>(null);
    const [loading, setLoading] = useState(true);
    const [installSiteId, setInstallSiteId] = useState('');
    const [installing, setInstalling] = useState(false);
    const [installSuccess, setInstallSuccess] = useState(false);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        Promise.all([
            apiClient.getMarketplacePlugin(id),
            apiClient.getPluginRatings(id),
        ]).then(([pluginRes, ratingsRes]) => {
            if (pluginRes.data) setPlugin(pluginRes.data);
            if (ratingsRes.data) setRatings(ratingsRes.data);
        }).finally(() => setLoading(false));
    }, [id]);

    const handleInstall = async () => {
        if (!id || !installSiteId.trim()) return;
        setInstalling(true);
        try {
            const result = await apiClient.installMarketplacePlugin(id, installSiteId.trim());
            if (result.data) {
                setInstallSuccess(true);
            }
        } finally {
            setInstalling(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!plugin) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-8 text-center">
                <p className="text-gray-500">Plugin not found</p>
                <button
                    onClick={() => navigate('/marketplace')}
                    className="mt-4 text-sm text-blue-600 hover:underline"
                >
                    Back to Marketplace
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <button
                onClick={() => navigate('/marketplace')}
                className="text-sm text-gray-500 hover:text-gray-700 mb-4"
            >
                Back to Marketplace
            </button>

            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
                {plugin.iconUrl ? (
                    <img src={plugin.iconUrl} alt={plugin.name} className="w-16 h-16 rounded-xl object-cover" />
                ) : (
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-white text-xl font-bold">{plugin.name.charAt(0).toUpperCase()}</span>
                    </div>
                )}
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-gray-900">{plugin.name}</h1>
                    <p className="text-sm text-gray-500 mt-1">{plugin.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span className="px-2 py-0.5 bg-gray-100 rounded">{plugin.category}</span>
                        <span>v{plugin.version}</span>
                        <span>{plugin.installCount} installs</span>
                        {plugin.averageRating && (
                            <span>{plugin.averageRating.toFixed(1)} ({plugin.ratingCount} ratings)</span>
                        )}
                    </div>
                </div>
                <div className="text-right">
                    {plugin.pricing === 'free' ? (
                        <span className="text-sm font-medium text-green-600">Free</span>
                    ) : (
                        <span className="text-sm font-medium text-gray-900">
                            ${plugin.priceUsd?.toFixed(2)}
                        </span>
                    )}
                </div>
            </div>

            {/* Capabilities */}
            {plugin.capabilities && plugin.capabilities.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-2">Capabilities</h2>
                    <div className="flex flex-wrap gap-1.5">
                        {plugin.capabilities.map((cap: string) => (
                            <span
                                key={cap}
                                className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded"
                            >
                                {cap}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Install */}
            <div className="border rounded-lg p-4 mb-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Install to EmDash Site</h2>
                {installSuccess ? (
                    <p className="text-sm text-green-600">Plugin installed successfully.</p>
                ) : (
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={installSiteId}
                            onChange={(e) => setInstallSiteId(e.target.value)}
                            placeholder="Enter your EmDash site ID"
                            className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={handleInstall}
                            disabled={installing || !installSiteId.trim()}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {installing ? 'Installing...' : 'Install'}
                        </button>
                    </div>
                )}
            </div>

            {/* Ratings */}
            {ratings && ratings.ratings.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-gray-700 mb-3">
                        Reviews ({ratings.count})
                    </h2>
                    <div className="space-y-3">
                        {ratings.ratings.map((r) => (
                            <div key={r.id} className="border rounded-lg p-3">
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span className="font-medium text-gray-700">
                                        {'*'.repeat(r.rating)}{'*'.repeat(0)}
                                    </span>
                                    <span>{r.rating}/5</span>
                                </div>
                                {r.reviewText && (
                                    <p className="text-sm text-gray-600 mt-1">{r.reviewText}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
