# Project status
Last updated: after step 2.5c (written as if the checks pass; not verified yet)

## Where we stopped
2.5b is verified and committed (5a1b368; 18 files, 532 tests; live check 33 of 33) and its break-on-purpose run is done (7 of 7 caught). Step 2.5c (D-35) is written, not verified: `UserStore.setActive` in the Store and both adapters, `deactivateStaff` and `reactivateStaff` in `server/src/staff.ts`, routes `POST /staff/:id/deactivate` and `/reactivate`, `parsePermissions` exported with its own tests, 52 new tests by my count, 11 new live checks. Expected `npm run check`: 20 test files, 584 tests. Expected live check: "44 passed, 0 failed". No schema change, so no `db:deploy`. Restart the server before the live check.

## Next step brief
Step 2.5d (M, proposed, OQ-15): change own password, and Super Admin resets a Staff password. Owner inputs needed:
1. Run the 2.5c commands from that message: `npm run check` in `server/`, make sure port 3000 is free, `npm start`, then `sh scripts/live-check-auth.sh` from the repo root. Report the last lines of each. Commit only if all pass.
2. Optional: the break-on-purpose runs P1 to P5 and S1 to S7 from the 2.5c message. Report which failed.
3. Decide OQ-15 or accept the default: a signed-in user changes their own password with the current one, and all their sessions end; the Super Admin sets a new password for a Staff account, and their sessions end; no email links, no forced change. A forgotten owner password is reset by a terminal script in step 2.5e.
4. Add D-35 to `mirror/DECISIONS.md` in Project knowledge by hand.

## What exists
Docs, `scripts/resume-pack.sh`, `scripts/live-check-auth.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes, staff routes and logic (create, list, change permissions, deactivate, reactivate), route guards, money, password and email modules, owner logic and setup script, permission table, sign-in logic with lockout, tokens, session logic, database client, storage interface and adapters, `prisma/schema.prisma`, four migrations, config files, and tests. Live routes: `GET /health`, `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`, `POST /staff`, `GET /staff`, `PUT /staff/:id/permissions`, and (once 2.5c is verified) `POST /staff/:id/deactivate` and `/reactivate`. An owner account exists on the owner's dev database. No data routes, no UI code yet.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; default `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; set on the owner's machine). Values never go in git.

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
- 2.5d (M, proposed) Change own password; Super Admin resets a Staff password (OQ-15).
- 2.5e (S or M, proposed) Terminal script to reset a forgotten owner password.
- Then audit viewer (list entries, including those with no actor, A-28).
- Phase 3: members and derived balances, with the "staff see only their own records" rule (DR-13) built into the data routes.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2 or 3. Phase 6 waits on OQ-00, OQ-06 and OQ-07. OQ-15 (change-password design) has a default. Owner may overrule D-19 to D-35. A-22 to A-60 are Claude's choices or checks. Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b), and the 2.5c set (P1 to P5, S1 to S7). A-42 (no per-IP limit) stays open. A forgotten owner password needs a dev database reset until 2.5e. A locked user, including the owner, has no manual unlock (A-43). An access token stays valid until it expires, even after sign-out (A-50); after deactivation it is refused at once. TRACEABILITY.md skips R-25. `server/tsconfig.json` `include` lists `test` twice (harmless). Commits ddf8f2b and 566cd6a have the same message (harmless). `mirror/DECISIONS.md` in Project knowledge must get D-35 by hand.

## How we work
Delivery: whole files pasted in chat (exact find-and-replace text for files with one or two small changes). Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Write NEXT_FILES for the next step only, from its brief: the files it will change, the files those import, the tests it must run, the config needed to run `npm run check`, and any script or doc it edits. Do not carry the old list over. Drop files the next step does not touch.
3. Give STATUS.md as a whole file, never as partial edits.
4. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
5. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
6. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.