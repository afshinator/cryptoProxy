/**
 * Interface for a stablecoin asset.
 * Note: Market Cap and other data points are omitted as they are highly volatile and should be fetched
 * via a real-time API (e.g., CoinGecko, CoinMarketCap, Messari) for production use.
 */
export interface Stablecoin {
    /** The full name of the stablecoin. */
    name: string;
    /** The official ticker symbol. */
    symbol: string;
    /** The asset the coin is pegged to (e.g., USD, EUR, Gold). */
    pegAsset: string;
    /** The general type of collateralization (e.g., Fiat-Backed, Crypto-Backed, Algorithmic/Hybrid). */
    collateralType: 'Fiat-Backed' | 'Crypto-Backed' | 'Algorithmic/Hybrid' | 'Commodity-Backed';
    /** The issuer or managing DAO. */
    issuer: string;
  }
  
  /**
   * A list of major stablecoins, generally ranked by market capitalization.
   * Data is based on publicly available information and may not be exhaustive or real-time.
   */
  export const stablecoins: Stablecoin[] = [
    {
      name: "Tether",
      symbol: "USDT",
      pegAsset: "US Dollar",
      collateralType: "Fiat-Backed",
      issuer: "Tether Limited",
    },
    {
      name: "USD Coin",
      symbol: "USDC",
      pegAsset: "US Dollar",
      collateralType: "Fiat-Backed",
      issuer: "Circle",
    },
    {
      name: "Dai",
      symbol: "DAI",
      pegAsset: "US Dollar",
      collateralType: "Crypto-Backed",
      issuer: "MakerDAO",
    },
    {
      name: "Ethena USDe",
      symbol: "USDE",
      pegAsset: "US Dollar",
      collateralType: "Algorithmic/Hybrid",
      issuer: "Ethena Labs",
    },
    {
      name: "PayPal USD",
      symbol: "PYUSD",
      pegAsset: "US Dollar",
      collateralType: "Fiat-Backed",
      issuer: "PayPal (via Paxos)",
    },
    {
      name: "First Digital USD",
      symbol: "FDUSD",
      pegAsset: "US Dollar",
      collateralType: "Fiat-Backed",
      issuer: "First Digital Labs",
    },
    {
      name: "TrueUSD",
      symbol: "TUSD",
      pegAsset: "US Dollar",
      collateralType: "Fiat-Backed",
      issuer: "TrustToken",
    },
    {
      name: "Tether Gold",
      symbol: "XAUT",
      pegAsset: "Gold",
      collateralType: "Commodity-Backed",
      issuer: "Tether Limited",
    },
    {
      name: "Pax Gold",
      symbol: "PAXG",
      pegAsset: "Gold",
      collateralType: "Commodity-Backed",
      issuer: "Paxos Trust Company",
    },
    {
      name: "Euro Coin",
      symbol: "EURC",
      pegAsset: "Euro",
      collateralType: "Fiat-Backed",
      issuer: "Circle",
    },
    {
      name: "Gemini Dollar",
      symbol: "GUSD",
      pegAsset: "US Dollar",
      collateralType: "Fiat-Backed",
      issuer: "Gemini Trust Company",
    },
    // Note: BUSD (Binance USD) is generally excluded now as its issuance has largely ceased.
  ];