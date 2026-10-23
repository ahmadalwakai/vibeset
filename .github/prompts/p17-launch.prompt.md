---
description: 'P17 · Launch — Vercel/Neon/R2/OAuth/email production setup, legal pages, content seeding, monitoring, release checklist'
agent: 'agent'
---

# P17 · Launch

Read first: [quality checklists §6](../../docs/08-quality-checklists.md) · [architecture §13–§14](../../docs/01-architecture.md) · [content pipeline §11, §14](../../docs/05-content-pipeline.md) · [product §11](../../docs/00-product.md)

## Goal

Vibeset is live on its domain with ≥ 300 reviewed themes, legal pages in both languages, monitoring, backups and a repeatable weekly content routine.

## Tasks (code)

1. **Build command**: add `"vercel-build": "drizzle-kit migrate && next build"` (migrations run against the deployment's database — the Neon branch on previews, `main` on production). Expand/contract migrations only from now on.

2. **Legal pages** — `app/[locale]/(site)/legal/[doc]/page.tsx` for `terms`, `privacy`, `copyright`; content as typed TSX per locale in `content/legal/{doc}.{en,ar}.tsx` styled with Chakra's `prose` snippet (`npx @chakra-ui/cli snippet add prose`). Cover:
   - **Terms**: free personal-use licence for themes, creator content licence grant (non-exclusive, revocable on deletion), prohibited content (brands, celebrities, copyrighted characters, adult/hateful content), takedown process, no warranty, UK law.
   - **Privacy** (UK GDPR + ICO Children's Code): data collected (account email/name/avatar, locale, favourites, collections, remixes, creator profile, uploads, salted IP hashes for rate limiting), no tracking cookies/ads/profiling, processors (Vercel, Neon, Cloudflare, Resend, Google for sign-in), retention, export/delete self-service, contact.
   - **Copyright & credits**: Phosphor Icons (MIT), font licences (OFL) with family names, how to report infringement.
   - Footer links + sitemap entries. Add a visible note in your summary: these texts need review by a qualified person before launch.

3. **Sentry (optional)** — `npx @sentry/wizard@latest -i nextjs`; DSN in env; `sendDefaultPii: false`; scrub emails and IPs in `beforeSend`; source maps upload in Vercel builds only.

4. **Setup clips** — after recording the iOS wizard clips (task below), upload them to R2 `setup/ios/{step}.mp4` and list them in `content/setup-media.ts`.

## Tasks (operations — guide me through these step by step and verify each)

1. **Vercel**: import the repo; Node 24; function region matching the Neon region (`docs/01` §13); build command `npm run vercel-build`; env vars for Production and Preview from `.env.example` (Preview uses the dev R2 bucket and `E2E_TEST_AUTH=1`; Production never sets it); Neon integration (creates a branch per preview, injects `DATABASE_URL`/`DATABASE_URL_UNPOOLED`); domains `vibeset.app` (+ `www` redirect); Deployment Protection for previews with an automation bypass secret for e2e.
2. **Neon**: switch the production project to the **Launch** plan before going public (the Free plan suspends compute when CU-hours run out); autoscaling 0.25–2 CU; scale-to-zero on; note the restore window; protect the `main` branch.
3. **Cloudflare R2**: production bucket `vibeset-assets`, custom domain `cdn.vibeset.app`, CORS for `https://vibeset.app`, lifecycle rules (`uploads/incoming/` 1 day, `backups/` 60 days). Set `NEXT_PUBLIC_CDN_URL=https://cdn.vibeset.app`.
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
