# AGENTS.md — Superpowers workflow (installed from github.com/obra/superpowers)

This project uses the **Superpowers** development methodology. The full skill
collection is installed at `.agents/skills/` (15 skills, Agent Skills spec format).

## Bootstrap rule (mirrors superpowers' Pi extension)

At the start of EVERY session (and after any compaction), you MUST read
`.agents/skills/using-superpowers/SKILL.md` and follow it for the whole session.

## The rule

**Invoke relevant skills BEFORE any response or action** — including clarifying
questions or codebase exploration. Announce: "Using [skill] to [purpose]."

Key routing (from `using-superpowers`):

| Situation | Skill to invoke first |
|---|---|
| Building a new feature / component / behavior | `superpowers:brainstorming` |
| Fixing a bug / unexpected behavior | `superpowers:systematic-debugging` |
| Writing any implementation plan | `superpowers:writing-plans` |
| Executing a plan | `superpowers:executing-plans` |
| Writing any code | `superpowers:test-driven-development` (red/green, YAGNI, DRY) |
| About to claim work is complete | `superpowers:verification-before-completion` |
| Requesting / receiving code review | `superpowers:requesting-code-review` / `receiving-code-review` |
| Starting a branch for the work | `superpowers:using-git-worktrees` |
| Finishing a development branch | `superpowers:finishing-a-development-branch` |

Process skills set the approach; implementation skills carry it out.

## Project context

Single-teacher Arabic LMS (Next.js App Router + TypeScript + Prisma/PostgreSQL +
Socket.io/WebRTC + Cloudflare R2 + YouTube Data API v3), deploy target Railway
Hobby plan. Original spec: `../prompt.md`. Build history: `../TASKS.md`.
