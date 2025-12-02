# Feature: VWATR Calculation

Calculate the Volume-Weighted Average True Range (VWATR).

## Introduction to VWATR

The Volume-Weighted Average True Range (VWATR) is a volatility indicator that enhances the standard Average True Range (ATR) by incorporating volume.

- **True Range (TR)**: Measures daily price movement, accounting for high, low, and the previous day's close.
- **Volume (V)**: Represents the total amount of a crypto asset traded during that period.

By weighting the True Range by Volume, VWATR provides a more robust measure of volatility that accounts for market conviction and liquidity. A large price movement on high volume is significantly more meaningful than the same movement on low volume, and VWATR captures this distinction.

## Data Preparation

### Static Initial Data vs. Dynamic Operational Data

**⚠️ Important Limitation**: Your current setup only addresses the static, initial data loading needed for the first deployment. The system does **not** automatically handle changes to the top 20 coins over time.

**The Problem**:
1. `scripts/fetchTopCoinsVolatilityHistory.ts` captures the Top 20 coins **at the time it runs** and saves their history to local files.
2. `scripts/initialVolatilityHistoryUploader.ts` uploads that snapshot to Vercel Blob and creates a static manifest (`bag_manifest.json`) with the `top20_bag` list.
3. **If a new coin enters the top 20 later**, it will:
   - Not be in the manifest's `top20_bag` list
   - Not have historical data in blob storage
   - Be silently skipped by the API (with a warning log) if somehow included

**Current Behavior**: When the `/api/volatility` endpoint encounters a coin without history data, it logs a warning and skips that coin, returning results only for coins that have data.

**Solutions**:

1. **Manual Updates** (Current Approach):
   - Periodically re-run `fetchTopCoinsVolatilityHistory.ts` to get the current top 20
   - Re-run `initialVolatilityHistoryUploader.ts` to update blob storage and manifest
   - This ensures the manifest and data stay current

2. **Automated Maintenance Script** (Recommended): 🚩
   - Create a scheduled job (e.g., weekly via GitHub Actions, cron, or Vercel Cron) that:
     - Fetches the current top 20 coins
     - Compares with the existing manifest
     - Fetches history for any new coins
     - Updates only the new/missing coin histories in blob storage
     - Updates the manifest with the new top 20 list

3. **On-Demand Fetching** (Future Enhancement):
   - Modify the API to detect missing coins and fetch their history on-the-fly
   - This would require API key access in the serverless function and could hit rate limits

### 1. Data Capture (OHLCV)

Fetching scripts (`fetchTopCoinsVolatilityHistory.ts` and `fetchSuperstarsVolatilityHistory.ts`) explicitly state and utilize the corrected data retrieval method:

**Requirement**: VWATR requires the True Range (TR) and Volume (V). TR relies on High, Low, and Previous Close (HLC), and Volume is the volume traded. This means you need complete OHLCV data for each historical daily period.

**Scripts' Functionality**: Both fetching scripts are now correctly documented and structured to:

1. Call the CoinGecko `/ohlc` endpoint (provides Open, High, Low, Close).
2. Call the CoinGecko `/market_chart` endpoint (provides Volume).
3. Merge these two data streams by timestamp to create the final `HistoricalOHLCVDataPoint` array.

Scripts are capturing all five required components (Open, High, Low, Close, Volume) for **30 days of daily historical data**. This provides sufficient data for VWATR calculations with daily granularity. **Maximum supported period: 30 days.**

#### API Endpoints and Call Frequency

**CoinGecko API Endpoints Used**:

1. **`GET /coins/markets`** (Initial coin list)
   - **Purpose**: Fetches the current top N coins by market cap
   - **Called**: Once per script run (at the start)
   - **Parameters**: `vs_currency=usd`, `order=market_cap_desc`, `per_page=25`, `page=1`
   - **Returns**: Array of coin objects with `id`, `symbol`, `name`, `current_price`, `market_cap`, etc.

2. **`GET /coins/{id}/ohlc`** (OHLC data)
   - **Purpose**: Fetches Open, High, Low, Close prices for the last 30 days
   - **Called**: Once per coin (in parallel with market_chart)
   - **Parameters**: `vs_currency=usd`, `days=30`
   - **Returns**: Array of `[timestamp, open, high, low, close]` tuples
   - **Granularity**: For ≤30 days, returns 4-hour interval candles (aggregated to daily)
   - **Rate Limiting**: 4-second pause between coin requests

3. **`GET /coins/{id}/market_chart`** (Volume data)
   - **Purpose**: Fetches daily volume data for the last 30 days
   - **Called**: Once per coin (in parallel with ohlc)
   - **Parameters**: `vs_currency=usd`, `days=30`, `interval=daily`
   - **Returns**: Object with `prices`, `market_caps`, `total_volumes` arrays
   - **Used Data**: Only `total_volumes` array `[timestamp, volume]` pairs

