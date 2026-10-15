# Project status
Last updated: after step 2.3d (not yet verified on the owner's machine)

## Where we stopped
Step 2.3c is verified on the owner's machine (11 files, 295 tests, `migrate deploy` applied, `migrate dev` "Already in sync", commit 6d49656, pushed). Step 2.3d added `server/src/sessions.ts` (`issueSession`, `refreshSession`, `signOut`) and 38 tests in `test/sessions.test.ts`, on the memory store. It also fixed one stale comment in `tokens.ts`. Not verified anywhere: I ran nothing in the 2.3d chat. Expected `npm run check`: 12 test files, 333 tests.

## Next step brief
Step 2.3e (M): sign-in lockout. It adds counter fields to `User` (schema, hand-written or generated migration), Store methods in both adapters, contract cases, and a lockout check in `authenticate`.
Owner inputs needed:
1. Run `npm run check` in `server/`. Paste the last lines (expect 12 files, 333 tests).
2. Commit (from the repo root: `git add .`, commit, `git status --short` shows nothing).
3. Decide for 2.3e (my default if you do not answer): lock after 5 failed sign-ins in a row, for 15 minutes, counted per user (not per IP), and a correct password resets the count.
4. Optional: say "fix decisions" (garbled D-20, D-21 in DECISIONS.md and A-02, A-03, A-19, A-20 in ASSUMPTIONS.md; whole-file fixes).
5. Optional: answer OQ-13 (final staff permission list). If you do not, the default stands.
Stable docs are in Project knowledge, folder `mirror/`. Replace `mirror/DECISIONS.md` with `docs/DECISIONS.md` (now D-01 to D-29).

## What exists
Docs, `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), money module, password module, email module, owner logic and setup script, permission table, sign-in logic (`src/auth.ts`), token module (`src/tokens.ts`), session logic (`src/sessions.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, migrations (init, refresh_tokens), `prisma.config.ts`, config files, and 333 tests expected (shared helpers in `test/helpers/`). Route: `GET /health`. One owner can be created by script. No sign-in route, no lockout, no staff accounts, no UI code yet. No route code uses sessions, `authenticate`, tokens, the permission table, the money module or the owner logic.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; the setup script falls back to `file:./dev.db`). `TOKEN_SECRET` (at least 32 bytes; nothing reads it yet; added to `.env.example` when a route needs it). Values never go in git. The owner email and password are typed when the script runs.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate` (also needed after a schema change, before an editor or `npm run typecheck` sees the new model), `npm run db:deploy`, `npm run setup:owner`, `npm run check`, `npm start`.
Resume routine (3 actions):
1. Commit your work (from the repo root: `git add .`), then run `sh scripts/resume-pack.sh`.
2. Attach `~/Desktop/resume-pack.txt` to a new chat in this Project.
3. Send: `Resume IYANU-OLUWA. Resume pack attached.`

## Pinned versions
Server (exact, D-19, D-20, D-23): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15, prisma 7.10.0, @prisma/client 7.10.0, @prisma/adapter-better-sqlite3 7.10.0, dotenv 18.0.7, argon2 0.45.1. No new dependency in 2.3b, 2.3c or 2.3d.
Not yet installed: zod, exceljs, web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0.

## Roadmap
Full plan: PHASE_PLAN.md.
- 2.3e (M) Sign-in lockout.
- Then sign-in and refresh routes, staff accounts (stored permission list), route guards, audit writes for sensitive actions.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-29. A-22 to A-40 are Claude's choices or checks. Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine) and `sessions.ts` (2.3d, security code). The Store has no way to list audit entries with no actor, and no way to deactivate a user (A-28, A-30). The no-echo password prompt is verified only by the owner's live check. The D-20, D-21 and A-02, A-03, A-19, A-20 formatting is garbled in the repo (whole-file fix pending: say "fix decisions"). TRACEABILITY.md skips R-25; not filled. `server/tsconfig.json` `include` lists `test` twice (harmless). I have not seen `server/.env.example`, `src/owner.ts`, `src/setup-owner.ts`, `src/app.ts` or `docs/DEV_SETUP.md` in the 2.3d chat.

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.