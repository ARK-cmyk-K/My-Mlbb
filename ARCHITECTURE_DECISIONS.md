# Architecture Decisions — MLBB Showcase

These decisions come from the approved product specification. Agents must not silently change them.

## Product
- Public MLBB account showcase and private single-admin dashboard are separate trust zones.
- Public content is served from published data only; drafts and administrative operations remain private.
- Cinematic dark-first design with light mode, tokenized rarity/role accents, geometric display typography, and readable editorial layouts.
- Desktop sticky header and mobile bottom navigation.
- Visitor favorites are browser-local; visitors do not need accounts and there are no public like counters.

## Technology
- Next.js App Router, React Server Components, TypeScript, Tailwind CSS, Framer Motion.
- Supabase managed PostgreSQL, Auth, Storage, RLS, and RPC.
- Vercel deployment and `@vercel/og` dynamic social previews.
- PostgreSQL full-text search plus typo-tolerant trigram search (`pg_trgm`).

## Data domains
- Heroes, skins, account stats, achievements, timeline entries, draft content, published releases, release snapshots, media metadata, appearance settings, and import/export operations.
- Hero fields include roles, specialty, portrait, mastery, matches, win rate, and signature/favorite state.
- Skin fields include rarity, series, splash art, variant, acquisition milestone/date, ownership, and favorite tag.

## Security invariants
- No service-role key in client bundles.
- RLS and server-side authorization are both required for privileged actions.
- Anonymous roles may read only intentionally published content and public media.
- Drafts, private media, releases' administrative metadata, and backups must not be anonymously readable.
- Foreign keys and restrictive delete behavior protect referenced media.
- Any policy, grant, or data-model change affecting public/draft separation requires explicit review and tests.

## Release behavior
- Draft and published states are distinct.
- Publish creates an immutable named release snapshot and updates the published release pointer transactionally where possible.
- Rollback republishes a prior snapshot through a controlled operation; it must not silently destroy release history.
- CDN invalidation must be implemented only where the actual hosting/cache integration supports it; report any required external configuration.

## Change control
If a requirement cannot be implemented safely or conflicts with an existing schema, document the conflict and ask before making a breaking decision. Add a dated entry below when a decision is explicitly changed.

## Decision change log
- No approved decisions changed.
