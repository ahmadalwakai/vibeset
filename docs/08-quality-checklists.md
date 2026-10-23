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
- [ ] Backups: Neon restore window known; weekly `pg_dump` workflow green.

## 7. Every major iOS release (September)

- [ ] Re-verify Shortcuts step labels and re-record wizard clips.
- [ ] Re-test wallpaper "Use as Wallpaper" flow and Photos widget album selection.
- [ ] Re-test Web Share batch size; adjust `IOS_SHARE_BATCH`.
