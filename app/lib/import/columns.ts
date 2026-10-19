/**
 * CSV import schema (task 03-03).
 *
 * The supported entities and their exact header sets live here as plain data.
 * Both the server-side preview builder and the client-side help text read this
 * module, so there is one definition of "what a valid CSV looks like".
 *
 * Headers are lowercase snake_case and must appear exactly once; order does not
 * matter. Mapping headers to the camelCase service payload happens in
 * `preview.ts`, next to the reuse of the `02-03` validators.
 *
 * This module is dependency-free and safe to import from client components.
 */

export const IMPORT_ENTITIES = ["heroes", "skins"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export const HERO_CSV_COLUMNS = [
  "name",
  "slug",
  "primary_role",
  "secondary_role",
  "specialty",
  "portrait_media_id",
  "mastery_level",
  "total_matches",
  "win_rate",
  "is_signature",
  "is_favorite",
] as const;

export const SKIN_CSV_COLUMNS = [
  "name",
  "slug",
  "hero_slug",
  "rarity",
  "series",
  "splash_art_media_id",
  "variant",
  "acquisition_date",
  "acquisition_milestone",
  "is_owned",
  "is_favorite",
] as const;

/** Expected columns per entity, in the order the dashboard documents them. */
export const CSV_COLUMNS_BY_ENTITY: Record<ImportEntity, readonly string[]> = {
  heroes: HERO_CSV_COLUMNS,
  skins: SKIN_CSV_COLUMNS,
};

/** True when `value` is one of the entities this task can preview. */
export function isImportEntity(value: unknown): value is ImportEntity {
  return (
    typeof value === "string" &&
    (IMPORT_ENTITIES as readonly string[]).includes(value)
  );
}
