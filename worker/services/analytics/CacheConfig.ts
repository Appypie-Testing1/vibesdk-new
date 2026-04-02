/**
 * AI Gateway Cache Configuration
 * Defines caching rules for the Cloudflare AI Gateway.
 * These rules are applied via the cf-aig-cache-ttl header on inference requests.
 */

/**
 * Cache TTL values in seconds for different operation types.
 * Higher TTLs for deterministic operations, lower/no cache for creative ones.
 */
export const CACHE_TTL_BY_OPERATION: Record<string, number> = {
    // Blueprint generation is deterministic for the same prompt
    blueprint: 3600, // 1 hour

    // Phase generation plans are relatively stable for the same blueprint
    phase_generation: 1800, // 30 minutes

    // Phase implementation varies more, short cache
    phase_implementation: 0, // No cache -- outputs must be unique

    // Conversation responses should not be cached (user-specific, contextual)
    conversation: 0,

    // Deep debugger results are context-specific, no cache
    deep_debugger: 0,

    // User app proxy calls -- respect per-app settings
    user_app_proxy: 300, // 5 minutes default
};

/**
 * Get the cache TTL header value for a given operation type.
 * Returns 0 (no cache) for unknown operation types.
 */
export function getCacheTTL(operationType: string): number {
    return CACHE_TTL_BY_OPERATION[operationType] ?? 0;
}

/**
 * Build cache headers for AI Gateway requests.
 * Returns an empty object if caching is disabled for this operation.
 */
export function buildCacheHeaders(operationType: string): Record<string, string> {
    const ttl = getCacheTTL(operationType);
    if (ttl <= 0) {
        return {};
    }
    return {
        'cf-aig-cache-ttl': String(ttl),
    };
}
