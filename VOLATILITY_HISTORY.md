# Feature: VWATR calculation

- Calculate the Volume-Weighted Average True Range (VWATR).

## Data preparation

1. Static Initial Data vs. Dynamic Operational Data
Your current setup only addresses the static, initial data loading needed for the first deployment:

scripts/fetchTopCoinsVolatilityHistory.ts: This script runs once (or manually whenever you want to update the base data set) to capture the Top 20 coins at that moment in time and saves them to Vercel Blob.

This initial upload gives you a starting set of history, but it does not automatically update that list or the history months later.



### 1. Data Capture (OHLCV)

Fetching scripts (`fetchTopCoinsVolatilityHistory.ts` and `fetchSuperstarsVolatilityHistory.ts`) explicitly state and utilize the corrected data retrieval method:

* **Requirement:** VWATR requires the **True Range (TR)** and **Volume (V)**. TR relies on **High, Low, and Previous Close (HLC)**, and Volume is the volume traded. This means you need complete **OHLCV** data for each historical daily period.
* **Scripts' Functionality:** Both fetching scripts are now correctly documented and structured to:
    1.  Call the CoinGecko `/ohlc` endpoint (provides Open, High, Low, Close).
    2.  Call the CoinGecko `/market_chart` endpoint (provides Volume).
    3.  **Merge** these two data streams by timestamp to create the final `HistoricalOHLCVDataPoint` array.

Scripts are capturing all five required components (Open, High, Low, Close, Volume) for the 90-day history, the data is sufficient for VWATR calculation.


### 2. Data Upload and Availability

 `initialVolatilityHistoryUploader.ts` script ensures data is prepared and accessible:

* It checks the two required local directories (`coin-history` and `top-coins-history`).
* It validates that the loaded data contains the necessary fields (`high`, `low`, `volume`).
* It uploads all normalized data to Vercel Blob storage in a format that your serverless functions can easily query (`symbol_history.json`).

This completes the required chain: **Fetch OHLCV $\rightarrow$ Validate OHLCV $\rightarrow$ Upload OHLCV** for consumption by the VWATR calculation logic.


## Server side calculation logic

- `utils/vwatrCalculator.ts`: This utility contains the core math functions (True Range, Volume-Weighted ATR).

- `api/vwatr.ts`: This is the Vercel Serverless function (API route) that fetches the historical data from Vercel Blob, runs the calculation using the utility, and returns the result to your frontend.

