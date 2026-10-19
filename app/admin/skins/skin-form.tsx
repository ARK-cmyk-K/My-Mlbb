"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createSkinAction,
  updateSkinAction,
} from "../../actions/skin-actions";
import type { DraftSkin } from "../../lib/content/contracts";
import type { SkinActionState } from "../../lib/content/skin-admin";
import {
  EMPTY_SKIN_FORM_VALUES,
  SKIN_RARITY_OPTIONS,
  SKIN_VARIANT_OPTIONS,
  issuesByPath,
  skinToFormValues,
  slugify,
  type SkinFormValues,
  type SkinHeroOption,
} from "../../lib/content/skin-form";

const INITIAL_STATE: SkinActionState = {};

const FIELD_CLASS =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus";
const LABEL_CLASS = "mb-1 block text-sm font-medium text-foreground";
const ERROR_CLASS = "mt-1 text-sm text-accent-gold-text";
const HELP_CLASS = "mt-1 text-xs text-muted";

/**
 * Skin create/edit form (task 03-02).
 *
 * A thin client component that renders field errors and the pending state, and
 * uses `useActionState` to post to the appropriate Server Action. It contains no
 * authentication or business logic — submission, authorization, validation and
 * persistence are all handled on the server.
 */

export interface SkinFormProps {
  /** Which mode the form is in. */
  mode: "create" | "edit";
  /** Skin being edited (required in `edit` mode). */
  skin?: DraftSkin;
  /** Heroes available for the association `<select>` (server-provided). */
  heroOptions: SkinHeroOption[];
  /** Where to return to if the user cancels. */
  cancelHref?: string;
}

