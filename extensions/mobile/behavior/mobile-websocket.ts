import { createLogger } from 'worker/logger';
import { WebSocketMessageResponses } from 'worker/agents/constants';
import { sendToConnection, broadcastToConnections } from 'worker/agents/core/websocket';
import type { CodeGeneratorAgent } from 'worker/agents/core/codingAgent';

const logger = createLogger('MobileWebSocket');

/**
 * Handle the EAS_BUILD_TRIGGER WebSocket message.
 * Validates the platform, retrieves the EXPO_TOKEN from the vault,
 * and kicks off the EAS build via the deployment manager.
 */
export async function handleEasBuildTrigger(
    agent: CodeGeneratorAgent,
    connection: WebSocket,
    data: { platform: string },
): Promise<void> {
    const platform = data.platform;
    if (platform !== 'ios' && platform !== 'android') {
        sendToConnection(connection, 'error', { error: 'Invalid platform. Must be "ios" or "android".' });
        return;
    }

    logger.info('EAS build trigger received', { platform });

    try {
        const expoToken = await agent.getDecryptedSecret({ envVarName: 'EXPO_TOKEN' });
        if (!expoToken) {
            sendToConnection(connection, WebSocketMessageResponses.VAULT_REQUIRED, {
                reason: 'EXPO_TOKEN is required to build native apps with EAS. Create one at https://expo.dev/accounts/[username]/settings/access-tokens',
                provider: 'expo',
                envVarName: 'EXPO_TOKEN',
            });
            // Also send build error so frontend clears the pending state
            sendToConnection(connection, WebSocketMessageResponses.EAS_BUILD_ERROR, {
                buildId: '',
                platform: platform as 'ios' | 'android',
                error: 'EXPO_TOKEN is required. Please add your Expo access token first.',
            });
            return;
        }

        await agent.deploymentManager.triggerEasBuild(platform as 'ios' | 'android', expoToken, {
            onStatus: (build) => {
                broadcastToConnections(agent, WebSocketMessageResponses.EAS_BUILD_STATUS, {
                    buildId: build.buildId,
                    platform: build.platform,
                    status: build.status,
                });
            },
            onProgress: (message) => {
                // Send intermediate progress so user sees what's happening
                sendToConnection(connection, WebSocketMessageResponses.EAS_BUILD_STATUS, {
                    buildId: '',
                    platform: platform as 'ios' | 'android',
                    status: 'pending',
                    progress: message,
                });
            },
            onError: (error) => {
                sendToConnection(connection, WebSocketMessageResponses.EAS_BUILD_ERROR, {
                    buildId: '',
                    platform: platform as 'ios' | 'android',
                    error,
                });
            },
            scheduleAlarm: (delayMs) => agent.scheduleEasBuildPoll(delayMs),
        });
    } catch (error: unknown) {
        logger.error('Error triggering EAS build:', error);
        sendToConnection(connection, WebSocketMessageResponses.EAS_BUILD_ERROR, {
            buildId: '',
            platform: platform as 'ios' | 'android',
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Handle the eas_build_check WebSocket message.
 * Manual check/recovery for stuck EAS builds: resumes polling if active,
 * or re-sends the final status if the build already completed.
 */
export function handleEasBuildCheck(
    agent: CodeGeneratorAgent,
    connection: WebSocket,
): void {
    const easBuild = agent.state.easBuild;
    if (easBuild && (easBuild.status === 'pending' || easBuild.status === 'in-progress')) {
        logger.info('Manual EAS build check requested, resuming polling', { buildId: easBuild.buildId });
        agent.scheduleEasBuildPoll(3_000);
        sendToConnection(connection, WebSocketMessageResponses.EAS_BUILD_STATUS, {
            buildId: easBuild.buildId,
            platform: easBuild.platform,
            status: easBuild.status,
        });
    } else if (easBuild) {
        // Build already finished/errored, resend the final status
        if (easBuild.status === 'finished') {
            sendToConnection(connection, WebSocketMessageResponses.EAS_BUILD_COMPLETE, {
                buildId: easBuild.buildId,
                platform: easBuild.platform,
                artifactUrl: easBuild.artifactUrl || easBuild.easArtifactUrl || '',
                downloadUrl: easBuild.artifactUrl
                    ? `/api/agent/${agent.getAgentId()}/builds/${easBuild.buildId}/download`
                    : '',
            });
        } else if (easBuild.status === 'errored' || easBuild.status === 'cancelled') {
            sendToConnection(connection, WebSocketMessageResponses.EAS_BUILD_ERROR, {
                buildId: easBuild.buildId,
                platform: easBuild.platform,
                error: easBuild.error || 'Build failed',
            });
        }
    }
}

/**
 * Resume EAS build polling if a build is stuck in an active state.
 * Called on WebSocket reconnect (onConnect) and when fetching conversation state.
 */
export function resumeEasBuildPolling(agent: CodeGeneratorAgent): void {
    const easBuild = agent.state.easBuild;
    if (easBuild && (easBuild.status === 'pending' || easBuild.status === 'in-progress')) {
        logger.info('Resuming EAS build polling', { buildId: easBuild.buildId, status: easBuild.status });
        agent.scheduleEasBuildPoll(5_000);
    }
}
