# Build log (newest first)

## Step 4.2b (size S), 2026-10-19: break-on-purpose for the payments store

**Works (verified on your machine, output pasted; I ran nothing in my sandbox):** two throwaway scripts on your Desktop (not in git): `mutate-4.2b.mjs` and `mutate-4.2b-pp8.mjs`. They change the payments code in `memory-store.ts` and `prisma-store.ts` one mutation at a time, run the payments cases of the matching adapter test file (`-t payments`), and restore the files. Baselines: memory 10 of 10, Prisma 10 of 10. Main run: 44 mutations, 42 caught, 1 escaped, 0 error, 0 timeout, 1 not applied. "files restored: yes". PP8, run alone: 2 failed, 8 passed, so caught, "file restored: yes". Both `git status --short` outputs were empty. Net: 44 mutations, 43 caught, 1 escaped. No source or test file changed, so the totals stay at 31 files, 895 tests (verified at 4.2).
- Caught: PM1 to PM24 (member and creator checks removed, inverted or mistyped; total, method, member id, creator id, category and amount saved wrongly; line order, line ids and payment id; every copy rule in the memory adapter; both lookups and the list filter and order), PP1 to PP7, PP9, PP11 to PP20 and PP8 (Prisma: both existence checks, member lookup, method, total, creator, line order, category and amount on write; line sort reversed, total, amount, method, member id and creator id on read; `findById` ignoring the id; list filter, order and length).
- Escaped: PP10 (the line sort removed in `toPayment`). I believe it is equivalent on SQLite: rows come back in insertion order, which is already the position order, and the store cannot insert lines out of order. Read from the code, not run (A-106).
**Stubbed:** nothing new. No route, logic or screen uses the payments store.
**Tests:** none new. Total 895.
**Not verified:** behaviour of PP10 on a server database (A-35, A-106). Rollback of a payment when a line fails (still untestable, A-102). The run time (not shown in the paste).
**Found along the way:**
1. My mistake: the find text for PP8 (`category: l.category,`) appears twice in `prisma-store.ts`. The script refused it ("found 2 times"), so the Prisma write path for line categories was not tested in the main run. I fixed it with a one-mutation script with a longer find text. It was caught.
2. Predictions: the memory adapter and most Prisma mutations were caught, as I expected. PP10 escaped, as I said it might. PP8 not applying was not predicted.
3. My time guess (15 to 20 minutes) looks too high: your messages are 12 minutes apart at most. This is an inference, not a measured time.
4. The owed break-on-purpose run for the payments store is closed. Still owed: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b).
5. `-t payments` selected exactly the 10 payments cases on each adapter (baseline 10 passed), so the filter works.

## Step 4.2 (size M), 2026-10-19: payments tables and store

**Works (verified on your machine, output pasted: `npm run check` ended with 31 files, 895 tests; `.tables` lists `Payment` and `PaymentLine`; `git status --short` showed the 10 expected lines; I ran nothing in my sandbox):** tables `Payment` and `PaymentLine` (migration `20261019064920_payments`), enum `PaymentMethod` (CASH, BANK_TRANSFER). `PaymentStore` (`create`, `findById`, `listByMember`) on `Store`, in both adapters. Amounts are `BigInt` kobo, the creator is recorded (DR-15), and the store has no update or delete (D-17). The Prisma `create` saves a payment and its lines in one nested create. Decision D-44.
**Stubbed:** no route, no payment logic. Nothing calls `checkBreakdown` together with the store. No balances. No Loan Repaid effect. No SMS. No general store transaction (moved to 4.3). The audit entry for a payment will be a separate call.
**Tests:** 20 new: `test/helpers/payments-contract.ts` 10 cases x 2 adapters. Total 895 (was 875). The Prisma half ran on a real SQLite file built from the real migrations, with a value above 2^53.
**Not verified:** break-on-purpose for the payments store (owed, step 4.2b). Rollback of a payment when a line fails (no test can force it). Whether Prisma runs a nested create as one transaction (I believe so, no source checked; A-102). Behaviour on a server database (A-35). The `migrate dev` output. Typecheck and lint output (inferred from `check` stopping at the first failure).
**Found along the way:**
1. Prediction matched: 31 files, 895 tests.
2. Roadmap change: STATUS said 4.2 must settle general transactions. I split that out as 4.3.
3. The `sed` edit and all five memory-store edits applied, since the check passed. No find string failed.
4. NEXT_FILES for 4.2 was right: the grep found only the three files already listed.
5. `mirror/DECISIONS.md` needs D-44 by hand.

## Step 4.1b (size S), 2026-10-18: break-on-purpose for breakdown.ts

**Works (verified on your machine, output pasted; I ran nothing in my sandbox):** one throwaway script, `mutate-4.1b.mjs`, on your Desktop (not in git). It changes `server/src/breakdown.ts` one mutation at a time, runs `test/breakdown.test.ts`, and restores the file. Baseline 28 of 28 passed. Result: 35 mutations, 35 caught, 0 escaped, 0 error, 0 timeout, 0 not applied. "file restored: yes". `git status --short` and `lsof -i :3000` printed nothing. No source or test file changed, so the totals stay at 31 files, 875 tests (verified at 4.1).
- Caught: M1 to M35 (payment object check, zero total and zero line allowed, empty lines and not-a-list checks, sum check inverted, removed, with a 1 kobo tolerance, or missing the last line, system_only and unknown mixed up, `lineIndex` lost on all four line errors, six error codes renamed, input echoed in three messages, inherited keys read, three freezes removed, amount read from the wrong key, array and null accepted as objects, category check bypassed, loop starting at line 1, line object check removed).
**Stubbed:** nothing new. No route, table or screen uses `checkBreakdown`.
**Tests:** none new. Total 875.
**Not verified:** how long the run took. DR-02 and DR-04 still await Mr. Aro (OQ-00, A-96).
**Found along the way:**
1. My prediction (35 caught, escapes possible) was half right: none escaped.
2. `docs/TRACEABILITY.md` had two R-05 rows, both with the old text, and lacked the 4.1 text. I do not know why: my message said the new row was applied as an append, which was a guess. Fixed by a whole-file replacement in this step.
3. The owed break-on-purpose run for `breakdown.ts` is closed. Still owed: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b).
4. NEXT_FILES for 4.2 is a guess for the test files that build a `Store` by hand: I have seen none of them this chat. STATUS asks you to run a grep so the list can be completed.

## Step 4.1 (size S), 2026-10-18: payment breakdown check, pure logic

**Works (verified on your machine, output pasted: `npm run check` clean, typecheck and lint without errors, 31 files, 875 tests; I ran nothing in my sandbox):** `server/src/breakdown.ts` (`checkBreakdown`, `BreakdownError` with 10 codes, `BreakdownLine`, `CheckedBreakdown`). It takes `{ total, lines: [{ category, amount }] }` with amounts as strings (A-18). It returns exact kobo, or throws. Checks in this order: input is an object; total is a valid amount and above zero; lines is a non-empty list; each line (first bad one wins) is an object, has a valid category (Membership Withdrawal gives `system_only`), has a valid amount above zero; the lines add up to the total with no tolerance (DR-02). Line errors carry `lineIndex`. Messages never repeat the input. The result is frozen. Own keys only are read. Decision D-43.
**Stubbed:** nothing uses `checkBreakdown`: no route, table, store, balance or screen. Loan Repaid effects on loans (DR-09) are not here.
**Tests:** 28 new in `test/breakdown.test.ts` (accepts 8, mismatch 3, input shape 4, total 2, lines 6, order of checks 3, error type 2). Total 875 (was 847).
**Not verified:** break-on-purpose for `breakdown.ts` (owed, step 4.1b). DR-02 itself is "requested", and the category list is "proposed", so both await Mr. Aro (OQ-00, A-96). Whether the repo `DOMAIN_RULES.md` equals the mirror beyond DR-02 and DR-04 (you pasted only those two lines, and they matched).
**Found along the way:**
1. All predictions matched: 31 files, 875 tests, 28 new.
2. NEXT_FILES miss: the list carried `money.ts`, `money.test.ts`, `eslint.config.js` and `tsconfig.json` but not `categories.ts` or `categories.test.ts`, which 4.1 builds on. You pasted them. The new list is written for 4.1b only.
3. `mirror/DECISIONS.md` needs D-43 by hand.
4. Vitest again suggests `isolate: false` (about 4 s faster). I changed nothing.

## Step 3.3b (size S), 2026-10-18: break-on-purpose for categories.ts

**Works (verified on your machine, output pasted; I ran nothing in my sandbox):** one throwaway script, `mutate-3.3b.mjs`, on your Desktop (not in git). It changes `server/src/categories.ts` one mutation at a time, runs `test/categories.test.ts`, and restores the file. Baseline 13 of 13 passed. Result: 20 mutations, 19 caught, 1 escaped, 0 error, 0 timeout, 0 not applied. "files restored: yes". No source or test file changed, so the totals stay at 30 files, 847 tests (verified at 3.3).
- Caught: C1 to C13, C15 to C20 (every refundable flag flipped, Building Funds removed and moved, a name typo, Membership Withdrawal added to the table, the system-only constant changed, `isRefundable` always true, the `system_only` path removed, the error code renamed, the input echoed in the message, both lists unfrozen).
- Escaped: C14 (the `typeof` check removed from `isPaymentCategory`). Equivalent: `Map.has` of a non-string is false anyway (A-98).
**Stubbed:** nothing new. No route, table or screen uses categories.
**Tests:** none new. Total 847.
**Not verified:** how long the run took. The first run's raw output (see below).
**Found along the way:**
1. My first script run was unusable: baseline "0 passed" and 19 ERROR results. My script could not read the vitest summary. I believe colour codes were the cause. The rerun with colour switched off gave the right counts, which fits that guess.
2. Predictions matched: 19 caught, C14 escaped.
3. The owed break-on-purpose run for `categories.ts` is closed. Still owed: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b).