**Total API Calls per Script Run**:
- **Top 20 Coins**: 1 markets call + (20 × 2) = **41 API calls** (20 OHLC + 20 market_chart)
- **Superstar Coins**: 0 markets call + (N × 2) = **2N API calls** (N OHLC + N market_chart, where N = number of coins in list)

**Rate Limiting**:
- **Pause Duration**: 4 seconds between each coin's data fetch
- **With API Key**: Higher rate limits (check CoinGecko documentation)
- **Without API Key**: Public rate limits apply (typically 10-50 calls/minute)

**Script Execution Frequency**:
- **Initial Setup**: Run once to seed the database
- **Maintenance**: Should be run periodically (weekly/monthly) to update the top 20 list and refresh historical data
- **Manual**: Run on-demand when needed

#### Data Structure and Storage

**Stored Data Format** (`HistoricalOHLCVDataPoint[]`):
```typescript
{
  time: number;        // Unix timestamp (milliseconds), rounded to midnight UTC
  open: number;        // Opening price for the day (USD)
  high: number;        // Highest price during the day (USD)
  low: number;         // Lowest price during the day (USD)
  close: number;       // Closing price for the day (USD)
  volume: number;      // Total trading volume for the day (USD)
}
```

**Data Characteristics**:
- **Time Range**: Last 30 days of historical data
- **Granularity**: Daily candles (aggregated from 4-hour intervals)
- **Timestamps**: Rounded to midnight UTC for each day
- **Currency**: All prices in USD
- **Storage Location**: Vercel Blob storage as JSON files (`{symbol}_history.json`)
- **Manifest**: `bag_manifest.json` contains lists of coins in each bag (`top20_bag`, `superstar_bag`, `all_coins`)

**Data Processing**:
1. OHLC data comes as 4-hour candles → aggregated into daily candles
2. Volume data comes as daily points → matched by timestamp
3. Final output: ~30 daily OHLCV data points per coin

#### Can I Use This Data for Today's Market Info?

**Short Answer**: **Partially, but with limitations.**

**What You CAN Use**:
- ✅ **Latest Close Price**: The last data point's `close` price represents the most recent completed trading day's closing price. This is used in ATR% calculations (`atrp = (ATR / latestClose) × 100`).
- ✅ **Recent Price Trends**: The last 30 days of OHLCV data shows recent price movements and volatility patterns.
- ✅ **Historical Context**: You can compare current volatility (7-day VWATR) against longer-term trends (30-day VWATR).

**What You CANNOT Use**:
- ❌ **Real-Time Prices**: The data is historical, not live. The latest data point is from the most recent completed trading day, not the current moment.
- ❌ **Today's Intraday Data**: If it's currently 2 PM on a trading day, you won't have today's OHLCV data yet (it will be available after the day completes).
- ❌ **Current Market Cap/Rankings**: The coin list in the manifest reflects the top 20 at the time the script was last run, not the current top 20.

**For Real-Time Market Data**:
- Use the `/api/markets` endpoint, which calls CoinGecko's `/coins/markets` endpoint and returns current prices, market caps, and rankings.
- This endpoint is separate from the volatility history system and provides live data.

**Best Practice**:
- Use volatility history data for **volatility analysis and risk assessment** (VWATR, ATR%)
- Use the markets endpoint for **current prices and market rankings**
- Combine both: Use current prices from `/api/markets` with volatility metrics from `/api/volatility` for comprehensive market analysis

### 2. Data Upload and Availability

`initialVolatilityHistoryUploader.ts` script ensures data is prepared and accessible:

- It checks the two required local directories (`data/coin-history` and `data/top-coins-history`).
- It validates that the loaded data contains the necessary fields (`high`, `low`, `volume`).
- It uploads all normalized data to Vercel Blob storage in a format that your serverless functions can easily query (`symbol_history.json`).

This completes the required chain: **Fetch OHLCV → Validate OHLCV → Upload OHLCV** for consumption by the VWATR calculation logic.

## Server Side Calculation Logic

- `utils/vwatrCalculator.ts`: This utility contains the core math functions (True Range, Volume-Weighted ATR).
- `api/volatility.ts`: This is the Vercel Serverless function (API route) that fetches the historical data from Vercel Blob, runs the calculation using the utility, and returns the result to your frontend.

## Interpreting the VWATR Values (7, 14, 30 Days)

The API returns two key numbers for each period: `vwatr` (the raw currency value) and `atrp` (the normalized percentage).

### 1. Raw VWATR (vwatr)

This is the output of the VWATR calculation, expressed in the asset's currency (e.g., USD for Bitcoin).

- **Meaning**: Represents the asset's average daily price fluctuation, weighted by volume, over the lookback period.
- **Use**: It is primarily useful for deriving the ATRP and for comparing volatility against the current price of the asset.

### 2. Percentage ATRP (atrp)

