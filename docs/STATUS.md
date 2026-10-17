# Project status
Last updated: after step 2.6b (all results from the owner's pasted output)

## Where we stopped
2.6b is verified on the owner's machine: the break-on-purpose run for the audit viewer. 48 mutations, 45 caught, 3 escaped (V13 a boundary gap, R26 and P44 equivalent, A-76 to A-78). No source or test file changed: 26 test files, 726 tests (verified at 2.6). 2.6 is commit 35f6026. The audit viewer (`GET /audit`, Super Admin only) is finished. Phase 2 is complete. Next is Phase 3.

## Next step brief
Phase 3 (members and derived balances) starts next. The first step is sized in the next chat. Owner inputs needed:
1. Add D-39 to `mirror/DECISIONS.md` if you have not yet (text is in the docs message of 2.6).
2. Commit this docs step (commands in the message), then run `sh scripts/resume-pack.sh` and start a new chat.
3. OQ-09 (can staff pick members created by other staff?): answer, or the default stands (own members only).
4. Run this from the repo root and tell the next chat only if it prints a path that is not in `docs/NEXT_FILES.txt`: `grep -l "listByActor" server/test/*.ts`

## What exists
Docs, `scripts/resume-pack.sh`, `scripts/live-check-auth.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes, staff routes and logic, audit viewer (`audit-view.ts`, `audit-routes.ts`), route guards, money, password and email modules, `account.ts`, owner logic, owner setup and reset scripts, permission table, sign-in logic with lockout, tokens, session logic, database client, storage interface and adapters (with `audit.list`), `prisma/schema.prisma`, four migrations, config files, and tests. Live routes: `GET /health`, `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password`, `GET /auth/me`, `POST /staff`, `GET /staff`, `PUT /staff/:id/permissions`, `POST /staff/:id/deactivate`, `/reactivate`, `PUT /staff/:id/password`, and `GET /audit`. An owner account exists on the owner's dev database. No data routes, no UI code yet.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; default `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; set on the owner's machine). Values never go in git.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run reset:owner`, `npm run check`, `npm start` (run it from inside `server/`, A-48).
Live check of sign-in, `/auth/me`, `/staff`, passwords and `/audit`: with the server running, `sh scripts/live-check-auth.sh` from the repo root. Use a temporary database (`DATABASE_URL=file:./name.db`) for scripts that change the owner.
Git commands run from the repo root, not from `server/`.
Resume routine (3 actions):
1. Commit your work (from the repo root: `git add .`), then run `sh scripts/resume-pack.sh`.
2. Attach `~/Desktop/resume-pack.txt` to a new chat in this Project.
3. Send: `Resume IYANU-OLUWA. Resume pack attached.`

## Pinned versions
Server (exact, D-19, D-20, D-23): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15, prisma 7.10.0, @prisma/client 7.10.0, @prisma/adapter-better-sqlite3 7.10.0, dotenv 18.0.7, argon2 0.45.1. No new dependency since 2.3a.
Not yet installed: zod, exceljs, web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0.

## Roadmap
Full plan: PHASE_PLAN.md.
- Phase 3: members and derived balances, with the "staff see only their own records" rule (DR-13) built into the data routes. The first step is sized in the next chat.
- Phase 4: payments, breakdown check, Loan Repaid, fake SMS, first-payment flow.

## Open items
See OPEN_QUESTIONS.md. OQ-09 needs an answer before Phase 3 routes (default: own members only). Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-39. A-22 to A-78 are Claude's choices or checks. A-70 and A-77 are settled (equivalent mutants, duplicated checks). A-76 is a small test gap (optional). Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b). A-42 (no per-IP limit) stays open. Reading the audit log is not itself audited (A-75). A locked owner is unlocked by `npm run reset:owner` (A-67); anyone with server shell and database access can reset the owner (A-68). An access token stays valid until it expires, even after sign-out, change or reset (A-50, A-63, A-69); after deactivation it is refused at once. TRACEABILITY R-25 is marked unused. Commits ddf8f2b and 566cd6a, and c9a6480 and 52a50c0, have the same message (harmless). The mutation scripts live on the owner's Desktop, not in git.

## How we work
Delivery: whole files pasted in chat (exact find-and-replace text for files with one or two small changes). Mode: lean.
Handoff rule (every step, no exceptions):
1. A step message gives files, tests, commands and the live check only. No docs.
2. The owner runs the checks and pastes the real output in the same chat.
3. Only then Claude gives the docs as a second message, with results labelled from the pasted output (D-37). If a check fails, no docs.
4. The docs message ends with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline. Write it for the next step only. Drop files the next step does not touch.
5. Give STATUS.md as a whole file, never as partial edits.
6. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
7. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry, and does not ask for checks of an earlier step. If a file is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
8. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.