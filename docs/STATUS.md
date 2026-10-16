# Project status
Last updated: after step 2.5a (written as if the checks pass; not verified yet)

## Where we stopped
Step 2.4b and the docs fix 2.4c are verified and committed (commit 7f44280; 14 files, 389 tests; live check 12 of 12). Step 2.5a is written and NOT verified: `server/src/guards.ts` (`requireAuth`, `requirePermission`, `getAuth`), `GET /auth/me` in `auth-routes.ts`, two new test files (72 tests by my count), and 7 new live checks. Expected `npm run check`: 16 test files, 461 tests. Expected live check: "19 passed, 0 failed". The server must be restarted to serve `/auth/me`.

## Next step brief
Step 2.5b (M): staff accounts. A stored permission list, and create and list staff through the API (Super Admin only). Owner inputs needed:
1. Run the 2.5a commands from that message: `npm run check` in `server/`, restart the server, then `sh scripts/live-check-auth.sh`. Report the last lines of each. Commit only if both pass.
2. Make sure no old server is running before the live check (`lsof -nP -iTCP:3000 -sTCP:LISTEN` prints nothing).
3. Optional: the break-on-purpose edits listed in the 2.5a message.
4. Optional: answer OQ-13 (final staff permission list). The default stands if you do not.
5. Optional: say whether you want a reset-password script. It is outside the plan and needs your decision.

## What exists
Docs, `scripts/resume-pack.sh`, `scripts/live-check-auth.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes (`src/auth-routes.ts`), route guards (`src/guards.ts`, 2.5a), money, password and email modules, owner logic and setup script, permission table, sign-in logic with lockout (`src/auth.ts`), tokens (`src/tokens.ts`), session logic (`src/sessions.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, three migrations, config files, and tests. Live routes: `GET /health`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, and `GET /auth/me` once 2.5a is verified. An owner account exists on the owner's dev database. No staff accounts, no data routes, no UI code yet.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; default `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; set on the owner's machine; read by the running server). Values never go in git.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run check`, `npm start` (run it from inside `server/`, A-48).
Live check of sign-in and `/auth/me`: with the server running, `sh scripts/live-check-auth.sh` from the repo root.
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
- 2.5b (M) Staff accounts: stored permission list (replaces `subjectOf` in `guards.ts`, A-49), create and list staff through the API (Super Admin only), audit entries for those actions.
- Then audit writes for other sensitive actions. A reset-password script if the owner wants one.
- Phase 3: members and derived balances, with the "staff see only their own records" rule (DR-13) built into the data routes.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-33. A-22 to A-52 are Claude's choices or checks. Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b) and `guards.ts` (2.5a; owner can do it, see the 2.5a message). A-42 (no per-IP limit) stays open. No reset-password feature; a forgotten owner password needs a dev database reset. The Store has no way to list audit entries with no actor, and no way to deactivate a user (A-28, A-30). A locked user, including the owner, has no manual unlock (A-43). An access token stays valid until it expires, even after sign-out (A-50). TRACEABILITY.md skips R-25. `server/tsconfig.json` `include` lists `test` twice (harmless). Commits ddf8f2b and 566cd6a have the same message (cause not seen, harmless). `mirror/DECISIONS.md` in Project knowledge must get D-33 by hand.

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Write NEXT_FILES for the next step only, from its brief: the files it will change, the files those import, the tests it must run, the config needed to run `npm run check`, and any script or doc it edits. Do not carry the old list over. Drop files the next step does not touch.
3. Give STATUS.md as a whole file, never as partial edits.
4. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
5. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
6. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.