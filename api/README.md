# API Directory

This directory contains all API endpoints and routing logic for the Crypto Proxy backend.

## 📁 Directory Structure

```
api/
├── index.ts              # Main entry point (Vercel handler)
├── routing.ts            # Query parameter routing logic
├── cacheViewer/          # Cache viewer UI components
│   ├── handler.ts        # Cache viewer request handler
│   ├── html.ts           # HTML generation
│   ├── styles.ts         # CSS styles
│   ├── types.ts          # TypeScript type definitions
│   └── utils.ts          # Utility functions
├── pages/                # Static page handlers
│   ├── landing.ts        # "Coming Soon" landing page
│   └── magic.ts          # Full index.html template handler
├── feature.ts            # Feature resolution endpoint
├── markets.ts            # Markets data endpoint
├── volatility.ts         # Volatility data endpoint
├── dominance.ts         # Dominance data endpoint
└── ...                   # Other API endpoints
```

## 🚦 Routing System

The routing system is based on query parameters in the main `index.ts` endpoint.

### Entry Point: `index.ts`

The main Vercel handler that delegates to the routing system:

```typescript
import { routeRequest } from './routing.js';

export default async function handler(req, res) {
  return routeRequest(req, res);
}
```

### Routing Logic: `routing.ts`

Routes requests based on query parameters:

- **`?cache`** → Cache viewer (Redis KV store contents + Feature configuration)
- **`?magic`** → Full index.html template from `templates/index.html`
- **(no params)** → Landing page ("Coming Soon")

**Usage:**
- `GET /api?cache` - View cache contents
- `GET /api?magic` - Load full app template
- `GET /api` - Show landing page

## 💿 Cache Viewer

A comprehensive UI for viewing Redis cache contents and feature configurations.

### Components

#### `cacheViewer/handler.ts`
- Fetches all keys from Redis using SCAN (with KEYS fallback)
- Parses cache entries and extracts metadata (timestamps, sizes)
- Converts `featureConfig` to display format
- Handles errors gracefully

#### `cacheViewer/html.ts`
- Generates the complete HTML page with tabs
- Two tabs: "Cache Entries" and "Feature Config"
- Includes search functionality for both tabs
- Displays statistics (total keys, size, feature counts)

#### `cacheViewer/styles.ts`
- All CSS styles as a constant string
- Dark theme with purple gradient header
- Responsive design for mobile devices

#### `cacheViewer/types.ts`
- `CacheEntry` - Structure for cache entries
- `FeatureConfigDisplay` - Display format for feature configs

#### `cacheViewer/utils.ts`
- `formatBytes()` - Format byte sizes (B, KB, MB, GB)
- `formatTimestamp()` - Format timestamps with age
- `formatJSON()` - Pretty-print JSON
- `escapeHtml()` - Escape HTML entities
- `formatTTL()` - Format TTL values (s, m, h, d)

### Features

**Cache Entries Tab:**
- Lists all Redis keys with their values
- Shows timestamps and sizes
- Expandable/collapsible JSON values
- Search by key name
- Handles old and new cache formats (`timestamp` vs `fetchedAt`)

**Feature Config Tab:**
- Lists all features from `configFeaturesCache.ts`
- Shows implementation status (Implemented/Stub badge)
- Displays TTL bounds (default, min, max)
- Shows rotation strategy
- Lists provider pool as tags
- Shows raw dependencies with endpoint paths, query params, and storage type
- Search by feature name

## 📄 Pages

### `pages/landing.ts`
Serves the "Coming Soon" landing page with a simple banner.

**Route:** `GET /api` (no query params)

### `pages/magic.ts`
Serves the full `templates/index.html` file.

**Route:** `GET /api?magic`

## 🔌 API Endpoints

### Feature Resolution: `feature.ts`
Main endpoint for resolving features with caching and provider rotation.

**Route:** `POST /api/feature`

**Request Body:**
```json
{
  "featureName": "CURRENT_VOLATILITY",
  "userRole": "basic",
  "localApiKeys": {}
}
```

**Response:**
```json
{
  "feature": "CURRENT_VOLATILITY",
  "data": { ... },
  "fetchedAt": 1234567890,
  "effectiveTTLSeconds": 150
}
```

### Markets: `markets.ts`
Endpoint for market data.

### Volatility: `volatility.ts`
Endpoint for volatility data.

### Dominance: `dominance.ts`
Endpoint for dominance data.

## 🏗️ Architecture

### Request Flow

```
Client Request
    ↓
api/index.ts (Vercel Handler)
    ↓
api/routing.ts (Query Param Check)
    ↓
├─→ api/cacheViewer/handler.ts (if ?cache)
├─→ api/pages/magic.ts (if ?magic)
└─→ api/pages/landing.ts (default)
```

### Cache Viewer Flow

```
?cache Request
    ↓
cacheViewer/handler.ts
    ├─→ Fetch Redis keys (SCAN/KEYS)
    ├─→ Parse cache entries
    ├─→ Load featureConfig
    └─→ Generate HTML
    ↓
cacheViewer/html.ts
    ├─→ Render cache entries tab
    └─→ Render feature config tab
    ↓
Response (HTML)
```

## 🔧 Development

### Adding a New Route

1. Create handler in appropriate directory (`pages/` or new subdirectory)
2. Add import to `routing.ts`
3. Add condition in `routeRequest()` function

### Modifying Cache Viewer

- **Styles:** Edit `cacheViewer/styles.ts`
- **HTML Structure:** Edit `cacheViewer/html.ts`
- **Data Processing:** Edit `cacheViewer/handler.ts`
- **Types:** Edit `cacheViewer/types.ts`

### Testing

Test routes locally:
```bash
# Landing page
curl http://localhost:3000/api

# Cache viewer
curl http://localhost:3000/api?cache

# Magic page
curl http://localhost:3000/api?magic
```

## 📝 Notes

- All handlers use `VercelRequest` and `VercelResponse` types from `@vercel/node`
- Cache viewer supports both old format (`timestamp`) and new format (`fetchedAt`) cache entries
- Feature config detection checks for stub indicators in function strings
- All HTML is generated server-side (no client-side framework)
- Styles are embedded in HTML for simplicity