## Step 3.3 (size S), 2026-10-18: payment categories, pure logic

**Works (verified on your machine, output pasted: `npm run check` clean, typecheck and lint without errors, 30 files, 847 tests; I ran nothing in my sandbox):** `server/src/categories.ts` (`PAYMENT_CATEGORY_TABLE`, `PAYMENT_CATEGORIES`, `REFUNDABLE_CATEGORIES`, `SYSTEM_ONLY_CATEGORY`, `isPaymentCategory`, `isRefundable`, `parsePaymentCategory`, `CategoryError` with codes `unknown` and `system_only`). 14 categories in DR-04 order, Building Funds last. Five refundable (DR-03): Shares, Savings, Special Savings, Special Deposit, Building Funds. "Membership Withdrawal" is not in the table and `parsePaymentCategory` refuses it with `system_only`. Names match exactly (case and spaces count). The error message never repeats the input. Decision D-42.
**Stubbed:** nothing uses categories yet: no route, table, balance or screen. No expense category list (DR-11, Phase 5).
**Tests:** 13 new in `test/categories.test.ts`. Total 847 (was 834).
**Not verified:** break-on-purpose for `categories.ts` (owed, step 3.3b). DR-04 itself is "proposed", so the list awaits Mr. Aro (OQ-00, A-96). Whether the repo `DOMAIN_RULES.md` equals the mirror (you reported no difference).
**Found along the way:**
1. All predictions matched: 30 files, 847 tests (13 new).
2. NEXT_FILES at resume held `permissions.ts` and config files that 3.3 did not need. It was a precaution, not a miss. The new list is written for 3.3b only.
3. `mirror/DECISIONS.md` needs D-42 by hand.

## Step 3.2c (size S), 2026-10-18: close the test gaps from 3.2b

**Works (verified on your machine, output pasted: `npm run check` clean, 29 files, 834 tests; mutation rerun 76 mutations, 72 caught, 4 escaped, 0 error, 0 timeout, 0 not applied, "files restored: yes"; `git status --short` showed only the two edited test files; I ran nothing in my sandbox):** tests only, no source change. Two route tests in `test/members-routes.test.ts`: phone, address and occupation come back trimmed in their own fields (R10); a caller without `members.create` who sends malformed JSON gets 403, not 400 (R2). Two cases in `test/helpers/members-contract.ts`, run on both adapters: a returned member from `findById` and from `list` cannot change stored data (M5, M6).
- Newly caught: R2, R10, M5, M6 (1 failed each).
- Still escaped, all expected: L26 (A-91), R8, R14, R15 (A-92). Duplicated or unreachable checks.
**Stubbed:** nothing new. Still no edit, delete or status route, no screen.
**Tests:** 6 new (2 route, 2 contract cases x 2 adapters). Total 834 (was 828). Baselines: routes 27, mem 121, prisma 76.
**Not verified:** how L26 behaves on Prisma (A-91). How long the mutation run took. Behaviour on a server database (A-35). Why the "logic" baseline rose from 70 to 72 (not seen in the script).
**Found along the way:**
1. All predictions matched: 834 tests, 72 caught, 4 escaped, baselines 27, 121 and 76.
2. I wrote the memory-adapter tests without seeing `memory-store.ts`. They caught M5 and M6 on the first run, so no adapter fix was needed.
3. The owed break-on-purpose runs for the members code are closed. Still owed: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b).

## Step 3.2b (size S), 2026-10-18: break-on-purpose for the members code

**Works (verified on your machine, output pasted; I ran nothing in my sandbox):** one throwaway script, `mutate-3.2b.mjs`, on your Desktop (not in git). It changes `members.ts`, `members-routes.ts` and the members code in `memory-store.ts` and `prisma-store.ts` one mutation at a time, runs the matching test files, and restores the files. Baseline: logic 70, routes 25, mem 119, prisma 74 tests, all PASS. Result: 76 mutations, 68 caught, 8 escaped, 0 error, 0 timeout, 0 not applied. "files restored: yes". No source or test file changed, so the totals stay at 29 files, 828 tests (verified at 3.2).
- Caught: L1 to L25, L27 to L36 (permission checks, every name and text limit and boundary, trimming, null text, type checks, audit action, entity type and detail, status filter and default, letter case, scope rule and its inversion, Staff filter ignored, ISO date, field mix-ups), R1, R3 to R7, R9, R11 to R13, R16, R17 (auth guard, 201, empty list, body limit, status codes, body field, query fields, id param, POST to PUT), M1 to M4, M7 to M11 (unknown creator, numbering, new member Inactive, create copy, both filters, setStatus, date copy), P1 to P12 (Membership ID, number skip, error mapping, retry, one try, both filters, order, setStatus, status, phone, findById).
- Escaped: L26, R2, R8, R10, R14, R15, M5, M6.
  - L26, R14, R15: duplicated checks, equivalent in tests (A-91, A-92).
  - R8: unreachable through the routes (A-92).
  - R2: duplicated, but the "guard before body" order is not pinned (A-92).
  - R10: a test gap, no route test checks phone, address or occupation values (A-93).
  - M5, M6: a test gap in the test-only memory adapter (A-94).
- P4 and P5 were caught. With only one try allowed, a test failed, so I believe the retry path runs on SQLite (A-79 updated). That is an inference from the result.
**Stubbed:** nothing new. Still no edit, delete or status route, no screen.
**Tests:** none new. Total 828.
**Not verified:** that L26 would behave differently on Prisma (A-91). How long the run took (not in the paste). Behaviour on a server database (A-35).
**Found along the way:**
1. Predictions: L26, R2, R14, R15 and M6 escaped as I said. P4 and P5 I said might escape, and they were caught. R8, R10 and M5 I did not predict.
2. My step message said that if all memory or Prisma mutations escaped, the members contract might not be wired into `store-contract.ts`. It is wired: M1 to M4 and P1 to P12 were caught. I never needed to see `store-contract.ts`.
3. My resume reply asked about `app.ts`. The script did not need it. It was in the resume pack only as a precaution, not a NEXT_FILES miss. My reply also listed two non-inconsistencies (the mirror note and the adapter test files). `mirror/DECISIONS.md` already holds D-41, as shown in this chat. STATUS no longer asks for it.
4. The owed break-on-purpose runs for step 3.1 and step 3.2 are closed. Still owed: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b).
5. Port 3000 was free and `git status --short` was empty after the run (your paste).

## Step 3.2 (size M), 2026-10-18: member logic and routes

**Works (verified on your machine, output pasted: `npm run check` clean, 29 files, 828 tests; live check "87 passed, 0 failed" against the real server and SQLite database; I ran nothing in my sandbox):** `server/src/members.ts` (`createMember`, `listMembers`, `getMember`) and `server/src/members-routes.ts` (`POST /members`, `GET /members`, `GET /members/:id`), mounted in `app.ts`. Staff see only members they recorded; the Super Admin sees all and can filter with `createdById` (DR-13, OQ-09). Status filter defaults to Active (`active`, `inactive`, `all`). A member a Staff user may not see answers 404. Text is trimmed; name 1 to 100 characters, other fields at most 200 (A-82, A-90). `member.created` audit entry with the Membership ID only. Decision D-41.
**Stubbed:** no edit, delete or status route (the `members.edit` and `members.delete` permissions exist but nothing uses them). No automatic Inactive rule (Phase 6). No balances, no Building Funds category. No duplicate-name check. No paging. No screen.
**Tests:** 70 new: `test/members.test.ts` 45, `test/members-routes.test.ts` 25. Total 828 (was 758). The live check gains 14 checks (73 to 87). The members store ran on the real Prisma adapter through the live check.
**Not verified:** break-on-purpose for `members.ts`, `members-routes.ts` and the members store (owed, step 3.2b). That the server was stopped and port 3000 freed (the paste ends with the server running). `git status --short` (not pasted).
**Found along the way:**
1. My count error: I wrote 71 new tests and 829 in total. The real numbers are 70 and 828, because `members-routes.test.ts` has 25 tests, not 26. The live-check prediction of 87 was right.
2. My doubt about the `request(app)[method](...)` form was unfounded. Typecheck and lint were clean.
3. No test file that builds a `Store` by hand broke, as predicted: `Store` did not change.
4. At resume I listed the mirror as an inconsistency. It was not one: the mirror already held D-40. STATUS no longer says it needs D-40.
5. `mirror/DECISIONS.md` needs D-41 by hand.

## Step 3.1 (size M), 2026-10-18: members table and store

