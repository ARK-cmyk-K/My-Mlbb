import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * ESLint configuration.
 *
 * On top of Next.js' own rules the project enables the `jsx-a11y`
 * recommended set (task `06-03`), so an accessibility regression fails the
 * lint step instead of waiting for a manual review. The plugin ships with
 * `eslint-config-next`; it is declared in `devDependencies` so the import
 * below does not rely on a hoisted transitive package.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Tailwind's preflight removes the list markers from `ul`/`ol`, which
      // makes VoiceOver (Safari) drop the list semantics. The explicit
      // `role="list"` restores them, so the "redundant role" warning is a
      // false positive for this codebase.
      "jsx-a11y/no-redundant-roles": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
