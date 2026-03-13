import { BaseController } from '../baseController';
import type { ControllerResponse, ApiResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';

export class BuildsController extends BaseController {
    static logger = createLogger('BuildsController');

    /**
     * Serve an EAS build artifact from R2.
     * Route: GET /api/agent/:agentId/builds/:buildId/download
     */
    static async downloadBuildArtifact(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<never>>> {
        const { agentId, buildId } = context.pathParams;
        if (!agentId || !buildId) {
            return BuildsController.createErrorResponse('Missing agentId or buildId', 400);
        }

        // Validate format
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(agentId) || !/^[a-f0-9-]{1,128}$/.test(buildId)) {
            return BuildsController.createErrorResponse('Invalid parameter format', 400);
        }

        try {
            // Try both extensions
            for (const ext of ['apk', 'ipa']) {
                const key = `eas-builds/${agentId}/${buildId}.${ext}`;
                const obj = await env.R2_BUCKET.get(key);
                if (obj && obj.body) {
                    const contentType = ext === 'ipa'
                        ? 'application/octet-stream'
                        : 'application/vnd.android.package-archive';
                    const filename = `build-${buildId}.${ext}`;
                    const headers = new Headers({
                        'Content-Type': contentType,
                        'Content-Disposition': `attachment; filename="${filename}"`,
                        'Cache-Control': 'private, max-age=3600',
                        'X-Content-Type-Options': 'nosniff',
                    });
                    return new Response(obj.body, { headers }) as unknown as ControllerResponse<ApiResponse<never>>;
                }
            }

            return BuildsController.createErrorResponse('Build artifact not found', 404);
        } catch (error) {
            BuildsController.logger.error('Error serving build artifact', { error, agentId, buildId });
            return BuildsController.createErrorResponse('Internal server error', 500);
        }
    }
}
