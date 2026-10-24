---
description: 'Database rules — Drizzle schema, Neon clients, migrations, seed scripts'
applyTo: 'db/**,drizzle/**,drizzle.config.ts,scripts/**'
---

# Database & scripts

- Schema must match `docs/02-data-model.md` exactly (names, types, defaults, indexes, checks). Change the doc first if the schema must change.
- Explicit snake_case column names; `uuid().defaultRandom()` PKs (Better Auth tables use text ids); `timestamp(…, { withTimezone: true })`; `updatedAt` with `$onUpdate(() => new Date())`.
- `db/schema/auth.ts` is **generated** by `npx dotenv -e .env.local -- npx auth@1.7.12 generate --config ./server/auth.ts --output ./db/schema/auth.ts --yes`. Never hand-edit it.
- Files in `db/**` use **relative imports** for runtime code; aliased imports only as `import type` (drizzle-kit and the Better Auth CLI load these files outside Next). Never import `server-only` here.
- Clients: `db/index.ts` exports `db` (`drizzle-orm/neon-http` + `neon(DATABASE_URL)`); `db/pool.ts` exports `dbPool` (`drizzle-orm/neon-serverless` + `Pool`, `idleTimeoutMillis: 10_000`, `pool.on('error', …)` logging, `attachDatabasePool(pool)` from `@vercel/functions` when available). Both receive the full `schema` (tables + relations).
- neon-http has no interactive transactions: use `db.batch([...])` for atomic multi-statement writes; use `dbPool.transaction()` only when you must read-then-write atomically.
- Counters and rate limits: one atomic `INSERT … ON CONFLICT DO UPDATE` statement. Never read-modify-write.
- Optimistic concurrency for themes: `WHERE id = $1 AND asset_version = $expected`; zero rows ⇒ `CONFLICT`.
- Migrations: `npm run db:generate` → read the SQL → `npm run db:migrate`. Custom SQL via `npx drizzle-kit generate --custom --name=<name>`. **Never run `drizzle-kit push`** against a shared database (it drops the hand-written trigram indexes). Breaking changes use expand → backfill → switch → contract.
- `drizzle.config.ts`: `schema: './db/schema/index.ts'`, `out: './drizzle/migrations'`, `dialect: 'postgresql'`, url from `DATABASE_URL_UNPOOLED ?? DATABASE_URL`, `strict: true`, `verbose: true`.

## Scripts (`scripts/*.ts`)

- Run via npm scripts: `dotenv -e .env.local -- tsx --conditions=react-server scripts/<name>.ts` (the condition makes `server-only` imports safe).
- Scripts reuse services from `server/services/*` — no duplicated business logic.
- Idempotent: seeds use upserts keyed by slug; generators are resumable.
- Parse CLI flags with `node:util` `parseArgs`, validate with Zod, print a usage line on error, exit with code 1 on failure.
- Long runs: log progress lines (`[12/48] lavender-haze-y2k-k3f9 ✓`), concurrency via a small promise pool (no new dependency), handle SIGINT by finishing the current item.
- After bulk changes that affect public pages, call `POST /api/internal/revalidate` with `INTERNAL_API_SECRET` (skip with a warning if `NEXT_PUBLIC_SITE_URL` is unreachable).
- Narrow initial native static-beta exception: the reviewed `prepare-native-beta.ts` operator may use explicit `--cache-refresh=manual` when the existing internal secret is unavailable to the local operator. It must return the exact pending cache tags and `cacheRefresh: 'pending'`, never claim refreshed caches, and the operator must authenticate through the existing deployment access to invalidate those tags and verify the real public API before beta delivery. The default remains authenticated API refresh; this exception does not waive cache verification or change publication permissions.
- Destructive flags (`--auto-approve`, deletes) refuse to run when `VERCEL_ENV=production` unless `--force-production` is passed.
