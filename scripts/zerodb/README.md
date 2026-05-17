# ZeroDB scripts

One-off operator scripts for the ZeroDB backend. These are not run during
the app build — they're invoked manually against a project.

## bootstrap.ts

Creates the 6 tables (`contacts`, `notes`, `activities`, `tasks`, `profiles`,
`user_roles`) in a fresh ZeroDB project. Safe to re-run: tables that already
exist are skipped.

### Prerequisites

- Node 20.6+ (for native `--env-file` support).
- A ZeroDB project + scoped API key.
- An admin user registered in that project, with credentials.

### Env vars

Set in `.env` (loaded via `--env-file`):

| Var | Purpose |
| --- | --- |
| `VITE_ZERODB_API_URL` | Base URL, e.g. `https://api.ainative.studio/v1` |
| `VITE_ZERODB_PROJECT_ID` | Target project |
| `VITE_ZERODB_API_KEY` | Scoped API key |
| `ZERODB_ADMIN_EMAIL` | Admin login for the bootstrap call |
| `ZERODB_ADMIN_PASSWORD` | Admin password (do not commit) |

The `VITE_*` vars are shared with the app (build-time inlined by Vite); the
admin creds are bootstrap-only and should never ship to a client bundle.

### Run

```sh
node --env-file=.env --import tsx scripts/zerodb/bootstrap.ts
```

Expected output:

```
[bootstrap] api=https://api.ainative.studio/v1 project=<id>
[bootstrap] contacts: created
[bootstrap] notes: created
...
[bootstrap] done.
```

### Rerun safety

`createTable` treats HTTP 409 or "already exists" responses as success. If
you change a field spec, you'll need to drop the table (via the ZeroDB
dashboard) and re-run, or add a separate migration script — the bootstrap
script does not diff existing tables.

### Caveats

The exact create-table endpoint shape on ZeroDB has not been verified
against live docs. Endpoint paths and the field-spec format live in
`createTable` and `TABLES` in `bootstrap.ts` so they can be adjusted in one
place once confirmed during #4 testing.
