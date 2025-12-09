// Filename: src/core/ProviderClients.ts

import { ProviderName } from "../constants/ProviderNames.js";
import { UsableEndpoint } from "../config/ConfigFeaturesCache.interface.js";
import { log, ERR, WARN, TMI } from "../utils/log.js";
import { fetchFromCoinGecko, CoinGeckoApiError } from "../utils/coingeckoClient.js";
import { fetchJson, HttpError } from "../utils/httpClient.js";

// Provider Clients specific emoji
const LOG_EMOJI = "🌐";

/** Defines the metadata for signing an external API call */
export interface LocalApiKeys {
  COINGECKO_FREE_WITH_KEY?: string;
  COINMARKETCAP_FREE_WITH_KEY?: string;
  COINDESK_WITH_KEY?: string;
  CRYPTO_PROXY?: string; // The user's backend passkey
  FIAT_EXCHANGE_RATE_API?: string;
}

/** Interface for a function that executes an API call for a specific provider. */
interface ProviderClient {
  (endpoint: UsableEndpoint, localKeys: LocalApiKeys): Promise<any>;
}

/**
 * Executes a raw API call to CoinGecko, handling key injection.
 */
async function fetchCoinGecko(endpoint: UsableEndpoint, localKeys: LocalApiKeys): Promise<any> {
  log(`${LOG_EMOJI} CG Client: Preparing fetch for ${endpoint.endpointPath}`, TMI);

  const params = new URLSearchParams(endpoint.queryParams as Record<string, string>);

  // TO DO: Future logic to inject localKeys.COINGECKO_FREE_WITH_KEY for authenticated requests
  // if the user is using their own key (not the system's .env key).

  try {
    // The existing fetchFromCoinGecko handles URL building and error conversion
    const data = await fetchFromCoinGecko(endpoint.endpointPath, params);
    return data;
  } catch (error) {
    if (error instanceof CoinGeckoApiError && error.status === 429) {
      log(`${LOG_EMOJI} CG Client: ⚠️ Rate limit exceeded (429). Triggering failover.`, WARN);
    }
    // Re-throw for rotation service to catch
    throw error;
  }
}

/**
 * Executes a raw API call to CoinMarketCap.
 */
async function fetchCoinMarketCap(endpoint: UsableEndpoint, localKeys: LocalApiKeys): Promise<any> {
  const apiKey = localKeys.COINMARKETCAP_FREE_WITH_KEY;
  // If the provider is used and the key is missing, this is a failure and should be thrown
  if (!apiKey) {
    throw new HttpError(401, "CoinMarketCap API Key missing from local storage.", "CMC");
  }

  const url = `https://api.coinmarketcap.com/v1${endpoint.endpointPath}`; // STUB URL
  // CMC often uses POST or specific header params. Using standard headers for abstraction.
  const headers = {
    "X-CMC_PRO_API_KEY": apiKey,
  };

  try {
    const data = await fetchJson(url, {
      method: "GET",
      headers,
      context: "CoinMarketCap API",
    });
    return data;
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) {
      log(`${LOG_EMOJI} CMC Client: ⚠️ Rate limit exceeded (429). Triggering failover.`, WARN);
    }
    throw error;
  }
}

/**
 * Executes a call to the internal Crypto Proxy backend.
 */
async function fetchCryptoProxy(endpoint: UsableEndpoint, localKeys: LocalApiKeys): Promise<any> {
  const passkey = localKeys.CRYPTO_PROXY;
  if (!passkey) {
    throw new HttpError(401, "Backend Passkey missing.", "CRYPTO_PROXY");
  }

  // Assumes CRYPTO_PROXY_BASE_URL is set in environment variables
  const proxyUrl = process.env.CRYPTO_PROXY_BASE_URL || "http://localhost:3000/api";
  const url = `${proxyUrl}/feature/${endpoint.name}`; // Calling the feature endpoint directly

  const headers = {
    Authorization: `Bearer ${passkey}`,
  };

  try {
    // Note: When calling the proxy, we send the feature name, not the raw endpoint path
    const data = await fetchJson(url, {
      method: "GET",
      headers,
      context: "CRYPTO_PROXY",
    });
    return data;
  } catch (error) {
    log(
      `${LOG_EMOJI} Proxy Client: Error accessing proxy. Status: ${error instanceof HttpError ? error.status : "Unknown"}`,
      ERR
    );
    throw error;
  }
}

/**
 * A map of all defined providers to their corresponding fetch function.
 */
export const providerClients: Record<ProviderName, ProviderClient> = {
  // CoinGecko
  COINGECKO_FREE_NO_KEY: fetchCoinGecko,
  COINGECKO_FREE_WITH_KEY: fetchCoinGecko,

  // CoinMarketCap
  COINMARKETCAP_FREE_WITH_KEY: fetchCoinMarketCap,

  // Internal Proxy
  //   'CRYPTO_PROXY': fetchCryptoProxy,

  // Stubs for future providers
  COINDESK_WITH_KEY: () => {
    throw new Error("COINDESK Client not implemented.");
  },
  FIAT_EXCHANGE_RATE_API: () => {
    throw new Error("FIAT API Client not implemented.");
  },
};
