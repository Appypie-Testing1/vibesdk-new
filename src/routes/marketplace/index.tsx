import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { apiClient } from '@/lib/api-client';
import { PluginCard } from '@/components/marketplace/PluginCard';
import type { MarketplacePluginResponseData } from '@/api-types';

const CATEGORIES = [
    { value: '', label: 'All' },
    { value: 'content', label: 'Content' },
    { value: 'commerce', label: 'Commerce' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'communication', label: 'Communication' },
    { value: 'media', label: 'Media' },
    { value: 'security', label: 'Security' },
    { value: 'integration', label: 'Integration' },
    { value: 'other', label: 'Other' },
];

export default function MarketplacePage() {
    const navigate = useNavigate();
    const [plugins, setPlugins] = useState<MarketplacePluginResponseData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const perPage = 20;

    const fetchPlugins = useCallback(async () => {
        setLoading(true);
        try {
            const result = await apiClient.listMarketplacePlugins({
                search: search || undefined,
                category: category || undefined,
                page,
                perPage,
            });
            if (result.data) {
                setPlugins(result.data.plugins);
                setTotal(result.data.total);
            }
        } finally {
            setLoading(false);
        }
    }, [search, category, page]);

    useEffect(() => {
        fetchPlugins();
    }, [fetchPlugins]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchPlugins();
    };

    const totalPages = Math.ceil(total / perPage);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Plugin Marketplace</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Browse, install, and publish EmDash CMS plugins
                </p>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <form onSubmit={handleSearch} className="flex-1">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search plugins..."
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </form>
                <div className="flex gap-1 overflow-x-auto">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.value}
                            onClick={() => {
                                setCategory(cat.value);
                                setPage(1);
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                                category === cat.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Plugin grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : plugins.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                    <p className="text-sm">No plugins found</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {plugins.map((plugin) => (
                            <PluginCard
                                key={plugin.id}
                                plugin={plugin}
                                onSelect={(id) => navigate(`/marketplace/${id}`)}
                            />
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-8">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <span className="text-sm text-gray-500">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