**Works (verified on your machine, output pasted: `migrate dev` created and applied `20261017231516_members`; `npm run check` clean, 27 files, 758 tests; `.tables` lists `Member`; `git status --short` showed the 11 expected lines; I ran nothing in my sandbox):** model `Member` and enum `MemberStatus` in `schema.prisma`. `MemberRecord`, `NewMember`, `MemberListQuery`, `MemberStore` and `formatMembershipId` in `store.ts`; `members` added to `Store`. Both adapters implement `create`, `findById`, `list` and `setStatus`. The Membership ID is made from a stored number `seq` (1 gives `IO-001`, 1000 gives `IO-1000`). `createdById` records who recorded the member (DR-13, DR-15). Decision D-40.
**Stubbed:** no routes, no input checks (trimming, length), no audit entry for member creation, no pay-off or automatic Inactive rule (Phase 6). No Building Funds category yet. No balances.
**Tests:** 32 new. `test/helpers/members-contract.ts` 12 cases x 2 adapters = 24, `test/membership-id.test.ts` 8. Total 758 (was 726). The Prisma half ran on a real SQLite file built from the real migrations.
**Not verified:** the break-on-purpose run for the members store (owed, not run). Whether the "try again on a number clash" path in the Prisma `create` was ever used: the parallel test passed, but it does not show whether a retry happened (A-79). Behaviour on a server database (A-35).
**Found along the way:**
1. NEXT_FILES miss: the list lacked `auth-routes.test.ts`, `owner-reset.test.ts` and `staff-routes.test.ts`, which the grep in STATUS found. You pasted them. The new list is written for 3.2 only.
2. I predicted that three test files build a full `Store` literal (`auth.test.ts`, `sessions.test.ts`, `auth-routes.test.ts`). Typecheck was clean after I added `members` to those three only, so the prediction was right (verified on your machine).
3. The step 3.1 count prediction was right: 758 tests in 27 files, migration applied, no reset asked.
4. `prisma-store.test.ts` took about 43 s. The fresh-database tests took 21.6 s and 4.1 s. All are inside the 120 s limit. Vitest suggested `isolate: false`. I did not change anything.
5. `mirror/DECISIONS.md` needs D-40 by hand.

## Step 2.6b (size S), 2026-10-17: break-on-purpose for the audit viewer

**Works (verified on your machine, output pasted; I ran nothing in my sandbox):** one throwaway script, `mutate-2.6b.mjs`, on your Desktop (not in git). It changes `audit-view.ts`, `audit-routes.ts` and the `audit.list` code in both adapters one mutation at a time, runs the matching test files, and restores the files. Baseline: view, routes, mem, prisma all PASS. Result: 48 mutations, 45 caught, 3 escaped, 0 error, 0 timeout, 0 not applied. All four files "restored: yes". No source or test file changed, so the totals stay at 26 files, 726 tests (verified at 2.6).
- Caught: V1 to V12, V14 to V25 (permission check removed and inverted, every limit, offset and filter bound, filter checks, paging, extra row and `hasMore`, filters passed on, ISO time, detail), R27 to R34 (auth guard removed, status codes, 201, each query field, GET to POST), M35 to M42 (order, ties, offset, page size, both filters, no-actor entries, copies), P43, P45 to P48 (order, offset, limit, both filters). P43 and P45 to P48 show the audit-list contract runs on the Prisma adapter.
- Escaped: V13, R26, P44.
  - V13 (filter of exactly 100 characters refused): a test gap, A-76. Low risk.
  - R26 (`requirePermission` removed from the route): equivalent, the logic check is duplicated, A-77.
  - P44 (Prisma tie-break by id removed): equivalent for the tests, A-74, A-78.
**Stubbed:** no date filter, no search, no export. Reading the log is not audited (A-75).
**Tests:** none new. Total 726.
**Not verified:** the last `git status --short` printed no lines in your paste, which looks the same as a cut-off paste. The script's own check says all four files were restored. Equal-time ordering on Prisma (A-74).
**Found along the way:**
1. My count error: I wrote 47 mutations in the step message. The script had 48.
2. My prediction was half right: I expected R1 (permission check removed in `audit-view.ts`) to escape. It was caught (3 failed), because `audit-view.test.ts` calls the logic directly. R26, V13 and P44 escaped as predicted.
3. My resume reply listed a second "inconsistency" about DOMAIN_RULES that was muddled. There was none. Ignore it.
4. The audit viewer's owed break-on-purpose run is now closed. Still owed: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b).
5. NEXT_FILES for Phase 3 is a guess for the test files that build a `Store` by hand. I have not seen all of them. The command in STATUS finds the rest.

## Step 2.6 (size M), 2026-10-17: audit viewer

**Works (verified on your machine, output pasted: `npm run check` clean, 26 files, 726 tests; live check "73 passed, 0 failed"; I ran nothing in my sandbox):** `GET /audit` for the Super Admin only (`users.manage`, D-39). Newest first, `limit` (default 50, max 200), `offset`, exact filters `actorId` and `action`. Entries with no actor are included (A-28). New `AuditStore.list` in the interface and both adapters. New files: `audit-view.ts`, `audit-routes.ts`, `test/helpers/audit-list-contract.ts`, `test/audit-view.test.ts`, `test/audit-routes.test.ts`. Mounted in `app.ts`.
**Stubbed:** no date filter, no search, no export. Reading the log is not audited (A-75).
**Tests:** 62 new: contract 7 cases x 2 adapters = 14, `audit-view.test.ts` 34, `audit-routes.test.ts` 14. Total 726 (was 664). The live check gains 13 checks (60 to 73).
**Not verified:** the break-on-purpose run (owed, step 2.6b). Ordering of entries made in the same millisecond on Prisma (A-74).
**Found along the way:**
1. My count error: I predicted 74 live checks. The audit section has 13, so 73 is right.
2. My step message gave a risk I had already named: nine test files build an `AuditStore` by hand, so the first `npm run check` failed at typecheck with 12 errors ("Property 'list' is missing"). I had not seen those files. I did not ask for them before giving the step. Fixed by adding `list` to each hand-built store. NEXT_FILES should have carried the test files that build stores by hand.
3. A-70 is settled by reading `password.ts`: `hashPassword` calls `assertPasswordAllowed` first, so mutation O1 from 2.5f is equivalent (the check is duplicated). I did not run anything for this.
4. `mirror/DECISIONS.md` needs D-39 by hand.

## Step 2.5f (size S), 2026-10-17: break-on-purpose for owner-reset.ts

**Works (verified on your machine, output pasted; I ran nothing in my sandbox):** one throwaway script, `mutate-2.5f.mjs`, on your Desktop (not in git). It changes `server/src/owner-reset.ts` one mutation at a time, runs `test/owner-reset.test.ts`, and restores the file. Baseline 15 of 15 passed. Result: 22 mutations, 18 caught, 4 escaped, 0 timeouts, 0 not applied. "file restored: yes". No source or test file changed, so the totals stay at 24 files, 664 tests (verified at 2.5e).
- Caught: O2 to O19 (owner filter, two-owners and no-owner checks, hash not saved, plain password saved, tokens not revoked, lockout not cleared, five audit field changes, password leaked into audit detail, result email, active flag and token count, owner reactivated, inactive owner ignored).
- Escaped: O1, O20, O21, O22.
  - O20 (owner lookup before the password rules): equivalent, every bad-password test has an owner.
  - O21 (failed `setPasswordHash` no longer throws): equivalent on the memory store, where the user always exists.
  - O22 (revoke time ignores `now`): a test gap. No test reads the revoke time. Low risk.
  - O1 (password rules check removed in `resetOwnerPassword`): cause not confirmed. The bad-password tests still threw `PasswordPolicyError` and changed nothing. Likely cause: `hashPassword` checks the rules itself. I have not seen `password.ts` (A-70).
**Stubbed:** no audit viewer. `reset-owner-password.ts` (the terminal script) has live-run coverage only, no unit tests.
**Tests:** none new. Total 664 (verified at 2.5e).
**Not verified:** why O1 escaped. Whether `hashPassword` validates its input. The server was not run in this step. The last `git status --short` printed no lines in your paste, but an empty result looks the same as a cut-off paste. The script's own check says the file was restored.
**Found along the way:**
1. Port 3000 was free before the run (`lsof -i :3000` printed nothing, your paste).
2. `mirror/DECISIONS.md` already had D-38 when I read it, so no mirror change is needed this time. No new decision in this step.
3. NEXT_FILES for the audit viewer includes `server/src/password.ts` so O1 can be settled.

## Step 2.5e (size M), 2026-10-17: reset the owner password from the terminal

**Works (verified on your machine, output pasted: `npm run check` clean, 24 files, 664 tests; script run on a temporary database; live check "60 passed, 0 failed"; I ran nothing in my sandbox):** `server/src/owner-reset.ts` (`findOnlyOwner`, `resetOwnerPassword`, `NoOwnerError`, `MultipleOwnersError`), `server/src/reset-owner-password.ts` and `npm run reset:owner`. It refuses piped input, asks twice with no echo, and changes the only Super Admin's password. It ends that account's refresh tokens, clears its lockout and writes one `owner.password_reset` entry (actor = the owner, detail `tokens_revoked=N`). It does not reactivate an inactive owner and prints a note instead.
**Stubbed:** no audit viewer. No unlock or reset for a second owner (the script refuses if two Super Admins exist).
**Tests:** 15 new in `test/owner-reset.test.ts` (success 8, refusals 7). Total 664 (was 649).
**Live runs (your machine, temporary database `reset-test.db`, then deleted):** pipe refused; mismatch refused; reset printed "Password changed for owner@example.test. Sessions ended: 0."; `live-check-auth.sh` 60 passed; empty database printed "No Super Admin exists...". 
**Not verified:** the break-on-purpose run for `owner-reset.ts` (owed). Ending sessions through the real script (the live run had none to end; covered by unit tests and the Prisma contract). That the server was stopped and port 3000 freed after the live check (not shown). That the live check login used the new password (not visible in the paste).
**Found along the way:**
1. My mistake in the resume reply: I said `mirror/DECISIONS.md` stopped at D-36. The copy I was shown already had D-37. The mirror must now get D-38.
2. My resume reply also listed two non-problems (the pack sections, the open break-on-purpose list) as possible inconsistencies. They were not. Ignore them.
3. `.env.example` was skipped by the pack script again ("looks private", names only). It was not needed.
4. A locked owner can now be unlocked by this script (A-43, A-65 updated).

