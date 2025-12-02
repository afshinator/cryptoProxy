// Filename: utils/coingeckoClient.ts

import { log, ERR, LOG } from './log.js';
import { buildCoingeckoUrl } from './coingeckoConfig.js';

/**
 * Error class for CoinGecko API errors
 */
export class CoinGeckoApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'CoinGeckoApiError';
  }
}

/**
 * Fetches data from the CoinGecko API with error handling
 * @param endpointPath - The API endpoint path (e.g., '/coins/markets')
 * @param params - URLSearchParams with query parameters
 * @returns The JSON response data
 * @throws CoinGeckoApiError if the API returns an error status
 * @throws Error if network request fails
 */
export async function fetchFromCoinGecko<T = any>(
  endpointPath: string,
  params: URLSearchParams
): Promise<T> {
  try {
    const url = buildCoingeckoUrl(endpointPath, params);
    
    // Log the URL (but mask the API key for security)
    const urlForLogging = url.replace(/x_cg_demo_api_key=[^&]+/, 'x_cg_demo_api_key=***MASKED***');
    const hasApiKey = url.includes('x_cg_demo_api_key=');
    log(`  Making request to: ${urlForLogging}`, LOG);
    log(`  API key included: ${hasApiKey ? '✅ YES' : '❌ NO'}`, LOG);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    // Log response status and headers
    log(`  Response status: ${response.status} ${response.statusText}`, LOG);
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
    const rateLimitReset = response.headers.get('x-ratelimit-reset');
    if (rateLimitRemaining) {
      log(`  Rate limit remaining: ${rateLimitRemaining}`, LOG);
    }
    if (rateLimitReset) {
      log(`  Rate limit resets at: ${new Date(parseInt(rateLimitReset) * 1000).toISOString()}`, LOG);
    }

    if (!response.ok) {
      const errorText = await response.text();
      log(`  ❌ API Error Response: ${errorText.substring(0, 200)}`, ERR);
      throw new CoinGeckoApiError(
        response.status,
        `CoinGecko API responded with status ${response.status}`,
        errorText
      );
    }

    const data = await response.json();
    
    // Log data structure info for OHLC endpoint
    if (endpointPath.includes('/ohlc') && Array.isArray(data)) {
      log(`  OHLC Response: Array with ${data.length} items`, LOG);
      if (data.length > 0) {
        const firstCandle = data[0];
        const lastCandle = data[data.length - 1];
        if (Array.isArray(firstCandle) && firstCandle.length >= 5) {
          const firstDate = new Date(firstCandle[0]).toISOString().split('T')[0];
          const lastDate = new Date(lastCandle[0]).toISOString().split('T')[0];
          log(`  OHLC Date range in response: ${firstDate} to ${lastDate}`, LOG);
          // Check if candles are evenly spaced
          if (data.length >= 2) {
            const timeDiff1 = data[1][0] - data[0][0];
            const timeDiff2 = data.length >= 3 ? data[2][0] - data[1][0] : timeDiff1;
            log(`  OHLC Time intervals: ${Math.round(timeDiff1 / (1000 * 60 * 60))}h, ${Math.round(timeDiff2 / (1000 * 60 * 60))}h`, LOG);
          }
        }
      }
    }

    return data as T;
  } catch (error) {
    if (error instanceof CoinGeckoApiError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Error fetching from CoinGecko API (${endpointPath}): ${errorMessage}`, ERR);
    throw new Error(`Failed to fetch from CoinGecko API: ${errorMessage}`);
  }
}

/**
 * Helper function to handle Vercel API route errors and send appropriate responses
 * @param error - The error that occurred
 * @param res - Vercel response object
 * @param context - Optional context string for logging (e.g., 'markets data')
 */
export function handleApiError(
  error: unknown,
  res: { status: (code: number) => { json: (data: any) => void } },
  context?: string
): void {
  if (error instanceof CoinGeckoApiError) {
    res.status(error.status).json({
      error: 'CoinGecko API error',
      message: error.message,
      details: error.details
    });
    return;
  }

  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const contextMsg = context ? ` ${context}` : '';
  log(`Error${contextMsg}: ${errorMessage}`, ERR);
  
  res.status(500).json({
    error: `Failed to fetch${contextMsg}`,
    message: errorMessage
  });
}

