// Filename: src/utils/redis.ts

import { Redis } from "@upstash/redis";
import { ERR, log, TMI } from "./log.js";

// Redis Client specific emoji
const LOG_EMOJI = "💾";

// The Vercel KV client is built on top of Upstash/Redis.
// It is initialized using environment variables provided by Vercel:
// - KV_REST_API_URL: The REST API URL for the Redis instance
// - KV_REST_API_TOKEN: The REST API token for authentication
// These are automatically set by Vercel when you connect Upstash Redis to your project.

let redisClient: Redis | null = null;

/**
 * Initializes and returns the Vercel KV (Upstash Redis) client instance.
 * Ensures the client is a singleton.
 * Uses lazy initialization to avoid errors at module load time.
 * @returns The initialized Redis client.
 * @throws An error if the required environment variables are not set.
 */
function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  // Check for standard Vercel KV environment variables first
  const url = process.env.KV_REST_API_URL || process.env.KV_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.KV_TOKEN;

  if (!url || !token) {
    log(
      `${LOG_EMOJI} ERROR: Vercel KV environment variables are missing.`,
      ERR
    );
    log(
      `${LOG_EMOJI} Expected: KV_REST_API_URL and KV_REST_API_TOKEN (or KV_URL and KV_TOKEN)`,
      ERR
    );
    throw new Error("KV environment variables are not set for Redis client. Please set KV_REST_API_URL and KV_REST_API_TOKEN in your Vercel project settings.");
  }

  redisClient = new Redis({
    url: url,
    token: token,
  });

  log(`${LOG_EMOJI} Redis Client initialized successfully.`, TMI);
  return redisClient;
}

/**
 * The singleton instance of the Vercel KV (Redis) client used throughout the backend.
 * All backend services should import this 'kv' instance.
 * Uses lazy initialization - only creates the client when first accessed.
 */
export const kv: Redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedisClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
