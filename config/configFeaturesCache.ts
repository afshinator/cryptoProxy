// Filename: src/config/configFeaturesCache.ts

import { FeatureName } from "../constants/FeatureNames.js";
import { CalculationFunction, FeatureConfig } from "./ConfigFeaturesCache.interface.js";
import { RotationStrategy } from "../services/ProviderRotationStrategies.js";
import { calculateMarketVolatility } from "../features/PriceChangeVelocity/index.js";
import type { CoinGeckoMarketData } from "../features/PriceChangeVelocity/types.js";

// --- Calculation Stubs ---

// Stubs for features not yet implemented must be provided to satisfy the type.
const NOT_IMPLEMENTED_CALCULATION: CalculationFunction = () => {
  throw new Error("Feature calculation not implemented yet.");
};

const STUB_CALCULATION: CalculationFunction = (deps) => {
  // 📊 STUB: Returns dependencies as output for testing
  return { data: "STUB_DATA_OK", dependencies: Object.keys(deps) };
};

// --- Helper for creating empty stubs (avoids repetitive boilerplate) ---
const STUB_CONFIG: FeatureConfig = {
  calculate: NOT_IMPLEMENTED_CALCULATION,
  rawDependencies: [],
  providerPool: ["COINGECKO_FREE_NO_KEY"],
  ttlBounds: { default: 1800, min: 600, max: 3600 }, // Default: 30 minutes
  rotationStrategy: RotationStrategy.LOWEST_FIRST_IN_ORDER, // Default strategy for stubs
};

// --- Feature Configuration Map ---

// By using the Record utility type, we ensure ALL keys in FeatureName are present.
// The TS error is resolved by adding the placeholder stubs.
export const featureConfig: Record<FeatureName, FeatureConfig> = {
  // 1. Implemented Features:
  DOMINANCE_VIEW_90D: {
    calculate: STUB_CALCULATION,
    rawDependencies: [
      {
        name: "RAW_MARKETS_TOP_50",
        endpointPath: "/coins/markets",
        queryParams: { vs_currency: "usd", days: 90, per_page: 50 },
        isHistorical: true,
      },
    ],
    providerPool: ["COINGECKO_FREE_WITH_KEY", "COINMARKETCAP_FREE_WITH_KEY"],
    ttlBounds: {
      default: 43200, // Default: 12 hours
      min: 3600, // 1 hour
      max: 86400, // 24 hours
    },
    rotationStrategy: RotationStrategy.LOWEST_FIRST_IN_ORDER,
  },
  CURRENT_DOMINANCE: STUB_CONFIG, // TODO: Implement this
  CURRENT_VOLATILITY: {
    calculate: (deps) => {
      // The raw dependency contains the market data array from CoinGecko
      const marketData = deps["CURRENT_VOLATILITY"] as CoinGeckoMarketData[];
      
      if (!marketData || !Array.isArray(marketData) || marketData.length === 0) {
        throw new Error("CURRENT_VOLATILITY: Invalid or empty market data received");
      }

      // Calculate market volatility using the PriceChangeVelocity calculator
      const analysis = calculateMarketVolatility(marketData);

      // Return the simplified format matching CurrentVolatilityResult
      return {
        volatility1h: analysis.volatility1h,
        volatility24h: analysis.volatility24h,
        level1h: analysis.level1h,
        level24h: analysis.level24h,
        topMoverPercentage: analysis.topMover1h?.changePercentage ?? null,
        topMoverCoin: analysis.topMover1h?.symbol ?? null,
        marketCapCoverage: analysis.marketCapCoverage,
      };
    },
    rawDependencies: [
      {
        name: "CURRENT_VOLATILITY",
        endpointPath: "/coins/markets",
        queryParams: {
          vs_currency: "usd",
          order: "market_cap_desc",
          per_page: 50,
          page: 1,
          price_change_percentage: "1h,24h",
        },
        isHistorical: false, // KV storage
      },
    ],
    providerPool: [
      "COINGECKO_FREE_WITH_KEY",
      "COINMARKETCAP_FREE_WITH_KEY",
      "COINGECKO_FREE_NO_KEY",
    ],
    ttlBounds: {
      default: 150, // Default 2.5 minutes (midpoint between min and max)
      min: 30, // Extremely fresh
      max: 300, // 5 minutes
    },
    rotationStrategy: RotationStrategy.PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE,
  },

  RAW_MARKETS_TOP_50: {
    calculate: (deps) => deps["RAW_MARKETS_TOP_50"],
    rawDependencies: [],
    providerPool: [
      "COINGECKO_FREE_WITH_KEY",
      "COINMARKETCAP_FREE_WITH_KEY",
      "COINGECKO_FREE_NO_KEY",
    ],
    ttlBounds: {
      default: 165, // Default: 2.75 minutes
      min: 30,
      max: 300,
    },
    rotationStrategy: RotationStrategy.ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST,
  },

  // 2. Placeholder Stubs (REQUIRED to satisfy the 'Record<FeatureName, FeatureConfig>' type):

  // Dominance & Shifts (stubs)
  DOMINANCE_TOP_10_CONC: STUB_CONFIG,
  DOMINANCE_HEATMAP_DATA: STUB_CONFIG,

  // Sector, Correlation, & Context (stubs)
  SECTOR_DOMINANCE_CURRENT: STUB_CONFIG,
  CORRELATION_MATRIX_FULL: STUB_CONFIG,
  HISTORICAL_CONTEXT_OVERLAY: STUB_CONFIG,
  PREDICTIVE_SIGNAL_1D: STUB_CONFIG,

  // Note: RAW_COINGECKO_MARKETS_50 was implicitly removed/renamed to RAW_MARKETS_TOP_50,
  // so if it was still in ALL_FEATURE_NAMES, it must be removed there.
};

export default featureConfig;
