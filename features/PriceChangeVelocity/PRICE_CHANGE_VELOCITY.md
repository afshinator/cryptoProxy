# Feature: Price Change Velocity

Calculate **market-wide volatility** using market-cap weighted average of price changes across top cryptocurrency assets.

## Introduction to Price Change Velocity

Price Change Velocity is a real-time volatility metric that measures the magnitude of price movements across the cryptocurrency market. Unlike historical volatility metrics (like VWATR), this feature uses **current market data** from CoinGecko to provide immediate insights into market conditions.

### Key Concepts

- **Market-Cap Weighted Average**: The volatility calculation weights each coin's price change by its market capitalization, giving larger coins more influence on the overall market metric.
- **Absolute Price Changes**: The algorithm uses the absolute value of price changes, measuring the magnitude of movement regardless of direction (up or down).
- **Dual Timeframes**: Provides both 1-hour (current) and 24-hour (context) volatility metrics to help distinguish between short-term spikes and sustained volatility.

## Algorithm Overview

### Calculation Process

1. **Fetch Top Coins**: Retrieves the top N coins by market cap from CoinGecko's `/coins/markets` endpoint (default: 50 coins).
2. **Filter Valid Data**: Removes coins with missing or invalid data (zero market cap, missing price change percentages).
3. **Calculate Weighted Volatility**: 
   - Computes total market cap of all valid coins
   - For each coin, calculates its weight: `weight = coin.market_cap / totalMarketCap`
   - Multiplies each coin's absolute price change by its weight
   - Sums all weighted changes to get market-wide volatility
4. **Classify Volatility Levels**: Maps the calculated volatility percentages to levels (LOW, NORMAL, HIGH, EXTREME) using predefined thresholds.
5. **Identify Top Movers**: Finds the coin with the largest absolute price change in each timeframe.

### Volatility Classification

**1-Hour Volatility (Most Current)**:
- **< 1.5%**: `LOW` - Very calm market, minimal movement
- **1.5-4%**: `NORMAL` - Typical crypto market activity
- **4-8%**: `HIGH` - Significant movement, elevated activity
- **> 8%**: `EXTREME` - Major event, crash, or pump occurring

**24-Hour Volatility (Broader Context)**:
- **< 2%**: `LOW` - Stable market conditions
- **2-5%**: `NORMAL` - Standard daily fluctuation
- **5-10%**: `HIGH` - Elevated daily movement
- **> 10%**: `EXTREME` - Major market shifts

### Usage Recommendations

- **Use 1h volatility** for triggering dynamic refresh rate adjustments
- **Use 24h volatility** for user-facing metrics and context
- **If BOTH 1h and 24h are HIGH/EXTREME** → sustained volatility (adjust refresh)
- **If ONLY 1h is HIGH** → short-term spike (consider waiting before adjusting)

### Refresh Rate Suggestions

Based on volatility levels:
- **LOW**: 10-15 min refresh
- **NORMAL**: 5 min refresh
- **HIGH**: 1-2 min refresh
- **EXTREME**: 30 sec refresh

## API Usage

### Endpoint

```
GET /api/volatility?type=current
```

### Query Parameters

- **`type`** (required): Must be set to `current`
- **`per_page`** (optional): Number of top coins to analyze (default: 50, max: 250)

### Example Request

```bash
GET /api/volatility?type=current
GET /api/volatility?type=current&per_page=100
```

### Response Format

```json
{
  "volatility1h": 6.2,
  "volatility24h": 4.1,
  "level1h": "HIGH",
  "level24h": "NORMAL",
  "topMoverPercentage": 12.5,
  "topMoverCoin": "ADA",
  "marketCapCoverage": 0.87
}
```

### Response Fields

- **`volatility1h`** (number): Market-cap weighted average of absolute 1-hour price changes (%)
- **`volatility24h`** (number): Market-cap weighted average of absolute 24-hour price changes (%)
- **`level1h`** (string): Volatility classification for 1-hour window (`LOW`, `NORMAL`, `HIGH`, `EXTREME`)
- **`level24h`** (string): Volatility classification for 24-hour window (`LOW`, `NORMAL`, `HIGH`, `EXTREME`)
- **`topMoverPercentage`** (number | null): Largest absolute price change percentage in 1-hour window, or `null` if no valid data
- **`topMoverCoin`** (string | null): Symbol of the coin with the largest 1-hour price change, or `null` if no valid data
- **`marketCapCoverage`** (number): Percentage of total market cap covered by the analyzed coins (0.0 to 1.0)

## Data Source

### CoinGecko API Endpoint

**`GET /coins/markets`**

- **Purpose**: Fetches current market data for top cryptocurrencies
- **Called**: Once per API request
- **Parameters**:
  - `vs_currency=usd`
  - `order=market_cap_desc`
  - `per_page=50` (default, configurable via query param)
  - `page=1`
  - `price_change_percentage=1h,24h` (required for price change velocity calculation)

### Required Data Fields

The algorithm requires the following fields from CoinGecko's market data:
- `market_cap` (number): Market capitalization in USD
- `current_price` (number): Current price in USD
- `price_change_percentage_1h_in_currency` (number | undefined): 1-hour price change percentage
- `price_change_percentage_24h` (number | undefined): 24-hour price change percentage

### Data Validation

The algorithm automatically filters out coins that:
- Have zero or negative market cap
- Have zero or negative current price
- Are missing 1-hour price change data
- Are missing 24-hour price change data

If coins are filtered out, a warning is logged, and the calculation proceeds with the remaining valid coins.

