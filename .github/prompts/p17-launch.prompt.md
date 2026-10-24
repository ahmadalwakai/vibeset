---
description: 'P17 · Launch — Vercel/Neon/R2/OAuth/email production setup, legal pages, content seeding, monitoring, release checklist'
agent: 'agent'
---

# P17 · Launch

Read first: [quality checklists §6](../../docs/08-quality-checklists.md) · [architecture §13–§14](../../docs/01-architecture.md) · [content pipeline §11, §14](../../docs/05-content-pipeline.md) · [product §11](../../docs/00-product.md)

## Goal

Vibeset is live on its domain with ≥ 300 reviewed themes, legal pages in both languages, monitoring, backups and a repeatable weekly content routine.

## Tasks (code)

1. **Deployment build command**: add `"vercel-build": "npm run chakra:typegen && drizzle-kit migrate && next build"` while retaining `"build": "next build"` for credential-free builds. Set `vercel.json` `buildCommand` to `npm run vercel-build` and `regions` to `["lhr1"]`, preserving the daily cron. Use deployment-injected database variables without dotenv; `DATABASE_URL_UNPOOLED` must target the verified deployment database (the isolated Neon branch on previews, the explicitly selected production branch on production). Confirm London Neon/Vercel region alignment before deployment. Review migrations and use expand/contract changes only; a later build failure does not undo an applied migration. Enforce one migration runner per database, including manual scripts/repeated builds, and recheck the ledger after failed/cancelled builds before retrying. Rehearse only against an explicitly verified isolated test branch before any production migration.

2. **Legal pages** — `app/[locale]/(site)/legal/[doc]/page.tsx` for `terms`, `privacy`, `copyright`; content as typed TSX per locale in `content/legal/{doc}.{en,ar}.tsx` styled with Chakra's `prose` snippet (`npx @chakra-ui/cli snippet add prose`). Cover:
   - **Terms**: free personal-use licence for themes and a non-exclusive creator content licence grant. The owner chose to retain published designs after account deletion, with a separate removal request process: the account service deletes private drafts/profile and removes account attribution, but retains published designs and referenced photos. Describe that choice accurately without promising automatic published-content erasure. Finalize the grant, monitored removal contact and withdrawal/takedown handling with qualified legal review before publication. Cover prohibited content (brands, celebrities, copyrighted characters, adult/hateful content), no warranty and UK law.
   - **Privacy** (UK GDPR + ICO Children's Code): data collected (account email/name/avatar, locale, favourites, collections, remixes, creator profile, uploads, salted IP hashes for rate limiting), no tracking cookies/ads/profiling, processors (Vercel, Neon, Cloudflare, Resend, Google for sign-in), retention, export/delete self-service, contact. Explain the same published-content deletion behavior, best-effort removal of unused stored files, and configured backup/restore retention without promising immediate removal from existing backups.
   - **Copyright & credits**: Phosphor Icons (MIT), font licences (OFL) with family names, how to report infringement.
   - Footer links + sitemap entries. Add a visible note in your summary: these texts need review by a qualified person before launch.

3. **Sentry (optional)** — `npx @sentry/wizard@latest -i nextjs`; DSN in env; `sendDefaultPii: false`; scrub emails and IPs in `beforeSend`; source maps upload in Vercel builds only.

4. **Setup clips** — after recording the iOS wizard clips (task below), upload them to R2 `setup/ios/{step}.mp4` and list them in `content/setup-media.ts`.

## Tasks (operations — guide me through these step by step and verify each)

1. **Vercel**: import the repo; Node 24; function region matching the Neon region (`docs/01` §13); build command `npm run vercel-build`; env vars for Production and Preview from `.env.example` (Preview uses the dev R2 bucket and `E2E_TEST_AUTH=1`; Production never sets it); Neon integration (creates a branch per preview, injects `DATABASE_URL`/`DATABASE_URL_UNPOOLED`); domains `vibeset.app` (+ `www` redirect); Deployment Protection for previews with an automation bypass secret for e2e.
2. **Neon**: switch the production project to the **Launch** plan before going public (the Free plan suspends compute when CU-hours run out); autoscaling 0.25–2 CU; scale-to-zero on; note the restore window; protect the `main` branch.
3. **Cloudflare R2**: public production asset bucket `vibeset-assets`, custom domain `cdn.vibeset.app`, app-origin GET/PUT CORS with `Content-Type`, and an `uploads/incoming/` expiry rule after 1 day. Set `NEXT_PUBLIC_CDN_URL=https://cdn.vibeset.app`. Database backups belong in a **different private bucket**, never `vibeset-assets`: no custom domain, r2.dev disabled, separate bucket-scoped read/write credentials, and a Cloudflare API token allowed to verify bucket configuration. Configure an enabled age-based `backups/` expiry rule at exactly `60 × 86400` seconds, with no conflicting overlapping deletion rules. Lifecycle removal is asynchronous, not an exact-second deletion guarantee. Configure the protected `db-backup` GitHub environment and run preflight/backup/isolated restore verification per `docs/08` §8; application deployments must never receive backup credentials.
4. **Google OAuth**: production redirect `https://vibeset.app/api/auth/callback/google`; consent screen with app name, logo, privacy policy and terms URLs; publish the app.
5. **Resend**: verify the sending domain (SPF, DKIM); `EMAIL_FROM="Vibeset <hello@vibeset.app>"`; send a test magic link in both languages.
6. **Cron**: `CRON_SECRET` set; check the first `/api/cron/daily` run in Vercel logs.
7. **Admin**: sign in on production, run `npm run admin:grant` against production (`DATABASE_URL_UNPOOLED` in a one-off env file, deleted afterwards).

## Content before launch

1. `npm run db:seed` on production.
2. Generate all 40 aesthetics × 12 on production (or generate on a staging branch and publish there first to tune), review in the deck, publish **≥ 300** themes.
3. Collections: "Featured", "New this week", "Pastel", "Dark mode", "Y2K", "Cozy", and the active seasonal one; set the Home hero.
4. Record the iOS wizard clips on a real iPhone (screen recording, cropped, ≤ 600 KB each, no personal data visible).

## Release checklist

Run `docs/08` §6 completely, the device matrix in `docs/06` §8, and `/review`. Fix every blocker before announcing.

## After launch (weekly routine)

- Monday: generate 2–3 aesthetics × 12 → review → publish → refresh "New this week".
- Check reports, creator applications, Neon compute usage, R2 operations, Vercel function errors.
- Monthly: Lighthouse on key pages, dependency updates (`npm outdated`), test a backup restore.

## Finish

Summarise what's live, what's pending (e.g. legal review), and the first-week metrics to watch (activation, iOS wizard completion, report rate). Commit: `P17: launch`.
