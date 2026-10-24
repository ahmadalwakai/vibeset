# Vibeset — Quality Checklists

Run the relevant list before every commit that closes a phase (`/review` prompt automates most of it).

---

## 1. Definition of Done (every change)

- [ ] `npm run typecheck`, `npm run lint`, `npm test` pass with zero errors and no new warnings.
- [ ] `npm run build` passes (Cache Components errors surface only at build).
- [ ] No `any`, no `@ts-ignore` / `@ts-expect-error` without a linked reason, no `console.log`.
- [ ] Every new input validated with Zod; every mutation passes through a guard and a service.
- [ ] Loading (skeleton), empty, error and success states exist for every async UI.
- [ ] Strings in `messages/en.json` **and** `messages/ar.json`; checked visually in RTL.
- [ ] Mobile (360 px) checked first, then tablet and desktop; light and dark mode.
- [ ] Cache tags invalidated per `docs/03` §7; no per-user data in shared caches.
- [ ] Docs updated if a decision, contract, route or DTO changed.
- [ ] Commit message: `P0X: <what>` (one phase or one feature per commit).

## 2. Cross-role regression (after any change to services, actions, DTOs or queries)

**Visitor**: Home renders · Explore filters + infinite scroll + search · theme page · wallpaper download · icon export (≥ 10 icons) · Studio remix + share link · report form · favourites persist locally.

**User**: sign in (Google, magic link) · favourite toggles and merges local favourites · collections CRUD + reorder + unlisted link · save/update/delete remix · account export · delete account · sign out.

**Creator**: apply → admin approves → creator area unlocks · upload photo → palette suggestions → create theme → submit → admin rejects with reason → edit → resubmit → admin publishes → appears on profile and Explore · stats show.

**Admin**: dashboard KPIs load · generator creates drafts · review deck shortcuts · publish queue renders and uploads · bulk actions · collections, tags, apps CRUD · reports resolve (dismiss / archive / ban) · role change protections (cannot demote self, last admin) · audit entries written.

**Public API**: `/api/v1/themes` (each sort, filters, cursor), `/api/v1/themes/[slug]` (published only), collections, tags, apps — additive contract unchanged.

## 3. Security

- [ ] Guards in every Server Action, Route Handler and admin/creator query (not only in layouts/proxy).
- [ ] Ownership verified in services; ids from the client never trusted.
- [ ] Rate limits on public writes (`track`, `report`) and creator uploads.
- [ ] No raw IPs stored; no secrets in client bundles (`rg "process.env" app components hooks lib/client`).
- [ ] Uploads: type/size/dimension/aspect checks, metadata stripped, incoming objects expire.
- [ ] Rendered SVG only from validated specs; never `dangerouslySetInnerHTML` with SVG — use `<img src="data:image/svg+xml,…">`.
- [ ] CSP and security headers present (`curl -I`).
- [ ] `E2E_TEST_AUTH` impossible in production (env validation).

## 4. Performance budgets (mobile, p75)

| Metric | Budget |
|---|---|
| LCP (Home, Explore, Theme page) | < 2.5 s on 4G |
| INP | < 200 ms |
| CLS | < 0.05 |
| JS on Home (first load, gz) | < 180 KB |
| Thumbnail weight | ≤ 80 KB |
| Icon export, 24 icons, mid-range phone | < 6 s |
| Studio preview update after a control change | < 50 ms |

Heavy modules (`lib/render`, `fflate`, `lz-string`, `culori`, Recharts) load only where used (`next/dynamic` / `import()`).

## 5. Accessibility

- [ ] Keyboard-only pass on Home, Explore, Theme page, Studio, sheets, admin review deck.
- [ ] Screen reader labels for icon buttons, progress announcements, form errors.
- [ ] Contrast checked in light and dark; focus ring visible on every interactive element.
- [ ] Reduced motion and reduced transparency respected.

## 6. Release checklist (production)

