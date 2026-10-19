"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createHeroAction,
  updateHeroAction,
} from "../../actions/hero-actions";
import type { HeroActionState } from "../../lib/content/hero-admin";
import {
  EMPTY_HERO_FORM_VALUES,
  heroToFormValues,
  issuesByPath,
  slugify,
  HERO_ROLE_OPTIONS,
  type HeroFormValues,
} from "../../lib/content/hero-form";
import type { DraftHero } from "../../lib/content/contracts";

const INITIAL_STATE: HeroActionState = {};

/**
 * Hero create/edit form (task 03-01).
 *
 * A thin client component that renders field errors and the pending state, and
 * uses `useActionState` to post to the appropriate Server Action. It contains no
 * authentication or business logic — submission, authorization, validation and
 * persistence are all handled on the server.
 */

export interface HeroFormProps {
  /** Which mode the form is in. */
  mode: "create" | "edit";
  /** Hero being edited (required in `edit` mode). */
  hero?: DraftHero;
  /** Where to return to if the user cancels. */
  cancelHref?: string;
}

export function HeroForm({
  mode,
  hero,
  cancelHref = "/admin/heroes",
}: HeroFormProps) {
  const isEdit = mode === "edit";
  const action = isEdit ? updateHeroAction : createHeroAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  const initialValues = useMemo<HeroFormValues>(
    () => (hero ? heroToFormValues(hero) : EMPTY_HERO_FORM_VALUES),
    [hero]
  );
  const fieldError = useMemo(() => issuesByPath(state.issues), [state.issues]);

  const [name, setName] = useState(initialValues.name);
  const [slug, setSlug] = useState(initialValues.slug);
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [primaryRole, setPrimaryRole] = useState(initialValues.primaryRole);
  const [secondaryRole, setSecondaryRole] = useState(initialValues.secondaryRole);
  const [specialty, setSpecialty] = useState(initialValues.specialty);
  const [portraitMediaId, setPortraitMediaId] = useState(
    initialValues.portraitMediaId
  );
  const [masteryLevel, setMasteryLevel] = useState(initialValues.masteryLevel);
  const [totalMatches, setTotalMatches] = useState(initialValues.totalMatches);
  const [winRate, setWinRate] = useState(initialValues.winRate);
  const [isSignature, setIsSignature] = useState(initialValues.isSignature);
  const [isFavorite, setIsFavorite] = useState(initialValues.isFavorite);

  const suggestSlug = (value: string): void => {
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  };

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      {hero?.id ? (
        <input type="hidden" name="id" value={hero.id} />
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
            Name and slug define how the hero is referenced across the public
            showcase.
          </p>
        </div>

        <div>
          <label
            htmlFor="hero-name"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="hero-name"
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
            aria-describedby={fieldError.name ? "hero-name-error" : undefined}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
          />
          {fieldError.name ? (
            <p id="hero-name-error" role="alert" className="mt-1 text-sm text-accent-gold-text">
              {fieldError.name}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="hero-slug"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Slug <span aria-hidden="true">*</span>
          </label>
          <input
            id="hero-slug"
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
            aria-describedby={fieldError.slug ? "hero-slug-error" : "hero-slug-help"}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
          />
          <p id="hero-slug-help" className="mt-1 text-xs text-muted">
            Lowercase letters, numbers and single hyphens. Generated from the name
            until you edit it.
          </p>
          {fieldError.slug ? (
            <p id="hero-slug-error" role="alert" className="mt-1 text-sm text-accent-gold-text">
              {fieldError.slug}
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Roles and specialty
          </h2>
          <p className="mt-1 text-sm text-muted">
            Define the hero&apos;s primary/secondary role and their specialty tag.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="hero-primary-role"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Primary role <span aria-hidden="true">*</span>
            </label>
            <select
              id="hero-primary-role"
              name="primaryRole"
              required
              value={primaryRole}
              onChange={(event) => setPrimaryRole(event.target.value)}
              aria-invalid={fieldError.primaryRole ? "true" : "false"}
              aria-describedby={fieldError.primaryRole ? "hero-primary-role-error" : undefined}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
            >
              <option value="">Select a role…</option>
              {HERO_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldError.primaryRole ? (
              <p id="hero-primary-role-error" role="alert" className="mt-1 text-sm text-accent-gold-text">
                {fieldError.primaryRole}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="hero-secondary-role"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Secondary role
            </label>
            <select
              id="hero-secondary-role"
              name="secondaryRole"
              value={secondaryRole}
              onChange={(event) => setSecondaryRole(event.target.value)}
              aria-invalid={fieldError.secondaryRole ? "true" : "false"}
              aria-describedby={fieldError.secondaryRole ? "hero-secondary-role-error" : "hero-secondary-role-help"}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
            >
              <option value="">None</option>
              {HERO_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p id="hero-secondary-role-help" className="mt-1 text-xs text-muted">
              Must differ from the primary role when set.
            </p>
            {fieldError.secondaryRole ? (
              <p id="hero-secondary-role-error" role="alert" className="mt-1 text-sm text-accent-gold-text">
                {fieldError.secondaryRole}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label
            htmlFor="hero-specialty"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Specialty
          </label>
          <input
            id="hero-specialty"
            name="specialty"
            maxLength={120}
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            aria-invalid={fieldError.specialty ? "true" : "false"}
            aria-describedby={fieldError.specialty ? "hero-specialty-error" : "hero-specialty-help"}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
          />
          <p id="hero-specialty-help" className="mt-1 text-xs text-muted">
            A short, optional tag (e.g. &ldquo;Burst damage&rdquo;).
          </p>
          {fieldError.specialty ? (
            <p id="hero-specialty-error" role="alert" className="mt-1 text-sm text-accent-gold-text">
              {fieldError.specialty}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="hero-portrait-media-id"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Portrait media ID (UUID)
          </label>
          <input
            id="hero-portrait-media-id"
            name="portraitMediaId"
            maxLength={64}
            value={portraitMediaId}
            onChange={(event) => setPortraitMediaId(event.target.value)}
            aria-invalid={fieldError.portraitMediaId ? "true" : "false"}
            aria-describedby={fieldError.portraitMediaId ? "hero-portrait-error" : "hero-portrait-help"}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
          />
          <p id="hero-portrait-help" className="mt-1 text-xs text-muted">
            Must reference an existing media record in the <code>media</code> table.
            Leave blank if no portrait is assigned yet.
          </p>
          {fieldError.portraitMediaId ? (
            <p id="hero-portrait-error" role="alert" className="mt-1 text-sm text-accent-gold-text">
              {fieldError.portraitMediaId}
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Stats
          </h2>
          <p className="mt-1 text-sm text-muted">
            Track mastery, match totals and win rate (0–100%). Win rate is
            optional.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="hero-mastery-level"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Mastery level <span aria-hidden="true">*</span>
            </label>
            <input
              id="hero-mastery-level"
              name="masteryLevel"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={masteryLevel}
              onChange={(event) => setMasteryLevel(event.target.value)}
              aria-invalid={fieldError.masteryLevel ? "true" : "false"}
              aria-describedby={fieldError.masteryLevel ? "hero-mastery-error" : undefined}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
            />
            {fieldError.masteryLevel ? (
              <p id="hero-mastery-error" role="alert" className="mt-1 text-sm text-accent-gold-text">
                {fieldError.masteryLevel}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="hero-total-matches"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Total matches <span aria-hidden="true">*</span>
            </label>
            <input
              id="hero-total-matches"
              name="totalMatches"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={totalMatches}
              onChange={(event) => setTotalMatches(event.target.value)}
              aria-invalid={fieldError.totalMatches ? "true" : "false"}
              aria-describedby={fieldError.totalMatches ? "hero-matches-error" : undefined}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
            />
            {fieldError.totalMatches ? (
              <p id="hero-matches-error" role="alert" className="mt-1 text-sm text-accent-gold-text">
                {fieldError.totalMatches}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="hero-win-rate"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Win rate (%)
            </label>
            <input
              id="hero-win-rate"
              name="winRate"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.01}
              value={winRate}
              onChange={(event) => setWinRate(event.target.value)}
              aria-invalid={fieldError.winRate ? "true" : "false"}
              aria-describedby={fieldError.winRate ? "hero-winrate-error" : "hero-winrate-help"}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
            />
            <p id="hero-winrate-help" className="mt-1 text-xs text-muted">
              Leave blank if not recorded.
            </p>
            {fieldError.winRate ? (
              <p id="hero-winrate-error" role="alert" className="mt-1 text-sm text-accent-gold-text">
                {fieldError.winRate}
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
            Mark the hero as a signature or a favorite for editorial curation.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="sr-only">Hero flags</legend>
          <div className="flex items-start gap-3">
            <input
              id="hero-is-signature"
              name="isSignature"
              type="checkbox"
              checked={isSignature}
              onChange={(event) => setIsSignature(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-focus"
            />
            <div>
              <label
                htmlFor="hero-is-signature"
                className="block text-sm font-medium text-foreground"
              >
                Signature hero
              </label>
              <p className="mt-0.5 text-xs text-muted">
                Highlight this hero as an account signature.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input
              id="hero-is-favorite"
              name="isFavorite"
              type="checkbox"
              checked={isFavorite}
              onChange={(event) => setIsFavorite(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-focus"
            />
            <div>
              <label
                htmlFor="hero-is-favorite"
                className="block text-sm font-medium text-foreground"
              >
                Favorite hero
              </label>
              <p className="mt-0.5 text-xs text-muted">
                Mark this hero as a personal favorite.
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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create hero"}
        </button>
      </div>
    </form>
  );
}
