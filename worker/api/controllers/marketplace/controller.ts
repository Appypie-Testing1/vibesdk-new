/**
 * Marketplace Controller
 * Handles plugin marketplace API endpoints.
 */

import { drizzle } from 'drizzle-orm/d1';
import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { ApiResponse, ControllerResponse } from '../types';
import { MarketplaceService } from '../../../database/services/MarketplaceService';
import { createLogger } from '../../../logger';
import type {
    MarketplaceListResponseData,
    MarketplacePluginResponseData,
    MarketplacePublishResponseData,
    MarketplaceInstallResponseData,
    MarketplaceReviewResponseData,
    MarketplaceRatingsResponseData,
    MarketplaceRevenueResponseData,
} from './types';

export class MarketplaceController extends BaseController {
    static logger = createLogger('MarketplaceController');

    private static getService(env: Env) {
        const db = drizzle(env.DB);
        return new MarketplaceService(db);
    }

    /**
     * List marketplace plugins with optional filters
     * GET /api/marketplace/plugins
     */
    static async listPlugins(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<MarketplaceListResponseData>>> {
        try {
            const service = this.getService(env);
            const params = context.queryParams;

            const page = parseInt(params.get('page') || '1');
            const perPage = Math.min(parseInt(params.get('per_page') || '20'), 100);

            const result = await service.listPlugins({
                status: (params.get('status') as 'published') || 'published',
                category: params.get('category') || undefined,
                search: params.get('search') || undefined,
                page,
                perPage,
            });

            return MarketplaceController.createSuccessResponse({
                ...result,
                page,
                perPage,
            });
        } catch (error) {
            this.logger.error('Error listing marketplace plugins:', error);
            return MarketplaceController.createErrorResponse<MarketplaceListResponseData>(
                'Failed to list plugins',
                500,
            );
        }
    }

    /**
     * Get a single plugin detail
     * GET /api/marketplace/plugins/:id
     */
    static async getPlugin(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<MarketplacePluginResponseData>>> {
        try {
            const service = this.getService(env);
            const pluginId = context.pathParams.id;

            if (!pluginId) {
                return MarketplaceController.createErrorResponse<MarketplacePluginResponseData>(
                    'Plugin ID is required',
                    400,
                );
            }

            const plugin = await service.getPlugin(pluginId);
            if (!plugin) {
                return MarketplaceController.createErrorResponse<MarketplacePluginResponseData>(
                    'Plugin not found',
                    404,
                );
            }

            return MarketplaceController.createSuccessResponse(plugin);
        } catch (error) {
            this.logger.error('Error getting marketplace plugin:', error);
            return MarketplaceController.createErrorResponse<MarketplacePluginResponseData>(
                'Failed to get plugin',
                500,
            );
        }
    }

    /**
     * Submit a plugin for review (from an existing app/agent)
     * POST /api/marketplace/plugins
     */
    static async submitPlugin(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<MarketplacePublishResponseData>>> {
        try {
            const authUser = context.user!;
            const body = await MarketplaceController.parseJsonBody<{
                appId: string;
                name: string;
                slug: string;
                description: string;
                category: string;
                tags?: string[];
                capabilities?: string[];
                pricing?: 'free' | 'paid' | 'freemium';
                priceUsd?: number;
            }>(request);

            if (!body.success || !body.data) {
                return MarketplaceController.createErrorResponse<MarketplacePublishResponseData>(
                    'Invalid request body',
                    400,
                );
            }

            const { appId, name, slug, description, category, tags, capabilities, pricing, priceUsd } = body.data;
            if (!appId || !name || !slug || !description || !category) {
                return MarketplaceController.createErrorResponse<MarketplacePublishResponseData>(
                    'Missing required fields: appId, name, slug, description, category',
                    400,
                );
            }

            const service = this.getService(env);
            const id = crypto.randomUUID();

            const plugin = await service.createPlugin({
                id,
                appId,
                publisherId: authUser.id,
                name,
                slug,
                description,
                category,
                tags: tags ?? [],
                capabilities: capabilities ?? [],
                pricing: pricing ?? 'free',
                priceUsd: priceUsd ?? null,
                status: 'pending_review',
            });

            this.logger.info('Plugin submitted for review', {
                pluginId: plugin.id,
                publisherId: authUser.id,
                name,
            });

            return MarketplaceController.createSuccessResponse({ plugin });
        } catch (error) {
            this.logger.error('Error submitting plugin:', error);
            return MarketplaceController.createErrorResponse<MarketplacePublishResponseData>(
                'Failed to submit plugin',
                500,
            );
        }
    }

    /**
     * Install a plugin to an EmDash site
     * POST /api/marketplace/plugins/:id/install
     */
    static async installPlugin(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<MarketplaceInstallResponseData>>> {
        try {
            const authUser = context.user!;
            const pluginId = context.pathParams.id;

            if (!pluginId) {
                return MarketplaceController.createErrorResponse<MarketplaceInstallResponseData>(
                    'Plugin ID is required',
                    400,
                );
            }

            const body = await MarketplaceController.parseJsonBody<{ siteId: string }>(request);
            if (!body.success || !body.data?.siteId) {
                return MarketplaceController.createErrorResponse<MarketplaceInstallResponseData>(
                    'siteId is required',
                    400,
                );
            }

            const service = this.getService(env);

            // Verify plugin exists and is published
            const plugin = await service.getPlugin(pluginId);
            if (!plugin || plugin.status !== 'published') {
                return MarketplaceController.createErrorResponse<MarketplaceInstallResponseData>(
                    'Plugin not found or not published',
                    404,
                );
            }

            const install = await service.installPlugin(pluginId, authUser.id, body.data.siteId);

            return MarketplaceController.createSuccessResponse({
                pluginId,
                siteId: body.data.siteId,
                installedAt: install.installedAt?.toISOString() ?? new Date().toISOString(),
            });
        } catch (error) {
            this.logger.error('Error installing plugin:', error);
            return MarketplaceController.createErrorResponse<MarketplaceInstallResponseData>(
                'Failed to install plugin',
                500,
            );
        }
    }

    /**
     * Admin: review a plugin (approve/reject)
     * POST /api/marketplace/plugins/:id/review
     */
    static async reviewPlugin(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<MarketplaceReviewResponseData>>> {
        try {
            const authUser = context.user!;
            const pluginId = context.pathParams.id;

            if (!pluginId) {
                return MarketplaceController.createErrorResponse<MarketplaceReviewResponseData>(
                    'Plugin ID is required',
                    400,
                );
            }

            const body = await MarketplaceController.parseJsonBody<{
                status: 'approved' | 'rejected';
                notes?: string;
            }>(request);

            if (!body.success || !body.data?.status) {
                return MarketplaceController.createErrorResponse<MarketplaceReviewResponseData>(
                    'Review status is required (approved or rejected)',
                    400,
                );
            }

            const service = this.getService(env);
            await service.recordReview(
                pluginId,
                authUser.id,
                body.data.status,
                body.data.notes,
            );

            return MarketplaceController.createSuccessResponse({
                pluginId,
                status: body.data.status,
            });
        } catch (error) {
            this.logger.error('Error reviewing plugin:', error);
            return MarketplaceController.createErrorResponse<MarketplaceReviewResponseData>(
                'Failed to review plugin',
                500,
            );
        }
    }

    /**
     * Get or submit ratings for a plugin
     * GET /api/marketplace/plugins/:id/ratings
     */
    static async getPluginRatings(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<MarketplaceRatingsResponseData>>> {
        try {
            const pluginId = context.pathParams.id;
            if (!pluginId) {
                return MarketplaceController.createErrorResponse<MarketplaceRatingsResponseData>(
                    'Plugin ID is required',
                    400,
                );
            }

            const service = this.getService(env);
            const [ratings, plugin] = await Promise.all([
                service.getPluginRatings(pluginId),
                service.getPlugin(pluginId),
            ]);

            return MarketplaceController.createSuccessResponse({
                ratings,
                averageRating: plugin?.averageRating ?? null,
                count: ratings.length,
            });
        } catch (error) {
            this.logger.error('Error getting ratings:', error);
            return MarketplaceController.createErrorResponse<MarketplaceRatingsResponseData>(
                'Failed to get ratings',
                500,
            );
        }
    }

    /**
     * Submit a rating
     * POST /api/marketplace/plugins/:id/ratings
     */
    static async submitRating(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<MarketplaceRatingsResponseData>>> {
        try {
            const authUser = context.user!;
            const pluginId = context.pathParams.id;

            if (!pluginId) {
                return MarketplaceController.createErrorResponse<MarketplaceRatingsResponseData>(
                    'Plugin ID is required',
                    400,
                );
            }

            const body = await MarketplaceController.parseJsonBody<{
                rating: number;
                reviewText?: string;
            }>(request);

            if (!body.success || !body.data?.rating) {
                return MarketplaceController.createErrorResponse<MarketplaceRatingsResponseData>(
                    'rating (1-5) is required',
                    400,
                );
            }

            const { rating, reviewText } = body.data;
            if (rating < 1 || rating > 5) {
                return MarketplaceController.createErrorResponse<MarketplaceRatingsResponseData>(
                    'Rating must be between 1 and 5',
                    400,
                );
            }

            const service = this.getService(env);
            await service.ratePlugin({
                id: crypto.randomUUID(),
                pluginId,
                userId: authUser.id,
                rating,
                reviewText: reviewText ?? null,
            });

            // Return updated ratings
            const [ratings, plugin] = await Promise.all([
                service.getPluginRatings(pluginId),
                service.getPlugin(pluginId),
            ]);

            return MarketplaceController.createSuccessResponse({
                ratings,
                averageRating: plugin?.averageRating ?? null,
                count: ratings.length,
            });
        } catch (error) {
            this.logger.error('Error submitting rating:', error);
            return MarketplaceController.createErrorResponse<MarketplaceRatingsResponseData>(
                'Failed to submit rating',
                500,
            );
        }
    }

    /**
     * Get revenue dashboard for a publisher
     * GET /api/marketplace/revenue/:publisherId
     */
    static async getRevenue(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<MarketplaceRevenueResponseData>>> {
        try {
            const authUser = context.user!;
            const publisherId = context.pathParams.publisherId;

            if (!publisherId) {
                return MarketplaceController.createErrorResponse<MarketplaceRevenueResponseData>(
                    'Publisher ID is required',
                    400,
                );
            }

            // Verify user can only access their own revenue
            if (authUser.id !== publisherId) {
                return MarketplaceController.createErrorResponse<MarketplaceRevenueResponseData>(
                    'You can only access your own revenue data',
                    403,
                );
            }

            const service = this.getService(env);
            const revenue = await service.getPublisherRevenue(publisherId);

            return MarketplaceController.createSuccessResponse({
                publisherId,
                ...revenue,
            });
        } catch (error) {
            this.logger.error('Error getting revenue:', error);
            return MarketplaceController.createErrorResponse<MarketplaceRevenueResponseData>(
                'Failed to get revenue data',
                500,
            );
        }
    }
}
