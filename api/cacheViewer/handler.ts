// Filename: api/cacheViewer/handler.ts

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv as redis } from '../../utils/redis.js';
import { featureConfig } from '../../config/configFeaturesCache.js';
import type { CacheEntry, FeatureConfigDisplay } from './types.js';
import { generateCacheViewerHTML } from './html.js';

export async function handleCacheViewer(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    // Get all keys from Redis
    let keys: string[] = [];
    
    try {
      // Use SCAN with cursor for better performance
      let cursor = 0;
      do {
        // Upstash Redis scan returns [cursor, keys[]]
        const result = await redis.scan(cursor, { match: '*', count: 100 });
        if (Array.isArray(result) && result.length === 2) {
          cursor = typeof result[0] === 'number' ? result[0] : 0;
          const scannedKeys = Array.isArray(result[1]) ? result[1] : [];
          keys.push(...scannedKeys);
        } else {
          break;
        }
      } while (cursor !== 0);
    } catch (scanError) {
      // Fallback to KEYS if SCAN doesn't work
      try {
        const keysResult = await redis.keys('*');
        keys = Array.isArray(keysResult) ? keysResult : [];
      } catch (keysError) {
        throw new Error(`Failed to list keys: ${scanError instanceof Error ? scanError.message : String(scanError)}`);
      }
    }

    // Get all values
    const cacheEntries: CacheEntry[] = await Promise.all(
      keys.map(async (key) => {
        try {
          const value = await redis.get<string>(key);
          let parsedValue: any = null;
          let valueSize = 0;
          
          if (value) {
            valueSize = Buffer.byteLength(value, 'utf8');
            try {
              parsedValue = JSON.parse(value);
            } catch {
              parsedValue = value;
            }
          }

          // Extract timestamp if it's a cached data structure
          // Support both old format (timestamp) and new format (fetchedAt)
          let timestamp: number | null = null;
          let data: any = parsedValue;
          
          if (parsedValue && typeof parsedValue === 'object') {
            if ('timestamp' in parsedValue && 'data' in parsedValue) {
              timestamp = parsedValue.timestamp;
              data = parsedValue.data;
            } else if ('fetchedAt' in parsedValue && 'data' in parsedValue) {
              timestamp = parsedValue.fetchedAt;
              data = parsedValue.data;
            }
          }

          return {
            key,
            value: data,
            rawValue: parsedValue,
            timestamp,
            size: valueSize,
          };
        } catch (error) {
          return {
            key,
            value: null,
            rawValue: null,
            timestamp: null,
            size: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    // Sort by key
    cacheEntries.sort((a, b) => a.key.localeCompare(b.key));

    // Convert featureConfig to display format
    const featureConfigs: FeatureConfigDisplay[] = Object.entries(featureConfig).map(([featureName, config]) => {
      // Check if calculation is implemented (not a stub)
      // Check function body for stub indicators
      const funcStr = config.calculate.toString();
      const hasCalculation = !funcStr.includes('NOT_IMPLEMENTED') && 
                            !funcStr.includes('STUB_DATA_OK') &&
                            !funcStr.includes('Feature calculation not implemented');

      return {
        featureName,
        hasCalculation,
        rawDependencies: config.rawDependencies.map(dep => ({
          name: dep.name,
          endpointPath: dep.endpointPath,
          queryParams: dep.queryParams,
          isHistorical: dep.isHistorical || false,
        })),
        providerPool: config.providerPool,
        ttlBounds: {
          default: config.ttlBounds.default,
          min: config.ttlBounds.min,
          max: config.ttlBounds.max,
        },
        rotationStrategy: config.rotationStrategy,
      };
    });

    // Sort features by name
    featureConfigs.sort((a, b) => a.featureName.localeCompare(b.featureName));

    // Generate HTML
    const html = generateCacheViewerHTML(cacheEntries, featureConfigs);
    
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const html = generateCacheViewerHTML([], [], errorMessage);
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  }
}
