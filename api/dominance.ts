// Filename: api/dominance.ts
/**
 * Market Dominance API Endpoint
 *
 * This Vercel Serverless function serves as the endpoint for calculating
 * current market dominance of Bitcoin, Ethereum, stablecoins, and others.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LOG } from '../utils/log.js';
import { handleApiError } from '../utils/coingeckoClient.js';
import {
  fetchAllMarketCapData,
  calculateDominance,
} from '../features/dominance/index.js';

// Suppress DEP0169 deprecation warning from dependencies
import { suppressDeprecationWarning } from '../utils/suppressDeprecationWarning.js';
suppressDeprecationWarning();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow cross-origin requests for testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    log('💪 Starting market dominance calculation...', LOG);

    // Fetch all market cap data from CoinGecko
    const marketCapData = await fetchAllMarketCapData();

    // Calculate dominance percentages
    const dominanceAnalysis = calculateDominance(marketCapData);

    // Return the dominance analysis
    return res.status(200).json(dominanceAnalysis);
  } catch (error) {
    return handleApiError(error, res, 'market dominance data');
  }
}

