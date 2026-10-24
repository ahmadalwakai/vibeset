# Copilot instructions — Vibeset

Vibeset is a free platform of aesthetic phone themes (wallpapers + matching icon packs + widget designs), remixable, in English and Arabic (RTL). Roles: visitor, user, creator, admin — each with complete tools.

**Specs are the source of truth** — read the relevant file before writing code:
`docs/00-product.md` · `docs/01-architecture.md` · `docs/02-data-model.md` · `docs/03-api-and-permissions.md` · `docs/04-design-system.md` · `docs/05-content-pipeline.md` · `docs/06-install-flows.md` · `docs/08-quality-checklists.md`.
If the code you are about to write contradicts a doc, stop and say so. If a decision changes, update the doc in the same change.

## Stack (do not deviate)

Next.js 16 (≥ 16.3, App Router, Turbopack, `cacheComponents: true`) · React 19.2 · TypeScript strict · npm · Chakra UI v3 + `@emotion/react` + `next-themes` · `motion` (`motion/react`) · `@phosphor-icons/react` · next-intl v4 (`en`, `ar`) · Neon Postgres · Drizzle ORM (stable line) · Better Auth · Zod 4 · Cloudflare R2 via `@aws-sdk/client-s3` · `@resvg/resvg-js` + `sharp` · `@phosphor-icons/core` · `culori` · `fflate` · `lz-string` · Resend · Recharts (admin only) · Vitest · Playwright · `tsx` + `dotenv-cli` for scripts.

Never add: Tailwind, Prisma, NextAuth, TanStack Query, `@chakra-ui/icons`, lodash, moment, axios. Any other new dependency needs a one-line justification.

The native iPhone app in `mobile/` uses a separate Expo SDK 58 / React Native 0.88 / React 19.3 package and native views, per its scoped `AGENTS.md`. The Chakra/Next stack and browser-only conventions above apply to the web product. The owner prioritized native implementation on 24 October 2026; remaining web launch gates do not postpone starting the app.

## Project layout (no `src/`)

`app/[locale]/…` pages (root layout is `app/[locale]/layout.tsx`; there is no `app/layout.tsx`) · `app/api/…` route handlers · `components/{ui,common,layout,theme,explore,studio,setup,creator,admin}` · `db/` schema + clients · `server/` server-only code (`auth.ts`, `guards.ts`, `action.ts`, `cache.ts`, `queries/`, `admin-queries/`, `services/`, `actions/`, `storage/`, `render/`) · `lib/render/` isomorphic renderer · `lib/client/` browser helpers · `lib/` shared types/utils · `content/` curated data · `design/` Chakra system · `hooks/` · `i18n/` · `messages/` · `scripts/` · `tests/` · `proxy.ts`.

Naming: **"Theme" = the product entity** (`themes` table, `ThemeSpec`). The Chakra config is the **system** (`design/system.ts`). Light/dark is **colorMode**. Never call the Chakra config "theme".

## Non-negotiables

1. **TypeScript**: strict, no `any`, no non-null assertions on external data, explicit return types on exported functions. Shared types live in `lib/` and are imported, never redeclared.
2. **Validation**: Zod at every boundary (actions, route handlers, env, URL/search params, localStorage reads, specs). Schemas in `lib/validation/` are shared by forms and actions.
3. **Mutations** go: Server Action (`createAction` in `server/action.ts`) or Route Handler → guard → service in `server/services/` → return `{ data, tags }` → caller invalidates tags. One service per mutation, reused by every role and by scripts. Services never import `next/*`.
4. **Results**: actions return `ActionResult<T>` (`lib/result.ts`). The UI translates `error.code` with next-intl (`errors.*`); never display `error.message`.
5. **Auth**: every action, route handler, admin/creator query re-checks auth via `server/guards.ts`. `proxy.ts` and layouts are UX only. Creator = `creator_profiles.status = 'approved'`; admin = `user.role = 'admin'`. Banned users fail every guard.
6. **Public data = `status = 'published'`**, always.
7. **Theme status changes** only through `transitionThemeStatus()` (`server/services/theme-status.ts`).
8. **Caching (Cache Components)**: public reads in `server/queries/*` start with `'use cache'` and call `cacheLife()` + `cacheTag()` with helpers from `server/cache.ts`. Anything reading cookies, headers, session, `searchParams` or the current time outside a cache scope must sit inside `<Suspense>` with a skeleton. No `dynamic`/`revalidate`/`fetchCache` segment configs; no `dynamicParams = false` (validate + `notFound()`). Invalidate with `updateTag()` in Server Actions (read-your-writes) or `revalidateTag(tag, 'max')` in route handlers. Never cache per-user data in shared caches.
9. **Next 16 APIs**: `proxy.ts` (not middleware), async `params`/`searchParams`/`cookies()`/`headers()`, `PageProps<'/[locale]/…'>`/`LayoutProps` helpers, `after()` for post-response work.
10. **i18n**: next-intl with `next/root-params` in `i18n/request.ts`; **no `setRequestLocale`**. Server Actions/Route Handlers don't get root params — pass `locale` explicitly if needed. Every UI string in `messages/en.json` and `messages/ar.json` (same keys). DTOs carry `nameEn`/`nameAr`; pick with `localized()`.
11. **RTL**: logical style props only (`ms/me/ps/pe`, `insetStart/insetEnd`, `textAlign="start"`). Flip directional icons with `_rtl`. Phone previews are always `dir="ltr"`.
12. **Chakra v3 only**: import from `@chakra-ui/react`; snippets live in `components/ui/`; use tokens/semantic tokens/`colorPalette="brand"` — no raw hex, no inline px magic numbers. No v2 APIs (`extendTheme`, `useToast`, `@chakra-ui/icons`). Toasts via the `toaster` snippet.
13. **Mobile-first, polished**: design at 360 px first. Every async UI has loading (skeleton), empty, error and success states. Animate only transform/opacity, respect reduced motion, follow `docs/04` §6.
14. **Database**: `db` (neon-http) by default; `dbPool` only for the auth adapter, interactive transactions and scripts. Atomic upserts for counters. Migrations via `drizzle-kit generate` + review + `migrate`. **Never `drizzle-kit push`** on shared databases.
15. **Renderer**: `lib/render` is pure and deterministic (seeded PRNG, no DOM/Node APIs/`Math.random`/`Date`). Only validated specs reach SVG. SVG is displayed via `<img>` data URLs, never `dangerouslySetInnerHTML`.
16. **Security**: no secrets in client code; IPs stored only as salted hashes; rate limits per `docs/03` §6; audit-log every admin mutation; uploads are raster-only with metadata stripped.
17. **Imports**: files loaded by external CLIs (`db/**`, `server/auth.ts`, `lib/env.server.ts`, `drizzle.config.ts`) use relative imports for runtime code (aliases only as `import type`) and never import `server-only`. Other server modules start with `import 'server-only'`. Scripts run with `tsx --conditions=react-server`.
18. **No dead code, no TODO placeholders, no mock data in production paths.** If something can't be finished, say so in your summary.

## How to work

- Before editing: read the files you will touch and their consumers (search usages). Never break existing functionality.
- When you change an endpoint, action, DTO or query: update every consumer across visitor/user/creator/admin/API v1/scripts in the same change, and the docs.
- After editing: run `npm run typecheck && npm run lint && npm test` (and `npm run build` at the end of a phase). Fix everything you broke.
- Finish with a short summary: files changed, how to verify, open questions. Don't claim something works unless you ran it.
- Keep changes scoped to the current phase prompt. Suggest improvements separately; don't sneak them in.
