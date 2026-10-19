# Admin authentication setup (task 02-01)

The dashboard has exactly one administrator. Whether a signed-in user *is* that
administrator is decided by the database — never by an environment variable or a
user-editable profile field.

## How authorization works

1. `app/lib/db.ts` (`isAdminUser()`) resolves the Supabase session with
   `auth.getUser()`, which re-validates the token with the Auth server. A forged
   or expired cookie is treated as "signed out".
2. It then calls the `public.is_admin()` RPC. That function is
   `SECURITY DEFINER`, pins `search_path = ''`, and returns true **only** when
   the verified `auth.uid()` equals the single row in
   `public.admin_identity` and that row's `admin_user_id` is not NULL.
3. `app/auth/requireAdmin.ts` calls `isAdminUser()` in the `/admin` layout and in
   every dashboard page. Anything that is not proven to be the admin is
   redirected to `/login`.

Everything fails closed: missing configuration, no session, an expired session,
a non-admin user, or any error is denied. `public.admin_identity.admin_user_id`
is NULL by default, so `is_admin()` is false for everyone until the operator
step below is completed.

## 1. Provide Supabase credentials

Copy `.env.example` to `.env.local` and fill in the two public values from
**Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Only the public URL and the public `anon` key are used. The `service_role` key
must **never** be placed in a `NEXT_PUBLIC_*` variable — those are shipped to
the browser. (This app never loads the service-role key at all.)

## 2. Create the admin user

In the Supabase dashboard, go to **Authentication → Users** and add (or invite)
the single administrator account. Confirm the email so the account can sign in.
Note the resulting user's UUID.

## 3. Map the admin identity

Run this once, as the table owner / service role (for example in the dashboard
**SQL Editor**, which runs as the `postgres` owner). `public.admin_identity` is
deliberately unreadable and unwritable by `anon` and `authenticated`, so this
step requires elevated access:

```sql
UPDATE public.admin_identity
   SET admin_user_id = '<auth.users.id of the admin>'
 WHERE id = 1;
```

The mapping is a singleton (`CHECK (id = 1)`); there is no way to configure a
second administrator.

## 4. Verify

1. Visit `/admin` while signed out — you are redirected to `/login`.
2. Sign in with the admin account — you land on `/admin`.
3. Sign in with any other account — `/admin` still redirects to `/login`.
4. Use the **Sign out** control in the dashboard sidebar — the session is
   revoked on the server and you return to `/login`.

## Revoking admin

Either clear the mapping, or delete the user (the foreign key is
`ON DELETE SET NULL`):

```sql
UPDATE public.admin_identity SET admin_user_id = NULL WHERE id = 1;
```

Access is revoked on the next request; no redeploy is needed.

## Optional two-factor authentication (documented path, not implemented here)

Supabase Auth supports TOTP multi-factor authentication, but it is **not** wired
up by this task. If you adopt it later:

1. Enable it in **Authentication → Multi-Factor Auth**.
2. Enrol the admin with `supabase.auth.mfa.enroll()` and present the QR/secret.
3. After a password sign-in, check
   `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`; when
   `currentLevel` is `aal1` but `nextLevel` is `aal2`, send the user to a
   challenge step that calls `supabase.auth.mfa.challenge()` and
   `supabase.auth.mfa.verify()` before allowing `/admin`.

This is a provider setting plus a UI step; the server-side `is_admin()` check
added here is unchanged by it. Do not claim 2FA is active until it is actually
enabled and verified against a project.

## Tests

`npm test` runs the dependency-free unit tests for the authorization policy and
the Supabase configuration parser (unauthenticated access, non-admin access,
expired/invalid session, and open-redirect rejection). The provider round-trip
itself is verified manually with the steps above.