## Implementation Details

### File Structure

```
features/PriceChangeVelocity/
├── PriceChangeVelocityCalculator.ts  # Main calculation logic
├── helpers.ts                        # Utility functions (classifyVolatility, findTopMover)
├── constants.ts                      # Configuration constants (thresholds, TOP_COINS_COUNT)
├── types.ts                          # TypeScript type definitions
├── index.ts                          # Public exports
└── PRICE_CHANGE_VELOCITY.md         # This documentation
```

### Key Functions

- **`calculateMarketVolatility(coins: CoinGeckoMarketData[]): VolatilityAnalysis`**
  - Main calculation function
  - Takes an array of coin market data from CoinGecko
  - Returns complete volatility analysis with metrics and classifications

- **`classifyVolatility(percentage: number, thresholds: VolatilityThresholds): VolatilityLevel`**
  - Maps a volatility percentage to a classification level
  - Uses different thresholds for 1h and 24h timeframes

- **`findTopMover(coins: CoinGeckoMarketData[], timeframe: '1h' | '24h'): TopMover | null`**
  - Finds the coin with the largest absolute price change
  - Returns `null` if no valid price change data exists

- **`shouldIncreaseRefreshRate(analysis: VolatilityAnalysis): boolean`**
  - Determines if current volatility warrants faster refresh rates
  - Returns `true` if 1h volatility is HIGH or EXTREME

- **`isSustainedVolatility(analysis: VolatilityAnalysis): boolean`**
  - Checks if volatility is sustained (both 1h and 24h elevated)
  - Useful for avoiding false positives from short-term spikes

## Real-Time vs. Historical Data

### Real-Time Nature

Unlike the VWATR feature which uses historical OHLCV data stored in Vercel Blob, Price Change Velocity uses **real-time data** from CoinGecko's markets endpoint. This means:

- ✅ **Current Market Conditions**: Reflects the most up-to-date market state
- ✅ **No Data Preparation Required**: No need to pre-fetch or store historical data
- ✅ **Always Current**: Each API call fetches fresh data from CoinGecko

### Limitations

- ⚠️ **API Rate Limits**: Each request makes one API call to CoinGecko. Be mindful of rate limits.
- ⚠️ **Network Dependency**: Requires active internet connection to CoinGecko API
- ⚠️ **CoinGecko Availability**: Dependent on CoinGecko API being operational

## Use Cases

### 1. Dynamic Refresh Rate Adjustment

Use the `shouldIncreaseRefreshRate()` function to determine when to increase your app's data refresh frequency:

```typescript
const analysis = await fetchPriceChangeVelocity();
if (shouldIncreaseRefreshRate(analysis)) {
  setRefreshInterval(60000); // 1 minute
} else {
  setRefreshInterval(300000); // 5 minutes
}
```

### 2. Market Condition Dashboard

Display current market volatility levels to users:

```typescript
const analysis = await fetchPriceChangeVelocity();
const status = analysis.level1h === 'EXTREME' ? '⚠️ Extreme Volatility' 
              : analysis.level1h === 'HIGH' ? '⚡ High Activity'
              : '✅ Normal Market';
```

### 3. Alert System

Set up alerts for extreme market conditions:

```typescript
const analysis = await fetchPriceChangeVelocity();
if (analysis.level1h === 'EXTREME' || analysis.level24h === 'EXTREME') {
  sendAlert('Extreme market volatility detected!');
}
```

### 4. Top Mover Tracking

Identify which coin is driving the most market movement:

```typescript
const analysis = await fetchPriceChangeVelocity();
if (analysis.topMoverCoin && analysis.topMoverPercentage) {
  console.log(`${analysis.topMoverCoin} moved ${analysis.topMoverPercentage}% in the last hour`);
}
```

## Comparison with VWATR

| Feature | Price Change Velocity | VWATR |
|---------|----------------------|-------|
| **Data Source** | Real-time CoinGecko markets | Historical OHLCV from Vercel Blob |
| **Timeframe** | 1h and 24h windows | 7, 14, 30 day periods |
| **Calculation** | Market-cap weighted price changes | Volume-weighted average true range |
| **Granularity** | Market-wide aggregate | Per-coin breakdown |
| **Use Case** | Real-time market conditions | Historical volatility analysis |
| **Data Preparation** | None required | Requires pre-fetching and storage |

## Important Notes

### Market Cap Coverage

The `marketCapCoverage` field indicates what percentage of the total cryptocurrency market cap is represented by the analyzed coins. A value of 0.87 means 87% of the market is covered. Higher coverage provides more representative market-wide metrics.

### Top Mover Nullability

The `topMoverPercentage` and `topMoverCoin` fields can be `null` if:
- No coins have valid price change data
- All price changes are exactly zero (extremely rare)

Always check for `null` before displaying top mover information to users.

### Sustained vs. Short-Term Volatility

Use `isSustainedVolatility()` to distinguish between:
- **Sustained volatility**: Both 1h and 24h are elevated → likely a real market trend
- **Short-term spike**: Only 1h is elevated → may be a temporary event

This helps avoid overreacting to brief market movements.

## Error Handling

The API endpoint handles errors gracefully:

- **Invalid `per_page` parameter**: Returns 400 error with validation message
- **CoinGecko API errors**: Returns appropriate error status and message via `handleApiError`
- **No market data returned**: Returns 404 error
- **Missing price change data**: Logs warnings and continues with available data

All errors are logged using the project's logging utility for debugging purposes.

