import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';
import { redis } from '../utils/redisClient.js';

interface CacheEntry {
  key: string;
  value: any;
  rawValue: any;
  timestamp: number | null;
  size: number;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const ageMs = now - timestamp;
  const ageSeconds = Math.floor(ageMs / 1000);
  const ageMinutes = Math.floor(ageSeconds / 60);
  const ageHours = Math.floor(ageMinutes / 60);
  const ageDays = Math.floor(ageHours / 24);

  let ageStr = '';
  if (ageDays > 0) ageStr = `${ageDays}d `;
  if (ageHours > 0) ageStr += `${ageHours % 24}h `;
  if (ageMinutes > 0) ageStr += `${ageMinutes % 60}m `;
  ageStr += `${ageSeconds % 60}s ago`;

  return `${date.toLocaleString()} (${ageStr.trim()})`;
}

function formatJSON(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function generateCacheViewerHTML(entries: CacheEntry[], error?: string): string {
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>💿 Cache Viewer - Crypto Proxy</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0a0a0f;
      min-height: 100vh;
      padding: 2rem;
      color: #e0e0e0;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: #1a1a24;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      border: 1px solid #2a2a3a;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      font-weight: 700;
    }

    .header p {
      opacity: 0.9;
      font-size: 1.1rem;
    }

    .stats {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
    }

    .stat {
      display: flex;
      flex-direction: column;
    }

    .stat-label {
      font-size: 0.85rem;
      opacity: 0.8;
      margin-bottom: 0.25rem;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
    }

    .refresh-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-block;
    }

    .refresh-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    .content {
      padding: 2rem;
    }

    .search-box {
      margin-bottom: 2rem;
      position: sticky;
      top: 1rem;
      z-index: 10;
    }

    .search-input {
      width: 100%;
      padding: 1rem;
      background: #252530;
      border: 2px solid #3a3a4a;
      border-radius: 12px;
      font-size: 1rem;
      color: #e0e0e0;
      transition: border-color 0.2s;
    }

    .search-input::placeholder {
      color: #888;
    }

    .search-input:focus {
      outline: none;
      border-color: #667eea;
      background: #2a2a35;
    }

    .error {
      background: #3a1a1a;
      border: 2px solid #cc3333;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      color: #ff6666;
    }

    .entry {
      background: #252530;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      border-left: 4px solid #667eea;
      transition: transform 0.2s, box-shadow 0.2s;
      border: 1px solid #3a3a4a;
    }

    .entry:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
      border-color: #667eea;
    }

    .entry-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .entry-key {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 1.1rem;
      font-weight: 600;
      color: #8b9aff;
      word-break: break-all;
      flex: 1;
    }

    .entry-meta {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.85rem;
      color: #aaa;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .entry-value {
      background: #1a1a24;
      border-radius: 8px;
      padding: 1rem;
      margin-top: 1rem;
      position: relative;
      border: 1px solid #3a3a4a;
    }

    .value-toggle {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: #667eea;
      color: white;
      border: none;
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
      transition: background 0.2s;
    }

    .value-toggle:hover {
      background: #5568d3;
    }

    .value-content {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.9rem;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 500px;
      overflow-y: auto;
      color: #d0d0d0;
    }

    .value-content::-webkit-scrollbar {
      width: 8px;
    }

    .value-content::-webkit-scrollbar-track {
      background: #1a1a24;
      border-radius: 4px;
    }

    .value-content::-webkit-scrollbar-thumb {
      background: #3a3a4a;
      border-radius: 4px;
    }

    .value-content::-webkit-scrollbar-thumb:hover {
      background: #4a4a5a;
    }

    .value-content.collapsed {
      max-height: 100px;
      overflow: hidden;
    }

    .value-content.expanded {
      max-height: none;
    }

    .no-entries {
      text-align: center;
      padding: 4rem 2rem;
      color: #aaa;
    }

    .no-entries h2 {
      font-size: 2rem;
      margin-bottom: 1rem;
      color: #e0e0e0;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.6rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-error {
      background: #3a1a1a;
      color: #ff6666;
      border: 1px solid #cc3333;
    }

    .badge-success {
      background: #1a3a1a;
      color: #66ff66;
      border: 1px solid #33cc33;
    }

    @media (max-width: 600px) {
      .header h1 {
        font-size: 1.8rem;
      }

      .entry-key {
        font-size: 0.95rem;
      }

      .entry-header {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-top">
        <div>
          <h1>💿 Cache Viewer</h1>
          <p>Redis KV Store Contents</p>
        </div>
        <a href="?cache" class="refresh-btn">🔄 Refresh</a>
      </div>
      <div class="stats">
        <div class="stat">
          <span class="stat-label">Total Keys</span>
          <span class="stat-value">${entries.length}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Total Size</span>
          <span class="stat-value">${formatBytes(totalSize)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Cached Entries</span>
          <span class="stat-value">${entries.filter(e => e.timestamp !== null).length}</span>
        </div>
      </div>
    </div>

    <div class="content">
      ${error ? `<div class="error"><strong>Error:</strong> ${escapeHtml(error)}</div>` : ''}
      
      <div class="search-box">
        <input type="text" class="search-input" id="searchInput" placeholder="🔍 Search cache keys...">
      </div>

      ${entries.length === 0 ? `
        <div class="no-entries">
          <h2>No Cache Entries Found</h2>
          <p>The cache is empty or there was an error loading entries.</p>
        </div>
      ` : entries.map(entry => `
        <div class="entry" data-key="${escapeHtml(entry.key)}">
          <div class="entry-header">
            <div class="entry-key">${escapeHtml(entry.key)}</div>
            <div class="entry-meta">
              ${entry.error ? `<span class="badge badge-error">Error</span>` : ''}
              ${entry.timestamp ? `
                <div class="meta-item">
                  <span>🕐</span>
                  <span>${formatTimestamp(entry.timestamp)}</span>
                </div>
              ` : ''}
              <div class="meta-item">
                <span>📦</span>
                <span>${formatBytes(entry.size)}</span>
              </div>
            </div>
          </div>
          ${entry.error ? `
            <div class="entry-value">
              <div class="value-content" style="color: #ff6666;">Error: ${escapeHtml(entry.error)}</div>
            </div>
          ` : entry.value !== null ? `
            <div class="entry-value">
              <button class="value-toggle" onclick="toggleValue(this)">Expand</button>
              <div class="value-content collapsed">${escapeHtml(formatJSON(entry.value))}</div>
            </div>
          ` : `
            <div class="entry-value">
              <div class="value-content" style="color: #666;">(null or empty)</div>
            </div>
          `}
        </div>
      `).join('')}
    </div>
  </div>

  <script>
    function toggleValue(btn) {
      const content = btn.nextElementSibling;
      const isCollapsed = content.classList.contains('collapsed');
      
      if (isCollapsed) {
        content.classList.remove('collapsed');
        content.classList.add('expanded');
        btn.textContent = 'Collapse';
      } else {
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        btn.textContent = 'Expand';
      }
    }

    const searchInput = document.getElementById('searchInput');
    const entries = document.querySelectorAll('.entry');

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      
      entries.forEach(entry => {
        const key = entry.dataset.key.toLowerCase();
        if (key.includes(query)) {
          entry.style.display = '';
        } else {
          entry.style.display = 'none';
        }
      });
    });
  </script>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Check if 'cache' query parameter is present
  const hasCache = req.query.cache !== undefined;
  
  // Check if 'magic' query parameter is present
  const hasMagic = req.query.magic !== undefined;

  if (hasCache) {
    // Serve the cache viewer page
    try {
      // Get all keys from Redis
      // Try SCAN first (preferred for production), fallback to KEYS if needed
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
      const cacheEntries = await Promise.all(
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
            let timestamp: number | null = null;
            let data: any = parsedValue;
            
            if (parsedValue && typeof parsedValue === 'object' && 'timestamp' in parsedValue && 'data' in parsedValue) {
              timestamp = parsedValue.timestamp;
              data = parsedValue.data;
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

      // Generate HTML
      const html = generateCacheViewerHTML(cacheEntries);
      
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const html = generateCacheViewerHTML([], errorMessage);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    }
  } else if (hasMagic) {
    // Serve the full index.html
    const htmlPath = join(process.cwd(), 'templates', 'index.html');
    const htmlContent = readFileSync(htmlPath, 'utf-8');
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlContent);
  } else {
    // Serve the simple landing page
    const landingPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CryptoSpect - Coming Soon</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .banner {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 4rem 3rem;
      text-align: center;
      max-width: 600px;
      width: 100%;
    }

    .banner h1 {
      font-size: 2.5rem;
      color: #667eea;
      margin-bottom: 1rem;
      font-weight: 700;
    }

    .banner p {
      font-size: 1.25rem;
      color: #666;
      line-height: 1.6;
    }

    @media (max-width: 600px) {
      .banner {
        padding: 3rem 2rem;
      }

      .banner h1 {
        font-size: 2rem;
      }

      .banner p {
        font-size: 1.1rem;
      }
    }
  </style>
</head>
<body>
  <div class="banner">
    <h1>Hello 👋</h1>
    <p>Future home of CryptoSpect app foundations</p>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(landingPage);
  }
}
