# Project status
Last updated: after step 2.5b (written as if the checks pass; not verified yet)

## Where we stopped
Step 2.5a is verified and committed (commit 9f5cc96; 16 files, 461 tests; live check 19 of 19). 2.5b is verified and committed (5a1b368; 18 files, 532 tests; live check 33 of 33) and that its break-on-purpose run is done: stored staff permissions (`User.permissions`, migration `20261016120000_user_permissions`), `UserRecord.permissions`, `list()` and `setPermissions()` in the Store and both adapters, `server/src/staff.ts`, `server/src/staff-routes.ts` (`/staff`), `subjectOf` reading the stored list, 71 new tests by my count, 14 new live checks. Expected `npm run check`: 18 test files, 532 tests. Expected live check: "33 passed, 0 failed". The server must be restarted after `npm run db:deploy`.

## Next step brief
Step 2.5c (M, proposed): deactivate and reactivate staff (Super Admin only), closing A-30. It revokes the user's refresh tokens and writes audit entries. Owner inputs needed:
1. Run the 2.5b commands from that message, in order: `npm run db:deploy`, `npx prisma migrate dev` (expect "Already in sync"), `npm run check` in `server/`, restart the server, then `sh scripts/live-check-auth.sh`. Report the last lines of each. Commit only if all pass.
2. Make sure no old server is running before the live check (`lsof -nP -iTCP:3000 -sTCP:LISTEN` prints nothing).
3. Optional: the break-on-purpose edits listed in the 2.5b message.
4. Decide: do you want 2.5c as proposed, or go straight to Phase 3 (members)? Also say whether you want a change-password or reset-password step (A-55). Both are outside the plan until you say so.

## What exists
Docs, `scripts/resume-pack.sh`, `scripts/live-check-auth.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes (`src/auth-routes.ts`), staff routes (`src/staff-routes.ts`, 2.5b), staff logic (`src/staff.ts`, 2.5b), route guards (`src/guards.ts`), money, password and email modules, owner logic and setup script, permission table, sign-in logic with lockout (`src/auth.ts`), tokens (`src/tokens.ts`), session logic (`src/sessions.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, four migrations, config files, and tests. Live routes: `GET /health`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, and (once 2.5b is verified) `POST /staff`, `GET /staff`, `PUT /staff/:id/permissions`. An owner account exists on the owner's dev database. No data routes, no UI code yet.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; default `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; set on the owner's machine; read by the running server). Values never go in git.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run check`, `npm start` (run it from inside `server/`, A-48).
Live check of sign-in, `/auth/me` and `/staff`: with the server running, `sh scripts/live-check-auth.sh` from the repo root.
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
- 2.5c (M, proposed) Deactivate and reactivate staff; closes A-30.
- Then audit viewer (list entries, including those with no actor, A-28). A change-password or reset-password step if the owner wants one.
- Phase 3: members and derived balances, with the "staff see only their own records" rule (DR-13) built into the data routes.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2 or 3. Phase 6 waits on OQ-00, OQ-06 and OQ-07. OQ-13 is closed (default list). Owner may overrule D-19 to D-34. A-22 to A-57 are Claude's choices or checks. Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b), parsePermissions in prisma-store.ts (2.5b). A-42 (no per-IP limit) stays open. No reset-password or change-password feature (A-55); a forgotten owner password needs a dev database reset. There is no way to deactivate a user (A-30) until 2.5c. A locked user, including the owner, has no manual unlock (A-43). An access token stays valid until it expires, even after sign-out (A-50). TRACEABILITY.md skips R-25. `server/tsconfig.json` `include` lists `test` twice (harmless). Commits ddf8f2b and 566cd6a have the same message (harmless). `mirror/DECISIONS.md` in Project knowledge must get D-34 by hand.

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Write NEXT_FILES for the next step only, from its brief: the files it will change, the files those import, the tests it must run, the config needed to run `npm run check`, and any script or doc it edits. Do not carry the old list over. Drop files the next step does not touch.
3. Give STATUS.md as a whole file, never as partial edits.
4. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
5. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
6. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.