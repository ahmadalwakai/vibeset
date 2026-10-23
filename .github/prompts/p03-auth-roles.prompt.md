---
description: 'P03 · Auth & roles — Better Auth routes/client, sign-in UI, guards, createAction, rate limits, audit, admin grant'
agent: 'agent'
---

# P03 · Auth, roles & server foundations

Read first: [API & permissions §1–§3, §6, §8](../../docs/03-api-and-permissions.md) · [architecture §8, §11](../../docs/01-architecture.md) · [server rules](../instructions/server.instructions.md)

## Goal

Users can sign in (Google, email magic link), the header knows who they are, and every later phase has the server building blocks: guards, `createAction`, route error handling, rate limiting, audit, cache tag helpers.

## Tasks

1. **Shared result types**: `lib/result.ts` exactly as `docs/03` §3.1.

2. **Server foundations** (each starts with `import 'server-only'`):
   - `server/errors.ts` — `class AppError extends Error { constructor(public code: ErrorCode, message?: string, public fieldErrors?: Record<string, string[]>) }`.
   - `server/request.ts` — `getClientIp(headers)` (first `x-forwarded-for` hop, fallback `x-real-ip`), `getIpHash()` = `sha256(ip + env.IP_HASH_SALT)` hex.
   - `server/rate-limit.ts` — `rateLimit(key, limit, windowSec)` running the single SQL statement from `docs/03` §6 via `db.execute(sql…)`; returns `{ allowed, count }`.
   - `server/audit.ts` — `auditInsert(entry)` returns a Drizzle insert query (so callers can put it in `db.batch`) + `audit(entry)` convenience.
   - `server/cache.ts` — `CacheTags` (docs/03 §7) and `invalidate(tags, mode: 'update' | 'revalidate')` (`updateTag` vs `revalidateTag(tag, 'max')`), deduping tags.
   - `server/services/settings.ts` — Zod schemas + defaults per key (`docs/02` §6); `getSetting(key)` (uncached read for server logic) and `getFeatures()`; writes come in P14.
   - `server/guards.ts` — `getSession` (React `cache`), `requireUser`, `requireCreator` (approved `creator_profiles` row or admin), `requireAdmin`; banned → `FORBIDDEN`. Page variants: `requireUserPage(nextPath)` → `redirect` to `/sign-in?next=…`, `requireCreatorPage()` → sign-in or `notFound()`, `requireAdminPage()` → sign-in or `notFound()`.
   - `server/action.ts` — `createAction` per `docs/03` §3.2: Zod parse (→ `VALIDATION` + flattened `fieldErrors`), auth level, `feature` flag (`FEATURE_DISABLED`), rate limit (`RATE_LIMITED`), handler; maps `AppError`; unknown errors → `INTERNAL` with `console.error({ scope: 'action', err })`.
   - `server/route.ts` — `handleRoute(fn)` wrapper for route handlers returning `{ error: { code, message } }` with `HTTP_STATUS[code]` and `Cache-Control: private, no-store` on errors.

3. **Better Auth wiring**
   - `app/api/auth/[...all]/route.ts`: `export const { GET, POST } = toNextJsHandler(auth)`.
   - `lib/auth-client.ts`: `createAuthClient({ plugins: [adminClient(), magicLinkClient()] })`; export `authClient`.

4. **Sign-in** — `app/[locale]/(auth)/layout.tsx` (centred card, brand gradient accent, back link) and `app/[locale]/(auth)/sign-in/page.tsx`:
   - "Continue with Google" (`authClient.signIn.social({ provider: 'google', callbackURL })`).
   - Email magic link form (shared Zod email schema in `lib/validation/auth.ts`): idle → sending (button loading) → sent state ("Check your inbox", resend after 30 s countdown) → error (translated).
   - `?next=` accepted only if it is a relative path starting with `/` and not `//` (prevent open redirects); default `/`.
   - Already signed in → redirect to `next`.

5. **Header account slot** — `components/layout/HeaderAccount.tsx` (server, rendered inside `<Suspense fallback={<SkeletonCircle size="8" />}>`): reads `getSession()` and the creator status, renders `UserMenu` (client) with `{ name, image, role, isCreator }` or a "Sign in" button. `UserMenu` (Chakra `Menu`): Saved, Account, Creator studio (creators), Admin (admins), Sign out (`authClient.signOut()` then `router.refresh()`).

6. **proxy.ts auth gate**: before next-intl, strip an optional `/ar` prefix; for paths starting with `/admin`, `/creator`, `/account`, if `getSessionCookie(request)` (from `better-auth/cookies`) is missing → redirect to `/{ar/}sign-in?next=<original path>`. Then `return intlMiddleware(request)`. No DB access in the proxy.

7. **Admin grant script** — `scripts/admin-user.ts` with `parseArgs`: `--grant <email>`, `--revoke <email>`, `--list`. Uses `server/services/users.ts` → `setRoleByEmail(email, role, actor: 'system')` enforcing "last admin cannot be demoted" and writing audit. npm scripts: `"admin:grant": "dotenv -e .env.local -- tsx --conditions=react-server scripts/admin-user.ts --grant"`, `"admin:list": "… --list"`.

8. **Messages**: `auth.*` strings (both languages).

9. **Tests**
   - `tests/unit/server/action.test.ts` — mocks guards: validation error mapping, each auth level, rate-limited path, AppError mapping, unknown error → INTERNAL.
   - `tests/unit/server/next-param.test.ts` — open-redirect protection cases.
   - `tests/integration/rate-limit.test.ts` — window reset and concurrency (20 parallel calls → exact count).

## Acceptance checks

- [ ] Google sign-in and magic link work locally (Google OAuth client with redirect `http://localhost:3000/api/auth/callback/google`).
- [ ] Header shows the user menu inside Suspense; `/admin` without a session redirects to sign-in with `next`; signed-in non-admin gets 404 at `/admin` (once P13 adds pages; test with a stub `app/[locale]/admin/page.tsx` that calls `requireAdminPage()` and renders "Admin").
- [ ] `npm run admin:grant -- me@example.com` makes you admin; demoting the last admin fails.
- [ ] Banned user (set via Drizzle Studio) fails guards.
- [ ] typecheck, lint, test, build pass.

## Finish

Commit: `P03: auth, roles & server foundations`.
