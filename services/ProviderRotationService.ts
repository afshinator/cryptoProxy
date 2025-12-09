// Filename: src/services/ProviderRotationService.ts (REFACTORED)

import { ProviderName } from "../constants/ProviderNames.js";
import { log, TMI } from "../utils/log.js";
import type { ProviderUsageAdapter } from "./ProviderUsageAdapter.js"; // New import

// Rotation Service specific emoji
const LOG_EMOJI = "🔄";

/**
 * Service responsible for selecting the optimal API provider using a resilient,
 * round-robin-style rotation. It is storage-agnostic, requiring a
 * ProviderUsageAdapter instance for all state operations.
 */
export class ProviderRotationService {
  /**
   * Selects the optimal provider from a list of usable options based on the lowest usage count.
   * @param usableProviders - The list of providers the current user role has access to.
   * @param adapter - The storage adapter instance (KV for backend, AsyncStorage for frontend).
   * @returns The name of the best provider to use for the current request.
   * @throws An error if the usableProviders list is empty.
   */
  public static async selectBestProvider(
    usableProviders: ProviderName[],
    adapter: ProviderUsageAdapter // Dependency Injection
  ): Promise<ProviderName> {
    if (usableProviders.length === 0) {
      throw new Error("ProviderRotationService requires at least one usable provider.");
    }

    if (usableProviders.length === 1) {
      log(`${LOG_EMOJI} Rotation Service: Only one provider available, skipping rotation.`, TMI);
      return usableProviders[0];
    }

    log(
      `${LOG_EMOJI} Rotation Service: Evaluating ${usableProviders.length} providers for rotation.`,
      TMI
    );

    let bestProvider: ProviderName = usableProviders[0];
    let lowestUsage: number = Infinity;

    // Concurrently fetch usage for all providers using the injected adapter
    const usagePromises = usableProviders.map((provider) => adapter.getUsage(provider));
    const usages = await Promise.all(usagePromises);

    // Find the provider with the lowest usage count
    usableProviders.forEach((provider, index) => {
      const currentUsage = usages[index];

      if (currentUsage < lowestUsage) {
        lowestUsage = currentUsage;
        bestProvider = provider;
      }

      log(`${LOG_EMOJI} Rotation Service: Provider ${provider} usage: ${currentUsage}`, TMI);
    });

    log(
      `${LOG_EMOJI} Rotation Service: Selected best provider -> ${bestProvider} (Usage: ${lowestUsage})`,
      TMI
    );
    return bestProvider;
  }
}

// NOTE: incrementUsage and resetUsage are handled directly via the adapter instance
// during the data fetching process, 