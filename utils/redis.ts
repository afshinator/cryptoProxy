// Filename: src/utils/redis.ts

import { Redis } from "@upstash/redis";
import { ERR, log, TMI } from "./log.js";

// Redis Client specific emoji
const LOG_EMOJI = "💾";

// The Vercel KV client is built on top of Upstash/Redis.
// It is initialized using environment variables (KV_URL, KV_TOKEN) expected
// in the Vercel environment.

let redisClient: Redis | null = null;

/**
 * Initializes and returns the Vercel KV (Upstash Redis) client instance.
 * Ensures the client is a singleton.
 * @returns The initialized Redis client.
 * @throws An error if the required environment variables are not set.
 */
function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  if (!process.env.KV_URL || !process.env.KV_TOKEN) {
    log(
      `${LOG_EMOJI} ERROR: Vercel KV environment variables (KV_URL, KV_TOKEN) are missing.`,
      ERR
    );
    throw new Error("KV_URL or KV_TOKEN environment variables are not set for Redis client.");
  }

  redisClient = new Redis({
    url: process.env.KV_URL,
    token: process.env.KV_TOKEN,
  });

  log(`${LOG_EMOJI} Redis Client initialized successfully.`, TMI);
  return redisClient;
}

/**
 * The singleton instance of the Vercel KV (Redis) client used throughout the backend.
 * All backend services should import this 'kv' instance.
 */
export const kv: Redis = getRedisClient();
