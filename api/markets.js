// Filename: api/markets.js
/**
 * Markets endpoint that mirrors CoinGecko's /coins/markets endpoint
 * Supports query parameters: vs_currency, order, per_page, page, sparkline, price_change_percentage
 */
import { log, ERR } from '../utils/log.ts';
import { buildCoingeckoUrl } from '../utils/coingeckoConfig.js';

export default async function handler(req, res) {
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
      sparkline = false,
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

    // Use the factored utility to get the full URL with the API key
    // buildCoingeckoUrl expects just the path, not the full URL
    const url = buildCoingeckoUrl('/coins/markets', params);
    // Fetch data from CoinGecko API
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'CoinGecko API error',
        message: `CoinGecko API responded with status ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();

    // Return the market data
    return res.status(200).json(data);
  } catch (error) {
    log(`Error fetching markets data: ${error.message}`, ERR);
    return res.status(500).json({
      error: 'Failed to fetch markets data',
      message: error.message
    });
  }
}