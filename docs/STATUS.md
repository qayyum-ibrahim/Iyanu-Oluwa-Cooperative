# Project status
Last updated: after step 2.2a

## Where we stopped
Step 2.2a done: `server/src/permissions.ts` (permission table of 22, `hasPermission`, `canGrant`, `normalizeStaffGrants`) and `test/permissions.test.ts` (38 tests). Step 2.1b is verified on the owner's machine (122 tests; owner script created the owner once and refused a second run). `npm run check` expected after 2.2a: 9 test files, 160 tests (not yet verified on the owner's machine). Lint of the new files not yet run. Next: step 2.3a.

## Next step brief
Step 2.3a (M): sign-in logic. A pure `authenticate(store, email, password)`: normalise the email, give the same failure for an unknown email and a wrong password, refuse inactive users, write `login.success` and `login.failure` audit entries. No tokens and no routes yet (later steps). Also does the break-on-purpose run owed for steps 1.4 and 2.1b. Say "continue" to start it.
Owner inputs needed:
1. Nothing by hand if `docs/NEXT_FILES.txt` lists the needed files. Check that the pack shows them under `===== FILE: path =====` headings.
2. Replace `mirror/DECISIONS.md` in Project knowledge with `docs/DECISIONS.md` (now D-01 to D-25).
3. Optional: answer OQ-13 (final staff permission list). If you do not, the default stands.
Stable docs are in Project knowledge, folder `mirror/`.

## What exists
Docs, `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), money module (`src/money.ts`), password module (`src/password.ts`), email module (`src/email.ts`), owner logic (`src/owner.ts`), owner setup script (`src/setup-owner.ts`), permission table (`src/permissions.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`, config files and 160 tests expected (shared helpers in `test/helpers/`). Route: `GET /health`. One owner can be created by script. No sign-in, no staff accounts, no UI code yet. No route uses the money module, the store, the password module, the email module, the owner logic or the permission table.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; the setup script falls back to `file:./dev.db`). Planned: token or session secrets. Values never go in git. The owner email and password are typed when the script runs.

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
- 2.3a (M) Sign-in logic and the owed break-on-purpose run for 1.4 and 2.1b.
- Then tokens and sign-in routes, staff accounts, route guards, audit writes for sensitive actions.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-25. A-22 to A-27 are Claude's choices. Break-on-purpose runs for steps 1.4 and 2.1b are still owed (2.3a). The no-echo password prompt is verified only by the owner's live check. `mirror/DECISIONS.md` is stale, and the D-20 and D-21 formatting is garbled in the copy I was shown (a whole-file fix is pending: say "fix decisions"). TRACEABILITY.md skips R-25; I did not fill it. Lint of `permissions.ts` and its test is not yet verified.

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.