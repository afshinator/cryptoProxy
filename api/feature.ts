// Filename: src/api/feature.ts

// Use conditional type imports to resolve the VercelRequest/VercelResponse issue.
// This often resolves "non-exported member" errors for serverless function types.
import type { VercelRequest, VercelResponse } from '@vercel/node'; 
import type { FeatureName } from '../constants/FeatureNames.js';
import { FeatureResolver } from '../core/FeatureResolver.js';
import { kvStorageGateway } from '../utils/KvStorageGateway.js';
import { kvUsageAdapter } from '../utils/KvUsageAdapter.js';
import { getUserRoleConfig } from '../config/configUserRoles.js';
import { USER_ROLES } from '../config/configUserRoles.js';
import { log, ERR, WARN, INFO, TMI } from '../utils/log.js';

// API Handler specific emoji
const LOG_EMOJI = '🖥️';

/**
 * Interface defining the expected structure of the incoming request body.
 */
interface FeatureRequestBody {
  featureName: FeatureName;
  // Role is passed by the client (frontend) based on authentication
  userRole: keyof typeof USER_ROLES; 
  // API keys are passed from the client's local storage for direct provider access
  localApiKeys?: Record<string, string>; 
}

/**
 * Main handler for the /api/feature endpoint.
 * This is the orchestration layer that ties all core services together.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  
  if (req.method !== 'POST') {
    log(`${LOG_EMOJI} Handler: Invalid method ${req.method}`, WARN);
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // --- 1. Input Validation and Preparation ---
  const body: FeatureRequestBody = req.body;
  const { featureName, userRole, localApiKeys = {} } = body;

  if (!featureName || !userRole) {
    log(`${LOG_EMOJI} Handler: Missing required fields (featureName or userRole)`, WARN);
    return res.status(400).json({ error: 'Missing featureName or userRole in request body.' });
  }

  // Use the defined configuration for the user's role (defaults to GUEST if invalid)
  const userConfig = getUserRoleConfig(userRole);
  
  log(`${LOG_EMOJI} Handler: Request received: Feature=${featureName}, Role=${userConfig.name}`, INFO);

  // --- 2. Rate Limiting (STUB) ---
  log(`${LOG_EMOJI} Handler: Rate limiting check STUB passed.`, TMI);

  // --- 3. Feature Resolution ---
  try {
    const cachedResult = await FeatureResolver.resolveFeature(
      featureName,
      userConfig,
      localApiKeys,
      // Backend Concrete Implementations (Dependency Injection)
      kvStorageGateway, 
      kvUsageAdapter
    );

    // --- 4. Success Response ---
    // Return the full CachedFeatureResult so frontend can store metadata
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate'); 
    res.status(200).json({
      feature: featureName,
      data: cachedResult.data,
      fetchedAt: cachedResult.fetchedAt,
      effectiveTTLSeconds: cachedResult.effectiveTTLSeconds,
    });
    
    log(`${LOG_EMOJI} Handler: Successfully resolved and responded with ${featureName}.`, INFO);

  } catch (error) {
    // --- 5. Error Handling ---
    const errorMessage = error instanceof Error ? error.message : 'Unknown internal error';
    log(`${LOG_EMOJI} Handler: ❌ Failed to resolve feature ${featureName}. Error: ${errorMessage}`, ERR);

    // Use a generic 500 status for internal failures like API failover exhaustion
    res.status(500).json({ 
      error: `Failed to resolve feature ${featureName}.`, 
      details: errorMessage 
    });
  }
}