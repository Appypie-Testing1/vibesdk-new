import { BaseController } from '../baseController';
import type { ControllerResponse, ApiResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';

// -------------------------
// Helpers
// -------------------------
function isValidSessionId(id: string): boolean {
    // Allow alphanumeric, underscore, dash. Prevent dots and slashes.
    // Length 1-128.
    return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

function validateFileName(file: string): string | null {
    // Reject path traversal and separators first — these are the real security threats
    if (file.includes('..') || file.includes('/') || file.includes('\\') || file.includes('\0')) {
        return null;
    }
    // Disallow leading dot files
    if (file.startsWith('.')) {
        return null;
    }
    // Allow alphanumeric, spaces, dots, hyphens, underscores, parentheses, and @.
    // Spaces appear in common upload filenames (e.g. "WhatsApp Image 2024-01-01.jpeg").
    // Path separators and traversal are already rejected above.
    if (!/^[A-Za-z0-9 ._\-@()]{1,256}$/.test(file)) {
        return null;
    }
    // Validate extension
    const extIndex = file.lastIndexOf('.');
    if (extIndex <= 0 || extIndex === file.length - 1) {
        return null;
    }
    const ext = file.substring(extIndex + 1).toLowerCase();
    const allowed = new Set(['png', 'jpg', 'jpeg', 'webp']);
    if (!allowed.has(ext)) {
        return null;
    }
    return file;
}

function getMimeByExtension(file: string): string | undefined {
    const ext = file.substring(file.lastIndexOf('.') + 1).toLowerCase();
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        default: return undefined;
    }
}
export class ScreenshotsController extends BaseController {
    static logger = createLogger('ScreenshotsController');

    private static async serveFromR2(
        env: Env,
        r2KeyPrefix: string,
        id: string | undefined,
        file: string | undefined,
        notFoundMessage: string,
    ): Promise<ControllerResponse<ApiResponse<never>>> {
        if (!id || !file) {
            return ScreenshotsController.createErrorResponse('Missing path parameters', 400);
        }

        if (!isValidSessionId(id)) {
            return ScreenshotsController.createErrorResponse('Invalid id', 400);
        }

        const validatedFile = validateFileName(file);
        if (!validatedFile) {
            return ScreenshotsController.createErrorResponse('Invalid file name', 400);
        }

        // R2 keys use encodeURIComponent for the filename (see uploadImageToR2)
        const key = `${r2KeyPrefix}/${id}/${encodeURIComponent(validatedFile)}`;
        const obj = await env.TEMPLATES_BUCKET.get(key);
        if (!obj || !obj.body) {
            return ScreenshotsController.createErrorResponse(notFoundMessage, 404);
        }

        const contentType = obj.httpMetadata?.contentType || getMimeByExtension(validatedFile) || 'image/png';
        const headers = new Headers({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
        });

        // We return a naked Response because our controller helper types expect JSON, but this route is binary.
        // It's safe because the router uses this Response directly.
        return new Response(obj.body, { headers }) as unknown as ControllerResponse<ApiResponse<never>>;
    }

    static async serveScreenshot(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<never>>> {
        try {
            return await ScreenshotsController.serveFromR2(
                env,
                'screenshots',
                context.pathParams.id,
                context.pathParams.file,
                'Screenshot not found',
            );
        } catch (error) {
            this.logger.error('Error serving screenshot', { error });
            return ScreenshotsController.createErrorResponse('Internal server error', 500);
        }
    }

    static async serveUpload(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<never>>> {
        try {
            return await ScreenshotsController.serveFromR2(
                env,
                'uploads',
                context.pathParams.id,
                context.pathParams.file,
                'Upload not found',
            );
        } catch (error) {
            this.logger.error('Error serving upload', { error });
            return ScreenshotsController.createErrorResponse('Internal server error', 500);
        }
    }
}
