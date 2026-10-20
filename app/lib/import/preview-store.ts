/**
 * Server-side store for merge previews (task 03-04).
 *
 * The preview is computed on the server and held there so a commit cannot
 * be forged by a client that re-sends edited row data. The client only
 * ever receives an opaque `previewId` and its own resolution choices; the
 * commit loads the canonical preview, re-reads the current draft state,
 * re-validates everything and refuses to apply if anything has drifted.
 *
 * The default implementation is an in-memory store (process-local). It is
 * injectable via `MergePreviewStore` so unit tests can control creation,
 * expiry and isolation without global side effects.
 *
 * Deployment note (see PROJECT_REVIEW_AND_ASSESSMENT.md §6): this store is
 * process-local and will NOT survive serverless cold starts or multi-instance
 * deployments (e.g. Vercel serverless). For production, provide an
 * implementation of `MergePreviewStore` backed by Redis/Upstash or a
 * short-lived database table; the interface is intentionally storage-agnostic
 * so swapping the backend requires no changes to the import/commit flow.
 */

import type { MergePreviewPayload } from "./merge.ts";
import { randomUUID } from "node:crypto";

export interface MergePreviewRecord {
  id: string;
  payload: MergePreviewPayload;
  createdAt: number;
  expiresAt: number;
}

export interface MergePreviewStore {
  put(payload: MergePreviewPayload, now?: number): string;
  get(id: string, now?: number): MergePreviewRecord | null;
  delete(id: string): void;
  clear(): void;
}

export interface MemoryMergePreviewStoreOptions {
  /** Milliseconds before a preview becomes stale. Defaults to 30 minutes. */
  ttlMs?: number;
  /** Maximum stored previews. Oldest entries are evicted on overflow. */
  maxEntries?: number;
  now?: () => number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 50;

/**
 * In-memory store with TTL and a size cap. `get` prunes expired entries and
 * evicts the oldest when `maxEntries` is exceeded; `put` also prunes first so
 * the newest entry is never immediately evicted.
 */
export function createMemoryMergePreviewStore(
  options: MemoryMergePreviewStoreOptions = {}
): MergePreviewStore {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = options.now ?? (() => Date.now());
  const store = new Map<string, MergePreviewRecord>();

  function prune(current: number): void {
    for (const [id, record] of store) {
      if (record.expiresAt <= current) {
        store.delete(id);
      }
    }
    while (store.size > maxEntries) {
      // Map iteration order is insertion order in Node/ES, so the first
      // key is the oldest entry.
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }

  return {
    put(payload, time = now()) {
      prune(time);
      const id = randomUUID();
      const createdAt = time;
      store.set(id, {
        id,
        payload,
        createdAt,
        expiresAt: createdAt + ttlMs,
      });
      prune(time);
      return id;
    },
    get(id, time = now()) {
      prune(time);
      const record = store.get(id);
      if (record === undefined) return null;
      if (record.expiresAt <= time) {
        store.delete(id);
        return null;
      }
      return record;
    },
    delete(id) {
      store.delete(id);
    },
    clear() {
      store.clear();
    },
  };
}

/** Process-local singleton used by the production server actions. */
export const mergePreviewStore = createMemoryMergePreviewStore();
