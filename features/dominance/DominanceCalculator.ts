/**
 * Market Dominance Calculator
 * 
 * Calculates market dominance percentages for BTC, ETH, stablecoins, and others.
 * This module is independent of the data source - it only performs calculations
 * on the provided market cap data.
 */

import { log, ERR, LOG } from '../../utils/log.js';
import type {
  MarketCapData,
  DominanceAnalysis,
  CategoryDominance,
} from './types.js';

/**
 * Calculates dominance percentage for a category
 * Formula: (Category Market Cap / Total Market Cap) × 100
 * 
 * @param categoryMarketCap - Market cap of the category
 * @param totalMarketCap - Total market cap
 * @returns Dominance percentage (0-100)
 */
function calculateDominancePercentage(
  categoryMarketCap: number,
  totalMarketCap: number
): number {
  if (totalMarketCap <= 0) {
    log('💪 ⚠️ Total market cap is zero or negative, cannot calculate dominance', ERR);
    return 0;
  }
  
  return (categoryMarketCap / totalMarketCap) * 100;
}

/**
 * Calculates the "Others" market cap
 * Formula: Total - BTC - ETH - Stablecoins
 * 
 * @param marketCapData - Market cap data for all categories
 * @returns Others market cap
 */
function calculateOthersMarketCap(marketCapData: MarketCapData): number {
  const others = marketCapData.total - 
                 marketCapData.btc - 
                 marketCapData.eth - 
                 marketCapData.stablecoins;
  
  // Ensure Others is not negative (shouldn't happen, but safety check)
  if (others < 0) {
    log('💪 ⚠️ Others market cap calculated as negative, setting to 0', ERR);
    return 0;
  }
  
  return others;
}

/**
 * Calculates market dominance for all categories
 * 
 * @param marketCapData - Market cap data from data source
 * @returns Complete dominance analysis
 */
export function calculateDominance(
  marketCapData: MarketCapData
): DominanceAnalysis {
  log('💪 Calculating market dominance...', LOG);
  
  // Calculate individual category dominances
  const btcDominance = calculateDominancePercentage(marketCapData.btc, marketCapData.total);
  const ethDominance = calculateDominancePercentage(marketCapData.eth, marketCapData.total);
  const stablecoinsDominance = calculateDominancePercentage(
    marketCapData.stablecoins,
    marketCapData.total
  );
  
  // Calculate Others market cap and dominance
  const othersMarketCap = calculateOthersMarketCap(marketCapData);
  const othersDominance = calculateDominancePercentage(othersMarketCap, marketCapData.total);
  
  // Verify that all dominances sum to ~100% (allowing for small floating point errors)
  const totalDominance = btcDominance + ethDominance + stablecoinsDominance + othersDominance;
  const expectedTotal = 100;
  const tolerance = 0.01; // 0.01% tolerance for floating point errors
  
  if (Math.abs(totalDominance - expectedTotal) > tolerance) {
    log(
      `💪 ⚠️ Dominance percentages sum to ${totalDominance.toFixed(2)}% (expected 100%)`,
      ERR
    );
  } else {
    log(`💪 ✅ Dominance percentages sum to ${totalDominance.toFixed(2)}%`, LOG);
  }
  
  const result: DominanceAnalysis = {
    totalMarketCap: marketCapData.total,
    btc: {
      marketCap: marketCapData.btc,
      dominance: Number(btcDominance.toFixed(2)),
    },
    eth: {
      marketCap: marketCapData.eth,
      dominance: Number(ethDominance.toFixed(2)),
    },
    stablecoins: {
      marketCap: marketCapData.stablecoins,
      dominance: Number(stablecoinsDominance.toFixed(2)),
    },
    others: {
      marketCap: othersMarketCap,
      dominance: Number(othersDominance.toFixed(2)),
    },
    timestamp: Date.now(),
  };
  
  log('💪 Market dominance calculation complete', LOG);
  log(`💪 BTC: ${result.btc.dominance}%, ETH: ${result.eth.dominance}%, Stablecoins: ${result.stablecoins.dominance}%, Others: ${result.others.dominance}%`, LOG);
  
  return result;
}

