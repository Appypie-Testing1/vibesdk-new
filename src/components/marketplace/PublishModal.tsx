import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface PublishModalProps {
    appId: string;
    onClose: () => void;
    onPublished: (pluginId: string) => void;
}

const CATEGORIES = [
    'content', 'commerce', 'analytics', 'communication',
    'media', 'security', 'integration', 'other',
];

export function PublishModal({ appId, onClose, onPublished }: PublishModalProps) {
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('other');
    const [tags, setTags] = useState('');
    const [pricing, setPricing] = useState<'free' | 'paid' | 'freemium'>('free');
    const [priceUsd, setPriceUsd] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !slug.trim() || !description.trim()) {
            setError('Name, slug, and description are required');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const result = await apiClient.submitMarketplacePlugin({
                appId,
                name: name.trim(),
                slug: slug.trim(),
                description: description.trim(),
                category,
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                pricing,
                priceUsd: pricing === 'paid' ? parseFloat(priceUsd) || undefined : undefined,
            });

            if (result.data?.plugin) {
                onPublished(result.data.plugin.id);
            } else {
                setError('Failed to submit plugin');
            }
        } catch {
            setError('An error occurred while submitting');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">
                            Publish to Marketplace
                        </h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            X
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Plugin Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    if (!slug) setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
                                }}
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="My Plugin"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Slug</label>
                            <input
                                type="text"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="my-plugin"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Describe what your plugin does..."
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c} value={c}>
                                        {c.charAt(0).toUpperCase() + c.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Tags (comma-separated)</label>
                            <input
                                type="text"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="stripe, payments, email"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Pricing</label>
                            <div className="flex gap-2">
                                {(['free', 'paid', 'freemium'] as const).map(p => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setPricing(p)}
                                        className={`px-3 py-1.5 text-xs rounded-full ${
                                            pricing === p
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 text-gray-600'
                                        }`}
                                    >
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {pricing === 'paid' && (
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Price (USD)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={priceUsd}
                                    onChange={(e) => setPriceUsd(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="9.99"
                                />
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {submitting ? 'Submitting...' : 'Submit for Review'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
