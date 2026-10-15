# Project status
Last updated: after step 2.3e (verified on the owner's machine)

## Where we stopped
Step 2.3e is verified on the owner's machine: 13 files, 364 tests, `migrate deploy` applied `20261015130000_sign_in_lockout`, `migrate dev` "Already in sync" (reported 2026-10-15). It added sign-in lockout: `User.failedLoginCount` and `User.lockedUntil`, `getLockout`, `recordFailedLogin`, `clearLockout` in both adapters, 20 contract cases, 11 tests in `test/lockout.test.ts`, and the lockout check in `authenticate` (5 failures, 900 seconds, per user, D-30). The code and docs are committed once you run the commit below.

## Next step brief
Step 2.4a (M): sign-in, refresh and sign-out routes. Owner inputs needed:
1. Commit the docs from the repo root: `git add .`, commit, `git status --short` shows nothing.
2. In Project knowledge, replace `mirror/DECISIONS.md` with `docs/DECISIONS.md` (now D-01 to D-30).
3. Make a signing secret on your machine and put it in `server/.env` as `TOKEN_SECRET=...` (at least 32 bytes). Do not paste it in chat or git. One way: `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Tell me only "done".
4. Optional: answer OQ-13 (final staff permission list). The default stands if you do not. My defaults for 2.4a, recorded when used: tokens travel in the JSON body (no cookies yet); input checks by hand or with `zod`, chosen in that step; no per-IP limit yet (A-42).

## What exists
Docs, `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), money module, password module, email module, owner logic and setup script, permission table, sign-in logic with lockout (`src/auth.ts`), token module (`src/tokens.ts`), session logic (`src/sessions.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, migrations (init, refresh_tokens, sign_in_lockout), `prisma.config.ts`, config files, and 364 tests (shared helpers in `test/helpers/`, including `lockout-contract.ts`). Route: `GET /health`. One owner can be created by script. No sign-in route, no staff accounts, no UI code yet. No route code uses sessions, `authenticate`, tokens, the permission table, the money module or the owner logic.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; the setup script falls back to `file:./dev.db`). `TOKEN_SECRET` (at least 32 bytes; nothing reads it yet; added to `.env.example` in 2.4a). Values never go in git. The owner email and password are typed when the script runs.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate` (also needed after a schema change, before an editor or `npm run typecheck` sees the new model), `npm run db:deploy`, `npm run setup:owner`, `npm run check`, `npm start`.
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
- 2.4a (M) Sign-in, refresh and sign-out routes (uses `authenticate`, `issueSession`, `refreshSession`, `signOut`; adds `TOKEN_SECRET` to `.env.example`; per-IP limit is a later decision, A-42).
- Then staff accounts (stored permission list), route guards, audit writes for sensitive actions.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-30. A-22 to A-44 are Claude's choices or checks. Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d) and the lockout code (2.3e, security code). The Store has no way to list audit entries with no actor, and no way to deactivate a user (A-28, A-30). A locked user, including the owner, has no manual unlock (A-43). The no-echo password prompt is verified only by the owner's live check. TRACEABILITY.md skips R-25 and was not updated in 2.3e (not seen). `server/tsconfig.json` `include` lists `test` twice (harmless). Not seen in the last chats: `sessions.ts`, `tokens.ts`, `email.ts`, `password.ts`, `app.ts`, `server/.env.example`, `docs/DEV_SETUP.md`.

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.