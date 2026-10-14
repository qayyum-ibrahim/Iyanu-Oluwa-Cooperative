# Project status
Last updated: after step 1.5

## Where we stopped
Step 1.5 done and verified on the owner's machine: `Store` interface, in-memory and Prisma adapters, 22 contract tests. `npm run check` passes with 79 tests. Committed `6ddf251` and pushed. Phase 1 is complete. Next: Phase 2, step 2.1.

## Next step brief
Step 2.1 (M): argon2 password hashing (install check on macOS, A-10) and the setup script for the owner account. Say "continue" to start Phase 2.
Owner inputs needed. Answer once, in your first message:
1. Nothing by hand if `docs/NEXT_FILES.txt` lists the needed files. Check that the pack shows them under `===== FILE: path =====` headings.
2. The owner email (OQ-02) is entered only when the setup script runs. Never in chat or in git.
Stable docs are in Project knowledge, folder `mirror/`. DECISIONS changed (D-20, D-21): replace it there.

## What exists
Docs, `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), money module (`src/money.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`, config files and 79 tests (shared helpers in `test/helpers/`). Route: `GET /health`. No accounts, sign-in or UI code yet. No route uses the money module or the store.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`). Planned: token or session secrets, `OWNER_EMAIL`. Values never go in git.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run check`, `npm start`.
Resume routine (3 actions):
1. Commit your work (from the repo root: `git add .`), then run `sh scripts/resume-pack.sh`.
2. Attach `~/Desktop/resume-pack.txt` to a new chat in this Project.
3. Send: `Resume IYANU-OLUWA. Resume pack attached.`

## Pinned versions
Server (exact, D-19 and D-20): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15, prisma 7.10.0, @prisma/client 7.10.0, @prisma/adapter-better-sqlite3 7.10.0, dotenv 18.0.7.
Not yet installed: zod, exceljs, argon2, web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0.

## Roadmap
Full plan: PHASE_PLAN.md.
- 2.1 (M) argon2 and the owner setup script.
- Then sign-in, permission table, staff accounts, audit log writes.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19, D-20 and D-21. A-21: email letter case is undecided (Phase 2). No break-on-purpose run for step 1.4. DEV_SETUP.md has not been seen and lacks the database commands.

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.