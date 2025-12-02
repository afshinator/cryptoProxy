// Filename: utils/coingeckoConfig.js

import { log, WARN } from './log.ts';
import dotenv from 'dotenv';

// Load environment variables locally using 'dotenv'
// This block is skipped during Vercel deployment.
if (process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local' });
}

// Retrieve the CoinGecko API Key from the environment
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

if (!COINGECKO_API_KEY) {
  log("🚨 WARNING: COINGECKO_API_KEY environment variable is not set. Falling back to public rate limits.", WARN);
}

/**
 * Constructs the full CoinGecko API URL, conditionally appending the API key.
 * @param {string} endpointPath - The path part of the URL (e.g., '/coins/markets').
 * @param {URLSearchParams} params - The URLSearchParams object with query parameters.
 * @returns {string} The complete, signed URL.
 */
export function buildCoingeckoUrl(endpointPath, params) {
    const baseUrl = "https://api.coingecko.com/api/v3";

    // Conditionally append the API key to the parameters
    if (COINGECKO_API_KEY) {
        params.append('x_cg_demo_api_key', COINGECKO_API_KEY);
    }

    const fullUrl = `${baseUrl}${endpointPath}?${params.toString()}`;

    return fullUrl;
}