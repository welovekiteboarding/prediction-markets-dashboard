# Error Logging and Debugging Guide

## Overview
This guide explains our approach to comprehensive error logging for debugging API issues in the Prediction Markets Dashboard.

## Problem Statement
The frontend was receiving 500 errors from the backend when fetching market prices, but we couldn't determine the root cause due to insufficient logging information.

## Solution Approach

### 1. Comprehensive Request Logging
Added detailed logging to all API endpoints with:
- **Unique Request IDs**: Each request gets a unique identifier for tracking
- **Full Request Details**: Headers, parameters, timestamps
- **Complete Error Information**: Stack traces, error codes, response data
- **Request/Response Correlation**: Track entire request lifecycle

### 2. Structured Error Handling
Implemented specific handling for different error types:
- **404 Errors**: Token not found → Return `{ price: null, error: 'Token not found' }`
- **401/403 Errors**: Authentication/authorization issues
- **429 Errors**: Rate limiting with retry information
- **Network Errors**: Connection refused, timeouts
- **Other Errors**: Proper 500 responses with request IDs

### 3. Real-time Log Monitoring
Set up dual-terminal approach:
- **Terminal 1**: Main backend server serving the frontend
- **Terminal 2**: Real-time log monitoring with `tail -f`

## Implementation Details

### Enhanced Market Price Endpoint
```javascript
app.get('/api/market-price/:tokenId', async (req, res) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`=== [${requestId}] /api/market-price called ===`);
  console.log(`[${requestId}] Request params:`, req.params);
  console.log(`[${requestId}] Request headers:`, req.headers);
  
  try {
    // ... API call logic
    console.log(`[${requestId}] Request completed successfully`);
    res.json(response.data);
  } catch (error) {
    console.log(`[${requestId}] === ERROR CAUGHT ===`);
    console.log(`[${requestId}] Error response status:`, error.response?.status);
    console.log(`[${requestId}] Error response data:`, error.response?.data);
    
    // Specific error handling
    if (error.response?.status === 404) {
      console.log(`[${requestId}] 404 Error - Token not found`);
      return res.json({ price: null, at_time: null, error: 'Token not found' });
    }
    
    // ... other error types
  }
});
```

### Log Monitoring Setup
```bash
# Terminal 1: Run the backend
cd backend
node index.js

# Terminal 2: Monitor logs in real-time
cd backend
tail -f logs/server-$(date +%Y-%m-%d).log
```

## Why This Approach

### 1. **Eliminates Guessing**
- Before: "I think it's a 404 error"
- After: "[req-abc123] Error response status: 404, data: {error: 'token_id not found'}"

### 2. **Request Correlation**
- Each request has unique ID for tracking
- Can follow specific requests through the system
- Easy to identify patterns in failures

### 3. **Production-Ready Debugging**
- Structured logging format
- Error categorization
- Performance metrics (request duration)
- Non-intrusive to normal operation

### 4. **Root Cause Analysis**
- Full error context (headers, params, config)
- Stack traces for debugging
- Network vs. application errors
- API response details

## Expected Outcomes

### Immediate Benefits
1. **Identify exact error types** causing 500 responses
2. **Verify 404 handling** works correctly
3. **Track error patterns** and frequencies
4. **Debug network issues** with full context

### Long-term Benefits
1. **Error rate monitoring** and alerting
2. **Performance optimization** opportunities
3. **API usage patterns** analysis
4. **Troubleshooting documentation** for production

## Usage Instructions

### Start Debugging Session
1. **Stop current backend** (Ctrl+C)
2. **Start enhanced backend**: `node index.js`
3. **Monitor logs**: `tail -f logs/server-$(date +%Y-%m-%d).log`
4. **Trigger frontend requests** to generate logs
5. **Analyze error patterns** in log output

### Log Analysis
Look for patterns like:
```
=== [req-1735041234-abc123] /api/market-price called ===
[req-1735041234-abc123] Error response status: 404
[req-1735041234-abc123] 404 Error - Token not found in pricing data
```

## Next Steps
1. **Analyze logged errors** to identify 500 root causes
2. **Fix error handling** based on findings
3. **Add monitoring** for error rates
4. **Implement alerting** for critical errors

## Best Practices
- **Keep logging structured** for easy parsing
- **Use unique request IDs** for correlation
- **Log at appropriate levels** (info, error, debug)
- **Rotate log files** to manage disk space
- **Monitor log volume** to avoid performance impact

This approach transforms debugging from guesswork to data-driven problem solving.
