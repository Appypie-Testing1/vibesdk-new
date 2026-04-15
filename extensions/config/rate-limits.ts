// Fork-specific rate limit overrides (AppyPie deployment)
// Upstream uses stricter limits; these are customized for our deployment
export const RATE_LIMIT_OVERRIDES = {
    appCreation: {
        limit: 50,       // number of apps per period
        dailyLimit: 50,  // daily cap
        period: 4 * 60 * 60, // 4 hours in seconds
    },
} as const;
