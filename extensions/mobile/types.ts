export type EasBuildPlatform = 'ios' | 'android';
export type EasBuildStatus = 'pending' | 'in-progress' | 'finished' | 'errored' | 'cancelled';

export interface EasBuildState {
    buildId: string;
    platform: EasBuildPlatform;
    status: EasBuildStatus;
    startedAt: number;
    artifactUrl?: string;
    easArtifactUrl?: string;
    error?: string;
    pollFailures?: number;
}
