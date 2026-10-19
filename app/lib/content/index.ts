import "server-only";

import type { ContentService } from "./port.ts";
import { createSupabaseContentService } from "./service.ts";

/**
 * Server-only entry point for the content service (task 02-03).
 *
 * Import from here in Server Components, Route Handlers and Server Actions:
 *
 *     import { contentService } from "@/app/lib/content";
 *     const heroes = await contentService.listDraftHeroes();
 *
 * This module is marked `server-only`, so importing it from a `"use client"`
 * file is a build error — the service can never run in the browser, and no
 * Supabase key or privileged query reaches the client bundle. Dependencies
 * (Supabase client) are created per call inside the service, so this is a thin,
 * stateless export.
 *
 * Testing: pass an explicit double instead of this singleton. See
 * `createInMemoryContentService` in `./in-memory-service.ts`.
 */
export const contentService: ContentService = createSupabaseContentService();

export type {
  ContentService,
  DraftListOptions,
  DraftResource,
  ContentServiceFactory,
} from "./port.ts";
export type {
  ActiveRelease,
  DraftAchievement,
  DraftHero,
  DraftSkin,
  DraftState,
  DraftTimelineEntry,
  DraftTransition,
  PublishedAchievement,
  PublishedHero,
  PublishedRelease,
  PublishedSkin,
  PublishedTimelineEntry,
} from "./contracts.ts";
export { allowedTransitions, resolveDraftTransition } from "./contracts.ts";
export {
  ContentServiceError,
  isContentServiceError,
  serializeContentError,
  HTTP_STATUS_BY_CODE,
} from "./errors.ts";
export type {
  ContentErrorCode,
  SerializedContentError,
} from "./errors.ts";
export type {
  FieldIssue,
  HeroInput,
  HeroRole,
  SkinInput,
  TimelineEntryInput,
  ValidationResult,
} from "./validation.ts";
export { HERO_ROLES } from "./validation.ts";
export {
  EMPTY_HERO_FORM_VALUES,
  HERO_ROLE_OPTIONS,
  heroToFormValues,
  isUuid,
  issuesByPath,
  parseHeroForm,
  roleLabel,
  slugify,
} from "./hero-form.ts";
export type { HeroFormValues } from "./hero-form.ts";
export {
  HERO_TRANSITIONS,
  createHeroAdminService,
} from "./hero-admin.ts";
export type {
  HeroActionState,
  HeroAdminService,
  HeroMutationOutcome,
} from "./hero-admin.ts";
export {
  EMPTY_SKIN_FORM_VALUES,
  SKIN_RARITY_OPTIONS,
  SKIN_VARIANT_OPTIONS,
  parseSkinForm,
  rarityLabel,
  skinToFormValues,
  variantLabel,
} from "./skin-form.ts";
export type { SkinFormValues, SkinHeroOption } from "./skin-form.ts";
export {
  SKIN_TRANSITIONS,
  createSkinAdminService,
} from "./skin-admin.ts";
export type {
  SkinActionState,
  SkinAdminService,
  SkinMutationOutcome,
} from "./skin-admin.ts";