export function SkinForm({
  mode,
  skin,
  heroOptions,
  cancelHref = "/admin/skins",
}: SkinFormProps) {
  const isEdit = mode === "edit";
  const action = isEdit ? updateSkinAction : createSkinAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  const initialValues = useMemo<SkinFormValues>(
    () => (skin ? skinToFormValues(skin) : EMPTY_SKIN_FORM_VALUES),
    [skin]
  );
  const fieldError = useMemo(() => issuesByPath(state.issues), [state.issues]);

  const [name, setName] = useState(initialValues.name);
  const [slug, setSlug] = useState(initialValues.slug);
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [heroId, setHeroId] = useState(initialValues.heroId);
  const [rarity, setRarity] = useState(initialValues.rarity);
  const [series, setSeries] = useState(initialValues.series);
  const [splashArtMediaId, setSplashArtMediaId] = useState(
    initialValues.splashArtMediaId
  );
  const [variant, setVariant] = useState(initialValues.variant);
  const [acquisitionDate, setAcquisitionDate] = useState(
    initialValues.acquisitionDate
  );
  const [acquisitionMilestone, setAcquisitionMilestone] = useState(
    initialValues.acquisitionMilestone
  );
  const [isOwned, setIsOwned] = useState(initialValues.isOwned);
  const [isFavorite, setIsFavorite] = useState(initialValues.isFavorite);

  const suggestSlug = (value: string): void => {
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  };

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      {skin?.id ? (
        <input type="hidden" name="id" value={skin.id} />
      ) : null}

      {state.error ? (
        <div
          role="alert"
          className="rounded-md border border-border bg-surface-raised px-4 py-3 text-sm text-foreground"
        >
          {state.error}
        </div>
      ) : null}

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Identity
          </h2>
          <p className="mt-1 text-sm text-muted">
            Name and slug define how the skin is referenced across the public
            showcase.
          </p>
        </div>

        <div>
          <label htmlFor="skin-name" className={LABEL_CLASS}>
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="skin-name"
            name="name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => {
              const value = event.target.value;
              setName(value);
              suggestSlug(value);
            }}
            aria-invalid={fieldError.name ? "true" : "false"}
            aria-describedby={fieldError.name ? "skin-name-error" : undefined}
            className={FIELD_CLASS}
          />
          {fieldError.name ? (
            <p id="skin-name-error" role="alert" className={ERROR_CLASS}>
              {fieldError.name}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="skin-slug" className={LABEL_CLASS}>
            Slug <span aria-hidden="true">*</span>
          </label>
          <input
            id="skin-slug"
            name="slug"
            required
            maxLength={140}
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugTouched(true);
            }}
            onBlur={() => setSlugTouched(true)}
            aria-invalid={fieldError.slug ? "true" : "false"}
            aria-describedby={fieldError.slug ? "skin-slug-error" : "skin-slug-help"}
            className={FIELD_CLASS}
          />
          <p id="skin-slug-help" className={HELP_CLASS}>
            Lowercase letters, numbers and single hyphens. Generated from the name
            until you edit it.
          </p>
          {fieldError.slug ? (
            <p id="skin-slug-error" role="alert" className={ERROR_CLASS}>
              {fieldError.slug}
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Classification
          </h2>
          <p className="mt-1 text-sm text-muted">
            Associate the skin with a hero and classify its rarity, series and
            variant.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="skin-hero" className={LABEL_CLASS}>
              Hero
            </label>
            <select
              id="skin-hero"
              name="heroId"
              value={heroId}
              onChange={(event) => setHeroId(event.target.value)}
              aria-invalid={fieldError.heroId ? "true" : "false"}
              aria-describedby={fieldError.heroId ? "skin-hero-error" : "skin-hero-help"}
              className={FIELD_CLASS}
            >
              <option value="">None (unassigned)</option>
              {heroOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p id="skin-hero-help" className={HELP_CLASS}>
              {heroOptions.length === 0
                ? "Create a hero first to associate this skin with one."
                : "Archived heroes remain selectable so existing skins keep their association."}
            </p>
            {fieldError.heroId ? (
              <p id="skin-hero-error" role="alert" className={ERROR_CLASS}>
                {fieldError.heroId}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="skin-rarity" className={LABEL_CLASS}>
              Rarity <span aria-hidden="true">*</span>
            </label>
            <select
              id="skin-rarity"
              name="rarity"
              required
              value={rarity}
              onChange={(event) => setRarity(event.target.value)}
              aria-invalid={fieldError.rarity ? "true" : "false"}
              aria-describedby={fieldError.rarity ? "skin-rarity-error" : undefined}
              className={FIELD_CLASS}
            >
              <option value="">Select a rarity…</option>
              {SKIN_RARITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldError.rarity ? (
              <p id="skin-rarity-error" role="alert" className={ERROR_CLASS}>
                {fieldError.rarity}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="skin-series" className={LABEL_CLASS}>
              Series / event
            </label>
            <input
              id="skin-series"
              name="series"
              maxLength={160}
              value={series}
              onChange={(event) => setSeries(event.target.value)}
              aria-invalid={fieldError.series ? "true" : "false"}
              aria-describedby={fieldError.series ? "skin-series-error" : "skin-series-help"}
              className={FIELD_CLASS}
            />
            <p id="skin-series-help" className={HELP_CLASS}>
              Optional series or event name (e.g. &ldquo;Starlight Carnival&rdquo;).
            </p>
            {fieldError.series ? (
              <p id="skin-series-error" role="alert" className={ERROR_CLASS}>
                {fieldError.series}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="skin-variant" className={LABEL_CLASS}>
              Variant
            </label>
            <select
              id="skin-variant"
              name="variant"
              value={variant}
              onChange={(event) => setVariant(event.target.value)}
              aria-invalid={fieldError.variant ? "true" : "false"}
              aria-describedby={fieldError.variant ? "skin-variant-error" : undefined}
              className={FIELD_CLASS}
            >
              <option value="">Not specified</option>
              {SKIN_VARIANT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldError.variant ? (
              <p id="skin-variant-error" role="alert" className={ERROR_CLASS}>
                {fieldError.variant}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Artwork
          </h2>
          <p className="mt-1 text-sm text-muted">
            Link the splash art stored in the shared media library.
          </p>
        </div>

        <div>
          <label htmlFor="skin-splash-art-media-id" className={LABEL_CLASS}>
            Splash art media ID (UUID)
          </label>
          <input
            id="skin-splash-art-media-id"
            name="splashArtMediaId"
            maxLength={64}
            value={splashArtMediaId}
            onChange={(event) => setSplashArtMediaId(event.target.value)}
            aria-invalid={fieldError.splashArtMediaId ? "true" : "false"}
            aria-describedby={
              fieldError.splashArtMediaId
                ? "skin-splash-art-error"
                : "skin-splash-art-help"
            }
            className={FIELD_CLASS}
          />
          <p id="skin-splash-art-help" className={HELP_CLASS}>
            Must reference an existing media record. Referenced media cannot be
            deleted while a skin uses it. Leave blank if no splash art is assigned
            yet.
          </p>
          {fieldError.splashArtMediaId ? (
            <p id="skin-splash-art-error" role="alert" className={ERROR_CLASS}>
              {fieldError.splashArtMediaId}
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Acquisition
          </h2>
          <p className="mt-1 text-sm text-muted">
            Record when or how the skin was acquired. Both fields are optional.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="skin-acquisition-date" className={LABEL_CLASS}>
              Acquisition date
            </label>
            <input
              id="skin-acquisition-date"
              name="acquisitionDate"
              type="date"
              min="2010-01-01"
              max="2100-12-31"
              value={acquisitionDate}
              onChange={(event) => setAcquisitionDate(event.target.value)}
              aria-invalid={fieldError.acquisitionDate ? "true" : "false"}
              aria-describedby={
                fieldError.acquisitionDate
                  ? "skin-acquisition-date-error"
                  : "skin-acquisition-date-help"
              }
              className={FIELD_CLASS}
            />
            <p id="skin-acquisition-date-help" className={HELP_CLASS}>
              Leave blank if the exact date is unknown.
            </p>
            {fieldError.acquisitionDate ? (
              <p id="skin-acquisition-date-error" role="alert" className={ERROR_CLASS}>
                {fieldError.acquisitionDate}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="skin-acquisition-milestone" className={LABEL_CLASS}>
              Acquisition milestone
            </label>
            <input
              id="skin-acquisition-milestone"
              name="acquisitionMilestone"
              maxLength={160}
              value={acquisitionMilestone}
              onChange={(event) => setAcquisitionMilestone(event.target.value)}
              aria-invalid={fieldError.acquisitionMilestone ? "true" : "false"}
              aria-describedby={
                fieldError.acquisitionMilestone
                  ? "skin-acquisition-milestone-error"
                  : "skin-acquisition-milestone-help"
              }
              className={FIELD_CLASS}
            />
            <p id="skin-acquisition-milestone-help" className={HELP_CLASS}>
              Optional note (e.g. &ldquo;Recharged during 2025 anniversary&rdquo;).
            </p>
            {fieldError.acquisitionMilestone ? (
              <p
                id="skin-acquisition-milestone-error"
                role="alert"
                className={ERROR_CLASS}
              >
                {fieldError.acquisitionMilestone}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Flags
          </h2>
          <p className="mt-1 text-sm text-muted">
            Track ownership and favorite status for the collection filters.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="sr-only">Skin flags</legend>
          <div className="flex items-start gap-3">
            <input
              id="skin-is-owned"
              name="isOwned"
              type="checkbox"
              checked={isOwned}
              onChange={(event) => setIsOwned(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-focus"
            />
            <div>
              <label htmlFor="skin-is-owned" className="block text-sm font-medium text-foreground">
                Owned
              </label>
              <p className="mt-0.5 text-xs text-muted">
                The account currently owns this skin.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input
              id="skin-is-favorite"
              name="isFavorite"
              type="checkbox"
              checked={isFavorite}
              onChange={(event) => setIsFavorite(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-focus"
            />
            <div>
              <label htmlFor="skin-is-favorite" className="block text-sm font-medium text-foreground">
                Favorite skin
              </label>
              <p className="mt-0.5 text-xs text-muted">
                Mark this skin as a personal favorite.
              </p>
            </div>
          </div>
        </fieldset>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <a
          href={cancelHref}
          className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create skin"}
        </button>
      </div>
    </form>
  );
}
