# Project status
Last updated: after step 3.2 (all results from the owner's pasted output)

## Where we stopped
3.2 is verified on the owner's machine: member logic and routes (D-41). `npm run check` is clean: 29 test files, 828 tests. The live check printed "87 passed, 0 failed" against the real server and the real SQLite database. `POST /members`, `GET /members` and `GET /members/:id` are live, with the DR-13 scope rule. No screen yet, and no break-on-purpose run for the members code. Next is 3.2b (break on purpose), then 3.3. Phase 3 is in progress.

## Next step brief
Owner inputs needed:
1. Add D-41 to `mirror/DECISIONS.md` (text is in the docs message of 3.2). The repo copy is the real one.
2. Stop the server if it is still running (Ctrl+C), then check `lsof -i :3000` prints nothing.
3. Commit this step (commands in the docs message), then run `sh scripts/resume-pack.sh` and start a new chat.
4. No blocking questions. Two optional ones (my defaults apply, A-90): may two members share the same name? Should phone numbers be checked for a format?

## What exists
Docs, `scripts/resume-pack.sh`, `scripts/live-check-auth.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes, staff routes and logic, audit viewer, member logic (`members.ts`) and routes (`members-routes.ts`), route guards, money, password and email modules, `account.ts`, owner logic, owner setup and reset scripts, permission table, sign-in logic with lockout, tokens, session logic, database client, storage interface and adapters (users, audit, refresh tokens, members), `prisma/schema.prisma`, five migrations, config files, and tests. Live routes: `GET /health`, `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password`, `GET /auth/me`, `POST /staff`, `GET /staff`, `PUT /staff/:id/permissions`, `POST /staff/:id/deactivate`, `/reactivate`, `PUT /staff/:id/password`, `GET /audit`, `POST /members`, `GET /members` (query `status` active, inactive or all, default active; `createdById` for the Super Admin only), `GET /members/:id`. Staff see only members they recorded; a member they may not see answers 404. No member edit, delete or status route. No UI code yet. An owner account exists on the owner's dev database.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; default `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; set on the owner's machine). Values never go in git.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change; answer no if it asks to reset), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run reset:owner`, `npm run check`, `npm start` (run it from inside `server/`, A-48).
Live check of sign-in, `/auth/me`, `/staff`, passwords, `/audit` and `/members`: with the server running, `sh scripts/live-check-auth.sh` from the repo root. Each run adds one fictional staff account and two fictional members. Use a temporary database (`DATABASE_URL=file:./name.db`) for scripts that change the owner.
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
- 3.2b (S): break-on-purpose run for `members.ts`, `members-routes.ts` and the members store in both adapters. One throwaway script on the Desktop, as in 2.6b.
- 3.3 (S or M): payment category list (DR-04, Building Funds added), refundable flags (DR-03), "Membership Withdrawal" system-only. Pure logic with tests. Balances are derived in Phase 4 (D-17).
- Phase 4: payments, breakdown check, Loan Repaid, fake SMS, first-payment flow.

## Open items
See OPEN_QUESTIONS.md. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-41. A-22 to A-90 are Claude's choices or checks. Owed break-on-purpose runs: member logic and routes (3.2), the members store (3.1), step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b). A-42 (no per-IP limit) stays open. A-76 is a small optional test gap. Reading the audit log or members is not itself audited (A-75, A-88). A locked owner is unlocked by `npm run reset:owner` (A-67). An access token stays valid until it expires, even after sign-out, change or reset (A-50, A-63, A-69); after deactivation it is refused at once. TRACEABILITY R-25 is marked unused. The mutation scripts live on the owner's Desktop, not in git. The Prisma test file takes about 44 s on this machine; timeouts are 120 s.

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