import {
  issuesByPath,
  readOptionalNumber,
  readString,
} from "./form-utils.ts";
import {
  SAFE_CSS_PROPERTIES,
  THEME_PRESETS,
  validateAppearanceSettingsInput,
  validateCustomCss,
  type AppearanceSettingsInput,
  type ThemePreset,
  type ValidationResult,
} from "./validation.ts";
import type { DraftAppearanceSettings } from "./contracts.ts";

/**
 * Appearance settings form helpers (task 04-01).
 *
 * Pure coercion from browser FormData to validated appearance payloads. Keeps
 * validation concerns delegated to the schema-mirroring validators.
 */

export { issuesByPath };

export const THEME_PRESET_OPTIONS: ReadonlyArray<{
  value: ThemePreset;
  label: string;
}> = THEME_PRESETS.map((preset) => ({
  value: preset,
  label: presetLabel(preset),
}));

export function presetLabel(preset: ThemePreset): string {
  return preset.charAt(0).toUpperCase() + preset.slice(1);
}

export interface AppearanceFormValues {
  themePreset: string;
  primaryAccent: string;
  secondaryAccent: string;
  typographyScale: string;
  containerWidthPx: string;
  spacingScale: string;
  customCss: string | null;
}

export const EMPTY_APPEARANCE_FORM_VALUES: AppearanceFormValues = {
  themePreset: "adaptive",
  primaryAccent: "#8b5cf6",
  secondaryAccent: "#f59e0b",
  typographyScale: "1.00",
  containerWidthPx: "1200",
  spacingScale: "1.00",
  customCss: null,
};

export function appearanceToFormValues(
  settings: DraftAppearanceSettings
): AppearanceFormValues {
  return {
    themePreset: settings.themePreset,
    primaryAccent: settings.primaryAccent,
    secondaryAccent: settings.secondaryAccent,
    typographyScale: settings.typographyScale.toFixed(2),
    containerWidthPx: String(settings.containerWidthPx),
    spacingScale: settings.spacingScale.toFixed(2),
    customCss: settings.customCss,
  };
}

function readCss(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw : null;
}

export function parseAppearanceForm(
  formData: FormData
): ValidationResult<AppearanceSettingsInput> {
  const rawCss = readCss(formData, "customCss");
  const baseResult = validateAppearanceSettingsInput({
    themePreset: readString(formData, "themePreset"),
    primaryAccent: readString(formData, "primaryAccent"),
    secondaryAccent: readString(formData, "secondaryAccent"),
    typographyScale: readOptionalNumber(formData, "typographyScale"),
    containerWidthPx: readOptionalNumber(formData, "containerWidthPx"),
    spacingScale: readOptionalNumber(formData, "spacingScale"),
  });

  if (!baseResult.ok) {
    return baseResult;
  }

  // Validate the custom CSS block
  if (rawCss == null || rawCss.length === 0) {
    // Empty/customCss omitted is acceptable — keep the existing values
    return { ok: true, value: {
      themePreset: baseResult.value.themePreset,
      primaryAccent: baseResult.value.primaryAccent,
      secondaryAccent: baseResult.value.secondaryAccent,
      typographyScale: baseResult.value.typographyScale,
      containerWidthPx: baseResult.value.containerWidthPx,
      spacingScale: baseResult.value.spacingScale,
    } };
  }

  const cssResult = validateCustomCss(rawCss);
  if (!cssResult.ok) {
    // Merge the CSS validation issues with any existing issues
    const allIssues = [...cssResult.issues];
    return { ok: false, issues: allIssues };
  }

  return { ok: true, value: {
    themePreset: baseResult.value.themePreset,
    primaryAccent: baseResult.value.primaryAccent,
    secondaryAccent: baseResult.value.secondaryAccent,
    typographyScale: baseResult.value.typographyScale,
    containerWidthPx: baseResult.value.containerWidthPx,
    spacingScale: baseResult.value.spacingScale,
    customCss: rawCss, // validated and safe
  } };
}
