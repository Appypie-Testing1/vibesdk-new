import type { DashboardConfig, DashboardMode } from '../../../shared/types/emdash-context';

interface EmbedChatProps {
    config: DashboardConfig;
}

/**
 * White-labeled chat component for the embedded dashboard.
 * Wraps the standard VibeSDK chat with mode-specific context.
 */
export function EmbedChat({ config }: EmbedChatProps) {
    const placeholder = getPlaceholderForMode(config.mode);

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="max-w-2xl w-full">
                <h2 className="text-xl font-semibold text-gray-800 mb-2 text-center">
                    {getTitleForMode(config.mode)}
                </h2>
                <p className="text-sm text-gray-500 mb-6 text-center">
                    {getDescriptionForMode(config.mode)}
                </p>
                <div className="relative">
                    <textarea
                        placeholder={placeholder}
                        rows={3}
                        className="w-full px-4 py-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button className="absolute right-3 bottom-3 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                        Build
                    </button>
                </div>
                {config.emdashContext && (
                    <div className="mt-4 p-3 bg-gray-100 rounded-md">
                        <p className="text-xs text-gray-500 mb-1">Connected EmDash site:</p>
                        <p className="text-xs font-mono text-gray-700">{config.emdashContext.siteUrl}</p>
                        <p className="text-xs text-gray-500 mt-1">
                            {config.emdashContext.contentTypes.length} content types,{' '}
                            {config.emdashContext.installedPlugins.length} plugins installed
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function getTitleForMode(mode: DashboardMode): string {
    switch (mode) {
        case 'plugin-builder': return 'Build a Plugin';
        case 'design-studio': return 'Design a Theme';
        case 'app-builder': return 'Build an App';
    }
}

function getDescriptionForMode(mode: DashboardMode): string {
    switch (mode) {
        case 'plugin-builder':
            return 'Describe the plugin you want and AI will generate a working EmDash CMS plugin with hooks, routes, and admin pages.';
        case 'design-studio':
            return 'Describe the look and feel you want and AI will generate an Astro theme integrated with your EmDash content.';
        case 'app-builder':
            return 'Describe the app you want and AI will generate a mobile or web app powered by your EmDash content.';
    }
}

function getPlaceholderForMode(mode: DashboardMode): string {
    switch (mode) {
        case 'plugin-builder':
            return 'e.g., "Build a Stripe payments plugin that sends email receipts after purchase"';
        case 'design-studio':
            return 'e.g., "Create a calm, earthy yoga studio website with a blog and class schedule"';
        case 'app-builder':
            return 'e.g., "Build a mobile app for browsing and bookmarking our blog posts"';
    }
}
