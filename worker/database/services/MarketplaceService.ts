/**
 * MarketplaceService
 * CRUD and query operations for the plugin marketplace.
 */

import { eq, and, desc, like, sql, or } from 'drizzle-orm';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import {
    marketplacePlugins,
    pluginReviews,
    pluginInstalls,
    pluginRatings,
    revenueEvents,
    type MarketplacePlugin,
    type NewMarketplacePlugin,
    type PluginInstall,
    type PluginRating,
    type NewPluginRating,
    type RevenueEvent,
} from '../schema';
import { createLogger } from '../../logger';

export interface MarketplaceListOptions {
    status?: MarketplacePlugin['status'];
    category?: string;
    search?: string;
    page?: number;
    perPage?: number;
}

export interface MarketplacePluginWithStats extends MarketplacePlugin {
    averageRating: number | null;
    ratingCount: number;
}

const logger = createLogger('MarketplaceService');

export class MarketplaceService {
    constructor(private db: DrizzleD1Database) {}

    /**
     * List marketplace plugins with filtering and pagination
     */
    async listPlugins(options: MarketplaceListOptions = {}): Promise<{
        plugins: MarketplacePluginWithStats[];
        total: number;
    }> {
        const { status = 'published', category, search, page = 1, perPage = 20 } = options;
        const offset = (page - 1) * perPage;

        const conditions = [eq(marketplacePlugins.status, status)];
        if (category) {
            conditions.push(eq(marketplacePlugins.category, category));
        }
        if (search) {
            conditions.push(
                or(
                    like(marketplacePlugins.name, `%${search}%`),
                    like(marketplacePlugins.description, `%${search}%`),
                )!,
            );
        }

        const whereClause = and(...conditions);

        const [plugins, countResult] = await Promise.all([
            this.db
                .select()
                .from(marketplacePlugins)
                .where(whereClause)
                .orderBy(desc(marketplacePlugins.publishedAt))
                .limit(perPage)
                .offset(offset)
                .all(),
            this.db
                .select({ count: sql<number>`count(*)` })
                .from(marketplacePlugins)
                .where(whereClause)
                .get(),
        ]);

        // Fetch average ratings for each plugin
        const pluginsWithStats: MarketplacePluginWithStats[] = await Promise.all(
            plugins.map(async (plugin) => {
                const ratingResult = await this.db
                    .select({
                        avg: sql<number>`avg(${pluginRatings.rating})`,
                        count: sql<number>`count(*)`,
                    })
                    .from(pluginRatings)
                    .where(eq(pluginRatings.pluginId, plugin.id))
                    .get();

                return {
                    ...plugin,
                    averageRating: ratingResult?.avg ?? null,
                    ratingCount: ratingResult?.count ?? 0,
                };
            }),
        );

        return {
            plugins: pluginsWithStats,
            total: countResult?.count ?? 0,
        };
    }

    /**
     * Get a single plugin by ID with stats
     */
    async getPlugin(pluginId: string): Promise<MarketplacePluginWithStats | null> {
        const plugin = await this.db
            .select()
            .from(marketplacePlugins)
            .where(eq(marketplacePlugins.id, pluginId))
            .get();

        if (!plugin) return null;

        const ratingResult = await this.db
            .select({
                avg: sql<number>`avg(${pluginRatings.rating})`,
                count: sql<number>`count(*)`,
            })
            .from(pluginRatings)
            .where(eq(pluginRatings.pluginId, pluginId))
            .get();

        return {
            ...plugin,
            averageRating: ratingResult?.avg ?? null,
            ratingCount: ratingResult?.count ?? 0,
        };
    }

    /**
     * Get a plugin by slug
     */
    async getPluginBySlug(slug: string): Promise<MarketplacePluginWithStats | null> {
        const plugin = await this.db
            .select()
            .from(marketplacePlugins)
            .where(eq(marketplacePlugins.slug, slug))
            .get();

        if (!plugin) return null;
        return this.getPlugin(plugin.id);
    }

    /**
     * Create a new marketplace plugin listing (draft status)
     */
    async createPlugin(data: NewMarketplacePlugin): Promise<MarketplacePlugin> {
        const result = await this.db.insert(marketplacePlugins).values(data).returning().get();
        logger.info('Plugin created', { pluginId: result.id, name: result.name });
        return result;
    }

