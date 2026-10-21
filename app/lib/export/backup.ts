import "server-only";

import { createSupabaseServerClient } from "../supabase/server.ts";
import { asPostgrestClient } from "../content/client.ts";
import type { PostgrestLike, QueryResult } from "../content/client.ts";
import { ContentServiceError } from "../content/errors.ts";
import { isAdminUser } from "../db.ts";

const BACKUP_FORMAT_VERSION = 1;

const DEFAULT_FETCH_CHUNK = 1000;

export type BackupScope =
  | "draft"
  | "published"
  | "everything"
  | "working-set";

export interface BackupMediaManifestItem {
  id: string;
  storageBucket: string;
  objectPath: string;
  kind: string;
  mimeType: string;
  byteSize: number;
  widthPx: number | null;
  heightPx: number | null;
  checksumSha256: string | null;
  altText: string | null;
  publicationState: string;
  createdAt: string | null;
  updatedAt: string | null;
  /** URLs are not exposed by default for draft/private objects. */
  publicUrl: string | null;
  /** Reference graph: which content entities reference this media. */
  referencedBy: Array<{
    entity: "heroes" | "skins" | "achievements" | "timeline_entries" | "account_stats" | "appearance_settings" | "homepage_sections";
    field: string;
    id: string | null;
    publicationState?: string;
  }>;
}

export interface BackupData {
  media: unknown[];
  heroes: unknown[];
  skins: unknown[];
  achievements: unknown[];
  timelineEntries: unknown[];
  accountStats: unknown[] | null;
  appearanceSettings: unknown[] | null;
  homepageSections: unknown[];
  releases: unknown[];
  releaseSnapshots: unknown[];
  publishedHeroes: unknown[];
  publishedSkins: unknown[];
  publishedAchievements: unknown[];
  publishedTimelineEntries: unknown[];
}

export interface BackupExport {
  format: "json";
  formatVersion: number;
  description?: string;
  generatedAt: string;
  scope: BackupScope;
  includesDrafts: boolean;
  includesPublished: boolean;
  includesSecrets: boolean;
  authorization?: {
    required: "admin";
    serverSideEnforced: boolean;
  };
  mediaManifestIncludesUrls?: boolean;
  streaming?: boolean;
  bounded?: boolean;
  totals: Record<string, number>;
  data: BackupData;
  mediaManifest: BackupMediaManifestItem[];
}

