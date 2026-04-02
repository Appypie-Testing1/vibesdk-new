/**
 * BillingMeter Service
 * Records and aggregates per-customer token usage for billing.
 * Writes to the usage_records D1 table and provides aggregation queries.
 */

/// <reference path="../../../worker-configuration.d.ts" />
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { usageRecords } from '../../database/schema';
import { createLogger, StructuredLogger } from '../../logger';

export interface UsageEvent {
    userId: string;
    customerId?: string;
    agentId?: string;
    model: string;
    operationType: string;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    cached: boolean;
}

export interface CustomerUsageSummary {
    customerId: string;
    totalRequests: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalCost: number;
    cachedRequests: number;
    periodStart: string;
    periodEnd: string;
}

export interface ModelBreakdown {
    model: string;
    requests: number;
    tokensIn: number;
    tokensOut: number;
    cost: number;
}

export interface CacheSavings {
    totalRequests: number;
    cachedRequests: number;
    cacheRate: number;
    estimatedSavings: number;
}

export class BillingMeter {
    private logger: StructuredLogger;
    private env: Env;

    constructor(env: Env) {
        this.env = env;
        this.logger = createLogger('BillingMeter');
    }

    /**
     * Record a single usage event from an inference call
     */
    async recordUsage(event: UsageEvent): Promise<void> {
        try {
            const db = drizzle(this.env.DB);
            const id = crypto.randomUUID();

            await db.insert(usageRecords).values({
                id,
                userId: event.userId,
                customerId: event.customerId ?? null,
                agentId: event.agentId ?? null,
                model: event.model,
                operationType: event.operationType,
                tokensIn: event.tokensIn,
                tokensOut: event.tokensOut,
                cost: event.cost,
                cached: event.cached,
            });
        } catch (error) {
            // Non-blocking: log but don't throw so inference isn't interrupted
            this.logger.error('Failed to record usage event', { error, event });
        }
    }

    /**
     * Get aggregated usage for a customer within a date range
     */
    async getCustomerUsage(customerId: string, startDate: Date, endDate: Date): Promise<CustomerUsageSummary> {
        const db = drizzle(this.env.DB);

        const result = await db
            .select({
                totalRequests: sql<number>`count(*)`,
                totalTokensIn: sql<number>`coalesce(sum(${usageRecords.tokensIn}), 0)`,
                totalTokensOut: sql<number>`coalesce(sum(${usageRecords.tokensOut}), 0)`,
                totalCost: sql<number>`coalesce(sum(${usageRecords.cost}), 0)`,
                cachedRequests: sql<number>`coalesce(sum(case when ${usageRecords.cached} = 1 then 1 else 0 end), 0)`,
            })
            .from(usageRecords)
            .where(
                and(
                    eq(usageRecords.customerId, customerId),
                    gte(usageRecords.createdAt, startDate),
                    lte(usageRecords.createdAt, endDate),
                ),
            )
            .get();

        return {
            customerId,
            totalRequests: result?.totalRequests ?? 0,
            totalTokensIn: result?.totalTokensIn ?? 0,
            totalTokensOut: result?.totalTokensOut ?? 0,
            totalCost: result?.totalCost ?? 0,
            cachedRequests: result?.cachedRequests ?? 0,
            periodStart: startDate.toISOString(),
            periodEnd: endDate.toISOString(),
        };
    }

    /**
     * Get usage breakdown by model for a customer
     */
    async getModelBreakdown(customerId: string, startDate: Date, endDate: Date): Promise<ModelBreakdown[]> {
        const db = drizzle(this.env.DB);

        const results = await db
            .select({
                model: usageRecords.model,
                requests: sql<number>`count(*)`,
                tokensIn: sql<number>`coalesce(sum(${usageRecords.tokensIn}), 0)`,
                tokensOut: sql<number>`coalesce(sum(${usageRecords.tokensOut}), 0)`,
                cost: sql<number>`coalesce(sum(${usageRecords.cost}), 0)`,
            })
            .from(usageRecords)
            .where(
                and(
                    eq(usageRecords.customerId, customerId),
                    gte(usageRecords.createdAt, startDate),
                    lte(usageRecords.createdAt, endDate),
                ),
            )
            .groupBy(usageRecords.model)
            .orderBy(desc(sql`sum(${usageRecords.cost})`))
            .all();

        return results;
    }

    /**
     * Get cache savings metrics for a customer
     */
    async getCacheSavings(customerId: string, startDate: Date, endDate: Date): Promise<CacheSavings> {
        const db = drizzle(this.env.DB);

        const result = await db
            .select({
                totalRequests: sql<number>`count(*)`,
                cachedRequests: sql<number>`coalesce(sum(case when ${usageRecords.cached} = 1 then 1 else 0 end), 0)`,
                totalCost: sql<number>`coalesce(sum(${usageRecords.cost}), 0)`,
                uncachedCost: sql<number>`coalesce(sum(case when ${usageRecords.cached} = 0 then ${usageRecords.cost} else 0 end), 0)`,
            })
            .from(usageRecords)
            .where(
                and(
                    eq(usageRecords.customerId, customerId),
                    gte(usageRecords.createdAt, startDate),
                    lte(usageRecords.createdAt, endDate),
                ),
            )
            .get();

        const totalRequests = result?.totalRequests ?? 0;
        const cachedRequests = result?.cachedRequests ?? 0;
        const cacheRate = totalRequests > 0 ? (cachedRequests / totalRequests) * 100 : 0;

        // Estimated savings: difference between what we'd pay without cache and what we actually paid
        const uncachedCost = result?.uncachedCost ?? 0;
        const avgCostPerUncached = cachedRequests > 0 && (totalRequests - cachedRequests) > 0
            ? uncachedCost / (totalRequests - cachedRequests)
            : 0;
        const estimatedSavings = avgCostPerUncached * cachedRequests;

        return {
            totalRequests,
            cachedRequests,
            cacheRate: parseFloat(cacheRate.toFixed(2)),
            estimatedSavings: parseFloat(estimatedSavings.toFixed(6)),
        };
    }

    /**
     * Get usage for a specific user (owner-level view)
     */
    async getUserUsage(userId: string, startDate: Date, endDate: Date): Promise<CustomerUsageSummary> {
        const db = drizzle(this.env.DB);

        const result = await db
            .select({
                totalRequests: sql<number>`count(*)`,
                totalTokensIn: sql<number>`coalesce(sum(${usageRecords.tokensIn}), 0)`,
                totalTokensOut: sql<number>`coalesce(sum(${usageRecords.tokensOut}), 0)`,
                totalCost: sql<number>`coalesce(sum(${usageRecords.cost}), 0)`,
                cachedRequests: sql<number>`coalesce(sum(case when ${usageRecords.cached} = 1 then 1 else 0 end), 0)`,
            })
            .from(usageRecords)
            .where(
                and(
                    eq(usageRecords.userId, userId),
                    gte(usageRecords.createdAt, startDate),
                    lte(usageRecords.createdAt, endDate),
                ),
            )
            .get();

        return {
            customerId: userId,
            totalRequests: result?.totalRequests ?? 0,
            totalTokensIn: result?.totalTokensIn ?? 0,
            totalTokensOut: result?.totalTokensOut ?? 0,
            totalCost: result?.totalCost ?? 0,
            cachedRequests: result?.cachedRequests ?? 0,
            periodStart: startDate.toISOString(),
            periodEnd: endDate.toISOString(),
        };
    }
}
