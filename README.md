# RETRADE

RETRADE is a static web application backed by Supabase.

## Repository layout

- `index.html`, `app.js`, `app.css`, `accounting.js`, `reports.js` — production application
- `supabase/migrations/` — append-only production database history
- `docs/` — development guidance and completed audit evidence
- `archive/retired-runtime/` — inactive runtime patches and their replacement map
- `tests/` — isolated browser regressions with synthetic auth/data
- `archive/legacy-site/` — retained pre-current site snapshot
- `.github/workflows/ci.yml` — active repository checks
- `.github/archive/` — completed one-off workflows and patch utilities, retained for traceability

Generated exports, database backups, credentials and local business data do not belong in this repository.

## Development checks

See [runtime ownership](docs/RUNTIME_MAP.md) and the [startup audit](docs/STARTUP_AND_MOTION_AUDIT.md).

Run `npm ci`, `npx playwright install chromium`, then `npm test`. Browser tests intercept all requests and use synthetic data; they do not connect to production Supabase. They cover desktop/mobile layouts, reduced motion, navigation, responsive charts, sign-in races and slow startup. GitHub CI also runs syntax and production invariants. Physical iOS/Android and authenticated live testing remain necessary for judging frame pacing.
