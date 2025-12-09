// Filename: src/config/configVolatilityTTL.ts

import type { VolatilityLevel } from "../constants/VolatilityLevels.js";

/**
 * Defines the multiplier applied to a feature's configured TTL when the market is
 * in a specific volatility state.
 * * TTL_FINAL = Feature_Max_TTL * Multiplier
 */
export const VOLATILITY_TTL_MULTIPLIERS: Record<VolatilityLevel, number> = {
  // 1. LOW: Data changes slowly. We allow the cache to live longer (max staleness).
  LOW: 1.0,

  // 2. NORMAL: Standard market conditions. Slight reduction in staleness.
  NORMAL: 0.8,

  // 3. HIGH: Market is moving quickly. Aggressively reduce TTL to ensure freshness.
  HIGH: 0.5,

  // 4. EXTREME: Major moves/Crashes. Force near-real-time checks.
  EXTREME: 0.2, // Drastically reduces effective cache lifespan.
};

export default VOLATILITY_TTL_MULTIPLIERS;
