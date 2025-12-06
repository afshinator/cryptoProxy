/**
 * Redis Client for Cache Storage
 * 
 * Initializes and exports a Redis client instance using Upstash Redis.
 * The client is initialized from Vercel-provided environment variables.
 */

import { Redis } from '@upstash/redis';

/**
 * Initialize Redis client from Vercel environment variables
 * 
 * Vercel provides these environment variables for Upstash Redis:
 * - KV_REST_API_URL: The REST API URL for the Redis instance
 * - KV_REST_API_TOKEN: The REST API token for authentication
 * 
 * These are automatically set by Vercel when you connect Upstash Redis
 * to your Vercel project.
 */
export const redis = new Redis({
  url: process.env.KV_REST_API_URL || '',
  token: process.env.KV_REST_API_TOKEN || '',
});

