# Project status
Last updated: after step 2.4a (written, not yet verified)

## Where we stopped
Step 2.3e is verified on the owner's machine (13 files, 364 tests). Step 2.4a adds `server/src/auth-routes.ts` (`POST /auth/login`, `/auth/refresh`, `/auth/logout`), `createApp(deps?)` with a JSON error handler, and `test/auth-routes.test.ts` (25 tests). Expected `npm run check`: 14 test files, 389 tests. Not run by anyone yet. The routes use the memory store in tests only. `server.ts` is unchanged, so the running server does not serve `/auth` yet.

## Next step brief
Step 2.4b (M): wire `server.ts` to the real database and `TOKEN_SECRET`, then a live curl check of login, refresh and logout. Owner inputs needed:
1. Run `npm run check` in `server/` and report the last lines (expect 14 files, 389 tests). If it fails, send the first error.
2. Commit from the repo root: `git add .`, commit, `git status --short` shows nothing.
3. Have the owner account made by `npm run setup:owner` on your dev database. Say if it is not. For the live check you type the password yourself; never paste it in chat.
4. Optional: answer OQ-13 (final staff permission list). The default stands if you do not.

## What exists
Docs, `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes (`src/auth-routes.ts`), money, password and email modules, owner logic and setup script, permission table, sign-in logic with lockout (`src/auth.ts`), tokens (`src/tokens.ts`), session logic (`src/sessions.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, three migrations, config files, and tests. Live route today: `GET /health` only. No staff accounts, no route guards, no UI code yet.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; the setup script falls back to `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; now in `server/.env.example`; set on the owner's machine; read by the running server from step 2.4b). Values never go in git.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run check`, `npm start`.
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
- 2.4b (M) Wire `server.ts` (real store, `TOKEN_SECRET`), live check.
- Then staff accounts (stored permission list), route guards (access-token check plus `hasPermission`), audit writes for sensitive actions.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-31. A-22 to A-47 are Claude's choices or checks. Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e) and the auth routes (2.4a). A-42 (no per-IP limit) stays open. The Store has no way to list audit entries with no actor, and no way to deactivate a user (A-28, A-30). A locked user, including the owner, has no manual unlock (A-43). The no-echo password prompt is verified only by the owner's live check. TRACEABILITY.md skips R-25. `server/tsconfig.json` `include` lists `test` twice (harmless).

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.