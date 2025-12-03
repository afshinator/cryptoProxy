// Filename: api/markets.ts
/**
 * Markets endpoint that mirrors CoinGecko's /coins/markets endpoint
 * Supports query parameters: vs_currency, order, per_page, page, sparkline, price_change_percentage
 */
import { fetchFromCoinGecko, handleApiError } from '../utils/coingeckoClient.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
// Suppress DEP0169 deprecation warning from dependencies
import { suppressDeprecationWarning } from '../utils/suppressDeprecationWarning.js';
suppressDeprecationWarning();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract query parameters from the request
    const {
      vs_currency = 'usd',
      order = 'market_cap_desc',
      per_page = 100,
      page = 1,
      sparkline = false, // TODO
      price_change_percentage = '',
      ids = '',
      category = '',
      locale = 'en'
    } = req.query;

    // Build the CoinGecko API URL parameters
    const params = new URLSearchParams();
    params.append('vs_currency', String(vs_currency));
    params.append('order', String(order));
    params.append('per_page', String(per_page));
    params.append('page', String(page));
    params.append('sparkline', String(sparkline));
    params.append('locale', String(locale));
    
    if (price_change_percentage) {
      params.append('price_change_percentage', String(price_change_percentage));
    }
    if (ids) {
      params.append('ids', String(ids));
    }
    if (category) {
      params.append('category', String(category));
    }

    // Fetch data from CoinGecko API using the reusable client
    const data = await fetchFromCoinGecko('/coins/markets', params);

    // Return the market data
    return res.status(200).json(data);
  } catch (error) {
    handleApiError(error, res, 'markets data');
  }
}

