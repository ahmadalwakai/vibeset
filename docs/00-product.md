# Vibeset — Product Brief

> **Free aesthetic themes for your phone.** Wallpapers, matching icon packs and widget designs — hundreds of them, remixable, in English and Arabic.
>
> ثيمات جمالية مجانية لهاتفك — خلفيات وأيقونات وتصاميم ويدجت متناسقة، مئات منها، وكلها قابلة للتعديل.

Status: source of truth for scope. If a phase prompt conflicts with this file, this file wins — or update it first.

---

## 1. The benchmark: what ThemePack is

**ThemePack: Widgets & Wallpaper** (ThemePack Inc., iOS) sells *themes*. One theme = a wallpaper (home + lock screen) + an app-icon pack drawn in the same style + widget designs (time, date, calendar, photo).

How it works on the phone:

- **Icons**: iOS does not let any app change another app's icon. ThemePack (like every app in this category) uses Apple's **Shortcuts** app: one shortcut per app → "Add to Home Screen" → custom image. The original icon is then hidden in the App Library.
- **Widgets**: native iOS widgets (WidgetKit) shipped inside their app.
- **Wallpapers**: saved to Photos, set by the user.

Business model: free download, most content behind a **VIP subscription** (US listing, Oct 2026: $3.99/week, $14.99/month, $39.99/year, $44.99 lifetime). Listing claims 3,000+ themes and 18M downloads; 4.6★ from ~53K ratings; #13 in Graphics & Design.

**What it does well:** huge catalogue, strong "aesthetic" curation (Y2K, coquette, kawaii, leopard…), native widgets.

**Where it is weak — our openings:**

1. Paywall on most content, weekly subscription pricing.
2. iOS-only. No web, no Android parity, nothing shareable or searchable on the open web.
3. Static packs — you cannot change a theme's colours; missing icons for less-popular apps.
4. Setup is tedious (one Shortcut per icon) with little guidance.
5. No Arabic/RTL experience and no regional seasonal content (Ramadan, Eid).

---

## 2. Positioning

Vibeset is a **free, web-first theme platform**: browse hundreds of curated themes, remix any of them live (colours, wallpaper, icon style), and export wallpapers at any resolution plus icon packs for any app — on iPhone, Android or desktop, in English or Arabic. No paywall, no watermark, no account required.

---

## 3. Differentiators

| | ThemePack | Vibeset |
|---|---|---|
| Price | Free + VIP subscription | 100% free. No paywall, no watermark, account optional |
| Platforms | iOS app | Web/PWA on iPhone, Android, desktop. Native widget app = Phase 2 |
| Customisation | Static packs | **Remix any theme** live: palette, wallpaper generator, icon style |
| Icon coverage | Fixed list | 110+ app catalogue + **custom icon for any app** (1,500 glyphs) |
| Wallpaper sizes | Phone | Vector-generated → phone, tablet, desktop, 4K, "my exact screen" |
| Setup | Manual | Guided iOS wizard with progress tracking + bulk "Save to Photos" |
| Language | English-first | English + Arabic with full RTL; Ramadan/Eid seasonal collections |
| Discovery | Inside the app | SEO page per theme/aesthetic/collection, shareable links, Pinterest-ready images |
| Widgets | Live native widgets | Widget designs in previews + static decor images now; **live native widgets in Phase 2** |

Be honest with yourself: on day one ThemePack still wins on live widgets. Phase 2 (`docs/07-roadmap-phase2-native.md`) closes that gap using the same API and theme tokens.

---

## 4. Platform reality (non-negotiable facts)

- A web app (Next.js, PWA) **cannot** add real home-screen widgets on iOS or Android. That needs native code (WidgetKit / Android App Widgets) → Phase 2.
- A web app **cannot** change other apps' icons. Neither can ThemePack. On iOS it is always Shortcuts → Add to Home Screen. We match that flow and make it faster and clearer (`docs/06-install-flows.md`).
- Configuration-profile web clips were evaluated and **rejected** (they open Safari before the target app, show "Unverified" warnings, and need a Settings install flow). See `docs/06`.

---

## 5. Roles

| Role | Who | How they get it |
|---|---|---|
| **Visitor** | Anyone, no account | Default |
| **User** | Signed in (Google or email magic link) | Sign in |
| **Creator** | User approved to publish their own themes (18+) | Applies → admin approves (`creator_profiles.status = approved`) |
| **Admin** | Owner/moderators | `user.role = 'admin'` via `npm run admin:grant` or another admin |

Each role gets complete tools (below). The full permission matrix is in `docs/03-api-and-permissions.md`.

---

## 6. Phase 1 scope (web)

### Visitor & User

- **Home**: featured collection hero, Trending, New, aesthetic chips, active seasonal collection, "Make your own" CTA.
- **Explore**: grid with search, tag filters, colour filter, sort (Trending / New / Most downloaded), infinite scroll.
- **Aesthetic landing pages** (`/a/y2k`, `/a/coquette`…), **Collections** (editorial + seasonal), **Creator profiles**.
- **Theme page**: home + lock previews, tags, creator, stats, "More like this".
  - Download wallpaper: phone / tablet / desktop (pre-rendered) + 4K / "my screen" (rendered on device).
  - **Get icons**: pick apps (catalogue + custom icon for any app) → generate on device → iOS: Save to Photos in batches → guided Shortcuts wizard; Android/desktop: ZIP.
  - Decor widget images (static, for the iOS Photos widget) — optional.
  - Remix, Save (♥), Share, Report.
- **Studio (Remix)**: live editor for palette, wallpaper generator + seed shuffle, icon style, widget style, fonts; undo/redo; autosave draft; share via link (no account); save to account (signed in).
- **Saved**: favourites (local for visitors, synced for users; merged on sign-in), personal collections (private/unlisted share link), saved remixes.
- **Setup guides**: iOS wizard (per-app checklist, progress saved locally), Android guide, desktop guide.
- **Account**: profile, language, colour mode, export my data (JSON), delete account.

