import type { MarketplacePluginResponseData } from '@/api-types';

interface PluginCardProps {
    plugin: MarketplacePluginResponseData;
    onSelect: (pluginId: string) => void;
}

export function PluginCard({ plugin, onSelect }: PluginCardProps) {
    const ratingDisplay = plugin.averageRating
        ? `${plugin.averageRating.toFixed(1)} (${plugin.ratingCount})`
        : 'No ratings';

    return (
        <button
            onClick={() => onSelect(plugin.id)}
            className="text-left w-full p-4 bg-white border rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
        >
            <div className="flex items-start gap-3">
                {plugin.iconUrl ? (
                    <img
                        src={plugin.iconUrl}
                        alt={plugin.name}
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                ) : (
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-sm font-bold">
                            {plugin.name.charAt(0).toUpperCase()}
                        </span>
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {plugin.name}
                        </h3>
                        {plugin.pricing !== 'free' && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                                {plugin.pricing === 'paid'
                                    ? `$${plugin.priceUsd?.toFixed(2)}`
                                    : 'Freemium'}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                        {plugin.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{plugin.category}</span>
                        <span>{ratingDisplay}</span>
                        <span>{plugin.installCount} installs</span>
                    </div>
                </div>
            </div>
        </button>
    );
}
