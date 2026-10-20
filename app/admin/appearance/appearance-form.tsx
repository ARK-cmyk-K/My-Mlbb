"use client";

import { useActionState, useMemo, useState } from "react";

import { updateAppearanceAction } from "../../actions/appearance-actions";
import type { AppearanceActionState } from "../../lib/content/appearance-admin";
import {
  issuesByPath as appearanceIssuesByPath,
  appearanceToFormValues,
  EMPTY_APPEARANCE_FORM_VALUES,
  THEME_PRESET_OPTIONS,
  type AppearanceFormValues,
} from "../../lib/content/appearance-form";
import type { DraftAppearanceSettings } from "../../lib/content/contracts";

const INITIAL_STATE: AppearanceActionState = {};

export interface AppearanceFormProps {
  settings: DraftAppearanceSettings;
}

export function AppearanceForm({ settings }: AppearanceFormProps) {
  const [state, formAction, pending] = useActionState(
    updateAppearanceAction,
    INITIAL_STATE
  );

  const initialValues = useMemo<AppearanceFormValues>(
    () => appearanceToFormValues(settings),
    [settings]
  );

  const [themePreset, setThemePreset] = useState(initialValues.themePreset);
  const [primaryAccent, setPrimaryAccent] = useState(
    initialValues.primaryAccent
  );
  const [secondaryAccent, setSecondaryAccent] = useState(
    initialValues.secondaryAccent
  );
  const [typographyScale, setTypographyScale] = useState(
    initialValues.typographyScale
  );
  const [containerWidthPx, setContainerWidthPx] = useState(
    initialValues.containerWidthPx
  );
  const [spacingScale, setSpacingScale] = useState(initialValues.spacingScale);
  const [customCss, setCustomCss] = useState(initialValues.customCss ?? "");

  const fieldError = useMemo(
    () => appearanceIssuesByPath(state.issues),
    [state.issues]
  );
    <form action={formAction} className="max-w-3xl space-y-6">
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
            Theme & tokens
          </h2>
          <p className="mt-1 text-sm text-muted">
            Control theme preset and accent colors. Changes save to draft
            settings only.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="themePreset"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Theme preset <span aria-hidden="true">*</span>
            </label>
            <select
              id="themePreset"
              name="themePreset"
              required
              value={themePreset}
              onChange={(event) => setThemePreset(event.target.value)}
              aria-invalid={fieldError.themePreset ? "true" : "false"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {THEME_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldError.themePreset ? (
              <p className="mt-1 text-sm text-red-400">
                {fieldError.themePreset}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="primaryAccent"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Primary accent <span aria-hidden="true">*</span>
            </label>
            <input
              id="primaryAccent"
              name="primaryAccent"
              type="text"
              required
              pattern="#[0-9a-fA-F]{6}"
              value={primaryAccent}
              onChange={(event) => setPrimaryAccent(event.target.value)}
              aria-invalid={fieldError.primaryAccent ? "true" : "false"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              placeholder="#8b5cf6"
            />
            {fieldError.primaryAccent ? (
              <p className="mt-1 text-sm text-red-400">
                {fieldError.primaryAccent}
              </p>
            ) : null}
          </div>
          <div>
            <label
              htmlFor="secondaryAccent"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Secondary accent <span aria-hidden="true">*</span>
            </label>
            <input
              id="secondaryAccent"
              name="secondaryAccent"
              type="text"
              required
              pattern="#[0-9a-fA-F]{6}"
              value={secondaryAccent}
              onChange={(event) => setSecondaryAccent(event.target.value)}
              aria-invalid={fieldError.secondaryAccent ? "true" : "false"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              placeholder="#f59e0b"
            />
            {fieldError.secondaryAccent ? (
              <p className="mt-1 text-sm text-red-400">
                {fieldError.secondaryAccent}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Layout & scale
          </h2>
          <p className="mt-1 text-sm text-muted">
            Typography scale, container width, and spacing scale.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="typographyScale"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Typography scale <span aria-hidden="true">*</span>
            </label>
            <input
              id="typographyScale"
              name="typographyScale"
              type="number"
              step="0.01"
              min="0.75"
              max="1.50"
              required
              value={typographyScale}
              onChange={(event) => setTypographyScale(event.target.value)}
              aria-invalid={fieldError.typographyScale ? "true" : "false"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
            {fieldError.typographyScale ? (
              <p className="mt-1 text-sm text-red-400">
                {fieldError.typographyScale}
              </p>
            ) : null}
          </div>
          <div>
            <label
              htmlFor="containerWidthPx"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Container width (px) <span aria-hidden="true">*</span>
            </label>
            <input
              id="containerWidthPx"
              name="containerWidthPx"
              type="number"
              step="1"
              min="960"
              max="1600"
              required
              value={containerWidthPx}
              onChange={(event) => setContainerWidthPx(event.target.value)}
              aria-invalid={fieldError.containerWidthPx ? "true" : "false"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
            {fieldError.containerWidthPx ? (
              <p className="mt-1 text-sm text-red-400">
                {fieldError.containerWidthPx}
              </p>
            ) : null}
          </div>
          <div>
            <label
              htmlFor="spacingScale"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Spacing scale <span aria-hidden="true">*</span>
            </label>
            <input
              id="spacingScale"
              name="spacingScale"
              type="number"
              step="0.01"
              min="0.75"
              max="1.50"
              required
              value={spacingScale}
              onChange={(event) => setSpacingScale(event.target.value)}
              aria-invalid={fieldError.spacingScale ? "true" : "false"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
            {fieldError.spacingScale ? (
              <p className="mt-1 text-sm text-red-400">
                {fieldError.spacingScale}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Custom CSS <span className="text-xs text-muted">(optional)</span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            Enter custom CSS here. Only a limited set of presentational properties
            are allowed (color, background, font, sizing, spacing). @import,
            url(), expression(), javascript:, and rules with unsafe characters
            are rejected. Leave blank to keep the current token-based theming.
          </p>
        </div>

        <div>
          <textarea
            id="customCss"
            name="customCss"
            rows={4}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus resize-y"
            placeholder="/* e.g. .hero-card { color: #fff; } */"
            value={customCss ?? ""}
            onChange={(event) => setCustomCss(event.target.value)}
            aria-invalid={fieldError.customCss ? "true" : "false"}
            aria-describedby={fieldError.customCss ? "customCss-error" : undefined}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {pending ? "Saving..." : "Save appearance settings"}
        </button>
        <p className="text-sm text-muted">
          Preview changes safely — no scripts or arbitrary CSS are accepted in
          this task.
        </p>
      </div>
    </form>
  );
}
