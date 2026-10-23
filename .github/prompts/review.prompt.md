---
description: 'Quality gate — review current changes against Vibeset rules, run all checks, find cross-role regressions, fix blockers'
agent: 'agent'
---

# Review (quality gate)

Run this at the end of every phase and before every release. Be strict: you are the reviewer, not the author.

Read: [global rules](../copilot-instructions.md) · [quality checklists](../../docs/08-quality-checklists.md) · [API & permissions §9](../../docs/03-api-and-permissions.md)

## Steps

1. **Scope** — `git status`, `git diff --stat`, then read the full diff of every changed file.

2. **Rules** — check each changed file against `.github/copilot-instructions.md`, the matching `.github/instructions/*.instructions.md`, and the relevant `docs/` section. Flag: `any`, unchecked casts, missing Zod validation, missing guard, business logic in actions/components, direct `process.env`, hard-coded strings, raw hex/px in components, physical (non-logical) style props, missing loading/empty/error states, `dangerouslySetInnerHTML`, `console.log`, `drizzle-kit push`, missing `'use cache'`/`cacheTag` on public reads, per-user data inside `'use cache'`, `setRequestLocale`, `middleware.ts`.

3. **Consumers** — for every changed export (service, action, query, DTO, component prop, route, message key), search all usages (`rg -n "<name>"`) and confirm visitor, user, creator, admin, `/api/v1` and scripts still work. List each consumer you checked.

4. **Data & cache** — mutations invalidate exactly the tags in `docs/03` §7; ownership enforced in services; public queries filter `status = 'published'`; concurrency (optimistic version checks, atomic upserts); no N+1 queries in lists.

5. **Client correctness** — race conditions (abort controllers, stale responses), memory leaks (listeners, observers, object URLs, canvases), optimistic rollbacks, hydration mismatches (browser-only values read after mount).

6. **i18n/RTL/a11y** — keys exist in both `messages/en.json` and `messages/ar.json` (write a quick script to diff key sets); RTL layout of new UI; labels, focus, keyboard.

7. **Run** — `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Paste the summary of each.

8. **Report** in this format:
   - **Blockers** (must fix): `file:line` — problem — fix.
   - **Should fix**: …
   - **Nice to have**: …
   - **Manual checks for the human**: exact steps per role/device that automated checks can't cover.

9. **Fix all Blockers** directly, re-run step 7, and update the report. Don't apply "Should fix" items unless trivial and safe; list them.
