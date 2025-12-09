// Filename: api/cacheViewer/types.ts

export interface CacheEntry {
  key: string;
  value: any;
  rawValue: any;
  timestamp: number | null;
  size: number;
  error?: string;
}

export interface FeatureConfigDisplay {
  featureName: string;
  hasCalculation: boolean;
  rawDependencies: Array<{
    name: string;
    endpointPath: string;
    queryParams: Record<string, string | number>;
    isHistorical: boolean;
  }>;
  providerPool: string[];
  ttlBounds: {
    default?: number;
    min: number;
    max: number;
  };
  rotationStrategy: string;
}