The ATR Percentage (`atrp`) is the most useful metric for direct comparison. It is calculated as:

```
ATRP = (Average Daily ATR / Latest Close) × 100
```

Where:
- **Average Daily ATR** is the normalized daily True Range average (calculated from the lookback period)
- **Latest Close** is the closing price of the most recent period in the lookback window

This gives you the average daily price movement as a percentage of the current price, making it easy to compare volatility across different assets.

- **Meaning**: This is the average daily movement as a percentage of the asset's current price.
- **Use**: It allows for "apples-to-apples" comparison of volatility between assets of vastly different prices (e.g., comparing Bitcoin's volatility to Dogecoin's volatility). This is the key metric for understanding relative risk.

### 3. Period Relevance

The three default periods provide different lenses for analyzing market conditions:

| Period | Typical Name | Relevance |
|--------|--------------|-----------|
| 7 Days | Short-Term Volatility | Captures recent, immediate market sentiment and reaction to news or events. Useful for understanding current momentum. |
| 14 Days | Medium-Term Volatility | A standard, common lookback period (similar to 2 weeks). Provides a balanced view of recent volatility, smoothing out single-day spikes. |
| 30 Days | Monthly Volatility | The longest available period. Provides a sense of the monthly volatility profile and underlying trend consistency. |

### 4. Getting a Sense of the Overall Market

To gauge the overall volatility of the crypto market, you can use the `top20_bag` to calculate market-wide velocity values. The `top20_bag` contains the top 20 cryptocurrencies by market cap (excluding stablecoins), providing a representative sample of the broader market.

#### Fetching Market-Wide Data

Call the API with `bag=top20_bag` to get volatility metrics for all top 20 coins:

```
GET /api/volatility?bag=top20_bag&periods=7,14,30
```

The response will include individual VWATR and ATRP values for each coin in the bag, broken down by period.

#### Calculating Market-Wide Velocity Metrics

Once you have the data for all coins in the `top20_bag`, you can aggregate the results to get market-wide metrics:

**1. Average Market ATRP** (Simple Mean)
- Calculate the average ATRP across all coins in the bag for each period
- Formula: `Average ATRP = Sum(ATRP for all coins) / Number of coins`
- This gives you the average daily volatility percentage for the market as a whole

**2. Median Market ATRP**
- Calculate the median ATRP across all coins
- Useful for identifying outliers and getting a more robust measure that isn't skewed by extreme values

**3. Market ATRP Range**
- Identify the minimum and maximum ATRP values in the bag
- Shows the spread of volatility across different assets
- A wide range indicates some coins are much more volatile than others

**4. Market Volatility Trend**
- Compare the average 7-day ATRP vs. 30-day ATRP for the entire bag
- If 7-day > 30-day: Market volatility is increasing (heating up)
- If 7-day < 30-day: Market volatility is decreasing (cooling down)

**Example Calculation** (JavaScript):
```javascript
// After fetching /api/volatility?bag=top20_bag&periods=7,14,30
const response = await fetch('/api/volatility?bag=top20_bag&periods=7,14,30');
const data = await response.json();

// Calculate average ATRP for 7-day period
const sevenDayResults = data.data.flatMap(coin => 
  coin.results.filter(r => r.period === 7)
);
const avg7DayATRP = sevenDayResults.reduce((sum, r) => sum + r.atrp, 0) / sevenDayResults.length;

// Calculate median ATRP for 7-day period
const sorted7DayATRP = sevenDayResults.map(r => r.atrp).sort((a, b) => a - b);
const median7DayATRP = sorted7DayATRP[Math.floor(sorted7DayATRP.length / 2)];

// Market volatility trend
const avg30DayATRP = data.data.flatMap(coin => 
  coin.results.filter(r => r.period === 30)
).reduce((sum, r) => sum + r.atrp, 0) / data.data.length;

const trend = avg7DayATRP > avg30DayATRP ? 'increasing' : 'decreasing';
```

#### Individual Coin Analysis

**Look at Major Coins**: Focus on Bitcoin (`btc`) and Ethereum (`eth`) within the bag. Their ATRP values typically set the floor for the overall market's activity.

**Compare VWATR to ATRP**:

- If an asset's `vwatr` value is high, but its `atrp` is low (like stablecoins: Tether), it confirms the calculation is correct and the asset is non-volatile.
- If an asset's `atrp` is significantly higher than its peers (e.g., 10%+ when BTC is 5%), it indicates that specific asset is undergoing a period of high risk/reward movement driven by volume.

**Identify Outliers**: Compare each coin's ATRP to the market average. Coins with ATRP significantly above the average may be experiencing unusual volatility or market events.

## Important Limitations

**Note**: Due to CoinGecko API limitations, we only retrieve 30 days of daily data for each asset's history. The maximum supported period for VWATR calculation is **30 days**. Any requested period greater than 30 will be filtered out and trigger a warning in the API response.
