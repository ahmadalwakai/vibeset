---
description: 'Plan and build a new feature the Vibeset way — spec first, every role considered, then implementation'
agent: 'agent'
---

# New feature

Use after Phase 1 for anything not covered by the phase prompts. The feature description follows this prompt.

## 1. Plan first (write it in the chat, then wait for my "go")

- **Restate** the feature in 2–3 sentences and the problem it solves.
- **Roles affected**: visitor / user / creator / admin / public API / scripts — what changes for each.
- **Data**: schema changes (with migration plan: expand → backfill → switch → contract), `ThemeSpec` changes (version bump?).
- **Contracts**: new/changed actions, routes, DTOs, cache tags, rate limits, audit events, permission rows.
- **UI**: screens, components (reuse first), loading/empty/error/success states, mobile layout, RTL, motion.
- **Risks**: race conditions, cache staleness, abuse, privacy (Children's Code), performance budget.
- **Tests**: unit, integration, e2e additions.
- **Docs to update**: list the exact sections.

Ask me only questions whose answers change what you build. Otherwise pick the sensible default and say so.

## 2. Build (after "go")

1. Update the docs sections listed in the plan.
2. Schema + migration (reviewed SQL), then services with tags, then actions/routes, then UI, then messages (EN + AR).
3. Tests.
4. Run `/review` and fix blockers.
5. Commit: `feat: <feature>`.
