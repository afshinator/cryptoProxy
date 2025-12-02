import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock the log module
vi.mock('../utils/log.js', () => ({
  log: vi.fn(),
  ERR: 1,
  LOG: 5
}));

import handler from '../api/markets.js';

describe('Markets Endpoint Tests', () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;

  beforeEach(() => {
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
    // Mock fetch to return sample market data
    const mockMarketData = [
      {
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        current_price: 45000,
        market_cap: 850000000000
      }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMarketData
    }) as any;

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(global.fetch).toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(mockMarketData);
  });

  it('should use default query parameters', async () => {
    const mockMarketData: any[] = [];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMarketData
    }) as any;

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    const fetchCall = (global.fetch as any).mock.calls[0][0];
    expect(fetchCall).toContain('vs_currency=usd');
    expect(fetchCall).toContain('order=market_cap_desc');
    expect(fetchCall).toContain('per_page=100');
    expect(fetchCall).toContain('page=1');
    expect(fetchCall).toContain('sparkline=false');
  });

  it('should use custom query parameters', async () => {
    mockReq.query = {
      vs_currency: 'eur',
      per_page: '10',
      page: '2'
    };

    const mockMarketData: any[] = [];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMarketData
    }) as any;

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    const fetchCall = (global.fetch as any).mock.calls[0][0];
    expect(fetchCall).toContain('vs_currency=eur');
    expect(fetchCall).toContain('per_page=10');
    expect(fetchCall).toContain('page=2');
  });

  it('should handle CoinGecko API errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded'
    }) as any;

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'CoinGecko API error',
      message: 'CoinGecko API responded with status 429',
      details: 'Rate limit exceeded'
    });
  });

  it('should handle network errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;

    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Failed to fetch markets data',
      message: 'Network error'
    });
  });
});