export interface BackupOptions {
  scope?: BackupScope;
  includePublicUrls?: boolean;
  chunkSize?: number;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function nullableStr(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowsOf(result: QueryResult<unknown>): Array<Record<string, unknown>> {
  if (result.error) {
    throw result.error instanceof ContentServiceError
      ? result.error
      : new ContentServiceError("STORE_UNAVAILABLE", { cause: result.error });
  }
  if (result.data === null || result.data === undefined) {
    return [];
  }
  const list = Array.isArray(result.data) ? result.data : [result.data];
  return list.map((v) => (v ?? {}) as Record<string, unknown>);
}

async function fetchAll(
  db: PostgrestLike,
  table: string,
  columns: string,
  chunkSize: number
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  // Try to use range if available; otherwise fall back to a single fetch.
  try {
    let from = 0;
    while (true) {
      const to = from + chunkSize - 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query: any = db.from(table).select(columns).order("created_at", { ascending: true, nullsFirst: true });
      if (typeof query.range === "function") {
        const result = await query.range(from, to);
        const batch = rowsOf(result);
        all.push(...batch);
        if (batch.length < chunkSize) {
          break;
        }
        from += chunkSize;
        if (all.length > 100000) {
          break;
        }
        continue;
      } else {
        const result = await db.from(table).select(columns);
        return rowsOf(result);
      }
    }
    return all;
  } catch {
    const result = await db.from(table).select(columns);
    return rowsOf(result);
  }
}

async function fetchTable(
  db: PostgrestLike,
  table: string,
  columns: string
): Promise<Array<Record<string, unknown>>> {
  const result = await db.from(table).select(columns);
  return rowsOf(result);
}

async function requireAdmin(): Promise<PostgrestLike> {
  const client = await createSupabaseServerClient();
  if (!client) {
    throw new ContentServiceError("NOT_CONFIGURED");
  }
  const { data } = await client.auth.getUser();
  if (!data.user) {
    throw new ContentServiceError("UNAUTHENTICATED");
  }
  if (!(await isAdminUser())) {
    throw new ContentServiceError("UNAUTHORIZED");
  }
  return asPostgrestClient(client);
}

function buildPublicUrl(
  includePublicUrls: boolean,
  bucket: string,
  objectPath: string
): string | null {
  if (!includePublicUrls) return null;
  if (bucket !== "showcase-public") return null;
  if (!objectPath) return null;
  try {
    const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!origin) return null;
    const url = new URL(origin);
    const projectRef = url.hostname.split(".")[0];
    if (!projectRef) return null;
    return `https://${projectRef}.supabase.co/storage/v1/object/public/${bucket}/${objectPath}`;
  } catch {
    return null;
  }
}

export async function createBackupExport(
  options: BackupOptions = {}
): Promise<BackupExport> {
  const scope = options.scope ?? "everything";
  const chunkSize = options.chunkSize ?? DEFAULT_FETCH_CHUNK;
  const includePublicUrls = options.includePublicUrls ?? false;

  const db = await requireAdmin();

  const includesDrafts =
    scope === "draft" || scope === "everything" || scope === "working-set";
  const includesPublished =
    scope === "published" || scope === "everything"; // "draft"/"working-set" excluded; "everything" included

  const fetchReleases =
    scope === "published" || scope === "everything";
  const fetchSnapshots =
    scope === "everything";

  const [
    mediaRows,
    heroes,
    skins,
    achievements,
    timelineEntries,
    accountStats,
    appearanceSettings,
    homepageSections,
    releases,
    releaseSnapshots,
    publishedHeroes,
    publishedSkins,
    publishedAchievements,
    publishedTimelineEntries,
  ] = await Promise.all([
    includesDrafts || includesPublished
      ? fetchAll(db, "media", "*", chunkSize)
      : Promise.resolve([]),
    includesDrafts
      ? fetchTable(db, "heroes", "*")
      : Promise.resolve([]),
    includesDrafts
      ? fetchTable(db, "skins", "*")
      : Promise.resolve([]),
    includesDrafts
      ? fetchTable(db, "achievements", "*")
      : Promise.resolve([]),
    includesDrafts
      ? fetchTable(db, "timeline_entries", "*")
      : Promise.resolve([]),
    includesDrafts
      ? fetchTable(db, "account_stats", "*")
      : Promise.resolve([]),
    includesDrafts
      ? fetchTable(db, "appearance_settings", "*")
      : Promise.resolve([]),
    includesDrafts
      ? fetchTable(db, "homepage_sections", "*")
      : Promise.resolve([]),
    fetchReleases
      ? fetchAll(db, "releases", "*", chunkSize)
      : Promise.resolve([]),
    fetchSnapshots
      ? fetchAll(db, "release_snapshots", "*", chunkSize)
      : Promise.resolve([]),
    includesPublished
      ? fetchAll(db, "published_heroes", "*", chunkSize)
      : Promise.resolve([]),
    includesPublished
      ? fetchAll(db, "published_skins", "*", chunkSize)
      : Promise.resolve([]),
    includesPublished
      ? fetchAll(db, "published_achievements", "*", chunkSize)
      : Promise.resolve([]),
    includesPublished
      ? fetchAll(db, "published_timeline_entries", "*", chunkSize)
      : Promise.resolve([]),
  ]);

  const mediaMap = new Map<string, Array<{
    entity: BackupMediaManifestItem["referencedBy"][0]["entity"];
    field: string;
    id: string | null;
    publicationState?: string;
  }>>();

  function addRef(
    mediaId: unknown,
    entity: BackupMediaManifestItem["referencedBy"][number]["entity"],
    field: string,
    id: string | null,
    state?: string
  ) {
    if (!mediaId) return;
    const key = String(mediaId);
    if (!mediaMap.has(key)) mediaMap.set(key, []);
    mediaMap.get(key)?.push({ entity, field, id, publicationState: state });
  }

  for (const h of heroes) {
    addRef((h as Record<string, unknown>).portrait_media_id, "heroes", "portrait_media_id", str((h as Record<string, unknown>).id), str((h as Record<string, unknown>).publication_state));
  }
  for (const s of skins) {
    addRef((s as Record<string, unknown>).splash_art_media_id, "skins", "splash_art_media_id", str((s as Record<string, unknown>).id), str((s as Record<string, unknown>).publication_state));
  }
  for (const a of achievements) {
    addRef((a as Record<string, unknown>).icon_media_id, "achievements", "icon_media_id", str((a as Record<string, unknown>).id), str((a as Record<string, unknown>).publication_state));
  }
  for (const t of timelineEntries) {
    addRef((t as Record<string, unknown>).media_id, "timeline_entries", "media_id", str((t as Record<string, unknown>).id), str((t as Record<string, unknown>).publication_state));
  }
  for (const asRow of accountStats) {
    addRef((asRow as Record<string, unknown>).avatar_media_id, "account_stats", "avatar_media_id", null, str((asRow as Record<string, unknown>).publication_state));
    addRef((asRow as Record<string, unknown>).spotlight_media_id, "account_stats", "spotlight_media_id", null, str((asRow as Record<string, unknown>).publication_state));
    addRef((asRow as Record<string, unknown>).rank_media_id, "account_stats", "rank_media_id", null, str((asRow as Record<string, unknown>).publication_state));
  }

  const mediaManifest: BackupMediaManifestItem[] = mediaRows.map((m) => {
    const id = str((m as Record<string, unknown>).id);
    const bucket = str((m as Record<string, unknown>).storage_bucket);
    const objectPath = str((m as Record<string, unknown>).object_path);
    return {
      id,
      storageBucket: bucket,
      objectPath,
      kind: str((m as Record<string, unknown>).kind),
      mimeType: str((m as Record<string, unknown>).mime_type),
      byteSize: num((m as Record<string, unknown>).byte_size),
      widthPx: nullableNum((m as Record<string, unknown>).width_px),
      heightPx: nullableNum((m as Record<string, unknown>).height_px),
      checksumSha256: nullableStr((m as Record<string, unknown>).checksum_sha256),
      altText: nullableStr((m as Record<string, unknown>).alt_text),
      publicationState: str((m as Record<string, unknown>).publication_state),
      createdAt: nullableStr((m as Record<string, unknown>).created_at),
      updatedAt: nullableStr((m as Record<string, unknown>).updated_at),
      publicUrl: buildPublicUrl(includePublicUrls, bucket, objectPath),
      referencedBy: mediaMap.get(id) ?? [],
    };
  });

  mediaManifest.sort((a, b) => a.id.localeCompare(b.id));

  const totals: Record<string, number> = {
    media: mediaRows.length,
    heroes: heroes.length,
    skins: skins.length,
    achievements: achievements.length,
    timelineEntries: timelineEntries.length,
    accountStats: accountStats.length,
    appearanceSettings: appearanceSettings.length,
    homepageSections: homepageSections.length,
    releases: releases.length,
    releaseSnapshots: releaseSnapshots.length,
    publishedHeroes: publishedHeroes.length,
    publishedSkins: publishedSkins.length,
    publishedAchievements: publishedAchievements.length,
    publishedTimelineEntries: publishedTimelineEntries.length,
  };

  return {
    format: "json",
    formatVersion: BACKUP_FORMAT_VERSION,
    description: "MLBB Showcase application data backup (admin-authorized only)",
    generatedAt: new Date().toISOString(),
    scope,
    includesDrafts,
    includesPublished,
    includesSecrets: false,
    authorization: {
      required: "admin",
      serverSideEnforced: true,
    },
    mediaManifestIncludesUrls: includePublicUrls,
    streaming: false,
    bounded: true,
    totals,
    data: {
      media: mediaRows,
      heroes,
      skins,
      achievements,
      timelineEntries,
      accountStats: accountStats.length > 0 ? accountStats : null,
      appearanceSettings: appearanceSettings.length > 0 ? appearanceSettings : null,
      homepageSections,
      releases,
      releaseSnapshots,
      publishedHeroes,
      publishedSkins,
      publishedAchievements,
      publishedTimelineEntries,
    },
    mediaManifest,
  };
}
