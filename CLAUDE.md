# CLAUDE.md

**Start by reading [`docs/PROJECT-MAP.md`](docs/PROJECT-MAP.md)** — the single-file reference for this
project (stack, 32 pages, 75 API routes, 30 models, auth rules, live-meeting + recording pipelines,
14 hard invariants, exact commands, Railway IDs, test map, copy-paste recipes). It exists so an agent
does **not** need to read the codebase to get oriented (≈6k tokens instead of ≈250k).

Rules that outrank convenience:

- Read the map first, then only the files it names for your change. Keep it updated in the same commit
  as any structural change (new page / route / model / socket event / env var / invariant).
- Arabic RTL first on every screen; English only via `src/lib/i18n.ts`.
- Never claim done without measured evidence (`npx tsc --noEmit`, `npx vitest run`, and the relevant
  Playwright spec against **staging**). Production gets read-only `06-smoke` only.
- `AGENTS.md` holds the Superpowers skill workflow; follow it (`test-driven-development`,
  `systematic-debugging`, `verification-before-completion`).
- No secrets in this repository (it is public).
