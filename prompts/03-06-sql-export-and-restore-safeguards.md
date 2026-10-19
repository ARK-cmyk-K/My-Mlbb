# Task 03-06 — SQL Export and Restore Safeguards

Inspect current backup format, schema, and deployment capabilities.

Implement only a safe, documented SQL export path if supported by the actual Supabase/PostgreSQL environment. If database-level export requires CLI or privileged infrastructure unavailable to the app, provide a secure admin workflow or documented CLI procedure rather than pretending a browser endpoint can dump the database safely.

Design restoration as a separately confirmed operation with format/version validation, preview, explicit destructive-action warning, and safeguards against overwriting the live database accidentally. Never execute arbitrary uploaded SQL from the browser. Add tests or verification steps and state the limits of PITR, provider settings, and permissions honestly. Update state.
