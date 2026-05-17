# Per-user CRM accounts

Tracks: [#16](https://github.com/nfajors/business-buddy-crm/issues/16)

## What changed

Before: a single shared password (`VITE_CRM_PASSWORD`) in Railway env vars, gated by an email allowlist. All staff typed the same secret.

After: each staff member has their own ZeroDB user account with their own password. The allowlist remains as defense-in-depth.

## Architecture

| Concern | Where it lives |
|---|---|
| Authentication | `zerodb.auth.login(email, password)` → POST `/public/auth/login-json` |
| Session token | Real ZeroDB JWT (replaces the prior API-key-as-token) |
| User identity | `session.user.id` is forced to the **email**, not the ZeroDB UUID, so existing `created_by` / `owner_id` rows keep working without a backfill |
| Allowlist | `src/lib/auth-allowlist.ts` — short-circuits sign-in before hitting the auth endpoint |
| Force-rotate flag | `profiles.must_change_password` — set true by provisioning + admin reset, cleared on successful self-serve change |
| Self-serve change | `POST /public/auth/change-password` (endpoint not yet confirmed; UI shows admin-mediated fallback on 404/405) |
| Admin reset | `npm run zerodb:set-password -- <email> <new>` |

## Provisioning

One-time setup for the 4 staff users:

```bash
# Set the temp password in your shell (not in .env, not in Railway)
export ZERODB_TEMP_PASSWORD='ChooseSomethingStrong1!'

# Make sure .env has VITE_ZERODB_API_URL, VITE_ZERODB_PROJECT_ID, VITE_ZERODB_API_KEY
npm run zerodb:provision-users
```

The script:

1. Registers each of the 4 staff emails via ZeroDB's `/public/auth/register`. Idempotent — if a user already exists, registration is skipped.
2. Upserts the `profiles` row with `display_name` and `must_change_password: true`.

Share the temp password with each user **out-of-band** (Signal, 1Password, etc — never in plaintext email or chat).

On their first sign-in, each user is automatically redirected to `/change-password` and gated there until they rotate the password.

## Admin password reset

If a user loses their password:

```bash
npm run zerodb:set-password -- alice@example.com 'NewTempPass1!'
```

This:

1. Tries `POST /public/auth/admin/set-password`, then `POST /public/auth/reset-password` as a fallback (ZeroDB's exact admin reset path isn't documented; both are tried).
2. Sets `profiles.must_change_password = true` so the user is forced to rotate again after signing in.

If both candidate endpoints reject the request, the script reports the response body so the admin can adjust the script for the real endpoint.

## Operational runbook

### Adding a new staff user

1. Add their email + display name to the `STAFF` array in `scripts/zerodb/provision-users.ts`.
2. Add the email to `ALLOWED_EMAILS` in `src/lib/auth-allowlist.ts` (and if they should be admin, to `ADMIN_EMAILS`).
3. Run `npm run zerodb:provision-users`. Existing users are skipped; only the new one is created.
4. Share the temp password out-of-band.

### Removing a staff user

1. Remove their email from `ALLOWED_EMAILS` in `src/lib/auth-allowlist.ts`. The next sign-in attempt will fail at the allowlist check before hitting ZeroDB.
2. (Optional) Set a random throwaway password via `npm run zerodb:set-password` so even a leaked credential can't sign in.
3. The user's existing `created_by` / `owner_id` records stay intact, but the account itself is locked out.

### Decommissioning the old shared password

1. Confirm all 4 staff have rotated to their own passwords (each user's `profiles.must_change_password` is `false`).
2. Remove `VITE_CRM_PASSWORD` from Railway.
3. Remove the deprecated entry from `.env.example`.

## Known limitations / follow-ups

- **No MFA.** Out of scope for #16. Add as a follow-up issue once the auth migration is stable.
- **Self-serve reset depends on a ZeroDB endpoint we haven't confirmed.** The UI's change-password page will surface a "contact admin" fallback if the endpoint 404s; until then, password loss = admin runs the set-password script.
- **No admin UI for user management.** CLI scripts are enough for 4 users; revisit if the team grows.
- **No backfill for existing data.** `created_by` / `owner_id` stay as emails. If we ever switch to ZeroDB UUIDs as the user ID we'll need a one-shot migration.
