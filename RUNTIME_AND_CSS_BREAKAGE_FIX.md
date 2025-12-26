# Runtime + CSS Breakage (Root Cause + Fix)

## Summary
The dashboard experienced two separate breakages:

- **Runtime crash in React**: `Element type is invalid: expected a string ... but got: object`.
- **UI rendered with almost no styling** (looked like plain HTML controls).

Both issues were traced to **critical frontend source files being truncated to 0 bytes**, which caused React to import invalid modules and caused CSS to not be bundled.

## Symptoms

### 1) React runtime error
In the browser console / overlay:

- `Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object.`
- `Check the render method of App.`

### 2) “No CSS” / unstyled UI
The dashboard displayed:

- Default browser form controls
- Light background (from `index.css`)
- No dark theme / grid / cards

## Verified root causes

### A) `MarketList.js` became a 0-byte file
- File: `frontend/src/components/MarketList.js`
- Observed state: **0 bytes**

Impact:
- `App.js` imported `./components/MarketList`.
- With the file empty, the module import did not resolve to a valid React component.
- React attempted to render an invalid element type, producing the runtime error.

### B) `App.css` became a 0-byte file
- File: `frontend/src/App.css`
- Observed state: **0 bytes**

Impact:
- `App.js` imported `./App.css`.
- With the file empty, the dashboard-specific styles (dark theme, grids, cards, flash animations) were missing.
- Only `index.css` remained, so the UI looked largely unstyled.

### C) Markets payload shape mismatch
- Endpoint: `GET http://localhost:5000/api/markets`
- Backend response shape observed: `{ markets: [...] }`

Impact:
- `App.js` previously did `setMarkets(response.data)`.
- That set `markets` to an object instead of an array, which could break downstream rendering.

## Fixes applied

### 1) Avoid the unstable `MarketList.js`
To decouple the app from the file that was repeatedly truncating:

- **Added:** `frontend/src/components/MarketList.jsx`
- **Updated:** `frontend/src/App.js` to import `./components/MarketList.jsx` explicitly

This ensures React always imports a valid component even if `MarketList.js` is empty.

### 2) Avoid the unstable `App.css`
To decouple the app from the file that was repeatedly truncating:

- **Added:** `frontend/src/AppStyles.css`
- **Updated:** `frontend/src/App.js` to import `./AppStyles.css` instead of `./App.css`

This restores the dashboard styling (dark theme, grids, cards, flash animations) without depending on the empty `App.css`.

### 3) Normalize markets response shape
- **Updated:** `frontend/src/App.js` markets fetch now normalizes the response shape:
  - `response.data.markets` if present and an array
  - otherwise falls back to `response.data` if it’s already an array

## How to verify

1. Start backend (port 5000) and frontend (port 3000).
2. Open `http://localhost:3000`.
3. Confirm:
   - No React overlay error.
   - Dashboard renders with dark theme + grid layout.
   - Markets list renders cards.
   - “Last updated” timestamp changes (and flashes) on polling.

## What is still unknown

- The underlying cause of why `MarketList.js` and `App.css` were repeatedly becoming 0-byte files is **not yet identified**.
- The applied approach is a safe workaround that removes runtime dependence on those unstable files.

If we want to fully eliminate the problem (instead of working around it), the next step is to identify what process/tool is truncating those files (e.g., editor action, watcher, hook, sync tool, etc.).

## Files changed

- **Created:** `frontend/src/components/MarketList.jsx`
- **Created:** `frontend/src/AppStyles.css`
- **Modified:** `frontend/src/App.js`

(Existing files `frontend/src/components/MarketList.js` and `frontend/src/App.css` were left in place but are not used by the app anymore.)
