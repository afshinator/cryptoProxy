// Filename: utils/coingeckoConfig.ts

import { log, WARN, LOG } from './log.js';
import { COINGECKO_BASE_URL } from '../constants/api.js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this file, then go up to project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// This file is in utils/, so project root is one level up
const projectRoot = join(__dirname, '..');

// Load environment variables locally using 'dotenv'
// This block is skipped during Vercel deployment.
if (!process.env.VERCEL_ENV || process.env.VERCEL_ENV !== 'production') {
  // Use absolute path based on project root (not process.cwd() which can vary)
  const envPath = join(projectRoot, '.env.local');
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    // Silently fail - env vars might be set another way
  }
}

// Retrieve the CoinGecko API Key from the environment
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

if (!COINGECKO_API_KEY) {
  log("🚨 WARNING: COINGECKO_API_KEY environment variable is not set. Falling back to public rate limits.", WARN);
}

/**
 * Constructs the full CoinGecko API URL, conditionally appending the API key.
 * @param endpointPath - The path part of the URL (e.g., '/coins/markets').
 * @param params - The URLSearchParams object with query parameters.
 * @returns The complete, signed URL.
 */
export function buildCoingeckoUrl(endpointPath: string, params: URLSearchParams): string {
  const baseUrl = COINGECKO_BASE_URL;

  // Conditionally append the API key to the parameters
  if (COINGECKO_API_KEY) {
    params.append('x_cg_demo_api_key', COINGECKO_API_KEY);
    // Log that API key is being used (but don't log the actual key)
    if (endpointPath.includes('/ohlc') || endpointPath.includes('/market_chart')) {
      // Only log for OHLC/market_chart endpoints to avoid spam
      log(`  ✅ API key detected: Using authenticated request for ${endpointPath}`, LOG);
    }
  } else {
    // Warn if API key is missing for OHLC/market_chart endpoints
    if (endpointPath.includes('/ohlc') || endpointPath.includes('/market_chart')) {
      log(`  ⚠️ No API key found: Using public rate limits for ${endpointPath}`, WARN);
    }
  }

  const fullUrl = `${baseUrl}${endpointPath}?${params.toString()}`;

  return fullUrl;
}

