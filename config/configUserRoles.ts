// Filename: src/config/configUserRoles.ts

import type { ProviderName } from '../constants/ProviderNames.js';
import { log, TMI, WARN } from '../utils/log.js';

// User Role Config specific emoji
const LOG_EMOJI = '👤';

/**
 * Defines the user's access rights and service guarantees.
 */
export interface UserRoleConfig {
  /** The unique name of the role ('basic', 'user', 'TWW', 'superuser'). */
  name: 'basic' | 'user' | 'TWW' | 'superuser';
  
  /** The maximum number of API calls allowed per time window (e.g., per minute). */
  rateLimit: {
    callsPerWindow: number;
    windowSeconds: number;
  };

  /** Specific policies related to data freshness and caching. */
  cache_control: {
    /** * The minimum freshness guarantee, in seconds. 
     * The system will NOT serve data older than this duration.
     * Set to 1 for superuser to enforce extreme freshness/cache bypass.
     */
    minimum_ttl_seconds: number;
  };

  /** The list of providers this role is authorized to use. */
  authorizedProviders: ProviderName[];
}

/**
 * The configuration map for all defined user roles.
 */
export const USER_ROLES: Record<UserRoleConfig['name'], UserRoleConfig> = {

  'basic': {
    name: 'basic',
    rateLimit: {
      callsPerWindow: 10,
      windowSeconds: 60, // 10 calls per minute (Low)
    },
    cache_control: {
      // Basic users don't enter keys, so they get the lowest service guarantees.
      minimum_ttl_seconds: 300, // 5 minutes (Highest cache duration)
    },
    authorizedProviders: [
      'COINGECKO_FREE_NO_KEY', // Only key-less providers
    ],
  },

  'user': {
    name: 'user',
    rateLimit: {
      callsPerWindow: 60,
      windowSeconds: 60, // 1 call per second (Medium)
    },
    cache_control: {
      // Standard users who access the backend get better freshness.
      minimum_ttl_seconds: 60, 
    },
    authorizedProviders: [
      'COINGECKO_FREE_NO_KEY',
      'COINGECKO_FREE_WITH_KEY', // Can use own keys
      // 'CRYPTO_PROXY', // Indicates they are authorized to access the backend/proxy services
    ],
  },
  
  'TWW': {
    name: 'TWW',
    rateLimit: {
      callsPerWindow: 120,
      windowSeconds: 60, // 2 calls per second (High)
    },
    cache_control: {
      // TWW has a special key, demanding high priority and strict freshness.
      minimum_ttl_seconds: 30, 
    },
    authorizedProviders: [
      'COINGECKO_FREE_NO_KEY',
      'COINGECKO_FREE_WITH_KEY',
      'COINMARKETCAP_FREE_WITH_KEY',
      // 'CRYPTO_PROXY', // Full access to all standard pool providers
    ],
  },
  
  'superuser': {
    name: 'superuser',
    rateLimit: {
      callsPerWindow: 500, // Very high limit
      windowSeconds: 60, 
    },
    cache_control: {
      // By setting minimum_ttl_seconds to 1, we ensure the system *always* // attempts a fresh fetch or serves near-immediate data, effectively bypassing the cache.
      minimum_ttl_seconds: 1, 
    },
    authorizedProviders: [
      'COINGECKO_FREE_NO_KEY',
      'COINGECKO_FREE_WITH_KEY',
      'COINMARKETCAP_FREE_WITH_KEY',
      // 'CRYPTO_PROXY',
      // Any other potential provider can be listed here for full access
    ],
  },
};

/**
 * Utility function to retrieve a user's role configuration by name.
 * Defaults to 'basic' if the role is unrecognized.
 */
export function getUserRoleConfig(roleName: string): UserRoleConfig {
  
  // Use 'in' check for safe type narrowing
  if (Object.prototype.hasOwnProperty.call(USER_ROLES, roleName)) {
    // TypeScript now knows roleName must be one of the literal keys
    const role = USER_ROLES[roleName as UserRoleConfig['name']];
    log(`${LOG_EMOJI} Role found: ${roleName}`, TMI);
    return role;
  }
  
  // If the key is not valid or doesn't exist:
  log(`${LOG_EMOJI} Warning: Unrecognized role '${roleName}'. Defaulting to 'basic'.`, WARN);
  return USER_ROLES['basic'];
}