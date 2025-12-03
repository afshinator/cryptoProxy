import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock the log module
vi.mock('../utils/log.js', () => ({
  log: vi.fn(),
  ERR: 1,
  LOG: 5,
  INFO: 7
}));

// Mock the coingeckoClient
vi.mock('../utils/coingeckoClient.js', () => ({
  fetchFromCoinGecko: vi.fn(),
  CoinGeckoApiError: class extends Error {
    constructor(public status: number, message: string, public details?: string) {
      super(message);
      this.name = 'CoinGeckoApiError';
    }
  },
  handleApiError: vi.fn((error, res, context) => {
    if (error.status) {
      res.status(error.status).json({
        error: 'CoinGecko API error',
        message: error.message,
        details: error.details
      });
    } else {
      res.status(500).json({
        error: `Failed to fetch ${context || ''}`,
        message: error.message || 'Unknown error'
      });
    }
  })
}));

import handler from '../api/markets.js';
import { fetchFromCoinGecko, CoinGeckoApiError } from '../utils/coingeckoClient.js';

describe('Markets Endpoint Tests', () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock request object
    mockReq = {
      method: 'GET',
      query: {}
    };

    // Mock response object
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
  });

  it('should reject non-GET requests', async () => {
    mockReq.method = 'POST';

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(mockRes.status).toHaveBeenCalledWith(405);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Method not allowed'
    });
  });

  it('should handle GET requests successfully', async () => {
    // Mock fetchFromCoinGecko to return sample market data
    const mockMarketData = [
      {
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        current_price: 45000,
        market_cap: 850000000000
      }
    ];

    vi.mocked(fetchFromCoinGecko).mockResolvedValue(mockMarketData);

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(fetchFromCoinGecko).toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(mockMarketData);
  });

  it('should use default query parameters', async () => {
    const mockMarketData: any[] = [];

    vi.mocked(fetchFromCoinGecko).mockResolvedValue(mockMarketData);

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(fetchFromCoinGecko).toHaveBeenCalledWith(
      '/coins/markets',
      expect.any(URLSearchParams)
    );
    const params = vi.mocked(fetchFromCoinGecko).mock.calls[0][1] as URLSearchParams;
    expect(params.get('vs_currency')).toBe('usd');
    expect(params.get('order')).toBe('market_cap_desc');
    expect(params.get('per_page')).toBe('100');
    expect(params.get('page')).toBe('1');
    expect(params.get('sparkline')).toBe('false');
  });

  it('should use custom query parameters', async () => {
    mockReq.query = {
      vs_currency: 'eur',
      per_page: '10',
      page: '2'
    };

    const mockMarketData: any[] = [];

    vi.mocked(fetchFromCoinGecko).mockResolvedValue(mockMarketData);

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    const params = vi.mocked(fetchFromCoinGecko).mock.calls[0][1] as URLSearchParams;
    expect(params.get('vs_currency')).toBe('eur');
    expect(params.get('per_page')).toBe('10');
    expect(params.get('page')).toBe('2');
  });

  it('should handle CoinGecko API errors', async () => {
    const apiError = new CoinGeckoApiError(429, 'CoinGecko API responded with status 429', 'Rate limit exceeded');
    
    vi.mocked(fetchFromCoinGecko).mockRejectedValue(apiError);

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'CoinGecko API error',
      message: 'CoinGecko API responded with status 429',
      details: 'Rate limit exceeded'
    });
  });

  it('should handle network errors', async () => {
    vi.mocked(fetchFromCoinGecko).mockRejectedValue(new Error('Network error'));

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Failed to fetch markets data',
      message: 'Network error'
    });
  });
});

