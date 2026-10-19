# Task 06-01 — Global Search and Cmd/Ctrl+K

Inspect the published search RPC, navigation, and keyboard accessibility.

Build a global search modal opened by Cmd+K on macOS and Ctrl+K elsewhere, with categorized results for heroes, skins, achievements, and timeline entries. Debounce input appropriately, handle cancellation/loading/errors, limit results, and use the approved published-only Supabase RPC. Respect RLS and do not create a client path that can query drafts.

Ensure keyboard navigation, focus management, Escape handling, and screen-reader labels. Test short/empty queries and privacy boundaries where feasible. Update state.
