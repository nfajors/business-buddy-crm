# Supabase backend (Winning.Careers CRM)

This folder holds the database migrations, edge functions, and config that
power the CRM's Lovable Cloud backend.

## Layout

- `migrations/` — versioned schema changes. Auto-applied in order. Never edit
  a migration after it has been applied; add a new one instead.
- `functions/` — edge functions (Deno). Auto-deployed on push.
- `scripts/` — one-off SQL or admin scripts that are NOT auto-applied. Run
  manually via the Supabase SQL editor or `psql` when needed.
- `config.toml` — project + per-function settings.

## Migration policy

- Schema changes only (tables, columns, indexes, RLS, triggers, functions).
- Avoid destructive data operations (`delete from`, `truncate`, ownership
  rewrites) in migrations — put those in `scripts/` so replays on a fresh
  database don't wipe real data.
- Keep RLS policies tight: prefer owner / creator / admin scoping. Permissive
  `using (true)` policies require a written justification in the migration.
- After any migration that changes the public schema, regenerate
  `src/integrations/supabase/types.ts` (Lovable does this automatically).

## Auth allowlist

New signups are gated by `public.handle_new_user()` to the four authorized
staff emails. Public signup is also disabled at the Auth provider level — new
staff must be invited by an admin.