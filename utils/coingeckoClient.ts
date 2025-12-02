// Filename: utils/coingeckoClient.ts

import { log, ERR } from './log.js';
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

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new CoinGeckoApiError(
        response.status,
        `CoinGecko API responded with status ${response.status}`,
        errorText
      );
    }

    const data = await response.json();
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

