// Filename: src/utils/KvStorageGateway.ts

import { StorageGateway } from "../core/RawDataGateway.js";
import { kv } from "./redis.js"; // Imports the initialized KV client
import { getBlobJson, putBlobJson } from "./blob.js";
import { log, TMI, WARN } from "./log.js";

// KV Storage Gateway specific emoji
const LOG_EMOJI = "📦";

/**
 * Concrete implementation of the StorageGateway interface for the backend,
 * utilizing Vercel KV (Redis) for fast, short-term cache and Vercel Blob
 * for large, historical data storage.
 */
export class KvStorageGateway implements StorageGateway {
  // --- KV (Key-Value) Operations ---

  /**
   * Retrieves data from Vercel KV. KV handles TTL expiration automatically.
   * @param key - The cache key.
   * @returns The cached data, or null if not found or expired.
   */
  public async get(key: string): Promise<any> {
    try {
      const data = await kv.get(key);
      if (data) {
        log(`${LOG_EMOJI} KV Read: Key ${key} found.`, TMI);
      } else {
        log(`${LOG_EMOJI} KV Read: Key ${key} not found/expired.`, TMI);
      }
      return data;
    } catch (error) {
      log(`${LOG_EMOJI} KV Read: ⚠️ Error reading key ${key}.`, WARN);
      return null;
    }
  }

  /**
   * Stores data in Vercel KV with a specific Time-To-Live (TTL).
   * @param key - The cache key.
   * @param data - The data to store.
   * @param ttlSeconds - The lifespan of the cache entry in seconds.
   */
  public async set(key: string, data: any, ttlSeconds: number): Promise<void> {
    try {
      // Use EX (expire) option to set the TTL in seconds.
      await kv.set(key, data, { ex: ttlSeconds });
      log(`${LOG_EMOJI} KV Write: Key ${key} set with TTL ${ttlSeconds}s.`, TMI);
    } catch (error) {
      log(`${LOG_EMOJI} KV Write: ❌ Failed to write key ${key}. Error: ${error}`, WARN);
    }
  }

  // --- Blob Storage Operations ---

  /**
   * Retrieves large/historical data from Vercel Blob Storage.
   * @param key - The cache key (used as the blob path).
   * @returns The cached data object, or null if not found.
   */
  public async getBlob(key: string): Promise<any> {
    try {
      const data = await getBlobJson(key);
      if (data) {
        log(`${LOG_EMOJI} Blob Read: Key ${key} found.`, TMI);
      } else {
        log(`${LOG_EMOJI} Blob Read: Key ${key} not found.`, TMI);
      }
      return data;
    } catch (error) {
      // Blob errors often occur on missing files; treat as cache miss.
      log(`${LOG_EMOJI} Blob Read: ⚠️ Error or file not found for key ${key}.`, WARN);
      return null;
    }
  }

  /**
   * Stores large/historical data in Vercel Blob Storage.
   * Note: Vercel Blob doesn't support native TTL, so ttlSeconds is stored in metadata
   * but expiration must be validated manually when reading.
   * @param key - The cache key (used as the blob path).
   * @param data - The data to store (should be CachedRawDataResult with metadata).
   * @param ttlSeconds - TTL in seconds (stored in metadata, not enforced by blob service).
   */
  public async putBlob(key: string, data: any, ttlSeconds: number): Promise<void> {
    try {
      // The ttlSeconds is already included in the data object (CachedRawDataResult)
      await putBlobJson(key, data);
      log(`${LOG_EMOJI} Blob Write: Key ${key} stored successfully (TTL: ${ttlSeconds}s, metadata only).`, TMI);
    } catch (error) {
      log(`${LOG_EMOJI} Blob Write: ❌ Failed to write key ${key}. Error: ${error}`, WARN);
    }
  }
}

/**
 * Export a singleton instance for easy access across backend services.
 */
export const kvStorageGateway = new KvStorageGateway();
