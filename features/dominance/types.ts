/**
 * Type definitions for Market Dominance Calculator
 */

/**
 * CoinGecko Global API response structure
 */
export interface CoinGeckoGlobalData {
  data: {
    total_market_cap: {
      usd: number;
    };
    market_cap_percentage: {
      btc: number;
    };
  };
}

/**
 * CoinGecko Market Data response structure (from /coins/markets)
 */
export interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  market_cap: number;
  current_price: number;
  // ... other fields exist but not needed for dominance calculation
}

/**
 * Dominance data for a single category
 */
export interface CategoryDominance {
  marketCap: number;
  dominance: number;
}

/**
 * Complete dominance analysis result
 */
export interface DominanceAnalysis {
  /** Total market capitalization in USD */
  totalMarketCap: number;
  
  /** Bitcoin dominance data */
  btc: CategoryDominance;
  
  /** Ethereum dominance data */
  eth: CategoryDominance;
  
  /** Stablecoins dominance data */
  stablecoins: CategoryDominance;
  
  /** Others dominance data (calculated) */
  others: CategoryDominance;
  
  /** Unix timestamp of when the calculation was performed */
  timestamp: number;
}

/**
 * Raw market cap data used for calculations
 * This structure is independent of the data source
 */
export interface MarketCapData {
  total: number;
  btc: number;
  eth: number;
  stablecoins: number;
}

