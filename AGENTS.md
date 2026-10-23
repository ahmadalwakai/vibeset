# Agent instructions — Vibeset

- Follow `.github/copilot-instructions.md` (global rules) and the path-scoped rules in `.github/instructions/`.
- Specs in `docs/` are the source of truth. Phase prompts live in `.github/prompts/` and run in order (`p00` → `p17`).
- If code and docs disagree, stop and say so. When a decision changes, update the doc in the same change.
- Before finishing any task: `npm run typecheck && npm run lint && npm test` (and `npm run build` at the end of a phase), then summarise changed files and manual checks.
