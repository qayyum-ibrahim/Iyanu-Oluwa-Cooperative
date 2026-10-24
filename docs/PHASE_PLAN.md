# Phase plan (may change)
Sizes: S one change, M several files, L split it. You say "continue" to start each phase.

| Phase | Scope | Exit evidence |
|---|---|---|
| 0 | Intake, gate, these documents | You commit the docs |
| 1 | Foundation: repo layout, move prototype to `legacy-prototype/`, server skeleton, `npm run check`, money module (kobo), database setup, in-memory test adapter | Check passes. Live check: server health route answers. |
| 2 | Sign-in, setup script for owner, permission table, staff accounts, audit log | Role × permission test passes. Live login works. |
| 3 | Members, Building Funds category, derived balances | Tests pass. Live check on Members screen. |
| 4 | Payments, breakdown check, Loan Repaid, SMS interface with fake provider, first-payment flow | Tests pass. Live payment recorded. |
| 5 | Loans and expenses (filters, edit, soft-delete, link) | Tests pass. Totals reconcile. |
| 6 | Pay-off, automatic Inactive and reactivation. OQ-00, OQ-06 and OQ-07 answered 2026-10-22 (D-71). | Worked examples confirmed by owner. |
| U | Screens in `web/`, grown from `legacy-prototype/` (D-14, D-79): sign-in, members, member detail with balances, payments with the first-payment flow, loans, expenses, pay-off and reactivation, staff and access, audit. Server read routes the screens need (for example member balances) are added as server steps here. | Web check passes. Each screen walked through on the owner's machine against the dev server. |
| 7 | Dashboard and reports; Lagos month-end tests | Totals match lists |
| 8 | Excel exports | Files open as .xlsx; filters and permissions verified |
| 9 | Hardening: security review, backups, accessibility | Review items closed |
| 10 | Release: acceptance sign-off, go-live checklist, parallel running | Checklist passed |

## Phase 1 steps (first look)
- 1.1 (S) Repo skeleton and `legacy-prototype/` copy. Needs your `node -v; npm -v`.
- 1.2 (M) Server skeleton, pinned versions, `npm run check`.
- 1.3 (S) Money module with tests.
- 1.4 (M) Database schema (users, audit) and migration.
- 1.5 (S) In-memory adapter for tests.

