# Feature: Market Dominance

Calculate and serve the **current market dominance** of Bitcoin (BTC), Ethereum (ETH), stablecoins, and "Others".

## Introduction to Market Dominance

Market dominance measures what percentage of the total cryptocurrency market capitalization is held by specific categories of assets. This feature provides real-time dominance calculations for the four major market segments:

1. **Bitcoin (BTC)** - The original cryptocurrency
2. **Ethereum (ETH)** - The second-largest cryptocurrency
3. **Stablecoins** - Major stablecoins combined (USDT, USDC, DAI, etc.)
4. **Others** - All remaining cryptocurrencies

### Key Concepts

- **Total Market Cap**: The comprehensive market capitalization of all cryptocurrencies (used as the denominator for all calculations)
- **Category Market Cap**: The combined market cap of assets within a specific category
- **Dominance Percentage**: The percentage of total market cap represented by a category: `(Category Market Cap / Total Market Cap) × 100`
- **Consistency**: All dominance percentages sum to 100%, ensuring accurate market representation

## API Calls Analysis

| # | Endpoint | Parameters | Purpose | Data Retrieved | API Calls |
|---|----------|------------|---------|----------------|-----------|
| 1 | `/global` | (none) | Get total market cap & BTC dominance % | `data.total_market_cap`, `data.market_cap_percentage.btc` | 1 |
| 2 | `/coins/markets` | `ids=bitcoin,ethereum,tether,usd-coin,dai,ethena-usde,paypal-usd,first-digital-usd,true-usd,gemini-dollar,euro-coin,usdd,liquity-usd,paxos-standard` | Get BTC, ETH, and all stablecoin market caps | `market_cap` for Bitcoin, Ethereum, and 12 stablecoins (14 coins total) | 1 |
| 3 | (calculation) | N/A | Calculate "Others" | `Total - BTC - ETH - Stablecoins` | 0 |

**Total API Calls: 2**

### Rate Limit Considerations

- **Free tier**: 30 calls/minute — 2 calls is well within limits
- **With API key**: Higher limits — no concerns
- **Combined call**: Single call fetches BTC, ETH, and all 12 stablecoins (14 coins total) for maximum efficiency

## Data Requirements

| Data Point | Category | CoinGecko Free API Endpoint | Calculation/Notes |
|------------|----------|----------------------------|-------------------|
| **MC<sub>Total</sub>** | Total Market Cap | `/global` | Used as the denominator for all calculations. |
| **MC<sub>BTC</sub>** | Bitcoin Market Cap | `/coins/markets?ids=bitcoin` | Used as the numerator for BTC.D. |
| **MC<sub>ETH</sub>** | Ethereum Market Cap | `/coins/markets?ids=ethereum` | Used as the numerator for ETH.D. |
| **MC<sub>Stablecoins</sub>** | Stablecoin Market Cap | `/coins/markets?ids=tether,usd-coin,dai,ethena-usde,paypal-usd,first-digital-usd,true-usd,gemini-dollar,euro-coin,usdd,liquity-usd,paxos-standard` | Calculated by summing the individual market caps of fiat-pegged stablecoins. **Note:** Gold-backed tokens (tether-gold, pax-gold) are excluded. |

## Market Dominance Formulae

The principle for calculating dominance is always the same: **(Category Market Cap / Total Market Cap) × 100**.

### 1. Bitcoin Dominance (BTC.D)

$$\text{BTC.D} = \frac{MC_{\text{BTC}}}{MC_{\text{Total}}} \times 100$$

### 2. Ethereum Dominance (ETH.D)

$$\text{ETH.D} = \frac{MC_{\text{ETH}}}{MC_{\text{Total}}} \times 100$$

### 3. Stablecoin Dominance (Stablecoins.D)

$$\text{Stablecoins.D} = \frac{MC_{\text{Stablecoins}}}{MC_{\text{Total}}} \times 100$$

### 4. Others Dominance (Others.D)

To find the market cap for the "Others" category, you first subtract the three major categories from the total. This ensures that the dominance percentages of your four segments sum up to **100%**.

**Step A: Calculate Others Market Cap**

$$MC_{\text{Others}} = MC_{\text{Total}} - (MC_{\text{BTC}} + MC_{\text{ETH}} + MC_{\text{Stablecoins}})$$

**Step B: Calculate Others Dominance**

$$\text{Others.D} = \frac{MC_{\text{Others}}}{MC_{\text{Total}}} \times 100$$

## Implementation Notes

### Total Market Cap Consistency

The `/global` endpoint provides the **comprehensive and consistent** total market cap figure. This is used as the single source of truth for all dominance calculations, ensuring accuracy and consistency across all categories.

### Stablecoin Selection

The stablecoin calculation includes **fiat-pegged stablecoins only**. Gold-backed tokens (tether-gold, pax-gold) are excluded as they track gold prices rather than fiat currencies.

**Included Stablecoins (12 coins):**
- tether, usd-coin, dai, ethena-usde, paypal-usd, first-digital-usd, true-usd, gemini-dollar, euro-coin, usdd, liquity-usd, paxos-standard

These are fetched in a single API call using comma-separated IDs.

### Error Handling

- If a stablecoin is not found in the API response, it should be handled gracefully (logged but not cause failure)
- Missing market cap data should be treated as 0 for that specific stablecoin
- The calculation should proceed even if some stablecoins are missing

### Data Source Separation

The calculation logic is separated from the data source (CoinGecko API) to allow for easy switching to alternative data providers in the future. The data fetching layer is abstracted from the dominance calculation logic.

## API Usage

### Endpoint

```
GET /api/dominance
```

### Query Parameters

None (all data is fetched from CoinGecko)

### Example Request

```bash
GET /api/dominance
```

### Response Format

```json
{
  "totalMarketCap": 2500000000000,
  "btc": {
    "marketCap": 1000000000000,
    "dominance": 40.0
  },
  "eth": {
    "marketCap": 500000000000,
    "dominance": 20.0
  },
  "stablecoins": {
    "marketCap": 200000000000,
    "dominance": 8.0
  },
  "others": {
    "marketCap": 800000000000,
    "dominance": 32.0
  },
  "timestamp": 1234567890000
}
```

### Response Fields

- **`totalMarketCap`** (number): Total market capitalization in USD
- **`btc`** (object): Bitcoin dominance data
  - **`marketCap`** (number): Bitcoin market cap in USD
  - **`dominance`** (number): Bitcoin dominance percentage
- **`eth`** (object): Ethereum dominance data
  - **`marketCap`** (number): Ethereum market cap in USD
  - **`dominance`** (number): Ethereum dominance percentage
- **`stablecoins`** (object): Stablecoins dominance data
  - **`marketCap`** (number): Combined stablecoins market cap in USD
  - **`dominance`** (number): Stablecoins dominance percentage
- **`others`** (object): Others dominance data
  - **`marketCap`** (number): Others market cap in USD (calculated)
  - **`dominance`** (number): Others dominance percentage
- **`timestamp`** (number): Unix timestamp of when the calculation was performed

## Future Enhancements

- **Historical Dominance**: Track dominance over time (future feature)
- **Additional Categories**: Support for other categories (e.g., Layer 1, Layer 2, DeFi tokens)
- **Multiple Data Sources**: Support for alternative data providers beyond CoinGecko

