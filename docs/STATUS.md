# Project status
Last updated: after step 4.3 (all results from the owner's pasted output)

## Where we stopped
4.3 is verified on the owner's machine: `Store.transaction(fn)` exists in the interface and both adapters (D-45). `npm run check` ended with 31 test files, 915 tests, all passing. The Prisma half of the new contract ran on a real SQLite file. Nothing uses `transaction` yet. Break-on-purpose for the transaction code is owed (4.3b). Nothing calls the payments store yet, and no payment logic or route exists.

## Next step brief
Owner inputs needed:
1. Commit this step (commands below), then run `sh scripts/resume-pack.sh` and start a new chat.
2. Add D-45 to `mirror/DECISIONS.md` by hand (copy the paragraph from `docs/DECISIONS.md`).
3. No decision is needed for 4.3b. For 4.4 (payment route) my defaults apply unless you say otherwise: may two members share a name (A-90, yes)? Phone format check (A-90, no)? Same category on two lines (A-99, yes)? Cap on the number of lines (A-100, I will propose one)?
4. If `docs/DOMAIN_RULES.md` in the repo differs from the mirror, say so at the start. The repo wins.

## What exists
Docs, `scripts/resume-pack.sh`, `scripts/live-check-auth.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes, staff routes and logic, audit viewer, member logic and routes, payment categories (`categories.ts`), payment breakdown check (`breakdown.ts`), route guards, money, password and email modules, `account.ts`, owner logic, owner setup and reset scripts, permission table, sign-in logic with lockout, tokens, session logic, database client, storage interface and adapters (users, audit, refresh tokens, members, payments, and `transaction`), `prisma/schema.prisma`, six migrations, config files, and tests. Live routes: `GET /health`, `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password`, `GET /auth/me`, `POST /staff`, `GET /staff`, `PUT /staff/:id/permissions`, `POST /staff/:id/deactivate`, `/reactivate`, `PUT /staff/:id/password`, `GET /audit`, `POST /members`, `GET /members` (query `status` active, inactive or all, default active; `createdById` for the Super Admin only), `GET /members/:id`. Staff see only members they recorded. No member edit, delete or status route. No category route. No payment route or logic. No code uses `transaction` yet. No UI code yet. An owner account exists on the owner's dev database.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; default `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; set on the owner's machine). Values never go in git.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change; answer no if it asks to reset), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run reset:owner`, `npm run check`, `npm start` (run it from inside `server/`, A-48).
Live check of sign-in, `/auth/me`, `/staff`, passwords, `/audit` and `/members`: with the server running, `sh scripts/live-check-auth.sh` from the repo root. Each run adds one fictional staff account and two fictional members. Use a temporary database (`DATABASE_URL=file:./name.db`) for scripts that change the owner.
Break-on-purpose for the members code: `node ~/Desktop/mutate-3.2b.mjs 2>&1 | tail -100` from the repo root (script is not in git). Expected now: 76 mutations, 72 caught, 4 escaped (L26, R8, R14, R15).
Break-on-purpose for the categories code: `node ~/Desktop/mutate-3.3b.mjs 2>&1 | tail -60`. Expected now: 20 mutations, 19 caught, 1 escaped (C14).
Break-on-purpose for the breakdown code: `node ~/Desktop/mutate-4.1b.mjs 2>&1 | tail -60`. Expected now: 35 mutations, 35 caught, 0 escaped.
Break-on-purpose for the payments store code: `node ~/Desktop/mutate-4.2b.mjs 2>&1 | tail -80`. Expected now: 44 mutations, 42 caught, 1 escaped (PP10), 1 not applied (PP8: its find text matches twice). PP8 is run by `node ~/Desktop/mutate-4.2b-pp8.mjs 2>&1 | tail -20`. Expected: 2 failed, 8 passed (caught).
Break-on-purpose for the transaction code: not written yet (step 4.3b).
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
- 4.3b (S): break-on-purpose for the transaction code in both adapters (script on your Desktop, not in git).
- 4.4 (M, may be split): the payment route. It calls `checkBreakdown`, then saves the payment and its audit entry inside `transaction` (first user, A-88 style gap closed for payments). Sizes of the rest of Phase 4 are set when each step starts: Loan Repaid (DR-09), fake SMS (D-07), first-payment flow.
- Later small steps: retrofit `transaction` into A-25, A-39, A-54, A-58, A-62, A-88 (one step each).

## Open items
See OPEN_QUESTIONS.md. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-45. A-22 to A-110 are Claude's choices or checks. DR-02 and DR-04 stay "requested" and "proposed" until Mr. Aro signs off (OQ-00, A-96). Owed break-on-purpose runs: the transaction code (4.3b), step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b). A-42 (no per-IP limit) stays open. A-76 is a small optional test gap. A-91, A-92, A-98 and A-106 are equivalent escapes (read from code). A-107 to A-110 are the transaction notes (memory isolation, timeouts, nested failures, PostgreSQL retry). Reading the audit log or members is not itself audited (A-75, A-88). A locked owner is unlocked by `npm run reset:owner` (A-67). An access token stays valid until it expires, even after sign-out, change or reset (A-50, A-63, A-69); after deactivation it is refused at once. TRACEABILITY R-25 is marked unused. The mutation scripts live on the owner's Desktop, not in git. The Prisma test file takes about 50 s on this machine; timeouts are 120 s.

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