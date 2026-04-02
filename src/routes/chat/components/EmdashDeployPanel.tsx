import { useState } from 'react';

type DeployStep = 'idle' | 'building' | 'validating' | 'capability_review' | 'installing' | 'complete' | 'error';

interface EmdashDeployState {
    step: DeployStep;
    capabilities?: string[];
    pluginId?: string;
    siteId?: string;
    error?: string;
}

interface EmdashDeployPanelProps {
    deployState: EmdashDeployState;
    onTriggerDeploy: (targetSiteId: string) => void;
    onApproveCapabilities: (approved: boolean) => void;
}

const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
    'network:fetch': 'Make HTTP requests to external services',
    'read:content': 'Read CMS content entries',
    'write:content': 'Create, update, or delete CMS content',
    'read:media': 'Read media assets from the library',
    'write:media': 'Upload or modify media assets',
    'email:send': 'Send transactional emails',
    'email:deliver': 'SMTP-level email delivery access',
    'page:inject': 'Inject scripts/styles into rendered pages',
    'page:metadata': 'Modify page metadata (title, description, OG tags)',
    'page:fragments': 'Provide content fragments for theme slots',
    'comment:read': 'Read comments',
    'comment:write': 'Create or update comments',
    'comment:moderate': 'Moderate comments (approve, reject, delete)',
    'user:read': 'Read user/member data',
    'cron': 'Run scheduled background tasks',
};

const STEPS: DeployStep[] = ['building', 'validating', 'capability_review', 'installing', 'complete'];
const STEP_LABELS: Record<string, string> = {
    building: 'Build',
    validating: 'Validate',
    capability_review: 'Review',
    installing: 'Install',
    complete: 'Done',
};

function StepIndicator({ currentStep }: { currentStep: DeployStep }) {
    const currentIndex = STEPS.indexOf(currentStep);

    return (
        <div className="flex items-center gap-1 mb-4">
            {STEPS.map((step, i) => {
                const isCompleted = currentIndex > i;
                const isCurrent = currentIndex === i;
                return (
                    <div key={step} className="flex items-center gap-1">
                        <div
                            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                                isCompleted
                                    ? 'bg-green-600 text-white'
                                    : isCurrent
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-500'
                            }`}
                        >
                            {isCompleted ? '\u2713' : i + 1}
                        </div>
                        <span className={`text-xs ${isCurrent ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
                            {STEP_LABELS[step]}
                        </span>
                        {i < STEPS.length - 1 && (
                            <div className={`w-6 h-px ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export function EmdashDeployPanel({ deployState, onTriggerDeploy, onApproveCapabilities }: EmdashDeployPanelProps) {
    const [siteId, setSiteId] = useState('');

    if (deployState.step === 'idle') {
        return (
            <div className="p-4 border rounded-lg bg-white">
                <h3 className="text-sm font-semibold mb-2">Deploy to EmDash</h3>
                <p className="text-xs text-gray-500 mb-3">
                    Build, validate, and install your plugin to an EmDash CMS instance.
                </p>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={siteId}
                        onChange={(e) => setSiteId(e.target.value)}
                        placeholder="EmDash Site ID"
                        className="flex-1 px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                        onClick={() => siteId && onTriggerDeploy(siteId)}
                        disabled={!siteId}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Deploy
                    </button>
                </div>
            </div>
        );
    }

    if (deployState.step === 'error') {
        return (
            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                <h3 className="text-sm font-semibold text-red-700 mb-1">Deployment Failed</h3>
                <p className="text-xs text-red-600">{deployState.error}</p>
                <button
                    onClick={() => siteId && onTriggerDeploy(siteId)}
                    className="mt-2 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-md hover:bg-red-100"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (deployState.step === 'complete') {
        return (
            <div className="p-4 border border-green-200 rounded-lg bg-green-50">
                <StepIndicator currentStep="complete" />
                <h3 className="text-sm font-semibold text-green-700 mb-1">Plugin Deployed</h3>
                <p className="text-xs text-green-600">
                    Plugin <span className="font-mono">{deployState.pluginId}</span> installed on site{' '}
                    <span className="font-mono">{deployState.siteId}</span>.
                </p>
            </div>
        );
    }

    if (deployState.step === 'capability_review') {
        return (
            <div className="p-4 border rounded-lg bg-white">
                <StepIndicator currentStep="capability_review" />
                <h3 className="text-sm font-semibold mb-2">Review Plugin Capabilities</h3>
                <p className="text-xs text-gray-500 mb-3">
                    This plugin requests the following permissions:
                </p>
                <ul className="space-y-1.5 mb-4">
                    {(deployState.capabilities ?? []).map((cap) => (
                        <li key={cap} className="flex items-start gap-2 text-xs">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                            <div>
                                <span className="font-mono text-blue-700">{cap}</span>
                                <span className="text-gray-500 ml-1">
                                    {CAPABILITY_DESCRIPTIONS[cap] ?? ''}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
                <div className="flex gap-2">
                    <button
                        onClick={() => onApproveCapabilities(true)}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                    >
                        Approve & Install
                    </button>
                    <button
                        onClick={() => onApproveCapabilities(false)}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
                    >
                        Reject
                    </button>
                </div>
            </div>
        );
    }

    // In-progress states: building, validating, installing
    return (
        <div className="p-4 border rounded-lg bg-white">
            <StepIndicator currentStep={deployState.step} />
            <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-700">
                    {deployState.step === 'building' && 'Building plugin...'}
                    {deployState.step === 'validating' && 'Validating plugin...'}
                    {deployState.step === 'installing' && 'Installing to EmDash...'}
                </span>
            </div>
        </div>
    );
}
