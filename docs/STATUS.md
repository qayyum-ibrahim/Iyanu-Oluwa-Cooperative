# Project status
Last updated: after step 2.1b

## Where we stopped
Step 2.1b done: `hasSuperAdmin` in the Store (both adapters and the shared contract), `createOwner` logic (`src/owner.ts`) and the terminal script `npm run setup:owner` (`src/setup-owner.ts`). 12 new tests. `npm run check` expected: 120 tests. Live check: the script creates the owner once and refuses the second time. Next: step 2.2a.

## Next step brief
Step 2.2a (M): the permission table. One list of named permissions, one table of which role has which, and a test that tries every role against every permission (OQ-13 default: the ZIP's 20 permissions plus `loans.disburse` and `payoff.process`). Pure logic, no database. Say "continue" to start it.
Owner inputs needed:
1. Nothing by hand if `docs/NEXT_FILES.txt` lists the needed files. Check that the pack shows them under `===== FILE: path =====` headings.
2. Replace `mirror/DECISIONS.md` in Project knowledge with `docs/DECISIONS.md` (now D-01 to D-24).
3. Optional: answer OQ-13 (final staff permission list) now. If you do not, the default stands.
Stable docs are in Project knowledge, folder `mirror/`.

## What exists
Docs, `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), money module (`src/money.ts`), password module (`src/password.ts`), email module (`src/email.ts`), owner logic (`src/owner.ts`), owner setup script (`src/setup-owner.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`, config files and 120 tests (shared helpers in `test/helpers/`). Route: `GET /health`. One owner can be created by script. No sign-in, no staff accounts, no UI code yet. No route uses the money module, the store, the password module, the email module or the owner logic.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; the setup script falls back to `file:./dev.db`). Planned: token or session secrets. Values never go in git. The owner email and password are typed when the script runs.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run check`, `npm start`.
Resume routine (3 actions):
1. Commit your work (from the repo root: `git add .`), then run `sh scripts/resume-pack.sh`.
2. Attach `~/Desktop/resume-pack.txt` to a new chat in this Project.
3. Send: `Resume IYANU-OLUWA. Resume pack attached.`

## Pinned versions
Server (exact, D-19, D-20, D-23): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15, prisma 7.10.0, @prisma/client 7.10.0, @prisma/adapter-better-sqlite3 7.10.0, dotenv 18.0.7, argon2 0.45.1.
Not yet installed: zod, exceljs, web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0.

## Roadmap
Full plan: PHASE_PLAN.md.
- 2.2a (M) Permission table and role × permission test.
- Then sign-in (login, tokens), staff accounts, audit log writes for sensitive actions.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-24. A-22, A-23, A-24 and A-25 are Claude's choices. No break-on-purpose run for steps 1.4 and 2.1b (the 2.1b run was not done; do it at the start of Phase 9 or when sign-in is built). The no-echo password prompt is verified only by the owner's live check. The numbering in TRACEABILITY.md skips R-25; I did not fill it.

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.