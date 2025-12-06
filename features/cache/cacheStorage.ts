// Filename: features/cache/cacheStorage.ts
/**
 * Cache Storage Interface
 * 
 * Abstracts Redis/KV storage operations to keep cache logic separate
 * from storage implementation details.
 * 
 * This module provides:
 * - CacheStorage interface for storage abstraction
 * - RedisCacheStorage implementation using Upstash Redis
 * - CachedData type definition for stored cache entries
 * 
 * By abstracting storage operations, the cache logic can be tested
 * independently and storage implementations can be swapped easily.
 */

import { redis } from '../../utils/redisClient.js';
import { log, LOG, WARN } from '../../utils/log.js';

export interface CachedData<T = any> {
  data: T;
  timestamp: number;
}

/**
 * Storage interface for cache operations
 */
export interface CacheStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/**
 * Redis-based cache storage implementation
 */
class RedisCacheStorage implements CacheStorage {
  async get(key: string): Promise<string | null> {
    try {
      return await redis.get<string>(key);
    } catch (error) {
      log(`💿 ⚠️ Redis read failed for '${key}': ${error instanceof Error ? error.message : String(error)}`, WARN);
      throw error;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await redis.set(key, value);
    } catch (error) {
      log(`💿 ⚠️ Redis write failed for '${key}': ${error instanceof Error ? error.message : String(error)}`, WARN);
      throw error;
    }
  }
}

/**
 * Default cache storage instance (Redis)
 */
export const cacheStorage: CacheStorage = new RedisCacheStorage();

