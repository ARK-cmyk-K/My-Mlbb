import assert from "node:assert/strict";
import { test } from "node:test";

import { ContentServiceError, isContentServiceError } from "../content/errors.ts";
import {
  DRAFT_MEDIA_BUCKET,
  PUBLIC_MEDIA_BUCKET,
  type AllowedImageMimeType,
} from "./upload-policy.ts";
import {
  createMediaService,
  type MediaRegistryPort,
  type MediaStoragePort,
  type NewMediaRow,
  type ResolvedUploadActor,
} from "./upload-service.ts";

/**
 * Behaviour tests for the media upload orchestration (task 02-04).
 *
 * No Supabase project is available here, so a fake storage + registry double is
 * injected. This exercises the full decision path (authorization -> validation
 * -> naming -> upload -> registration -> compensation) that the real Supabase
 * adapter reuses verbatim. Provider-side RLS/bucket enforcement is verified
 * separately once a project exists (see docs/media-storage-setup.md).
 */

const VALID_ID = "2f1c8d4e-9a3b-4c5d-8e7f-0a1b2c3d4e5f";

const ADMIN: ResolvedUploadActor = {
  configured: true,
  authenticated: true,
  isAdmin: true,
  userId: "11111111-1111-4111-8111-111111111111",
};
const NON_ADMIN: ResolvedUploadActor = { ...ADMIN, isAdmin: false };
const SIGNED_OUT: ResolvedUploadActor = {
  configured: true,
  authenticated: false,
  isAdmin: false,
  userId: null,
};
const UNCONFIGURED: ResolvedUploadActor = {
  configured: false,
  authenticated: false,
  isAdmin: false,
  userId: null,
};

function imageBytes(kind: AllowedImageMimeType, length = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  switch (kind) {
    case "image/png":
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      break;
    case "image/jpeg":
      bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
      break;
    case "image/webp":
      bytes.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
      bytes.set([..."WEBP"].map((c) => c.charCodeAt(0)), 8);
      break;
    case "image/avif":
      bytes.set([..."ftyp"].map((c) => c.charCodeAt(0)), 4);
      bytes.set([..."avif"].map((c) => c.charCodeAt(0)), 8);
      break;
  }
  return bytes;
}

