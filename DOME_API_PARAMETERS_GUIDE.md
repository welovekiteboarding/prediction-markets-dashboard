# Dome API Parameters Guide

## Overview
This document explains the available parameters for the Dome API `/polymarket/markets` endpoint used in the Prediction Markets Dashboard.

## Free Tier Constraints
- **Rate Limit**: 1 query/second, 10 queries/10 seconds
- **Recommended Spacing**: 1.1s between API calls
- **Optimization Strategy**: Use server-side filtering to reduce payload size

This repo additionally uses the Dome `x-ratelimit-*` response headers (when present) to drive a UI-level cooldown.

## Source Documentation
- **Official API Reference**: https://docs.domeapi.io/
 

## Available Parameters

### Current Parameters in Use

| Parameter | Value | Description |
|-----------|-------|-------------|
| `limit` | 10-100 | Number of markets to return (main UI defaults to 10; BTC intra-scanner uses 100) |
| `status` | "open" | Filter by market status (open/closed) |
| `tags[]` | ["Bitcoin"] | Filter by market tags (server-side filtering available) |
| `min_volume` | 5000 | Minimum volume threshold (numeric; used by `/api/arbitrage/btc-check`) |

Notes:
- The frontend sends tag filters as indexed query params (`tags[0]`, `tags[1]`, ...) to the backend.
- The backend normalizes those into a `tags` array before calling Dome.

### All Supported Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `limit` | Integer (1-100) | Number of markets to return | `limit: 10` |
| `offset` | Integer | Pagination offset | `offset: 0` |
| `status` | String | Market status: "open" or "closed" | `status: "open"` |
| `tags[]` | Array | Filter by market tags | `tags: ["Bitcoin", "Crypto"]` |
| `market_slug[]` | Array | Filter by specific market slugs | `market_slug: ["btc-updown-15m"]` |
| `event_slug[]` | Array | Filter by event slugs | `event_slug: ["bitcoin-event"]` |
| `condition_id[]` | Array | Filter by condition IDs | `condition_id: ["0x123..."]` |
| `min_volume` | Integer | Minimum volume threshold | `min_volume: 1000` |
| `start_time` | Integer | Filter by start timestamp | `start_time: 1640995200` |
| `end_time` | Integer | Filter by end timestamp | `end_time: 1640995200` |

## Important Limitations

### Sorting NOT Supported
The Dome API **does NOT support any sorting parameters**:
- **No `order` parameter** - markets are returned in API's default order
- **No `ascending` parameter** - no sorting direction control
- **Default order** - appears to be creation date or internal API order

### What's Missing
The Dome API does **NOT** support:

- **Category filtering**: No way to filter by BTC, sports, politics, etc.
- **Keyword search**: No text-based market search
- **Market type filtering**: No filtering by prediction type
- **Tag-based filtering**: Supported via `tags[]` (used by this repo for category filtering)
- **Sorting**: No volume, price, or date sorting

### Workarounds Required
Due to these limitations, we must:

1. **Accept default order** from API (no sorting available)
2. **Filter client-side** using title, description, and slug analysis
3. **Use larger limits** to find niche markets (like BTC)
4. **Implement custom keyword matching** for market detection
5. **Sort client-side if needed** (but this requires fetching all data)

## Implementation Examples

### Main Markets Display
```javascript
const response = await domeApi.get('/polymarket/markets', {
  params: {
    limit: 10,
    status: 'open'
  }
});
```

### BTC Intra-Scanner (Optimized)
```javascript
const response = await domeApi.get('/polymarket/markets', {
  params: {
    limit: 100,
    closed: false,
    tags: ['Bitcoin'],
    min_volume: 1000
  }
});

// Client-side filtering for specific BTC keywords
const btcMarkets = allMarkets.filter(market => {
  const title = (market.question || market.title || '').toLowerCase();
  const slug = (market.market_slug || '').toLowerCase();
  return title.includes('btc') || title.includes('bitcoin') || 
         slug.includes('btc') || slug.includes('bitcoin');
});
```

### Cross-Platform Arbitrage Scanner
```javascript
// Polymarket BTC markets with server-side filtering
const polyRes = await domeApi.get('/polymarket/markets', {
  params: {
    tags: ['Bitcoin'],
    status: 'open',
    min_volume: 5000,
    limit: 10
  }
});
```

## Best Practices

### For General Market Display
- **Use `limit: 10`** for responsiveness
- **Use `status: 'open'`** to exclude resolved markets
- **Note**: Markets are returned in API's default order (no sorting available)

### For Category-Specific Scanners (Optimized)
- **Use server-side filtering first**: `tags`, `status`, `min_volume`
- **Use `limit: 100`** for comprehensive category coverage
- **Add client-side filtering** only for complex keyword matching
- **Example**: BTC scanner uses `tags: ['Bitcoin']` + client-side keyword filtering

### Performance Optimization
- **Server-side filtering reduces payload size** vs fetching all markets
- **Combine multiple filters**: `tags + status + min_volume` for precise targeting
- **Stay within Free tier limits**: 1 query/second, 10 queries/10 seconds

### Performance Considerations
- **Higher limits** increase API response time
- **Rate limiting** may occur with frequent large requests
- **Caching** recommended for repeated scans
- **Batch requests** when possible

## Troubleshooting

### Common Issues
1. **400 Bad Request**: Invalid parameter values or syntax
2. **Empty results**: No matching markets for current filters
3. **Slow responses**: Large limit or API congestion
4. **Rate limits**: Too many requests in short time (Free tier: 1 QPS)

### Solutions
- **Check parameter syntax**: Use `status: 'open'` not `closed: false`
- **Reduce limit** if getting slow responses (for example, `limit: 100` → `limit: 10`)
- **Respect Dome rate limits**:
  - Backend paces Dome requests.
  - Frontend can enforce a global cooldown using `x-ratelimit-reset` (epoch seconds) surfaced via backend `rateLimit.reset`.
- **Implement server-side filtering** to reduce payload size
- **Accept default order** - no sorting parameters available

### Free Tier Constraints
- **Rate Limit**: 1 query/second, 10 queries/10 seconds
- **Recommended spacing**: 1.1s between API calls
- **Optimization**: Use server-side filters to reduce API calls

## Future Improvements

### API Enhancements Needed
- **Category-based filtering**
- **Keyword search endpoints**
- **Market type classification**
- **Advanced sorting options**

### Backend Optimizations
- **Market caching system**
- **Incremental updates**
- **Background market indexing**
- **Smart limit adjustment**

---

**Last Updated**: December 24, 2025  
**API Version**: Dome API v1  
**Status**: Working implementation with documented limitations