## Phase 5 steps (planned at 5.0, D-54)
Phase 4 leftovers: the Loan Repaid effect moves here (5.5). The first-payment flow waits for the screens. Each money step is followed by a break-on-purpose step. An M step may split when it starts. Steps with a migration need the owner's word before `migrate`.
- 5.1 (S) `server/src/expense-categories.ts`: the DR-11 list; "Loan" and "Membership Withdrawal" system-only (A-148). Pure logic and tests.
- 5.1b (S) Start the server with `node --import tsx` (D-56, A-153). Added at 5.2 after a start-up test failed. Done.
- 5.2 (M) Expense table and store (both adapters, shared contract, migration): category, amount (BigInt kobo), method, description, "Others" narration, optional unique `loanId`, `createdById`, `createdAt`, `deletedAt`, `deletedById`.
- 5.2b (S) Break-on-purpose for the expenses store and migration. Added at 5.2. Done: 43 of 45 caught.
- 5.2c (S) One contract case for the M16 gap (A-155): a rollback keeps the expenses saved before it. Then rerun `mutate-5.2b.mjs`. Added at 5.2b. Done: 44 of 45 caught.
- 5.3 (M) Loan table and store (both adapters, shared contract, migration): `memberId`, principal (BigInt kobo), optional interest note (A-146), notes, `createdById`, `createdAt`. Outstanding and status worked out on read (A-144). Done (D-57).
- 5.3b (M) Nullable `PaymentLine.loanId` and a foreign key on `Expense.loanId`, both to `Loan`, with store checks for an unknown loan in both adapters (A-151, A-157). Split from 5.3. Done (D-58).
- 5.3c (S) Break-on-purpose for the loans store, 5.3b and their migrations. Done: 58 of 59 caught (EK7 test gap, A-160).
- 5.4 (M) `POST /loans` (permission `loans.disburse`, A-149): member visible and Active, no active loan; loan, its Loan expense and the audit entry in one transaction (DR-08, DR-10). Done (D-59).
- 5.4c (M) `Idempotency-Key` header on `POST /loans`, as D-48 for payments (D-60). Needs a migration. Added at 5.4 by the owner. Done (D-61).
- 5.4d (S) One break-on-purpose run for 5.4 and 5.4c (owner's choice). Done: 79 of 80 caught (L20, A-164).
- 5.4e (S, proposed at 5.4d) One test for the replay expense lookup (A-164), then rerun L20. Done: L20 caught.
- 5.5 (M) Loan Repaid effect in `createPayment`: lines linked to the active loan; no active loan or more than outstanding is refused (DR-08, DR-09, A-145). Done (D-62).
- 5.5b (S) Break-on-purpose for 5.5 (`payments.ts` Loan Repaid code, the two route codes). Done: 17 of 19 caught (P15, P16 equivalent as tested, A-166).
- 5.6 (S) `GET /loans` and one member's loans, with outstanding and status. Done (D-63): one member only, `memberId` required (A-167).
- 5.6b (S, proposed at 5.6) Break-on-purpose for `listLoans` and `GET /loans`. Done: 30 of 32 caught (G12, R2 equivalent, A-168).
- 5.7 (M) `POST /expenses` (only categories that can be picked by hand). Done (D-64).
- 5.7c (M) `Idempotency-Key` header on `POST /expenses`, as D-61 for loans: nullable `idempotencyKey` and `requestHash` on `Expense`, unique on creator and key, `expenses.findByKey` in both adapters. Needs a migration. Added at 5.7 by the owner (option A). Done (D-65).
- 5.7d (S) One break-on-purpose run for 5.7 and 5.7c. Done: 82 of 84 caught (R10 unreachable, KP2 race only, A-171).
- 5.8 (M) Expense list filters in the store: creator, category, method, half-open `createdAt` range (D-66). Split at start. Done.
- 5.8b (M) `GET /expenses` (permission `expenses.view`): DR-13 scope (Staff own, Super Admin all or by creator), filters from the query, the list total (a naira string, A-18). Defines "totals reconcile". Done (D-67).
- 5.8c (S) One break-on-purpose run for 5.8 and 5.8b. Done: 60 of 66 caught (L6, L27, R2 test gaps; T6, T7, R1 equivalent; A-174).
- 5.8d (S, proposed at 5.8c) Three tests for L6, L27 and R2 (A-174) in `expenses.test.ts` and `expenses-routes.test.ts`, then rerun those three. Done: full rerun 63 of 66 caught (T6, T7, R1 equivalent).
- 5.9 (M) Store methods `expenses.update` and `expenses.softDelete` in both adapters; `list` leaves out soft-deleted rows (D-68). Split at start. Done.
- 5.9b (M) `DELETE /expenses/:id` (permission `expenses.delete`): soft-delete with its audit entry in one transaction; Loan-linked and pay-off (Membership Withdrawal) expenses refused (DR-12). Done (D-69).
- 5.9c (M) `PUT /expenses/:id` (permission `expenses.edit`, OQ-08 default): old values in the audit log; deleted, Loan-linked and pay-off expenses not editable. Done (D-70).
- 5.9d (S) One break-on-purpose run for 5.9, 5.9b and 5.9c. Done: 89 of 96 caught (U5, U18, UP8 test gaps; D3, D4, U3, R3 equivalent; A-178).
- 5.9e (S, proposed at 5.9d) Three tests for U5, U18 and UP8 (A-178) in `expenses.test.ts` and `test/helpers/expenses-contract.ts`, then rerun those three. Done: full rerun 92 of 96 caught (D3, D4, U3, R3 equivalent).
Exit "totals reconcile" is defined at 5.8.

## Phase 6 steps (first look, at 6.0; sizes checked when each starts)
Each money step is followed by a break-on-purpose step. An M step may split when it starts. Steps with a migration need the owner's word before `migrate`.
- 6.0 (S) Record the owner's answers to OQ-00, OQ-06 and OQ-07 (D-71, DR-16, A-179). Docs only. Done.
- 6.1 (S) Member balances from payment lines, pure logic: balance per category, refundable total (DR-03), payout (DR-05). Tests include the DR-05 worked example. Done (D-72): `memberBalances` in `balances.ts`; pay-offs counted from 6.3 (A-180).
- 6.2 (S) Break-on-purpose for 6.1. Done: 25 of 26 caught; B5 (error name untested) is a test gap (A-181).
- 6.2b (S) One test for the error name (A-181), then rerun the mutations. Done: 26 of 26 caught; 1619 tests.
- 6.3 (M) How a pay-off is stored: `PayOff` and `PayOffLine` tables, `payOffs` store in both adapters, migration. Done (D-73, A-182): 20 contract cases per adapter; 1659 tests.
- 6.3b (S) `Expense.payOffId` (unique, `Restrict`) so the Membership Withdrawal expense names its pay-off (as D-58); migration; store checks in both adapters. Done (D-74, A-183): 6 contract cases per adapter and 2 database cases; 1673 tests.
- 6.3c (S) `memberBalances` takes off pay-off lines, so refundable balances show ₦0 after a pay-off (A-180). Done (D-75, A-184): 10 new tests; 1683 tests.
- 6.4 (M) Pay-off logic `processPayOff` (`payoff.process`, DR-14): blocked by an active loan (DR-06); payout, Membership Withdrawal expense, automatic Inactive (DR-07) and audit in one transaction; idempotency key as D-48. Split at start: route at 6.4b. Done (D-76, A-185): 41 tests; 1724 tests.
- 6.4b (M) `POST /payoffs` route in `payoffs-routes.ts`, mounted in `app.ts`; route tests; live check. Done (D-77, A-186): 28 tests; 1752 tests; live check 157 passed.
- 6.4c (S, proposed at 6.4) `deleteExpense` and `updateExpense` also refuse an expense with `payOffId` set. Done (D-78, A-187): 2 tests; 1754 tests.
- 6.5 (S) Break-on-purpose for 6.3, 6.3b, 6.3c, 6.4, 6.4b and 6.4c. Done: 113 of 119 caught; P21 is a test gap; R5, X5, X9, SP6, SP17 equivalent or unreachable (A-188).
- 6.5b (S, proposed at 6.5) One test in `payoffs.test.ts` for P21 (a repaid loan and a newer active loan still block a pay-off, DR-06), then rerun P21. Done: P21 caught (A-188).
- 6.6 (M) Reactivate a member (DR-16, D-71): `members.edit`, Super Admin or the Staff member who added the member; status Active and audit in one transaction. Done (D-80, A-189): `POST /members/:id/reactivate`; 25 tests; 1780 tests.
- 6.7 (S) Break-on-purpose for 6.6. Done: 24 of 28 caught; L14 is a test gap; L3, L18, R2 equivalent as tested (A-190).
- 6.7b (S, proposed at 6.7) One test in `members.test.ts`: the Super Admin reactivates a member recorded by Staff and the audit entry names the Super Admin (DR-15), then rerun L14. Done: L14 caught (A-190); 1781 tests.

## Phase U steps (added 2026-10-22, D-79; first look, sizes checked when each starts)
Runs after Phase 6, before Phase 7. Phases 7 and 8 then add their own screens (dashboard, export buttons) on this base. The screen parts of the Phase 3 and 4 exits (Members screen, first-payment flow) are met here. Each server step that touches money, security or data loss is followed by a break-on-purpose step. Installing the web dependencies needs the owner's word.
- U.0 (S) Screen plan, docs only (D-81, A-191). Done: the plan below.
- U.1 (M) Web skeleton in `web/`: React and Vite, as the prototype (README), versions looked up in the official docs and pinned (D-19); a web `npm run check` (typecheck, lint, tests); the Vite dev server forwards `/api` to the API, so the server needs no CORS code (A-191). Installing needs the owner's word. Done (D-82, A-192): pinned versions, `/api` removed by the proxy, 8 tests.
- U.2 (M) Sign-in screen, sign-out, change own password, token keeping and refresh (A-191 item 3). Routes exist. Done (D-83, A-193): 28 web tests, no jsdom.
- U.2b (M) Owner's answers to A-193: refresh token in `localStorage`, one refresh across tabs with a Web Lock, lockout rule in the sign-in message, D-26 kept. Done (D-84, A-194): 42 web tests.
- U.2c (S) Break-on-purpose for `web/src/session.ts` and `web/src/api.ts`, including the refresh lock (CLAUDE.md rule 10). Done: 38 of 45 caught; A7, A8, A11, A26 test gaps; A14, A16, A25 equivalent (A-195).
- U.2e (S, proposed at U.2c; runs before U.2d) Tests in `web/test/api.test.ts` for A7 (a failed lock during a signed-in call keeps the session), A8 (two refreshes in a row on one client both reach the server), A11 (a network failure on refresh during a signed-in call keeps the session) and A26 (a refused `restore` sends one refresh and does not call `onSignedOut`), then a full rerun of `mutate-U.2c.mjs`. Done: 45 web tests; rerun 42 of 45 caught, only A14, A16, A25 escape (A-195).
- U.2d (S) Install jsdom (owner said yes at U.2b; version looked up and pinned, asked again before the install) and click tests for the sign-in, change-password and signed-in screens. Done (D-85, A-196): jsdom 29.1.1, 55 web tests.
- U.3a (S) Server: `GET /members/:id/balances` (`members.view`, DR-13 scope as `GET /members/:id`): per-category balances, refundable total (the payout) and the "Retained by cooperative" amounts (OQ-14), from `memberBalances` (D-72), amounts as strings (A-18). Followed by U.3b (S) break-on-purpose. Done (D-86, A-197): 1792 server tests.
- U.3 (M) Members list (status filter, search by name or Membership ID done in the browser, A-191), add member, member detail (profile, balances, loans, payments). Split at its start (A-199):
  - U.3d (S) Member calls in `web/src/api.ts` (list, read one, add, balances). Done: 62 web tests.
  - U.3e (M) Members list screen and add member form. Done (A-200): 74 web tests.
  - U.3f (M) Member detail: profile, balances, payments, loans; the payments and loans list calls in `api.ts`. Done (A-201): 87 web tests.
  - U.3g (S) Break-on-purpose for the new `api.ts` code and the money display (CLAUDE.md rule 10). Done: 58 of 70 caught; 11 test gaps, V9 equivalent on a Lagos-time machine only (A-202).
  - U.3h (S, proposed at U.3g) Tests in `web/test/api.test.ts` and `web/test/app.test.tsx` for the U.3g gaps (A3, A4, A7, A14, A19, A26, A27, A31, V13, V23, V24) and a run in another time zone for V9, then a full rerun of `mutate-U.3g.mjs`. Done (A-203): 90 web tests; rerun 70 of 70 caught.
- U.4 (M) Record a payment (form order R-04, breakdown, SMS toggle, idempotency key), a member's payments, the first-payment flow after adding a member (R-03). The owner chose a payment date of its own (D-87), so U.4 split at its start (A-204):
  - U.4a (M) Server: `Payment.paidOn` column, migration that fills old rows, store field in both adapters; `createPayment` saves today's day in Lagos. Done (D-87, A-204): 1802 server tests.
  - U.4b (M) Server: `paidOn` in `POST /payments` (checked, part of the request hash), in the payment view and the audit detail (A-204 item 6). Done (D-88, A-205): 1842 server tests.
  - U.4c (M, grew from S when the owner added the store adapters) Break-on-purpose for U.4a and U.4b (migration fill, `lagosDay`, `isCalendarDay`, the date checks, the request hash, the view, the audit detail, the route, both store adapters; CLAUDE.md rule 10). Done (A-206): 39 mutations, 34 caught; C4, H2 test gaps, L2 equivalent on a Lagos-time machine only, C5 and C6 equivalent.
  - U.4c2 (S, proposed at U.4c) Tests for the U.4c gaps (C4, H2) and `lagosDay` under `TZ=UTC` for L2, then a full rerun of `mutate-U.4c.mjs`. Done (A-207): 1847 server tests; rerun 37 of 39 caught (C5, C6 equivalent).
  - U.4d (S) Web: `createPayment` in `web/src/api.ts` and `paidOn` in the payment reads. Done (A-208): web 97 tests; the owner added `web/test/app.test.tsx` to the step.
  - U.4e (M) Web: the payment form helpers in `Members.tsx` (categories, kobo sum, Lagos day, form check, messages, key maker). Split at its start (owner: "split allowed", D-89). Done (A-209): web 109 tests.
  - U.4e2 (M) Web: the payment form on member detail, opened by "Record payment" for an Active member with `payments.create` (date, method, total, breakdown, SMS toggle, R-04, R-06; D-89). Done (A-210): web 124 tests; the payments table shows `paidOn` (moved here from U.4f).
  - U.4f (S) Web: the first-payment flow after adding a member and "Save without payment" (R-03). (The date on member detail was done at U.4e2.) Done (A-211): web 128 tests; without `payments.create` the form keeps one "Save member" button.
  - U.4g (S) Break-on-purpose for U.4d to U.4f. Done (A-212): 91 mutations, 79 caught; C3, C19, F7, F10 test gaps; 8 equivalent as tested.
  - U.4g2 (S, proposed at U.4g) Tests for the U.4g gaps (C3, C19, F7, F10), then a rerun of `mutate-U.4g.mjs`. Done (A-213): web 130 tests; rerun 83 of 91 caught, only the 8 equivalent escape.
  - D.90 (S, docs) Leaner process (D-90). Done. From U.5 on: one screen or feature per M step; one break-on-purpose run at the end of Phase U for its money, security and data-loss code (U.5 loans, U.7 pay-off and reactivation, U.8 staff and access).
- U.5 Give a loan (`loans.disburse`, not the prototype's `loans.create`), a member's loans with outstanding and status. The loans list on member detail exists since U.3f. The owner asked for a loan date (D-91), so U.5 split at its start:
  - U.5a (M) Server: `Loan.givenOn`, migration that fills old rows, store field in both adapters, `givenOn` in `POST /loans` (checked, in the hash when sent, view, list, audit). Done (D-91, A-214): 1871 server tests.
  - U.5b (M) Web: `createLoan` in `web/src/api.ts`, `givenOn` in the loan reads, the "Give loan" form on member detail (date, principal, method, interest note, notes; one key per attempt), the loans table by `givenOn`. Done (A-215): 154 web tests; the table shows `givenOn`, rows keep the server order.
- U.6 Expenses: record, list with filters and total, edit, delete. The owner chose a date of its own, `spentOn` (D-92), and U.6 was L, so it split at its start (D-90 item 4):
  - U.6a (M) Server: `Expense.spentOn` (indexed), migration that fills old rows (a Loan expense gets its loan's `givenOn`, others the Lagos day of `createdAt`), store field in both adapters (`create`, `update`); `createExpense` saves today in Lagos, `disburseLoan` the loan's `givenOn`, `processPayOff` today. Done (D-92, A-216): 1882 server tests.
  - U.6b (M) Server: `spentOn` in `POST /expenses` and `PUT /expenses/:id` (checked as D-88, in the hash when sent), view and audit. Done (D-93, A-217): 1911 server tests. The day filter was split off to U.6b2 (it needs store code, so U.6b would have been L).
  - U.6b2 (M) Server: `GET /expenses` filters by `spentOn` days in Lagos, so the screen sends days, not UTC times: a store filter in `ExpenseListQuery` and both adapters with contract cases, then `listExpenses` and the route (changes D-67 and A-173; defaults for the query names, the removal of `from` and `before` and the list order in A-217 item 6, owner to confirm). Done (D-94, A-218): `fromDay`, `toDay`; 1912 server tests.
  - U.6c (M) Web: expense calls in `web/src/api.ts`, an Expenses page in the menu with `expenses.view` (list newest first, filters for category, method and days, total; DR-11 list copied into the web code, A-191 item 5). Done (A-219): `listExpenses`, `web/src/Expenses.tsx`; 168 web tests.
  - U.6d (M) Web: record an expense on the Expenses page (`expenses.create`; one key per attempt, D-65). U.6d as first planned (record, edit and delete) was L, so edit and delete moved to U.6e (D-95). Done (A-220): `createExpense`, the expense form; 188 web tests.
  - U.6e (M) Web: edit and delete on the Expenses page (`expenses.edit`, `.delete`). Loan and Membership Withdrawal rows show no edit or delete button, read from the category, as the server checks both the category and the link (D-69, D-78); a 409 `not_editable` or `not_deletable` (code `loan_linked` or `pay_off`) is still shown if it comes. Done (A-221): `updateExpense`, `deleteExpense`, Edit and Delete on the Expenses page; 208 web tests.
- U.7 Pay-off confirmation at the bottom of member detail (R-13; balances from U.3a, `total` sent back, `payout_changed` shown, DR-05, A-185) and the reactivate button on an Inactive member (D-80). U.7 was L, so it split at its start (D-96):
  - U.7a (M) Web: `createPayOff` in `web/src/api.ts` and the pay-off confirmation at the bottom of member detail (`payoff.process`; one key per attempt, D-76). Done (A-222): 229 web tests.
  - U.7b (S) Web: `reactivateMember` in `web/src/api.ts` and the Reactivate button on an Inactive member (`members.edit`, 409 `already_active`, D-80). Done (A-223): 241 web tests.
- U.8 Staff and access (create, permissions, deactivate, reactivate, reset password); audit viewer. U.8 was L, so it split at its start (D-97):
  - U.8a (M) Web: `listStaff` and `createStaff` in `web/src/api.ts`, the Staff & access page in the menu with `users.manage` (`web/src/Staff.tsx`): the staff list and the add staff form with the permission grid. Done (A-224): 260 web tests.
  - U.8b (M) Web: change a staff account's permissions (`PUT /staff/:id/permissions`). Done (A-225): `setStaffPermissions`, a "Permissions" button on each row; 272 web tests.
  - U.8c (M) Web: deactivate, reactivate and reset a staff password (`POST /staff/:id/deactivate`, `/reactivate`, `PUT /staff/:id/password`). Done (A-226): `deactivateStaff`, `reactivateStaff`, `resetStaffPassword`, row buttons; 292 web tests.
  - U.8d (M) Web: the audit viewer (`GET /audit`, actor and action filters, paging). Done (A-227): `listAudit`, `web/src/Audit.tsx`, "Audit log" in the menu; 308 web tests.
- U.8e (proposed at U.8d) The Phase U end break-on-purpose run (D-90): the money, security and data-loss code of U.5a to U.8c (server: `givenOn` and `spentOn` rules, migrations and store code, the expense day filter; web: `createLoan`, `createExpense`, `updateExpense`, `deleteExpense`, `createPayOff`, `reactivateMember`, the staff calls and their forms). L as a whole, so it split at its start (D-98); the gaps it finds get one test step and a rerun, as before. The U.8d audit page is read-only display code and gets none.
  - U.8e1 (M) Server code of U.5a to U.6b2: `givenOn` and `spentOn` rules, routes, the day filter, the pay-off day, both store adapters, the two migrations. Done (A-228): 74 mutations, 73 caught; X6 a test gap.
  - U.8e2 (M) Web money code: `createLoan`, `createExpense`, `updateExpense`, `deleteExpense`, `createPayOff` and their forms in `Members.tsx` and `Expenses.tsx`. Done (A-229): 122 mutations, 118 caught; 4 busy guards equivalent as tested, no test gap.
  - U.8e3 (M) Web security code: `reactivateMember` and its button, the five staff calls that change data (not `listStaff`, A-230) and the `Staff.tsx` forms. Done (A-230): 93 mutations, 86 caught; M10 a test gap; 5 busy guards and G1 equivalent as tested.
  - U.8f (S, proposed at U.8e1) Tests for the U.8e1 to U.8e3 gaps: X6 (server, an edit with tomorrow's day, A-228) and M10 (web, no alert after a successful member reactivation, A-230), then a rerun of those two mutations. Done (A-231): 2 tests changed, X6 and M10 rerun by hand, both caught; 1913 server tests, 308 web tests.
- U.9 (S) Walk-through of every screen on the owner's machine against the dev server. Done (A-232): DEV_SETUP and the Home text brought up to date; the walk-through found the sign-in 404, fixed at U.9a; then every screen walked through (owner's report). Phase U exit met.
  - U.9a (S, found at U.9) Web: the five sign-in calls in `web/src/api.ts` get the server's `/auth` prefix; `web/test/api.test.ts` expects `/api/auth/...`. Done (A-232): 308 web tests.
Sizes stay a first look; an M step may split when it starts.

### Screens and the routes they call (U.0, read from the route files and `legacy-prototype/src/App.jsx`)
| Screen | Routes | Permission | Gap |
|---|---|---|---|
| Sign-in | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` | none (signed in for `/me`) | none |
| Change own password | `POST /auth/password` | signed in | none |
| Members list | `GET /members?status=&createdById=` | `members.view` | no name search on the server (in the browser, A-191); the list shows no balance or loan column, unlike the prototype (would need one read per member or a list route; not planned) |
| Add member | `POST /members` | `members.create` | none |
| Member detail | `GET /members/:id`, `GET /payments?memberId=`, `GET /loans?memberId=`, `GET /members/:id/balances` (U.3a) | `members.view`, `payments.view`, `loans.view` | no member edit route (`members.edit` is used only by reactivation) |
| Record payment | `POST /payments` | `payments.create` | payment date `paidOn` added at U.4a and taken from the request since U.4b (D-87, D-88; the prototype README orders the form member, date, method, total, breakdown) |
| Loans | `POST /loans`, `GET /loans?memberId=` | `loans.disburse`, `loans.view` | no list of all loans (A-167); loan date `givenOn` since U.5a (D-91) |
| Expenses | `POST /expenses`, `GET /expenses`, `PUT /expenses/:id`, `DELETE /expenses/:id` | `expenses.create`, `.view`, `.edit`, `.delete` | date spent `spentOn` since U.6a (D-92); no paging |
| Pay-off | `GET /members/:id/balances` (U.3a), `POST /payoffs` | `payoff.process` | no pay-off read (A-186) |
| Reactivate member | `POST /members/:id/reactivate` | `members.edit` | none |
| Staff and access | `GET /staff`, `POST /staff`, `PUT /staff/:id/permissions`, `POST /staff/:id/deactivate`, `/reactivate`, `PUT /staff/:id/password` | `users.manage` (Super Admin only) | none |
| Audit | `GET /audit?actorId=&action=&limit=&offset=` | `users.manage` | none |

Categories lists (payment DR-04, expense DR-11) are copied into the web code for now: there is no category route (A-191). Dashboard, Categories and Exports screens of the prototype wait for Phases 7 and 8.

## Phase 7 steps (planned at 7.0, D-99; first look, sizes checked when each starts)
Goal: the dashboard (R-15, R-16) and the category totals report, with totals that match the lists (R-17). Business months are Lagos months of the day fields `paidOn`, `spentOn` and `givenOn` (D-16, D-87, D-91, D-92); a month is its first to its last day, both included, as the expense day filter (D-94). Scope is DR-13 (A-233 item 3). OQ-11 decides what income and expenditure count; its default is used until the owner answers (A-233 item 4). One break-on-purpose run at the end of the phase for its money and security code (D-90). Steps with a migration need the owner's word before `migrate`.
- 7.0 (S) Phase 7 plan, docs only (D-99, A-233). Also fixed: TRACEABILITY rows said "not run in a browser" after the U.9 walk-through; STATUS item 11 named "D-55 to D-89". Done.
- 7.1 (M) Server: `payments.list(query)` in the store, both adapters and the contract: filters `memberCreatedById` (the member's recorder, A-133), `paidFrom` and `paidTo` (days, both included), ordered by `paidOn`, then `createdAt`. An index on `Payment.paidOn` needs a migration (owner's word). Done (A-234): `PaymentListQuery`, migration written by hand, applied to the dev database; 1927 server tests.
- 7.2 (M) Server: `loans.list(query)` in the store, both adapters and the contract (A-167): filter `memberCreatedById`, oldest first. No migration expected.
- 7.3 (M) Server: dashboard logic and `GET /dashboard?month=YYYY-MM&createdById=` (permission `dashboard`): income, expenditure (Membership Withdrawal left out, D-100) and Membership Withdrawal for the month and all time, outstanding loans, Active members, the 10 newest expenses; amounts as strings (A-18). Lagos month-end tests (a payment at 23:30 UTC on the last day counts in the next Lagos month). May split into logic and route when it starts.
- 7.4 (M) Server: `GET /reports/categories?fromDay=&toDay=&createdById=` (permission `reports.view`): the total of payment lines per DR-04 category in the range, and the pay-offs per refundable category beside them (A-233 item 5).
- 7.5 (M) Web: Dashboard page in the menu with `dashboard` (month picker, the Super Admin's staff filter as the members list, the cards and recent expenses). The Home page opens it when the user holds `dashboard`.
- 7.6 (M) Web: Categories report page in the menu with `reports.view` (day range, staff filter for the Super Admin).
- 7.7 (M) Break-on-purpose for the Phase 7 money and security code: the two store lists, the sums, the month bounds, the scope and permission checks (CLAUDE.md rule 10). The gaps get one test step and a rerun (7.7b).
- 7.8 (S) Walk-through on the owner's machine: for one month, the dashboard expenditure equals the Expenses page total with the same days, and the income equals the category report total for those days (exit "Totals match lists"). Exports are Phase 8; R-17's export part is checked there.