function fakeFile(type: string, bytes: Uint8Array) {
  return {
    type,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

interface Recorded {
  uploads: Array<{
    bucket: string;
    objectPath: string;
    contentType: string;
    byteLength: number;
  }>;
  removes: Array<{ bucket: string; objectPath: string }>;
  rows: NewMediaRow[];
}

function makeService(options: {
  actor: ResolvedUploadActor;
  failUpload?: boolean;
  failRegistry?: boolean;
  id?: string;
}) {
  const recorded: Recorded = { uploads: [], removes: [], rows: [] };

  const storage: MediaStoragePort = {
    async upload(bucket, objectPath, bytes, contentType) {
      if (options.failUpload) {
        throw new Error("storage down");
      }
      recorded.uploads.push({
        bucket,
        objectPath,
        contentType,
        byteLength: bytes.byteLength,
      });
    },
    async remove(bucket, objectPath) {
      recorded.removes.push({ bucket, objectPath });
    },
  };

  const registry: MediaRegistryPort = {
    async insert(row) {
      if (options.failRegistry) {
        throw new Error("registry down");
      }
      recorded.rows.push(row);
    },
  };

  const service = createMediaService({
    resolveActor: async () => options.actor,
    storage,
    registry,
    generateId: () => options.id ?? VALID_ID,
  });

  return { service, recorded };
}

function assertCode(error: unknown, code: ContentServiceError["code"]): void {
  assert.ok(
    isContentServiceError(error),
    `expected a ContentServiceError, got ${String(error)}`
  );
  assert.equal((error as ContentServiceError).code, code);
}

// ---- authorization ----------------------------------------------------------

test("an unconfigured project denies the upload before touching storage", async () => {
  const { service, recorded } = makeService({ actor: UNCONFIGURED });

  await assert.rejects(
    service.uploadDraftMedia({
      kind: "portrait",
      file: fakeFile("image/png", imageBytes("image/png")),
    }),
    (error) => (assertCode(error, "NOT_CONFIGURED"), true)
  );
  assert.equal(recorded.uploads.length, 0);
  assert.equal(recorded.rows.length, 0);
});

test("an anonymous caller is denied and nothing is uploaded", async () => {
  const { service, recorded } = makeService({ actor: SIGNED_OUT });

  await assert.rejects(
    service.uploadDraftMedia({
      kind: "portrait",
      file: fakeFile("image/png", imageBytes("image/png")),
    }),
    (error) => (assertCode(error, "UNAUTHENTICATED"), true)
  );
  assert.equal(recorded.uploads.length, 0);
});

test("an authenticated non-admin is denied and nothing is uploaded", async () => {
  const { service, recorded } = makeService({ actor: NON_ADMIN });

  await assert.rejects(
    service.uploadDraftMedia({
      kind: "portrait",
      file: fakeFile("image/png", imageBytes("image/png")),
    }),
    (error) => (assertCode(error, "UNAUTHORIZED"), true)
  );
  assert.equal(recorded.uploads.length, 0);
});

// ---- success path -----------------------------------------------------------

test("the admin uploads to the private draft bucket and registers a draft row", async () => {
  const { service, recorded } = makeService({ actor: ADMIN });

  const result = await service.uploadDraftMedia({
    kind: "splash_art",
    file: fakeFile("image/png", imageBytes("image/png")),
  });

  assert.equal(result.bucket, DRAFT_MEDIA_BUCKET);
  assert.notEqual(result.bucket, PUBLIC_MEDIA_BUCKET);
  assert.equal(result.mediaId, VALID_ID);
  assert.equal(result.objectPath, `splash_art/${VALID_ID}.png`);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.publicationState, "draft");

  assert.equal(recorded.uploads.length, 1);
  assert.deepEqual(recorded.uploads[0], {
    bucket: DRAFT_MEDIA_BUCKET,
    objectPath: `splash_art/${VALID_ID}.png`,
    contentType: "image/png",
    byteLength: 32,
  });

  assert.equal(recorded.rows.length, 1);
  const row = recorded.rows[0];
  assert.equal(row.id, VALID_ID);
  assert.equal(row.storageBucket, DRAFT_MEDIA_BUCKET);
  assert.equal(row.objectPath, `splash_art/${VALID_ID}.png`);
  assert.equal(row.kind, "splash_art");
  assert.equal(row.mimeType, "image/png");
  assert.equal(row.byteSize, 32);
  assert.equal(row.createdBy, ADMIN.userId);
});

test("the extension of the stored object comes from the content, not the name", async () => {
  const { service, recorded } = makeService({ actor: ADMIN });

  // WebP content declared as WebP: stored extension is the canonical `.webp`.
  const result = await service.uploadDraftMedia({
    kind: "avatar",
    file: fakeFile("image/webp", imageBytes("image/webp")),
  });

  assert.equal(result.objectPath.endsWith(".webp"), true);
  assert.equal(recorded.uploads[0].contentType, "image/webp");
});

// ---- validation failures ----------------------------------------------------

test("mislabeled content is rejected and nothing reaches storage", async () => {
  const { service, recorded } = makeService({ actor: ADMIN });

  await assert.rejects(
    service.uploadDraftMedia({
      kind: "portrait",
      // JPEG bytes, but the browser claims PNG (extension is never trusted).
      file: fakeFile("image/png", imageBytes("image/jpeg")),
    }),
    (error) => (assertCode(error, "VALIDATION_FAILED"), true)
  );
  assert.equal(recorded.uploads.length, 0);
  assert.equal(recorded.rows.length, 0);
});

test("an unknown kind is rejected and nothing reaches storage", async () => {
  const { service, recorded } = makeService({ actor: ADMIN });

  await assert.rejects(
    service.uploadDraftMedia({
      kind: "executable",
      file: fakeFile("image/png", imageBytes("image/png")),
    }),
    (error) => (assertCode(error, "VALIDATION_FAILED"), true)
  );
  assert.equal(recorded.uploads.length, 0);
});

test("an oversize upload is rejected before storage", async () => {
  const { service, recorded } = makeService({ actor: ADMIN });
  const huge = new Uint8Array(11 * 1024 * 1024);
  huge.set(imageBytes("image/png"));

  await assert.rejects(
    service.uploadDraftMedia({
      kind: "splash_art",
      file: fakeFile("image/png", huge),
    }),
    (error) => (assertCode(error, "VALIDATION_FAILED"), true)
  );
  assert.equal(recorded.uploads.length, 0);
});

// ---- provider failures ------------------------------------------------------

test("a storage failure surfaces as STORE_UNAVAILABLE with no metadata row", async () => {
  const { service, recorded } = makeService({ actor: ADMIN, failUpload: true });

  await assert.rejects(
    service.uploadDraftMedia({
      kind: "portrait",
      file: fakeFile("image/png", imageBytes("image/png")),
    }),
    (error) => (assertCode(error, "STORE_UNAVAILABLE"), true)
  );
  assert.equal(recorded.rows.length, 0);
});

test("a registry failure compensates by removing the uploaded object", async () => {
  const { service, recorded } = makeService({ actor: ADMIN, failRegistry: true });

  await assert.rejects(
    service.uploadDraftMedia({
      kind: "portrait",
      file: fakeFile("image/png", imageBytes("image/png")),
    }),
    (error) => (assertCode(error, "STORE_UNAVAILABLE"), true)
  );

  assert.equal(recorded.uploads.length, 1);
  assert.deepEqual(recorded.removes, [
    {
      bucket: DRAFT_MEDIA_BUCKET,
      objectPath: recorded.uploads[0].objectPath,
    },
  ]);
});
