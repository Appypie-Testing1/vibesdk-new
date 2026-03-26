import { useState } from 'react';
import { Button } from '../../../components/primitives/button';
import { Loader, Download, Smartphone, AlertCircle, Info } from 'lucide-react';
import clsx from 'clsx';
import type { EasBuildPlatform, EasBuildStatus } from '@/api-types';

export interface EasBuildInfo {
    buildId: string;
    platform: EasBuildPlatform;
    status: EasBuildStatus;
    progress?: string;
    downloadUrl?: string;
    error?: string;
}

interface EasBuildPanelProps {
    templateRenderMode?: string;
    easBuild?: EasBuildInfo | null;
    onTriggerBuild: (platform: EasBuildPlatform) => void;
    isPreviewDeployed: boolean;
}

function getBuildStatusLabel(status: EasBuildStatus): string {
    switch (status) {
        case 'pending': return 'Queued';
        case 'in-progress': return 'Building';
        case 'finished': return 'Complete';
        case 'errored': return 'Failed';
        case 'cancelled': return 'Cancelled';
    }
}

function getBuildStatusColor(status: EasBuildStatus): string {
    switch (status) {
        case 'pending': return 'text-yellow-600 dark:text-yellow-400';
        case 'in-progress': return 'text-blue-600 dark:text-blue-400';
        case 'finished': return 'text-green-600 dark:text-green-400';
        case 'errored': return 'text-red-600 dark:text-red-400';
        case 'cancelled': return 'text-gray-500 dark:text-gray-400';
    }
}

export function EasBuildPanel({
    templateRenderMode,
    easBuild,
    onTriggerBuild,
    isPreviewDeployed,
}: EasBuildPanelProps) {
    const [selectedPlatform, setSelectedPlatform] = useState<EasBuildPlatform>('android');

    const isMobile = templateRenderMode === 'mobile' || templateRenderMode === 'mobile-fullstack';
    if (!isMobile) return null;

    const isBuilding = easBuild?.status === 'pending' || easBuild?.status === 'in-progress';
    const isFinished = easBuild?.status === 'finished';
    const isErrored = easBuild?.status === 'errored' || easBuild?.status === 'cancelled';
    return (
        <div className="border rounded-lg p-3 bg-bg-2/50 border-text/10 mt-2">
            <div className="flex items-center gap-2 mb-2">
                <Smartphone className="w-4 h-4 text-text-secondary" />
                <span className="text-sm font-medium text-text-primary">Native App Build</span>
            </div>

            {/* Platform selector + trigger */}
            {!isBuilding && (
                <div className="flex items-center gap-2 mb-2">
                    <div className="flex rounded-md border border-text/10 overflow-hidden text-xs">
                        <button
                            onClick={() => setSelectedPlatform('android')}
                            className={clsx(
                                'px-3 py-1.5 transition-colors',
                                selectedPlatform === 'android'
                                    ? 'bg-accent/10 text-accent font-medium'
                                    : 'text-text-secondary hover:bg-bg-3'
                            )}
                        >
                            Android
                        </button>
                        <button
                            onClick={() => setSelectedPlatform('ios')}
                            className={clsx(
                                'px-3 py-1.5 transition-colors border-l border-text/10',
                                selectedPlatform === 'ios'
                                    ? 'bg-accent/10 text-accent font-medium'
                                    : 'text-text-secondary hover:bg-bg-3'
                            )}
                        >
                            iOS
                        </button>
                    </div>
                    <Button
                        onClick={() => onTriggerBuild(selectedPlatform)}
                        disabled={!isPreviewDeployed}
                        className="h-7 px-3 text-xs font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Build {selectedPlatform === 'ios' ? '.ipa' : '.apk'}
                    </Button>
                    {!isPreviewDeployed && (
                        <span className="text-[10px] text-text-tertiary">Deploy preview first</span>
                    )}
                </div>
            )}

            {/* iOS credential info */}
            {selectedPlatform === 'ios' && !isBuilding && (
                <div className="flex items-start gap-1.5 mb-2 text-[11px] text-text-tertiary">
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>Requires App Store Connect API Key credentials in Vault (EXPO_APPLE_TEAM_ID, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID, EXPO_ASC_API_KEY_CONTENT)</span>
                </div>
            )}

            {/* Build status */}
            {easBuild && (
                <div className={clsx(
                    'rounded-md p-2 text-xs border',
                    isBuilding && 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/40 dark:border-blue-800/20',
                    isFinished && 'bg-green-50/50 dark:bg-green-950/20 border-green-200/40 dark:border-green-800/20',
                    isErrored && 'bg-red-50/50 dark:bg-red-950/20 border-red-200/40 dark:border-red-800/20',
                )}>
                    <div className="flex items-center gap-2">
                        {isBuilding && <Loader className="w-3.5 h-3.5 animate-spin text-blue-500" />}
                        {isFinished && <Download className="w-3.5 h-3.5 text-green-500" />}
                        {isErrored && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}

                        <span className={clsx('font-medium', getBuildStatusColor(easBuild.status))}>
                            {easBuild.platform === 'ios' ? 'iOS' : 'Android'} -- {getBuildStatusLabel(easBuild.status)}
                        </span>
                    </div>

                    {isBuilding && (
                        <p className="text-text-tertiary mt-1">
                            {easBuild.progress || (easBuild.buildId
                                ? 'EAS Build is running in the cloud. This usually takes 5-15 minutes.'
                                : 'Setting up build environment...'
                            )}
                        </p>
                    )}

                    {isFinished && easBuild.downloadUrl && (
                        <div className="mt-2">
                            <Button
                                onClick={() => window.open(easBuild.downloadUrl, '_blank')}
                                className="h-7 px-3 text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                            >
                                <Download className="w-3 h-3 mr-1.5" />
                                Download {easBuild.platform === 'ios' ? '.ipa' : '.apk'}
                            </Button>
                        </div>
                    )}

                    {isErrored && easBuild.error && (
                        <div className="mt-1">
                            <p className="text-red-600 dark:text-red-400 break-words">
                                {easBuild.error}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
