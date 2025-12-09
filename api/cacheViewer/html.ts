// Filename: api/cacheViewer/html.ts

import type { CacheEntry, FeatureConfigDisplay } from './types.js';
import { escapeHtml, formatBytes, formatJSON, formatTimestamp, formatTTL } from './utils.js';
import { CACHE_VIEWER_STYLES } from './styles.js';

export function generateCacheViewerHTML(
  entries: CacheEntry[],
  featureConfigs: FeatureConfigDisplay[],
  error?: string
): string {
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  const implementedCount = featureConfigs.filter(f => f.hasCalculation).length;
  const stubCount = featureConfigs.length - implementedCount;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>💿 Cache Viewer - Crypto Proxy</title>
  <style>${CACHE_VIEWER_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-top">
        <div>
          <h1>💿 Cache Viewer</h1>
          <p>Redis KV Store Contents & Feature Configuration</p>
        </div>
        <a href="?cache" class="refresh-btn">🔄 Refresh</a>
      </div>
      <div class="tabs">
        <button class="tab active" onclick="switchTab('cache')">Cache Entries</button>
        <button class="tab" onclick="switchTab('features')">Feature Config</button>
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
        <div class="stat">
          <span class="stat-label">Features</span>
          <span class="stat-value">${featureConfigs.length}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Implemented</span>
          <span class="stat-value">${implementedCount}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Stubs</span>
          <span class="stat-value">${stubCount}</span>
        </div>
      </div>
    </div>

    <div class="content">
      ${error ? `<div class="error"><strong>Error:</strong> ${escapeHtml(error)}</div>` : ''}
      
      <!-- Cache Entries Tab -->
      <div id="tab-cache" class="tab-content active">
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

      <!-- Feature Config Tab -->
      <div id="tab-features" class="tab-content">
        <div class="search-box">
          <input type="text" class="search-input" id="searchFeaturesInput" placeholder="🔍 Search features...">
        </div>

        ${featureConfigs.length === 0 ? `
          <div class="no-entries">
            <h2>No Feature Configurations Found</h2>
          </div>
        ` : featureConfigs.map(feature => `
          <div class="feature-config" data-feature="${escapeHtml(feature.featureName)}">
            <div class="feature-config-header">
              <div class="feature-name">${escapeHtml(feature.featureName)}</div>
              <span class="badge ${feature.hasCalculation ? 'badge-implemented' : 'badge-stub'}">
                ${feature.hasCalculation ? 'Implemented' : 'Stub'}
              </span>
            </div>
            <div class="feature-details">
              <div class="detail-section">
                <h3>TTL Bounds</h3>
                <div class="detail-item">
                  <span class="detail-label">Default:</span>
                  <span class="detail-value">${feature.ttlBounds.default ? formatTTL(feature.ttlBounds.default) : 'N/A'}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Min:</span>
                  <span class="detail-value">${formatTTL(feature.ttlBounds.min)}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Max:</span>
                  <span class="detail-value">${formatTTL(feature.ttlBounds.max)}</span>
                </div>
              </div>
              <div class="detail-section">
                <h3>Rotation Strategy</h3>
                <div class="detail-item">
                  <span class="detail-value">${escapeHtml(feature.rotationStrategy)}</span>
                </div>
              </div>
              <div class="detail-section">
                <h3>Provider Pool</h3>
                <div class="provider-list">
                  ${feature.providerPool.map(provider => `
                    <span class="provider-tag">${escapeHtml(provider)}</span>
                  `).join('')}
                </div>
              </div>
              <div class="detail-section" style="grid-column: 1 / -1;">
                <h3>Raw Dependencies</h3>
                ${feature.rawDependencies.length === 0 ? `
                  <div class="detail-item" style="color: #888;">No dependencies</div>
                ` : feature.rawDependencies.map(dep => `
                  <div class="dependency-item">
                    <div class="dependency-name">${escapeHtml(dep.name)}</div>
                    <div class="dependency-path">${escapeHtml(dep.endpointPath)}</div>
                    <div class="detail-item" style="margin-top: 0.5rem; font-size: 0.85rem;">
                      <span class="detail-label">Storage:</span>
                      <span class="detail-value">${dep.isHistorical ? 'Blob (Historical)' : 'KV (Current)'}</span>
                    </div>
                    ${Object.keys(dep.queryParams).length > 0 ? `
                      <div class="detail-item" style="margin-top: 0.5rem; font-size: 0.85rem;">
                        <span class="detail-label">Params:</span>
                        <span class="detail-value">${escapeHtml(JSON.stringify(dep.queryParams))}</span>
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
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

    function switchTab(tabName) {
      // Hide all tabs
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
      });
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });

      // Show selected tab
      document.getElementById('tab-' + tabName).classList.add('active');
      event.target.classList.add('active');

      // Update search
      if (tabName === 'cache') {
        document.getElementById('searchInput').focus();
      } else {
        document.getElementById('searchFeaturesInput').focus();
      }
    }

    // Cache entries search
    const searchInput = document.getElementById('searchInput');
    const entries = document.querySelectorAll('.entry');
    
    if (searchInput) {
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
    }

    // Feature config search
    const searchFeaturesInput = document.getElementById('searchFeaturesInput');
    const featureConfigs = document.querySelectorAll('.feature-config');
    
    if (searchFeaturesInput) {
      searchFeaturesInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        
        featureConfigs.forEach(feature => {
          const name = feature.dataset.feature.toLowerCase();
          if (name.includes(query)) {
            feature.style.display = '';
          } else {
            feature.style.display = 'none';
          }
        });
      });
    }
  </script>
</body>
</html>`;
}
