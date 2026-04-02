/**
 * Billing Controller
 * Handles billing and usage metering API endpoints
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { ApiResponse, ControllerResponse } from '../types';
import { BillingMeter } from '../../../services/analytics/BillingMeter';
import { CustomerBillingResponseData, UserBillingResponseData } from './types';
import { createLogger } from '../../../logger';

export class BillingController extends BaseController {
    static logger = createLogger('BillingController');

    /**
     * Get billing data for the authenticated user
     * GET /api/billing/usage
     */
    static async getUserBilling(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<UserBillingResponseData>>> {
        try {
            const authUser = context.user!;

            const url = new URL(request.url);
            const { startDate, endDate } = BillingController.parseDateRange(url.searchParams);

            const meter = new BillingMeter(env);

            const [usage, modelBreakdown, cacheSavings] = await Promise.all([
                meter.getUserUsage(authUser.id, startDate, endDate),
                meter.getModelBreakdown(authUser.id, startDate, endDate),
                meter.getCacheSavings(authUser.id, startDate, endDate),
            ]);

            this.logger.info('User billing retrieved', {
                userId: authUser.id,
                totalCost: usage.totalCost,
                totalRequests: usage.totalRequests,
            });

            return BillingController.createSuccessResponse({ usage, modelBreakdown, cacheSavings });
        } catch (error) {
            this.logger.error('Error fetching user billing:', error);
            return BillingController.createErrorResponse<UserBillingResponseData>(
                'Failed to fetch billing data',
                500,
            );
        }
    }

    /**
     * Get billing data for a specific customer (Appy Pie customer ID)
     * GET /api/billing/customer/:customerId
     */
    static async getCustomerBilling(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<CustomerBillingResponseData>>> {
        try {
            const customerId = context.pathParams.customerId;
            if (!customerId) {
                return BillingController.createErrorResponse<CustomerBillingResponseData>(
                    'Customer ID is required',
                    400,
                );
            }

            const url = new URL(request.url);
            const { startDate, endDate } = BillingController.parseDateRange(url.searchParams);

            const meter = new BillingMeter(env);

            const [usage, modelBreakdown, cacheSavings] = await Promise.all([
                meter.getCustomerUsage(customerId, startDate, endDate),
                meter.getModelBreakdown(customerId, startDate, endDate),
                meter.getCacheSavings(customerId, startDate, endDate),
            ]);

            this.logger.info('Customer billing retrieved', {
                customerId,
                totalCost: usage.totalCost,
                totalRequests: usage.totalRequests,
            });

            return BillingController.createSuccessResponse({ usage, modelBreakdown, cacheSavings });
        } catch (error) {
            this.logger.error('Error fetching customer billing:', error);
            return BillingController.createErrorResponse<CustomerBillingResponseData>(
                'Failed to fetch customer billing data',
                500,
            );
        }
    }

    /**
     * Parse date range from query params, defaulting to last 30 days
     */
    private static parseDateRange(params: URLSearchParams): { startDate: Date; endDate: Date } {
        const endDate = new Date();
        const defaultStart = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        const startParam = params.get('start');
        const endParam = params.get('end');

        const startDate = startParam ? new Date(startParam) : defaultStart;
        const parsedEnd = endParam ? new Date(endParam) : endDate;

        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(parsedEnd.getTime())) {
            return { startDate: defaultStart, endDate };
        }

        return { startDate, endDate: parsedEnd };
    }
}