### Creator

- Apply (handle, display name, bio, links, 18+ confirmation).
- Creator dashboard: themes by status, per-theme views/downloads/favourites (7/30 days).
- Create theme: Studio-based editor + **upload own wallpaper image** (client pre-processing, presigned upload, server validation, palette auto-extraction, matching icon style suggestion).
- Submit for review, see rejection reasons, edit & resubmit, withdraw, delete drafts.
- Public profile page `/c/{handle}`.

### Admin

- Dashboard: KPIs (published, pending review, downloads today/7d/30d, new users, open reports, pending creators), 30-day downloads chart, top themes.
- Themes: table with filters + bulk actions (approve, reject, publish, archive, feature, tag, add to collection, delete), editor with live preview and spec JSON, regenerate assets.
- **Review deck**: fast keyboard-driven review (A approve, R reject, S skip, F feature) with QA and duplicate warnings.
- **Generator**: produce draft themes per aesthetic (count + seed), run history.
- **Publish queue**: render + upload assets with progress, retries, resumable.
- Collections (editorial/seasonal, drag-to-order, scheduling), Tags (EN/AR, merge), App catalogue, Reports (moderation), Users (roles, ban), Creators (approve/reject/suspend), Site settings (hero, announcement banner), Audit log.

---

## 7. Non-goals for Phase 1

Native widgets, native Android icon-pack app, live/video wallpapers, in-app AI image generation, payments/ads/subscriptions, social feed/comments/likes beyond favourites, brand logos inside icons.

---

## 8. Content strategy — how we reach "hundreds"

- **Launch: ~400 themes** = 40 aesthetics × ~10 curated variants produced by our generator from 45 hand-picked palettes, every one reviewed by an admin before publishing (`docs/05-content-pipeline.md`).
- **Weekly**: +20–30 themes (2–3 aesthetics × 12 candidates → review → publish).
- **Seasonal**: Ramadan, Eid, Halloween, Christmas/winter, Valentine's, summer — scheduled 3 weeks ahead as collections.
- **Creators**: image-based themes (moderated).

---

## 9. Success metrics

| Metric | Target (first 90 days) |
|---|---|
| Activation: visitors who download a wallpaper or export icons | ≥ 25% |
| iOS icon export → wizard completion | ≥ 40% |
| 30-day returning visitors | ≥ 20% |
| Report rate (reports / published themes) | < 0.5% |
| LCP p75 mobile / INP p75 | < 2.5 s / < 200 ms |

---

## 10. Sustainability (the app is free)

- Architecture is built for near-zero running cost: cached/static pages, images on Cloudflare R2 (zero egress), Neon scale-to-zero, all icon/remix rendering on the user's device.
- Expected launch costs and upgrade triggers are in `docs/01-architecture.md` §14.
- Optional later, never a paywall: donations ("Support Vibeset"), clearly-labelled sponsored seasonal collections. If you add any monetisation, move off Vercel Hobby (non-commercial use only).

---

## 11. Legal & licensing principles

- **Icons**: generic glyphs from Phosphor Icons (MIT). **No brand logos.** App names appear only as text labels.
- **Fonts**: SIL Open Font License only (list in `docs/04-design-system.md`).
- **Wallpapers**: generated by our engine, or uploaded by creators who own the rights. Never scraped (Pinterest, stock sites — Unsplash/Pexels licences restrict use for competing or wallpaper services).
- **Uploads**: raster only (JPEG/PNG/WebP), EXIF/GPS stripped, moderated before going public. Never accept SVG uploads.
- **Audience includes teens** → follow the UK ICO Children's Code: privacy by default, no tracking cookies, no profiling, no ads, minimal data, clear reporting. Creator programme is 18+.
- UK GDPR: export and delete account self-serve. Copyright/takedown page + report button on every theme.
- Content licence for users: free for personal use; no resale or redistribution as packs.
- Public operator: **Ahmad Alwakai**; public support, privacy and content-removal contact: **ahmadalwakai@gmx.com**. These approved details appear in the English/Arabic Terms, Privacy and Copyright pages; they do not establish Apple seller identity or ownership of a sending domain.
- Creator submissions grant a non-exclusive, royalty-free licence limited to running Vibeset and providing personal downloads/remixes. Account deletion removes private drafts/profile and account attribution, while published designs and referenced photos can remain. Published-content removal is a separate email request, assessed alongside applicable privacy/copyright rights; it is not a blanket refusal of erasure requests. The submission UI links to that grant and retention explanation.
- Automatic theme-view statistics are **off by default**. The public Privacy page and Account settings share an explicit enable/disable control. This browser-wide choice is independent of the existing download, export, remix, setup-completion and favourite counters. Missing or invalid preferences keep views off; no initial preference is written. A failed save uses a disclosed current-tab fallback.
- Legal texts are complete application source, dated 24 October 2026. Qualified English/Arabic legal review, actual provider/transfer arrangements, justified retention and a working monitored removal/rights process remain launch requirements; implementing the pages does not certify compliance.

---

## 12. Brand

- **Name**: Vibeset (vibe + set). Before buying anything, check the domain (suggested `vibeset.app`), trademark search (UKIPO + USPTO), and App Store/Play name availability for Phase 2.
- **Arabic**: فايبست
- **Voice**: friendly, short, playful but not childish. Arabic copy is written natively, not machine-translated.
- **Logo concept**: lowercase wordmark `vibeset` set in the display font, with a small four-point sparkle replacing the dot of the "i". App icon: the sparkle on a brand-gradient squircle.
