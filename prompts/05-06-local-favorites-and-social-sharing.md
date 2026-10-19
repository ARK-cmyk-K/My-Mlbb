# Task 05-06 — Local Favorites and Social Sharing

Inspect public collection models and existing share URL patterns.

Implement visitor favorites using browser `localStorage` with versioned keys, safe parsing, and graceful handling of unavailable or malformed storage. No visitor account or public like counter is required. Add one-click share actions for Discord, X, and Telegram using canonical public URLs and encoded text; use native share when appropriate. Do not put private or draft content in URLs or metadata.

Ensure server rendering does not access `window` or `localStorage` directly. Add tests for hydration safety and malformed stored data, and update state.
