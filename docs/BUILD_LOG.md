# Build log (newest first)

## Step U.3g (size S), 2026-10-23: break-on-purpose for the U.3d to U.3f web code (A-202)

**Works (verified in this session):** `node ~/Desktop/mutate-U.3g.mjs` (not in git): baseline 73 passed; 70 mutations (42 in `web/src/api.ts`, 28 in `web/src/Members.tsx`), 58 caught, 12 escaped, 0 errors, 0 not applied; files restored: yes; `git status --short` empty. `npm run check` (web): 4 files, 87 passed. `npm run check` (server): 46 files, 1794 passed. No source change kept.
**Escaped:** test gaps A3, A4, A7, A14, A19, A26, A27, A31, V13, V23, V24; V9 equivalent only because this machine runs in Lagos time (A-202).
**Not verified:** the V9 result on a machine in another time zone; the screen in a real browser. Gaps go to U.3h.

---

## Step U.3f (size M), 2026-10-23: member detail (A-201)

**Works (verified in this session):** `web/src/api.ts`: `listPayments(memberId)` (`GET /payments?memberId=`) and `listLoans(memberId)` (`GET /loans?memberId=`), id put in the query with `encodeURIComponent`, every field checked, amounts must be two-decimal naira strings, one bad item refuses the whole list. `web/src/Members.tsx`: a View button per row opens member detail: profile, balances (refundable total, "Retained by cooperative", each category), loans (with `loans.view`), payments newest first (with `payments.view`), "On loan" badge, Back keeps the filter and search; `formatNaira` (adds ₦ and commas to the string) and `formatDate` (day in Lagos). `App.tsx` passes the two view permissions; `styles.css` has the detail styles. Docs fixes: TRACEABILITY R-01 ("No screen yet" removed) and STATUS Next step brief (one review order). `npm run check` (web): 4 files, 87 passed. `npm run check` (server): 46 files, 1794 passed.
**Tests:** web 74 to 87 (4 in `api.test.ts`, 9 in `app.test.tsx`); server 1794 unchanged.
**Not verified:** the screen in a real browser against the running server; no live check; dev database not touched. Break-on-purpose owed at U.3g.

---

## Step U.3e (size M), 2026-10-23: members list and add member (A-200)

**Works (verified in this session):** new `web/src/Members.tsx`: members list with Active (default), Inactive and All filters, search by name or Membership ID in the browser (A-191 item 2), and the add member form (full name 1 to 100 characters; phone, address, occupation up to 200; trimmed before sending; notice with the new Membership ID; list reloads). `App.tsx`: header nav with Home and Members (Members only with `members.view`; add button only with `members.create`). `styles.css`: nav, title, toolbar, filters, panel, table and status pills from the prototype. 12 tests in `web/test/app.test.tsx` (search, field checks, messages, filters, add, refusal, cancel, permissions). `npm run check` (web): 4 files, 74 passed. `npm run check` (server): 46 files, 1794 passed.
**Tests:** web 62 to 74; server 1794 unchanged.
**Not verified:** the screen in a real browser against the running server (walked through at U.9, or by the owner); no live check; dev database not touched. Break-on-purpose owed at U.3g.

---

## Step U.3d (size S), 2026-10-23: member calls in the web API client (A-199)

**Works (verified in this session):** `web/src/api.ts` has `listMembers`, `getMember`, `createMember` and `memberBalances`, each answering `{ ok, value }` or `{ ok: false, reason }` (`forbidden`, `invalid_input`, `not_found`, `signed_out`, `network`, `server`). Replies are checked field by field; balance amounts must be two-decimal naira strings and stay strings (A-18). 7 tests in `web/test/api.test.ts` (paths and token, `encodeURIComponent` on the id, POST expects 201, status mapping, signed out, wrong reply shapes, bad amounts); fake `Api` in `web/test/app.test.tsx` extended. `npm run check` (web): 4 files, 62 passed. `npm run check` (server): 46 files, 1794 passed. U.3 split into U.3d to U.3g in PHASE_PLAN.
**Tests:** web 55 to 62; server 1794 unchanged.
**Not verified:** the calls against the real server (no screen yet; walked through at U.9); no live check; dev database not touched. Break-on-purpose owed at U.3g.

---

## Step U.3c (size S), 2026-10-23: tests for the U.3b test gaps G2, R2, G12 (A-198)

**Works (verified in this session):** 2 tests in `server/test/members-routes.test.ts`: a Staff user with `members.view` but not `members.create` gets 200 from `GET /members/:id/balances` (G2, R2); the balances reads go through one counted `store.transaction` call, and reads outside a transaction throw (G12). `npm run check` (server): 46 files, 1794 passed. Tests committed as `bea1df7` (owner said yes) so the script could run. Full rerun of `~/Desktop/mutate-U.3b.mjs` (output in `~/Desktop/mutate-U.3c.out`): baseline 111; 32 mutations, 27 caught, 5 escaped (G1, G3, G9, R1, R9, equivalent), 0 errors, 0 timeouts, 0 not applied; G2, R2, G12 caught (1 failed each); "files restored: yes"; `git status --short` empty.
**Tests:** server 1792 to 1794; web 55 unchanged (not rerun, no web change).
**Not verified:** why each caught run reports `broken: 2` (my reading in A-198, vitest docs not checked); no live check; dev database not touched. No source change.

---

## Step U.3b (size S), 2026-10-23: break-on-purpose for U.3a (A-198)

**Works (verified in this session):** `~/Desktop/mutate-U.3b.mjs` (not in git): baseline 109 (`test/members-routes.test.ts`, `test/members.test.ts`); 32 mutations, 24 caught, 8 escaped (G1, G2, G3, G9, G12, R1, R2, R9), 0 errors, 0 timeouts, 0 not applied; "files restored: yes"; `git status --short` empty. `npm run check` (server): 46 files, 1792 passed.
**Escapes:** test gaps G2, R2 (`members.create` checked instead of `members.view`), G12 (reads outside one transaction); equivalent G1, R1, G3, G9, R9 (A-198). Fix proposed as U.3c (S).
**Docs fixes:** STATUS item 12 now D-55 to D-86; A-197 item 4 now cites the Prisma 7 and SQLite isolation docs.
**Tests:** server 1792 unchanged; web 55 unchanged (not rerun).
**Not verified:** the dev database's journal mode (WAL or not); no live check; dev database not touched.

---

## Step U.3a (size S), 2026-10-23: `GET /members/:id/balances` (D-86, A-197)

**Works (verified in this session):** `getMemberBalances` in `server/src/members.ts` and the route in `server/src/members-routes.ts`. `members.view`, DR-13 scope as `GET /members/:id`, reads in one transaction, amounts as strings, refundable and non-refundable totals, 500 on broken data, no audit. `npm run check` (server): 46 files, 1792 passed.
**Failed first:** typecheck, in the new test only: `store.audit.list({})` needs `limit` and `offset`. Fixed in the test.
**Tests:** server 1781 to 1792 (11 route tests); web 55 unchanged (not rerun, no web change).
**Not verified:** no break-on-purpose yet (owed at U.3b); no live check; dev database not touched; the read transaction only tested on the memory store through the route.

---

## Step U.2d (size S), 2026-10-22: jsdom and click tests for the sign-in screens (D-85, A-196)

