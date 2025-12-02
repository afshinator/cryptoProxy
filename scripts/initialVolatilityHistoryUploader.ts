/**
 * Initial Data Uploader: scripts/initialVolatilityHistoryUploader.ts
 *
 * NOTE: This is a ONE-TIME Node.js script run locally or during a build process.
 * It is NOT a Vercel API route. It reads local files and uploads them to Vercel Blob.
 *
 * ASSUMPTIONS:
 * 1. Your data is structured as an array of CryptoDataPoint (OHLCV) objects, required for VWATR.
 * 2. You have a mechanism (like 'fs' for Node.js or 'require') to load the local JSON files.
 * 3. The 'put' function from Vercel Blob SDK is available.
 */

import { put } from '@vercel/blob'; // Vercel Blob SDK
import * as fs from 'fs'; // Node.js file system
import * as path from 'path';

// --- Import Custom Logging Utility ---
import { log, ERR, WARN, INFO } from '../utils/log';

// Define the structure for the data points required for VWATR
interface HistoricalOHLCVDataPoint {
  time: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Map to store all unique historical data, keyed by coin symbol
const uniqueCoinHistory = new Map<string, HistoricalOHLCVDataPoint[]>();

// --- Configuration: Paths to local data directories ---
const dataPaths = {
  superstar: path.join(process.cwd(), 'data', 'coin-history'),
  top20: path.join(process.cwd(), 'data', 'top-coins-history'),
};

// --- Bag Definitions (Dynamically populated during normalization) ---
let superstarBagSymbols: string[] = [];
let top20BagSymbols: string[] = [];

/**
 * Loads all data from the specified local directories, populates the uniqueCoinHistory map,
 * and tracks which symbols belong to which bag.
 */
function loadAndNormalizeData() {
  log("Starting data loading and normalization...", INFO);

  // Use Set to automatically handle and track unique symbols for each bag
  const superstarSet = new Set<string>();
  const top20Set = new Set<string>();

  for (const [bagName, dirPath] of Object.entries(dataPaths)) {
    if (!fs.existsSync(dirPath)) {
      log(`Directory not found: ${dirPath}. Skipping.`, WARN);
      continue;
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    const currentBagSet = bagName === 'superstar' ? superstarSet : top20Set;

    for (const file of files) {
      // Assumes file name is the symbol, e.g., 'btc.json' -> 'btc'
      const coinSymbol = file.replace('.json', '').toLowerCase();
      const filePath = path.join(dirPath, file);

      try {
        // NOTE ON DATA FORMAT: The VWATR calculation requires High, Low, Close, and Volume.
        // It is critical that the JSON structure loaded here contains this OHLCV data,
        // otherwise VWATR calculation will fail.
        const rawData: HistoricalOHLCVDataPoint[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // 1. Add symbol to the current bag tracking set
        currentBagSet.add(coinSymbol);

        // 2. Normalize: Store the history only once per unique coin symbol
        if (!uniqueCoinHistory.has(coinSymbol)) {
          uniqueCoinHistory.set(coinSymbol, rawData);
          log(`Normalized history loaded for: ${coinSymbol}`);
        }

      } catch (e) {
        log(`Error processing file ${filePath}: ${e instanceof Error ? e.message : String(e)}`, ERR);
      }
    }
  }

  // Assign final, unique symbol arrays
  superstarBagSymbols = Array.from(superstarSet);
  top20BagSymbols = Array.from(top20Set);

  log(`Superstar Bag symbols detected: [${superstarBagSymbols.join(', ')}]`, INFO);
  log(`Top 20+ Bag symbols detected: [${top20BagSymbols.join(', ')}]`, INFO);
}

/**
 * Uploads all unique coin history files and the manifest file to Vercel Blob.
 */
async function uploadToBlob() {
  // 1. Upload Normalized Coin History Files (e.g., symbol_history.json)
  const uploadPromises = Array.from(uniqueCoinHistory.entries()).map(([symbol, data]) => {
    const blobFileName = `${symbol}_history.json`;
    log(`Uploading unique history file: ${blobFileName}`);
    // We store the raw data; VWATR will be calculated by the serverless function.
    return put(blobFileName, JSON.stringify(data), { access: 'public', contentType: 'application/json' });
  });

  // 2. Upload Bag Manifest File (To address redundancy and define groups)
  const bagManifest = {
    superstar_bag: superstarBagSymbols, // Dynamically loaded list
    top20_bag: top20BagSymbols,     // Dynamically loaded list
    all_coins: Array.from(uniqueCoinHistory.keys()),
  };
  uploadPromises.push(
    put('bag_manifest.json', JSON.stringify(bagManifest), { access: 'public', contentType: 'application/json' })
  );
  log("Uploading bag_manifest.json...");

  await Promise.all(uploadPromises);
  log(`\n✅ Data migration complete. ${uniqueCoinHistory.size} unique coin histories and 1 manifest uploaded.`, INFO);
}

async function runInitialSetup() {
  loadAndNormalizeData();
  if (uniqueCoinHistory.size > 0) {
    await uploadToBlob();
  } else {
    log("No data found to upload. Check your file paths and JSON structure.", WARN);
  }
}

// To run this script locally: node -r ts-node/register scripts/initialUploader.ts
// Ensure you have configured your Vercel CLI/environment for Blob access.
// runInitialSetup();

// NOTE: We don't call runInitialSetup() directly here as this is a conceptual script,
// but the user should execute it via their local environment.