import type { DashboardMode } from '../../../shared/types/emdash-context';

interface ModeSwitcherProps {
    currentMode: DashboardMode;
    onModeChange: (mode: DashboardMode) => void;
}

const MODES: Array<{ mode: DashboardMode; label: string; description: string }> = [
    {
        mode: 'plugin-builder',
        label: 'Plugin Builder',
        description: 'Build EmDash CMS plugins with hooks, routes, and storage',
    },
    {
        mode: 'design-studio',
        label: 'Design Studio',
        description: 'Create and customize Astro themes for EmDash',
    },
    {
        mode: 'app-builder',
        label: 'App Builder',
        description: 'Build mobile/web apps consuming EmDash Content API',
    },
];

export function ModeSwitcher({ currentMode, onModeChange }: ModeSwitcherProps) {
    return (
        <div className="flex border-b bg-white px-4">
            {MODES.map(({ mode, label }) => (
                <button
                    key={mode}
                    onClick={() => onModeChange(mode)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        currentMode === mode
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