**Works (verified in this session):** jsdom 29.1.1 installed exact in `web/` (owner said yes): 37 packages added, `npm audit` 0 vulnerabilities. `web/test/app.test.tsx` runs in jsdom and has 10 new click tests through `App` with a fake `Api` (sign-in refused and good, restore, sign-out, the api's sign-out notice, change password stopped in the browser, changed, wrong current password, Cancel). `npm run check` (web): 4 files, 55 passed. `npm run check` (server): 46 files, 1781 passed.
**Failed first:** 4 of the new tests, all test mistakes: jsdom strips spaces from an `type="email"` value, so the trim check was wrong (the test cannot pin `.trim()`); the header and the form both have a "Change password" button and the helper clicked the header one. Fixed in the test only.
**Tests:** web 45 to 55; server 1781 unchanged.
**Not verified:** the app in a real browser; no break-on-purpose run (tests only, no source change). No live check, dev database not touched.

---

## Step U.2e (size S), 2026-10-22: tests for the U.2c test gaps A7, A8, A11, A26 (A-195)

**Works (verified in this session):** `web/test/api.test.ts`: 3 new tests (failed lock during a signed-in call keeps the session; network failure on refresh during a signed-in call keeps the session; two refreshes in a row on one client both reach the server) and 2 `restore` tests extended (one `/api/refresh` sent, no `onSignedOut`). `npm run check` (web): 4 files, 45 passed. `npm run check` (server): 46 files, 1781 passed. Tests committed as `56978a0`, then `~/Desktop/mutate-U.2c.mjs` rerun in full: baseline 38; 45 mutations, 42 caught, 3 escaped (A14, A16, A25), 0 errors, 0 timeouts, 0 not applied; A7, A8, A11, A26 caught; "files restored: yes"; `git status --short` empty.
**Escapes:** A14, A16, A25, equivalent (A-195). No test gap left in `session.ts` and `api.ts`.
**Tests:** web 42 to 45; server 1781 unchanged.
**Not verified:** the app in a browser, two real tabs, the Web Lock in a real browser. No source change, no dependency, no live check, dev database not touched.

---

## Step U.2c (size S), 2026-10-22: break-on-purpose for session.ts and api.ts (A-195)

**Works (verified in this session):** `~/Desktop/mutate-U.2c.mjs` (not in git): `--dry` found all 45 find texts once. Baseline 35 passed (`session.test.ts`, `api.test.ts`, `app.test.tsx`). 45 mutations (S1 to S13 in `session.ts`, A1 to A32 in `api.ts`): 38 caught, 7 escaped (A7, A8, A11, A14, A16, A25, A26), 0 errors, 0 timeouts, 0 not applied; "files restored: yes"; `git status --short` empty. Every `session.ts` mutation and every lock-name, lock-use and two-tab mutation was caught. `npm run check` (web): 4 files, 42 passed. `npm run check` (server): 46 files, 1781 passed.
**Escapes:** test gaps A7, A8, A11, A26 (fix proposed at U.2e); A14, A16, A25 equivalent (A-195).
**Tests:** none added; web 42, server 1781 unchanged.
**Not verified:** the app in a browser, two real tabs, the Web Lock in a real browser. No source change, no dependency, no live check, dev database not touched. Docs: A-193 "done at U.2d" corrected (jsdom not installed); STATUS "No UI code yet" corrected.

---

## Step U.2b (size M), 2026-10-22: refresh token in localStorage, refresh lock, lockout hint (D-84, A-194)

**Works (verified in this session):** `session.ts` keeps the refresh token in `localStorage` (`browserLocalStorage`, owner's choice). `api.ts` runs each refresh under the Web Lock `iyanu.refresh` (`browserRefreshLock`; runs at once without Web Locks); a failed lock counts as a failed refresh. `App.tsx` uses both and shows `SIGN_IN_FAILED` with the lockout rule (D-26 kept). With the lock replaced by a direct call, 3 of the new tests failed (the two-tab test among them); `api.ts` restored from a copy, `cmp` same. `npm run check` (web): typecheck and lint clean, 4 files, 42 passed. `npm run build` (web): built in 295 ms. `npm run check` (server): 46 files, 1781 passed.
**Stubbed:** no `storage` event listener: other tabs are not signed out at once (A-194 item 3).
**Tests:** 6 added (2 `session.test.ts`, 4 `api.test.ts`); 1 changed in `app.test.tsx`; web total 42. Server 1781 unchanged.
**Not verified:** the app in a browser, two real tabs, the Web Lock in a real browser. jsdom not installed yet (U.2d). No server change, no live check, dev database not touched. No dependency installed. Break-on-purpose owed at U.2c.

---

## Step U.2 (size M), 2026-10-22: sign-in, sign-out, change own password (D-83, A-193)

**Works (verified in this session):** `web/src/session.ts` (access token in memory, refresh token in `sessionStorage`), `web/src/api.ts` (login, restore, me, logout, change password; one refresh and one retry on 401, one refresh at a time), `SignIn.tsx`, `ChangePassword.tsx`, `App.tsx`, `styles.css`. First `npm run check` (web) failed at the typecheck: TS2882, no type for the side-effect import `./styles.css`; fixed with `/// <reference types="vite/client" />` in `main.tsx` (`node_modules/vite/client.d.ts` line 43 declares `*.css`). Then one test failed: it expected `autocomplete=` but React 19.3.1's server render writes `autoComplete=`; the test was corrected. `npm run check` (web): typecheck and lint clean, 4 files, 36 passed. `npm run build` (web): built in 1.58 s. `npm run check` (server): 46 files, 1781 passed, 95.76 s.
**Stubbed:** the signed-in page shows only the name and the two buttons; screens come at U.3 to U.8.
**Tests:** 28 added in `web/test/` (5 `session.test.ts`, 17 `api.test.ts`, 6 more in `app.test.tsx`); web total 36. Server 1781 unchanged.
**Not verified:** the screens in a browser against a running API; clicks and typing (no DOM in tests). No server change, no live check, dev database not touched. No dependency installed. Break-on-purpose owed at U.2b.

---

## Step U.1 (size M), 2026-10-22: web skeleton (D-82, A-192)

**Works (verified in this session):** `web/` holds a React and Vite app in TypeScript with exact versions (react 19.3.1, vite 8.3.4, @vitejs/plugin-react 6.1.2, eslint-plugin-react-hooks 7.1.1; typescript 6.0.3, eslint 10.12.0, typescript-eslint 8.71.2, vitest 5.0.4, @types/node 22.20.5 as the server). Versions from `npm view`; Vite proxy form from https://vite.dev/config/server-options. `src/api-proxy.ts` forwards `/api` to `http://localhost:3000` (or `API_TARGET`) and removes `/api`. First `npm run check` failed at the tests: rolldown's Intel Mac binding was missing after `npm install` (npm/cli#4828); owner said yes to deleting `web/node_modules` and `npm ci`, which installed it. Vite then warned that `vite.config.ts` imported without a file extension; fixed (`.ts` extension, `allowImportingTsExtensions`). `npm run check` (web): typecheck and lint clean, 2 files, 8 passed. `npm run build` (web): 15 modules, built. `npm run check` (server): 46 files, 1781 passed, 89.92 s.
**Stubbed:** `App.tsx` shows only the system name; screens come at U.2 to U.8.
**Tests:** 8 added in `web/test/` (7 proxy, 1 render). Server 1781 unchanged.
**Not verified:** the dev server and proxy against a running API; the `fsevents` install script was not run (A-192 item 7). No server change, no live check, dev database not touched.

---

## Step U.0 (size S), 2026-10-22: screen plan (D-81, A-191)

**Works (verified in this session):** `docs/PHASE_PLAN.md` holds the Phase U screen table (screen, routes, permission, gap) and refined steps U.1 to U.9 with a new server step U.3a (member balances read route) and U.3b (its break-on-purpose). Routes read from `server/src/*-routes.ts` and `app.ts`; the prototype from `legacy-prototype/src/App.jsx` and its README. TRACEABILITY R-02, R-14, R-24 and R-30 brought up to date. Phase 6 exit confirmed by the owner ("continue", then "go"). `npm run check` (inside `server/`): 46 files, 1781 passed, 0 failed, 91.45 s.
**Stubbed:** nothing.
**Tests:** none added (docs only).
**Not verified:** Vite and React docs not read (U.1 does that). No source change, no live check, dev database not touched.

---

## Step 6.7b (size S), 2026-10-22: test for L14 (A-190)

**Works (verified in this session):** One test in `server/test/members.test.ts`, "names the Super Admin, not the Staff recorder, as the actor when the Super Admin reactivates (DR-15, A-190)". `npm run check`: 46 files, 1781 passed, 0 failed, 85.51 s. L14 rerun alone by hand with the exact find and replace texts from `~/Desktop/mutate-6.7.mjs`: `members.test.ts` 1 failed (the new test), 62 passed, so L14 is caught. `src/members.ts` restored from a copy; `git diff` on it empty; `git status --short` showed only the test file.
**Stubbed:** nothing.
**Tests:** 1 added (1781).
**Not verified:** the full 6.7 script was not rerun. No source change, no migration, no live check, dev database not touched.

---

## Step 6.7 (size S), 2026-10-22: break-on-purpose for 6.6 (A-190)

**Works (verified in this session):** One break-on-purpose run for `reactivateMember` and `POST /members/:id/reactivate`, script `~/Desktop/mutate-6.7.mjs` (not in git; `--dry`: all 28 find texts found once; output in `~/Desktop/mutate-6.7.out`). Baselines 97 (`members.test.ts`, `members-routes.test.ts`) and 35 (routes). 28 mutations, 24 caught, 4 escaped (L3, L14, L18, R2), 0 errors, 0 timeouts, 0 not applied; "files restored: yes"; `git status --short` empty. L14 (audit actor is the member's recorder) is a test gap (A-190); fix proposed at 6.7b. L3, L18 and R2 are equivalent as tested (A-190). `npm run check` afterwards: 46 files, 1780 passed, 0 failed, 83.76 s.
**Stubbed:** nothing.
**Tests:** none added (1780).
**Not verified:** L14 is not yet caught (6.7b). No source change, no migration, no live check, dev database not touched.

---

## Step 6.6 (size M), 2026-10-22: reactivate a member (DR-16, D-80)

**Works (verified in this session):** `reactivateMember` in `server/src/members.ts` and `POST /members/:id/reactivate` in `server/src/members-routes.ts`. `members.edit` needed; Staff only for their own members, else `not_found`; Active member 409 `already_active`; status Active and one `member.reactivated` audit entry in one transaction; 200 `{ member }`. `npm run check`: 46 files, 1780 passed, 0 failed, 88.59 s.
**Stubbed:** nothing.
**Tests:** 25 added (1780): 14 memory store and 3 real SQLite in `members.test.ts`, 8 in `members-routes.test.ts`.
**Not verified:** no live check (the script has no reactivation checks); no break-on-purpose yet (6.7). No migration, dev database not touched.

---

## Step 6.5b (size S), 2026-10-22: test for P21 (A-188)

**Works (verified in this session):** One test in `server/test/payoffs.test.ts`, "answers active_loan when a repaid loan is followed by a newer active loan (DR-06, A-188)". `npm run check`: 46 files, 1755 passed, 0 failed, 82.80 s. P21 rerun alone by hand with `sed`, using the exact find and replace texts from `~/Desktop/mutate-6.5.mjs`: `payoffs.test.ts` 1 failed (the new test), 41 passed, so P21 is caught. `src/payoffs.ts` restored from a copy; `git diff` on it empty; `git status --short` showed only the test file.
**Stubbed:** nothing.
**Tests:** 1 added (1755).
**Not verified:** nothing new. No source change, no migration, no live check, dev database not touched.

---

## Step 6.5 (size S), 2026-10-22: break-on-purpose for 6.3 to 6.4c; Phase U added to the plan (D-79)

**Works (verified in this session):** One break-on-purpose run for 6.3 to 6.4c, script `~/Desktop/mutate-6.5.mjs` (not in git; output in `~/Desktop/mutate-6.5.out`). Baselines 63 (`balances.test.ts`, `payoffs.test.ts`), 69 (`payoffs.test.ts`, `payoffs-routes.test.ts`), 28 (routes), 222 (`expenses.test.ts`, `expenses-routes.test.ts`), 403 (memory store) and 417 (Prisma store and db); 119 mutations, 113 caught, 6 escaped (P21, R5, X5, X9, SP6, SP17), 0 errors, 0 timeouts, 0 not applied; "files restored: yes" (verified in this session). P21 is a test gap: the active-loan check changed from "some loan active" to "every loan active" escaped, so no test pays out a member with a repaid loan and a newer active loan, which `loans.ts` allows (A-188). Proposed fix: 6.5b. R5, X5, X9, SP6 and SP17 are equivalent or unreachable as tested (A-188). `npm run check` afterwards: 46 files, 1754 passed, 0 failed, 79.42 s (verified in this session). No source change.
**Stubbed:** nothing.
**Tests:** none added (1754).
**Plan:** at the owner's request, Phase U (screens in `web/`, steps U.0 to U.9) added to `PHASE_PLAN.md` after Phase 6 (D-79). Docs only.
**Not verified:** P21 is not yet caught (6.5b). The script has no `schema.prisma` mutation; the E mutations change the migrations instead, and all 8 were caught.

---

## Step 6.4c (size S), 2026-10-22: pay-off expense guard by link (D-78)

**Works (verified in this session):** `deleteExpense` and `updateExpense` in `server/src/expenses.ts` refuse an expense with `payOffId` set, whatever its category, with `not_deletable` or `not_editable` code `pay_off`; the Membership Withdrawal category is still refused too. 2 new tests in `server/test/expenses.test.ts` (memory store) and the linked case added to both real SQLite tests. `npm run check`: 46 files, 1754 passed, 0 failed, 77.90 s.
**Stubbed:** nothing.
**Tests:** 2 added (1754).
**Not verified:** no break-on-purpose run yet (6.5). An expense naming both a loan and a pay-off is not tested (A-187).

---

## Docs fix after 6.4b, 2026-10-22: inconsistencies

**Changed:** `DATA_MODEL.md` had no `PayOff`, `PayOffLine` or `Expense.payOffId` (last updated at 5.9) and still listed balances as "not yet modelled": added from `schema.prisma` (read in this session). `STATUS.md`: the owner inputs list is numbered 1 to 13 in order; "overrule D-19 to D-76" now D-77; a missing comma; item 13 now also names D-14 to D-18, which have no "Approved:" clause. `TRACEABILITY.md` R-12 cites D-77. `scripts/live-check-auth.sh`: the header comment named only /auth and /staff and one staff account; it now names every route and the rows each run adds (comments only).
**Checks:** `sh -n scripts/live-check-auth.sh`: syntax-ok (verified in this session). No code change, so no `npm run check`.
**Decided:** the owner confirmed the approvals: D-14 to D-18 "Approved: project lead" (with D-13), D-67 approved under the owner's "go" for 5.8b. Added to `DECISIONS.md`; the owner input is removed.

---

## Step 6.4b (size M), 2026-10-22: pay-off route (D-77)

**Works (verified in this session):** `POST /payoffs` in new `server/src/payoffs-routes.ts`, mounted in `app.ts`: 401 without a token, 403 without `payoff.process` (before the body is read), header `Idempotency-Key`, body `memberId`, `method`, `total`; 201 `{ payOff }` with no-store, `Idempotent-Replayed: true` on a repeat; 400 `invalid_input` with code, 400 `bad_request` for malformed JSON, 413 `too_large`; 404 `not_found`; 409 `member_inactive`, `active_loan`, `nothing_to_pay_off`, `payout_changed`, `idempotency_conflict`. 28 tests in new `server/test/payoffs-routes.test.ts`. `npm run check`: 46 files, 1752 passed, 0 failed, 84.72 s. `npm run db:deploy` (owner said yes): `20261022090000_pay_offs` and `20261022120000_expense_payoff_link` applied, "All migrations have been successfully applied."; `prisma migrate status`: "Database schema is up to date!".
**Works (verified on owner's machine):** live check with 19 new pay-off checks in `scripts/live-check-auth.sh` (403 without the right, `active_loan`, 404 for another user's member, missing key, `payout_changed`, 201 ₦20,000, repeat returns the same pay-off, second pay-off `member_inactive`, member Inactive, audit `payoff.processed`, 401 without a token): 157 passed, 0 failed.
**Stubbed:** nothing. No GET or read by id for pay-offs (A-186).
**Tests:** 28 added (1752).
**Not verified:** no break-on-purpose run yet (6.5). The `Expense` rows copied by the 6.3b table rebuild on the dev database were not read (A-160, A-183).
**Found along the way:** I first told the owner the live check gained 23 checks; it gained 19 (138 + 19 = 157).

---

## Step 6.4 (size M), 2026-10-22: pay-off logic (D-76)

**Works (verified in this session):** `processPayOff` in new `server/src/payoffs.ts`: permission `payoff.process`, idempotency key, member id, method and confirmed `total` checks, then one transaction: key lookup (repeat or conflict), member found and visible (DR-13), Active, no active loan (DR-06), payout from `memberBalances`, ₦0 refused, a total that is not the payout refused (`payout_changed`, A-185), pay-off with one line per refundable category above ₦0, Membership Withdrawal expense with `payOffId`, member set Inactive (DR-07), audit entry `payoff.processed`. 41 tests in new `server/test/payoffs.test.ts` (DR-05 worked example: ₦25,000 out, ₦3,000 kept, member Inactive; every refusal saves nothing; a failed pay-off, expense, status or audit write saves nothing; key repeat, conflict, per user, not used up by a refusal, lost race; real SQLite: five parallel requests with different keys give one pay-off, five with one key give one). `npm run check`: 45 files, 1724 passed, 0 failed, 71.94 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing. No route yet (6.4b).
**Tests:** 41 added (1724).
**Not verified:** no break-on-purpose run yet (6.5). No live check (no route).
**Found along the way:** the first `npm run check` failed 1 of 1724: the test passed `undefined` as the total to a helper whose default filled in a valid total; the test now sets `total` itself. No source change for it. Split 6.4 into logic (6.4) and route (6.4b). `deleteExpense` and `updateExpense` spot a pay-off expense by category only (`expenses.ts`), while the loan case also checks `loanId`; adding a `payOffId` check is outside this step (proposed as 6.4c, owner to decide).

---

## Step 6.3c (size S), 2026-10-22: balances take off pay-offs (D-75)

**Works (verified in this session):** `memberBalances(payments, payOffs)` in `balances.ts` takes each pay-off line off its category; a pay-off line in a non-refundable category, or one that takes a balance below ₦0, throws `BalanceError` (A-184). `BalanceError` takes an optional fixed message. 10 new tests in `balances.test.ts` (DR-05 worked example shows ₦0 refundable after its pay-off and keeps ₦3,000 non-refundable; one category only; each refundable category; new payments after a pay-off; several pay-offs; exactly ₦0; below ₦0; non-refundable and unknown categories; error name; input not changed); the 12 old calls now pass `[]`. `npm run check`: 44 files, 1683 passed, 0 failed, 74.02 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing. No caller yet (6.4).
**Tests:** 10 added (1683).
**Not verified:** no break-on-purpose run yet (6.5).
**Found along the way:** owner said "fix inconsistencies": DR-05, GLOSSARY, OQ-11 and R-16 now say "Membership Withdrawal", as the code and DR-11 (the code wins, as logged at 6.3); A-148 no longer says DR-11 waits on OQ-00; TRACEABILITY R-05 and R-28 no longer say DR-02 and DR-04 await sign-off; A-182 status set to "verify", as A-180 and A-183; the stale 6.3 comment in `balances.ts` is replaced. The `mirror/` copy of DOMAIN_RULES needs the DR-05 wording (owner, by hand).

---

## Step 6.3b (size S), 2026-10-22: pay-off link on expenses (D-74)

**Works (verified in this session):** `Expense.payOffId` (nullable, `@unique`, foreign key to `PayOff`, `onDelete: Restrict`) and the back relation `PayOff.expense` in `schema.prisma`. Migration `20261022120000_expense_payoff_link` (SQL from `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against a temporary database built by `migrate deploy` in the scratchpad; SQLite rebuilds `Expense`: the `INSERT ... SELECT` copies every old column, including `loanId`, `idempotencyKey` and `requestHash`, read in this session; dev database not touched). `ExpenseRecord.payOffId`, `NewExpense.payOffId`, `UnknownPayOffError` and `DuplicateExpensePayOffError` in `store.ts`; both adapters check the creator, the loan, a repeated loan, the pay-off, a repeated pay-off, then the key. Prisma reads a unique clash in the write as the key when a key is given, else the pay-off when one is given, else the loan (A-170, A-183). Six contract cases per adapter in `expenses-contract.ts` (keeps the id; unknown pay-off; repeated pay-off; creator before pay-off; loan before pay-off; repeated loan before repeated pay-off before repeated key); first case now also expects `payOffId: null`. Two `db.test.ts` cases (unknown pay-off P2003; second expense for one pay-off P2002 and pay-off delete refused P2003). `npm run check`: 44 files, 1673 passed, 0 failed, 74.23 s. `npx vitest run test/memory-store.test.ts test/prisma-store.test.ts test/db.test.ts -t "pay-off"`: 56 passed, 346 skipped.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing. No route sets `payOffId` yet (6.4).
**Tests:** 14 added (1673).
**Not verified:** the migration on the dev database (owner runs `db:deploy`); the row copy on a table with rows (A-160); the Prisma clash reading under a real race. No break-on-purpose run yet (6.5).
**Found along the way:** nothing new. The name conflict ("Member Withdrawal" and "Membership Withdrawal") and the stale A-148 line logged at 6.3 are still open.

---

## Step 6.3 (size M), 2026-10-22: pay-off table and store (D-73)

**Works (verified in this session):** models `PayOff` (member, method, `totalKobo`, `idempotencyKey`, `requestHash`, creator, `createdAt`; indexes on `memberId` and `createdById`; unique on creator and key) and `PayOffLine` (`payOffId`, `position`, `category`, `amountKobo`; unique on pay-off and position), all relations `onDelete: Restrict`. Migration `20261022090000_pay_offs` (SQL from `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against a temporary database built by `migrate deploy` in the scratchpad; two `CREATE TABLE` and four indexes; dev database not touched). `PayOffRecord`, `PayOffLineRecord`, `NewPayOff`, `PayOffStore` and `DuplicatePayOffKeyError` in `store.ts`; both adapters; the memory transaction snapshot copies pay-offs. New `test/helpers/payoffs-contract.ts`, 20 cases per adapter (DR-05 worked example as data). Hand-built stores in `auth.test.ts` (4), `sessions.test.ts` (3), `auth-routes.test.ts` (1) gained `payOffs` (owner approved). `npm run check`: 44 files, 1659 passed, 0 failed, 72.06 s. `npx vitest run test/memory-store.test.ts test/prisma-store.test.ts -t "pay-offs"`: 40 passed, 334 skipped.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing. No route uses the store (6.4).
**Tests:** 40 added (1659).
**Not verified:** the migration on the dev database (owner runs `db:deploy`). No break-on-purpose run yet (6.5).
**Found along the way:**
1. Owner approved the split at the start: 6.3 table and store, 6.3b `Expense.payOffId`, 6.3c balances (A-182).
2. Name conflict, not fixed (DOMAIN_RULES not in this step): DR-05, GLOSSARY, OQ-11 and R-16 say "Member Withdrawal"; DR-11, A-148 and the code (`expense-categories.ts`, per A-148) say "Membership Withdrawal". The code wins; the docs rows need a wording fix.
3. A-148 still says DR-11 waits on OQ-00; D-71 confirmed it. Left as is (logged here).

---

## Step 6.2b (size S), 2026-10-22: test for the BalanceError name (A-181)

**Works (verified in this session):** one test added to `server/test/balances.test.ts` (12 tests): `names the error BalanceError, so the server log shows it`. `npm run check`: 44 files, 1619 passed, 0 failed, 80.90 s. Test file committed alone as `19e6ad7` (owner said yes), because the mutation script needs a clean tree. Rerun of `~/Desktop/mutate-6.1.mjs` (output in `~/Desktop/mutate-6.2b.out`): 26 mutations `{"caught":26,"escaped":0,"error":0,"timeout":0,"notApplied":0}`; B5 CAUGHT by the new test ("names the error BalanceError, so the server log shows it"); "files restored: yes"; `git status --short` empty.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** 1 added (1619).
**Not verified:** nothing open for 6.1 balances. The break-on-purpose scripts are not in git.
**Found along the way:**
1. My first try at the rerun used a scratch copy of the script with the clean-tree check loosened. The auto-mode classifier denied it. I stopped, asked, and committed the test first instead (the script's own advice).
2. Docs were not in the owner's "test file alone" commit, so they follow in a separate docs commit.

---

## Step 6.2 (size S), 2026-10-22: break-on-purpose for member balances (A-181)

**Works (verified in this session):** script `~/Desktop/mutate-6.1.mjs` (not in git), `--dry`: "dry run done: 26 mutations", no find text missing or repeated. Run (output in `~/Desktop/mutate-6.2.out`): baseline 11 passed; 26 mutations `{"caught":25,"escaped":1,"error":0,"timeout":0,"notApplied":0}`; escaped: B5; "files restored: yes"; `git status --short` empty. `npm run check` afterwards: 44 files, 1618 passed, 0 failed, 79.20 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** none added (1618).
**Not verified:** B5 (`BalanceError` name not set) escaped: a test gap, A-181. Fix proposed at 6.2b.
**Found along the way:**
1. STATUS did not say 6.1 was pushed; `origin/main` pointed to `f95df83`. Fixed.
2. Mutations: B1 to B5 the unknown-category check and the error, B6 to B11 the adding, B12 to B16 the category list and flags, B17 to B25 the totals, B26 the input left unchanged.

---

## Step 6.1 (size S), 2026-10-22: member balances from payment lines (D-72)

**Works (verified in this session):** new `server/src/balances.ts` (`memberBalances`, `BalanceError`) and `server/test/balances.test.ts` (11 tests, including the DR-05 worked example: payout ₦25,000, ₦3,000 kept). `npm run check`: 44 files, 1618 passed, 0 failed, 78.78 s, exit 0.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing. Nothing calls `memberBalances` yet.
**Tests:** 11 added (1618).
**Not verified:** balances after a pay-off (not stored until 6.3, A-180). No break-on-purpose run yet (6.2).
**Found along the way:**
1. STATUS did not say 6.0 was pushed; `origin/main` pointed to `0a842e3`. Fixed.
2. The step 6.1 files were not in NEXT_FILES; the step header named them.

---

## Step 6.0 (size S), 2026-10-22: owner answers OQ-00, OQ-06 and OQ-07 (D-71)

**Works (verified in this session):** docs only. OQ-00, OQ-06 and OQ-07 closed in OPEN_QUESTIONS. DOMAIN_RULES: the money rules confirmed (DR-01, DR-02, DR-04, DR-05 rest, DR-06, DR-08 example and rejection, DR-09, DR-11); DR-15 stays requested; new DR-16 (reactivation). DECISIONS: D-71. ASSUMPTIONS: A-179. PHASE_PLAN: Phase 6 first look (6.0 to 6.7). TRACEABILITY: R-35. `npm run check` (run before the docs, no code changed): 43 files, 1607 passed, 0 failed, 79.08 s, exit 0.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** none added (1607).
**Not verified:** the readings in A-179 (owner to check).
**Found along the way:**
1. STATUS did not say 5.9e was pushed; `origin/main` pointed to `f88e138`. Fixed. The dependency line said "4.5 to 5.8"; fixed.
2. The step brief named only the "proposed" rows for OQ-00; the "requested" money rows (DR-02, DR-09, DR-11, DR-08 example) were also confirmed, because STATUS said they waited on OQ-00 (A-179).
3. No balances code exists yet (`store.ts` says balances are derived later); 6.1 builds it.
4. Mirror: D-71 and DR-16 are new; the owner adds them to the claude.ai Project by hand.

---

## Step 5.9e (size S), 2026-10-22: tests for the 5.9d test gaps (A-178)

**Works (verified in this session):** three tests. `server/test/expenses.test.ts`: "gives not_found for a deleted expense sent with unchanged fields, and changes nothing (A-178 U5)" (Super Admin deletes f's expense; f sends the same category, amount and method; the row and the audit log stay as they were) and "saves a change of the narration alone on an Others expense (A-178 U18)" (two edits; the second changes only the narration, which is saved, and its audit detail has `narration_changed=true`). `server/test/helpers/expenses-contract.ts`: "returns null for an empty change to a deleted expense (A-178 UP8)", run on both adapters. `npm run check`: typecheck and lint clean, 43 files, 1607 passed, 0 failed, 74.96 s, exit 0. Tests committed as `2dbb0ca` (owner said yes) so the mutation script could run. Full rerun of `~/Desktop/mutate-5.9d.mjs` (output in `~/Desktop/mutate-5.9e.out`): baselines 220, 54, 334 and 346; 96 mutations, 92 caught, 4 escaped (D3, D4, U3, R3), 0 errors, 0 timeouts, 0 not applied; U5, U18 and UP8 caught (1 failed each, the new test); "files restored: yes"; `git status --short` empty.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** 4 added (2 logic, 1 contract case per adapter). Total 1607.
**Not verified:** no live check (the step has none).
**Found along the way:**
1. STATUS said 5.9d was not committed; `037b3c1` was HEAD and `origin/main` pointed to it. Fixed.
2. The first draft of the U5 test used a user without `expenses.delete`; replaced before any run by the Super Admin from `buildEdit`.
3. No new decision; the mirror needs no change for this step.

---

## Step 5.9d (size S), 2026-10-22: break-on-purpose for 5.9, 5.9b and 5.9c (A-178)

**Works (verified in this session):** script `~/Desktop/mutate-5.9d.mjs` (not in git), built on the 5.8c harness. `--dry`: all 96 find texts found once. Baselines 218 (`expenses.test.ts` and `expenses-routes.test.ts`), 54 (routes), 331 (memory store and `expenses.test.ts`), 343 (Prisma store, db and `expenses.test.ts`). 96 mutations: 18 in `deleteExpense` (D), 31 in `updateExpense` (U), 5 in the shared `checkFields` (C), 13 in the DELETE and PUT routes (R), 8 in the memory `update` (UM), 7 in the memory `softDelete`, list filter and copy (DM), 9 in the Prisma `update` (UP), 5 in the Prisma `softDelete` and list filter (DP). Result: 89 caught, 7 escaped (D3, D4, U3, U5, U18, R3, UP8), 0 errors, 0 timeouts, 0 not applied; "files restored: yes"; `git status --short` empty. Output kept in `~/Desktop/mutate-5.9d.out`. `npm run check` afterwards: 43 files, 1603 passed, 0 failed, 74.71 s, exit 0.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** none added (1603).
**Not verified:** the reasons for the escapes are read from the code, not run (A-178).
**Found along the way:**
1. Three test gaps (A-178): U5 (no deleted check in `updateExpense`: a PUT with the same fields on a deleted expense would answer 200 through the no-change path), U18 (narration ignored in the no-change check: on an Others expense, a change to the narration alone would answer 200 and save nothing), UP8 (the Prisma empty `update` reads without `deletedAt: null`, so it would return a deleted expense instead of null; no caller sends an empty change). Proposed fix: 5.9e (S).
2. Four equivalent escapes (A-178): D3 and U3 (id checks; an unknown or non-text id finds nothing on the memory store, as A-91), D4 (`softDelete` refuses a deleted expense itself and the answer is the same 404), R3 (DELETE guard; `deleteExpense` gives the same 403 first, and DELETE reads no body, as A-168).
3. TRACEABILITY R-09 said the totals were not built (stale since 5.8b); fixed. A-152 is marked superseded by 5.8 and 5.9.

---

## Step 5.9c (size M), 2026-10-21: PUT /expenses/:id (D-70, OQ-08, DR-12, DR-13, A-177)

**Works (verified in this session):** `updateExpense` in `server/src/expenses.ts` and `PUT /expenses/:id` in `expenses-routes.ts` (200 `{ expense }`). Needs `expenses.edit` (403 first). The field checks of `createExpense` moved into one shared `checkFields`; PUT sends every field and gets the same codes. Unknown, empty or non-text id, a deleted expense and, for Staff, someone else's expense: 404 `not_found`. Loan-linked (`loanId` set, or category Loan): 409 `not_editable` `loan_linked`; Membership Withdrawal: 409 `not_editable` `pay_off`, also for the Super Admin. Lookup, `expenses.update` and audit entry `expense.updated` (old and new category, kobo amount and method; description and narration only as changed true or false) in one `store.transaction`; `update` returning null gives 404 and no audit entry. An edit that changes nothing writes nothing. A repeat of the first create with the same key returns the edited expense. 41 logic cases in `server/test/expenses.test.ts` (with 20 `it.each` rows; 3 on real SQLite) and 9 route cases in `server/test/expenses-routes.test.ts`; the old `it.each` "answers 404 to get and put /expenses/x" became one GET case. `npm run check`: typecheck and lint clean, 43 files, 1603 passed, 0 failed, 76.48 s, exit 0 (exit code captured from `npm run check` itself, output written to a scratch file).
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** 49 net (1554 to 1603).
**Not verified:** no live check (the script has no expense checks). No break-on-purpose run yet (5.9d). Every new test passed on the first run, so none was seen failing yet; 5.9d will show whether they catch faults.
**Found along the way:**
1. STATUS said 5.9b was not committed; `de6e184` was HEAD and `origin/main` pointed to it. Fixed.
2. One test I first wrote listed expenses as Staff f, who has no `expenses.view`; changed to list as the Super Admin before the run.
3. OQ-08 wants old values in the audit log; the old description and narration are not kept (A-169 personal details). Owner to confirm (A-177).

---

## Step 5.9b (size M), 2026-10-21: DELETE /expenses/:id (D-69, DR-12, A-176)

**Works (verified in this session):** `deleteExpense` in `server/src/expenses.ts` and `DELETE /expenses/:id` in `expenses-routes.ts` (204, no body). Needs `expenses.delete` (403 first, before the id is looked at). Unknown id, empty or non-text id, an expense already deleted and, for Staff, someone else's expense: 404 `not_found`. Loan-linked (`loanId` set, or category Loan): 409 `not_deletable` `loan_linked`; Membership Withdrawal: 409 `not_deletable` `pay_off`, also for the Super Admin. Lookup, `softDelete` and audit entry `expense.deleted` (detail `category=… amount_kobo=…`) in one `store.transaction`; a `softDelete` that returns null (lost race) gives 404 and no audit entry. 21 logic cases in `server/test/expenses.test.ts` (3 on real SQLite: delete and refusals, audit failure rolls back, five deletes at once give one delete and one entry) and 6 route cases in `server/test/expenses-routes.test.ts`. `npm run check`: 43 files, 1554 passed, 0 failed, 72.76 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** 26 added (net: 27 new cases, the old 404 row for `DELETE /expenses/x` removed). Total 1554.
**Not verified:** no live check (the script has no expense checks; it would also touch the dev database). No break-on-purpose run yet (5.9d). The exit code of `npm run check` was read through `tail`, so it is the exit code of `tail`; the output shows typecheck and lint ran and all 43 files passed.
**Found along the way:**
1. STATUS said 5.9 was not committed; `64bb19b` was HEAD and `origin/main` pointed to it. Fixed.
2. The first route test I wrote checked that Staff without `expenses.view` get 403 from `GET /expenses` after a delete. That checks nothing about delete, so it was removed before the final run (1554 both times).

---

## Step 5.9 (size M), 2026-10-21: soft-delete and update in the expenses store (D-68, A-175)

**Works (verified in this session):** 5.9 split into 5.9 (store), 5.9b (`DELETE /expenses/:id`), 5.9c (`PUT /expenses/:id`), 5.9d (break-on-purpose) (D-68). New `ExpenseChanges` and store methods `expenses.update(id, changes)` and `expenses.softDelete(id, deletedById)` in both adapters. Both return null and change nothing for an unknown or already deleted expense; `softDelete` throws `UnknownActorError` for an unknown user, checked before the expense. Each Prisma write is one `updateMany` with `deletedAt: null` in its WHERE. `expenses.list` now leaves out soft-deleted rows; `findById` and `findByKey` still return them. 12 new contract cases per adapter (fields kept, empty change, unknown id, copies, delete once, unknown user, deleted not updated, deleted not listed, five parallel deletes give one record, rollback) and one logic test (a deleted expense leaves the list and the total). Comment fix in `expenses.ts`. `npm run check`: 43 files, 1528 passed, 0 failed, 67.75 s, exit 0.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing. No route uses the new methods yet (5.9b, 5.9c).
**Tests:** 25 added (12 × 2 adapters, 1 logic). Total 1528.
**Not verified:** no live check (no route changed). No break-on-purpose run yet: 5.9d covers 5.9, 5.9b and 5.9c. Prisma docs for `updateMany` were not read (A-175).
**Found along the way:**
1. The first `npm run check` failed 1 test ("returns the expense unchanged for an empty change", 1527 passed): the Prisma `update` sent an `updateMany` with empty `data`, which reported 0 rows on SQLite, so it returned null. Fixed in `prisma-store.ts`: an empty change is a read of a row that is not deleted.
2. STATUS still said the 5.8d docs were not committed; `ae607eb` held them and `origin/main` pointed to it. Fixed.
3. DATA_MODEL had not been updated since 5.3b (no key columns on `Loan` and `Expense`). Fixed.
4. D-67 has no "Approved:" clause. Not changed: who approved it is not recorded.

---

## Step 5.8d (size S), 2026-10-21: tests for the 5.8c test gaps (A-174)

**Works (verified in this session):** three tests. `server/test/expenses.test.ts`: "accepts a createdById of exactly 100 characters" (Super Admin; the store gets `{ createdById }` unchanged) and "keeps the store's order, oldest first, without sorting or reversing it" (three rows, ids compared in order with `store.expenses.list({})`). `server/test/expenses-routes.test.ts`: "answers 200 to Staff with expenses.view but not expenses.create" (`{ expenses: [], total: "0.00" }`). `npm run check`: 43 files, 1503 passed, 0 failed, 63.32 s. Tests committed as `73e4524` (owner said yes) so the mutation script could run. Full rerun of `~/Desktop/mutate-5.8c.mjs`: baselines 142, 41, 256 and 268; 66 mutations, 63 caught, 3 escaped (T6, T7, R1), 0 errors, 0 timeouts, 0 not applied; L6, L27 and R2 caught (1 failed each, the new test); "files restored: yes"; `git status --short` empty.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** 3 added. Total 1503.
**Not verified:** no live check (the step has none).
**Found along the way:**
1. STATUS said 5.8c was not committed; `96e1fa9` was HEAD and `origin/main` pointed to it. Fixed.
2. The first rerun stopped at once with "Working tree is not clean. Commit first" (no mutation applied). The script has no single-mutation option, so all 66 were rerun after the test commit.
3. No new decision; the mirror needs no change for this step.

## Step 5.8c (size S), 2026-10-21: break-on-purpose for the expense list (5.8, 5.8b, D-66, D-67)

**Works (verified in this session):** script `~/Desktop/mutate-5.8c.mjs` (not in git; `--dry`: all 66 find texts found once). Baselines 139 (`expenses.test.ts` and `expenses-routes.test.ts`), 40 (`expenses-routes.test.ts`), 254 (`memory-store.test.ts` and `expenses.test.ts`) and 266 (`prisma-store.test.ts`, `db.test.ts` and `expenses.test.ts`). 66 mutations: 30 in `listExpenses` (L), 7 in `parseTime` (T), 10 in the GET route (R), 9 in the memory `expenses.list` (LM), 10 in the Prisma `expenses.list` (LP). 60 caught, 6 escaped (L6, L27, T6, T7, R1, R2), 0 errors, 0 timeouts, 0 not applied. "files restored: yes"; `git status --short` empty. `npm run check` afterwards: 43 files, 1500 passed, 0 failed, 70.96 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** none added. Total 1500.
**Not verified:** no live check (the script has no expense checks).
**Found along the way:**
1. STATUS said 5.8b was not committed; `1505db4` was HEAD and `origin/main` pointed to it. Fixed.
2. Test gaps (A-174): L6 (a `createdById` of exactly 100 characters refused), L27 (`listExpenses` reversed to newest first; the logic and route tests compare lists by id or hold one row, so only the store contract pins the order) and R2 (the GET guard asks `expenses.create`; both permissions are `staffGrantable` separately in `permissions.ts`, and no test sends Staff with view but not create). Proposed 5.8d (S).
3. Equivalent (A-174): T6 (offsets allowed by the pattern) and T7 (type check removed) are still refused by the round-trip compare, checked with `node -e`: `2026-10-01T00:00:00+01:00` and `["2026-10-01T00:00:00Z"]` refused, `{a:"x"}`, `123`, `true` fail the pattern. R1 (GET guard removed): `listExpenses` checks `expenses.view` first and the route maps `forbidden` to 403 (as A-168 R2).
4. Caught on purpose: every filter in both adapters, both range edges in both adapters and in the logic, the order of the query checks, Staff and Super Admin scope, the total (naira string, every row), the route's query mapping, status and reply shape, and copies from the memory list.
5. PHASE_PLAN listed 5.2b and 5.2c after 5.9; moved into order.
6. No new decision; the mirror needs no change for this step.

## Step 5.8b (size M), 2026-10-21: `GET /expenses` with DR-13 scope and the list total (D-67, A-173)

**Works (verified in this session):** `listExpenses` in `server/src/expenses.ts` and `GET /expenses` in `expenses-routes.ts` (200 `{ expenses, total }`), permission `expenses.view`. Staff see only their own expenses (a `createdById` filter is checked but ignored); the Super Admin sees all or one creator's. Query `category` (any DR-11 name), `method`, `from` (included) and `before` (not included) as UTC times; refusals are 400 `invalid_input` with `invalid_created_by_id`, `invalid_category`, `invalid_method`, `invalid_from`, `invalid_before` or `invalid_range`. `total` is the sum of the listed amounts as a naira string. Read only: no audit entry. `npm run check`: 43 files, 1500 passed, 0 failed, 66.28 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing. No paging. Soft-deleted rows do not exist until 5.9.
**Tests:** 42 net: 31 added in `test/expenses.test.ts` (one on real SQLite), 12 added in `test/expenses-routes.test.ts`, and the old "GET /expenses answers 404" case removed. Total 1500.
**Not verified:** no live check (the live-check script does not cover expenses; changing it was outside this step). No break-on-purpose run yet (5.8c). Express docs on how repeated query parameters arrive were not read (not checked); a test pins that `category=Others&category=Loan` gives 400 `invalid_category`.
**Found along the way:**
1. STATUS said 5.8 was not committed; `d6172ae` was HEAD and `origin/main` pointed to it. Fixed.
2. PHASE_PLAN said "the list total in kobo". Amounts cross the API as strings (A-18), so `total` is a naira string like `amount` (D-67).
3. `Date` accepts `2026-02-30T00:00:00Z` and moves it to 2 March (seen in this session with `node -e`). `from` and `before` are compared back after parsing, so such dates are refused.
4. Expenses saved in the same millisecond have no fixed order (store contract), so the new tests compare those lists by id, not by position.

## Step 5.8 (size M), 2026-10-21: store filters for the expense list (D-66, A-172)

**Works (verified in this session):** `ExpenseListQuery` in `server/src/store.ts` gained `category`, `method`, `createdFrom` and `createdBefore` (besides `createdById`). Every given filter must hold; text matches exactly; the time range is half-open (`createdFrom` included, `createdBefore` not). Both adapters (`memory-store.ts`, `prisma-store.ts`) filter the same way; the Prisma adapter builds its `where` with the same spread as `members.list`. 5 new cases in `test/helpers/expenses-contract.ts`, run on both adapters (10 tests). `npm run check`: 43 files, 1458 passed, 0 failed, 70.79 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing. No logic or route uses the filters yet (5.8b).
**Tests:** 10 added. Total 1458.
**Not verified:** no live check (no route). Prisma docs for `gte` and `lt` on DateTime were not read (not checked); the behaviour is pinned by the contract on real SQLite. No break-on-purpose run yet (5.8c).
**Found along the way:**
1. 5.8 was L (store, logic, route, DR-13 scope, totals), so it was split into 5.8 (store filters), 5.8b (`GET /expenses`) and 5.8c (break-on-purpose) (D-66).
2. STATUS said 5.7d was not committed; `83d86d4` was HEAD and `origin/main` pointed to it. Fixed.
3. An expense has no date of its own, only `createdAt`; the prototype let the user type a date. The filters use `createdAt` (A-172). Whether an expense needs a separate "date spent" is for the owner.
4. No deleted-rows filter yet: nothing can be soft-deleted until 5.9, so it could not be tested. It comes with 5.9 (A-172).

## Step 5.7d (size S), 2026-10-21: break-on-purpose for `POST /expenses` and its key (5.7, 5.7c, D-64, D-65)

**Works (verified in this session):** script `~/Desktop/mutate-5.7d.mjs` (not in git; `--dry`: all 84 find texts found once). Baselines 97 (`expenses.test.ts` and `expenses-routes.test.ts`), 29 (`expenses-routes.test.ts`), 218 (`memory-store.test.ts` and `expenses.test.ts`) and 230 (`prisma-store.test.ts`, `db.test.ts` and `expenses.test.ts`). 84 mutations: 46 in `expenses.ts` (E), 13 in `expenses-routes.ts` (R), 8 in the memory adapter expense key code (KM), 10 in the Prisma adapter (KP), 4 in the 5.7c migration (EQ), 3 in `schema.prisma` (C). 82 caught, 2 escaped (R10, KP2), 0 errors, 0 timeouts, 0 not applied. "files restored: yes"; `git status --short` empty. `npm run check` afterwards: 43 files, 1448 passed, 0 failed, 69.07 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** none added. Total 1448.
**Not verified:** no live check (the script has no expense checks).
**Found along the way:**
1. STATUS still said 5.7c was not committed; `0b8de37` was HEAD and `origin/main` pointed to it. Fixed.
2. R10 (route maps `forbidden` to 401) is unreachable: the route guard answers 403 first with the same check. KP2 (Prisma reads every expense `P2002` as a key clash) matters only for a race on one `loanId`, which no code path makes (A-171).
3. Caught on purpose: key shape and order, every hash field, replay and conflict, the lost-race retry, the lookup outside the transaction, audit in and out of the transaction, the 200-character and ₦0 edges, Others narration rules, per-user keys in both adapters, the migration index and columns, and the schema.
4. No new decision; the mirror needs no change for this step.

## Step 5.7c (size M), 2026-10-21: idempotency key on `POST /expenses` (D-65)

**Works (verified in this session):** `POST /expenses` needs `Idempotency-Key` (same rules as payments and loans), checked right after the permission. A repeat gives 201 with the first expense and `Idempotent-Replayed: true`, nothing saved, no audit entry; the same key with another request gives 409 `idempotency_conflict`; a refused request keeps its key free; a clash at save is retried once. `Expense.idempotencyKey`, `Expense.requestHash`, unique on creator and key (migration `20261021200000_expense_idempotency`, from `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against a temporary database built by `migrate deploy`; columns added only; dev database not touched). `expenses.findByKey` and `DuplicateExpenseKeyError` in both adapters. `npm run check`: 43 files, 1448 passed, 0 failed, 73.36 s. `npx vitest run test/expenses.test.ts test/expenses-routes.test.ts`: 2 files, 97 passed. Five parallel requests with one key on real SQLite: one expense, one audit entry. `npm run db:deploy` on the dev database (owner said yes): "All migrations have been successfully applied."; `prisma migrate status`: "Database schema is up to date!".
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** 53 added: 9 contract cases per adapter (18), 35 in `test/expenses.test.ts` and `test/expenses-routes.test.ts` (62 to 97). Total 1448.
**Not verified:** no live check (the script has no expense checks). No break-on-purpose run yet (5.7d). The parallel case ran on SQLite only (as A-121).
**Found along the way:**
1. STATUS said 5.7 was not committed; `d077602` was HEAD and `origin/main` pointed to it. Fixed.
2. The Prisma expense `create` read every `P2002` as a repeated `loanId`. With a second unique index that is no longer true. It now reads a repeated `loanId` before the insert, and a `P2002` with a key is read as the key clash (A-170).
3. New decision D-65: the mirror needs it.

## Step 5.7 (size M), 2026-10-21: record an expense by hand (D-64)

**Works (verified in this session):** `POST /expenses` (`createExpense` in `server/src/expenses.ts`, route in `expenses-routes.ts`, mounted in `app.ts`), permission `expenses.create`. Only hand-picked categories: Loan and Membership Withdrawal give 400 `system_only`, others not in DR-11 `unknown_category`. Method `CASH` or `BANK_TRANSFER`; amount a naira string above ₦0; optional description; "Others" needs a narration, other categories may not have one (A-169). The expense and an `expense.created` audit entry are saved in one transaction (D-45); if either write fails, nothing is saved (memory and real SQLite). Reply 201 `{ expense }` with the amount as a string with 2 decimals. `npm run check`: 43 files, 1395 passed, 0 failed, 76.16 s. `npx vitest run test/expenses.test.ts test/expenses-routes.test.ts`: 2 files, 62 passed.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** no idempotency key yet (5.7c, owner chose option A).
**Tests:** 62 added (`test/expenses.test.ts`, `test/expenses-routes.test.ts`). Total 1395.
**Not verified:** no live check (the script has no expense checks). No break-on-purpose run yet (5.7d, after 5.7c).
**Found along the way:**
1. STATUS said 5.6b was not committed; `0894c8b` was HEAD and `origin/main` pointed to it. Fixed.
2. Conflict raised before coding: the Universal Project Rules §10 ask for an idempotency key on every money-moving request, and the 5.7 plan had none. Owner chose A: the route now, the key at 5.7c (migration), one break-on-purpose run at 5.7d. PHASE_PLAN updated.
3. New decision D-64: the mirror needs it.

## Step 5.6b (size S), 2026-10-21: break-on-purpose for `listLoans` and `GET /loans` (5.6, D-63)

**Works (verified in this session):** script `~/Desktop/mutate-5.6b.mjs` (not in git; `--dry`: all 32 find texts found once). Baselines 122 (`loans.test.ts` and `loans-routes.test.ts`) and 34 (`loans-routes.test.ts`). 32 mutations: 25 in `listLoans` in `loans.ts` (G), 7 in the GET route in `loans-routes.ts` (R). 30 caught, 2 escaped (G12, R2), 0 errors, 0 timeouts, 0 not applied. "files restored: yes"; `git status --short` empty. `npm run check` afterwards: 41 files, 1333 passed, 0 failed, 72.80 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** none added. Total 1333.
**Not verified:** no live check (the script has no loan list checks).
**Found along the way:**
1. STATUS still said 5.6 was not committed; `42675d7` was HEAD and `origin/main` pointed to it. Fixed.
2. G12 (early empty return removed) and R2 (the `loans.view` guard removed from the GET route) are equivalent, read from the code (A-168): without loans the loops run over nothing and give `[]`; `listLoans` checks `loans.view` itself and answers the same 403 `{ error: "forbidden" }`, and the GET route reads no body.
3. Caught on purpose: money shown (repaid, outstanding, the ₦0 and 1 kobo status edges), DR-13 visibility (Staff check removed, reversed, on the wrong role, answering 403), the expense lookup across lenders, order, Fully Repaid history, no audit entry.
4. No new decision; the mirror needs no change for this step.

## Step 5.6 (size S), 2026-10-21: one member's loans with repaid, outstanding and status (D-63)

**Works (verified in this session):** `listLoans` in `loans.ts` and `GET /loans?memberId=<id>` in `loans-routes.ts` (permission `loans.view`). Oldest first, Fully Repaid loans kept (DR-08). Each loan: the `POST /loans` view plus `repaid`, `outstanding` and `status` (`ACTIVE` or `FULLY_REPAID`), worked out on read (A-144). DR-08 example: ₦300,000 loan, ₦20,000 repaid gives `"20000.00"` repaid, `"280000.00"` outstanding, `ACTIVE`. Staff see loans the Super Admin gave to their members; other members give 404. Nothing is written. `npx vitest run test/loans.test.ts test/loans-routes.test.ts`: 2 files, 122 passed. `npm run check`: 41 files, 1333 passed, 0 failed, 69.78 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing. No list of all loans (A-167). No read by id.
**Tests:** +20 (`loans.test.ts` +14: 13 on the memory store, 1 on real SQLite; `loans-routes.test.ts` +7, minus the old 404 case for `GET /loans`). Total 1333.
**Not verified:** no break-on-purpose run yet (5.6b). No live check (the script has no loan list checks). The reads are not in one transaction, so a payment saved during a list may or may not be counted (A-167).
**Found along the way:**
1. STATUS still said 5.5b was not committed; `7192645` was HEAD and `origin/main` pointed to it. Fixed.
2. A list of all loans needs a new store method in both adapters and the contract, outside this step's files. The step follows `GET /payments` instead: `memberId` is required (A-167).
3. Staff `a` and `b` in both loan test files now also hold `loans.view`; a new `disburse-only` user checks the 403.
4. New decision D-63: the mirror needs it.

## Step 5.5b (size S), 2026-10-21: break-on-purpose for the Loan Repaid effect (5.5, D-62)

**Works (verified in this session):** script `~/Desktop/mutate-5.5b.mjs` (not in git; `--dry` checks the find texts: all 19 found once). Baselines 213 (`payments.test.ts`, `payments-routes.test.ts`, `payments-idempotency.test.ts`, `payment-sms.test.ts`, `loans.test.ts`) and 22 (`payments-routes.test.ts`). 19 mutations: 17 in `payments.ts` (P), 2 in `payments-routes.ts` (R). 17 caught, 2 escaped (P15, P16), 0 errors, 0 timeouts, 0 not applied. "files restored: yes"; `git status --short` empty. `npm run check` afterwards: 41 files, 1313 passed, 0 failed, 72.18 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** none added. Total 1313.
**Not verified:** why P16 does not break the SQLite race test (Prisma docs not checked, A-166). No server database run (A-121).
**Found along the way:**
1. STATUS still said 5.5 was not committed; `7b15e07` was HEAD and `origin/main` pointed to it. Fixed.
2. P15 and P16 read the loans or payments through the outer store instead of `tx`. Both are equivalent on the two adapters as tested (A-166). A test that pins it is possible; not written.
3. No new decision; the mirror needs no change for this step.

## Step 5.5 (size M), 2026-10-21: Loan Repaid effect in `createPayment` (D-62, DR-08, DR-09, A-145)

**Works (verified in this session):** `createPayment` links every Loan Repaid line to the member's active loan; no active loan gives `no_active_loan`, Loan Repaid lines above the outstanding amount give `loan_overpayment` (both 409 on `POST /payments`); nothing is saved and no audit entry is written on a refusal. Other lines, Loan Interest too, keep no loan. A repeat returns the first payment even after the loan is Fully Repaid. `npm run check`: 41 files, 1313 passed, 0 failed, 71.33 s. Five full repayments at once on real SQLite: one saved, four `no_active_loan`.
**Works (verified on owner's machine):** `sh scripts/live-check-auth.sh`: 138 passed, 0 failed (no Loan Repaid checks in the script yet).
**Stubbed:** nothing. No loan list (5.6).
**Tests:** +19 (`payments.test.ts` +17: 15 on the memory store, 2 on real SQLite; `payments-routes.test.ts` +2). Total 1313.
**Not verified:** no break-on-purpose run yet (5.5b). The parallel case ran on SQLite only (A-121). DR-08's refusal is still "proposed" (OQ-00).
**Found along the way:**
1. STATUS still said 5.4e was not committed; `431cdf9` was HEAD and `origin/main` pointed to it. Fixed.
2. `payments-routes.ts` was not in NEXT_FILES, but its `STATUS` map is typed over every failure reason, so the two new codes needed it. Named in the step header after the owner's "go".
3. `payments.ts` and `loans.ts` now import each other; neither uses the other's values at load time (A-165).
4. The live check script has no Loan Repaid checks; adding them is a later step if the owner wants it.

## Step 5.4e (size S), 2026-10-21: one test for the loan replay expense lookup (A-164)

**Works (verified in this session):** new test in `server/test/loans.test.ts`: one user gives loans to two members, then repeats both requests; each repeat returns its own loan with its own `expenseId`. `npm run check`: 41 files, 1294 passed, 0 failed, 103.28 s. L20 alone (applied by hand with `sed`, then `npx vitest run test/loans.test.ts`): 1 failed (the new test), 73 passed, so caught. `loans.ts` restored; `git diff` on it empty; `git status --short` showed only the test file.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** +1 (`loans.test.ts` 73 to 74). Total 1294.
**Not verified:** the full `mutate-5.4d.mjs` was not rerun; 80 of 80 caught is an inference.
**Found along the way:**
1. STATUS still said 5.4d was not committed; `914af18` was HEAD and `origin/main` pointed to it. Fixed.
2. `expenses.list` gives equal times in no fixed order (`store.ts`), so the test repeats both loans; the mutant fails whichever comes first.
3. The 5.4d script has no option to run one mutation, so L20 was applied by hand.
4. A full `npm run check` took 103.28 s, longer than the 86 s noted before. STATUS updated.
5. A-164 closed. No new decision; the mirror needs no change for this step.

## Step 5.4d (size S), 2026-10-21: break-on-purpose for `POST /loans` and its idempotency key (5.4, 5.4c)

**Works (verified in this session):** script `~/Desktop/mutate-5.4d.mjs` (not in git). Baselines 101, 28, 214 and 226 passed. 80 mutations: 44 in `loans.ts` (L), 14 in `loans-routes.ts` (R), 8 in the memory key code (KM), 7 in the Prisma key code (KP), 4 in the 5.4c migration (EQ), 3 in `schema.prisma` (C). 79 caught, 1 escaped (L20), 0 errors, 0 timeouts, 0 not applied. "files restored: yes"; `git status --short` empty. `npm run check` afterwards: 41 files, 1293 passed, 0 failed, 69.56 s.
**Works (verified on owner's machine):** nothing new.
**Stubbed:** nothing.
**Tests:** none added. Total 1293.
**Not verified:** L20 is open (A-164). The Prisma mutations ran the parallel cases on SQLite only (A-121).
**Found along the way:**
1. STATUS still said 5.4c was not committed; `8f94b7d` was HEAD and `origin/main` pointed to it. Fixed.
2. Eleven find texts first matched the payment key code too (same field names in `Payment`); the dry run showed it and they were anchored on loan-only lines before the run.
3. L20 escaped: no test replays a key after the same user gave another loan (A-164). Proposed 5.4e.

## Step 5.4c (size M), 2026-10-21: idempotency key on `POST /loans` (D-60, D-61)

**Works (verified in this session):** `POST /loans` needs `Idempotency-Key` (same rules as payments). A repeat gives 201 with the first loan and `Idempotent-Replayed: true`, nothing saved; the same key with another request gives 409 `idempotency_conflict`; a refused request keeps its key free; a clash at save is retried once. `Loan.idempotencyKey`, `Loan.requestHash`, unique on creator and key (migration `20261021180000_loan_idempotency`, from `prisma migrate diff` on a temporary database, columns added only). `loans.findByKey` and `DuplicateLoanKeyError` in both adapters. `npm run check`: 41 files, 1293 passed, 0 failed, 85.73 s. Five parallel requests with one key on real SQLite: one loan, one expense. `npm run db:deploy` on the dev database (owner said yes): "All migrations have been successfully applied."; `prisma migrate status`: "Database schema is up to date!".
**Works (verified on owner's machine):** `sh scripts/live-check-auth.sh`: 138 passed, 0 failed (6 new loan key checks).
**Stubbed:** nothing. No loan list (5.6).
**Tests:** +51 (`loans.test.ts` 44 to 73, `loans-routes.test.ts` 22 to 28, `loans-contract.ts` +8 per adapter). Total 1293.
**Not verified:** no break-on-purpose run yet (5.4d). The parallel case ran on SQLite only (A-121, A-162). The replay cost with many expenses is not measured (A-163).
**Found along the way:**
1. STATUS still said 5.4 was not committed and asked for its commit and push; `8e25efe` was already the head and `origin/main` pointed to it. Fixed.
2. The 5.4c migration only adds columns, so the table-rebuild gap A-160 does not apply to it.
3. `vitest list` shows one line per `it.each`; test counts in TRACEABILITY come from runs.
4. A full `npm run check` took 85.73 s, longer than the 39 to 66 s noted before. STATUS updated.
5. New: D-61, A-163. A-162 closed. The mirror needs D-61.

## Step 5.4 (size M), 2026-10-21: give a loan, `POST /loans` (D-59)

**Works (verified in this session):** `server/src/loans.ts` (`disburseLoan`, `loanOutstanding`, `isLoanActive`), `server/src/loans-routes.ts` (`POST /loans`), mounted in `app.ts`. Permission `loans.disburse`; Staff only for members they recorded (404 otherwise); Inactive member 409 `member_inactive`; active loan 409 `active_loan`; loan, one Loan expense and `loan.disbursed` in one transaction. `npm run check`: 41 files, 1242 passed, 0 failed, 62.36 s. Five parallel requests for one member on real SQLite: one loan, four `active_loan`.
**Works (verified on owner's machine):** `sh scripts/live-check-auth.sh`: 132 passed, 0 failed (12 new loan checks).
**Stubbed:** nothing. No idempotency key yet (5.4c, D-60). No loan list (5.6).
**Tests:** +66 (`loans.test.ts` 44, `loans-routes.test.ts` 22). Total 1242.
**Not verified:** no break-on-purpose run yet (5.4d, after 5.4c). The parallel case ran on SQLite only (A-162).
**Found along the way:**
1. First `npm run check` failed: "Hook timed out in 10000ms" in the new Prisma `beforeAll` of `loans.test.ts` (building the temporary database under full load). Fixed with a 120 s hook timeout, as `prisma-store.test.ts` has. Second run passed.
2. `npm run db:deploy` (owner asked): "No pending migrations to apply"; `prisma migrate status`: "Database schema is up to date!". STATUS had said the dev database lacked the 5.3b migration. Fixed; A-159 confirmed.
3. STATUS still asked for the 5.3c commit and push; `0a226f4` was already on `origin/main`. Fixed.
4. TRACEABILITY R-32 said `payments-routes.test.ts` has 21 tests; a run gives 20 (the GET route-absence test went at 4.8). Fixed. `vitest list` shows 18 lines because an `it.each` is one line there.
5. Owner decided: idempotency key on `POST /loans` at 5.4c, then one break-on-purpose run for 5.4 and 5.4c (D-60). New: D-59, D-60, A-161, A-162. The mirror needs D-59 and D-60.

## Step 5.3c (size S), 2026-10-21: break-on-purpose for the loans store, the loan links and their migrations

**Works (verified in this session):** script `~/Desktop/mutate-5.3c.mjs` (not in git), modelled on `mutate-5.2b.mjs`. Baselines 133 passed (`memory-store.test.ts`) and 145 passed (`prisma-store.test.ts`, `db.test.ts`). 59 mutations: LM1 to LM15 (memory loans store), KM1 to KM6 (memory loan checks and `loanId` on payment lines and expenses), LP1 to LP11 (Prisma loans store), KP1 to KP8 (Prisma `requireLoans`, line `loanId`, check order), EL1 to EL7 (loans migration), EK1 to EK7 (loan links migration), C1 to C5 (`schema.prisma`, with generate and typecheck). Result: 58 caught, 1 escaped (EK7), 0 errors, 0 timeouts, 0 not applied. "files restored: yes"; `git status --short` empty. `npm run check` afterwards: 39 files, 1176 passed, 0 failed, 61.23 s.
**Escaped:** EK7 (the `INSERT INTO "new_Expense"` row copy in `20261021150000_loan_links` leaves out `loanId`). Test gap (A-160): every test database is empty when the migrations run, so the drift test sees the shape only, not the copied rows.
**Stubbed:** nothing. No source or test change.
**Not verified:** whether the dev database has any expense with a loan id (not read; the dev database was not touched).
**Found along the way:**
1. STATUS said 5.3b was "Not committed yet". It is commit `69da21d`, and `origin/main` matched it at the start of this step. Fixed.
2. Three find texts in the first draft of the script had the wrong indent. A pre-run match check found them; fixed before the run.
3. New: A-160. No new decision.

## Step 5.3b (size M), 2026-10-21: loan links on payment lines and expenses (D-58)

**Works (verified in this session):** `PaymentLine.loanId` (nullable, index) and the `Expense.loanId` foreign key, both to `Loan` with `onDelete: Restrict`; back relations `repayments` and `expense` on `Loan`. Migration `20261021150000_loan_links` (SQL from `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against a temporary database built by `migrate deploy`; dev database not touched). `UnknownLoanError`, `PaymentLineRecord.loanId` and an optional `loanId` on `NewPayment` lines in `store.ts`; both adapters read the loan before the insert. Contracts: payments +3 cases (line keeps its loan, unknown loan saves nothing, member and creator checked first); expenses use real loans and +2 cases (unknown loan, creator before loan). `db.test.ts` +3 (line and expense with an unknown loan give P2003; a loan with a line or an expense cannot be deleted). `npm run check`: 39 files, 1176 passed, 0 failed, 51.80 s.
**Stubbed:** nothing. No route sets `loanId` yet (5.4, 5.5). `PaymentView` does not show it.
**Tests:** +13 (5 per adapter, 3 database). Total 1176. The drift test passes with the new migration.
**Not verified:** no break-on-purpose run yet (5.3c). The dev database does not have the new migration until `npm run db:deploy` runs (A-159).
**Found along the way:**
1. Owner confirmed 5.3 was pushed and `db:deploy` ran after 5.3. STATUS had still said "Not committed yet".
2. `DATA_MODEL.md` had a blank line that split the tables table. Fixed.
3. New: D-58, A-158, A-159. A-151 closed. The mirror needs D-58.

## Step 5.3 (size M), 2026-10-21: loan table and store (D-57)

**Works (verified in this session):** `Loan` model in `schema.prisma` (relations to `Member` and `User`, `onDelete: Restrict`, indexes on `memberId` and `createdById`) and migration `20261021120000_loans` (SQL from `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against a temporary database built by `migrate deploy`; dev database not touched). `LoanRecord`, `NewLoan` and `LoanStore` (`create`, `findById`, `listByMember`) in `store.ts`, both adapters; the memory transaction snapshot copies loans. New `test/helpers/loans-contract.ts`, 11 cases per adapter, including a rollback case that saves a loan first (the M16 lesson). Hand-built stores in `auth.test.ts` (4), `sessions.test.ts` (3), `auth-routes.test.ts` (1) gained `loans` (owner approved). `npm run check`: 39 files, 1163 passed, 0 failed, 56.16 s.
**Stubbed:** nothing. No route uses the store.
**Tests:** +22 (11 per adapter). Total 1163. The drift test passes with the new migration.
**Not verified:** no break-on-purpose run yet (5.3c). The dev database does not have the `Loan` table until `npm run db:deploy` runs.
**Found along the way:**
1. Split: `PaymentLine.loanId` and the `Expense.loanId` foreign key moved to 5.3b, because each needs a store check so both adapters refuse an unknown loan alike, and the expenses contract must then use real loans (owner approved, A-157). PHASE_PLAN and A-151 updated.
2. `DATA_MODEL.md` was stuck at step 4.5 (no Expense row). Fixed now, with the Loan row.
3. TRACEABILITY R-10 said 11 expense cases per adapter; there are 12 since 5.2c. Fixed.
4. New: D-57, A-156, A-157. The mirror needs D-57.

## Step 5.2c (size S), 2026-10-21: test closes the M16 gap (A-155)

**Works (verified in this session):** one new case in `server/test/helpers/expenses-contract.ts`, "keeps the expenses saved before a transaction that throws": save one expense, then a transaction saves a second and throws; the list must hold only the first. No source change. `npm run check`: 39 files, 1141 passed, 0 failed, 59.10 s. Test committed first (`ad320e0`, owner approved), because the script needs a clean tree. Rerun of `node ~/Desktop/mutate-5.2b.mjs`: baselines 117 and 126; 45 mutations, 44 caught, 1 escaped (P3, unreachable, A-154), 0 errors, 0 timeouts, 0 not applied; M16 caught by the new case, M17 by both rollback cases; "files restored: yes"; `git status --short` empty.
**Stubbed:** nothing.
**Tests:** +2 (one per adapter). Total 1141.
**Not verified:** whether the other tables' rollback tests have the same blind spot (no rows before the transaction). The live check was not run (no route uses expenses; still 120 from 4.8).
**Found along the way:**
1. STATUS said `1d2e10f` was not pushed and the 5.2b commit was waiting for approval. `git status -sb` showed `main...origin/main` with `c5f4a38` on top, so both were already pushed. Fixed in STATUS.
2. There is no `mirror/` folder in the repo, so whether the mirror has D-52 to D-56 cannot be checked from here.
3. No decision in this step, so DECISIONS and the mirror are unchanged.

## Step 5.2b (size S), 2026-10-21: break-on-purpose for the expenses store and migration (A-154, A-155)

**Works (verified in this session):** script `~/Desktop/mutate-5.2b.mjs` (not in git), from the repo root. M1 to M17 change `memory-store.ts` (tests `memory-store.test.ts`); P1 to P14 change `prisma-store.ts`, E1 to E9 the migration SQL, C1 to C5 `schema.prisma` (tests `prisma-store.test.ts` and `db.test.ts`; C runs `prisma generate` and the typecheck first). Dry run first: every find text matched once. Baselines 116 and 125 passed. Result: 45 mutations, 43 caught, 2 escaped (M16, P3), 0 errors, 0 timeouts, 0 not applied; "files restored: yes"; `git status --short` empty. The drift test caught all of E1 to E9 and C1, C3 to C5; C2 also failed the typecheck (4 errors). `npm run check` afterwards: 39 files, 1139 passed, 0 failed, 58.86 s.
**Stubbed:** nothing.
**Tests:** none added (1139).
**Not verified:** the source mutations ran the tests only, not the typecheck. The live check was not run (no route uses expenses; still 120 from 4.8).
**Found along the way:**
1. M16 (the transaction snapshot keeps the live expense array, so a rollback would wipe every earlier expense) escaped: the rollback test starts with no expenses. Test gap, A-155, for step 5.2c. The same blind spot in the other tables' rollback tests is not checked.
2. P3 (the P2003 mapping removed) escaped: unreachable, because the creator is read first and users are never deleted (A-154).
3. Stale lines from 5.2: after `1d2e10f`, Claude Code ran `npm run db:deploy` at the owner's request ("All migrations have been successfully applied."), so the dev database has the `Expense` table. The 5.2 "Not verified" line about it is out of date; STATUS is fixed. This comes from the earlier session and was not rechecked here.
4. No decision in this step, so DECISIONS and the mirror are unchanged.

## Step 5.2 (size M), 2026-10-21: expense table and store (D-55)

**Works (verified in this session):** `Expense` model in `schema.prisma` and migration `20261021090000_expenses` (SQL from `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against a temporary database built by `migrate deploy`; dev database not touched). `ExpenseStore` (`create`, `findById`, `list`) and `DuplicateExpenseLoanError` in `store.ts`, both adapters. New `test/helpers/expenses-contract.ts`, 11 cases per adapter. Hand-built stores in `auth.test.ts` (4), `sessions.test.ts` (3), `auth-routes.test.ts` (1) gained `expenses` (owner approved). Comment in `prisma-store.ts` now cites A-121. `npm run check` (after 5.1b): 39 files, 1139 passed, 0 failed, twice.
**Stubbed:** nothing. No route uses the store.
**Tests:** +22 (11 per adapter). The drift test passes with the new migration.
**Not verified:** no break-on-purpose run yet (planned as the next step). The dev database does not have the table until the owner runs `npm run db:deploy`.
**Found along the way:** the first `npm run check` failed one start-up test (exit 143). Cause found and fixed in 5.1b before any docs.

## Step 5.1b (size S), 2026-10-21: clean stop without the tsx wrapper (D-56, A-153)

**Works (verified in this session):** `npm start` is now `node --import tsx src/server.ts`; `server-start.test.ts` starts the server the same way and has a new test: server paused 200 ms after SIGTERM still exits 0. Cause read from `tsx` 4.23.15 (`dist/cli.mjs`: 30 ms wait, then SIGKILL and exit 143). Reproduced first: paused 200 ms under `tsx` gave 143 twice; under `node --import tsx` 0 three times (0, 200, 2000 ms). Reverse check: with the old `tsx` start put back for a moment, the new test failed (1 failed, 5 passed); file restored (`cmp` identical). `npm run check`: 39 files, 1139 passed, 0 failed, run twice. `pgrep -fl src/server.ts` empty after each run.
**Not verified:** the tsx docs (TLS certificate error fetching tsx.is). `npm start` itself was not run (it uses the owner's `.env`). `npm run dev` still uses the `tsx` command. Windows not tried.

## Step 5.1 (size S), 2026-10-21: expense categories (DR-11, A-148)

**Works (verified in this session):** new `server/src/expense-categories.ts` holds one table of the 10 DR-11 categories in order, with a `systemOnly` flag (Loan, Membership Withdrawal). Exports: `EXPENSE_CATEGORIES`, `MANUAL_EXPENSE_CATEGORIES` (8), `SYSTEM_ONLY_EXPENSE_CATEGORIES` (2), all frozen; `isExpenseCategory`, `isSystemOnlyExpenseCategory`, `parseManualExpenseCategory` (throws `CategoryError` from `categories.ts`: `unknown`, then `system_only`). `npm run check`: 39 files, 1116 passed, 0 failed, 61.91 s.
**Stubbed:** nothing. No route, table or store uses it yet.
**Tests:** `test/expense-categories.test.ts` (13). Total 1116.
**Not verified:** no break-on-purpose run (not money, security or data-loss code). The "Others" narration rule is not in this module; it comes with the expense input checks (5.7).
**Found along the way:** STATUS still asked to approve and push the 5.0 commit, which was already pushed (`main...origin/main`). Fixed in STATUS.

## Step 5.0 (size S), 2026-10-21: Phase 5 loans and expenses plan (D-54)

**Works (verified in this session):** planning only, no code. Read DR-08 to DR-12, D-02, D-03, D-10, D-17, D-44, OQ-08, `schema.prisma`, `store.ts`, `permissions.ts`, and the prototype's loan code (`legacy-prototype/src/App.jsx` lines 118 to 160, `PRODUCTION_SCHEMA_AND_API.md`). Owner approved the plan and chose `loans.disburse` for giving a loan (A-149). `npm run check` before the docs: 38 files, 1103 passed, 0 failed, 67.78 s.
**Stubbed:** nothing.
**Tests:** none new (1103).
**Not verified:** nothing built; the plan's tables and rules are untested until 5.2 to 5.9.
**Found along the way:**
1. Conflict: the prototype stores `amountRepaid` and `outstanding` on a loan; D-17 forbids stored balances. D-17 wins (A-144).
2. The Loan Repaid effect (R-07, DR-09) moves from Phase 4 to step 5.5.
3. New: D-54, A-144 to A-149, OQ-16. The mirror needs D-54.

## Step 4.13b (size S), 2026-10-21: tests close the database schema gaps (A-143)

**Works (verified in this session):** 4 new tests in `server/test/db.test.ts`, no source change. (1) Drift test: the temporary database built by `prisma migrate deploy` is compared with `schema.prisma` by `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`; it must exit 0 (flags and exit codes from the installed Prisma 7.10.0 CLI help: empty 0, error 1, not empty 2). It runs first in the file, because the A-03 test adds a table. (2) A payment with an unknown member gives P2003. (3) A payment with an unknown creator gives P2003. (4) Two lines with the same position in one payment give P2002. The file alone: 11 passed, 6.83 s. `npm run check`: 38 files, 1103 passed, 0 failed, 66.03 s; no typecheck or lint error in the output. Tests committed first (`d64e7b2`, owner approved). Rerun of `node ~/Desktop/mutate-4.13.mjs`: baseline 114 passed; 24 mutations, 24 caught, 0 escaped, 0 error, 0 timeout, 0 not applied; "files restored: yes"; `git status --short` empty.
**Stubbed:** nothing new.
**Tests:** 4 new (1103 - 1099).
**Not verified:** the drift test on Windows. The live check was not run (no source change; still 120 from 4.8).
**Found along the way:**
1. The shadow database page (https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/shadow-database) says `migrate diff --from-migrations` needs a shadow database. The test avoids it: the migrations are applied to a temporary file and that file is diffed (A-143).
2. Prediction held and went further: the drift test alone catches every D and C mutation, including the six "equivalent" ones of 4.13 (D5 to D9, D12, D15, C5).
3. No decision in this step, so DECISIONS and the mirror are unchanged.
4. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.13 (size M), 2026-10-20: break-on-purpose for step 1.4, the database schema (A-143)

**Works (verified in this session):** Pre-check found that the test databases are built by `prisma migrate deploy` from the migration SQL, not from `schema.prisma`, which only shapes the generated client. Owner approved the method: mutate the migration SQL (D1 to D19) and `schema.prisma` (C1 to C5; each runs `prisma generate`, the typecheck and the tests). Script `~/Desktop/mutate-4.13.mjs` (not in git), tests `db.test.ts` and `prisma-store.test.ts`. Baseline 110 passed (15.6 s alone). Result: 24 mutations, 12 caught, 12 escaped, 0 errors; "files restored: yes"; `git status --short` empty. Caught: D1 (email unique), D2 and D3 (audit actor key and RESTRICT), D4 (token hash unique), D10 (member number unique), D11 (member creator key), D17 (idempotency unique), D18 and D19 (money columns as REAL: the exact-amount test fails), C1 and C2 (typecheck and tests), C4 (role default in the schema: the client sends it, so the db test fails). Escaped: D5, D6, D7, D8, D9, D12, D13, D14, D15, D16, C3, C5. `npm run check` afterwards: 38 files, 1099 passed, 0 failed, 55.43 s; no typecheck or lint error in the output. No source file changed; no leftover process.
**Stubbed:** nothing new.
**Tests:** none added (1099).
**Not verified:** that the client sends the schema default for `failedLoginCount`, `isActive` and `status` as it does for `role` (C4 shows it for `role` only; D6, D9, D12 are equivalent by that inference). The live check was not run (no source change; still 120 from 4.8).
**Found along the way:**
1. Drift gap (C3): `schema.prisma` can lose the idempotency unique rule and nothing fails, because the database still gets it from the migration. The next `prisma migrate dev` would then write a migration that drops the index and the race guard of A-121. A drift test would catch C3 and C5, and, I believe, every D mutation (inference, not run).
2. D13, D14: the payment store reads the member and the creator before it writes (A-102), so the store tests never reach the foreign keys. D16: the code numbers the lines itself. These rules are only pinned by the database, and no test checks them there.
3. A-03 is now confirmed: D18 and D19 show the exact-amount test reads real BigInt money columns.
4. No decision in this step, so DECISIONS and the mirror are unchanged.

## Step 4.12c (size S), 2026-10-20: server-start tests: process clean-up, SIGINT and dotenv (A-142)

**Works (verified in this session):** `server/test/server-start.test.ts` changed. Each child is started `detached`, so it leads its own process group, and after each test the whole group is killed (before, only the `tsx` wrapper was killed and the real server kept running). Two new tests: SIGINT (Ctrl+C) stops the server with exit code 0; the server loads `TOKEN_SECRET`, `DATABASE_URL` and `PORT` from a temporary dotenv file named in `DOTENV_PATH` (those three are removed from the child's environment; `DOTENV_PATH` is the name in the dotenv 18.0.7 README, `DOTENV_CONFIG_PATH` is its older fallback). No source file changed. The file alone: 5 passed, 6.52 s. `npm run check`: 38 files, 1099 passed, 0 failed, 54.83 s; no typecheck or lint error in the output. `pgrep -fl src/server.ts` found nothing after either run. Tests committed first (`c5fdc98`, owner approved). Rerun of `node ~/Desktop/mutate-4.12b.mjs`: baseline 5 passed; 15 mutations, 12 caught, 3 escaped (V3, V12, V14, equivalent); "file restored: yes"; `git status --short` empty; no `server.ts` process and no temporary folder left.
**Stubbed:** nothing new.
**Tests:** 2 new (1099 - 1097).
**Not verified:** the tests on Windows (process groups work differently there; A-141). The live check was not run (no source change; still 120 from 4.8).
**Found along the way:**
1. Predictions held: 12 caught, V3, V12, V14 escaped, nothing left running.
2. All owed break-on-purpose runs from Phase 2 are now done except step 1.4 (the database schema). The real Prisma engine runs on this machine now, so 1.4 can be done.
3. No decision in this step, so DECISIONS and the mirror are unchanged.
4. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.12b (size S), 2026-10-20: break-on-purpose for server.ts (owed from 2.4b)

**Works (verified in this session):** new throwaway script `~/Desktop/mutate-4.12b.mjs` (not in git). It changes `server/src/server.ts` one mutation at a time, runs `server-start.test.ts`, and restores the file. No mutation made the server ignore `DATABASE_URL`. Baseline 3 passed. Result: 15 mutations, 10 caught, 5 escaped (V3, V12, V13, V14, V15), 0 error, 0 timeout, 0 not applied. "file restored: yes". `git status --short` empty after.
- Caught: V1, V2, V4 to V11 (bad secret exit code and message, unchecked secret, PORT, port-in-use exit code, message and return, listening message, SIGTERM handler, stop exit code).
- Escaped, equivalent (A-142): V3, V12, V14.
- Escaped, test gaps (A-142): V13 (SIGINT, the Ctrl+C stop), V15 (dotenv not loaded).
**Stubbed:** nothing new.
**Tests:** none new. Total 1097.
**Not verified:** whether `DOTENV_CONFIG_PATH` works with the pinned dotenv 18.0.7 (to check at 4.12c).
**Found along the way:**
1. After the run, 3 `src/server.ts` processes were still listening on high ports (started 21:57:23, 21:57:53, 21:58:37; parent PID 1). Cause: when a test fails, `server-start.test.ts` kills only the `tsx` wrapper, and the real server under it keeps running. They had fake secrets and their temporary folders were already deleted. I stopped them with `kill`; `pgrep` then found none. The test file needs fixing (4.12c).
2. Predictions held: V3, V12, V13, V14, V15 escaped as I said.
3. No decision in this step, so DECISIONS and the mirror are unchanged.
4. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.12 (size M), 2026-10-20: start-up tests for server.ts

**Works (verified in this session):** new `server/test/server-start.test.ts` with 3 tests that start `src/server.ts` as a child process with a fake secret, a temporary database file and a free port: (1) an empty `TOKEN_SECRET` prints the "Set TOKEN_SECRET in server/.env." message, exits with code 1 and never listens; (2) a good start prints "server listening on port N", answers 200 `{ status: "ok" }` on `/health`, and SIGTERM stops it with exit code 0; (3) a port already in use prints "Could not listen on port N" and exits with code 1. The file alone: 3 passed in 3.49 s. `npm run check`: typecheck and lint clean, 38 files, 1097 passed, 0 failed, 52.14 s. No source file changed. `dev.db` kept its 20:46 time; no temporary folder was left behind.
**Stubbed:** nothing new.
**Tests:** 3 new (1097 - 1094).
**Not verified:** the stop test on Windows (A-141). The live check was not run (no source change; still 120 from 4.8).
**Found along the way:**
1. The usual break-on-purpose method could not work for `server.ts` because no test started it; this step adds that test first (method approved by the owner). The mutation run is 4.12b.
2. My estimate of 5 to 10 seconds extra was high: the new file takes about 3.5 s, and the full run was 52.14 s.
3. No decision in this step (A-141 records the method), so DECISIONS and the mirror are unchanged.
4. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.11b (size S), 2026-10-20: tests close the auth route gaps (A-140)

**Works (verified in this session, Claude ran it on the owner's machine):** one new test in `server/test/auth-routes.test.ts` (a user who is inactive when read by id, but not by email, gets 401 `invalid_credentials`, not 500) and one in `server/test/account-routes.test.ts` (a lock from wrong current passwords ends after 15 minutes of app time). No source file changed. `npm run check`: typecheck and lint clean, 37 files, 1094 passed, 0 failed, 61.13 s. Tests committed first (`6b5f063`, owner approved). Rerun of `node ~/Desktop/mutate-4.11.mjs`: baseline 45 passed; 22 mutations, 22 caught, 0 escaped, 0 error, 0 timeout, 0 not applied; "file restored: yes"; `git status --short` empty after.
**Stubbed:** nothing new.
**Tests:** 2 new (1094 - 1092).
**Not verified:** the live check was not run (no source change; still 120 from 4.8).
**Found along the way:**
1. Prediction held: 22 of 22 caught.
2. No decision in this step, so DECISIONS and the mirror are unchanged.
3. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.11 (size S), 2026-10-20: break-on-purpose for auth-routes.ts (owed from 2.4a)

**Works (verified in this session, Claude ran it on the owner's machine):** new throwaway script `~/Desktop/mutate-4.11.mjs` (not in git). It changes `server/src/auth-routes.ts` one mutation at a time, runs `auth-routes.test.ts`, `account-routes.test.ts` and `auth-me.test.ts`, and restores the file. Baseline 43 passed. Result: 22 mutations, 20 caught, 2 escaped (R5, R19), 0 error, 0 timeout, 0 not applied. "file restored: yes". `git status --short` empty after.
- Caught: R1 to R4, R6 to R18, R20 to R22 (no-store header, login status and body, reply fields, token and expiry fields, app clock on login and refresh, refresh status and userId, logout always 204 and really signs out, the guards on `/password` and `/me`, password status codes and reason, `/me` permissions and user).
- Escaped, test gaps (A-140): R5 (`SessionError` on login not caught: a race would give 500), R19 (password change on the real clock).
**Stubbed:** nothing new.
**Tests:** none new. Total 1092. `npm run check` not rerun: no repo file changed.
**Not verified:** nothing else.
**Found along the way:**
1. Predictions: I said R15 and R20 (the `requireAuth` guards) would escape because the handler checks too. Wrong: the handler only reads what `requireAuth` set, so without the guard every request gets 401 and the tests fail. R5 escaped as I said, but it is a test gap, not equivalent: a race can reach it. R19 escaped; I listed it as possible.
2. No decision in this step, so DECISIONS and the mirror are unchanged.
3. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.10b (size S), 2026-10-20: tests close the lockout gaps (A-139)

**Works (verified in this session, Claude ran it on the owner's machine):** one new test in `server/test/auth.test.ts` (an inactive user's failure count is kept when the right password is typed) and one stronger check in `server/test/lockout.test.ts` (`account.locked` detail is `failures=5`). No source file changed. `npm run check`: typecheck and lint clean, 37 files, 1092 passed, 0 failed, 53.65 s. Tests committed first (`a3d2fd1`, owner approved). Rerun of `node ~/Desktop/mutate-4.10.mjs`: baseline 148 passed; 23 mutations, 23 caught, 0 escaped, 0 error, 0 timeout, 0 not applied; "file restored: yes"; `git status --short` empty after.
**Stubbed:** nothing new.
**Tests:** 1 new (1092 - 1091), 1 existing test made stricter.
**Not verified:** the Prisma store's lockout methods were not mutated (see 4.10). The live check was not run (no source change; still 120 from 4.8).
**Found along the way:**
1. Prediction held: 23 of 23 caught.
2. No decision in this step, so DECISIONS and the mirror are unchanged.
3. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.10 (size S), 2026-10-20: break-on-purpose for the sign-in lockout (owed from 2.3e)

**Works (verified in this session, Claude ran it on the owner's machine):** new throwaway script `~/Desktop/mutate-4.10.mjs` (not in git). It changes the lockout parts of `server/src/auth.ts` and the lockout methods of `server/src/memory-store.ts` one mutation at a time, runs `lockout.test.ts`, `auth.test.ts` and `memory-store.test.ts`, and restores the file. Baseline 147 passed. Result: 23 mutations, 21 caught, 2 escaped (A10, A15), 0 error, 0 timeout, 0 not applied. "file restored: yes". `git status --short` empty after.
- Caught: A1 to A9, A11 to A14 (limit, lock end boundary, locked user refused, hash checked while locked, locked reason, counting, lock length, `account.locked` written once, count reset on success, inactive refused, dummy hash for an unknown email), M1 to M8 (expired lock cleared, `<=`, no counting while locked, `>=`, lock length, `clearLockout`, `getLockout`, unknown user).
- Escaped, test gaps (A-139): A10 (`account.locked` detail not checked), A15 (failure count cleared before the inactive check).
**Stubbed:** nothing new.
**Tests:** none new. Total 1091. `npm run check` not rerun: no repo file changed.
**Not verified:** the Prisma store's lockout methods were not mutated (its test file is slow; it shares the lockout contract with the memory store).
**Found along the way:**
1. Predictions: A10 and A15 escaped as I said. A14 (dummy hash) was caught, which I did not expect.
2. My first background start failed: I sent the output to my scratchpad folder, which did not exist. Node never ran, and nothing changed. The second start is the result above.
3. No decision in this step, so DECISIONS and the mirror are unchanged.
4. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.9b (size S), 2026-10-20: tests close the sessions.ts gaps (A-138)

**Works (verified in this session, Claude ran it on the owner's machine):** 3 new tests in `server/test/sessions.test.ts`. No source file changed. `npm run check`: typecheck and lint clean, 37 files, 1091 passed, 0 failed, 50.79 s. Tests committed first (`00b2c50`, owner approved) because the script needs a clean tree. Rerun of `node ~/Desktop/mutate-4.9.mjs`: baseline 66 passed; 32 mutations, 23 caught, 9 escaped (S1, S2, S3, S11, S13, S17, S19, S20, S27, all equivalent, A-137); "file restored: yes"; `git status --short` empty after.
- S8 caught (1 failed): `REFRESH_TOKEN_SECONDS` is 604 800 (A-38).
- S10 caught (1 failed): a bad secret on refresh throws `TokenConfigError`, the token stays unused and still works with the right secret.
- S26 caught (1 failed): sign-out with an invalid date throws `TokenConfigError`, revokes nothing, writes no audit entry.
**Stubbed:** nothing new.
**Tests:** 3 new (1091 - 1088). `sessions.test.ts` now has 41.
**Not verified:** S3 on Prisma (A-137). The live check was not run (no source change; still 120 from 4.8).
**Found along the way:**
1. My 4.9 note that S10 "may be a real weakness" was wrong. The S10 test passed on the current code before any change: the secret is checked first, so a bad secret does not burn a token today. A-138 is corrected.
2. Prediction held: 23 caught, 9 escaped.
3. No decision in this step, so DECISIONS and the mirror are unchanged.
4. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.9 (size S), 2026-10-20: break-on-purpose for sessions.ts (owed from 2.3d)

**Works (verified in this session, Claude ran it on the owner's machine):** new throwaway script `~/Desktop/mutate-4.9.mjs` (not in git, built from the 4.8b script). It changes `server/src/sessions.ts` one mutation at a time, runs `sessions.test.ts` and `auth-routes.test.ts`, and restores the file. Baseline 63 passed. Result: 32 mutations, 20 caught, 12 escaped, 0 error, 0 timeout, 0 not applied. "file restored: yes". `git status --short` empty before and after.
- Caught: S4 to S7, S9, S12, S14 to S16, S18, S21 to S25, S28 to S32 (inactive user, fixed family, token stored instead of hash, access expiry, stored refresh expiry, unknown token, reuse revoke and audit and order, inactive user on refresh, consume result, rotation family, sign-out checks, revoke scope, audit and return value).
- Escaped, equivalent (A-137): S1, S2, S3, S11, S13, S17, S19, S20, S27.
- Escaped, test gaps (A-138): S8 (7-day life not pinned), S10 (bad secret on refresh burns the token), S26 (sign-out with an invalid date).
**Stubbed:** nothing new.
**Tests:** none new. Total 1088. `npm run check` not rerun: no repo file changed.
**Not verified:** S3 on Prisma (a non-text user id). The Prisma `consume` was read, not run, for S13, S17, S19, S20.
**Found along the way:**
1. Predictions: I listed S2, S3, S8, S9, S10, S11, S13, S17, S26, S27 as possible escapes. S9 was caught. I did not predict S1, S19 and S20; they escape because `createAccessToken` checks the secret and `consume` checks expiry.
2. The owner restored all the Desktop scripts before this step (A-136 closed).
3. No decision in this step, so DECISIONS and the mirror are unchanged.
4. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.8b (size S), 2026-10-20: break-on-purpose for listPayments and GET /payments

**Works (verified in this session, Claude ran it on the owner's machine):** new throwaway script `~/Desktop/mutate-4.8b.mjs` (not in git). It changes `payments.ts` or `payments-routes.ts` one mutation at a time, runs `payments-list.test.ts` and `payments-routes.test.ts`, and restores the file. Baseline 41 passed. Result: 23 mutations, 22 caught, 1 escaped (R1), 0 error, 0 timeout, 0 not applied. "file restored: yes". `git status --short` empty after.
- Caught: L1 to L18 (permission removed or changed, memberId checks and codes, unknown member, visibility removed, `||`, Super Admin as Staff, wrong owner field, forbidden instead of not_found, newest first, wrong Membership ID, own payments only (A-133 reversed), empty list, first payment only), R2 to R5 (query field, reply key, 201, failure answered 200).
- Escaped: R1 (route guard removed): equivalent, the logic gives the same 403 (A-135).
- Thin: L6, L8, L11, L14, L15, L18, R3 and R4 are each caught by one test only.
**Stubbed:** nothing new.
**Tests:** none new. Total 1088 (from 4.8). `npm run check` not rerun: no repo file changed.
**Not verified:** the Prisma path through `listPayments` (live check only, 120 at 4.8).
**Found along the way:**
1. First run: L5, L6 and L7 were "not applied" because their find text is also in `createPayment`. I anchored them on the line before and fixed the failed count (it added failed files to failed tests). The second run is the result above. No repo file changed either time.
2. The earlier break-on-purpose scripts are gone from the Desktop (A-136). `mirror/` there was updated at 20:47 (DECISIONS.md).
3. No decision in this step, so DECISIONS and the mirror are unchanged.
4. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.

## Step 4.8 (size M), 2026-10-20: GET /payments lists one member's payments

**Works (`npm run check` verified in this session: typecheck and lint clean, 37 files, 1088 passed, 0 failed, 50.53 s. Live check verified on your machine, output pasted: "120 passed, 0 failed"):** `listPayments` in `server/src/payments.ts` and `GET /payments?memberId=<id>` in `payments-routes.ts`. It needs `payments.view` and answers 200 `{ payments: [...] }`, oldest first, in the same shape as a recorded payment. 400 `missing_member_id` or `invalid_member_id` (empty, not text, or repeated). 404 for an unknown member or one Staff may not see. Staff see every payment of a member they recorded (A-133). Inactive members' payments are listed. No audit entry, no paging (A-134). Decision D-52.
**Stubbed:** no screen. No single-payment read, edit or delete route. No paging.
**Tests:** 21 new in `test/payments-list.test.ts` (15 logic, 6 route). One removed: the `get /payments` case of "routes that do not exist" in `payments-routes.test.ts`. 1068 + 21 - 1 = 1088. Live check gains 11 checks (109 to 120).
**Not verified:** break-on-purpose for `listPayments` and the route (owed, step 4.8b). The Prisma path through `listPayments` (live check only).
**Found along the way:**
1. The first `npm run check` failed: 1 failed, 1088 passed. The old 4.4 test pinned that `GET /payments` does not exist; the new route answered 400 instead of 404. You approved removing that one case and renaming the test; the rerun passed.
2. Your server paste shows the shell prompt after "server listening", so the server was stopped before the paste. The live check had already passed with it running.
3. `mirror/DECISIONS.md` needs D-52 by hand.
4. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed. The file was not touched.

## Step 4.7c (size S), 2026-10-20: tests close the payment-sms gaps (A-131)

**Works (verified in this session, Claude ran it on the owner's machine):** 7 new tests in `server/test/payment-sms.test.ts`. No source file changed. `npm run check`: typecheck and lint clean, 36 files, 1068 passed, 0 failed, duration 54.18 s. Tests committed first (`2be3ed5`) because `mutate-4.7b.mjs` needs a clean tree (owner approved). Rerun of `node ~/Desktop/mutate-4.7b.mjs` from the repo root: baseline 86 passed; 27 mutations, 26 caught, 1 escaped (S15), 0 error, 0 timeout, 0 not applied; "file restored: yes"; `git status --short` empty after.
- S13 caught (3 failed): exact failure result with no `sms` key, for an unknown member, an Inactive member, and an Inactive member with `sendSms: false`.
- S16 caught (2 failed), S17 caught (1 failed): a spy provider is not called for an empty or a spaces-only phone.
- S20 caught (2 failed): the provider's reason `invalid_number` or `invalid_message` comes back unchanged.
- S15 still escapes: equivalent (A-130).
**Stubbed:** nothing new. Fake provider only. No Twilio adapter. No screen. A "Loan Repaid" line still changes no loan (DR-09). No payment list route.
**Tests:** 7 new (1068 - 1061). `payment-sms.test.ts` now has 33.
**Not verified:** the live check was not run (no route or source change; still 109 from 4.7).
**Found along the way:**
1. Predictions held: 26 caught, only S15 escaped. I predicted "about 4 tests"; there are 7, because each gap got its cases as a table.
2. I read `payments.ts`. S13 was a test gap as A-131 said; the "not seen" note is removed.
3. My first run was from `server/`; the script needs the repo root. It also refused a dirty tree. Nothing changed either time.
4. No decision in this step, so DECISIONS and the mirror are unchanged.
5. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed.
6. A-132 check: in this step Claude Code asked before the commit and before the mutation script (which edits a source file for a moment). It ran `npm run check` without asking, as `CLAUDE.md` allows. It did not touch the dev database.

## Step 4.6c-setup (size S), 2026-10-20: Claude Code setup, D-51

**Works (verified on your machine, output pasted: `git status --short` showed ` M docs/DECISIONS.md` and `?? CLAUDE.md`; `tail` showed the end of D-51; Claude Code read `CLAUDE.md` and the docs and replied with the four required lines; I ran nothing in my sandbox):** `CLAUDE.md` in the repo root (working rules, step shape, what Claude Code may do alone and what it must ask first, commands, handoff). Decision D-51: work moves to Claude Code. It replaces D-09 (whole files pasted in chat) and the "owner pastes the output" part of D-37.
**Stubbed:** nothing. No code or test changed.
**Tests:** none new. Total 1061 (verified at 4.7).
**Not verified:** the Claude Code install command and version (A-132). Whether Claude Code keeps to the "ask first" rules in later steps. The first reply was not a test of that, because it only read files.
**Found along the way:**
1. Claude Code read `payments.ts` and `payment-sms.test.ts` and confirmed why S13 escaped. Without the early return in `recordPayment`, a refused payment goes on to `trySend`. `result.value` is undefined there, a TypeError is caught, and the reply gains `sms: failed, provider_error`. The old tests check only `r.ok`. This is a reading of the code, not a run. A-131 loses its "not seen" note at 4.7c.
2. My earlier BUILD_LOG entries say "I ran nothing in my sandbox". Under D-51 the label becomes "verified in this session" when Claude Code runs a command itself.
3. Claude Code printed "Allowed by auto mode classifier" beside a `cat` command. I do not know what that setting does. Check that auto mode does not let it commit or touch the database without asking.
4. `mirror/DECISIONS.md` needs D-51 by hand.
5. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed. The file was not touched.

## Step 4.7b (size S), 2026-10-20: break-on-purpose for payment-sms.ts

**Works (verified on your machine, output pasted; I ran nothing in my sandbox):** one throwaway script, `mutate-4.7b.mjs`, on your Desktop (not in git). It changes `payment-sms.ts` one mutation at a time, runs `payment-sms.test.ts`, `payments-routes.test.ts` and `payments-idempotency.test.ts`, and restores the file. Baseline 79 passed, 0 failed. Result: 27 mutations, 22 caught, 5 escaped, 0 error, 0 timeout, 0 not applied. "file restored: yes". `git status --short` printed nothing before and after. No source or test file changed, so the totals stay at 36 files, 1061 tests (verified at 4.7).
- Caught: S1 to S12, S14, S18, S19, S21 to S27 (permission check removed and inverted, sendSms check removed, missing and null sendSms, code and reason of the refusal, not_requested and skipped_repeat logic and labels, SMS never tried, wrong number, wrong body, provider result inverted, provider throw not caught, NGN dropped, member id in the text, wrong member lookup, empty phone reason).
- Escaped: S13, S15, S16, S17, S20.
  - S15 (member null guard removed): equivalent. A null member throws a TypeError inside the `try`, which gives the same `provider_error` (A-130).
  - S13 (early return on a failed payment removed): likely test gap. A failed payment would carry an extra `sms` key, and no test checks the exact failure result; the route ignores the key. I have not seen `payments.ts` (A-131).
  - S16 (empty phone guard removed): test gap. The fake refuses a blank number with the same reason, so "without calling the provider" is not pinned (A-131).
  - S17 (phone not trimmed): test gap, same cause as S16 (A-131).
  - S20 (provider failure reason replaced by `provider_error`): test gap. Every provider-failure test uses `provider_error` (A-131).
**Stubbed:** nothing new. Fake provider only. No Twilio adapter. No screen toggle. A "Loan Repaid" line still changes no loan (DR-09). No payment list route.
**Tests:** none new. Total 1061.
**Not verified:** why S13 escaped (read from the code shown, not run). How long the run took (not in the paste). The Prisma path through `recordPayment` (live check only). Everything about Twilio (A-125).
**Found along the way:**
1. Predictions: S15, S16, S17 and S20 escaped as I said. S13 I did not predict. S1 was caught by one test, as I said.
2. The 4.7 claim "without calling the provider" for an empty phone is true in the code but not pinned by a test.
3. The owed break-on-purpose run for `payment-sms.ts` is closed, except the gaps above. Still owed: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b).
4. No decision in this step, so DECISIONS and the mirror are unchanged.
5. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed. The file was not touched.

## Step 4.7 (size M), 2026-10-20: SMS wired into POST /payments

**Works (verified on your machine, output pasted: `npm run check` ended with 36 files, 1061 tests, 0 failed, duration 38.95 s; the sed edit applied (grep counts 1 and 1); live check "109 passed, 0 failed"; `git status --short` showed 5 `M` and 2 `??`; `lsof -i :3000` printed nothing; I ran nothing in my sandbox):** `server/src/payment-sms.ts` (`recordPayment`, `paymentSmsText`, `SmsOutcome`) wraps `createPayment`. `POST /payments` takes an optional boolean `sendSms` (missing means true). The payment is saved first. The reply is `{ payment, sms }` with `sms.status` `sent`, `failed` (with `reason`), `not_requested` or `skipped_repeat`. An SMS failure or a throw from the provider never undoes the payment (201 still). A repeat of a saved request sends nothing. A member with an empty phone gives `failed` with `invalid_number` without calling the provider. A `sendSms` that is not true or false gives 400 `invalid_send_sms`, nothing saved. `createApp` takes an optional `sms` provider (default `FakeSmsProvider`); `server.ts` passes a `FakeSmsProvider`. Decision D-50.
**Stubbed:** the provider is the fake, so no real text is sent and the live check cannot show the message. The message text is a placeholder (OQ-05). No screen toggle. No Twilio adapter. A "Loan Repaid" line still changes no loan (DR-09). No payment list route.
**Tests:** 26 new (1061 - 1035): `payment-sms.test.ts` 20 (logic) and 6 (route). Live check gains 4 checks (105 to 109).
**Not verified:** break-on-purpose for `payment-sms.ts` (not run). Typecheck and lint output (inferred from `check` reaching the tests; the paste was cut). The Prisma path through `recordPayment` is covered only by the live check. SMS character set and length rules (A-124, A-126). Everything about Twilio (A-125).
**Found along the way:**
1. My count error: I predicted 1062 tests and 27 new. The real numbers are 1061 and 26. The live check prediction (109) was right.
2. `payments-idempotency.test.ts` compared whole reply bodies on a repeat. The reply now carries `sms`, which differs between a first request and a repeat. The test now compares the payment only.
3. A repeat with another `sendSms` value is treated as a repeat (A-127): `sendSms` is not part of the request hash.
4. Vitest again suggests `isolate: false` (about 3.75 s faster). I changed nothing.
5. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed. The file was not touched.
6. `mirror/DECISIONS.md` needs D-50 by hand.

## Step 4.6 (size S), 2026-10-20: SMS provider interface and fake provider

**Works (verified on your machine, output pasted: `npm run check` ran typecheck and lint without errors and ended with 35 files, 1035 tests, 0 failed, duration 51.49 s; `git status --short` showed only `?? src/sms.ts` and `?? test/sms.test.ts`; I ran nothing in my sandbox):** `server/src/sms.ts`: `SmsProvider` (one method, `send`), `SmsMessage`, `SmsResult`, `SmsFailure` (`invalid_number`, `invalid_message`, `provider_error`) and `FakeSmsProvider`. The fake sends nothing: it keeps accepted messages in memory, gives ids `fake-1`, `fake-2`, and can fail the next valid send (`failNext`). Expected failures come back as `{ ok: false }`. Decision D-49.
**Stubbed:** nothing calls the module. No message text. No toggle on the payment form. No real provider (Twilio is chosen, the adapter is a later step).
**Tests:** 16 new in `test/sms.test.ts`. Total 1035 (was 1019).
**Not verified:** break-on-purpose (not run: no money, security or data-loss code). Everything about Twilio (A-125). Phone number format and message length rules (A-124).
**Found along the way:**
1. Your request for Twilio conflicted with D-07, D-08 and "Not now" in PROJECT_BRIEF. You chose option A: interface and fake now, real adapter later. Twilio is recorded as the chosen provider in D-49. OQ-05 is half answered: the provider is known, the message text is not.
2. Predictions matched: 35 files, 1035 tests, 16 new, two untracked files.
3. Typecheck and lint output was pasted in full this time, so they are now verified, not inferred.
4. Vitest again suggests `isolate: false` (about 5.2 s faster). I changed nothing.
5. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed. The file was not touched.
6. `mirror/DECISIONS.md` needs D-49 by hand.

## Step 4.5c (size S), 2026-10-20: close the K15 and M8 test gaps

**Works (verified on your machine, output pasted: grep counts 1 and 1; `npm run check` ended with 34 files, 1019 tests, 0 failed, duration 38.73 s; mutation rerun K15 baseline 32 passed then caught (1 failed, 31 passed), M8 baseline 7 passed then caught (1 failed, 6 passed), "file restored: yes" for both; `git status --short` showed only the two edited test files before and after; I ran nothing in my sandbox):** two additions, no source change. (1) `payments-idempotency.test.ts`: the same key with the same total and categories but another split of the amounts (10000, 5000, 5000 instead of 5000, 10000, 5000) gives `idempotency_conflict`, with one payment and one audit entry left (K15). (2) `payments-key-contract.ts`: a record from `findByKey` is changed (hash, total, lines, date) and the stored payment is read again unchanged (M8). The contract case runs on both adapters. A throwaway script, `mutate-4.5c.mjs`, on your Desktop (not in git), reruns K15 and M8 only.
**Stubbed:** nothing new. No key clean-up. No payment list route. No screen. A "Loan Repaid" line still changes no loan (DR-09).
**Tests:** 3 new (1019 - 1016): 1 logic test, 1 contract case x 2 adapters. Total 1019.
**Not verified:** typecheck and lint output (inferred from `check` reaching the tests; the paste was cut to the last 25 lines). The full 4.5b script was not rerun, so "48 caught, 2 escaped" is my inference, not a result. Behaviour on a server database (A-35, A-110, A-121).
**Found along the way:**
1. Predictions matched: 1019 tests, K15 caught, M8 caught, baselines 32 and 7, the two edited files in `git status`.
2. A-122 and A-123 are closed except for the equivalent mutants K12 and M3. K12 stays equivalent only while the K15 test stays.
3. No decision in this step, so DECISIONS and the mirror are unchanged.
4. Vitest again suggests `isolate: false` (about 3.5 s faster). I changed nothing.
5. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed. The file was not touched.

## Step 4.5b (size S), 2026-10-20: break-on-purpose for the key code, parallel run on SQLite

**Works (verified on your machine, output pasted; I ran nothing in my sandbox):** two throwaway scripts on your Desktop (not in git).
- `mutate-4.5b.mjs` changes `payments.ts` (29), `payments-routes.ts` (5), the key code in `memory-store.ts` (8) and the key code in `prisma-store.ts` (8) one mutation at a time, runs the matching test files, and restores the files. Baselines: 87, 87, 170 and 17 passed, 0 failed. Result: 50 mutations, 46 caught, 4 escaped, 0 error, 0 timeout, 0 not applied, 0 skipped. "files restored: yes". `git status --short` printed nothing before and after, and `lsof -i :3000` printed nothing.
- `race-4.5b.mts` builds a temporary SQLite file from the real migrations and sends 8 identical payment requests at once, in 5 rounds with 5 different keys. Result: 40 requests, 5 first saves reported, 35 replays, 0 rejected, 5 payments saved, 5 audit entries. "one payment per key held: yes".
- Caught: K1 to K11, K13, K14, K16 to K24 (missing-key check and code, invalid-key code, key length bounds, space in key, both pattern anchors, key type check, hash ignoring member id, method, line category, sorted lines, conflict check removed and inverted, replay flag both ways, key lookup skipped or under the wrong user, retry after a lost race removed, key and hash not saved), C1 to C5 (permission check, audit actor from the member's creator (old L35), Staff scope, Inactive check, line cap off by one), R1 to R5 (header name, replay header removed and inverted, conflict status, created status), M1, M2, M4 to M7 (duplicate key not refused, duplicate check and `findByKey` ignoring the user or the key, key and hash not saved) and P1 to P8 (Prisma: key and hash not saved, unique-index error not mapped or mapped to the wrong code, `findByKey` ignoring the user or the key, key and hash lost on read).
- Escaped: K12, K15, M3, M8.
  - K12 (hash ignores the total): equivalent. The total always equals the sum of the lines (DR-02), and the lines are hashed with their amounts (A-122).
  - K15 (hash ignores the line amounts): a test gap. Same key, same total, same categories in the same order, a different split of the amounts would return the first payment instead of 409 (A-122).
  - M3 (undefined-key guard removed in the memory adapter): equivalent. Stored keys are `null`, never `undefined` (A-123).
  - M8 (`findByKey` returns the stored object in the memory adapter): a test gap. No contract case changes a record returned by `findByKey` (A-123).
**Stubbed:** nothing new. No key clean-up. No payment list route. No screen. A "Loan Repaid" line still changes no loan (DR-09).
**Tests:** none new. Total 1016 (verified at 4.5).
**Not verified:** whether the `P2002` retry path ran in the race run. The end state is correct, but the output cannot show which route each request took (A-121). How long the mutation run took (not in the paste). The old 4.4b set was not rerun in full: only C1 to C5 and the route mutations R1 to R5 are comparable, and the older scripts for the payments store, transactions and members are still untouched by this step. Behaviour on a server database (A-35, A-110).
**Found along the way:**
1. Predictions matched: exactly K12, K15, M3 and M8 escaped, and the race run rejected nothing.
2. NEXT_FILES miss: the 4.5b list lacked `server/test/helpers/temp-db.ts`, which the race script needed. You pasted it. The new list is written for 4.5c only.
3. K12 and K15 cover each other. If both were removed, a changed split would pass unseen. Pinning K15 therefore also keeps K12 equivalent.
4. `mirror/DECISIONS.md` already holds D-48, so STATUS no longer asks for it. I compared the repo `DOMAIN_RULES.md` with the mirror by eye and did not diff it.
5. The `prisma-store.ts` comment that cites A-119 instead of A-121 is still unfixed. It is not touched in 4.5c either, so the note stays in STATUS.

## Step 4.5 (size M), 2026-10-20: idempotency key on POST /payments

**Works (verified on your machine, output pasted: grep counts 17 and 4; `db:deploy` applied `20261020060000_payment_idempotency`; `migrate dev` "Already in sync"; `npm run check` ended with 34 files, 1016 tests, 0 failed, duration 50.79 s; live check "105 passed, 0 failed"; `git status --short` showed 10 `M` and 3 `??`; I ran nothing in my sandbox):** `POST /payments` needs the header `Idempotency-Key` (16 to 64 characters of `A-Z a-z 0-9 _ -`). The key and a SHA-256 of the checked request (member, method, exact kobo, lines in order) are saved on the payment, with a unique index on user and key. A repeat with the same key and request returns the first payment: 201, header `Idempotent-Replayed: true`, no second payment, no second audit entry. The same key with a different request gives 409 `idempotency_conflict`. A missing or bad key gives 400. Keys are per user. A refused request does not use up its key. A lost race (the unique index refuses the second save, the transaction is undone) is retried once and then returns the first payment. New: `PaymentStore.findByKey`, `DuplicateIdempotencyKeyError`, migration `20261020060000_payment_idempotency`. Decision D-48.
**Stubbed:** no key clean-up (keys live as long as payments). No payment list route. No screen. A "Loan Repaid" line still changes no loan (DR-09).
**Tests:** 43 new (1016 - 973): contract `payments-key-contract.ts` 6 cases x 2 adapters = 12, `payments-idempotency.test.ts` 31 (24 logic, 7 route). The existing payment tests now send a key. The live check gains 7 checks (98 to 105).
**Not verified:** break-on-purpose for the key code (owed, step 4.5b). Typecheck and lint output (inferred from `check` reaching the tests; the paste was cut to the last 25 lines). That the server was stopped and port 3000 freed (your `lsof` showed it running, and the paste ends with it running). The Prisma `P2002` retry path on a real two-request race (the race test on the memory adapter simulates it; A-121). Behaviour on a server database (A-35, A-110).
**Found along the way:**
1. My count error: I predicted 1015 tests and 42 new. The real numbers are 1016 and 43. I counted one route test too few. The live check prediction (105) was right.
2. The old break-on-purpose scripts for the payments store and the payment logic and route were written against code that 4.5 changed. They may now report "not applied". 4.5b replaces them.
3. A comment in `prisma-store.ts` cites A-119 where A-121 is right. Harmless. Fix it when the file is next edited.
4. `mirror/DECISIONS.md` needs D-48 by hand.
5. Vitest again suggests `isolate: false` (about 4.3 s faster). I changed nothing.

## Step 4.4c (size S), 2026-10-20: close the L35 test gap

**Works (verified on your machine, output pasted: `npm run check` ended with 33 files, 973 tests, 0 failed, duration 48.85 s; mutation rerun baseline 35 of 35, L35 caught (1 failed, 34 passed), "file restored: yes"; `git status --short` showed only `M server/test/payments.test.ts`; I ran nothing in my sandbox):** one test added to `test/payments.test.ts`: the Super Admin pays into a Staff member's record, and the `payment.created` audit entry belongs to the Super Admin, with none under the Staff user (DR-15). A throwaway script, `mutate-4.4c.mjs`, on your Desktop (not in git), reruns L35 only.
**Stubbed:** nothing new. Still no list route, no idempotency key (A-116), no screen. No source file changed.
**Tests:** 1 new. Total 973 (was 972).
**Not verified:** the full 4.4b script was not rerun, so "66 caught, 4 escaped" is my inference, not a result. Typecheck and lint output (inferred from `check` reaching the tests; the paste was cut to the last 15 lines). Behaviour on a server database (A-35, A-110).
**Found along the way:**
1. Predictions matched: 973 tests, L35 caught with 1 failed.
2. A-118 is closed.
3. `mirror/DECISIONS.md` already holds D-47, so STATUS no longer asks for it.
4. The A-116, A-117 and A-118 rows in `ASSUMPTIONS.md` were run together on one line, with missing spaces in A-117. They are rewritten cleanly in this step (command below).
5. Still owed: break-on-purpose for step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b).

## Step 4.4b (size S), 2026-10-20: break-on-purpose for the payment logic and route

**Works (verified on your machine, output pasted; I ran nothing in my sandbox):** one throwaway script, `mutate-4.4b.mjs`, on your Desktop (not in git). It changes `payments.ts` (50 mutations) and `payments-routes.ts` (20) one at a time, runs `test/payments.test.ts` and `test/payments-routes.test.ts`, and restores the files. Baseline 55 passed, 0 failed. Result: 70 mutations, 65 caught, 5 escaped, 0 error, 0 timeout, 0 not applied. "files restored: yes". `git status --short` and `lsof -i :3000` printed nothing before and after. No source or test file changed, so the totals stay at 33 files, 972 tests (verified at 4.4).
- Caught: L1 to L34, L36 to L49 (permission check removed and inverted, member id and method checks and codes, the 20-line cap and its boundaries, breakdown code and line index, no transaction, unknown member, Staff scope removed and inverted, Inactive check removed and inverted, saved total, first line, line order, creator, audit action, entity type, entity id, detail fields, every view field, naira text), R1 to R4, R6 to R18 (auth guard, route permission guard, body limit and parser, status codes, created status, every body field name, reply key, failure code, line index, failure reason, actor id).
- Escaped: L35, L50, R5, R19, R20.
  - L35 (audit actor taken from the member): a test gap, A-118. Every audit test has Staff paying into their own member.
  - L50 (unknown errors turned into a 400): no test can make `checkBreakdown` throw a non-breakdown error (A-117).
  - R5 (`forbidden` status in the route map): unreachable, the route guard runs first (A-117, as A-92).
  - R19 (no-actor branch): unreachable, `requireAuth` always sets the caller (A-117).
  - R20 (array body accepted): an array gives `invalid_member_id` either way (A-117).
**Stubbed:** nothing new. Still no list route, no idempotency key (A-116), no screen.
**Tests:** none new. Total 972.
**Not verified:** how long the run took (not in the paste). L35 to R20 reasons are read from the code, not run. Behaviour on a server database (A-35, A-110).
**Found along the way:**
1. Predictions: I named L35, L50, R5, R19 and R20 as likely escapes, and exactly those five escaped. The baseline of 55 matched my count (34 + 21).
2. Owner decision on A-116: yes, build an idempotency key on `POST /payments` (2026-10-20). Recorded as D-47. It becomes step 4.5.
3. The owed break-on-purpose run for the payment code is closed, except L35. Still owed: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b).
4. `mirror/DECISIONS.md` already holds D-46. It needs D-47 by hand.
5. TRACEABILITY R-05 had a garbled phrase ("createPaymentandPOST"). Fixed here.
6. A-100 still said "illustrative" although A-115 closed it. Fixed here.

## Step 4.4 (size M), 2026-10-20: payment route and logic

**Works (verified on your machine, output pasted: `npm run check` ended with 33 files, 972 tests, 0 failed, duration 45.10 s; live check "98 passed, 0 failed"; `git status --short` showed the 6 expected lines; I ran nothing in my sandbox):** `server/src/payments.ts` (`createPayment`, `koboToNairaString`, `MAX_PAYMENT_LINES`) and `server/src/payments-routes.ts` (`POST /payments`, 201), mounted in `app.ts`. Order of work: permission `payments.create`, member id and method, line cap of 20, `checkBreakdown` (DR-02), then one `store.transaction`: find the member, check who may see it, check it is Active, save the payment, write `payment.created`. Staff pay only into members they recorded (other members answer 404). A Super Admin may pay into any member. An Inactive member gives 409 `member_inactive`. Amounts leave as strings with 2 decimals. A 400 carries `code` and, for a bad line, `lineIndex`. The audit detail holds the Membership ID, the total in kobo and the line count only. Decision D-46.
**Stubbed:** no list, read, edit or delete route for payments. No balances. A "Loan Repaid" line does not change any loan (DR-09, later). No SMS. No first-payment flow from the member screen. No idempotency key (A-116). No screen.
**Tests:** 55 new (972 - 917). By my count `payments.test.ts` 34 and `payments-routes.test.ts` 21. The paste shows only the total.
**Not verified:** break-on-purpose for `payments.ts` and `payments-routes.ts` (owed, step 4.4b). Typecheck and lint output (inferred from `check` reaching the tests; the paste was cut to the last 25 lines). That the server was stopped and port 3000 freed (the paste ends with it running). Behaviour on a server database (A-35, A-110).
**Found along the way:**
1. All predictions matched: 33 files, 972 tests, 98 live checks.
2. My slip: the step message said `cd server && npm start` when your shell was already in `server/`. Harmless.
3. The rollback test (audit write fails, nothing saved) passed on the memory adapter. The Prisma adapter's rollback is covered by the transaction contract (4.3), not by a payment test.
4. A-100 is settled by the 20-line cap (A-115).
5. `mirror/DECISIONS.md` needs D-46 by hand.

## Step 4.3c (size S), 2026-10-20: close the memory-adapter transaction test gaps

**Works (verified on your machine, output pasted: `npm run check` ended with 31 files, 917 tests, 0 failed, duration 51.45 s; mutation rerun baseline 12 of 12, M12 caught (1 failed), M13 caught (2 failed), "file restored: yes"; `git status --short` showed only `M server/test/memory-store.test.ts`; I ran nothing in my sandbox):** two tests added to `test/memory-store.test.ts`, in a suite named "memory adapter transactions (queue)". (1) A slow transaction that later throws is started first, and a second transaction is started while it is open: the second must start only after the first ends, and its write must survive the first one's rollback. (2) A transaction runs normally on the same store after an earlier one failed. A throwaway script, `mutate-4.3c.mjs`, on your Desktop (not in git), reruns M12 and M13 only, because the 4.3b script expects 10 memory cases and there are now 12.
**Stubbed:** nothing new. Nothing uses `transaction` yet. No source file changed.
**Tests:** 2 new. Total 917 (was 915).
**Not verified:** P1 and P2 (Prisma `maxWait` and `timeout`) are still untested (A-112). Typecheck and lint output (inferred from `check` stopping at the first failure; the paste was cut to the last 15 lines). Behaviour on a server database (A-35, A-110).
**Found along the way:**
1. Prediction: 917 tests matched. M12 caught with 1 failed matched. M13 caught with 2 failed, not 1 as I expected: both new tests fail when the queue is poisoned.
2. A-111 is closed.
3. `mutate-4.3b.mjs` now stops at its baseline check, because it expects 10 memory cases. It is only needed again for P1 and P2, which stay open. STATUS points to `mutate-4.3c.mjs` for M12 and M13.
4. `mirror/DECISIONS.md` already holds D-45, so STATUS no longer asks for it. No new decision in this step.

## Step 4.3b (size S), 2026-10-19: break-on-purpose for the transaction code

**Works (verified on your machine, output pasted; I ran nothing in my sandbox):** one throwaway script, `mutate-4.3b.mjs`, on your Desktop (not in git). It changes the transaction code in `memory-store.ts` and `prisma-store.ts` one mutation at a time, runs the transaction cases of the matching adapter test file (`-t transactions`), and restores the files. Baselines: memory 10 of 10, Prisma 10 of 10. Result: 19 mutations, 15 caught, 4 escaped, 0 error, 0 timeout, 0 not applied. "files restored: yes". `git status --short` printed nothing before and after the run, and `lsof -i :3000` printed nothing. No source or test file changed, so the totals stay at 31 files, 915 tests (verified at 4.3).
- Caught: M1 to M11 (rollback skipped, error swallowed after rollback, users, tokens and members snapshots not copied, payments, audit, members, tokens, lockouts and users not restored) and P3 to P6 (nested failure swallowed, function run on the outer client, function error swallowed, root transaction not transactional).
- Escaped: M12 (queue removed), M13 (queue poisoned by a failed transaction), P1 (options dropped), P2 (timeout set to 1 ms). See A-111 and A-112. M12 and M13 are test gaps in the test-only memory adapter. P1 and P2 are untested configuration.
**Stubbed:** nothing new. Nothing uses `transaction` yet.
**Tests:** none new. Total 915.
**Not verified:** whether the Prisma `maxWait` and `timeout` options are enforced with the better-sqlite3 adapter (P2 passed with 1 ms; A-112). How long the run took (not in the paste). Behaviour on a server database (A-35, A-110).
**Found along the way:**
1. Predictions: I expected P2 to be caught and it escaped. M12, M13 and P1 escaped, as I said they might. P4 did not time out.
2. I read your "gp" as "go".
3. NEXT_FILES for 4.3b was right: the pack held every file the script needed.
4. `mirror/DECISIONS.md` still needs D-45 by hand (STATUS item 2).
5. The owed break-on-purpose run for the transaction code is closed, except the gaps above. Still owed: step 1.4 (needs the real Prisma engine), `sessions.ts` (2.3d), lockout (2.3e), the auth routes (2.4a), `server.ts` (2.4b).

## Step 4.3 (size M), 2026-10-19: Store.transaction

**Works (verified on your machine, output pasted: `npm run check` ended with 31 files, 915 tests, 0 failed, duration 53 s; the sed edits applied, grep counts 3, 1, 4; `git status --short` showed the 8 expected paths; I ran nothing in my sandbox):** `Store.transaction(fn)` in the interface and both adapters. If `fn` returns, its writes are saved. If it throws, they are undone and the same error is thrown again. Memory adapter: it copies all data first and puts the copy back on a throw; transactions run one at a time. Prisma adapter: `prisma.$transaction` (interactive form) with `maxWait` 10 s and `timeout` 30 s. A nested call on the store given to `fn` joins the outer transaction. New contract `test/helpers/transaction-contract.ts`, 10 cases, wired into `store-contract.ts`. Decision D-45.
**Stubbed:** nothing uses `transaction` yet. A-25, A-39, A-54, A-58, A-62 and A-88 are not retrofitted. The payment route (4.4) is the first planned user.
**Tests:** 20 new (10 cases x 2 adapters). Total 915 (was 895). Cases: value and writes kept; reads its own writes; undo of a create with the same error rethrown; undo across member, payment and audit; undo of updates (status, permissions, token use and revoke, lockout); `DuplicateEmailError` passes through and earlier writes are undone; nested commit; nested throw undoes the outer writes; a failed transaction does not undo a successful parallel one; two parallel transactions get different Membership IDs. The Prisma half ran on a real SQLite file built from the real migrations, so interactive transactions work with the better-sqlite3 adapter on SQLite.
**Not verified:** break-on-purpose for the transaction code (owed, step 4.3b). Whether the Prisma nested create in `payments.create` is atomic by itself (A-102, still believed, no source checked). Which of the 10 cases took how long (the paste was cut to the last 30 lines, so I saw only the totals). Typecheck and lint output (inferred from `check` stopping at the first failure). Behaviour on a server database (A-35, A-110).
**Found along the way:**
1. Prediction matched: 31 files, 915 tests.
2. My slip: the step message said "7 modified or new paths" and then "8 paths in all". The real count is 8, as you pasted.
3. NEXT_FILES miss: the 4.3 list lacked `auth.test.ts`, `auth-routes.test.ts` and `sessions.test.ts`, which build a `Store` by hand. The grep found them and you pasted them. All three were edited. Typecheck passed, so no other test file builds a `Store` by hand.
4. `mirror/DECISIONS.md` needs D-45 by hand.
5. You said you updated DOMAIN_RULES in Project knowledge. The copy you pasted looked the same as the mirror to me. I did not diff it.
6. Vitest again suggests `isolate: false` (about 4.5 s faster). I changed nothing.

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