- [ ] Migrations reviewed; expand/contract respected; Neon branch tested by the preview deployment.
- [ ] Env vars set in Vercel (Production + Preview) — compare against `.env.example`.
- [ ] Neon on the **Launch** plan (Free suspends compute when CU-hours run out).
- [ ] R2: CORS, custom domain, lifecycle rule for `uploads/incoming/` verified.
- [ ] Google OAuth redirect URIs and Resend domain (SPF/DKIM) verified.
- [ ] Vercel Cron configured and `CRON_SECRET` set; first run checked in logs.
- [ ] Sitemap and robots reachable; OG images render in a social debugger.
- [ ] Manual device matrix from `docs/06` §8 passed.
- [ ] Legal pages (terms, privacy, copyright) published in both languages.
- [ ] Qualified legal review complete; public operator/contact, creator grant, retained-publication removal process, provider/transfer arrangements and retention practices verified.
- [ ] Privacy control: views start off with no marker access/request; explicit enable survives reload; disable stops later views; corrupt/blocked storage fails safely and the current-tab fallback is explained. Actual action counters remain disclosed.
- [ ] Backups: Neon restore window known; weekly `pg_dump` workflow green.

## 7. Every major iOS release (September)

- [ ] Re-verify Shortcuts step labels and re-record wizard clips.
- [ ] Re-test wallpaper "Use as Wallpaper" flow and Photos widget album selection.
- [ ] Re-test Web Share batch size; adjust `IOS_SHARE_BATCH`.

## 8. Automated test runs (P16)

`npm run test:coverage` includes unit tests and, with an explicit isolated `TEST_DATABASE_URL`, real integration tests. The unchanged line gates are renderer 80%, services 70%, utils 90%; unimported files in these scopes count. Integration preflight runs before test-module imports and rejects production or an ordinary database host, including pooled/direct aliases. A credential-free unit run alone does not meet the services gate.

For local browser checks, keep the ordinary development URLs and a distinct `TEST_DATABASE_URL` in `.env.local`; never enable test auth on a production deployment. Install the test browsers, then run:

```sh
npx playwright install chromium webkit
npm run test:e2e
# Faster targeted iteration after a matching E2E build:
npm run test:e2e -- --project desktop --skip-build
```

The runner builds a production-mode standalone app at `http://localhost:3000` and serves actual generated assets at `http://localhost:3001`. Override the explicit origins if those ports are occupied. It binds only to localhost, verifies test auth and the app's database fingerprint, verifies cache-refresh authorization, and refuses any database with existing users or themes before seeding. A held advisory lock serializes the clean-database check. Twelve disposable accounts isolate roles and browser projects; twenty-five rendered fixtures exercise cursor loading. These initial published test fixtures do not exercise the publication pipeline. Real R2 publication stays explicitly pending in local mode; native share pickers and physical device checks remain manual.

Test passwords/auth states and an atomic cleanup journal stay under ignored `.tmp/e2e/<run UUID>/`. The runner stops browser work, locks the owned users before capturing their themes, and atomically saves the complete storage cleanup plan before deleting any database rows. It removes only owned content/catalog rows, revokes accounts/sessions, deletes fixture assets after confirmed database commit, refreshes caches and stops its own servers in `finally`. If storage deletion fails after commit, the retained journal also recovers themes created through the browser after their owner rows are gone. Failed or uncertain database commits never trigger storage deletion. Existing and test-created limiter records, including user-scoped and anonymous activity, remain for normal daily expiration. Record those separately from content cleanup. A matching build ID and compiled public origins are required for `--skip-build`.

Each direct child is observed from spawn time. SIGINT/SIGTERM requests termination of active work, and cancellation checks after asynchronous phases prevent a cancelled build, preflight or seed from starting a later browser phase. An active fixture mutation reaches its recoverable boundary before cleanup. The runner confirms work-child exit, with bounded SIGTERM/SIGKILL escalation, before deleting fixture data. If exit cannot be confirmed, it preserves the journal/fixtures, skips cache mutation and fails; stop remaining work before journal recovery. Its local app remains available for confirmed cleanup/cache refresh and stops afterward with the loopback asset server.

