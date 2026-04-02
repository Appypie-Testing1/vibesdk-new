/**
 * Marketplace Controller Types
 */

import type { MarketplacePluginWithStats } from '../../../database/services/MarketplaceService';
import type { MarketplacePlugin, PluginRating, RevenueEvent } from '../../../database/schema';
import type { SecurityReviewResult } from '../../../services/marketplace/SecurityReviewService';

export interface MarketplaceListResponseData {
    plugins: MarketplacePluginWithStats[];
    total: number;
    page: number;
    perPage: number;
}

export type MarketplacePluginResponseData = MarketplacePluginWithStats;

export interface MarketplacePublishResponseData {
    plugin: MarketplacePlugin;
}

export interface MarketplaceInstallResponseData {
    pluginId: string;
    siteId: string;
    installedAt: string;
}

export interface MarketplaceReviewResponseData {
    pluginId: string;
    status: 'approved' | 'rejected';
    securityReview?: SecurityReviewResult;
}

export interface MarketplaceRatingsResponseData {
    ratings: PluginRating[];
    averageRating: number | null;
    count: number;
}

export interface MarketplaceRevenueResponseData {
    publisherId: string;
    totalRevenue: number;
    eventCount: number;
    events: RevenueEvent[];
}
