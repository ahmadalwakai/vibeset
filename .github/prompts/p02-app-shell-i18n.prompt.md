---
description: 'P02 · App shell & i18n — next-intl with root params, [locale] root layout, RTL, header/bottom nav, common components'
agent: 'agent'
---

# P02 · App shell & i18n

Read first: [architecture §3, §6, §10](../../docs/01-architecture.md) · [design system §5–§12](../../docs/04-design-system.md) · [UI rules](../instructions/ui.instructions.md)

## Goal

Localised (en/ar), RTL-correct, mobile-first shell with Cache Components working: root layout under `app/[locale]`, proxy routing, header, bottom nav, footer, error/404 pages, shared common components.

## Tasks

1. **next-intl**
   - `i18n/routing.ts`: `defineRouting({ locales: ['en', 'ar'], defaultLocale: 'en', localePrefix: 'as-needed' })`.
   - `i18n/navigation.ts`: `export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)`.
   - `i18n/request.ts`: use `next/root-params` exactly like this (explicit `locale` override wins; Server Actions/Route Handlers don't support root params):
     ```ts
     import * as rootParams from 'next/root-params';
     export default getRequestConfig(async ({ locale }) => {
       if (!locale) {
         const param = await rootParams.locale();
         if (!hasLocale(routing.locales, param)) notFound();
         locale = param;
       }
       return { locale, timeZone: 'UTC', messages: (await import(`../messages/${locale}.json`)).default };
     });
     ```
   - `global.d.ts`: augment `next-intl` `AppConfig` with `Locale` (from `routing.locales`) and `Messages` (typeof `messages/en.json`).
   - Wrap `next.config.ts` with `createNextIntlPlugin('./i18n/request.ts')`.
   - **Do not use `setRequestLocale` anywhere.**

2. **proxy.ts** (project root): `export default createMiddleware(routing)` for now (P03 adds the auth gate). `export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] }`.

3. **Root layout** — delete `app/layout.tsx` and `app/page.tsx` from P00. Create `app/[locale]/layout.tsx`:
   - `generateStaticParams()` → both locales. Read the locale with `getLocale()`; set `<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className={fontVariables} suppressHydrationWarning>`.
   - Body: `<Provider>` → Chakra `<LocaleProvider locale={locale === 'ar' ? 'ar-SA' : 'en-GB'}>` → `<NextIntlClientProvider>` → children + `<Toaster />`.
   - `export const viewport` and `generateMetadata` (metadataBase from `NEXT_PUBLIC_SITE_URL`, title template `%s · Vibeset`, translated description, `alternates.languages` for en/ar/x-default) per `docs/04` §5.
   - `app/global-not-found.tsx` (own `<html>`/`<body>`, minimal bilingual 404) — enable `experimental.globalNotFound` in `next.config.ts` if your Next version still requires the flag (the build will tell you).
   - `app/[locale]/not-found.tsx` (translated, link home) and `app/[locale]/error.tsx` (`'use client'`, `ErrorState` with `reset()`).

4. **Messages** — `messages/en.json` and `messages/ar.json` with identical keys. Namespaces: `common`, `nav`, `home`, `explore`, `theme`, `studio`, `setup`, `saved`, `account`, `auth`, `creator`, `admin`, `errors`, `legal`. Fill now: `common` (actions like save, cancel, retry, close, back, loading), `nav`, `errors` (one key per `ErrorCode` + `NETWORK`, `OFFLINE`), footer, 404/error copy. Arabic written natively (friendly MSA), not literal translation.

5. **Shared utils**: `lib/utils/localized.ts` (`localized(obj, locale, 'name' | 'title' | 'description')` with English fallback), `lib/utils/format.ts` (`formatNumber`, `formatCompact`, `formatDate` using `ar-u-nu-latn` for Arabic).

6. **Site shell** — `app/[locale]/(site)/layout.tsx` renders `SiteHeader`, `<main id="main">`, `SiteFooter`, `BottomNav` (mobile only), with bottom padding = 64 px + safe area on mobile. Add a skip link.
   - `components/layout/SiteHeader.tsx` — glass bar (`chrome.bg` + backdrop blur, solid fallback for `prefers-reduced-transparency`), wordmark (text logo with sparkle glyph), md+ nav links (Home, Explore, Studio, Saved), search icon (links to `/explore?focus=1`), `LocaleSwitcher`, `ColorModeButton`, account slot (static "Sign in" link for now). Mobile: hides on scroll down / shows on scroll up via `useScroll` + transform (client child `HideOnScroll`).
   - `components/layout/BottomNav.tsx` (client) — 5 tabs (house, magnifying-glass, magic-wand, heart, user-circle); active tab uses fill weight + shared `layoutId` pill; `aria-current="page"`; labels translated.
   - `components/layout/SiteFooter.tsx` — legal links, language switch, copyright.
   - `components/layout/LocaleSwitcher.tsx` (client) — `router.replace(pathname, { locale })` keeping search params.
   - `app/[locale]/(site)/loading.tsx` — page-shaped skeleton.

7. **Common components** (`components/common/`, per `docs/04` §8): `PageHeader`, `EmptyState`, `ErrorState`, `ConfirmDialog` (supports typed confirmation), `ResponsiveSheet` (Drawer with `placement={{ base: 'bottom', md: 'end' }}`, drag handle, sheet radius), `InfiniteSentinel` (IntersectionObserver, `rootMargin: '800px'`, disconnects on unmount).

8. **Temporary Home** — `app/[locale]/(site)/page.tsx`: translated hero (display text, subtitle, "Explore themes" and "Open Studio" buttons). P07 replaces it with the real Home.

## Acceptance checks

- [ ] `/` renders English LTR; `/ar` renders Arabic RTL; switching language keeps the path and query.
- [ ] Mobile 360 px: bottom nav visible, header hides on scroll; md+: top nav, no bottom nav.
- [ ] Dark mode, reduced motion and keyboard navigation (skip link, focus rings) work.
- [ ] Unknown locale (`/de`) and unknown paths show the right 404.
- [ ] `npm run build` passes with Cache Components (no "uncached data outside Suspense" errors) and lists both locales as prerendered.
- [ ] typecheck, lint, test pass.

## Finish

Commit: `P02: app shell & i18n`.
