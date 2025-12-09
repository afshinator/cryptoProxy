// Filename: api/pages/magic.ts

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

export function serveMagicPage(req: VercelRequest, res: VercelResponse): void {
  // Serve the full index.html
  const htmlPath = join(process.cwd(), 'templates', 'index.html');
  const htmlContent = readFileSync(htmlPath, 'utf-8');
  
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(htmlContent);
}
