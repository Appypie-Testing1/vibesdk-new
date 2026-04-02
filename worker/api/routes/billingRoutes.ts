/**
 * Setup routes for billing and usage metering endpoints
 */
import { BillingController } from '../controllers/billing/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { adaptController } from '../honoAdapter';

export function setupBillingRoutes(app: Hono<AppEnv>): void {
    // User's own billing - requires authentication
    app.get(
        '/api/billing/usage',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(BillingController, BillingController.getUserBilling),
    );

    // Customer billing by external customer ID - requires authentication
    app.get(
        '/api/billing/customer/:customerId',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(BillingController, BillingController.getCustomerBilling),
    );
}
