# Crypto Proxy - Vercel Serverless Functions

A Vercel project with serverless functions and Vercel Blob storage support.

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

### What the app currently fetches:

Individual coin market caps via /api/markets:

    - Calls CoinGecko's /coins/markets endpoint

    - Returns market cap for each coin in the response

    - BTC and ETH are included if they're in the top N (usually are)

    - You can query specific coins using ids=bitcoin,ethereum


Calculated "total market cap" (not global):

    - The volatility calculator sums market caps of the coins it fetches

    - This is not the global total market cap
