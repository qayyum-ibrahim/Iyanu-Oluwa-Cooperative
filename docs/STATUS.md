# Project status
Last updated: after step 4.8b (run in Claude Code's session)

## Where we stopped
4.8b is verified in Claude Code's session: break-on-purpose for `listPayments` and `GET /payments`. Baseline 41 passed; 23 mutations, 22 caught, 1 escaped (R1, the route guard: equivalent, A-135); file restored; tree clean. No repo file changed, so the totals are still 37 test files, 1088 tests and live check 120 (from 4.8). From 4.8: `GET /payments?memberId=<id>` (D-52) lists one member's payments, oldest first, with `payments.view`; Staff see every payment of a member they recorded (A-133); others answer 404; no audit entry, no paging (A-134). From 4.7: `POST /payments` takes an optional boolean `sendSms` (default true, D-50); the payment is saved first; an SMS failure never undoes it; a repeat sends nothing; the fake provider is used. `POST /payments` needs an `Idempotency-Key` header (D-48). A "Loan Repaid" line does not change any loan yet (DR-09). No screen. Some older break-on-purpose scripts are still missing from the Desktop (A-136).

## Next step brief
Owner inputs needed:
1. Approve the 4.8b docs commit (command in the chat).
2. A-136: restore the scripts still missing, or confirm they are gone (they are rewritten only when a rerun is needed). Copies with a time in the name can be deleted by you if not needed.
3. Say "go" for the next step, or name another. Claude's proposal: 4.9 (S), the owed break-on-purpose run for `sessions.ts` (2.3d; security code). Other candidates: the other owed runs (lockout 2.3e, auth routes 2.4a, `server.ts` 2.4b), the Twilio adapter (needs your account), Phase 5 loans.
4. OQ-05: the SMS wording is still a placeholder. Say if you want a different text.
5. Add D-52 to `mirror/DECISIONS.md` by hand if not done yet.

## What exists
Docs, `CLAUDE.md`, `scripts/resume-pack.sh`, `scripts/live-check-auth.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes, staff routes and logic, audit viewer, member logic and routes, payment logic and routes (`payments.ts`, `payments-routes.ts`: record and list), SMS on payments (`payment-sms.ts`), SMS interface and fake provider (`sms.ts`, used at start-up), payment categories, payment breakdown check, route guards, money, password and email modules, `account.ts`, owner logic, owner setup and reset scripts, permission table, sign-in logic with lockout, tokens, session logic, database client, storage interface and adapters (users, audit, refresh tokens, members, payments with `findByKey`, and `transaction`), `prisma/schema.prisma`, seven migrations, config files, and tests. Live routes: `GET /health`, `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password`, `GET /auth/me`, `POST /staff`, `GET /staff`, `PUT /staff/:id/permissions`, `POST /staff/:id/deactivate`, `/reactivate`, `PUT /staff/:id/password`, `GET /audit`, `POST /members`, `GET /members` (query `status` active, inactive or all, default active; `createdById` for the Super Admin only), `GET /members/:id`, `GET /payments?memberId=<id>` (needs `payments.view`; one member's payments, oldest first; Staff only for members they recorded, others 404; 400 `missing_member_id` or `invalid_member_id`), `POST /payments` (needs `payments.create` and header `Idempotency-Key`, 16 to 64 characters of `A-Z a-z 0-9 _ -`; body `memberId`, `method` CASH or BANK_TRANSFER, `total`, `lines` of `{category, amount}` as strings, optional boolean `sendSms` (default true); Staff only for members they recorded; Inactive member gives 409; repeat gives the first payment and sends no SMS; reply `{ payment, sms }`). Staff see only members they recorded. No member edit, delete or status route. No category route. No single-payment read, edit or delete route. No paging on the payment list. No UI code yet. An owner account exists on the owner's dev database.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; default `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; set on the owner's machine). Values never go in git. Twilio settings are not defined yet; their names are chosen at the adapter step.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change; answer no if it asks to reset), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run reset:owner`, `npm run check`, `npm start` (run it from inside `server/`, A-48).
Live check of sign-in, `/auth/me`, `/staff`, passwords, `/audit`, `/members` and `/payments` (with idempotency keys and the SMS status): with the server running, `sh scripts/live-check-auth.sh` from the repo root. Expected now: 120 passed, 0 failed. Each run adds one fictional staff account, two fictional members and three fictional payments. Use a temporary database (`DATABASE_URL=file:./name.db`) for scripts that change the owner.
Break-on-purpose and race scripts live on the owner's Desktop, not in git. Some were missing at 4.8b and the owner restored part of them; see A-136 for which are still missing. The lines below keep the past results. Expected results:
- members code: `node ~/Desktop/mutate-3.2b.mjs 2>&1 | tail -100` from the repo root. 76 mutations, 72 caught, 4 escaped (L26, R8, R14, R15).
- categories: `node ~/Desktop/mutate-3.3b.mjs 2>&1 | tail -60`. 20 mutations, 19 caught, 1 escaped (C14).
- breakdown: `node ~/Desktop/mutate-4.1b.mjs 2>&1 | tail -60`. 35 mutations, 35 caught.
- payments store: `node ~/Desktop/mutate-4.2b.mjs 2>&1 | tail -80`. 44 mutations, 42 caught, 1 escaped (PP10), 1 not applied (PP8). PP8 alone: `node ~/Desktop/mutate-4.2b-pp8.mjs 2>&1 | tail -20`. Expected: 2 failed, 8 passed. These scripts were written before 4.5 changed `memory-store.ts` and `prisma-store.ts`, so they may report "not applied" now (inference, not run).
- transactions: `mutate-4.3b.mjs` stops at its baseline (12 memory cases). Use `node ~/Desktop/mutate-4.3c.mjs 2>&1 | tail -30` for M12 and M13 (2 caught). P1 and P2 are open (A-112).
- idempotency key code (4.5b): `node ~/Desktop/mutate-4.5b.mjs 2>&1 | tail -80` from the repo root. At 4.5b: 50 mutations, 46 caught, 4 escaped (K12, K15, M3, M8). K15 and M8 are caught since 4.5c (tests added), so a rerun should now show 48 caught and 2 escaped (K12, M3). That is my inference, not a result: the full script was not rerun at 4.5c. It also carries five payment mutations (C1 to C5) and five route mutations (R1 to R5). Since 4.7 the route file changed (it calls `recordPayment`), so the route mutations may report "not applied" (inference, not run).
- K15 and M8 only (4.5c): `node ~/Desktop/mutate-4.5c.mjs 2>&1 | tail -30` from the repo root. Result at 4.5c: both caught (1 failed each); baselines 32 and 7.
- SMS wiring (4.7b): `node ~/Desktop/mutate-4.7b.mjs 2>&1 | tail -50` from the repo root. Needs a clean git tree. Result at 4.7b: baseline 79 passed; 27 mutations, 22 caught, 5 escaped. Result at 4.7c (verified in session): baseline 86 passed; 27 mutations, 26 caught, 1 escaped (S15, equivalent).
- payment list (4.8b): `node ~/Desktop/mutate-4.8b.mjs 2>&1 | tail -30` from the repo root. Needs a clean git tree. Result at 4.8b: baseline 41 passed; 23 mutations, 22 caught, 1 escaped (R1, equivalent).
- parallel run on SQLite (4.5b): `cd server && npx tsx ~/Desktop/race-4.5b.mts; cd ..`. Expected: "one payment per key held: yes".
- `mutate-4.4b.mjs` and `mutate-4.4c.mjs` were written against the old `payments.ts` and `payments-routes.ts`; their find texts will not match now (inference, not run). The full old 4.4b set is not rerun.
Git commands run from the repo root, not from `server/`.
Resume routine (Claude Code, D-51):
1. Commit your work (from the repo root: `git add .`), then start `claude` in the repo root.
2. It follows `CLAUDE.md`: it reads STATUS, the top BUILD_LOG entry and the files in `docs/NEXT_FILES.txt`, then replies with the four lines and waits for "go".
3. The old resume pack (`sh scripts/resume-pack.sh`) still works for a claude.ai chat.

## Pinned versions
Server (exact, D-19, D-20, D-23): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15, prisma 7.10.0, @prisma/client 7.10.0, @prisma/adapter-better-sqlite3 7.10.0, dotenv 18.0.7, argon2 0.45.1. No new dependency since 2.3a (4.5 to 4.8b use no new package).
Not yet installed: zod, exceljs, a Twilio package (not chosen yet), web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0. Claude Code version: not recorded (A-132).

## Roadmap
Full plan: PHASE_PLAN.md.
- 4.9 (S, proposed): owed break-on-purpose for `sessions.ts` (2.3d). Owner may choose another step.
- Then, sizes set when each starts: first-payment flow after adding a member (mostly the screen), Twilio adapter (look up docs, pin, secrets by name only; needs the owner's account and test numbers), Loan Repaid effect on loans (DR-09, needs the loans store from Phase 5, so it may move).
- Later small steps: retrofit `transaction` into A-25, A-39, A-54, A-58, A-62, A-88 (one step each; payments already use it).

## Open items
See OPEN_QUESTIONS.md. Phase 6 waits on OQ-00, OQ-06 and OQ-07. OQ-05: provider answered (Twilio), message text open (placeholder in use, A-126). Owner may overrule D-19 to D-52. A-22 to A-136 are Claude's choices or checks. DR-02 and DR-04 stay "requested" and "proposed" until Mr. Aro signs off (OQ-00, A-96). Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b). `payment-sms.ts` was run at 4.7b and rerun at 4.7c (26 of 27 caught; S15 equivalent, A-130). `sms.ts` had none (no money, security or data-loss code). A-42 (no per-IP limit) stays open. A-76 is a small optional test gap. A-91, A-92, A-98, A-106, A-117, A-122 (K12), A-123 (M3) and A-130 (S15) are equivalent or unreachable escapes (read from code). A-131 is closed (4.7c). A-107 to A-110 are the transaction notes. A-112 is open (Prisma `maxWait` and `timeout` untested). A-113 to A-115 are the payment route choices. A-114 depends on OQ-07. A-116 is closed (4.5); A-119 to A-121 are the key choices; A-121 stays open for a server database. A-124 and A-125 are the SMS interface choices and the unchecked Twilio details. A-126 to A-129 are the SMS wiring choices. A-132 covers the unchecked Claude Code details. A-133 and A-134 are the payment list choices. A-135 (R1) is an equivalent escape. A-136 (some Desktop scripts still missing) is open. Reading the audit log or members is not itself audited (A-75, A-88). A locked owner is unlocked by `npm run reset:owner` (A-67). An access token stays valid until it expires, even after sign-out, change or reset (A-50, A-63, A-69); after deactivation it is refused at once. TRACEABILITY R-25 is marked unused. A full `npm run check` takes about 39 to 54 s on this machine; timeouts are 120 s. A comment in `prisma-store.ts` (the `.catch` after `payment.create`) cites A-119 but the right row is A-121; fix it the next time that file is edited.

## How we work
Delivery: Claude Code edits files in the repo and runs the checks (D-51). Mode: lean. The claude.ai Project is for planning and review; the repo wins if they differ.
Handoff rule (every step, no exceptions):
1. Claude Code makes the changes and runs `npm run check` (and the live check when the step has one, after asking the owner). It reports the real output and labels each result.
2. Docs come only after the checks pass (D-37, D-51). If a check fails, explain the cause first and write no docs.
3. The docs are STATUS (whole file), BUILD_LOG, ASSUMPTIONS, TRACEABILITY, DECISIONS and any other file the step touched.
4. Then `docs/NEXT_FILES.txt` is rewritten: one repo path per line, every file the next step must read or change, ending with a newline. Write it for the next step only. Drop files the next step does not touch.
5. The owner approves the commit. From the repo root: `git add .`, then `git status --short` must show nothing left. Claude Code does not commit or push by itself.
6. Claude Code asks first before touching the dev database, installing a dependency or deleting files.
7. "Next step brief" lists only what only the owner can do: commands, secrets, decisions.