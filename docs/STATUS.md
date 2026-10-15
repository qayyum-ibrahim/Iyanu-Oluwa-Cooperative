# Project status
Last updated: after step 2.3c (not yet verified on the owner's machine)

## Where we stopped
Step 2.3b is verified on the owner's machine (11 files, 265 tests, commit c994af4). Step 2.3c added the `RefreshToken` table (hand-written migration `20261015090000_refresh_tokens`), a `RefreshTokenStore` on the `Store` interface, both adapters, and 15 contract cases per adapter. It also added `refreshTokens` to the four hand-built stores in `test/auth.test.ts` (the owner's first run showed 4 type errors there). Verified in my sandbox only: typecheck, lint and 159 tests in an isolated project (the auth tests ran against my stand-ins for `email.ts` and `password.ts`), plus break-on-purpose runs of `tokens.ts` and the storage code. Expected `npm run check`: 11 test files, 295 tests. Not verified on the owner's machine: the check after the fix, and the live migration check.

## Next step brief
Step 2.3d (M): refresh-token rotation logic in a new `src/sessions.ts` (issue a session, rotate on use, revoke the family when a used token comes back, sign out), with tests on the memory store. Then 2.3e: sign-in lockout.
Owner inputs needed:
1. Run `npm run check` in `server/`. Paste the last lines.
2. Run `npx prisma migrate deploy`, then `npx prisma migrate dev`. Paste the output. If the second offers a new migration or reports drift, stop.
3. Commit (commands in the step message).
4. Optional: say "fix decisions" (garbled D-20, D-21, D-23/D-24 in DECISIONS.md and A-02, A-03, A-19, A-20 in ASSUMPTIONS.md; whole-file fixes).
5. Optional: answer OQ-13 (final staff permission list). If you do not, the default stands.
6. Decide for 2.3d (my default if you do not answer): refresh token life 7 days, and a lifetime cap is not set.
Stable docs are in Project knowledge, folder `mirror/`. Replace `mirror/DECISIONS.md` with `docs/DECISIONS.md` (now D-01 to D-28).

## What exists
Docs, `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), money module (`src/money.ts`), password module (`src/password.ts`), email module (`src/email.ts`), owner logic (`src/owner.ts`), owner setup script (`src/setup-owner.ts`), permission table (`src/permissions.ts`), sign-in logic (`src/auth.ts`), token module (`src/tokens.ts`), database client (`src/db.ts`), storage interface and adapters with refresh-token storage (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, `prisma/migrations/` (init, refresh_tokens), `prisma.config.ts`, config files and 295 tests expected (shared helpers in `test/helpers/`). Route: `GET /health`. One owner can be created by script. No sign-in route, no rotation logic, no staff accounts, no UI code yet. No route or logic code uses the refresh-token store, the money module, the password module, the email module, the owner logic, the permission table, `authenticate` or the token module.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; the setup script falls back to `file:./dev.db`). `TOKEN_SECRET` (at least 32 bytes; nothing reads it yet; added to `.env.example` when a route needs it). Values never go in git. The owner email and password are typed when the script runs.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate` (also needed after a schema change, before an editor or `npm run typecheck` sees the new model), `npm run db:deploy`, `npm run setup:owner`, `npm run check`, `npm start`.
Resume routine (3 actions):
1. Commit your work (from the repo root: `git add .`), then run `sh scripts/resume-pack.sh`.
2. Attach `~/Desktop/resume-pack.txt` to a new chat in this Project.
3. Send: `Resume IYANU-OLUWA. Resume pack attached.`

## Pinned versions
Server (exact, D-19, D-20, D-23): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15, prisma 7.10.0, @prisma/client 7.10.0, @prisma/adapter-better-sqlite3 7.10.0, dotenv 18.0.7, argon2 0.45.1. No new dependency in 2.3b or 2.3c.
Not yet installed: zod, exceljs, web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0.

## Roadmap
Full plan: PHASE_PLAN.md.
- 2.3d (M) Refresh-token rotation and reuse detection (`src/sessions.ts`).
- 2.3e (S or M) Sign-in lockout.
- Then sign-in routes, staff accounts (stored permission list), route guards, audit writes for sensitive actions.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-28. A-22 to A-37 are Claude's choices or checks. Owed break-on-purpose run: step 1.4 (needs the real Prisma engine, so the owner's machine or a later step). The Store has no way to list audit entries with no actor, and no way to deactivate a user (A-28, A-30). Sign-in lockout is not built. The no-echo password prompt is verified only by the owner's live check. The D-20, D-21 and A-02, A-03, A-19, A-20 formatting is garbled in the repo (whole-file fix pending: say "fix decisions"). TRACEABILITY.md skips R-25; not filled. `server/tsconfig.json` `include` lists `test` twice (harmless). A comment in `tokens.ts` still says rotation and storage come in 2.3c (stale). I have not seen `server/.env.example` or `test/owner.test.ts` in the chat that wrote 2.3c (both are in NEXT_FILES; `owner.test.ts` compiled without errors on the owner's machine).

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.