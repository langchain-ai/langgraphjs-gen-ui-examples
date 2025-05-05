# Stock Price Tool Fix Documentation

## Overview

This document outlines the changes made to fix the "Failed to fetch prices" error in the Stock Price tool of the LangGraph.js application. The issue occurred when attempting to fetch stock price data on non-trading days (weekends, holidays) or when recent market data was not yet available.

## Problem Identification

The error occurred in the `getPricesForTicker` function in `/src/agent/stockbroker/nodes/tools.ts` with the following symptoms:

```
Error: Failed to fetch prices
    at getPricesForTicker (/Users/gitmaxd/Projects/Personal/langgraphjs-gen-ui-examples/src/agent/stockbroker/nodes/tools.ts:74:11)
```

### Root Cause Analysis

1. **Date Handling Issue**: The original implementation always used the current date to fetch one-day price data, which fails on weekends, holidays, or when data for the current day is not yet available.

2. **Error Handling**: The function would throw an error if either the one-day or thirty-day data requests failed, without providing fallback options.

3. **Lack of Detailed Error Information**: The generic error message "Failed to fetch prices" did not provide enough context for debugging.

## Solution Implemented

### Files Modified

- **`/src/agent/stockbroker/nodes/tools.ts`**: Updated the `getPricesForTicker` function with a more robust implementation.

### Key Changes

1. **Smart Date Detection**:
   - Added a preliminary API call to the snapshot endpoint to determine the latest available market data date
   - Used this date instead of the current date for subsequent data requests

2. **Graceful Error Handling**:
   - Separated the handling of one-day and thirty-day data requests
   - Made thirty-day data critical (still throws an error if unavailable)
   - Made one-day data optional with a fallback mechanism

3. **Fallback Mechanism**:
   - When one-day data is unavailable, the function now extracts the most recent day's data from the thirty-day dataset
   - This ensures the UI always has data to display, even on non-trading days

4. **Improved Error Messages**:
   - Enhanced error messages to include specific details about what failed
   - Added proper status codes and response text to error messages
   - Implemented proper TypeScript error handling for unknown error types

5. **Better Logging**:
   - Added informative console logs to help with debugging
   - Included warnings when fallbacks are used

## Code Changes

### Before

```typescript
async function getPricesForTicker(ticker: string): Promise<{
  oneDayPrices: Price[];
  thirtyDayPrices: Price[];
}> {
  // ... initialization code ...

  const oneMonthAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const now = format(new Date(), "yyyy-MM-dd");

  const queryParamsOneDay = new URLSearchParams({
    ticker,
    interval: "minute",
    interval_multiplier: "5",
    start_date: now,
    end_date: now,
    limit: "5000",
  });

  const queryParamsThirtyDays = new URLSearchParams({
    ticker,
    interval: "minute",
    interval_multiplier: "30",
    start_date: oneMonthAgo,
    end_date: now,
    limit: "5000",
  });

  const [resOneDay, resThirtyDays] = await Promise.all([
    fetch(`${url}?${queryParamsOneDay.toString()}`, options),
    fetch(`${url}?${queryParamsThirtyDays.toString()}`, options),
  ]);

  if (!resOneDay.ok || !resThirtyDays.ok) {
    throw new Error("Failed to fetch prices");
  }

  // ... rest of the function ...
}
```

### After

```typescript
async function getPricesForTicker(ticker: string): Promise<{
  oneDayPrices: Price[];
  thirtyDayPrices: Price[];
}> {
  // ... initialization code ...

  // Get snapshot first to determine the latest available data point
  try {
    const snapshotUrl = `https://api.financialdatasets.ai/prices/snapshot?ticker=${ticker}`;
    const snapshotResponse = await fetch(snapshotUrl, options);
    
    if (!snapshotResponse.ok) {
      throw new Error(`Failed to fetch price snapshot for ${ticker}: ${snapshotResponse.status} ${snapshotResponse.statusText}`);
    }
    
    const snapshotData = await snapshotResponse.json();
    const latestDataDate = snapshotData.snapshot?.time 
      ? format(new Date(snapshotData.snapshot.time), "yyyy-MM-dd")
      : format(subDays(new Date(), 1), "yyyy-MM-dd"); // Fallback to yesterday
    
    console.log(`Latest available data date for ${ticker}: ${latestDataDate}`);
    
    // ... use latestDataDate for API requests ...

    // Handle thirty-day data - this is critical
    if (!resThirtyDays.ok) {
      throw new Error(`Failed to fetch 30-day price data for ${ticker}: ${resThirtyDays.status} ${resThirtyDays.statusText}`);
    }
    
    // Handle one-day data - allow this to fail gracefully
    let oneDayPrices: Price[] = [];
    if (resOneDay.ok) {
      const oneDayData = await resOneDay.json();
      oneDayPrices = oneDayData.prices || [];
    } else {
      console.warn(`No intraday price data available for ${ticker} on ${latestDataDate}. Using most recent data from 30-day history.`);
      // If one-day data is unavailable, use the most recent day from thirty-day data
      if (thirtyDayPrices.length > 0) {
        const latestDate = format(new Date(thirtyDayPrices[thirtyDayPrices.length - 1].time), "yyyy-MM-dd");
        const latestDayPrices = thirtyDayPrices.filter((price: Price) => 
          format(new Date(price.time), "yyyy-MM-dd") === latestDate
        );
        oneDayPrices = latestDayPrices;
      }
    }

    // ... rest of the function ...
  } catch (error: unknown) {
    console.error("Error in getPricesForTicker:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch prices for ${ticker}: ${errorMessage}`);
  }
}
```

## Testing

The fix was verified by:

1. Creating a test script (`test-financial-api.js`) to isolate and test the Financial Datasets API functionality
2. Confirming that the snapshot API works correctly and returns the latest available data
3. Verifying that the thirty-day historical data endpoint works properly
4. Confirming that the one-day data endpoint returns a 404 on non-trading days (as expected)
5. Testing the full LangGraph.js application to ensure the Stock Price tool works correctly

## Conclusion

This fix makes the Stock Price tool more robust by intelligently handling non-trading days and unavailable data. The implementation now gracefully falls back to the most recent available data, ensuring that users always see meaningful stock information regardless of when they access the application.

The improved error handling and logging also make future debugging easier by providing more context about any issues that might occur.
