# Project status
Last updated: after step 2.1a

## Where we stopped
Step 2.1a done: argon2id password hashing (`src/password.ts`) and email normalising (`src/email.ts`), 31 new tests. `npm run check` expected: 110 tests. Phase 2 has started. Next: step 2.1b.

## Next step brief
Step 2.1b (M): the owner setup script. It adds a `hasSuperAdmin` method to the Store (both adapters and the contract tests, D-21) so it can refuse a second Super Admin, then the script that asks for the owner email and password at run time. Say "continue" to start it.
Owner inputs needed:
1. Nothing by hand if `docs/NEXT_FILES.txt` lists the needed files. Check that the pack shows them under `===== FILE: path =====` headings.
2. Replace `mirror/DECISIONS.md` in Project knowledge with `docs/DECISIONS.md` (now D-01 to D-23).
3. The owner email (OQ-02) and the owner password are typed only when the setup script runs. Never in chat or in git.
Stable docs are in Project knowledge, folder `mirror/`.

## What exists
Docs, `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), money module (`src/money.ts`), password module (`src/password.ts`), email module (`src/email.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`, config files and 110 tests (shared helpers in `test/helpers/`). Route: `GET /health`. No accounts, sign-in or UI code yet. No route uses the money module, the store, the password module or the email module.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`). Planned: token or session secrets, `OWNER_EMAIL`. Values never go in git.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run check`, `npm start`.
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
- 2.1b (M) Store `hasSuperAdmin` and the owner setup script.
- Then sign-in, permission table, staff accounts, audit log writes.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-23. A-21 is settled by D-22 (owner may overrule). A-22 (password rules) and A-23 (email rules) are new. TRACEABILITY.md has not been seen since step 1.4 and is not updated for step 2.1a; 2.1b updates it. No break-on-purpose run for step 1.4. DEV_SETUP.md lacks the database commands; 2.1b fixes it.

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.