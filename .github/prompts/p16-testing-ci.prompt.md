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
   - `playwright.config.ts`: `baseURL` from `E2E_BASE_URL` (default `http://localhost:3000`), projects `iphone` (`devices['iPhone 15']`, WebKit), `android` (`devices['Pixel 7']`), `desktop` (`devices['Desktop Chrome']`); trace on first retry; HTML report. For protected previews, untraced global setup bootstraps a secure HttpOnly host-only bypass cookie with `maxRedirects: 0` and rejects external redirects. Never put the long-lived bypass secret in global browser headers or traced contexts.
   - `scripts/seed-e2e.ts` refuses production and requires an explicit test database on a different host from ordinary databases. Verify its noncredential fingerprint against the running app's server-gated sign-in form before writing. Refuse databases containing existing users or themes. Create unique per-run/per-browser accounts (user, approved creator, admin and throwaway deletion user) through Better Auth server API, plus at least 25 initially published fixtures with real rendered assets. Persist an ignored cleanup journal before writes; remove only owned rows/objects and revoke all test accounts in `finally`. Local assets use an isolated file server; actual publishing requires test R2 and remains explicitly pending without it.
   - `tests/e2e/global-setup.ts`: signs in each role through the UI (email + password form shown only when `E2E_TEST_AUTH=1`) and saves `storageState` per role.

3. **Specs** (`tests/e2e/`)
   - `visitor.spec.ts`: Home → Explore (filter + search + infinite scroll) → theme page → desktop: wallpaper download event fired with the right filename; icon export ZIP (desktop project) → Studio from theme: change palette, share link round-trip in a new context.
   - `user.spec.ts`: favourite on a card → visible in Saved → create collection, add, reorder, unlisted link in a new context → save a remix → delete account flow (on a throwaway user).
   - `creator.spec.ts`: create theme (generated wallpaper — skip photo upload in CI), submit, see pending status.
   - `admin.spec.ts`: approve the creator's submission in the review deck with the keyboard → publish from the queue → theme appears on Explore.
   - `rtl.spec.ts`: `/ar` pages have `dir="rtl"`, bottom nav order mirrored, key screenshots stable (`toHaveScreenshot` with masks for images). Browser CI runs on Windows 2025 to match reviewed win32 baselines; Linux still verifies build/native dependencies and database coverage.
   - `a11y.spec.ts`: axe on Home, Explore, theme page, Studio, sign-in, Saved — en and ar — zero serious/critical violations.

4. **GitHub Actions** (`.github/workflows/`)
   - `ci.yml` — on pull requests and pushes to `main`: Node 24, `npm ci`, typecheck/lint/unit checks. A separate protected database job requires Neon configuration and clones a dedicated **empty** CI template with schema-only branching, verifies emptiness, migrates, runs combined unit/integration coverage at unchanged thresholds, then deletes its branch in `always()`. Missing coverage configuration is an attention/failure, never a false full-coverage pass.
   - `e2e.yml` — successful Preview deployments only. Before checking out deployment code or exposing database secrets, trusted base-branch code verifies same repository, Vercel project, deployment SHA/ref and an explicitly configured preview hostname. Protected environment supplies that deployment's actual `E2E_DATABASE_URL`; seeding independently verifies the running app fingerprint. Never guess a Neon branch or seed a production-data clone. Run Playwright and upload a sanitized status/duration report; raw traces, passwords, auth states and attachments stay ephemeral.
   - `db-backup.yml` — weekly (`cron: '23 2 * * 0'`) + manual in protected `db-backup` environment: matching-major `pg_dump` via dedicated `BACKUP_DATABASE_URL_UNPOOLED` → gzip → separate **private** R2 backup bucket using backup-only credentials. Verify r2.dev disabled, no custom domains and enabled 60-day `backups/` lifecycle before dumping. Never use the public assets bucket or upload dumps as Actions artifacts. Document a guarded empty-branch restore rehearsal in `docs/08`.

5. **Scripts**: `test:e2e` runs the isolated build/seed/Playwright/cleanup orchestrator via dotenv and `tsx --conditions=react-server`; `test:e2e:ui` passes `--ui` to that runner. `seed:e2e` invokes the guarded standalone seed/recovery command. Direct `playwright test` requires a prepared private manifest and a running matching isolated app; it never creates fixtures implicitly.

## Acceptance checks

- [x] `npm test -- --coverage` meets thresholds (explicit isolated TEST database; renderer 99.03%, services 95.74%, utils 100%).
- [x] `npm run test:e2e` passes locally against the built standalone app with the e2e seed (77 passed; seven explicit skips for three live-R2 and four desktop-only cases).
- [ ] A PR shows green CI; a preview deployment triggers the e2e workflow and uploads a report.
- [ ] Manual run of `db-backup.yml` produces a file in R2; restoring it into a new Neon branch works (document the commands).

## Finish

Commit: `P16: testing & CI`.
