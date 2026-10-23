---
description: 'P16 · Testing & CI — coverage targets, Playwright e2e per role, accessibility checks, GitHub Actions, backups'
agent: 'agent'
---

# P16 · Testing & CI

Read first: [quality checklists](../../docs/08-quality-checklists.md) · [install flows §8](../../docs/06-install-flows.md) · [architecture §8 (test auth), §13](../../docs/01-architecture.md)

## Goal

Every push is type-checked, linted and unit-tested; every preview deployment is smoke-tested end to end for all four roles in English and Arabic; production data is backed up weekly.

## Tasks

1. **Unit/integration coverage** — `vitest.config.ts` coverage thresholds: `lib/render/**` ≥ 80% lines, `server/services/**` ≥ 70%, `lib/utils/**` ≥ 90%. Fill gaps found by the report (no snapshot-only tests for logic). Integration tests run when `TEST_DATABASE_URL` is set and clean up after themselves (or run inside a dedicated Neon branch that is discarded).

2. **E2E setup**
   - `npm i -D @axe-core/playwright` (accessibility assertions — justified by WCAG target).
   - `playwright.config.ts`: `baseURL` from `E2E_BASE_URL` (default `http://localhost:3000`), projects `iphone` (`devices['iPhone 15']`, WebKit), `android` (`devices['Pixel 7']`), `desktop` (`devices['Desktop Chrome']`); `extraHTTPHeaders` with `x-vercel-protection-bypass` when `VERCEL_AUTOMATION_BYPASS_SECRET` is set; trace on first retry; HTML report.
   - `scripts/seed-e2e.ts` (refuses production): creates `e2e-user@`, `e2e-creator@` (approved creator profile), `e2e-admin@` (admin role) via Better Auth server API with email+password (requires `E2E_TEST_AUTH=1`), plus one published theme fixture.
   - `tests/e2e/global-setup.ts`: signs in each role through the UI (email + password form shown only when `E2E_TEST_AUTH=1`) and saves `storageState` per role.

3. **Specs** (`tests/e2e/`)
   - `visitor.spec.ts`: Home → Explore (filter + search + infinite scroll) → theme page → desktop: wallpaper download event fired with the right filename; icon export ZIP (desktop project) → Studio from theme: change palette, share link round-trip in a new context.
   - `user.spec.ts`: favourite on a card → visible in Saved → create collection, add, reorder, unlisted link in a new context → save a remix → delete account flow (on a throwaway user).
   - `creator.spec.ts`: create theme (generated wallpaper — skip photo upload in CI), submit, see pending status.
   - `admin.spec.ts`: approve the creator's submission in the review deck with the keyboard → publish from the queue → theme appears on Explore.
   - `rtl.spec.ts`: `/ar` pages have `dir="rtl"`, bottom nav order mirrored, key screenshots stable (`toHaveScreenshot` with masks for images).
   - `a11y.spec.ts`: axe on Home, Explore, theme page, Studio, sign-in, Saved — en and ar — zero serious/critical violations.

4. **GitHub Actions** (`.github/workflows/`)
   - `ci.yml` — on pull requests and pushes to `main`: checkout, `actions/setup-node` (Node 24, npm cache), `npm ci`, `SKIP_ENV_VALIDATION=1 npm run typecheck`, `npm run lint`, `npm test -- --coverage`. If `NEON_API_KEY` + `NEON_PROJECT_ID` secrets exist: create a branch with `neondatabase/create-branch-action` (latest major), run migrations + integration tests against it, delete the branch in an `always()` step.
   - `e2e.yml` — on `deployment_status` where state is `success` and environment is Preview: run Playwright against `github.event.deployment_status.target_url`; upload the report artifact. (Preview env needs `E2E_TEST_AUTH=1`; production never.)
   - `db-backup.yml` — weekly (`cron: '23 2 * * 0'`) + manual: `pg_dump` (Postgres client matching the Neon major version) of production via `DATABASE_URL_UNPOOLED` secret → gzip → upload to R2 `backups/vibeset-YYYY-MM-DD.sql.gz` using the AWS CLI with the R2 endpoint. Add an R2 lifecycle rule deleting `backups/` after 60 days. Document restore steps in `docs/08`.

5. **Scripts**: `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"`, `"seed:e2e": "dotenv -e .env.local -- tsx --conditions=react-server scripts/seed-e2e.ts"`.

## Acceptance checks

- [ ] `npm test -- --coverage` meets thresholds.
- [ ] `npm run test:e2e` passes locally against `npm run build && npm start` with the e2e seed.
- [ ] A PR shows green CI; a preview deployment triggers the e2e workflow and uploads a report.
- [ ] Manual run of `db-backup.yml` produces a file in R2; restoring it into a new Neon branch works (document the commands).

## Finish

Commit: `P16: testing & CI`.
