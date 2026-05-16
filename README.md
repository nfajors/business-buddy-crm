# business-buddy-crm

Small-team CRM. React + Vite + Tailwind on the front end, Supabase today,
ZeroDB after the migration described in epic [#1](../../issues/1).

## Local development

```sh
npm install
cp .env.example .env  # fill in the values
npm run dev
```

Required env vars are documented in `.env.example`. `VITE_*` vars are
inlined by Vite at **build time** — restart `vite` after changing them.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run start` | Serve `dist/` via `serve` (used by Railway) |
| `npm run preview` | Vite's preview server (local QA only) |
| `npm run lint` | ESLint over `src/` |
| `npm test` | Vitest, single run |
| `npm run zerodb:bootstrap` | Create ZeroDB tables in a fresh project (see `scripts/zerodb/README.md`) |

## Deployment (Railway)

The app deploys to Railway as a static SPA. Configuration lives in
`railway.json` and `nixpacks.toml`:

- Nixpacks builds with Node 20, runs `npm ci && npm run build`.
- `serve -s dist` serves the built assets and falls back to `index.html`
  for client-side routes (so deep links work).
- The container listens on `$PORT`, set by Railway.

Set the required `VITE_*` env vars in the Railway service settings for
each environment (staging, production) — see [#12](../../issues/12).
Vite inlines them at build time, so a value change requires a redeploy,
not just a restart.

## Migration: Supabase → ZeroDB

Tracking issue: [#1](../../issues/1). The ZeroDB client lives in
`src/integrations/zerodb/` and ships alongside Supabase until [#9](../../issues/9)
removes the legacy integration.
