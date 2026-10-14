# Project status
Last updated: after step 1.3

## Where we stopped
Step 1.3 done (pending your check): money module in `server/src/money.ts` with 47 tests (50 in all). Next: step 1.4.

## Next step brief
Step 1.4 (M): database schema (users, audit), first migration, DATA_MODEL.md. Claude pins Prisma 7.10.0 (A-02), checks that it installs, and checks the BigInt range (A-03).
Owner inputs needed. Answer once, in your first message:
1. Paste the output of `cat docs/TRACEABILITY.md`. Claude has not seen this file yet.
2. After the install in step 1.4, paste its last lines. The step 1.2 install took 38 minutes on your machine, so the Prisma install may be slow too.
Files the chat gets automatically: those listed in `docs/NEXT_FILES.txt`. The script adds each one under a heading like `===== FILE: path =====`. No such heading means no files were requested.
Stable docs are in Project knowledge, folder `mirror/`.

## What exists
Docs (DEV_SETUP.md included), `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only, never run or edited), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), money module (`src/money.ts`: `parseNaira`, `formatNaira`, `sumKobo`), config files and 50 tests. Route: `GET /health`. No database, accounts or UI code yet. The money module is not used by any route yet.

## Settings (names only)
`PORT` (optional). Planned: `DATABASE_URL`, token or session secrets, `OWNER_EMAIL` (setup script input). Values never go in git.

## Commands
Inside `server/`: `npm install`, `npm run check`, `npm start`. See DEV_SETUP.md.
Resume routine (3 actions):
1. Commit your work, then run `sh scripts/resume-pack.sh`. It warns if something is uncommitted.
2. Attach `~/Desktop/resume-pack.txt` to a new chat in this Project.
3. Send: `Resume IYANU-OLUWA. Resume pack attached.`

Mirrors: `mirror/` in Project knowledge holds copies of DECISIONS, DOMAIN_RULES, PROJECT_BRIEF, GLOSSARY, SOURCES and PHASE_PLAN. DECISIONS was replaced by the owner after D-19 (2026-10-14). The other five are as of commit 2a0c495. The repo wins on any conflict. When one of these docs changes, the owner replaces the file in Project knowledge. Step 1.3 changed none of them.

## Pinned versions
Server (exact, see D-19): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15.
Not yet installed, candidates in D-13: prisma, @prisma/client, zod, exceljs, argon2, and the web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0 (owner, 2026-10-13).

## Roadmap
Full plan: PHASE_PLAN.md. Next steps:
- 1.4 (M) Database schema (users, audit), migration, DATA_MODEL.md. Pins Prisma and checks A-02, A-03.
- 1.5 (S) In-memory adapter for tests.
- Then Phase 2: sign-in, setup script for the owner, permissions, audit log.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 1. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner to confirm that the 0.1c item 4 oddities (`mm.md`, modified STATUS) are gone. Owner may overrule D-19 (TypeScript 6.0.3 instead of 7.0.2). TRACEABILITY.md has not been updated for steps 1.2 and 1.3 because Claude has not seen it.

## How we work
Delivery: whole files pasted in chat. Mode: lean.