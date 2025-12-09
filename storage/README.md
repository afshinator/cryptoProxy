# Storage Layer Architecture

This document explains the storage interfaces and how they map between backend and frontend implementations.

## 📐 Interface Hierarchy

The storage layer uses a two-tier interface system defined in `core/RawDataGateway.ts`:

### 1. `KeyValueStore` (Simple Interface)

```typescript
interface KeyValueStore {
  get(key: string): Promise<any>;
  set(key: string, data: any, ttlSeconds: number): Promise<void>;
}
```

**Purpose:** Basic key-value operations for simple cache needs.

**Used by:**
- `FeatureResolver` - Only needs KV for feature cache storage

**Characteristics:**
- Simple get/set operations
- TTL support built-in
- No blob storage capability

### 2. `StorageGateway` (Full Interface)

```typescript
interface StorageGateway extends KeyValueStore {
  // Inherits get() and set() from KeyValueStore
  getBlob(key: string): Promise<any>;
  putBlob(key: string, data: any, ttlSeconds: number): Promise<void>;
}
```

**Purpose:** Unified interface for both KV and Blob storage operations.

**Used by:**
- `RawDataGateway` - Needs both KV (current data) and Blob (historical data)

**Characteristics:**
- Extends `KeyValueStore` (has all KV methods)
- Adds blob operations for large/historical data
- Single interface for all storage needs

## 🖥️ Backend Implementation

### `KvStorageGateway` (`utils/KvStorageGateway.ts`)

**Implements:** `StorageGateway`

**Storage Backends:**
- **KV Operations** (`get()`, `set()`): Vercel KV (Redis)
  - Native TTL support
  - Fast, short-term cache
  - Automatic expiration
  
- **Blob Operations** (`getBlob()`, `putBlob()`): Vercel Blob Storage
  - Large/historical data
  - No native TTL (metadata-based)
  - Manual TTL validation required

**Usage:**
```typescript
import { kvStorageGateway } from '../utils/KvStorageGateway.js';

// KV operations
await kvStorageGateway.set('key', data, 300);
const data = await kvStorageGateway.get('key');

// Blob operations
await kvStorageGateway.putBlob('blob-key', largeData, 3600);
const blobData = await kvStorageGateway.getBlob('blob-key');
```

## 📱 Frontend Implementation

### Context: React Native + Zustand + AsyncStorage

The frontend uses a **single unified storage mechanism**:
- **Zustand** for state management
- **AsyncStorage middleware** for persistence
- **One storage backend** (AsyncStorage), not separate KV/Blob

### Frontend Interface Matching

**Answer:** The frontend should implement `StorageGateway` (the full interface).

**Why:**
1. **Interface Compatibility:** Matches the backend contract used by `RawDataGateway`
2. **Semantic Clarity:** Method names (`getBlob`/`putBlob`) indicate intent even if underlying storage is the same
3. **Future-Proofing:** If frontend later needs separate blob storage, interface is already correct

### Implementation Strategy

Since the frontend has **one storage mechanism** (AsyncStorage), both KV and Blob methods use the same backend:

```typescript
// Frontend StorageGateway implementation
class FrontendStorageGateway implements StorageGateway {
  // KV operations → AsyncStorage
  async get(key: string): Promise<any> {
    return await AsyncStorage.getItem(key);
  }
  
  async set(key: string, data: any, ttlSeconds: number): Promise<void> {
    // Store with metadata (fetchedAt, ttlSeconds)
    await AsyncStorage.setItem(key, JSON.stringify({ data, fetchedAt, ttlSeconds }));
  }
  
  // Blob operations → Also AsyncStorage (same storage, different semantic)
  async getBlob(key: string): Promise<any> {
    // Same as get() - it's all AsyncStorage
    return await AsyncStorage.getItem(key);
  }
  
  async putBlob(key: string, data: any, ttlSeconds: number): Promise<void> {
    // Same as set() - it's all AsyncStorage
    await AsyncStorage.setItem(key, JSON.stringify({ data, fetchedAt, ttlSeconds }));
  }
}
```

**Key Points:**
- `getBlob()` and `putBlob()` are **not no-ops** - they use the same AsyncStorage
- The distinction is **semantic** (indicates large/historical data intent)
- Both methods use the same underlying storage mechanism
- TTL validation is manual (check `fetchedAt` + `ttlSeconds`)

## 🔄 Usage Patterns

### Backend Usage

**FeatureResolver** (needs only KV):
```typescript
// Uses KeyValueStore interface
await storageGateway.get(featureKey);
await storageGateway.set(featureKey, result, ttlSeconds);
```

**RawDataGateway** (needs both KV and Blob):
```typescript
// Uses StorageGateway interface
if (isHistorical) {
  await storageGateway.getBlob(cacheKey);
  await storageGateway.putBlob(cacheKey, data, ttl);
} else {
  await storageGateway.get(cacheKey);
  await storageGateway.set(cacheKey, data, ttl);
}
```

### Frontend Usage

**Feature Cache** (KV semantic):
```typescript
// Store feature result
await storageGateway.set('feature:CURRENT_VOLATILITY', result, 150);

// Retrieve feature result
const cached = await storageGateway.get('feature:CURRENT_VOLATILITY');
```

**Raw Data Cache** (Blob semantic for historical):
```typescript
// Store historical data
await storageGateway.putBlob('raw:COINGECKO:/coins/markets_historical', data, 300);

// Retrieve historical data
const historical = await storageGateway.getBlob('raw:COINGECKO:/coins/markets_historical');
```

## 📋 Summary

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **Interface** | `StorageGateway` | `StorageGateway` |
| **KV Backend** | Vercel KV (Redis) | AsyncStorage |
| **Blob Backend** | Vercel Blob | AsyncStorage (same) |
| **TTL Support** | Native (KV) / Metadata (Blob) | Metadata (manual validation) |
| **Storage Separation** | Separate backends | Unified backend |

## 🎯 Key Takeaways

1. **Frontend should implement `StorageGateway`** (not `KeyValueStore`)
2. **Both KV and Blob methods use AsyncStorage** on frontend (same storage)
3. **Method names are semantic** - they indicate data type/intent, not storage backend
4. **TTL validation is manual** on frontend (check `fetchedAt` + `ttlSeconds`)
5. **Interface compatibility** ensures frontend can work with backend services that expect `StorageGateway`