Browser manifests must have the exact `.tmp/e2e/<UUID>/manifest.json` layout. Canonical checks reject symlinks/junctions at the root, run, manifest, auth directory or existing state file before auth writes or recursive teardown. Missing auth files/directories are allowed inside an otherwise validated run; filesystem access errors fail visibly.

RTL Studio screenshots open a fixed published fixture rather than the intentionally random blank editor. Accessibility checks wait for entrance fades to finish before measuring contrast; rules and thresholds are unchanged. Local Playwright runs retain failure traces, while CI traces only the first retry. Keep raw traces private: they may contain disposable account sessions. Creator-save diagnostics contain only request counts/statuses, schema issue paths and field equality/length/invalid flags, excluding headers and raw bodies. CI uploads only the sanitized summary described below.

Legal E2E checks cover all six EN/AR pages at 360 px, one heading hierarchy, approved public identity/mailto, localized metadata/alternates, no horizontal overflow, zero Arabic heading tracking, and unchanged light/dark serious/critical accessibility rules after fonts and the Privacy control hydrate. WebKit may serialize zero tracking as `normal`; both `normal` and `0px` are accepted, while negative values are rejected. Private screenshots support visual review. Unknown documents must show the localized not-found UI and noindex; streamed responses can already have HTTP 200 headers. A real choice flow verifies no automatic view/marker by default, a 204 view response after visible opt-in, persistence across reload, and no subsequent theme view after withdrawal. Unit tests separately cover denied/corrupt storage, cross-tab freshness, deduplication and abort behavior.

Browser workers wait eleven seconds before each device project, including the first after sign-in setup. Better Auth's installed default session rule allows 100 requests per IP/path and resets after ten seconds of inactivity; continuous automated contexts otherwise share one accumulating bucket. This quiet period respects that unchanged rule without deleting limiter records or disguising request identities. Session errors must still show an error/retry state rather than enabling guest-only behavior.

Session-error regressions cover failed initial lookups separately from confirmed anonymous sessions: account, creator, admin queue and save/collection surfaces must offer retry, while retained valid sessions keep established forms mounted. Favorites must mask unknown identity and reject toggles until a fresh settled session matches the store; retry must inspect the session atom even when `refetch()` resolves without throwing. Random Studio accessibility scans remain enabled to catch low-contrast palette combinations; widget placeholder text uses ink rather than decorative accent, and outline widgets match the renderer's opaque palette-background surface.

If a process is forcibly terminated, preserve its private journal and run recovery against the same isolated database:

```sh
npm run seed:e2e -- --cleanup .tmp/e2e/RUN_UUID/journal.json
```

Recovery retains production/database/path/ownership guards and can run while the app is offline; refresh app caches after restart. For a remote run, also pass `--mode remote`, the exact allowed base/CDN origins and dedicated preview storage configuration described below. Do not upload manifests, auth states, raw traces or journals.


### P16 CI, preview identity and private backups

The workflows use Node 24; build/coverage and backups use Ubuntu 24.04, while browser E2E uses Windows 2025 to match the reviewed win32 screenshot baselines. Actions are pinned to reviewed release commits: `actions/checkout` 7.0.1, `actions/setup-node` 7.1.0, `actions/upload-artifact` 7.0.2, Neon create-branch 6.3.1 and delete-branch 3.2.1. Update these pins deliberately. Workflow syntax was checked with checksum-verified actionlint 1.7.12; preparation here did not dispatch workflows or provision remote resources.

Configure GitHub protected environments before enabling secret-bearing jobs. `ci-database` needs required review of the exact same-repository PR commit. Fork PRs receive credential-free checks, but the full coverage job explicitly fails/needs attention rather than representing skipped integration tests as a passing 70% service gate. Never use `pull_request_target` to run contributor code with these credentials.

