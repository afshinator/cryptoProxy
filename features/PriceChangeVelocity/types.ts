/**
 * Type definitions for Price Change Velocity Calculator
 */

/** CoinGecko API coin data structure */
export interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_1h_in_currency?: number; // Note: May need 'include_1h_change' param
  price_change_percentage_24h?: number;
  // ... other fields exist but not needed for volatility calculation
}

/** Volatility classification levels */
export type VolatilityLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

/** Top moving coin information */
export interface TopMover {
  coinId: string;
  symbol: string;
  name: string;
  changePercentage: number;
}

/** Complete volatility analysis result */
export interface VolatilityAnalysis {
  /** Market-cap weighted volatility over 1h window (most current) */
  volatility1h: number;
  
  /** Market-cap weighted volatility over 24h window (broader context) */
  volatility24h: number;
  
  /** Classification of 1h volatility */
  level1h: VolatilityLevel;
  
  /** Classification of 24h volatility */
  level24h: VolatilityLevel;
  
  /** Coin with largest absolute price change in 1h window, or null if no valid data exists */
  topMover1h: TopMover | null;
  
  /** Coin with largest absolute price change in 24h window, or null if no valid data exists */
  topMover24h: TopMover | null;
  
  /** Percentage of total market cap covered in calculation */
  marketCapCoverage: number;
  
  /** Number of coins included in calculation */
  coinsAnalyzed: number;
  
  /** Timestamp of calculation */
  timestamp: number;
}

