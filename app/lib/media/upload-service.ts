import { ContentServiceError } from "../content/errors.ts";
import {
  DRAFT_MEDIA_BUCKET,
  buildMediaObjectPath,
  decideUploadAuthorization,
  validateUploadCandidate,
  type AllowedImageMimeType,
  type MediaKind,
  type UploadActor,
} from "./upload-policy.ts";

/**
 * Media upload orchestration (task 02-04).
 *
 * This module owns the *order* of operations for a draft upload and the
 * translation of policy failures into the shared `ContentServiceError` boundary.
 * It is deliberately free of `server-only`, Supabase and `process.env`, so the
 * behaviour below is unit-tested directly with injected fakes (see
 * `upload-service.test.ts`). The real Supabase wiring lives in `./service.ts`.
 *
 * Sequence (and why):
 *   1. Resolve the verified actor and authorize. Fail closed before any bytes
 *      are read or written.
 *   2. Read the bytes and validate them against the policy (kind, content type,
 *      size, magic bytes). The *actual* byte length is authoritative — the
 *      client's declared size is ignored.
 *   3. Upload to the private draft bucket under a fully server-generated name.
 *   4. Register the `media` row (still `publication_state = 'draft'`).
 *      If step 4 fails, step 3 is compensated (best-effort delete) so a metadata
 *      failure cannot strand an object.
 *
 * Nothing here can write to the public bucket or mark a row published; that is
 * the publish/rollback transaction of task 04-06.
 */

/** Facts about the caller plus the resolved user id (for `media.created_by`). */
export interface ResolvedUploadActor extends UploadActor {
  /** `auth.users.id` of the verified session, or `null`. */
  userId: string | null;
}

/** Minimal `File`-like surface the orchestrator needs. */
export interface MediaUploadFile {
  /** Content type declared by the browser. Treated as a claim, not a fact. */
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface UploadDraftMediaInput {
  /** Claimed `media_kind`; validated against the enum. */
  kind: unknown;
  file: MediaUploadFile;
}

/** The row registered in `public.media` after a successful upload. */
export interface NewMediaRow {
  id: string;
  storageBucket: string;
  objectPath: string;
  kind: MediaKind;
  mimeType: string;
  byteSize: number;
  createdBy: string | null;
}

/** Result of a successful draft upload. */
export interface UploadedDraftMedia {
  mediaId: string;
  bucket: typeof DRAFT_MEDIA_BUCKET;
  objectPath: string;
  kind: MediaKind;
  mimeType: AllowedImageMimeType;
  byteSize: number;
  publicationState: "draft";
}

/** Storage port — the only object-storage operations this module performs. */
export interface MediaStoragePort {
  upload(
    bucket: string,
    objectPath: string,
    bytes: Uint8Array,
    contentType: string
  ): Promise<void>;
  remove(bucket: string, objectPath: string): Promise<void>;
}

/** Metadata-registry port — inserts the `public.media` row. */
export interface MediaRegistryPort {
  insert(row: NewMediaRow): Promise<void>;
}

export interface MediaServiceDependencies {
  /** Resolves the verified session and the `is_admin()` verdict. */
  resolveActor(): Promise<ResolvedUploadActor>;
  storage: MediaStoragePort;
  registry: MediaRegistryPort;
  /** Generates a fresh UUID for the object name and media row. */
  generateId(): string;
}

export interface MediaService {
  /** Validates, uploads and registers one draft media object. */
  uploadDraftMedia(input: UploadDraftMediaInput): Promise<UploadedDraftMedia>;
}

export function createMediaService(
  deps: MediaServiceDependencies
): MediaService {
  return {
    async uploadDraftMedia(input) {
      const actor = await deps.resolveActor();
      const authorization = decideUploadAuthorization(actor);
      if (!authorization.allowed) {
        throw new ContentServiceError(authorization.code);
      }
      const bucket = authorization.bucket;

      const bytes = new Uint8Array(await input.file.arrayBuffer());

      // `byteSize` is the measured length, never the client's claim.
      const validation = validateUploadCandidate({
        kind: input.kind,
        declaredMimeType: input.file.type,
        byteSize: bytes.byteLength,
        bytes,
      });
      if (!validation.ok) {
        throw new ContentServiceError("VALIDATION_FAILED", {
          issues: validation.issues,
        });
      }
      const { kind, mimeType, byteSize } = validation.value;

      const id = deps.generateId();
      const objectPath = buildMediaObjectPath(kind, mimeType, id);
      if (objectPath === null) {
        // Unreachable unless `generateId` is broken; fail closed regardless.
        throw new ContentServiceError("VALIDATION_FAILED", {
          issues: [{ path: "id", message: "generated media id was not a UUID" }],
        });
      }

      try {
        await deps.storage.upload(bucket, objectPath, bytes, mimeType);
      } catch (cause) {
        throw toStoreError(cause);
      }

      try {
        await deps.registry.insert({
          id,
          storageBucket: bucket,
          objectPath,
          kind,
          mimeType,
          byteSize,
          createdBy: actor.userId,
        });
      } catch (cause) {
        // Compensate: never leave an object that no metadata row describes.
        try {
          await deps.storage.remove(bucket, objectPath);
        } catch {
          // Best effort. The object is private and admin-only either way.
        }
        throw toStoreError(cause);
      }

      return {
        mediaId: id,
        bucket: DRAFT_MEDIA_BUCKET,
        objectPath,
        kind,
        mimeType,
        byteSize,
        publicationState: "draft",
      };
    },
  };
}

/** Preserves a typed error; wraps anything else as `STORE_UNAVAILABLE`. */
function toStoreError(cause: unknown): ContentServiceError {
  return cause instanceof ContentServiceError
    ? cause
    : new ContentServiceError("STORE_UNAVAILABLE", { cause });
}
