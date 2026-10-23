---
description: 'P01 · Database — Neon clients, Better Auth core + generated schema, domain schema, migrations, ThemeSpec'
agent: 'agent'
---

# P01 · Database & auth core

Read first: [data model](../../docs/02-data-model.md) · [architecture §7–8](../../docs/01-architecture.md) · [database rules](../instructions/database.instructions.md)

## Goal

All tables from `docs/02` exist on the Neon dev branch through reviewed migrations; Better Auth is configured server-side and its schema is generated; `ThemeSpec` is defined.

## Preconditions

`.env.local` has `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, Google and Resend keys (Google can be empty until P03 testing).

## Tasks

1. **Shared types first**
   - `lib/render/spec.ts` — copy the Zod schemas and types from `docs/02` §5 exactly, plus `canonicalJson()` and `specHash()` in `lib/render/hash.ts` (recursive key sort; `globalThis.crypto.subtle.digest('SHA-256')`; hex output).
   - `lib/theme-assets.ts` — `ThemeAssets`, `WallpaperAsset`, `WallpaperSize`.
   - Tests: `tests/unit/render/spec.test.ts` (valid sample spec passes; bad hex, unknown glyph name format, scatter sizeMin > sizeMax, gradient without bg2 all fail; hex is lowercased) and `hash.test.ts` (key order doesn't change the hash).

2. **Clients**
   - `db/index.ts` — `export const db = drizzle({ client: neon(env.DATABASE_URL), schema })` (`drizzle-orm/neon-http`).
   - `db/pool.ts` — `Pool` from `@neondatabase/serverless` with `idleTimeoutMillis: 10_000`, `pool.on('error', …)` → `console.error`; `attachDatabasePool(pool)` from `@vercel/functions` if exported by the installed version; `export const dbPool = drizzle({ client: pool, schema })` (`drizzle-orm/neon-serverless`).
   - `schema` = `{ ...tables from db/schema/index.ts, ...relations from db/relations.ts }`. Relative imports only in `db/**`.

3. **Email**: `server/email.ts` — `sendMagicLinkEmail({ to, url })` with Resend; one bilingual email (English block, then Arabic block with `dir="rtl"`), plain-text alternative, 10-minute expiry note. No tracking pixels.

4. **Better Auth server config** — `server/auth.ts` (relative imports, **no** `server-only`):
   ```ts
   export const auth = betterAuth({
     appName: 'Vibeset',
     baseURL: env.BETTER_AUTH_URL,
     secret: env.BETTER_AUTH_SECRET,
     trustedOrigins: [env.NEXT_PUBLIC_SITE_URL, ...extraTrustedOrigins],
     database: drizzleAdapter(dbPool, { provider: 'pg', schema }),
     emailAndPassword: { enabled: env.E2E_TEST_AUTH === '1' },     // tests only; env validation blocks production
     socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: 'select_account' } },
     session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
     rateLimit: { enabled: true, storage: 'database' },
     user: {
       additionalFields: { locale: { type: 'string', required: false, defaultValue: 'en', input: true } },
       deleteUser: { enabled: true, beforeDelete: async (user) => { await cleanupUserContent(user.id); } },
     },
     plugins: [magicLink({ expiresIn: 600, sendMagicLink: ({ email, url }) => sendMagicLinkEmail({ to: email, url }) }),
               admin({ defaultRole: 'user', adminRoles: ['admin'] }),
               nextCookies()],                                     // nextCookies must stay last
   });
   ```
   Verify each option name against the installed Better Auth version's types; adjust names (not behaviour) if the API differs, and note it in your summary.
   - `server/services/account.ts` → `cleanupUserContent(userId)`: delete the user's themes whose status ≠ `published` (published ones keep existing with `owner_id` set null by FK). Favourites, collections, uploads, creator profile cascade by FK. R2 cleanup is added in P11.

5. **Generate the auth schema**: `npx @better-auth/cli@latest generate --config ./server/auth.ts --output ./db/schema/auth.ts`. If the CLI cannot resolve imports, fix the import paths (relative) — never hand-write the tables. Confirm `user` has `role`, `banned`, `ban_reason`, `ban_expires`, `locale`, and that a `rate_limit` table exists.

6. **Domain schema** — create exactly as in `docs/02` §3: `db/custom-types.ts`, `db/schema/{themes,taxonomy,catalog,collections,engagement,moderation,system}.ts`, `db/schema/index.ts` (re-exports, including `auth`), `db/relations.ts` (§3.10). Aliased imports only as `import type`.

7. **drizzle.config.ts**: `schema: './db/schema/index.ts'`, `out: './drizzle/migrations'`, `dialect: 'postgresql'`, `dbCredentials.url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL`, `strict: true`, `verbose: true`.

8. **Scripts**: `"db:generate": "dotenv -e .env.local -- drizzle-kit generate"`, `"db:migrate": "dotenv -e .env.local -- drizzle-kit migrate"`, `"db:studio": "dotenv -e .env.local -- drizzle-kit studio"`. **Do not add `db:push`.**

9. **Migrations**:
   - `npm run db:generate` → open the SQL and check: enums, partial indexes with `WHERE status = 'published'`, the generated `search_vector` column (`GENERATED ALWAYS AS (…) STORED`), check constraints, FKs with the right `ON DELETE`.
   - `npx drizzle-kit generate --custom --name=search_extensions` → paste the SQL from `docs/02` §4.
   - `npm run db:migrate` against the Neon **dev** branch.

10. **Integration test** `tests/integration/db.test.ts` (skips without `TEST_DATABASE_URL`): insert a theme with a valid spec and tags text, find it via `search_vector @@ websearch_to_tsquery('simple', 'lavender')` and via `name_en % 'lavendr'` (trigram); verify the collections check constraints reject a `user` collection without owner; clean up.

## Acceptance checks

- [ ] `npm run db:studio` shows every table from `docs/02` plus Better Auth tables.
- [ ] Migrations folder contains the initial migration + `search_extensions`; both applied.
- [ ] Unit tests pass; integration test passes when pointed at a Neon test branch.
- [ ] `npm run typecheck && npm run lint && npm run build` pass.

## Finish

List tables created and any option-name adjustments for Better Auth. Commit: `P01: database & auth core`.
