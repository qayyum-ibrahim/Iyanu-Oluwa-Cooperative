# Project status
Last updated: after step 2.4b (verified on the owner's machine)

## Where we stopped
Step 2.4b is verified on the owner's machine: `npm run check` clean (14 files, 389 tests), and the live check `sh scripts/live-check-auth.sh` printed "12 passed, 0 failed" against the running server and the real SQLite database. `server/src/server.ts` serves `/auth/login`, `/auth/refresh` and `/auth/logout` with the Prisma store and `TOKEN_SECRET`, reports a busy port, and stops cleanly. The dev database was reset on 2026-10-16 (fictional data only) and a new owner was created. The code and docs are committed once you run the commit below.

## Next step brief
Step 2.5a (M): route guards and `GET /auth/me`. Owner inputs needed:
1. Run the docs commands from the 2.4b-final message, check that the four `grep -c` lines each print 1, then commit from the repo root: `git add .`, commit, `git status --short` shows nothing.
2. Make sure no old server is running before the next live check (`lsof -nP -iTCP:3000 -sTCP:LISTEN` prints nothing).
3. Optional: answer OQ-13 (final staff permission list). The default stands if you do not.
4. Optional: say whether you want a reset-password script. It is outside the plan and needs your decision.

## What exists
Docs, `scripts/resume-pack.sh`, `scripts/live-check-auth.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes (`src/auth-routes.ts`), money, password and email modules, owner logic and setup script, permission table, sign-in logic with lockout (`src/auth.ts`), tokens (`src/tokens.ts`), session logic (`src/sessions.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, three migrations, config files, and tests. Live routes: `GET /health`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`. An owner account exists on the owner's dev database. No staff accounts, no route guards, no UI code yet.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; default `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; set on the owner's machine; read by the running server). Values never go in git.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run check`, `npm start` (run it from inside `server/`, A-48).
Live check of sign-in: with the server running, `sh scripts/live-check-auth.sh` from the repo root.
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
- 2.5a (M) Route guards: `requireAuth` (checks the access token, loads the user from the store, refuses inactive users) and `requirePermission` (uses `hasPermission`), plus `GET /auth/me` for a live check.
- 2.5b Staff accounts: stored permission list, create and list staff through the API (Super Admin only).
- Then audit writes for sensitive actions. A reset-password script if the owner wants one.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-32. A-22 to A-48 are Claude's choices or checks. Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a) and `server.ts` (2.4b). A-42 (no per-IP limit) stays open. No reset-password feature; a forgotten owner password needs a dev database reset. The Store has no way to list audit entries with no actor, and no way to deactivate a user (A-28, A-30). A locked user, including the owner, has no manual unlock (A-43). TRACEABILITY.md skips R-25. `server/tsconfig.json` `include` lists `test` twice (harmless).

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.