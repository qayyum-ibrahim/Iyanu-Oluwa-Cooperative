# Project status
Last updated: after step 2.5e (all results from the owner's pasted output)

## Where we stopped
2.5e is verified on the owner's machine: `npm run check` clean, 24 test files, 664 tests (649 + 15). `npm run reset:owner` was run on a temporary database (pipe refused, mismatch refused, reset worked, empty database refused). The live check printed "60 passed, 0 failed". The break-on-purpose run for `owner-reset.ts` is owed and is the next step. Not shown in the paste: the server stop after the live check, and ending real sessions through the script (covered by tests only).

## Next step brief
Step 2.5f (S, proposed): break-on-purpose run for `owner-reset.ts`, then the audit viewer. Owner inputs needed:
1. Commit this docs step (commands in the message), then run `sh scripts/resume-pack.sh` and start a new chat.
2. Replace `mirror/DECISIONS.md` in Project knowledge with `docs/DECISIONS.md` (it now has D-38).
3. No decision needed. Default: I write one throwaway mutation script (like 2.5d), you run it from your Desktop and paste the summary. Before that, check that port 3000 is free (`lsof -i :3000` prints nothing) in case the live-check server is still running.

## What exists
Docs, `scripts/resume-pack.sh`, `scripts/live-check-auth.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes (including change own password), staff routes and logic (create, list, change permissions, deactivate, reactivate, reset password), route guards, money, password and email modules, `account.ts`, owner logic, owner setup script and owner reset script (`owner-reset.ts`, `reset-owner-password.ts`), permission table, sign-in logic with lockout, tokens, session logic, database client, storage interface and adapters, `prisma/schema.prisma`, four migrations, config files, and tests. Live routes: `GET /health`, `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password`, `GET /auth/me`, `POST /staff`, `GET /staff`, `PUT /staff/:id/permissions`, `POST /staff/:id/deactivate`, `/reactivate`, and `PUT /staff/:id/password`. An owner account exists on the owner's dev database. No data routes, no UI code yet.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; default `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; set on the owner's machine). Values never go in git.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run reset:owner`, `npm run check`, `npm start` (run it from inside `server/`, A-48).
Live check of sign-in, `/auth/me`, `/staff` and passwords: with the server running, `sh scripts/live-check-auth.sh` from the repo root. Use a temporary database (`DATABASE_URL=file:./name.db`) for scripts that change the owner.
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
- 2.5f (S, proposed) Break-on-purpose run for `owner-reset.ts`.
- Then audit viewer (list entries, including those with no actor, A-28).
- Phase 3: members and derived balances, with the "staff see only their own records" rule (DR-13) built into the data routes.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2 or 3. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-38. A-22 to A-69 are Claude's choices or checks. Owed break-on-purpose runs: `owner-reset.ts` (2.5e), step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b). A-42 (no per-IP limit) stays open. A locked owner is unlocked by `npm run reset:owner` (A-67); anyone with server shell and database access can reset the owner (A-68). An access token stays valid until it expires, even after sign-out, change or reset (A-50, A-63, A-69); after deactivation it is refused at once. TRACEABILITY R-25 is marked unused. Commits ddf8f2b and 566cd6a, and c9a6480 and 52a50c0, have the same message (harmless). The mutation scripts live on the owner's Desktop, not in git.

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