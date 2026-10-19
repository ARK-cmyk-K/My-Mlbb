# Prompt Index — MLBB Showcase

Use one prompt per task. IDs are stable and should be referenced in `PROJECT_STATE.md`.

## Phase 1 — Project setup and database foundations
- [x] `01-01` Project audit and bootstrap
- [x] `01-02` Design tokens and typography
- [x] `01-03` Core database schema migration
- [x] `01-04` RLS, grants, and storage security foundations
- [x] `01-05` Published-content search RPC and indexes
- [x] `01-06` Phase 1 validation and migration documentation

## Phase 2 — Authentication and dashboard infrastructure
- [ ] `02-01` Secure single-admin authentication
- [ ] `02-02` Protected dashboard shell and sidebar
- [ ] `02-03` Draft/published state service
- [ ] `02-04` Supabase Storage buckets and policies

## Phase 3 — Collection management and import/export
- [ ] `03-01` Hero CRUD (implemented, unverified — no live Supabase provider)
- [ ] `03-02` Skin CRUD
- [ ] `03-03` CSV dry-run import and validation
- [ ] `03-04` Import merge-resolution workflow
- [ ] `03-05` JSON backup export and media manifest
- [ ] `03-06` SQL export and restore safeguards

## Phase 4 — Appearance studio and release workspace
- [ ] `04-01` Tokenized appearance settings
- [ ] `04-02` Homepage section ordering and visibility
- [ ] `04-03` Safe custom CSS validation and application
- [ ] `04-04` Responsive preview workspace
- [ ] `04-05` Release diff and immutable snapshots
- [ ] `04-06` Publish, scheduled publish, and rollback

## Phase 5 — Public showcase and interactions
- [ ] `05-01` Public site shell and adaptive navigation
- [ ] `05-02` Spotlight header and stats strip
- [ ] `05-03` Showcase tabs and milestone timeline
- [ ] `05-04` Hero and skin explorer
- [ ] `05-05` Quick view and dual-mode comparison
- [ ] `05-06` Local favorites and social sharing

## Phase 6 — Search, social cards, optimization, launch
- [ ] `06-01` Global search modal and keyboard shortcut
- [ ] `06-02` Dynamic Open Graph image routes
- [ ] `06-03` Accessibility, responsive, and performance audit
- [ ] `06-04` Security review and automated tests
- [ ] `06-05` Production deployment and launch checklist

## Usage rules
- Prompts may be submitted in separate AI sessions, but each agent must read the current state first.
- A task can be attempted out of sequence only if its dependencies are satisfied. Otherwise report `BLOCKED`.
- Update the checkboxes only when state evidence supports the change. `PROJECT_STATE.md` is the detailed record.
