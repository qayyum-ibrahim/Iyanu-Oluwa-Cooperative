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
- 6.6 (M) Reactivate a member (DR-16, D-71): `members.edit`, Super Admin or the Staff member who added the member; status Active and audit in one transaction.
- 6.7 (S) Break-on-purpose for 6.6.

## Phase U steps (added 2026-10-22, D-79; first look, sizes checked when each starts)
Runs after Phase 6, before Phase 7. Phases 7 and 8 then add their own screens (dashboard, export buttons) on this base. The screen parts of the Phase 3 and 4 exits (Members screen, first-payment flow) are met here. Each server step that touches money, security or data loss is followed by a break-on-purpose step. Installing the web dependencies needs the owner's word.
- U.0 (S) Screen plan, docs only: every screen and the routes it calls, from TRACEABILITY and the prototype; what the prototype does that the server does not (for example "date spent", A-172); which server read routes are missing; how the web app keeps its tokens (A-45).
- U.1 (M) Web skeleton in `web/`: build tool and UI library looked up in their official docs and pinned (the prototype uses `latest`, which is not allowed), a web `npm run check`, the dev server talking to the API.
- U.2 (M) Sign-in, sign-out and change own password.
- U.3 (M) Members list, add member, member detail. Needs a member balances read route (server step, with its break-on-purpose step).
- U.4 (M) Record a payment with its breakdown and idempotency key; list a member's payments; the first-payment flow after adding a member.
- U.5 (M) Give a loan; list a member's loans.
- U.6 (M) Expenses: record, list with filters and total, edit, delete.
- U.7 (M) Pay-off confirmation on member detail (refundable balances, payout, confirm; DR-05, A-185) and reactivation (after 6.6).
- U.8 (M) Staff and access; audit viewer.
- U.9 (S) Walk-through of every screen on the owner's machine.
