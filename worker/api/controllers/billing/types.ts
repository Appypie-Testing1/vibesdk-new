/**
 * Billing Controller Types
 * Type definitions for billing API requests and responses
 */

import type { CustomerUsageSummary, ModelBreakdown, CacheSavings } from '../../../services/analytics/BillingMeter';

export interface CustomerBillingResponseData {
    usage: CustomerUsageSummary;
    modelBreakdown: ModelBreakdown[];
    cacheSavings: CacheSavings;
}

export type UserBillingResponseData = CustomerBillingResponseData;