| Environment | Secrets | Configuration variables |
| --- | --- | --- |
| `ci-database` | `NEON_API_KEY` | `NEON_PROJECT_ID`, `NEON_CI_PARENT_BRANCH_ID`; optional `NEON_DATABASE_NAME`/`NEON_DATABASE_ROLE` |
| `e2e-preview` | `VERCEL_TOKEN`, `E2E_DATABASE_URL`, optional `E2E_DATABASE_URL_UNPOOLED`, `E2E_INTERNAL_API_SECRET`, `E2E_R2_ACCESS_KEY_ID`, `E2E_R2_SECRET_ACCESS_KEY`, optional `VERCEL_AUTOMATION_BYPASS_SECRET` | `VERCEL_PROJECT_ID`, optional `VERCEL_ORG_ID`, exact `E2E_PREVIEW_HOSTNAME`, `E2E_TRUSTED_BRANCHES` JSON array, `E2E_ASSET_ORIGIN`, `E2E_R2_ACCOUNT_ID`, `E2E_R2_BUCKET` |
| `db-backup` | `BACKUP_DATABASE_URL_UNPOOLED`, `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`, `BACKUP_CF_API_TOKEN` | `BACKUP_R2_ACCOUNT_ID`, `BACKUP_R2_BUCKET`, `R2_ASSETS_BUCKET`, `BACKUP_PG_MAJOR` |

The CI parent must be a dedicated **empty** nonproduction template containing no application tables or migration history. A schema-only branch copied from an already migrated database contains the schema but loses migration rows; rerunning all migrations against that clone would fail. CI creates a uniquely named schema-only child, verifies its empty state, applies migrations, then runs combined unit/live integration coverage with the unchanged 80% renderer / 70% services / 90% utils thresholds. Ordinary `DATABASE_URL` variables are not configured in the coverage step; each integration fixture verifies the distinct `TEST_DATABASE_URL` before rebinding runtime modules. The child is deleted in `always()` and also expires after one day as a cleanup fallback. Missing Neon credentials or an unsuitable parent fails visibly.

Preview E2E does not guess a Neon branch name or retrieve Vercel environment secrets. A protected `e2e-preview` job first checks the successful Preview webhook's repository and exact configured hostname using trusted default-branch verification code. It verifies Vercel's authoritative project, deployment URL, READY state, preview target, commit SHA and GitHub source repository, then checks that the deployment commit belongs to an explicitly allowed same-repository branch's current history. Only after that does it check out deployment code and supply database/storage credentials. `E2E_DATABASE_URL` must refer to **that deployment's actual database**; stale/static unrelated credentials fail the sign-in fingerprint check before any fixture writes. `E2E_INTERNAL_API_SECRET` must match that preview's existing revalidation endpoint. Test R2 credentials must be scoped to the explicitly allowed nonproduction bucket and test CDN origin. Missing configuration fails browser coverage; it is never silently skipped as green. No privileged HTTP seeding endpoint is added.

The tested Preview must be built with `NEXT_PUBLIC_SITE_URL` equal to that exact allowed preview origin, and `NEXT_PUBLIC_CDN_URL` equal to the allowed test asset origin. Legal metadata checks use these trusted expected origins. Setting variables in the remote test runner cannot reconfigure an already built deployment; a preview intentionally canonicalizing to production needs its own explicitly designed test contract before running this suite.

Playwright writes raw JSON/HTML/traces only to the ephemeral runner. `scripts/ci/sanitize-e2e-report.ts` produces `.tmp/e2e-summary/index.html` and `summary.json` by whitelisting test file/title/project/status/duration/counts. It excludes authentication state, attachments, errors, console payloads and environment/config data. Only this sanitized directory is uploaded for seven days. Raw authentication files, traces, journals, database dumps and credentials must never be Actions artifacts.

#### Private weekly backup

