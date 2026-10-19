# Task 06-04 — Security Review and Automated Tests

Perform a focused security review of authentication, server actions/routes, RLS, grants, RPC functions, storage policies, draft preview, publishing, imports, backups, custom styling, and public metadata.

Add or improve tests for anonymous draft denial, non-admin write denial, admin access, input validation, upload/import abuse cases, and published-only search. Search for leaked secrets, service-role usage in client bundles, unsafe `SECURITY DEFINER` functions, overly broad policies, open redirects, and accidental draft caching. Fix confirmed issues and document unresolved risks with severity.

Do not label the site secure solely because tests pass. Update state with concrete evidence and remaining risks.
