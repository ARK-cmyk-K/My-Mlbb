# Media storage setup (task 02-04)

Portraits, splash art and other media live in **two Supabase Storage buckets**
with two different trust levels. The application never chooses a bucket at
runtime: draft uploads always go to the private bucket, and only the release
publish workflow may write published objects.

## Buckets

| Bucket | `public` | Purpose | Who may read | Who may write |
|---|---|---|---|---|
| `showcase-draft` | **false** | Draft/unpublished objects. The only upload target. | the configured admin only | the configured admin only |
| `showcase-public` | true | Objects referenced by a media row whose `publication_state = 'published'`. | anyone (public-bucket URL) | the publish workflow (admin), and only when a published media row names the exact bucket + object path |

Both buckets are capped at **10 MiB** and accept only **PNG, JPEG, WebP, AVIF**.
SVG is deliberately excluded on both sides: it can carry script and is a
stored-XSS vector when served from a public bucket.

The migration `supabase/migrations/20261019160000_storage_buckets_and_policies.sql`
is the source of truth (it applies to hosted projects). The same two buckets are
also declared in `supabase/config.toml` so local `supabase start` matches.

## Object naming

Every object name is `"<kind>/<uuid>.<ext>"`, for example
`portrait/2f1c8d4e-9a3b-4c5d-8e7f-0a1b2c3d4e5f.png`:

- `kind` is a `media_kind` enum value (`avatar`, `portrait`, `splash_art`,
  `thumbnail`, `badge`, `logo`, `other`).
- `uuid` is generated server-side for each upload; it is also the `media.id`.
- `ext` is derived from the **verified** content type, never from the uploaded
  filename.

The uploader controls none of the name, so path traversal (`../`), absolute
paths, leading dots and collisions are impossible by construction. The name
shape is enforced a second time inside the `storage.objects` write policies.

## Upload rules

Enforced in three places — the dashboard (fast feedback), the server
(`app/lib/media/`), and the storage policies/database (the real gate):

1. **Authorization** — only the configured admin may upload, and only to the
   private draft bucket. Anonymous and ordinary authenticated sessions are
   rejected before any bytes are read.
2. **Kind** — must be a `media_kind` value.
3. **Content type** — must be one of `image/png`, `image/jpeg`, `image/webp`,
   `image/avif`. The declared type is normalized (parameters stripped,
   lower-cased) and then checked against the file's **magic bytes**; a JPEG
   renamed `.png` and declared `image/png` is rejected.
4. **Size** — the *measured* byte length must be `> 0` and `<= 10 MiB`. The
   client's declared size is never trusted.
5. **Extension** — never taken from the filename; derived from the verified type.

The pure rules are in `app/lib/media/upload-policy.ts`; the orchestration (which
authorizes, validates, uploads, then registers the `media` row, compensating by
deleting the object if registration fails) is in `app/lib/media/upload-service.ts`.
Server code calls `mediaService.uploadDraftMedia({ kind, file })` from
`app/lib/media/index.ts`. A successful upload produces a `media` row with
`publication_state = 'draft'`.

## Access matrix

| Caller | Read public bucket | Read draft bucket | Write objects | Manage buckets |
|---|---|---|---|---|
| `anon` | yes (published assets) | no | no | no |
| `authenticated`, not the admin | yes | no | no | no |
| configured admin | yes | yes | yes (name-constrained) | no (owner/service-role only) |
| `service_role` | yes | yes | yes | yes |

`storage.buckets` is revoked from both client roles entirely: the app hardcodes
bucket ids and never lists buckets.

## Publish / unpublish invariant (for task 04-06)

Because a public bucket serves its objects without consulting RLS, the only thing
that keeps drafts out of the public bucket is the write policy. Task 04-06 must
honour this exact order:

1. Mark the media row `published` with `storage_bucket = 'showcase-public'` and
   the target `object_path`.
2. Copy the object from the draft bucket to that path in the public bucket. The
   insert policy only permits this **because** the published media row now exists.
3. When a media row leaves `published` (unpublish or rollback), **delete the
   public-bucket object**. Otherwise the old file stays fetchable through the
   public URL even though it is no longer published.

Media referenced by content is protected from accidental deletion by
`ON DELETE RESTRICT` foreign keys from every content table and by the `media`
RLS policies; the storage object itself is not FK-protected, so the publish
workflow owns public-object cleanup.

## Verifying

The behavioural suite is
`supabase/tests/02-04_storage_verification.sql`. It checks bucket configuration,
RLS, the policy inventory and the grant matrix, then exercises anon / ordinary
authenticated / admin / service_role — including the publish-workflow invariant.
It runs in one rolled-back transaction and skips cleanly when the storage service
tables are absent:

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f - < supabase/tests/02-04_storage_verification.sql
```

Manual spot checks on a live project:

1. As `anon`, `GET .../storage/v1/object/public/showcase-public/<published path>`
   returns the file; the same URL for a `showcase-draft` path returns 400/404.
2. An insert into `storage.objects` for `showcase-public` with no matching
   published `media` row is rejected.
3. Uploading a file whose content is not PNG/JPEG/WebP/AVIF is rejected by the
   Storage API.

## Status in this repository

This environment has **no hosted Supabase project and no local stack**
(no Docker/Podman/Postgres; `storage.buckets`/`storage.objects` do not exist), so
the migration's storage block and the suite above have **not been applied or
run**. The upload policy, orchestration and their unit tests (`npm test`) are
provider-independent and do run. Provider-side enforcement remains
`IMPLEMENTED_UNVERIFIED` until applied to a project — see `PROJECT_STATE.md`.