`db-backup.yml` runs at `02:23 UTC` on Sundays and supports manual dispatch from `main`. Restrict its environment to `main`. If required reviewers are enabled, scheduled jobs also wait for review; account for that when monitoring the weekly backup. Use a separate private R2 bucket with **no custom domains and r2.dev disabled**, separate bucket-scoped object read/write credentials, and a Cloudflare API token allowed to read bucket configuration. The application must never receive backup credentials. A public assets bucket is unsuitable for database backups, even under a `backups/` prefix.

Before connecting to production, preflight reads the Cloudflare managed-domain, custom-domain and lifecycle APIs. It rejects public access, any attached custom domain, a bucket equal to `R2_ASSETS_BUCKET`, and ambiguous/missing retention. Configure an enabled age rule covering `backups/` that deletes objects after exactly `60 × 86400` seconds; overlapping deletion rules with other retention periods are rejected. Cloudflare lifecycle deletion is asynchronous and generally follows expiration rather than occurring at an exact second. The workflow verifies the policy again immediately before upload.

Use a direct/unpooled Neon URL and the production server's PostgreSQL major (14–18 currently supported by the helper). The workflow installs that client major from the PostgreSQL apt repository and compares `SHOW server_version_num`, configured major and `pg_dump --version` before dumping. Passwords travel through child process environment variables, never command-line connection URLs or logs. Use a least-privilege database backup role with the read/lock access required by `pg_dump`, not application write permissions.

After `npm ci` with trusted code and the protected environment configured:

```sh
npx tsx scripts/db-backup.ts preflight
npx tsx scripts/db-backup.ts backup
```

The helper creates a mode-0600 gzip archive in a private temporary directory, runs `pg_dump --no-owner --no-acl --format=plain`, checks gzip integrity, computes SHA-256, and uploads with the AWS CLI to a unique dated key such as `backups/vibeset-2026-10-25-123456-1.sql.gz`. Run/attempt suffixes preserve earlier same-day backups. It verifies the remote object's length and SHA-256 metadata and reports only object key, size and digest. The archive is deleted locally in `finally`. No backup is uploaded without complete dedicated credentials and successful privacy checks. Never upload dumps to GitHub artifacts.

#### Restore rehearsal into an isolated branch

The helper does not create or destroy Neon branches. Create a new empty nondefault, unprotected test branch with an empty target database, separate from the backup source endpoint. Supply `RESTORE_DATABASE_URL`, `RESTORE_NEON_BRANCH_ID`, `NEON_PROJECT_ID`, and a project-scoped `NEON_API_KEY` with permission to read branch/endpoint identities, in addition to the backup configuration. These values stay in the operator's secure shell/secret store; never paste URLs or passwords into chat or command arguments.

Download the chosen archive from the private bucket using the dedicated scoped object credentials, save it in a private local directory, and obtain its expected SHA-256 from the successful backup record/metadata. With the matching PostgreSQL client on PATH:

```sh
npx tsx scripts/db-backup.ts restore --file /secure/vibeset-backup.sql.gz --sha256 "$BACKUP_SHA256"
```

Before database writes, the restore helper verifies the checksum and gzip integrity, reads Neon branch/endpoint identities, rejects the source endpoint/default/protected/root branches or endpoint mismatches, checks the target PostgreSQL major, and refuses any existing user tables. It restores through `psql --no-psqlrc --single-transaction --set=ON_ERROR_STOP=1 --file=-`, then verifies expected application/auth/migration tables. Complete the rehearsal by checking representative row counts and application reads against that isolated branch; record the archive key/digest and outcome, then discard the branch through the Neon console. A prepared workflow or passing unit safety tests do not prove that a real backup/restore has run. No real production dump, R2 upload or restore was executed during this implementation.

Primary references: [Neon create branch action](https://github.com/neondatabase/create-branch-action), [Neon delete action](https://github.com/neondatabase/delete-branch-action), [Vercel deployment identity API](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url), [Cloudflare bucket domains](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/), [R2 lifecycle policy](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).
