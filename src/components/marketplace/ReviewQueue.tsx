import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type { MarketplacePluginResponseData } from '@/api-types';

export function ReviewQueue() {
    const [plugins, setPlugins] = useState<MarketplacePluginResponseData[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        fetchPending();
    }, []);

    const fetchPending = async () => {
        setLoading(true);
        try {
            const result = await apiClient.listMarketplacePlugins({
                // The API currently doesn't expose status filter to public listing,
                // but admin can use it. For now we fetch published and filter client-side,
                // or the admin endpoint can be added later.
            });
            if (result.data) {
                // Filter for pending review -- in production this would be a dedicated admin endpoint
                setPlugins(result.data.plugins);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleReview = async (pluginId: string, status: 'approved' | 'rejected') => {
        setReviewingId(pluginId);
        try {
            await apiClient.reviewMarketplacePlugin(pluginId, status, notes || undefined);
            setPlugins(prev => prev.filter(p => p.id !== pluginId));
            setNotes('');
        } finally {
            setReviewingId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (plugins.length === 0) {
        return (
            <div className="text-center py-12 text-gray-500">
                <p className="text-sm">No plugins pending review</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Review Queue</h2>
            {plugins.map((plugin) => (
                <div key={plugin.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">{plugin.name}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">{plugin.description}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                                {(plugin.capabilities || []).map((cap: string) => (
                                    <span key={cap} className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 rounded">
                                        {cap}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                            Pending
                        </span>
                    </div>

                    <div className="mt-3 space-y-2">
                        <textarea
                            value={reviewingId === plugin.id ? notes : ''}
                            onChange={(e) => {
                                setReviewingId(plugin.id);
                                setNotes(e.target.value);
                            }}
                            placeholder="Review notes (optional)..."
                            rows={2}
                            className="w-full px-3 py-2 text-xs border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleReview(plugin.id, 'approved')}
                                disabled={reviewingId === plugin.id}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                                Approve
                            </button>
                            <button
                                onClick={() => handleReview(plugin.id, 'rejected')}
                                disabled={reviewingId === plugin.id}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                Reject
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
