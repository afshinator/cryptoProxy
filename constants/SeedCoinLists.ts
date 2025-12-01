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
    "btc": "Bitcoin",
    "eth": "Ethereum",
    "ada": "Cardano",
    "apt": "Aptos",
    "atom": "Cosmos",
    "cro": "Cronos",
    "fil": "Filecoin",
    "grt": "The Graph",
    "hbar": "Hedera",
    "imx": "ImmutableX",
    "leo": "UNUS SED LEO",
    "link": "Chainlink",
    "near": "NEAR Protocol",
    "pyth": "Pyth Network",
    "qnt": "Quant",
    "sol": "Solana",
    "stx": "Stacks",
    "sui": "Sui",
    "tao": "Bittensor",
    "theta": "Theta Network",
    "xdc": "XinFin Network",
    "xrp": "XRP",
    "api3": "API3",
    "aergo": "Aergo",
    "dent": "DENT",
    "init": "Initia",
    "nmr": "Numeraire",
    "ocean": "Ocean Protocol",
    "rsr": "Reserve Rights",
    "ftm": "Fantom",

  },
};

// Export the single portfolio object wrapped in an array
export const cryptoPortfolios: Portfolio[] = [twwSuperstars];