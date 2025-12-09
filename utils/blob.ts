// Filename: src/utils/blob.ts

import { list, put, PutBlobResult } from "@vercel/blob";
import { log, TMI, WARN } from "./log.js";
import { fetchJson } from "./httpClient.js";

// Blob Utility specific emoji
const LOG_EMOJI = "☁️";

/**
 * Local interface definition for the Vercel Blob metadata object, containing
 * only the properties needed by this utility. This avoids relying on internal
 * non-exported types from the Vercel SDK.
 */
interface VercelBlobMetadata {
  pathname: string;
  uploadedAt: Date;
  // Add other fields from the list() result if needed (e.g., url, size)
  url: string;
}

// --- Private Utilities ---

/**
 * Finds the latest blob metadata object within a directory (prefix).
 * @param pathPrefix - The directory path in the blob store.
 * @returns The metadata of the most recently updated blob, or null if none is found.
 */
async function findLatestBlobMetadata(pathPrefix: string): Promise<VercelBlobMetadata | null> {
  try {
    // Note: The 'blobs' array contains objects conforming to the VercelBlobMetadata structure.
    const { blobs } = await list({
      prefix: pathPrefix,
      limit: 100,
    });

    if (blobs.length === 0) {
      log(`${LOG_EMOJI} Blob List: No blobs found with prefix: ${pathPrefix}`, TMI);
      return null;
    }

    // Since the type returned by list() is generic, we ensure the properties are used correctly.
    // We must manually cast or trust the list result structure.
    blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    log(`${LOG_EMOJI} Blob List: Found ${blobs.length} blobs. Latest is ${blobs[0].pathname}`, TMI);
    return blobs[0] as VercelBlobMetadata;
  } catch (error) {
    log(
      `${LOG_EMOJI} Blob List: ❌ Failed to list blobs for prefix ${pathPrefix}. Error: ${error}`,
      WARN
    );
    return null;
  }
}

// --- Public Access Methods ---

/**
 * Retrieves data from the blob storage by finding the latest blob matching the key
 * and fetching its content as JSON.
 * @param key - The abstract cache key.
 * @returns The data object, or null if the blob is not found or fetching fails.
 */
export async function getBlobJson(key: string): Promise<any> {
  const latestBlob = await findLatestBlobMetadata(key);

  if (!latestBlob) {
    return null;
  }

  try {
    const data = await fetchJson(latestBlob.url, { context: "Vercel Blob Fetch" });
    log(`${LOG_EMOJI} Blob Fetch: Successfully retrieved JSON from ${latestBlob.pathname}`, TMI);
    return data;
  } catch (error) {
    log(`${LOG_EMOJI} Blob Fetch: ❌ Failed to fetch JSON from URL: ${error}`, WARN);
    return null;
  }
}

/**
 * Stores data in Vercel Blob Storage, using the key as the pathname.
 * @param key - The abstract cache key.
 * @param data - The data object to store.
 * @returns The result metadata from the put operation.
 */
export async function putBlobJson(key: string, data: any): Promise<PutBlobResult | null> {
  const pathname = `${key}_${Date.now()}.json`;

  try {
    const dataString = JSON.stringify(data);

    const result = await put(pathname, dataString, {
      access: "public",
      contentType: "application/json",
    });

    log(`${LOG_EMOJI} Blob Put: Stored as ${pathname}`, TMI);
    return result;
  } catch (error) {
    log(`${LOG_EMOJI} Blob Put: ❌ Failed to store blob ${pathname}. Error: ${error}`, WARN);
    return null;
  }
}