    /**
     * Update a marketplace plugin
     */
    async updatePlugin(pluginId: string, data: Partial<NewMarketplacePlugin>): Promise<MarketplacePlugin | null> {
        const result = await this.db
            .update(marketplacePlugins)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(marketplacePlugins.id, pluginId))
            .returning()
            .get();
        return result ?? null;
    }

    /**
     * Submit a plugin for review
     */
    async submitForReview(pluginId: string): Promise<MarketplacePlugin | null> {
        return this.updatePlugin(pluginId, { status: 'pending_review' });
    }

    /**
     * Approve and publish a plugin
     */
    async publishPlugin(pluginId: string): Promise<MarketplacePlugin | null> {
        return this.updatePlugin(pluginId, {
            status: 'published',
            publishedAt: new Date(),
        });
    }

    /**
     * Reject a plugin
     */
    async rejectPlugin(pluginId: string): Promise<MarketplacePlugin | null> {
        return this.updatePlugin(pluginId, { status: 'rejected' });
    }

    /**
     * Record a plugin installation
     */
    async installPlugin(pluginId: string, userId: string, siteId: string): Promise<PluginInstall> {
        const id = crypto.randomUUID();
        const install = await this.db
            .insert(pluginInstalls)
            .values({ id, pluginId, userId, siteId })
            .returning()
            .get();

        // Increment install count
        await this.db
            .update(marketplacePlugins)
            .set({
                installCount: sql`${marketplacePlugins.installCount} + 1`,
            })
            .where(eq(marketplacePlugins.id, pluginId));

        logger.info('Plugin installed', { pluginId, userId, siteId });
        return install;
    }

    /**
     * Add a rating for a plugin
     */
    async ratePlugin(data: NewPluginRating): Promise<PluginRating> {
        const result = await this.db
            .insert(pluginRatings)
            .values(data)
            .onConflictDoUpdate({
                target: [pluginRatings.pluginId, pluginRatings.userId],
                set: { rating: data.rating, reviewText: data.reviewText },
            })
            .returning()
            .get();
        return result;
    }

    /**
     * Get ratings for a plugin
     */
    async getPluginRatings(pluginId: string): Promise<PluginRating[]> {
        return this.db
            .select()
            .from(pluginRatings)
            .where(eq(pluginRatings.pluginId, pluginId))
            .orderBy(desc(pluginRatings.createdAt))
            .all();
    }

    /**
     * Get plugins published by a specific user
     */
    async getPublisherPlugins(publisherId: string): Promise<MarketplacePlugin[]> {
        return this.db
            .select()
            .from(marketplacePlugins)
            .where(eq(marketplacePlugins.publisherId, publisherId))
            .orderBy(desc(marketplacePlugins.createdAt))
            .all();
    }

    /**
     * Get plugins pending review (for admin queue)
     */
    async getPendingReviews(): Promise<MarketplacePlugin[]> {
        return this.db
            .select()
            .from(marketplacePlugins)
            .where(eq(marketplacePlugins.status, 'pending_review'))
            .orderBy(marketplacePlugins.createdAt)
            .all();
    }

    /**
     * Record a review decision
     */
    async recordReview(
        pluginId: string,
        reviewerId: string,
        status: 'approved' | 'rejected',
        notes?: string,
        securityScore?: number,
    ): Promise<void> {
        const id = crypto.randomUUID();
        await this.db.insert(pluginReviews).values({
            id,
            pluginId,
            reviewerId,
            status,
            notes: notes ?? null,
            securityScore: securityScore ?? null,
        });

        if (status === 'approved') {
            await this.publishPlugin(pluginId);
        } else {
            await this.rejectPlugin(pluginId);
        }
    }

    /**
     * Get revenue summary for a publisher
     */
    async getPublisherRevenue(publisherId: string): Promise<{
        totalRevenue: number;
        eventCount: number;
        events: RevenueEvent[];
    }> {
        const [summary, events] = await Promise.all([
            this.db
                .select({
                    total: sql<number>`coalesce(sum(${revenueEvents.amount}), 0)`,
                    count: sql<number>`count(*)`,
                })
                .from(revenueEvents)
                .where(eq(revenueEvents.publisherId, publisherId))
                .get(),
            this.db
                .select()
                .from(revenueEvents)
                .where(eq(revenueEvents.publisherId, publisherId))
                .orderBy(desc(revenueEvents.createdAt))
                .limit(100)
                .all(),
        ]);

        return {
            totalRevenue: summary?.total ?? 0,
            eventCount: summary?.count ?? 0,
            events,
        };
    }
}
