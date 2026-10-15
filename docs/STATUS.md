# Project status
Last updated: after step 2.3a (verified on the owner's machine)

## Where we stopped
Step 2.3a is verified on the owner's machine: `npm run check` gives 10 test files, 191 tests (reported 2026-10-15). It added `server/src/auth.ts` (`authenticate`: same failure for every kind of failure, `login.success` and `login.failure` audit entries, inactive users refused, fail closed if the audit write fails) and `test/auth.test.ts` (31 tests). Step 2.2a is verified on the owner's machine (9 files, 160 tests, commit d10b19e, pushed). The break-on-purpose run owed for 2.1b was done in my sandbox at 2.3a (9 bugs caught). Commit `0c1fa80` holds 2.3a; I do not know if it is pushed. The live `tsx` check from the 2.3a message was not reported. Next: step 2.3b.

## Next step brief
Step 2.3b (M): session tokens as a pure module (no routes yet). A short-lived access token and a rotating refresh token, with the signing secret read from a setting. Rotating refresh tokens need stored state, so the step may touch the schema, `Store` and both adapters; if so it is split. Details are chosen at the step and recorded in DECISIONS. Then 2.3c: sign-in lockout. Say "go" to start 2.3b.
Owner inputs needed (all optional):
1. Push `0c1fa80` if not pushed, and paste the live-check output from the 2.3a message if you ran it.
2. Say "fix decisions" to repair the garbled D-20, D-21, D-23/D-24 text in `docs/DECISIONS.md` and A-02, A-03, A-19, A-20 in `docs/ASSUMPTIONS.md` (whole-file fixes).
3. Answer OQ-13 (final staff permission list). If you do not, the default stands.
Stable docs are in Project knowledge, folder `mirror/`. The mirror of DECISIONS looked current (D-01 to D-26) when last shown. Replace it after 2.3b adds decisions.

## What exists
Docs, `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), money module (`src/money.ts`), password module (`src/password.ts`), email module (`src/email.ts`), owner logic (`src/owner.ts`), owner setup script (`src/setup-owner.ts`), permission table (`src/permissions.ts`), sign-in logic (`src/auth.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`, config files and 191 tests (shared helpers in `test/helpers/`). Route: `GET /health`. One owner can be created by script. No token, no sign-in route, no staff accounts, no UI code yet. No route uses the money module, the store, the password module, the email module, the owner logic, the permission table or `authenticate`.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; the setup script falls back to `file:./dev.db`). Planned: token signing secret (name chosen at 2.3b). Values never go in git. The owner email and password are typed when the script runs.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run check`, `npm start`.
Resume routine (3 actions):
1. Commit your work (from the repo root: `git add .`), then run `sh scripts/resume-pack.sh`.
2. Attach `~/Desktop/resume-pack.txt` to a new chat in this Project.
3. Send: `Resume IYANU-OLUWA. Resume pack attached.`

## Pinned versions
Server (exact, D-19, D-20, D-23): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15, prisma 7.10.0, @prisma/client 7.10.0, @prisma/adapter-better-sqlite3 7.10.0, dotenv 18.0.7, argon2 0.45.1.
Not yet installed: zod, exceljs, web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0.

## Roadmap
Full plan: PHASE_PLAN.md.
- 2.3b (M) Session tokens (pure module).
- 2.3c (S or M) Sign-in lockout.
- Then sign-in routes, staff accounts (stored permission list), route guards, audit writes for sensitive actions.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-26. A-22 to A-30 are Claude's choices or checks. The break-on-purpose run for step 1.4 (database schema) is still owed: it needs the real Prisma engine, so it must run on the owner's machine or in a later step. The Store has no way to list audit entries with no actor, and no way to deactivate a user (A-28, A-30). Sign-in lockout is not built (2.3c). The no-echo password prompt is verified only by the owner's live check. The D-20, D-21 and A-02, A-03, A-19, A-20 formatting is garbled in the repo (whole-file fix pending: say "fix decisions"). TRACEABILITY.md skips R-25; not filled. `server/tsconfig.json` `include` lists `test` twice (harmless).

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.