import "server-only";

import type { MediaService } from "./upload-service.ts";
import { createSupabaseMediaService } from "./service.ts";

/**
 * Server-only entry point for the media upload service (task 02-04).
 *
 * Import from here in Server Components, Route Handlers and Server Actions:
 *
 *     import { mediaService } from "@/app/lib/media";
 *     await mediaService.uploadDraftMedia({ kind, file });
 *
 * Marked `server-only`, so importing it from a `"use client"` file is a build
 * error and no privileged upload path can reach the browser bundle. Dependencies
 * are created per call, so this is a thin, stateless export.
 *
 * Testing: the pure policy lives in `./upload-policy.ts` and the orchestration
 * in `./upload-service.ts`; both are dependency-free and exercised by
 * `node --test` without a Supabase project.
 */
export const mediaService: MediaService = createSupabaseMediaService();

export type {
  MediaRegistryPort,
  MediaService,
  MediaStoragePort,
  MediaUploadFile,
  NewMediaRow,
  UploadDraftMediaInput,
  UploadedDraftMedia,
} from "./upload-service.ts";
export {
  ALLOWED_IMAGE_MIME_TYPES,
  DRAFT_MEDIA_BUCKET,
  EXTENSION_BY_MIME_TYPE,
  MAX_MEDIA_UPLOAD_BYTES,
  MEDIA_KINDS,
  MEDIA_OBJECT_PATH_PATTERN,
  PUBLIC_MEDIA_BUCKET,
  buildMediaObjectPath,
  decideUploadAuthorization,
  extensionForMimeType,
  isAllowedImageMimeType,
  isMediaKind,
  isMediaObjectPath,
  sniffImageMimeType,
  validateUploadCandidate,
} from "./upload-policy.ts";
export type {
  AllowedImageMimeType,
  MediaKind,
  UploadActor,
  UploadAuthorization,
  UploadDenialCode,
  ValidatedUpload,
} from "./upload-policy.ts";
export { ContentServiceError, isContentServiceError } from "../content/errors.ts";
