// Filename: src/constants/VolatilityLevels.ts

/**
 * --- VOLATILITY LEVELS ---
 * Defines the possible market states which dictate cache TTL and polling behavior.
 */
export const ALL_VOLATILITY_LEVELS = ["LOW", "NORMAL", "HIGH", "EXTREME"] as const;

export type VolatilityLevel = (typeof ALL_VOLATILITY_LEVELS)[number];
