// Filename: src/constants/ProviderNames.ts

/**
 * --- PROVIDERS ---
 * Defines all external and internal data sources available to the system.
 */
export const ALL_PROVIDER_NAMES = [
  // CoinGecko Tiers
  "COINGECKO_FREE_NO_KEY", // Always available, key-less, lowest limits.
  "COINGECKO_FREE_WITH_KEY", // Requires user's key, higher limits.

  // CoinMarketCap Tiers
  "COINMARKETCAP_FREE_WITH_KEY",

  // Internal Proxy
  // 'CRYPTO_PROXY',            // The backend endpoint for this app.; TODO: uncomment in front end

  // Other Providers requiring a key
  "COINDESK_WITH_KEY", // CoinDesk News/Data (requires user key).
  "FIAT_EXCHANGE_RATE_API", // Placeholder for future fiat exchange API.
] as const;

export type ProviderName = (typeof ALL_PROVIDER_NAMES)[number];