## Step 2.5d-mutate (size S), 2026-10-16: break-on-purpose for 2.5d, verify-before-docs rule

**Works (verified on your machine, output pasted: `npm run check` clean, 23 files, 649 tests):** one new test in `test/account.test.ts` ("refuses 1 ms before the lock ends and accepts at the end instant"). Two throwaway scripts on your Desktop (`mutate-2.5d.mjs`, `mutate-2.5d-part2.mjs`), not in git.
**Break on purpose (your machine, one mutation at a time, files restored by the script):** 28 mutations, 26 caught, 2 escaped.
- `account.ts` (17): A1 to A14, A16, A17 caught. A4 (lock ends at the exact instant, `>=` for `>`) escaped at first. That was a real gap. The new test catches it (1 failed). A15 (user id guard removed) escaped.
- `resetStaffPassword` (11): R1 to R9 and R11 caught. R10 (non-text id guard removed) escaped.
- A15 and R10 change nothing on the memory store: a non-text id finds no user. Treated as equivalent there (A-66).
**Tests:** 1 new. Total 649 (was 648).
**Not verified:** how the Prisma store handles a non-text id (A-66). The break-on-purpose run did not use the Prisma store.
**Found along the way:**
1. Process change (D-37): docs now come after the owner pastes the real check output, in the same chat. A fresh chat must not ask for earlier checks. Item 13 is in the Project instructions (owner reported). STATUS "How we work" is rewritten.
2. My count error: I wrote "29 mutations, 27 caught". The right count is 28 and 26, because A4 ran twice.
3. NEXT_FILES miss: the 2.5e list written at 2.5d-docs lacked `server/src/staff.ts` (needed to mutate `resetStaffPassword`). You pasted it. The new list carries it, plus `auth.ts` (lock constants).
4. Commit slip at 2.5d-docs: the first commit ran from `server/`, so it held only `tsconfig.json` (c9a6480). The docs went in a second commit from the repo root (52a50c0). Same message, harmless. STATUS now says git runs from the repo root.
5. Your first paste of part 1 ended with no `git status` lines. The part 2 run showed only `M test/account.test.ts`, so the tree was clean.

## Step 2.5d-docs (size S), 2026-10-16: verify 2.5d, repair docs, NEXT_FILES for 2.5e

**Works (not verified: docs and one config file; typecheck and lint owed on your machine):** `server/tsconfig.json` `include` no longer lists `test` twice. ASSUMPTIONS A-55 repaired. TRACEABILITY R-29 status updated and an R-25 row added. STATUS and `docs/NEXT_FILES.txt` replaced for 2.5e.
**Tests:** none new (648 total, verified at 2.5d).
**Found along the way:**
1. 2.5d is verified on your machine: `npm run check` clean, 23 files, 648 tests; live check "60 passed, 0 failed"; commit 57db980, pushed. The counts match my predictions. The first `npm run check` in your paste (20 files, 584 tests) is from before the 2.5d files, so I ignored it.
2. NEXT_FILES miss: the 2.5e list written at 2.5d lacked `vitest.config.ts`, `prisma.config.ts`, `store-contract.ts`, `account.test.ts` and `.env.example`. You pasted them. The new list carries them.
3. `vitest.config.ts` is now seen: `include` is `test/**/*.test.ts`, `testTimeout` is 15000. The explicit 30 s in the hashing tests is above that on purpose.
4. A-55 was garbled in the repo (leftover text after the table row, from the 2.5d edit). Repaired.
5. TRACEABILITY skipped R-25. I do not know what it was. The row now says "unused". If you remember it, tell me.
6. `mirror/DECISIONS.md` is stale (stops at D-30). Replace it with the repo copy.

## Step 2.5d (size M), 2026-10-16: change own password, reset a Staff password

**Works (verified on your machine: `npm run check` clean, 23 files, 648 tests; live check "60 passed, 0 failed"; commit 57db980, pushed; I ran nothing in my sandbox):** `UserStore.setPasswordHash` in the Store and both adapters. `changeOwnPassword` in `server/src/account.ts`. `resetStaffPassword` in `staff.ts`. `POST /auth/password` and `PUT /staff/:id/password`. A wrong current password counts toward the sign-in lockout. Success ends the account's refresh tokens and clears the lockout. Audit: `password.changed`, `password.change_failed`, `staff.password_reset`. Expected `npm run check`: 23 test files, 648 tests. Expected live check: 60 passed.
**Stubbed:** no owner password reset by script (2.5e). No audit viewer. No manual unlock for a locked owner (A-43).
**Tests:** 64 new by my count: `test/helpers/password-contract.ts` 4 cases x 2 adapters = 8, `test/account.test.ts` 22, `test/account-routes.test.ts` 10, `test/staff-password.test.ts` 24. Live check gains 16 checks.
**Not verified:** nothing outstanding. The break-on-purpose run was done in step 2.5d-mutate (26 of 28 caught, 2 equivalent on the memory store). The owner's own password is not changed by the live check.
**Found along the way:**
1. 2.5c is verified on the owner's machine (b1f6430, 20 files, 584 tests, live check 44, break-on-purpose set done). STATUS, ASSUMPTIONS A-30 and the 2.5c entry are corrected here.
2. OQ-15 answered: the default. Closed.
3. I did not see `vitest.config.ts`, so tests that hash set an explicit 30 s timeout.
4. `/auth/password` sits behind the JSON parser of `/auth`, so malformed JSON gives 400 before the 401. The `/staff` routes run guards first. Harmless here; noted.

## Step 2.5c (size M), 2026-10-16: deactivate and reactivate staff, parsePermissions tests

**Works (verified on your machine: `npm run check` clean, 20 files, 584 tests; live check "44 passed, 0 failed"; commit b1f6430, pushed; break-on-purpose P1 to P5 and S1 to S7 all caught except P4, the expected equivalent mutant; I ran nothing in my sandbox):** `UserStore.setActive` in the Store and both adapters. `deactivateStaff` and `reactivateStaff` in `staff.ts`. `POST /staff/:id/deactivate` and `/reactivate` in `staff-routes.ts`. Deactivating ends all of the account's refresh tokens and writes `staff.deactivated` (detail `tokens_revoked=N`); reactivating writes `staff.reactivated`. `parsePermissions` is exported and unit-tested. Expected `npm run check`: 20 test files, 584 tests. Expected live check: 44 passed.
**Stubbed:** no change-password or reset (2.5d, 2.5e). No audit viewer. A deactivated Super Admin is not possible here (A-60).
**Tests:** 52 new by my count: `test/helpers/active-contract.ts` 5 cases x 2 adapters = 10, `test/parse-permissions.test.ts` 12, `test/staff-active.test.ts` 30 (deactivate 12, reactivate 5, list 1, routes 12).
**Not verified:** nothing outstanding from this step.
**Found along the way:**
1. 2.5b is verified on the owner's machine (5a1b368: 18 files, 532 tests, live check 33) and its break-on-purpose run is done (7 of 7 caught). STATUS and TRACEABILITY still said "not verified"; fixed here.
2. The owner asked for a change-password or reset-password step. Added to the plan as 2.5d and 2.5e (OQ-15). Defaults recorded, details await the owner.
3. The `parsePermissions` run was owed because only the Prisma suite could reach it. It is now exported and tested as a pure function. P4 is expected to be an equivalent mutant (the try block also catches the error).
4. The `mirror/DECISIONS.md` copy ends at D-34, as the repo did. It must get D-35 by hand.

## Step 2.5b (size M), 2026-10-16: staff accounts and stored permissions

