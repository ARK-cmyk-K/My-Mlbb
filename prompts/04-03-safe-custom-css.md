# Task 04-03 — Safe Custom CSS Controls

Inspect the appearance pipeline and threat model before implementing.

Provide a constrained custom CSS field only if it can be applied without introducing script execution or breaking security boundaries. Parse and validate CSS with an appropriate maintained parser if dependency policy permits; reject imports, unsafe URL schemes, and rules that target or obscure critical admin/security UI. Scope custom styles to the public showcase, never the admin console. Apply only published CSS publicly and show clear validation errors.

If safe validation cannot be reliably achieved, implement a limited allowlisted styling interface instead and document why. Never claim arbitrary CSS is fully safe. Add tests and update state.
