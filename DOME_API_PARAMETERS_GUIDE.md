# Dome API Parameters Guide

## Overview
This document explains the available parameters for the Dome API `/polymarket/markets` endpoint used in the Prediction Markets Dashboard.

## Available Parameters

### Current Parameters in Use

| Parameter | Value | Description |
|-----------|-------|-------------|
| `limit` | 50-100 | Number of markets to return (we use 50 for main endpoint, 100 for BTC scanner) |
| `closed` | false | Filter closed markets (false = only open markets) |

### Parameter Details

#### `limit`
- **Type**: Integer
- **Range**: 1-100 (recommended)
- **Purpose**: Controls how many markets are returned
- **Usage**: 
  - Main markets endpoint: `limit: 50`
  - BTC intra-scanner: `limit: 100`
- **Notes**: Higher limits may hit API rate limits

#### `closed`
- **Type**: Boolean
- **Values**: `true` (include closed), `false` (only open)
- **Default**: `false`
- **Usage**: `closed: false` to exclude resolved/expired markets

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
- **Tag-based filtering**: No tag or category system
- **Sorting**: No volume, price, or date sorting

### Workarounds Required
Due to these limitations, we must:

1. **Accept default order** from API (no sorting available)
2. **Filter client-side** using title, description, and slug analysis
3. **Use larger limits** to find niche markets (like BTC)
4. **Implement custom keyword matching** for market detection
5. **Sort client-side if needed** (but this requires fetching all data)

## Implementation Examples

### Main Markets Endpoint
```javascript
const response = await domeApi.get('/polymarket/markets', {
  params: {
    limit: 50,
    closed: false
  }
});
```

### BTC Intra-Scanner
```javascript
const response = await domeApi.get('/polymarket/markets', {
  params: {
    limit: 100,
    closed: false
  }
});

// Client-side filtering for BTC markets
const btcMarkets = allMarkets.filter(market => {
  const title = (market.question || market.title || '').toLowerCase();
  const slug = (market.market_slug || '').toLowerCase();
  return title.includes('btc') || title.includes('bitcoin') || 
         slug.includes('btc') || slug.includes('bitcoin');
});
```

## Best Practices

### For General Market Display
- **Use `limit: 50`** for reasonable page load times
- **Exclude closed markets** to show active predictions
- **Note**: Markets are returned in API's default order (no sorting available)

### For Category-Specific Scanners
- **Use `limit: 100`** to find niche markets
- **Implement robust client-side filtering**
- **Check multiple fields** (title, slug, description)
- **Note**: No server-side sorting available

### Performance Considerations
- **Higher limits** increase API response time
- **Rate limiting** may occur with frequent large requests
- **Caching** recommended for repeated scans
- **Batch requests** when possible

## Troubleshooting

### Common Issues
1. **400 Bad Request**: Limit too high (use ≤100)
2. **Empty results**: No matching markets for current filters
3. **Slow responses**: Large limit or API congestion
4. **Rate limits**: Too many requests in short time

### Solutions
- **Reduce limit** from 200 to 100 if getting 400 errors
- **Add delay** between repeated scans
- **Implement exponential backoff** for rate limiting
- **Accept default order** - no sorting parameters available

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