**Works (verified on your machine: `db:deploy` applied the migration, `migrate dev` "Already in sync", `npm run check` clean, 18 files, 532 tests; live check "33 passed, 0 failed"; commit 5a1b368; I ran nothing in my sandbox):** `User.permissions` column and migration `20261016120000_user_permissions` (hand-written, like A-36). `UserRecord.permissions`, `NewUser.permissions`, `list()` and `setPermissions()` in the Store and both adapters. `server/src/staff.ts` (`createStaff`, `listStaff`, `setStaffPermissions`), `server/src/staff-routes.ts` (`POST /staff`, `GET /staff`, `PUT /staff/:id/permissions`), mounted in `app.ts`. `subjectOf` in `guards.ts` now reads the stored list. Expected `npm run check`: 18 test files, 532 tests. Expected live check: 33 passed.
**Stubbed:** no deactivate or reactivate staff (A-30), no change-own-password or reset (A-55), no audit viewer. No data route uses a guard yet.
**Tests:** 71 new by my count: `test/helpers/permissions-contract.ts` 9 cases x 2 adapters = 18, `test/staff.test.ts` 29 (createStaff 18, listStaff 3, setStaffPermissions 8), `test/staff-routes.test.ts` 24. Live check gains 14 checks.
**Not verified:** everything. No break-on-purpose run (owed; security code). Whether unseen test files (`auth-routes.test.ts`, `lockout.test.ts`, `tokens.test.ts`) still typecheck with the new `UserRecord` and `Store` shapes.
**Found along the way:**
1. 2.5a is verified on the owner's machine: commit 9f5cc96, 16 files, 461 tests, live check 19 of 19.
2. OQ-13 answered by the owner: the default list. Closed.
3. NEXT_FILES miss: the pack for this chat did not show `auth.ts`, `tokens.ts`, `sessions.ts`, `db.ts` or `server.ts`, so the owner pasted them. Why `NEXT_FILES.txt` lacked them was not seen. The new list is written from the 2.5c brief.
4. The STATUS note "mirror/DECISIONS.md must get D-33" is now out of date; D-34 must be added to the mirror by hand instead.
5. My bug: two tests used `const { permissions: _unused, ...rest }` to drop a key. The lint rule `no-unused-vars` flags it here (no underscore exception in `eslint.config.js`). Fixed by building the object without the key. Found by `npm run check` on the owner's machine (lint stage, 2 errors). Typecheck was clean, so the three unseen test files compile with the new `UserRecord` and `Store` shapes.
6. The 2.5b docs were committed without item 5. Added in the break-on-purpose step.
7. Break-on-purpose run for `staff.ts` and `guards.ts` (owner's machine, one mutation at a time, files restored with `git checkout`): 7 mutations, all caught. S1 mayManage always true (4 failed), S2 Super Admin not refused in setStaffPermissions (1), S3 listStaff includes Super Admin (3), S4 audit action renamed (1), G1 subjectOf ignores stored list (3), G2 permission check disabled (24), G3 inactive user allowed (2). A first run with all 7 applied at once (40 failed) could not show which test caught which, so it was redone one by one. Still owed: `parsePermissions` in `prisma-store.ts` (only the Prisma suite or live check can catch it).

## Step 2.5a (size M), 2026-10-16: route guards and GET /auth/me

**Works (not verified anywhere yet; I ran nothing in this chat):** `server/src/guards.ts`: `requireAuth` (Bearer header, access token check, user loaded from the store on every request, inactive and unknown users refused, one 401 body), `requirePermission` (403, or 401 if no guard ran before it), `getAuth`, `subjectOf`. `GET /auth/me` returns the user (no hash) and the permissions held. `app.ts` unchanged. Expected `npm run check`: 16 test files, 461 tests. Expected live check: 19 passed.
**Stubbed:** Staff hold no permissions (A-49) until 2.5b. No data route uses a guard yet. Failed guard attempts are not audited (A-52). No per-IP limit (A-42).
**Tests:** 72 new by my count: `test/guards.test.ts` 64 (requireAuth 16, requirePermission 48 = 22 Super Admin + 22 Staff + 4), `test/auth-me.test.ts` 8. The live check gains 7 checks.
**Not verified:** everything. No break-on-purpose run (owed; security code). The staff-with-grants case cannot be tested yet (no stored list). Whether `curl -K -` reads headers on stdin on your macOS curl (the live check will show it).
**Found along the way:**
1. 2.4c is verified on the owner's machine: commit 7f44280, `NEXT_FILES` paths all exist, `git status` clean.
2. Access tokens are stateless, so one stays valid until it expires even after sign-out (A-50). Pinned by design, not by a test.
3. `DEV_SETUP.md` was stale about `/auth`. Fixed in this step.

## Step 2.4c (size S), 2026-10-16: fix NEXT_FILES for 2.5a

**Works (not verified: docs only, nothing run):** `docs/NEXT_FILES.txt` replaced. It now lists the 18 paths that step 2.5a changes, imports, or needs to run `npm run check`. STATUS gains handoff rule 2 (write the list for the next step only).
**Tests:** none. Last `npm run check` on the owner's machine: 14 files, 389 tests (2.4b).
**Found along the way:**
1. NEXT_FILES miss: the list was the 2.4b list. It held `server.ts`, `owner.ts`, `schema.prisma` and `store-contract.ts`, which 2.5a does not touch. It lacked `auth.ts`, `sessions.ts`, `tokens.ts`, `store.ts`, `email.ts`, `password.ts`, `package.json`, `tsconfig.json`, `eslint.config.js` and `live-check-auth.sh`. The owner had to paste them. Why it was not rewritten at the end of 2.4b is not known (that message was not seen).
2. The 12 file sections in the 2.4b resume pack matched the old list exactly, so the pack script follows NEXT_FILES.txt.
3. `mirror/DECISIONS.md` was stale (stopped at D-30). The owner updated it with D-31 and D-32. The repo still wins if they differ.
4. Port 3000 was free (`lsof` printed nothing, verified on the owner's machine).
5. `DEV_SETUP.md` still says `/auth` is served "from step 2.4b". Not changed here. It is in the 2.5a list and gets fixed there.

## Step 2.4b (size M), 2026-10-16: serve the auth routes, live check

**Works (verified on your machine: `npm run check` clean, 14 files, 389 tests; `npm run typecheck` clean with the final `server.ts`; live check `sh scripts/live-check-auth.sh` printed "12 passed, 0 failed" against the real server and a real SQLite database; I ran nothing in my sandbox):** `server/src/server.ts` uses the Prisma store and `TOKEN_SECRET`, mounts `/auth`, reports a listen error, and stops cleanly on Ctrl+C. `scripts/live-check-auth.sh` runs 12 checks: health, wrong password, login, refresh, reuse, family revoke, second login, logout, refresh after logout.
**Stubbed:** no route guard, no staff accounts, no per-IP limit (A-42).
**Tests:** none new (389 total). The live check is the evidence.
**Not verified:** no break-on-purpose run (owed for the routes and `server.ts`). Lockout over HTTP beyond the one wrong try. Behaviour on a hosted server.
**Found along the way:**
1. My bug: the first `server.ts` printed "server listening" even when the port was busy, because it ignored the error passed to the `listen` callback. A stale node process held port 3000, so the old server answered and `/auth/login` returned 404. Fixed: it now prints "Could not listen on port N" and sets a failing exit code. Confirmed on your machine: typecheck clean, then "Could not listen" while the port was busy, then success once it was free.
2. The stale server kept coming back after `kill` (PIDs 1193, 90290, 90600). The cause was not shown. It is probably a `tsx watch` or an old tab. The live check passed after it was cleared.
3. The dev database was reset because the owner password was forgotten, and a new owner was created. Dev data is fictional only (D-08), so nothing real was lost. There is still no reset-password feature. If you want one, say so and it becomes a small step with a decision.
4. 2.4a is verified on your machine: 14 files, 389 tests, commit 99cdcab. The 2.4a entry, A-46 and TRACEABILITY R-18 are corrected here.
5. A-48: the server must be started from inside `server/`.

## Step 2.4a (size M), 2026-10-16: auth routes

**Works (verified on your machine: `npm run check` clean, 14 files, 389 tests, commit 99cdcab; I ran nothing in my sandbox):** `server/src/auth-routes.ts` (`POST /auth/login`, `/auth/refresh`, `/auth/logout`), `createApp(deps?)` in `app.ts` with a JSON error handler, `TOKEN_SECRET` name in `.env.example`. Expected `npm run check`: 14 test files, 389 tests.
**Stubbed:** `server.ts` is unchanged, so the running server does not serve `/auth` yet (step 2.4b). No route guard, no staff accounts, no per-IP limit (A-42 stays open).
**Tests:** 25 new in `test/auth-routes.test.ts` by my count (login 14, refresh 6, logout 2, createApp 3).
**Not verified:** break-on-purpose run (owed; security code). Live check (moved to 2.4b).
**Found along the way:**
1. Plan change: 2.4a is routes plus tests on the memory store. The live check moves to 2.4b, because `db.ts`, `prisma-store.ts`, `setup-owner.ts` and `prisma.config.ts` had not been shown.
2. NEXT_FILES miss: the list from 2.3e did not carry `auth.ts`, `store.ts`, `package.json`, `tsconfig.json` or `eslint.config.js`, so you had to paste them. `.env.example` was skipped by the resume script as "looks private" although it held a name only. NEXT_FILES for 2.4b lists what it needs.
3. `TRACEABILITY.md` R-18 was garbled and lacked the 2.3e tests. Fixed. R-25 is still skipped; I do not know what it was.
4. The files listed as "not seen" in STATUS (`sessions.ts`, `tokens.ts`, `email.ts`, `password.ts`, `app.ts`, `DEV_SETUP.md`) have now been seen.
5. `TOKEN_SECRET` is set in your `server/.env` (length 64, reported by you).

## Step 2.3e (size M), 2026-10-15: sign-in lockout

**Works (verified on your machine, output pasted: `migrate deploy` applied the migration, `migrate dev` "Already in sync", `npm run check` clean, 13 files, 364 tests; I ran nothing in my sandbox):** columns `User.failedLoginCount` and `User.lockedUntil`, migration `20261015130000_sign_in_lockout` (hand-written, like A-36). `getLockout`, `recordFailedLogin`, `clearLockout` on `UserStore` and in both adapters. `authenticate` takes an optional `now`, locks after 5 failures for 900 seconds, writes `account.locked`, refuses a locked user with reason `locked`, resets the count on success. Expected `npm run check`: 13 test files, 364 tests.
**Stubbed:** no route. Nothing calls `authenticate` yet. No manual unlock. No per-IP limit.
**Tests:** 31 new by my count: 10 contract cases per adapter (20, in `test/helpers/lockout-contract.ts`, called from `store-contract.ts`) and 11 in `test/lockout.test.ts`.
**Not verified:** no break-on-purpose run (owed; security code). The lockout race behaviour on a server database (A-44). Real timing of a locked sign-in (the test only counts that a hash is checked).
**Found along the way:**
1. `TRACEABILITY.md` was not seen in this chat, so it was not updated. It is in `NEXT_FILES.txt`.
2. `DATA_MODEL.md` says lockout fields arrive in Phase 2. It now lists them.
3. The existing auth tests and `test/sessions.test.ts` passed unchanged (verified on your machine).
4. The hand-written migration matches the schema: `migrate dev` reported "Already in sync" (same result as A-36).

## Step 2.3d-docs (size S), 2026-10-15: docs formatting fix

**Works (not verified: docs only, nothing run):** `docs/DECISIONS.md` and `docs/ASSUMPTIONS.md` replaced as whole files. Fixed missing spaces and backticks in D-20, D-21, D-23/D-24 (blank line between them), A-02, A-03, A-19, A-20 and A-36. Meaning unchanged. TRACEABILITY R-18 and STATUS updated.
**Tests:** none. Last `npm run check` on the owner's machine: 12 files, 333 tests (2.3d).
**Found along the way:**
1. 2.3d is verified on the owner's machine: 12 files, 333 tests, commit b8336e4. This closes the "not verified anywhere" notes in the 2.3d entry.
2. A-36 had the same garbling as the listed items. Fixed too.
3. `NEXT_FILES.txt` for 2.3e now lists `owner.ts`, `owner.test.ts` and `db.test.ts` as a precaution. I have not seen them.
4. D-27 still says storage and rotation come in step 2.3c. D-29 already notes the correction. I left D-27 as it was.

## Step 2.3d (size M), 2026-10-15: session logic

**Works (not verified anywhere yet; I ran nothing in this chat):** `server/src/sessions.ts`: `issueSession`, `refreshSession`, `signOut`, `SessionError`, `REFRESH_TOKEN_SECONDS` (7 days). Reuse of a used token revokes its family and writes `session.reuse_detected`. Sign-out revokes the family and writes `session.logout`. Inactive or missing user: all tokens revoked. Lost race: fails, no revoke (A-40). Expected `npm run check`: 12 test files, 333 tests.
**Stubbed:** no route, no lockout. Nothing calls `sessions.ts` yet.
**Tests:** 38 new in `test/sessions.test.ts` (issue 11, refresh 16, sign-out 8, audit rules 3), by my count.
**Not verified:** everything. No break-on-purpose run (owed; security code). The race test relies on lockstep async steps on the memory store.
**Found along the way:**
1. 2.3c is verified on the owner's machine: 11 files, 295 tests, `migrate deploy` applied, `migrate dev` "Already in sync" (A-36 settled). Commit 6d49656, pushed.
2. D-27 still says rotation comes in 2.3c. The real split is storage 2.3c, rotation 2.3d (D-28). D-29 notes this.
3. The stale comment in `tokens.ts` is fixed in this step.
4. My first design revoked the family on a lost race. I dropped it: the winner's new token could be created after the revoke and survive.

## Step 2.3c (size M), 2026-10-15: refresh-token storage
**Works (verified in my sandbox, Node v22.22.0, isolated project with the exact pins and real tsconfig and ESLint config: typecheck clean, lint clean, 128 tests = 74 tokens + 27 contract per adapter; the Prisma contract ran on migration SQL applied by hand with better-sqlite3, not through `prisma migrate deploy`):** table `RefreshToken`, migration `20261015090000_refresh_tokens` (hand-written, A-36), `RefreshTokenStore` (create, findByHash, consume, revokeFamily, revokeAllForUser) on the interface and in both adapters, 15 new contract cases per adapter. Expected `npm run check`: 11 test files, 295 tests.
**Stubbed:** no rotation logic, no route, no lockout. Nothing calls `refreshTokens` yet.
**Tests:** 30 new (15 per adapter, in the shared contract). Total 295 expected.
**Break on purpose (sandbox):** `tokens.ts` (owed from 2.3b): 29 bugs, 26 caught, 3 equivalent (non-constant-time compare, redundant `exp <= iat`, redundant stored-hash shape check; A-37). Storage: 33 bugs across both adapters. 2 escaped at first (copy protection in the memory adapter). I strengthened the copy test and both are now caught. One more related bug still escapes (`usedAt` not copied on a used record in the memory adapter; low risk, test code only). Code restored, 128 pass.
**Not verified:** the live migration check, the real Prisma migration engine, and the 31 auth tests against the real `email.ts` and `password.ts` (my sandbox used stand-ins for those two files). `npm run check` on the owner's machine: the first run showed 4 type errors in `test/auth.test.ts` (hand-built stores without `refreshTokens`) and a stale generated Prisma client (fixed by `npm run db:generate`).
**Found along the way:**
1. Plan change: 2.3c is storage only. Rotation logic (reuse detection) is 2.3d. Lockout is 2.3e.
2. My first copy-protection test was too weak: it changed only the record returned by `create`. Two bugs escaped. Fixed (see above).
3. A comment in `tokens.ts` still says "Rotation and storage come in step 2.3c". It is stale. Fix it when that file is next changed.
4. 2.3b is now verified on the owner's machine (11 files, 265 tests, commit c994af4).
5. My miss: the `NEXT_FILES.txt` from 2.3b did not list `test/auth.test.ts`, so I had not seen it. It builds four `Store` objects by hand. Fixed: `refreshTokens` added to each. The new `NEXT_FILES.txt` lists it, plus `email.ts` and `password.ts`, which my sandbox needs to run the auth tests.
6. The generated Prisma client is git-ignored. After a schema change, run `npm run db:generate` (or `npm run check`, which does it first) before an editor or `npm run typecheck` will see the new model.

## Step 2.3b (size S), 2026-10-15: access tokens and refresh-token primitives
**Works (not verified anywhere yet; I ran nothing in this chat):** `server/src/tokens.ts`: `createAccessToken`, `verifyAccessToken`, `readTokenSecret`, `assertSecretAllowed`, `createRefreshToken`, `hashRefreshToken`, `refreshTokenMatches`, `isRefreshTokenShape`, `TokenConfigError`. No new dependency. Expected `npm run check`: 11 test files, 265 tests.
**Stubbed:** no route, no stored refresh tokens, no rotation, no lockout. `TOKEN_SECRET` is not in `server/.env.example` yet (nothing reads it).
**Tests:** 74 new in `test/tokens.test.ts` (secret 13, access tokens 50, refresh tokens 11), by my count.
**Not verified:** everything. No break-on-purpose run (owed; security code). Lint (I have not seen `eslint.config.js`).
**Found along the way:**
1. Plan change: rotating refresh tokens need stored state, so 2.3b is the pure part only. 2.3c is refresh-token storage and rotation. 2.3d is lockout.
2. I did not edit `server/.env.example` (I have not seen it).

## Step 2.3a (size M), 2026-10-15: sign-in logic
**Works (verified on your machine: `npm run check` 10 files, 191 tests, reported 2026-10-15; also in my sandbox, Node v22.22.0, npm 10.9.4):** `server/src/auth.ts`: `authenticate(store, email, password)` returns `{ ok: true, user }` (no hash) or `{ ok: false }`. Every failure looks the same to the caller (unknown email, wrong password, bad input, inactive user). Reason codes (`invalid_input`, `unknown_email`, `bad_password`, `inactive`) go only to the audit `detail`. Writes `login.success` and `login.failure`. An unknown email still checks a dummy argon2 hash (timing). If the audit write fails, the error is thrown (no sign-in without its audit entry). Typecheck clean, lint clean, 41 tests pass in an isolated project (typescript 6.0.3, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, argon2 0.45.1, my own approximation of `tsconfig.json`). A live `tsx` run on an in-memory store printed the expected lines. `npm run check` on your machine: 10 test files, 191 tests (matches the expected count).
**Stubbed:** no token, no route, no lockout. No route uses `authenticate`.
**Tests:** 31 new in `test/auth.test.ts` (success 4, failure 9, bad input 14 cases, audit rules 4). Expected total 191.
**Break on purpose (sandbox):** 25 deliberate bugs, each caught. `auth.ts` (16): dummy hash skipped (1 test failed), inactive check removed (2), inactive checked before password (1), wrong password allowed (7), email not normalised (9), hash returned (1), success audit removed (3), success audit error swallowed (1), failure audit error swallowed (1), extra text in audit detail (18), unknown email gives a different result (2), non-text password unchecked (6), bad email throws (9), wrong action name (4), actor dropped for known user (2), password trimmed (1). `createOwner` (9, owed from 2.1b): guard removed (2), role wrong (3), audit entry removed (1), audit actor missing (1), password stored in clear (1), email not normalised (2), password policy skipped (1), blank name kept (1), name not trimmed (2). Code restored, 0 failed. This covers `owner.ts` with the memory store only. It does not cover `setup-owner.ts`.
**Not verified:** the live `tsx` check from the 2.3a message (output not reported). Whether commit 0c1fa80 is pushed. The step 1.4 break-on-purpose run (needs the real Prisma engine; still owed). Real timing of the unknown-email path (the test only counts that a hash is checked).
**Found along the way:**
1. My mistake: my first mutation run printed "1 failed" for every bug because my script read the "Test Files" line, not the "Tests" line. The caught or escaped verdicts were right, the counts were not. I fixed the script and reran. The counts above are from the rerun.
2. One mutation was labelled "typed email put in audit detail" but it appended the actor id, not the typed email. It is listed above as "extra text in audit detail".
3. `AuditStore` can only list entries by actor, so entries with no actor (`unknown_email`, `invalid_input`) cannot be read back. Tests use a wrapper that records each `append` call (A-28).
4. The Store has no way to deactivate a user. The inactive tests use a wrapper store that reports `isActive: false` (A-30).
5. `server/tsconfig.json` was not in the pack, so I could not use the real one. It is now in NEXT_FILES. The `NEXT_FILES.txt` from step 2.2a did not list it (miss).
6. STATUS said "not yet verified" for 2.2a. It is now verified on your machine (9 files, 160 tests, d10b19e).
7. Resume chat, 2026-10-15: you reported 2.3a verified (10 files, 191 tests). The real `server/tsconfig.json` has now been seen. Its `include` lists `test` twice (harmless).
8. `docs/DECISIONS.md` (D-20, D-21, D-23/D-24 spacing) and `docs/ASSUMPTIONS.md` (A-02, A-03, A-19, A-20) have garbled formatting in the repo itself, not only in the mirror. A whole-file fix is pending ("fix decisions"). TRACEABILITY skips R-25.

## Step 2.2a (size M), 2026-10-14: permission table
**Works (verified on your machine: 9 files, 160 tests, commit d10b19e, pushed; also in my sandbox, Node v22.22.0, npm 10.9.4):** `server/src/permissions.ts`: `PERMISSION_TABLE` (22 permissions), `isPermission`, `hasPermission`, `canGrant`, `normalizeStaffGrants`, `PermissionGrantError`. Typecheck clean and 38 tests pass in an isolated project (typescript 6.0.3, vitest 5.0.4, @types/node 22.20.5, the real tsconfig options, a stub `store.ts` with only `Role`). `npm run check` on your machine: 9 test files, 160 tests (matches the expected count).
**Stubbed:** no route or guard uses the table. No staff accounts. No stored staff permission lists.
**Tests:** 38 new in `test/permissions.test.ts` (table 4, matrix 6, hasPermission edge cases 4, canGrant 5, normalizeStaffGrants 19). Expected total 160.
**Break on purpose (sandbox):** 18 deliberate bugs, each caught: inactive check removed (4 failed), staffGrantable ignored (3), Staff always allowed (4), unknown permission not checked (1, also a type error), unknown role not refused (1), users.manage made grantable (6), payoff.process removed (8), key typo (6), isPermission accepts any string (3), canGrant without users.manage check (2), canGrant without staffGrantable check (2), upfront actor check removed (1), canGrant check removed in normalize (1), isArray check removed (4), table order lost (3), no dedupe (1), unknown entries skipped (6), error message echoes input (1). Code restored, 38 pass.
**Not verified:** the owed break-on-purpose run for step 1.4 (the one for 2.1b was done at 2.3a). Lint and typecheck passed on your machine in `npm run check`.
**Found along the way:**
1. My mistake: STATUS and BUILD_LOG said 120 tests for step 2.1b. Your pasted output shows 122 (110 + 12). Corrected below.
2. Step 2.1b is now verified on your machine: 8 files, 122 tests; the setup script created the owner, and a second run refused with "A Super Admin already exists. Nothing was changed."
3. I first gave permissions a `restricted` flag for `loans.disburse` and `payoff.process`. No test can reach that branch, because only the Super Admin holds `users.manage`. I removed it. DR-14 holds by construction and tests pin it (A-26).
4. No live check applies: no route uses the table yet.
5. `mirror/DECISIONS.md` is still stale, and the D-20 and D-21 formatting is still garbled in the copy I was shown. It may be a paste artifact. Fixing it needs a whole-file replacement. Say "fix decisions" and I do it as a small step.

## Step 2.1b (size M), 2026-10-14: owner setup script
**Works (verified on your machine, output pasted: 8 files, 122 tests; owner script created the owner once and refused the second run; I ran nothing in my sandbox):** `hasSuperAdmin` on the Store interface, `memory-store.ts` and `prisma-store.ts`. `src/owner.ts` (`createOwner`, `OwnerAlreadyExistsError`). `src/setup-owner.ts` and `npm run setup:owner`. Expected `npm run check`: 8 test files, 122 tests.
**Stubbed:** no route uses `createOwner`. No sign-in yet.
**Tests:** 12 new: 2 contract cases (1 per adapter, on a fresh empty store) and 10 in `test/owner.test.ts`. Total 122.
**Not verified:** everything above until the owner pastes the check output and the live-check output. The no-echo password prompt. A break-on-purpose run (not done; this is security code, so it is owed).
**Found along the way:**
1. The Prisma contract shares one database, so "no Super Admin yet" could not be tested there. `runStoreContract` now takes a third argument that gives a fresh empty store. The Prisma file builds one extra temporary database for it.
2. `hasSuperAdmin` counts inactive Super Admins too (A-24).
3. User creation and the audit write are two separate Store calls, not one transaction (A-25).
4. TRACEABILITY.md and DEV_SETUP.md were seen and updated as whole files. DEV_SETUP now has the database commands.
5. The prototype's permission list lives in `legacy-prototype/src/App.jsx`. I have not read it yet. It is in NEXT_FILES for step 2.2a.

## Step 2.1a (size S), 2026-10-14: password hashing and email normalising
**Works (verified on your machine, output pasted; also in my sandbox, Node v22.22.0, npm 10.9.4):** `server/src/password.ts` (`hashPassword`, `verifyPassword`, `assertPasswordAllowed`, `PasswordPolicyError`) and `server/src/email.ts` (`normalizeEmail`, `InvalidEmailError`). argon2 0.45.1, argon2id, library defaults read from a real hash: `m=65536,p=4,t=3`. One hash took 134 ms. Typecheck clean, 31 tests pass, live `tsx` run printed the expected lines. This was an isolated project with the exact pins and the real `tsconfig.json`, not the real `server/`.
**Stubbed:** nothing uses the modules yet. No route, no setup script.
**Tests:** 31 new (password 14, email 17). Expected total 110.
**Break on purpose (sandbox):** 12 deliberate bugs. 11 were caught at once. One escaped: removing the max-length guard in `verifyPassword` changed nothing, because a wrong long password fails anyway. I changed the test to use a hash made with raw argon2 from an over-length password, and the bug is then caught (1 failed). Code restored, 31 pass.
**Not verified:** hash time on your machine (the password tests took 1.8 s for 14 tests there, well inside the 30 s limit). The audit details (4 high findings, believed to be A-20).
**Found along the way:**
1. My miss: the `NEXT_FILES.txt` I wrote at step 1.5 did not list the adapters, contract tests or config files, so this chat could not build the owner setup script. I split the step (2.1a, 2.1b). The new `NEXT_FILES.txt` lists them.
2. The setup script needs a "does a Super Admin exist" guard. The Store has none. 2.1b adds `hasSuperAdmin` to the interface, both adapters and the contract.
3. The argon2 PHC string from this library writes its parameters in the order `m,p,t`. I used the real output in the live check.
4. TRACEABILITY.md and DECISIONS.md (repo copy) were not in the pack, so I could not edit them as whole files. D-22 and D-23 are given as text to add at the end of DECISIONS.md. TRACEABILITY is updated at 2.1b.
5. The `mirror/DECISIONS.md` copy in Project knowledge is stale (no D-22 or D-23, and D-20 is garbled).

## Step 1.5 (size S), 2026-10-14: in-memory adapter and store interface
**Works (verified on your machine, output pasted):** `npm run check` passes: generate, typecheck, lint, 5 test files, 79 tests (money 47, health 3, memory-store 11, prisma-store 11, db 7). The Prisma adapter passes the 11 shared tests on a real SQLite file built by the real migration. Committed `6ddf251` and pushed (output pasted).
**Also verified in my sandbox (Node v22.22.0):** the same 11 tests on both adapters (Prisma on hand-made tables). 10 deliberate bugs, each caught: duplicate check removed (1 test failed), unknown actor allowed (1), no copy returned (1), list ignores actor (1, memory), default role wrong (2), email compared ignoring case (1), duplicate error not mapped (1), unknown-actor error not mapped (1), list ignores actor (1, Prisma), role never saved (1). Code restored, 22 pass.
**Stubbed:** nothing writes to the store from a route.
**Tests:** 22 new (11 per adapter). Total 79.
**Not verified:** a break-on-purpose run on your machine (not needed for the step).
**Found along the way:**
1. Email case sensitivity is undecided (A-21).
2. `listByActor` order is not guaranteed.
3. `prisma generate` runs in my sandbox when `PRISMA_SCHEMA_ENGINE_BINARY` points at a stand-in file. Only `migrate` needs the real engine.
4. `test/db.test.ts` and `test/helpers/temp-db.ts` repeat setup code (left as is).
5. My mistake: I did not update `docs/NEXT_FILES.txt` in steps 1.4 and 1.5, so a new chat received no code files. Fixed: every step ends with the new `NEXT_FILES.txt` contents.
6. My mistake: STATUS was given as partial edits in step 1.5. It is now given whole.

## Step 1.4 (size M), 2026-10-14: database schema, first migration
**Works (verified on your machine, output pasted):** `npm install` (166 added, 394 audited), `prisma migrate dev --name init` created and applied `20261014160109_init`, `npm run check` passes: generate, typecheck, lint, 3 test files, 57 tests (50 old + 7 new). `.tables` lists AuditLog, User, _prisma_migrations. Also verified in my sandbox (Node v22.22.0, npm 10.9.4 and 11.21.0): exact-pinned install of prisma, @prisma/client, @prisma/adapter-better-sqlite3 and dotenv, and the SQLite driver storing 99999999999999 and 9223372036854775807 exactly.
**Stubbed:** nothing writes to `AuditLog`. No route uses the database.
**Tests:** 7 new in `server/test/db.test.ts` (default role and status, duplicate email, audit actor read back, audit with no actor, unknown actor rejected, user with audit rows cannot be deleted, INTEGER holds the A-17 cap and 2^63−1).
**Not verified:** no break-on-purpose run (Prisma cannot run in my sandbox: engine download blocked, 403). The BigInt check used a raw INTEGER column, not a Prisma BigInt model field.
**Found along the way:**
1. The first run failed because `prisma.config.ts` was in the wrong folder. Prisma then reported "datasource.url property is required". Signal: the line `Loaded Prisma config from prisma.config.ts.` was missing. After the owner moved the file into `server/`, everything passed.
2. `npm audit` shows 4 high findings, all through the Prisma CLI's own dependencies (A-20).
3. npm 11.21.0 prints an `install-scripts` warning for 5 packages. It had no effect on build or tests.
4. The Prisma SQLite docs page does not say an adapter is required. We use one (D-20).
5. TRACEABILITY.md was seen and updated for the first time. DEV_SETUP.md has not been seen, so it is not updated for the new commands.

## Step 1.3 (size S), 2026-10-14: money module
**Works (verified in my sandbox; your check pending):** `server/src/money.ts` with `parseNaira`, `formatNaira`, `sumKobo`, `MoneyError` and the `Kobo` type (D-15, DR-01, DR-02 sum). `npm run check` passes: typecheck, lint, 2 test files, 50 tests. A live run printed `₦20,000.50`, `₦20,000.00` and the rejection message for `"1.234"`. Sandbox: Node v22.22.0, npm 10.9.4.
**Stubbed:** nothing in the module. No route, database column or screen uses it yet.
**Tests:** 47 new in `server/test/money.test.ts` (valid input 10, invalid text 17, non-string input 6, format 9, round trip 1, sum 4). Total 50.
**Break on purpose (sandbox):** 10 deliberate bugs, each caught by failing tests: 3 decimals allowed (2 failed), padding on the wrong side (2), cap removed (1), format loses kobo padding (6), sum skips first value (2), minus sign accepted (1), format loses minus sign (1), numbers converted to text (3), wrong divisor in format (8), spaces trimmed (2). Code restored, 50 pass.
**Not verified:** anything on the owner's machine (Node v22.14.0, npm 11.21.0). Whether the database column accepts the largest allowed amount (A-03, step 1.4).
**Found along the way:**
1. The ZIP used JavaScript numbers with a 0.01 tolerance (step 0.1 item 8). The new tests pin exact sums with no tolerance, and `0.1 + 0.2` equals `0.3`.
2. `JSON.stringify` throws "Do not know how to serialize a BigInt" (checked in my sandbox, Node v22.22.0). So amounts must cross the API as strings (A-18). Phase 4 must follow this.
3. My first live-check command failed: `tsx -e` runs the code as CommonJS, so `import` did not work. The command given to the owner uses `import()` and printed the expected lines in my sandbox.
4. Claude has not seen TRACEABILITY.md, so it was not updated for steps 1.2 and 1.3. The owner is asked to paste it.

## Step 1.2 (size M), 2026-10-13: server skeleton
**Works (verified on your machine, outputs pasted):** `server/` with Express 5.3.0, strict TypeScript 6.0.3, ESLint, Vitest and Supertest. The test run passed (3 of 3). `GET /health` answered 200 with `{"status":"ok"}` and no `X-Powered-By` header. `npm install` added 227 packages with 0 vulnerabilities. Committed and pushed as `272e2b4` (reported by owner). Also verified in my sandbox: typecheck, lint, tests and a live run (Node v22.22.0, npm 10.9.4).
**Stubbed:** no database, auth or other routes. `web/` is still empty.
**Tests:** 3 (health route: 200 and body, no `x-powered-by` header, 404 on unknown route). No break-on-purpose run, because the step has no security, money or data code.
**Not verified:** the typecheck and lint stages on the owner's machine (the paste showed only the test summary). Step 1.3 asks for the full output. Prisma, zod, argon2, exceljs and the web packages were not installed.
**Found along the way:**
1. D-13 candidate typescript 7.0.2 conflicts with typescript-eslint 8.71.2, whose registry peer range is `typescript >=4.8.4 <6.1.0`. Pinned 6.0.3 instead (D-19, A-16). I did not test TypeScript 7 itself.
2. The owner's step 1.1 output showed the demo password in 3 files (`preview.html` 2 lines, `README.md` 1 line, `src/App.jsx` 3 lines, 6 lines in all) and none after redaction.
3. TRACEABILITY.md was not in the resume pack and was not changed.
4. `npm install` took 38 minutes on the owner's machine (`audited 228 packages in 38m`, pasted). Cause unknown, probably the network.
5. My expected `git status` output showed `?? server/` as one line. Git listed the new files one by one because `server/.gitkeep` was already tracked. Harmless.

## Step 1.1 (size S), 2026-10-13: repo skeleton
**Works (verified on your machine, outputs pasted):** `.gitignore`, `web/` and `server/` folders, and `legacy-prototype/` copied from the ZIP folder. The demo password `IYANU@2026` is replaced by `REDACTED` in the copy (3 files, 6 lines; second grep found no match). No `node_modules` was copied. `.DS_Store` is ignored. The owner confirmed the password was never used for a real account (reported by owner).
**Stubbed:** `web/` and `server/` held only `.gitkeep`.
**Tests:** 0 (none apply).
**Not verified:** the prototype was never installed, built or run. Its demo login no longer works. That is fine, because it is reference only.
**Found along the way:**
1. The 0.2 entry was missing from this log. It is added below, rebuilt from STATUS and the git log.
2. STATUS wording about `NEXT_FILES.txt` was unclear. Fixed: files appear under `===== FILE: path =====` headings, and no heading means no files (owner's wording).
3. The snapshot of 2026-10-13 showed no `mm.md` and no modified files, so 0.1c item 4 looks resolved. Owner to confirm.

## Step 0.2 (size S), 2026-10-13: one-command resume routine
**Works:** `scripts/resume-pack.sh` is tracked in git, and the pack attached to the chat after it had STATUS, the log, open questions, assumptions and the snapshot (reported by owner).
**Not verified:** I have not seen the script itself. This entry was rebuilt in step 1.1 from STATUS and the commit messages (`af1a23d`, `0ef4601`).
**Tests:** 0 (none apply).

## Step 0.1c (size S), 2026-10-13: switch test fixes
**Works:** A fresh chat read the resume pack and replied in the required format. It did not invent facts about files it had not seen (reported by owner, verified on your machine).
**Fixed:** STATUS is replaced whole. It now has the correct "Last updated" line, the machine versions and the next steps with sizes. BUILD_LOG is replaced whole, because the entries were out of order in the repo.
**Tests:** 0 (none apply).
**Found along the way:**
1. My mistake: I gave three separate edits for STATUS. One did not apply (git showed 4 deletions, expected 5). The guide says to give such a file whole.
2. `.DS_Store` is untracked. Step 1.1 adds `.gitignore`.
3. The fresh chat could not size step 1.1 because STATUS did not list it. STATUS now lists the next steps.
4. A second fresh chat found BUILD_LOG entries out of order and STATUS showing as modified after commit. It also found an untracked `mm.md` that no doc mentions. Causes are not yet known. Open until the owner answers.

## Step 0.1b (size S), 2026-10-13: machine check
**Works:** `ls docs` on the owner's machine shows all 11 documents (verified on your machine). Node v22.14.0 and npm 11.21.0 reported by owner (verified on your machine).
**Verified in my sandbox:** registry `engines` fields of the D-13 candidates accept Node v22.14.0. Lookup only, no install.
**Not verified:** installs and builds. Whether `argon2` installs on the owner's macOS (A-10).
**Tests:** 0 (none apply).

## Step 0.1 (size M), 2026-10-13: Phase 0 documents
**Works:** 11 documents written. No code.
**Stubbed:** nothing.
**Tests:** 0 (none apply).
**Not verified:** the ZIP app was never installed, built or run by us. Package versions in D-13 are lookups only.

### Found along the way (from reading the ZIP)
1. The ZIP is React/Vite with localStorage. The PDF assumes Next.js, Prisma and an existing SMS integration. Neither the stack nor the SMS code exists.
2. Seed data: member `m2` has a ₦4,000 "Loan Repaid" payment but no loan exists for `m2`.
3. Auto-Inactive runs in a UI effect, not in an atomic transaction. Balances are clamped at zero, which can hide negative values.
4. The pay-off button is hidden (not disabled with a reason) when the member has an active loan or zero balance.
5. "Today" is taken from the UTC date, not Lagos time.
6. Payment and loan dropdowns list only members the user created (the visibility filter applies to members).
7. Passwords are plaintext in localStorage. The default login is printed on the login screen and in the README.
8. Money uses JavaScript numbers with a 0.01 tolerance.
9. All dependencies in the ZIP use `latest`. No tests, no lint, no check script.
10. `PRODUCTION_SCHEMA_AND_API.md` uses `Decimal` money and has no users, actors or audit.
11. npm: Prisma CLI `latest` is a release candidate (8.0.0-rc.22); the client `latest` is 7.10.0. We chose the 7.10.0 pair.
12. The first `npm view typescript version` call returned only a notice. A second call gave 7.0.2.