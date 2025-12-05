# Crypto Proxy

Backend for my CryptoSpect app.  

Runs Vercel serverless functions and access Vercel blob.



## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

-  Add secret keys to Vercel dashboard under the project.
-  env.local doesn't seem to work.


### 3. Testing

`npm test`


#### Vercel Deployment

`vercel dev`

`vercel deploy`

---

## Services Provided by app

Take a look at the index page where the app is running.


## External APIs

This application accesses the following external APIs and services:

### 1. CoinGecko API
**Base URL:** `https://api.coingecko.com/api/v3`

**Endpoints Used:**
- **`/coins/markets`** - Market data (prices, market caps, volumes)
  - Used by: `/api/markets`, `/api/dominance`, `/api/volatility` (current type)
- **`/global`** - Global market data (total market cap)
  - Used by: `/api/dominance`
- **`/coins/{id}/ohlc`** - OHLC data (last 30 days)
  - Used by: Historical volatility scripts (not runtime API endpoints)
- **`/coins/{id}/market_chart`** - Volume and price history
  - Used by: Historical volatility scripts (not runtime API endpoints)

**Authentication:** Optional API key via `COINGECKO_API_KEY` environment variable (uses `x_cg_demo_api_key` parameter)

### 2. Vercel Blob Storage API
**Service:** Vercel Blob Storage (via `@vercel/blob` SDK)

**Operations:**
- **`list()`** - List blobs by prefix (used by `/api/volatility` to find historical data files)
- **`put()`** - Upload files (used by upload scripts, not runtime endpoints)
- **`head()` and `del()`** - Available but not actively used

**Purpose:** Stores pre-seeded historical OHLCV data for VWATR calculations (not a cache of API responses)

**Authentication:** `BLOB_READ_WRITE_TOKEN` environment variable

---

### What the app currently fetches:

Individual coin market caps via /api/markets:

    - Calls CoinGecko's /coins/markets endpoint

    - Returns market cap for each coin in the response

    - BTC and ETH are included if they're in the top N (usually are)

    - You can query specific coins using ids=bitcoin,ethereum


Calculated "total market cap" (not global):

    - The volatility calculator sums market caps of the coins it fetches

    - This is not the global total market cap
