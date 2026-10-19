# Task 02-04 — Supabase Storage Buckets and Policies

Read existing storage code and migrations first. Implement documented public-asset and private-draft asset bucket configuration consistent with the approved architecture. Public reads must expose only published assets; draft uploads and objects must remain private and admin-controlled.

Use restrictive object naming, content type and size validation, safe upload authorization, and storage policies tied to the verified admin and publication workflow. Avoid trusting file extensions alone. Ensure media metadata foreign keys and deletion behavior protect referenced assets. Do not make the draft bucket public.

Acceptance criteria: migration/configuration and upload rules are documented, access checks cover anonymous/admin scenarios, and live provider changes are not claimed unless actually applied. Update state.
