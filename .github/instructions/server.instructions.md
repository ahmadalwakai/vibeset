---
description: 'Server rules — actions, route handlers, services, guards, caching, security'
applyTo: 'server/**,app/api/**,proxy.ts'
---

# Server code

- Every module in `server/` (except `server/auth.ts`) starts with `import 'server-only'`.
- **Layers** (never skip one):
  - `server/actions/*.ts` — `'use server'`; only exports built with `createAction({ input, auth, rateLimit?, feature?, handler })`. Thin: parse → guard → call a service → invalidate returned tags → return.
  - `app/api/**/route.ts` — Zod-parse query/body, guard, call a service, respond `{ data }` or `{ error: { code, message } }` with `HTTP_STATUS[code]`. Set `Cache-Control` explicitly (public v1: `public, s-maxage=300, stale-while-revalidate=86400`; user/admin: `private, no-store`).
  - `server/services/*.ts` — business logic, ownership checks, state machine, audit. Signature style: `fn(input, actor: Actor) → Promise<{ data: T; tags: string[] }>`. **No `next/*` imports** (scripts reuse services).
  - `server/queries/*.ts` — public cached reads: first statement `'use cache'`, then `cacheLife('hours' | 'days')` and `cacheTag(...)` via `CacheTags`. Arguments must be serialisable. Return DTOs from `server/queries/mappers.ts`. Filter `status = 'published'`.
  - `server/admin-queries/*.ts` — uncached reads for admin/creator/user dashboards; call a guard first.
- Errors: throw `AppError(code, devMessage)` from `server/errors.ts`; `createAction` and `handleRoute()` map them. Unknown errors → `INTERNAL` + `console.error({ scope, err })`. Never leak SQL, stack traces or other users' data.
- Guards (`server/guards.ts`): `getSession()` (React `cache`d `auth.api.getSession({ headers: await headers() })`), `requireUser()`, `requireCreator()`, `requireAdmin()`, and page variants `requireUserPage(next)`, `requireCreatorPage()`, `requireAdminPage()` that `redirect('/sign-in?next=…')` or `notFound()` instead of throwing.
- Invalidation: services return tags; Server Actions call `updateTag()` (when the actor must see the change immediately on a cached page) or `revalidateTag(tag, 'max')`; route handlers call `revalidateTag(tag, 'max')` only. Use `CacheTags` helpers, never string literals.
- Rate limiting: `rateLimit(key, limit, windowSec)` from `server/rate-limit.ts` (atomic upsert). Keys use user id or `ipHash` from `server/request.ts` (`sha256(ip + IP_HASH_SALT)`, ip from `x-forwarded-for` first hop).
- Audit: `audit({ actorId, action, entityType, entityId, meta })` inside the same `db.batch` as the change when possible.
- Long work in route handlers: `export const maxDuration = 60` and `runtime` default (nodejs). Post-response cleanup with `after()`.
- `proxy.ts`: next-intl middleware + optimistic cookie check (`getSessionCookie` from `better-auth/cookies`) for `/admin` and `/creator` paths (with or without locale prefix). No DB calls in the proxy. Matcher excludes `api`, `_next`, `_vercel` and files with extensions.
- Env: import from `lib/env.server.ts` (validated at boot). Never read `process.env` directly elsewhere.
- Server Actions don't have `next/root-params`: never depend on locale in actions — return codes; the client translates.
