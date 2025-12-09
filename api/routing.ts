// Filename: api/routing.ts

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCacheViewer } from './cacheViewer/handler.js';
import { serveMagicPage } from './pages/magic.js';
import { serveLandingPage } from './pages/landing.js';

/**
 * 📎 Routes requests based on query parameters 👀
 * - ?cache -> Cache viewer
 * - ?magic -> Full index.html template
 * - (none) -> Landing page
 */
export async function routeRequest(req: VercelRequest, res: VercelResponse): Promise<void> {
  const hasCache = req.query.cache !== undefined;
  const hasMagic = req.query.magic !== undefined;

  if (hasCache) {
    // Serve the cache viewer page
    return handleCacheViewer(req, res);
  } else if (hasMagic) {
    // Serve the full index.html
    return serveMagicPage(req, res);
  } else {
    // Serve the simple landing page
    return serveLandingPage(req, res);
  }
}
