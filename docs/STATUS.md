# Project status
Last updated: after step 4.6c-setup (results from the owner's pasted output)

## Where we stopped
4.6c-setup is verified on the owner's machine. It added `CLAUDE.md` in the repo root and decision D-51 in `docs/DECISIONS.md`. From the next step, work continues in Claude Code (D-51). The owner started Claude Code in the repo root. It read `CLAUDE.md` and the docs, replied in the required format, named 4.7c as the next step, and wrote no code. Code and tests did not change in this step, so the totals are still 36 test files, 1061 tests, and the live check is still 109 passed (from step 4.7). Before this step, 4.7b was verified: a break-on-purpose run for `payment-sms.ts` (27 mutations, 22 caught, 5 escaped: S13, S15, S16, S17, S20; baseline 79 passed). S15 is equivalent (A-130). S13, S16, S17 and S20 are test gaps in `payment-sms.test.ts` (A-131). Claude Code read `payments.ts` and found why S13 escaped: without the early return, a refused payment gets an extra `sms: failed, provider_error` key, and no test checks the exact refusal result. From 4.7: `POST /payments` takes an optional boolean `sendSms` (missing means true, D-50). `recordPayment` saves the payment first, then tries the SMS through the `SmsProvider`. The reply is `{ payment, sms }`; `sms.status` is `sent`, `failed` (with `reason`), `not_requested` or `skipped_repeat`. An SMS failure never undoes the payment (201 still). A repeat of a saved request sends nothing. The server uses the fake provider, so no real text is sent. `POST /payments` still needs an `Idempotency-Key` header (D-48). A "Loan Repaid" line does not change any loan yet (DR-09). No payment list route and no screen. Not verified: typecheck and lint output at 4.7 (the paste was cut).

## Next step brief
Owner inputs needed:
1. Commit this docs step (commands in the chat). Then work in Claude Code, started in the repo root (D-51).
2. In Claude Code, say "go" for 4.7c (S): tests only in `payment-sms.test.ts`. A spy provider that must not be called for an empty or whitespace-only phone (S16, S17), a failure-reason pass-through test (S20), and an exact-refusal-result test (S13). Or name another step. Other candidates: first-payment flow after adding a member, a payment list route, the Twilio adapter.
3. OQ-05: the SMS wording is still a placeholder. Say if you want a different text.
4. Not needed yet, but good to start: a Twilio account and one or two test numbers you control, for the later adapter step. Never paste secrets in chat.
5. Update `mirror/DECISIONS.md` in the claude.ai Project by hand: add D-51.

## What exists
Docs, `CLAUDE.md`, `scripts/resume-pack.sh`, `scripts/live-check-auth.sh`, `.gitignore`, `legacy-prototype/` (reference only), empty `web/`, and `server/`: Express app (`src/app.ts`, `src/server.ts`), auth routes, staff routes and logic, audit viewer, member logic and routes, payment logic and route (`payments.ts`, `payments-routes.ts`), SMS on payments (`payment-sms.ts`), SMS interface and fake provider (`sms.ts`, used at start-up), payment categories, payment breakdown check, route guards, money, password and email modules, `account.ts`, owner logic, owner setup and reset scripts, permission table, sign-in logic with lockout, tokens, session logic, database client, storage interface and adapters (users, audit, refresh tokens, members, payments with `findByKey`, and `transaction`), `prisma/schema.prisma`, seven migrations, config files, and tests. Live routes: `GET /health`, `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password`, `GET /auth/me`, `POST /staff`, `GET /staff`, `PUT /staff/:id/permissions`, `POST /staff/:id/deactivate`, `/reactivate`, `PUT /staff/:id/password`, `GET /audit`, `POST /members`, `GET /members` (query `status` active, inactive or all, default active; `createdById` for the Super Admin only), `GET /members/:id`, `POST /payments` (needs `payments.create` and header `Idempotency-Key`, 16 to 64 characters of `A-Z a-z 0-9 _ -`; body `memberId`, `method` CASH or BANK_TRANSFER, `total`, `lines` of `{category, amount}` as strings, optional boolean `sendSms` (default true); Staff only for members they recorded; Inactive member gives 409; repeat gives the first payment and sends no SMS; reply `{ payment, sms }`). Staff see only members they recorded. No member edit, delete or status route. No category route. No payment list, read, edit or delete route. No UI code yet. An owner account exists on the owner's dev database.

## Settings (names only)
`PORT` (optional), `DATABASE_URL` (see `server/.env.example`; default `file:./dev.db`), `TOKEN_SECRET` (at least 32 bytes; set on the owner's machine). Values never go in git. Twilio settings are not defined yet; their names are chosen at the adapter step.

## Commands
Inside `server/`: `npm install`, `npx prisma migrate dev` (after a schema change; answer no if it asks to reset), `npm run db:generate`, `npm run db:deploy`, `npm run setup:owner`, `npm run reset:owner`, `npm run check`, `npm start` (run it from inside `server/`, A-48).
Live check of sign-in, `/auth/me`, `/staff`, passwords, `/audit`, `/members` and `/payments` (with idempotency keys and the SMS status): with the server running, `sh scripts/live-check-auth.sh` from the repo root. Expected now: 109 passed, 0 failed. Each run adds one fictional staff account, two fictional members and three fictional payments. Use a temporary database (`DATABASE_URL=file:./name.db`) for scripts that change the owner.
Break-on-purpose and race scripts live on the owner's Desktop, not in git. Expected results:
- members code: `node ~/Desktop/mutate-3.2b.mjs 2>&1 | tail -100` from the repo root. 76 mutations, 72 caught, 4 escaped (L26, R8, R14, R15).
- categories: `node ~/Desktop/mutate-3.3b.mjs 2>&1 | tail -60`. 20 mutations, 19 caught, 1 escaped (C14).
- breakdown: `node ~/Desktop/mutate-4.1b.mjs 2>&1 | tail -60`. 35 mutations, 35 caught.
- payments store: `node ~/Desktop/mutate-4.2b.mjs 2>&1 | tail -80`. 44 mutations, 42 caught, 1 escaped (PP10), 1 not applied (PP8). PP8 alone: `node ~/Desktop/mutate-4.2b-pp8.mjs 2>&1 | tail -20`. Expected: 2 failed, 8 passed. These scripts were written before 4.5 changed `memory-store.ts` and `prisma-store.ts`, so they may report "not applied" now (inference, not run).
- transactions: `mutate-4.3b.mjs` stops at its baseline (12 memory cases). Use `node ~/Desktop/mutate-4.3c.mjs 2>&1 | tail -30` for M12 and M13 (2 caught). P1 and P2 are open (A-112).
- idempotency key code (4.5b): `node ~/Desktop/mutate-4.5b.mjs 2>&1 | tail -80` from the repo root. At 4.5b: 50 mutations, 46 caught, 4 escaped (K12, K15, M3, M8). K15 and M8 are caught since 4.5c (tests added), so a rerun should now show 48 caught and 2 escaped (K12, M3). That is my inference, not a result: the full script was not rerun at 4.5c. It also carries five payment mutations (C1 to C5) and five route mutations (R1 to R5). Since 4.7 the route file changed (it calls `recordPayment`), so the route mutations may report "not applied" (inference, not run).
- K15 and M8 only (4.5c): `node ~/Desktop/mutate-4.5c.mjs 2>&1 | tail -30` from the repo root. Result at 4.5c: both caught (1 failed each); baselines 32 and 7.
- SMS wiring (4.7b): `node ~/Desktop/mutate-4.7b.mjs 2>&1 | tail -50` from the repo root. Needs a clean git tree. Result at 4.7b: baseline 79 passed; 27 mutations, 22 caught, 5 escaped (S13, S15, S16, S17, S20). After 4.7c, S13, S16, S17 and S20 should be caught and S15 should still escape (inference, not run).
- parallel run on SQLite (4.5b): `cd server && npx tsx ~/Desktop/race-4.5b.mts; cd ..`. Expected: "one payment per key held: yes".
- `mutate-4.4b.mjs` and `mutate-4.4c.mjs` were written against the old `payments.ts` and `payments-routes.ts`; their find texts will not match now (inference, not run). The full old 4.4b set is not rerun.
Git commands run from the repo root, not from `server/`.
Resume routine (Claude Code, D-51):
1. Commit your work (from the repo root: `git add .`), then start `claude` in the repo root.
2. It follows `CLAUDE.md`: it reads STATUS, the top BUILD_LOG entry and the files in `docs/NEXT_FILES.txt`, then replies with the four lines and waits for "go".
3. The old resume pack (`sh scripts/resume-pack.sh`) still works for a claude.ai chat.

## Pinned versions
Server (exact, D-19, D-20, D-23): express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15, prisma 7.10.0, @prisma/client 7.10.0, @prisma/adapter-better-sqlite3 7.10.0, dotenv 18.0.7, argon2 0.45.1. No new dependency since 2.3a (4.5, 4.6, 4.7 and 4.7b use no new package).
Not yet installed: zod, exceljs, a Twilio package (not chosen yet), web packages.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0. Claude Code version: not recorded (A-132).

## Roadmap
Full plan: PHASE_PLAN.md.
- 4.7c (S, proposed): tests only, close the S13, S16, S17 and S20 gaps in `payment-sms.test.ts` (A-131). Run in Claude Code. Owner may choose another step.
- Then, sizes set when each starts: first-payment flow after adding a member, payment list route, Twilio adapter (look up docs, pin, secrets by name only; needs the owner's account and test numbers), Loan Repaid effect on loans (DR-09, needs the loans store from Phase 5, so it may move).
- Later small steps: retrofit `transaction` into A-25, A-39, A-54, A-58, A-62, A-88 (one step each; payments already use it).

## Open items
See OPEN_QUESTIONS.md. Phase 6 waits on OQ-00, OQ-06 and OQ-07. OQ-05: provider answered (Twilio), message text open (placeholder in use, A-126). Owner may overrule D-19 to D-51. A-22 to A-132 are Claude's choices or checks. DR-02 and DR-04 stay "requested" and "proposed" until Mr. Aro signs off (OQ-00, A-96). Owed break-on-purpose runs: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b). `payment-sms.ts` was run at 4.7b (A-130, A-131). `sms.ts` had none (no money, security or data-loss code). A-42 (no per-IP limit) stays open. A-76 is a small optional test gap. A-91, A-92, A-98, A-106, A-117, A-122 (K12), A-123 (M3) and A-130 (S15) are equivalent or unreachable escapes (read from code). A-131 (S13, S16, S17, S20) is open until 4.7c. A-107 to A-110 are the transaction notes. A-112 is open (Prisma `maxWait` and `timeout` untested). A-113 to A-115 are the payment route choices. A-114 depends on OQ-07. A-116 is closed (4.5); A-119 to A-121 are the key choices; A-121 stays open for a server database. A-124 and A-125 are the SMS interface choices and the unchecked Twilio details. A-126 to A-129 are the SMS wiring choices. A-132 covers the unchecked Claude Code details. Reading the audit log or members is not itself audited (A-75, A-88). A locked owner is unlocked by `npm run reset:owner` (A-67). An access token stays valid until it expires, even after sign-out, change or reset (A-50, A-63, A-69); after deactivation it is refused at once. TRACEABILITY R-25 is marked unused. The Prisma test file takes about 38 to 50 s on this machine; timeouts are 120 s. A comment in `prisma-store.ts` (the `.catch` after `payment.create`) cites A-119 but the right row is A-121; fix it the next time that file is edited.

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