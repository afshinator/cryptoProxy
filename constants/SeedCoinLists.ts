// Filename: constants/SeedCoinLists.ts

// Define the structure for the portfolio object
export interface Portfolio {
  title: string;
  // Coins are now keys (ticker) mapped to the full name (string)
  coins: Record<string, string>;

}

// The single portfolio object, where coins are keys (ticker) mapped to the full name
const twwSuperstars: Portfolio = {
  title: "TWW-Superstars",
  coins: {
    "btc": "bitcoin",
    "eth": "ethereum",
    "ada": "cardano",
    "sol": "solana",
    "xrp": "ripple", // CoinGecko uses 'ripple' for XRP
    "link": "chainlink",
    "apt": "aptos",
    "atom": "cosmos",
    "cro": "crypto-com-chain", // Cro's ID
    "fil": "filecoin",
    "grt": "the-graph",
    "hbar": "hedera-hashgraph", // HBAR's ID
    "imx": "immutable-x",
    "leo": "unus-sed-leo",
    "near": "near",
    "pyth": "pyth-network",
    "qnt": "quant-network", // Quant's ID
    "stx": "stacks",
    "sui": "sui",
    "tao": "bittensor",
    "theta": "theta-token", // Theta Network's ID
    "xdc": "xinfin-network",
    "api3": "api3",
    "aergo": "aergo",
    "dent": "dent",
    "nmr": "numeraire",
    "ocean": "ocean-protocol",
    "rsr": "reserve-rights-token", // RSR's ID
    "ftm": "fantom",
    "init": "initia",
  },
};

// Export the single portfolio object wrapped in an array
export const cryptoPortfolios: Portfolio[] = [twwSuperstars];