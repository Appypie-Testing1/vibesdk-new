/**
 * Setup routes for plugin marketplace endpoints
 */
import { MarketplaceController } from '../controllers/marketplace/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { adaptController } from '../honoAdapter';

export function setupMarketplaceRoutes(app: Hono<AppEnv>): void {
    // Public: browse marketplace
    app.get(
        '/api/marketplace/plugins',
        setAuthLevel(AuthConfig.public),
        adaptController(MarketplaceController, MarketplaceController.listPlugins),
    );

    // Public: get plugin detail
    app.get(
        '/api/marketplace/plugins/:id',
        setAuthLevel(AuthConfig.public),
        adaptController(MarketplaceController, MarketplaceController.getPlugin),
    );

    // Authenticated: submit plugin for review
    app.post(
        '/api/marketplace/plugins',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(MarketplaceController, MarketplaceController.submitPlugin),
    );

    // Authenticated: install plugin to EmDash site
    app.post(
        '/api/marketplace/plugins/:id/install',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(MarketplaceController, MarketplaceController.installPlugin),
    );

    // Admin: approve/reject plugin
    app.post(
        '/api/marketplace/plugins/:id/review',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(MarketplaceController, MarketplaceController.reviewPlugin),
    );

    // Public: get plugin ratings
    app.get(
        '/api/marketplace/plugins/:id/ratings',
        setAuthLevel(AuthConfig.public),
        adaptController(MarketplaceController, MarketplaceController.getPluginRatings),
    );

    // Authenticated: submit a rating
    app.post(
        '/api/marketplace/plugins/:id/ratings',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(MarketplaceController, MarketplaceController.submitRating),
    );

    // Authenticated: get publisher revenue
    app.get(
        '/api/marketplace/revenue/:publisherId',
        setAuthLevel(AuthConfig.ownerOnly),
        adaptController(MarketplaceController, MarketplaceController.getRevenue),
    );
}
