// Filename: api/cacheViewer/styles.ts

export const CACHE_VIEWER_STYLES = `
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

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  }

  .tab {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    padding: 0.75rem 1.5rem;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .tab:hover {
    color: white;
  }

  .tab.active {
    color: white;
    border-bottom-color: white;
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

  .tab-content {
    display: none;
  }

  .tab-content.active {
    display: block;
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

  .badge-stub {
    background: #3a3a1a;
    color: #ffaa66;
    border: 1px solid #cc8833;
  }

  .badge-implemented {
    background: #1a3a1a;
    color: #66ff66;
    border: 1px solid #33cc33;
  }

  .feature-config {
    background: #252530;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    border: 1px solid #3a3a4a;
    border-left: 4px solid #764ba2;
  }

  .feature-config-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .feature-name {
    font-size: 1.3rem;
    font-weight: 700;
    color: #8b9aff;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  }

  .feature-details {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-top: 1rem;
  }

  .detail-section {
    background: #1a1a24;
    border-radius: 8px;
    padding: 1rem;
    border: 1px solid #3a3a4a;
  }

  .detail-section h3 {
    font-size: 0.9rem;
    color: #aaa;
    margin-bottom: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .detail-item {
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }

  .detail-label {
    color: #888;
    margin-right: 0.5rem;
  }

  .detail-value {
    color: #e0e0e0;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  }

  .provider-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .provider-tag {
    background: #3a3a4a;
    color: #e0e0e0;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .dependency-item {
    background: #1a1a24;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    border-left: 3px solid #667eea;
  }

  .dependency-name {
    font-weight: 600;
    color: #8b9aff;
    margin-bottom: 0.25rem;
  }

  .dependency-path {
    color: #aaa;
    font-size: 0.85rem;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
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

    .feature-details {
      grid-template-columns: 1fr;
    }
  }
`;
