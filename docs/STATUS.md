# Project status
Last updated: after step 2.3b (not yet verified on the owner's machine)

## Where we stopped
Step 2.3a is verified on the owner's machine (10 files, 191 tests; commit 0c1fa80 is pushed, docs commit 9bbd121 pushed). Step 2.3b added `server/src/tokens.ts` (access tokens signed with HMAC-SHA256, refresh-token create, hash and compare) and `test/tokens.test.ts` (74 tests by my count). `npm run check` expected after 2.3b: 11 test files, 265 tests. Not verified anywhere: I ran nothing in the chat that wrote 2.3b. The break-on-purpose run for the token code is owed. Next: step 2.3c.

## Next step brief
Step 2.3c (M): refresh-token storage and rotation. This adds a table, new `Store` methods, both adapters and contract cases. Before that, a break-on-purpose run of `tokens.ts` in my sandbox. Then 2.3d: sign-in lockout.
Owner inputs needed:
1. Run `npm run check` in `server/`. Paste the last lines. Then commit.
2. Optional: say "fix decisions" (garbled D-20, D-21, D-23/D-24 in DECISIONS.md and A-02, A-03, A-19, A-20 in ASSUMPTIONS.md; whole-file fixes).
3. Optional: answer OQ-13 (final staff permission list). If you do not, the default stands.
Stable docs are in Project knowledge, folder `mirror/`. Replace `mirror/DECISIONS.md` with `docs/DECISIONS.md` (now D-01 to D-27).

## What exists
Docs, `scripts/resume-pack.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), money module (`src/money.ts`), password module (`src/password.ts`), email module (`src/email.ts`), owner logic (`src/owner.ts`), owner setup script (`src/setup-owner.ts`), permission table (`src/permissions.ts`), sign-in logic (`src/auth.ts`), token module (`src/tokens.ts`), database client (`src/db.ts`), storage interface and adapters (`src/store.ts`, `src/memory-store.ts`, `src/prisma-store.ts`), `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`, config files and 265 tests expected (shared helpers in `test/helpers/`). Route: `GET /health`. One owner can be created by script. No sign-in route, no stored refresh tokens, no staff accounts, no UI code yet. No route uses the money module, the store, the password module, the email module, the owner logic, the permission table, `authenticate` or the token module.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; the setup script falls back to `file:./dev.db`). `TOKEN_SECRET` (at least 32 bytes; nothing reads it yet; added to `.env.example` when a route needs it). Values never go in git. The owner email and password are typed when the script runs.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run check`, `npm start`.
Resume routine (3 actions):
1. Commit your work (from the repo root: `git add .`), then run `sh scripts/resume-pack.sh`.
2. Attach `~/Desktop/resume-pack.txt` to a new chat in this Project.
3. Send: `Resume IYANU-OLUWA. Resume pack attached.`

## Pinned versions
Server (exact, D-19, D-20, D-23): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15, prisma 7.10.0, @prisma/client 7.10.0, @prisma/adapter-better-sqlite3 7.10.0, dotenv 18.0.7, argon2 0.45.1. No new dependency in 2.3b (`node:crypto`, D-27).
Not yet installed: zod, exceljs, web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0.

## Roadmap
Full plan: PHASE_PLAN.md.
- 2.3c (M) Refresh-token storage and rotation (schema, Store, adapters, contract).
- 2.3d (S or M) Sign-in lockout.
- Then sign-in routes, staff accounts (stored permission list), route guards, audit writes for sensitive actions.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 2. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner may overrule D-19 to D-27. A-22 to A-34 are Claude's choices or checks. Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine, so the owner's machine or a later step) and step 2.3b (`tokens.ts`, planned at the start of 2.3c). The Store has no way to list audit entries with no actor, and no way to deactivate a user (A-28, A-30). Sign-in lockout is not built. The no-echo password prompt is verified only by the owner's live check. The D-20, D-21 and A-02, A-03, A-19, A-20 formatting is garbled in the repo (whole-file fix pending: say "fix decisions"). TRACEABILITY.md skips R-25; not filled. `server/tsconfig.json` `include` lists `test` twice (harmless). I have not seen `eslint.config.js` or `.env.example` in the chats that wrote 2.3a and 2.3b.

## How we work
Delivery: whole files pasted in chat. Mode: lean.
Handoff rule (every step, no exceptions):
1. End the step with the full new contents of docs/NEXT_FILES.txt: one repo path per line, every file the next step must read or change that a fresh chat has not been shown, ending with a newline.
2. Give STATUS.md as a whole file, never as partial edits.
3. Commit from the repo root: `git add .`, then `git status --short` must show nothing left.
4. A fresh chat does not ask the owner to paste files that NEXT_FILES.txt should carry. If one is missing, ask once, fix NEXT_FILES.txt in the same step, and log the miss in BUILD_LOG.
5. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.