# Project status
Last updated: after step 1.2

## Where we stopped
Step 1.2 done (pending your check): server skeleton in `server/` with a `/health` route, 3 tests and `npm run check`. Next: step 1.3.

## Next step brief
Step 1.3 (S): money module (whole kobo, D-15) with tests. Claude will ask for the current DOMAIN_RULES only if the repo differs from the mirror.
Owner inputs needed: none expected. Paste the last lines of `npm run check` if a check fails.
Files the chat gets automatically: those listed in `docs/NEXT_FILES.txt`. The script adds each one under a heading like `===== FILE: path =====`. No such heading means no files were requested.
Stable docs are in Project knowledge, folder `mirror/`. DECISIONS changed in step 1.2, so replace `mirror/DECISIONS.md` there with the repo copy.

## What exists
Docs (DEV_SETUP.md added), `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only, never run or edited), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), config files and 3 tests. Route: `GET /health`. No database, accounts or UI code yet.

## Settings (names only)
`PORT` (optional). Planned: `DATABASE_URL`, token or session secrets, `OWNER_EMAIL` (setup script input). Values never go in git.

## Commands
Inside `server/`: `npm install`, `npm run check`, `npm start`. See DEV_SETUP.md.
Resume routine (3 actions):
1. Commit your work, then run `sh scripts/resume-pack.sh`. It warns if something is uncommitted.
2. Attach `~/Desktop/resume-pack.txt` to a new chat in this Project.
3. Send: `Resume IYANU-OLUWA. Resume pack attached.`

Mirrors: `mirror/` in Project knowledge holds copies of DECISIONS, DOMAIN_RULES, PROJECT_BRIEF, GLOSSARY, SOURCES and PHASE_PLAN. The repo wins on any conflict. When one of these docs changes, the mirror must be replaced too. The owner replaces the file in Project knowledge.

## Pinned versions
Server (exact, see D-19): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15.
Not yet installed, candidates in D-13: prisma, @prisma/client, zod, exceljs, argon2, and the web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0 (owner, 2026-10-13).

## Roadmap
Full plan: PHASE_PLAN.md. Next steps:
- 1.3 (S) Money module (whole kobo) with tests.
- 1.4 (M) Database schema (users, audit), migration, DATA_MODEL.md. Pins Prisma and checks A-02, A-03.
- 1.5 (S) In-memory adapter for tests.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 1. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner to confirm that the 0.1c item 4 oddities (`mm.md`, modified STATUS) are gone. Owner may overrule D-19 (TypeScript 6.0.3 instead of 7.0.2).

## How we work
Delivery: whole files pasted in chat. Mode: lean.